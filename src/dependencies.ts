import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as adm_zip from 'adm-zip';
import * as request from 'request';
import * as rimraf from 'rimraf';

import { Options } from './options';
import { Logger } from './logger';

export class Dependencies {
  private cachedPythonLocation: string = '';
  private options: Options;
  private logger: Logger;
  private extensionPath: string;

  constructor(options: Options, extensionPath: string, logger: Logger) {
    this.options = options;
    this.logger = logger;
    this.extensionPath = extensionPath;
  }

  public checkAndInstall(callback: () => void): void {
    this.isPythonInstalled(isInstalled => {
      if (!isInstalled) {
        this.installPython(() => {
          this.checkAndInstallCore(callback);
        });
      } else {
        this.checkAndInstallCore(callback);
      }
    });
  }

  public checkAndInstallCore(callback: () => void): void {
    if (!this.isCoreInstalled()) {
      this.installCore(callback);
    } else {
      this.isCoreLatest(isLatest => {
        if (!isLatest) {
          this.installCore(callback);
        } else {
          callback();
        }
      });
    }
  }

  public getPythonLocation(callback: (arg0: string) => void): void {
    if (this.cachedPythonLocation) return callback(this.cachedPythonLocation);

    let locations: string[] = [
      path.join(this.extensionPath, 'python', 'pythonw'),
      'python3',
      'pythonw',
      'python',
      '/usr/local/bin/python3',
      '/usr/local/bin/python',
      '/usr/bin/python3',
      '/usr/bin/python',
    ];
    for (var i = 39; i >= 27; i--) {
      if (i >= 30 && i <= 32) continue;
      locations.push(`\\python${i}\\pythonw`);
      locations.push(`\\Python${i}\\pythonw`);
    }

    this.findPython(locations, python => {
      if (python) this.cachedPythonLocation = python;
      callback(python);
    });
  }

  public getCoreLocation(): string {
    let dir = path.join(this.extensionPath, 'wakatime-master', 'wakatime', 'cli.py');
    return dir;
  }

  public static isWindows(): boolean {
    return os.type() === 'Windows_NT';
  }

  private findPython(locations: string[], callback: (arg0: string) => void): void {
    const binary = locations.shift();
    if (!binary) {
      callback('');
      return;
    }

    this.logger.debug(`Looking for python at: ${binary}`);

    const args = ['--version'];
    try {
      child_process.execFile(binary, args, (error, stdout, stderr) => {
        const output: string = stdout.toString() + stderr.toString();
        if (!error && this.isSupportedPythonVersion(binary, output)) {
          this.cachedPythonLocation = binary;
          this.logger.debug(`Valid python version: ${output}`);
          callback(binary);
          return;
        } else {
          this.logger.debug(`Invalid python version: ${output}`);
          this.findPython(locations, callback);
        }
      });
    } catch (e) {
      this.logger.debug(e);
      this.findPython(locations, callback);
    }
  }

  private isCoreInstalled(): boolean {
    return fs.existsSync(this.getCoreLocation());
  }

  private isCoreLatest(callback: (arg0: boolean) => void): void {
    this.getPythonLocation(pythonBinary => {
      if (pythonBinary) {
        let args = [this.getCoreLocation(), '--version'];
        child_process.execFile(pythonBinary, args, (error, _stdout, stderr) => {
          if (!(error != null)) {
            let currentVersion = stderr.toString().trim();
            this.logger.debug(`Current wakatime-core version is ${currentVersion}`);

            this.logger.debug('Checking for updates to wakatime-core...');
            this.getLatestCoreVersion(latestVersion => {
              if (currentVersion === latestVersion) {
                this.logger.debug('wakatime-core is up to date');
                callback(true);
              } else if (latestVersion) {
                this.logger.debug(`Found an updated wakatime-core v${latestVersion}`);
                callback(false);
              } else {
                this.logger.debug('Unable to find latest wakatime-core version from GitHub');
                callback(false);
              }
            });
          } else {
            callback(false);
          }
        });
      } else {
        callback(false);
      }
    });
  }

