import * as path from 'path';
import * as fs from 'fs';

import { Dependencies } from './dependencies';
import { ExpirationStrategy } from './cache/expiration-strategy';
import { MemoryStorage } from './cache/memory-storage';

export interface Setting {
  key: string;
  value: string;
  error?: string;
}

export class Options {
  private configFile: string;
  private logFile: string;
  private readonly cache: ExpirationStrategy;

  constructor() {
    this.cache = new ExpirationStrategy(new MemoryStorage());
    let wakaHome = Dependencies.getHomeDirectory();
    this.configFile = path.join(wakaHome, '.wakatime.cfg');
    this.logFile = path.join(wakaHome, '.wakatime.log');
  }

  public async getSettingAsync<T = any>(section: string, key: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.getSetting(section, key, (setting) => {
        setting.error ? reject(setting.error) : resolve(setting.value);
      });
    });
  }

  public getSetting(section: string, key: string, callback: (Setting) => void): void {
    fs.readFile(
      this.getConfigFile(),
      'utf-8',
      (err: NodeJS.ErrnoException | null, content: string) => {
        if (err) {
          if (callback) callback({error: new Error(`could not read ${this.getConfigFile()}`), key: key, value: null});
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
                callback({key: key, value: parts[1].trim()});
                return;
              }
            }
          }

          if (callback) callback({key: key, value: null});
        }
      },
    );
  }

  public setSetting(section: string, key: string, val: string): void {
    fs.readFile(
      this.getConfigFile(),
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
              contents.push(key + ' = ' + val);
              found = true;
            }
            currentSection = line
              .trim()
              .substring(1, line.trim().length - 1)
              .toLowerCase();
            contents.push(line);
          } else if (currentSection === section) {
            let parts = line.split('=');
            let currentKey = parts[0].trim();
            if (currentKey === key) {
              if (!found) {
                contents.push(key + ' = ' + val);
                found = true;
              }
            } else {
              contents.push(line);
            }
          } else {
            contents.push(line);
          }
        }

        if (!found) {
          if (currentSection !== section) {
            contents.push('[' + section + ']');
          }
          contents.push(key + ' = ' + val);
        }

        fs.writeFile(this.getConfigFile(), contents.join('\n'), err => {
          if (err) throw err;
        });
      },
    );
  }

  public setSettings(section: string, settings: Setting[]): void {
    fs.readFile(
      this.getConfigFile(),
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
                  contents.push(setting.key + ' = ' + setting.value);
                  found[setting.key] = true;
                }
              });
            }
            currentSection = line
              .trim()
              .substring(1, line.trim().length - 1)
              .toLowerCase();
            contents.push(line);
          } else if (currentSection === section) {
            let parts = line.split('=');
            let currentKey = parts[0].trim();
            let keepLineUnchanged = true;
            settings.forEach(setting => {
              if (currentKey === setting.key) {
                keepLineUnchanged = false;
                if (!found[setting.key]) {
                  contents.push(setting.key + ' = ' + setting.value);
                  found[setting.key] = true;
                }
              }
            });
            if (keepLineUnchanged) {
              contents.push(line);
            }
          } else {
            contents.push(line);
          }
        }

        settings.forEach(setting => {
          if (!found[setting.key]) {
            if (currentSection !== section) {
              contents.push('[' + section + ']');
              currentSection = section;
            }
            contents.push(setting.key + ' = ' + setting.value);
            found[setting.key] = true;
          }
        });

        fs.writeFile(this.getConfigFile(), contents.join('\n'), err => {
          if (err) throw err;
        });
      },
    );
  }

  public getConfigFile(): string {
    return this.configFile;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public async getApiKeyAsync(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      const cachedApiKey = await this.cache.getItem<string>('api_key');
      if (cachedApiKey) return resolve(cachedApiKey);

      await this.getSettingAsync<string>('settings', 'api_key')
        .then(apiKey => {
          this.cache.setItem('api_key', apiKey, { ttl: 300 });
          resolve(apiKey);
        })
        .catch(err => reject(err));
    });
  }

  public startsWith(outer: string, inner: string): boolean {
    return outer.slice(0, inner.length) === inner;
  }

  public endsWith(outer: string, inner: string): boolean {
    return inner === '' || outer.slice(-inner.length) === inner;
  }
}
