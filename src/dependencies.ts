import * as adm_zip from 'adm-zip';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as request from 'request';
import * as rimraf from 'rimraf';
import * as which from 'which';

import { Options, Setting } from './options';
import { Logger } from './logger';

export class Dependencies {
  private options: Options;
  private logger: Logger;
  private extensionPath: string;
  private s3urlprefix = 'https://wakatime-cli.s3-us-west-2.amazonaws.com/';
  private githubDownloadPrefix = 'https://github.com/wakatime/wakatime-cli/releases/download';
  private githubReleasesUrl = 'https://api.github.com/repos/wakatime/wakatime-cli/releases/latest';
  private githubTagsUrl = 'https://api.github.com/repos/wakatime/wakatime-cli/tags?per_page=1';
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

  public getCliLocation(): string {
    if (this.global) return this.getCliLocationGlobal();
    const ext = Dependencies.isWindows() ? '.exe' : '';
    if (this.standalone) return path.join(this.extensionPath, 'wakatime-cli', 'wakatime-cli' + ext);
    let platform = os.platform() as string;
    if (platform == 'win32') platform = 'windows';
    const arch = this.architecture();
    return path.join(this.extensionPath, `wakatime-cli-${platform}-${arch}${ext}`);
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

  public isCliInstalled(): boolean {
    return fs.existsSync(this.getCliLocation());
  }

  public static isWindows(): boolean {
    return os.platform() === 'win32';
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
    if (!this.isCliInstalled()) {
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
    this.options.getSetting('settings', 'proxy', (proxy: Setting) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: Setting) => {
        this.options.getSetting('internal', 'cli_version_etag', (etag: Setting) => {
          this.options.getSetting('settings', 'alpha', (alpha: Setting) => {
            let options = {
              url: alpha.value == 'true' ? this.githubTagsUrl : this.githubReleasesUrl,
              json: true,
              headers: {
                'User-Agent': 'WakaTime IDE Plugin/1.0',
              },
            };
            if (proxy.value) options['proxy'] = proxy.value;
            if (noSSLVerify.value === 'true') options['strictSSL'] = false;
            if (etag.value) options['headers']['If-None-Match'] = etag.value;
            try {
              request.get(options, (error, response, json) => {
                if (!error && (response.statusCode == 200 || response.statusCode == 304)) {
                  this.logger.debug(`GitHub API Response ${response.statusCode}`);
                  if (response.statusCode == 304) {
                    this.options.getSetting('internal', 'cli_version', (version: Setting) => {
                      this.latestCliVersion = version.value;
                      callback(this.latestCliVersion);
                    });
                    return;
                  }
                  this.latestCliVersion = alpha.value == 'true' ? json[0]['name'] : json['tag_name'];
                  this.logger.debug(`Latest wakatime-cli version from GitHub: ${this.latestCliVersion}`);
                  if (response.headers.etag) {
                    this.options.setSettings('internal', [
                      {key: 'cli_version', value: this.latestCliVersion},
                      {key: 'cli_version_etag', value: response.headers.etag as string},
                    ]);
                  }
                  callback(this.latestCliVersion);
                  return;
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
    });
  }

  private getLatestStandaloneCliVersion(callback: (arg0: string) => void): void {
    const url = this.s3BucketUrl() + 'current_version.txt';
    this.options.getSetting('settings', 'proxy', (proxy: Setting) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: Setting) => {
        let options = { url: url };
        if (proxy.value) options['proxy'] = proxy.value;
        if (noSSLVerify.value === 'true') options['strictSSL'] = false;
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
  }

  private extractCli(zipFile: string, callback: () => void): void {
    this.logger.debug(`Extracting wakatime-cli into "${this.extensionPath}"...`);
    this.removeCli(() => {
      this.unzip(zipFile, this.extensionPath, () => {
        if (!Dependencies.isWindows()) {
          try {
            this.logger.debug('Chmod 755 wakatime-cli...');
            fs.chmodSync(this.getCliLocation(), 0o755);
          } catch (e) {
            this.logger.warn(e);
          }
        }
        callback();
      });
      this.logger.debug('Finished extracting wakatime-cli.');
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
    this.options.getSetting('settings', 'proxy', (proxy: Setting) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: Setting) => {
        let options = { url: url };
        if (proxy.value) options['proxy'] = proxy.value;
        if (noSSLVerify.value === 'true') options['strictSSL'] = false;
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

  private s3BucketUrl(): string {
    switch (os.platform()) {
      case 'darwin':
        return this.s3urlprefix + 'mac-x86-64/';
      case 'win32':
        const arch = os.arch().indexOf('32') > -1 ? '32' : '64';
        return this.s3urlprefix + 'windows-x86-' + arch + '/';
      default:
        return this.s3urlprefix + 'linux-x86-64/';
    }
  }

  private architecture(): string {
    const arch = os.arch();
    if (arch.indexOf('arm') > -1) return arch;
    if (arch.indexOf('32') > -1) return '386';
    return 'amd64';
  }

  private cliDownloadUrl(version: string): string {
    let platform = os.platform() as string;
    if (platform == 'win32') platform = 'windows';
    const arch = this.architecture();
    return `${this.githubDownloadPrefix}/${version}/wakatime-cli-${platform}-${arch}.zip`;
  }
}
