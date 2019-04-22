import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as adm_zip from 'adm-zip';

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
    child_process.execFile(binary, args, (error, stdout, stderr) => {
      const output: string = stdout.toString() + stderr.toString();
      if (!error && this.isSupportedPythonVersion(binary, output)) {
        this.cachedPythonLocation = binary;
        this.logger.debug(`Valid python version: ${output}`);
        callback(binary);
      } else {
        this.logger.debug(`Invalid python version: ${output}`);
        this.findPython(locations, callback);
      }
    });
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
                if (callback) callback(true);
              } else if (latestVersion) {
                this.logger.debug(`Found an updated wakatime-core v${latestVersion}`);
                if (callback) callback(false);
              } else {
                this.logger.debug('Unable to find latest wakatime-core version from GitHub');
                if (callback) callback(false);
              }
            });
          } else {
            if (callback) callback(false);
          }
        });
      } else {
        if (callback) callback(false);
      }
    });
  }

  private async getLatestCoreVersion(callback: (arg0: string) => void): Promise<void> {
    let url = 'https://raw.githubusercontent.com/wakatime/wakatime/master/wakatime/__about__.py';
    const request = await import('request');
    this.options.getSetting('settings', 'proxy', function(_err, proxy) {
      let options = { url: url };
      if (proxy && proxy.trim()) options['proxy'] = proxy.trim();
      request.get(options, function(error, response, body) {
        let version: string = '';
        if (!error && response.statusCode == 200) {
          let lines = body.split('\n');
          for (var i = 0; i < lines.length; i++) {
            let re = /^__version_info__ = \('([0-9]+)', '([0-9]+)', '([0-9]+)'\)/g;
            let match = re.exec(lines[i]);
            if (match) {
              version = match[1] + '.' + match[2] + '.' + match[3];
              if (callback) return callback(version);
            }
          }
        }
        if (callback) return callback(version);
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

  private async removeCore(callback: () => void): Promise<void> {
    if (fs.existsSync(path.join(this.extensionPath, 'wakatime-master'))) {
      try {
        const rimraf = await import('rimraf');
        rimraf(path.join(this.extensionPath, 'wakatime-master'), () => {
          if (callback != null) {
            return callback();
          }
        });
      } catch (e) {
        this.logger.warn(e);
      }
    } else {
      if (callback != null) {
        return callback();
      }
    }
  }

  private async downloadFile(url: string, outputFile: string, callback: () => void): Promise<void> {
    const request = await import('request');
    this.options.getSetting('settings', 'proxy', function(_err, proxy) {
      let options = { url: url };
      if (proxy && proxy.trim()) options['proxy'] = proxy.trim();
      let r = request.get(options);
      let out = fs.createWriteStream(outputFile);
      r.pipe(out);
      return r.on('end', function() {
        return out.on('finish', function() {
          if (callback != null) {
            return callback();
          }
        });
      });
    });
  }

  private async unzip(file: string, outputDir: string, callback: () => void): Promise<void> {
    if (fs.existsSync(file)) {
      try {
        let zip = await new adm_zip(file);
        zip.extractAllTo(outputDir, true);
      } catch (e) {
        return this.logger.error(e);
      } finally {
        fs.unlink(file, () => {
          if (callback) {
            return callback();
          }
        });
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
        this.unzip(zipFile, path.join(this.extensionPath, 'python'), callback);
        this.logger.debug('Finished installing python.');
        callback();
      });
    } else {
      let error_msg =
        'WakaTime depends on Python. Install it from https://python.org/downloads then restart VS Code';
      this.logger.warn(error_msg);
      vscode.window.showWarningMessage(error_msg);
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
