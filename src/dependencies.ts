import * as adm_zip from 'adm-zip';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as request from 'request';
import * as rimraf from 'rimraf';
import * as which from 'which';

import { Options } from './options';
import { Logger } from './logger';

export class Dependencies {
  private options: Options;
  private logger: Logger;
  private extensionPath: string;
  private s3urlprefix = 'https://wakatime-cli.s3-us-west-2.amazonaws.com/';
  private githubDownloadPrefix = 'https://github.com/wakatime/wakatime-cli/releases/download';
  private githubReleasesUrl = 'https://api.github.com/repos/wakatime/wakatime-cli/releases/latest';
  private global: boolean;
  private standalone: boolean;
  private latestCliVersion: string = '';

  constructor(
    options: Options,
    extensionPath: string,
    logger: Logger,
    global: boolean,
    standalone: boolean,
  ) {
    this.options = options;
    this.logger = logger;
    this.extensionPath = extensionPath;
    this.global = global;
    this.standalone = standalone;
  }

  public checkAndInstall(callback: () => void): void {
    if (this.global) {
      this.checkGlobalCli(callback);
    } else if (this.standalone) {
      this.checkAndInstallStandaloneCli(callback);
    } else {
      this.checkAndInstallCli(callback);
    }
  }

  public getCliLocation(global: boolean = false): string {
    if (global) return this.getCliLocationGlobal();
    const ext = Dependencies.isWindows() ? '.exe' : '';
    return path.join(this.extensionPath, 'wakatime-cli', 'wakatime-cli' + ext);
  }

  public getCliLocationGlobal(): string {
    const binaryName = `wakatime-cli${Dependencies.isWindows() ? '.exe' : ''}`;
    const pathName =
      which.sync(binaryName, { nothrow: true }) ??
      which.sync(binaryName.replace('-cli', ''), { nothrow: true });
    if (pathName) return pathName;
    this.logger.error('Could not find global cli - is it installed?');
    throw new Error('Could not find global cli - is it installed?');
  }

  public static isWindows(): boolean {
    return os.platform() === 'win32';
  }

  public isStandaloneCliInstalled(): boolean {
    return fs.existsSync(this.getCliLocation());
  }

  private checkAndInstallCli(callback: () => void): void {
    if (!this.isCliInstalled()) {
      this.installCli(callback);
    } else {
      this.isCliLatest(isLatest => {
        if (!isLatest) {
          this.installCli(callback);
        } else {
          callback();
        }
      });
    }
  }

  private checkAndInstallStandaloneCli(callback: () => void): void {
    if (!this.isStandaloneCliInstalled()) {
      this.installStandaloneCli(callback);
    } else {
      this.isStandaloneCliLatest(isLatest => {
        if (!isLatest) {
          this.installStandaloneCli(callback);
        } else {
          callback();
        }
      });
    }
  }

  private checkGlobalCli(callback: () => void): void {
    const binaryName = `wakatime-cli${Dependencies.isWindows() ? '.exe' : ''}`;
    which(binaryName)
      .then(() => callback())
      .catch(() => {
        which(binaryName.replace('-cli', ''))
          .then(() => callback())
          .catch(() => {
            this.logger.error('Could not find global installation.');
            throw new Error('Could not find global installation.');
          });
      });
  }

  private isCliInstalled(): boolean {
    return fs.existsSync(this.getCliLocation());
  }

  private isCliLatest(callback: (arg0: boolean) => void): void {
    let args = ['--version'];
    const options = {
      windowsHide: true,
    };
    child_process.execFile(this.getCliLocation(), args, options, (error, _stdout, stderr) => {
      if (!(error != null)) {
        let currentVersion = _stdout.toString().trim() + stderr.toString().trim();
        this.logger.debug(`Current wakatime-cli version is ${currentVersion}`);

        this.logger.debug('Checking for updates to wakatime-cli...');
        this.getLatestCliVersion(latestVersion => {
          if (currentVersion === latestVersion) {
            this.logger.debug('wakatime-cli is up to date');
            callback(true);
          } else if (latestVersion) {
            this.logger.debug(`Found an updated wakatime-cli v${latestVersion}`);
            callback(false);
          } else {
            this.logger.debug('Unable to find latest wakatime-cli version');
            callback(false);
          }
        });
      } else {
        callback(false);
      }
    });
  }

