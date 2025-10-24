import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { Desktop } from './desktop';
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

  constructor(logger: Logger, resourcesFolder: string) {
    this.logger = logger;
    this.configFile = path.join(Desktop.getHomeDirectory(), '.wakatime.cfg');
    this.internalConfigFile = path.join(resourcesFolder, 'wakatime-internal.cfg');
    this.logFile = path.join(resourcesFolder, 'wakatime.log');
  }

  public async getSettingAsync<T = any>(section: string, key: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.getSetting(section, key, false, (setting) => {
        setting.error ? reject(setting.error) : resolve(setting.value);
      });
    });
  }

  public getSetting(
    section: string,
    key: string,
    internal: boolean,
    callback: (Setting) => void,
  ): void {
    fs.readFile(
      this.getConfigFile(internal),
      'utf-8',
      (err: NodeJS.ErrnoException | null, content: string) => {
        if (err) {
          callback({
            error: new Error(`could not read ${this.getConfigFile(internal)}`),
            key: key,
            value: null,
          });
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
                callback({ key: key, value: this.removeNulls(parts[1].trim()) });
                return;
              }
            }
          }

          callback({ key: key, value: null });
        }
      },
    );
  }

  public setSetting(section: string, key: string, val: string, internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(configFile, 'utf-8', (err: NodeJS.ErrnoException | null, content: string) => {
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

      fs.writeFile(configFile as string, contents.join('\n'), (err) => {
        if (err) throw err;
      });
    });
  }

  public setSettings(section: string, settings: Setting[], internal: boolean): void {
    const configFile = this.getConfigFile(internal);
    fs.readFile(configFile, 'utf-8', (err: NodeJS.ErrnoException | null, content: string) => {
      // ignore errors because config file might not exist yet
      if (err) content = '';

      let contents: string[] = [];
      let currentSection = '';

      const found: Record<string, boolean> = {};
      let lines = content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
          if (currentSection === section) {
            settings.forEach((setting) => {
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
          settings.forEach((setting) => {
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

      settings.forEach((setting) => {
        if (!found[setting.key]) {
          if (currentSection !== section) {
            contents.push('[' + section + ']');
            currentSection = section;
          }
          contents.push(this.removeNulls(setting.key + ' = ' + setting.value));
          found[setting.key] = true;
        }
      });

      fs.writeFile(configFile as string, contents.join('\n'), (err) => {
        if (err) throw err;
      });
    });
  }

  public getConfigFile(internal: boolean): string {
    return internal ? this.internalConfigFile : this.configFile;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public async getApiKey(): Promise<string> {
    if (!Utils.apiKeyInvalid(this.cache.api_key)) {
      return this.cache.api_key;
    }

    let from = '';

    const keyFromSettings = this.getApiKeyFromEditor();
    if (!Utils.apiKeyInvalid(keyFromSettings)) {
      this.cache.api_key = keyFromSettings;
      from = 'settings.json editor';
    }

    const keyFromEnv = this.getApiKeyFromEnv();
    if (!Utils.apiKeyInvalid(keyFromEnv)) {
      if (this.cache.api_key && this.cache.api_key !== keyFromEnv) {
        vscode.window.showErrorMessage(
          `WakaTime API Key conflict. Your env key doesn't match your ${from} key.`,
        );
        return this.cache.api_key;
      }
      this.cache.api_key = keyFromEnv;
      from = 'env var';
    }

    try {
      const apiKeyFromVault = await this.getApiKeyFromVaultCmd();
      if (!Utils.apiKeyInvalid(apiKeyFromVault)) {
        if (this.cache.api_key && this.cache.api_key !== apiKeyFromVault) {
          vscode.window.showErrorMessage(
            `WakaTime API Key conflict. Your vault command key doesn't match your ${from} key.`,
          );
          return this.cache.api_key;
        }
        this.cache.api_key = apiKeyFromVault;
        from = 'vault command';
      }
    } catch (err) {}

    try {
      const apiKey = await this.getSettingAsync<string>('settings', 'api_key');
      if (!Utils.apiKeyInvalid(apiKey)) {
        if (this.cache.api_key && this.cache.api_key !== apiKey) {
          vscode.window.showErrorMessage(
            `WakaTime API Key conflict. Your ~/.wakatime.cfg key doesn't match your ${from} key.`,
          );
        }
        this.cache.api_key = apiKey;
      }
    } catch (err) {
      this.logger.debug(`Exception while reading API Key from config file: ${err}`);
      if (!this.cache.api_key && `${err}`.includes('spawn EPERM')) {
        vscode.window.showErrorMessage(
          'Microsoft Defender is blocking WakaTime. Please allow WakaTime to run so it can upload code stats to your dashboard.',
        );
      }
    }

    return this.cache.api_key ?? '';
  }

  public async getApiKeyFromVaultCmd(): Promise<string> {
    try {
      // Use basically the same logic as wakatime-cli to interpret cmdStr
      // https://github.com/wakatime/wakatime-cli/blob/1fd560a/cmd/params/params.go#L697
      const cmdStr = await this.getSettingAsync<string>('settings', 'api_key_vault_cmd');
      if (!cmdStr?.trim()) return '';

      const cmdParts = cmdStr.trim().split(' ');
      if (cmdParts.length === 0) return '';

      const [cmdName, ...cmdArgs] = cmdParts;

      const options = Desktop.buildOptions();
      const proc = child_process.spawn(cmdName, cmdArgs, options);

      let stdout = '';
      for await (const chunk of proc.stdout) {
        stdout += chunk;
      }
      let stderr = '';
      for await (const chunk of proc.stderr) {
        stderr += chunk;
      }
      const exitCode = await new Promise((resolve) => {
        proc.on('close', resolve);
      });

      if (exitCode) this.logger.warn(`api key vault command error (${exitCode}): ${stderr}`);
      else if (stderr && stderr.trim()) this.logger.warn(stderr.trim());

      const apiKey = stdout.toString().trim();
      return apiKey;
    } catch (err) {
      this.logger.debug(`Exception while reading API Key Vault Cmd from config file: ${err}`);
      return '';
    }
  }

  public getApiKeyFromEditor(): string {
    return vscode.workspace.getConfiguration().get('wakatime.apiKey') || '';
  }

  private getApiUrlFromEditor(): string {
    return vscode.workspace.getConfiguration().get('wakatime.apiUrl') || '';
  }

  public getStatusBarAlignment(): vscode.StatusBarAlignment {
    const align: string = vscode.workspace.getConfiguration().get('wakatime.align') ?? '';
    switch (align) {
      case 'left':
        return vscode.StatusBarAlignment.Left;
      case 'right':
        return vscode.StatusBarAlignment.Right;
      default:
        return vscode.StatusBarAlignment.Left;
    }
  }

  public getStatusBarPriority(): number {
    const priority = vscode.workspace.getConfiguration().get('wakatime.alignPriority');
    return typeof priority === 'number' ? priority : 1;
  }

  // Support for gitpod.io https://github.com/wakatime/vscode-wakatime/pull/220
  public getApiKeyFromEnv(): string {
    if (this.cache.api_key_from_env !== undefined) return this.cache.api_key_from_env;

    this.cache.api_key_from_env = process.env.WAKATIME_API_KEY || '';

    return this.cache.api_key_from_env;
  }

  public async getApiUrl(checkSettingsFile = false): Promise<string> {
    let apiUrl = this.getApiUrlFromEditor();

    if (!apiUrl) {
      apiUrl = this.getApiUrlFromEnv();
    }

    if (!apiUrl && !checkSettingsFile) {
      return '';
    }

    // people often accidentally enter their API Key into the API Url settings input
    if (!Utils.validateApiUrl(apiUrl)) apiUrl = '';

    if (!apiUrl) {
      try {
        apiUrl = await this.getSettingAsync<string>('settings', 'api_url');
      } catch (err) {
        this.logger.debug(`Exception while reading API Url from config file: ${err}`);
      }
    }

    if (!apiUrl) apiUrl = 'https://api.wakatime.com/api/v1';

    const suffixes = ['/', '.bulk', '/users/current/heartbeats', '/heartbeats', '/heartbeat'];
    for (const suffix of suffixes) {
      if (apiUrl.endsWith(suffix)) {
        apiUrl = apiUrl.slice(0, -suffix.length);
      }
    }

    return apiUrl;
  }

  private getApiUrlFromEnv(): string {
    if (this.cache.api_url_from_env !== undefined) return this.cache.api_url_from_env;

    this.cache.api_url_from_env = process.env.WAKATIME_API_URL || '';

    return this.cache.api_url_from_env;
  }

  public hasApiKey(callback: (valid: boolean) => void): void {
    this.getApiKey()
      .then((apiKey) => callback(!Utils.apiKeyInvalid(apiKey)))
      .catch((err) => {
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
