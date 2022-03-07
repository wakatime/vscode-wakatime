import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

import { Dependencies } from './dependencies';
import { Logger } from './logger';
import { Utils } from './utils';

export interface Setting {
  key: string;
  value: string;
  error?: string;
}

export class Options {
  private configFile: string;
  private internalConfigFile: string;
  private logFile: string;
  private logger: Logger;
  private cache: any = {};

  constructor(logger: Logger) {
    let wakaHome = Dependencies.getHomeDirectory();
    this.configFile = path.join(wakaHome, '.wakatime.cfg');
    this.internalConfigFile = path.join(wakaHome, '.wakatime-internal.cfg');
    this.logFile = path.join(wakaHome, '.wakatime.log');
    this.logger = logger;
  }

  public async getSettingAsync<T = any>(section: string, key: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.getSetting(section, key, false, (setting) => {
        setting.error ? reject(setting.error) : resolve(setting.value);
      });
    });
  }

  public getSetting(section: string, key: string, internal: boolean, callback: (Setting) => void): void {
    fs.readFile(
      this.getConfigFile(internal),
      'utf-8',
      (err: NodeJS.ErrnoException | null, content: string) => {
        if (err) {
          callback({error: new Error(`could not read ${this.getConfigFile(internal)}`), key: key, value: null});
        } else {
          let currentSection = '';
          let lines = content.split('\n');
          for (var i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
              currentSection = line
                .trim()
                .substring(1, line.trim().length - 1)
                .toLowerCase();
            } else if (currentSection === section) {
              let parts = line.split('=');
              let currentKey = parts[0].trim();
              if (currentKey === key && parts.length > 1) {
                callback({key: key, value: this.removeNulls(parts[1].trim())});
                return;
              }
            }
          }

          callback({key: key, value: null});
        }
      },
    );
  }

  public setSetting(section: string, key: string, val: string, internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(
      configFile,
      'utf-8',
      (err: NodeJS.ErrnoException | null, content: string) => {
        // ignore errors because config file might not exist yet
        if (err) content = '';

        let contents: string[] = [];
        let currentSection = '';

        let found = false;
        let lines = content.split('\n');
        for (var i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
            if (currentSection === section && !found) {
              contents.push(this.removeNulls(key + ' = ' + val));
              found = true;
            }
            currentSection = line
              .trim()
              .substring(1, line.trim().length - 1)
              .toLowerCase();
            contents.push(this.removeNulls(line));
          } else if (currentSection === section) {
            let parts = line.split('=');
            let currentKey = parts[0].trim();
            if (currentKey === key) {
              if (!found) {
                contents.push(this.removeNulls(key + ' = ' + val));
                found = true;
              }
            } else {
              contents.push(this.removeNulls(line));
            }
          } else {
            contents.push(this.removeNulls(line));
          }
        }

        if (!found) {
          if (currentSection !== section) {
            contents.push('[' + section + ']');
          }
          contents.push(this.removeNulls(key + ' = ' + val));
        }

        fs.writeFile(configFile as string, contents.join('\n'), err => {
          if (err) throw err;
        });
      },
    );
  }

  public setSettings(section: string, settings: Setting[], internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(
      configFile,
      'utf-8',
      (err: NodeJS.ErrnoException | null, content: string) => {
        // ignore errors because config file might not exist yet
        if (err) content = '';

        let contents: string[] = [];
        let currentSection = '';

        const found = {};
        let lines = content.split('\n');
        for (var i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
            if (currentSection === section) {
              settings.forEach(setting => {
                if (!found[setting.key]) {
                  contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                  found[setting.key] = true;
                }
              });
            }
            currentSection = line
              .trim()
              .substring(1, line.trim().length - 1)
              .toLowerCase();
            contents.push(this.removeNulls(line));
          } else if (currentSection === section) {
            let parts = line.split('=');
            let currentKey = parts[0].trim();
            let keepLineUnchanged = true;
            settings.forEach(setting => {
              if (currentKey === setting.key) {
                keepLineUnchanged = false;
                if (!found[setting.key]) {
                  contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
                  found[setting.key] = true;
                }
              }
            });
            if (keepLineUnchanged) {
              contents.push(this.removeNulls(line));
            }
          } else {
            contents.push(this.removeNulls(line));
          }
        }

        settings.forEach(setting => {
          if (!found[setting.key]) {
            if (currentSection !== section) {
              contents.push('[' + section + ']');
              currentSection = section;
            }
            contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
            found[setting.key] = true;
          }
        });

        fs.writeFile(configFile as string, contents.join('\n'), err => {
          if (err) throw err;
        });
      },
    );
  }

  public getConfigFile(internal: boolean): string {
    return internal ? this.internalConfigFile : this.configFile;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public async getApiKeyAsync(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      const cachedApiKey = this.cache.api_key;
      if (!Utils.apiKeyInvalid(cachedApiKey)) {
        resolve(cachedApiKey);
        return;
      }

      // Support for gitpod.io https://github.com/wakatime/vscode-wakatime/pull/220
      if (process.env.WAKATIME_API_KEY && !Utils.apiKeyInvalid(process.env.WAKATIME_API_KEY)) {
        resolve(process.env.WAKATIME_API_KEY);
        return;
      }

      try {
        const apiKey = await this.getSettingAsync<string>('settings', 'api_key');
        if (!Utils.apiKeyInvalid(apiKey)) this.cache.api_key = apiKey;
        resolve(apiKey);
      } catch(err) {
        this.logger.debug(`Exception while reading API Key from config file: ${err}`);
        reject(err);
      }
    });
  }

  public getApiKey(callback: (apiKey: string|null) => void): void {
    this.getApiKeyAsync()
      .then(apiKey => {
        if (!Utils.apiKeyInvalid(apiKey)) {
          callback(apiKey);
        } else {
          callback(null);
        }
      })
      .catch(err => {
        this.logger.warn(`Unable to get api key: ${err}`);
        if (`${err}`.includes('spawn EPERM')) {
          vscode.window.showErrorMessage("Microsoft Defender is blocking WakaTime. Please allow WakaTime to run so it can upload code stats to your dashboard.");
        }
        callback(null);
      });
  }

  public hasApiKey(callback: (valid: boolean) => void): void {
    this.getApiKeyAsync()
      .then(apiKey => callback(!Utils.apiKeyInvalid(apiKey)))
      .catch(err => {
        this.logger.warn(`Unable to check for api key: ${err}`);
        callback(false);
      });
  }

  private startsWith(outer: string, inner: string): boolean {
    return outer.slice(0, inner.length) === inner;
  }

  private endsWith(outer: string, inner: string): boolean {
    return inner === '' || outer.slice(-inner.length) === inner;
  }

  private removeNulls(s: string): string {
    return s.replace(/\0/g, '');
  }
}