  private isStandaloneCliLatest(callback: (arg0: boolean) => void): void {
    let args = ['--version'];
    const options = {
      windowsHide: true,
    };
    child_process.execFile(
      this.getCliLocation(),
      args,
      options,
      (error, _stdout, stderr) => {
        if (!(error != null)) {
          let currentVersion = _stdout.toString().trim() + stderr.toString().trim();
          this.logger.debug(`Current wakatime-cli version is ${currentVersion}`);

          this.logger.debug('Checking for updates to wakatime-cli...');
          this.getLatestStandaloneCliVersion(latestVersion => {
            if (currentVersion === latestVersion) {
              this.logger.debug('wakatime-cli is up to date');
              callback(true);
            } else if (latestVersion) {
              this.logger.debug(`Found an updated wakatime-cli v${latestVersion}`);
              callback(false);
            } else {
              this.logger.debug('Unable to find latest wakatime-cli version');
              callback(false);
            }
          });
        } else {
          callback(false);
        }
      },
    );
  }

  private getLatestCliVersion(callback: (arg0: string) => void): void {
    if (this.latestCliVersion) {
      callback(this.latestCliVersion);
      return;
    }
    this.options.getSetting('settings', 'proxy', (proxy: string) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: string) => {
        this.options.getSetting('settings', 'cli_version_etag', (etag: string) => {
          let options = {
            url: this.githubReleasesUrl,
            json: true,
          };
          if (proxy) options['proxy'] = proxy;
          if (noSSLVerify === 'true') options['strictSSL'] = false;
          if (etag) options['headers'] = { 'If-None-Match': etag };
          try {
            request.get(options, (error, response, json) => {
              if (!error && (response.statusCode == 200 || response.statusCode == 304)) {
                this.logger.warn(`GitHub API Response ${response.statusCode}`);
                if (response.statusCode == 200 && response.headers['ETag']) this.options.setSetting('settings', 'cli_version_etag', response.headers['ETag'] as string);
                let re = /^v?([0-9]+\.[0-9]+\.[0-9]+)/g;
                let match = re.exec(json['tag_name']);
                if (match) {
                  this.latestCliVersion = match[0];
                  callback(match[0]);
                  return;
                }
              } else {
                this.logger.warn(`GitHub API Response ${response.statusCode}: ${error}`);
                callback('');
              }
            });
          } catch (e) {
            this.logger.warn(e);
            callback('');
          }
        });
      });
    });
  }

  private getLatestStandaloneCliVersion(callback: (arg0: string) => void): void {
    const url = this.s3BucketUrl() + 'current_version.txt';
    this.options.getSetting('settings', 'proxy', (proxy: string) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: string) => {
        let options = { url: url };
        if (proxy) options['proxy'] = proxy;
        if (noSSLVerify === 'true') options['strictSSL'] = false;
        try {
          request.get(options, (error, response, body) => {
            if (!error && response.statusCode == 200) {
              callback(body.trim());
            } else {
              callback('');
            }
          });
        } catch (e) {
          this.logger.warn(e);
          callback('');
        }
      });
    });
  }

  private installCli(callback: () => void): void {
    this.getLatestCliVersion(version => {
      if (!version) {
        callback();
        return;
      }
      this.logger.debug(`Downloading wakatime-cli v${version}...`);
      let url = this.cliDownloadUrl(version);
      let zipFile = path.join(this.extensionPath, 'wakatime-cli.zip');

      this.downloadFile(
        url,
        zipFile,
        () => {
          this.extractCli(zipFile, callback);
        },
        () => {
          callback();
        },
      );
    });
  }

  private installStandaloneCli(callback: () => void): void {
    this.logger.debug('Downloading wakatime-cli standalone...');
    const url = this.s3BucketUrl() + 'wakatime-cli.zip';
    let zipFile = path.join(this.extensionPath, 'wakatime-cli.zip');
    try {
      this.downloadFile(
        url,
        zipFile,
        () => {
          this.extractStandaloneCli(zipFile, () => {
            if (!Dependencies.isWindows()) {
              try {
                this.logger.debug('Chmod 755 wakatime-cli standalone...');
                fs.chmodSync(this.getCliLocation(), 0o755);
              } catch (e) {
                this.logger.warn(e);
              }
            }
            callback();
          });
        },
        () => {
          callback();
        },
      );
    } catch (e) {
      this.logger.warn(e);
      callback();
    }
  }

  private extractCli(zipFile: string, callback: () => void): void {
    this.logger.debug(`Extracting wakatime-cli into "${this.extensionPath}"...`);
    this.removeCli(() => {
      this.unzip(zipFile, this.extensionPath, callback);
      this.logger.debug('Finished extracting wakatime-cli.');
    });
  }

  private extractStandaloneCli(zipFile: string, callback: () => void): void {
    this.logger.debug(`Extracting wakatime-cli into "${this.extensionPath}"...`);
    this.removeCli(() => {
      this.unzip(zipFile, this.extensionPath, callback);
      this.logger.debug('Finished extracting wakatime-cli standalone.');
    });
  }

  private removeCli(callback: () => void): void {
    if (fs.existsSync(path.join(this.extensionPath, 'wakatime-cli'))) {
      try {
        rimraf(path.join(this.extensionPath, 'wakatime-cli'), () => {
          callback();
        });
      } catch (e) {
        this.logger.warn(e);
        callback();
      }
    } else {
      callback();
    }
  }

  private downloadFile(
    url: string,
    outputFile: string,
    callback: () => void,
    error: () => void,
  ): void {
    this.options.getSetting('settings', 'proxy', (_err, proxy) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: string) => {
        let options = { url: url };
        if (proxy) options['proxy'] = proxy;
        if (noSSLVerify === 'true') options['strictSSL'] = false;
        try {
          let r = request.get(options);
          r.on('error', e => {
            this.logger.warn(`Failed to download ${url}`);
            this.logger.warn(e.toString());
            error();
          });
          let out = fs.createWriteStream(outputFile);
          r.pipe(out);
          r.on('end', () => {
            out.on('finish', () => {
              callback();
            });
          });
        } catch (e) {
          this.logger.warn(e);
          callback();
        }
      });
    });
  }

  private unzip(file: string, outputDir: string, callback: () => void): void {
    if (fs.existsSync(file)) {
      try {
        let zip = new adm_zip(file);
        zip.extractAllTo(outputDir, true);
      } catch (e) {
        this.logger.error(e);
      } finally {
        try {
          fs.unlink(file, () => {
            callback();
          });
        } catch (e2) {
          callback();
        }
      }
    }
  }

  private architecture(): string {
    return os.arch().indexOf('32') > -1 ? '32' : '64';
  }

  private s3BucketUrl(): string {
    switch (os.platform()) {
      case 'darwin':
        return this.s3urlprefix + 'mac-x86-64/';
      case 'win32':
        return this.s3urlprefix + 'windows-x86-' + this.architecture() + '/';
      default:
        return this.s3urlprefix + 'linux-x86-64/';
    }
  }

  private cliDownloadUrl(version: string): string {
    switch (os.platform()) {
      case 'darwin':
        return `${this.githubDownloadPrefix}/v${version}/wakatime-cli-darwin-amd64.zip`;
      case 'win32':
        return `${this.githubDownloadPrefix}/v${version}/wakatime-cli-windows-386.zip`;
      default:
        return `${this.githubDownloadPrefix}/v${version}/wakatime-cli-linux-amd64.zip`;
    }
  }
}