  private getLatestCoreVersion(callback: (arg0: string) => void): void {
    let url = 'https://raw.githubusercontent.com/wakatime/wakatime/master/wakatime/__about__.py';
    this.options.getSetting('settings', 'proxy', (proxy: string) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: string) => {
        let options = { url: url };
        if (proxy) options['proxy'] = proxy;
        if (noSSLVerify === 'true') options['strictSSL'] = false;
        request.get(options, (error, response, body) => {
          let version: string = '';
          if (!error && response.statusCode == 200) {
            let lines = body.split('\n');
            for (var i = 0; i < lines.length; i++) {
              let re = /^__version_info__ = \('([0-9]+)', '([0-9]+)', '([0-9]+)'\)/g;
              let match = re.exec(lines[i]);
              if (match) {
                version = match[1] + '.' + match[2] + '.' + match[3];
                callback(version);
                return;
              }
            }
          }
          callback(version);
        });
      });
    });
  }

  private installCore(callback: () => void): void {
    this.logger.debug('Downloading wakatime-core...');
    let url = 'https://github.com/wakatime/wakatime/archive/master.zip';
    let zipFile = path.join(this.extensionPath, 'wakatime-master.zip');

    this.downloadFile(url, zipFile, () => {
      this.extractCore(zipFile, callback);
    });
  }

  private extractCore(zipFile: string, callback: () => void): void {
    this.logger.debug(`Extracting wakatime-core into "${this.extensionPath}"...`);
    this.removeCore(() => {
      this.unzip(zipFile, this.extensionPath, callback);
      this.logger.debug('Finished extracting wakatime-core.');
    });
  }

  private removeCore(callback: () => void): void {
    if (fs.existsSync(path.join(this.extensionPath, 'wakatime-master'))) {
      try {
        rimraf(path.join(this.extensionPath, 'wakatime-master'), () => {
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

  private downloadFile(url: string, outputFile: string, callback: () => void): void {
    this.options.getSetting('settings', 'proxy', (_err, proxy) => {
      this.options.getSetting('settings', 'no_ssl_verify', (noSSLVerify: string) => {
        let options = { url: url };
        if (proxy) options['proxy'] = proxy;
        if (noSSLVerify === 'true') options['strictSSL'] = false;
        let r = request.get(options);
        let out = fs.createWriteStream(outputFile);
        r.pipe(out);
        r.on('end', () => {
          out.on('finish', () => {
            callback();
          });
        });
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

  private isPythonInstalled(callback: (arg0: boolean) => void): void {
    this.getPythonLocation(pythonBinary => {
      callback(!!pythonBinary);
    });
  }

  private installPython(callback: () => void): void {
    if (Dependencies.isWindows()) {
      let ver = '3.5.1';
      let arch = 'win32';
      if (os.arch().indexOf('x64') > -1) arch = 'amd64';
      let url =
        'https://www.python.org/ftp/python/' + ver + '/python-' + ver + '-embed-' + arch + '.zip';

      this.logger.debug('Downloading python...');
      let zipFile = path.join(this.extensionPath, 'python.zip');
      this.downloadFile(url, zipFile, () => {
        this.logger.debug('Extracting python...');
        this.unzip(zipFile, path.join(this.extensionPath, 'python'), () => {
          this.logger.debug('Finished installing python.');
          callback();
        });
      });
    } else {
      let error_msg =
        'WakaTime depends on Python. Install it from https://python.org/downloads then restart VS Code';
      this.logger.warn(error_msg);
      vscode.window.showWarningMessage(error_msg);
      callback();
    }
  }

  private isSupportedPythonVersion(binary: string, versionString: string): boolean {
    // Only support Python 2.7+ because 2.6 has SSL problems
    if (binary.toLowerCase().includes('python26')) return false;

    const anaconda = /continuum|anaconda/gi;
    const isAnaconda: boolean = !!anaconda.test(versionString);
    const re = /python\s+(\d+)\.(\d+)\.(\d+)\s/gi;
    const ver = re.exec(versionString);
    if (!ver) return !isAnaconda;

    // Older Anaconda python distributions not supported
    if (isAnaconda) {
      if (parseInt(ver[1]) >= 3 && parseInt(ver[2]) >= 5) return true;
    } else {
      // Only support Python 2.7+ because 2.6 has SSL problems
      if (parseInt(ver[1]) >= 2 || parseInt(ver[2]) >= 7) return true;
    }

    return false;
  }
}
