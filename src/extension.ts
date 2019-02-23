import * as vscode from 'vscode';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';

var logger: Logger;
var options: Options;

export function activate(ctx: vscode.ExtensionContext) {
  options = new Options();
  logger = new Logger('info');

  let wakatime = new WakaTime();

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.apikey', function(args) {
      wakatime.promptForApiKey();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.proxy', function(args) {
      wakatime.promptForProxy();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.debug', function(args) {
      wakatime.promptForDebug();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.status_bar_icon', function(args) {
      wakatime.promptStatusBarIcon();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.dashboard', function(args) {
      wakatime.openDashboardWebsite();
    }),
  );

  // dispose WakaTime instance when this extension is deactivated
  ctx.subscriptions.push(wakatime);

  options.getSetting('settings', 'debug', function(error, debug) {
    if (debug && debug.trim() === 'true') logger.setLevel('debug');
    wakatime.initialize();
  });
}

export class WakaTime {
  private appNames = {
    'SQL Operations Studio': 'sqlops',
    'Visual Studio Code': 'vscode',
  };
  private agentName: string;
  private extension = vscode.extensions.getExtension('WakaTime.vscode-wakatime').packageJSON;
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  private disposable: vscode.Disposable;
  private lastFile: string;
  private lastHeartbeat: number = 0;
  private dependencies: Dependencies;
  private options: Options = new Options();

  constructor() {}

  public initialize(): void {
    logger.debug('Initializing WakaTime v' + this.extension.version);
    this.agentName = this.appNames[vscode.env.appName] || 'vscode';
    this.statusBar.text = '$(clock) WakaTime Initializing...';
    this.statusBar.show();

    this.checkApiKey();

    this.dependencies = new Dependencies(this.extension, this.options);
    this.dependencies.checkAndInstall(() => {
      this.statusBar.text = '$(clock)';
      this.statusBar.tooltip = 'WakaTime: Initialized';
      this.options.getSetting('settings', 'status_bar_icon', (err, val) => {
        if (val && val.trim() == 'false') this.statusBar.hide();
        else this.statusBar.show();
      });
    });

    this.setupEventListeners();
  }

  public promptForApiKey(): void {
    this.options.getSetting('settings', 'api_key', (err, defaultVal) => {
      if (this.validateKey(defaultVal) != null) defaultVal = '';
      let promptOptions = {
        prompt: 'WakaTime API Key',
        placeHolder: 'Enter your api key from wakatime.com/settings',
        value: defaultVal,
        ignoreFocusOut: true,
        validateInput: this.validateKey.bind(this),
      };
      vscode.window.showInputBox(promptOptions).then(val => {
        if (this.validateKey(val) == null) this.options.setSetting('settings', 'api_key', val);
      });
    });
  }

  public promptForProxy(): void {
    this.options.getSetting('settings', 'proxy', (err, defaultVal) => {
      if (!defaultVal) defaultVal = '';
      let promptOptions = {
        prompt: 'WakaTime Proxy',
        placeHolder: 'Proxy format is https://user:pass@host:port',
        value: defaultVal,
        ignoreFocusOut: true,
        validateInput: this.validateProxy.bind(this),
      };
      vscode.window.showInputBox(promptOptions).then(val => {
        if (val || val === '') this.options.setSetting('settings', 'proxy', val);
      });
    });
  }

  public promptForDebug(): void {
    this.options.getSetting('settings', 'debug', (err, defaultVal) => {
      if (!defaultVal || defaultVal.trim() !== 'true') defaultVal = 'false';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: 'true or false (Currently ' + defaultVal + ')',
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal == null) return;
        this.options.setSetting('settings', 'debug', newVal);
        if (newVal === 'true') {
          logger.setLevel('debug');
          logger.debug('Debug enabled');
        } else {
          logger.setLevel('info');
        }
      });
    });
  }

  public promptStatusBarIcon(): void {
    this.options.getSetting('settings', 'status_bar_icon', (err, defaultVal) => {
      if (!defaultVal || defaultVal.trim() !== 'false') defaultVal = 'true';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: 'true or false (Currently ' + defaultVal + ')',
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal == null) return;
        this.options.setSetting('settings', 'status_bar_icon', newVal);
        if (newVal === 'true') {
          this.statusBar.show();
          logger.debug('Status bar icon enabled');
        } else {
          this.statusBar.hide();
          logger.debug('Status bar icon disabled');
        }
      });
    });
  }

  public openDashboardWebsite(): void {
    let open = 'xdg-open';
    let args = ['https://wakatime.com/'];
    if (Dependencies.isWindows()) {
      open = 'cmd';
      args.unshift('/c', 'start', '""');
    } else if (os.type() == 'Darwin') {
      open = 'open';
    }
    let process = child_process.execFile(open, args, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') logger.error(stdout.toString());
        logger.error(error.toString());
      }
    });
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
  }

  private validateKey(key: string): string {
    const err = 'Invalid api key... check https://wakatime.com/settings for your key.';
    if (!key) return err;
    const re = new RegExp(
      '^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$',
      'i',
    );
    if (!re.test(key)) return err;
    return null;
  }

  private validateProxy(proxy: string): string {
    const err =
      'Invalid proxy. Valid formats are https://user:pass@host:port or socks5://user:pass@host:port or domain\\user:pass.';
    if (!proxy) return err;
    let re = new RegExp('^((https?|socks5)://)?([^:@]+(:([^:@])+)?@)?[\\w\\.-]+(:\\d+)?$', 'i');
    if (proxy.indexOf('\\') > -1) re = new RegExp('^.*\\\\.+$', 'i');
    if (!re.test(proxy)) return err;
    return null;
  }

  private checkApiKey(): void {
    this.hasApiKey(hasApiKey => {
      if (!hasApiKey) this.promptForApiKey();
    });
  }

  private hasApiKey(callback: (boolean) => void): void {
    this.options.getSetting('settings', 'api_key', (error, apiKey) => {
      callback(this.validateKey(apiKey) == null);
    });
  }

  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    let subscriptions: vscode.Disposable[] = [];
    vscode.window.onDidChangeTextEditorSelection(this.onChange, this, subscriptions);
    vscode.window.onDidChangeActiveTextEditor(this.onChange, this, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, subscriptions);

    // create a combined disposable from both event subscriptions
    this.disposable = vscode.Disposable.from(...subscriptions);
  }

  private onChange(): void {
    this.onEvent(false);
  }

  private onSave(): void {
    this.onEvent(true);
  }

  private onEvent(isWrite: boolean): void {
    let editor = vscode.window.activeTextEditor;
    if (editor) {
      let doc = editor.document;
      if (doc) {
        let file: string = doc.fileName;
        if (file) {
          let time: number = Date.now();
          if (isWrite || this.enoughTimePassed(time) || this.lastFile !== file) {
            this.sendHeartbeat(file, isWrite);
            this.lastFile = file;
            this.lastHeartbeat = time;
          }
        }
      }
    }
  }

  private sendHeartbeat(file: string, isWrite): void {
    this.hasApiKey(hasApiKey => {
      if (hasApiKey) {
        this.dependencies.getPythonLocation(pythonBinary => {
          if (pythonBinary) {
            let core = this.dependencies.getCoreLocation();
            let user_agent =
              this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
            let args = [core, '--file', quote(file), '--plugin', quote(user_agent)];
            let project = this.getProjectName(file);
            if (project) args.push('--alternate-project', quote(project));
            if (isWrite) args.push('--write');
            if (Dependencies.isWindows()) {
              args.push(
                '--config',
                quote(this.options.getConfigFile()),
                '--logfile',
                quote(this.options.getLogFile()),
              );
            }

            logger.debug('Sending heartbeat: ' + this.formatArguments(pythonBinary, args));

            let process = child_process.execFile(pythonBinary, args, (error, stdout, stderr) => {
              if (error != null) {
                if (stderr && stderr.toString() != '') logger.error(stderr.toString());
                if (stdout && stdout.toString() != '') logger.error(stdout.toString());
                logger.error(error.toString());
              }
            });
            process.on('close', (code, signal) => {
              if (code == 0) {
                this.statusBar.text = '$(clock)';
                let today = new Date();
                this.statusBar.tooltip = 'WakaTime: Last heartbeat sent ' + this.formatDate(today);
              } else if (code == 102) {
                this.statusBar.text = '$(clock)';
                this.statusBar.tooltip =
                  'WakaTime: Working offline... coding activity will sync next time we are online.';
                logger.warn(
                  'API Error (102); Check your ' + options.getLogFile() + ' file for more details.',
                );
              } else if (code == 103) {
                this.statusBar.text = '$(clock) WakaTime Error';
                let error_msg =
                  'Config Parsing Error (103); Check your ' +
                  options.getLogFile() +
                  ' file for more details.';
                this.statusBar.tooltip = 'WakaTime: ' + error_msg;
                logger.error(error_msg);
              } else if (code == 104) {
                this.statusBar.text = '$(clock) WakaTime Error';
                let error_msg = 'Invalid API Key (104); Make sure your API Key is correct!';
                this.statusBar.tooltip = 'WakaTime: ' + error_msg;
                logger.error(error_msg);
              } else {
                this.statusBar.text = '$(clock) WakaTime Error';
                let error_msg =
                  'Unknown Error (' +
                  code +
                  '); Check your ' +
                  options.getLogFile() +
                  ' file for more details.';
                this.statusBar.tooltip = 'WakaTime: ' + error_msg;
                logger.error(error_msg);
              }
            });
          }
        });
      } else {
        this.promptForApiKey();
      }
    });
  }

  private formatDate(date: Date): String {
    let months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    let ampm = 'AM';
    let hour = date.getHours();
    if (hour > 11) {
      ampm = 'PM';
      hour = hour - 12;
    }
    if (hour == 0) {
      hour = 12;
    }
    let minute = date.getMinutes();
    return (
      months[date.getMonth()] +
      ' ' +
      date.getDate() +
      ', ' +
      date.getFullYear() +
      ' ' +
      hour +
      ':' +
      (minute < 10 ? '0' + minute : minute) +
      ' ' +
      ampm
    );
  }

  private enoughTimePassed(time: number): boolean {
    return this.lastHeartbeat + 120000 < time;
  }

  private getProjectName(file: string): string {
    let uri = vscode.Uri.file(file);
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (vscode.workspace && workspaceFolder) {
      try {
        return workspaceFolder.name;
      } catch (e) {}
    }
    return null;
  }

  private obfuscateKey(key: string): string {
    let newKey = '';
    if (key) {
      newKey = key;
      if (key.length > 4)
        newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
    }
    return newKey;
  }

  private wrapArg(arg: string): string {
    if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
    return arg;
  }

  private formatArguments(python: string, args: string[]): string {
    let clone = args.slice(0);
    clone.unshift(this.wrapArg(python));
    let newCmds = [];
    let lastCmd = '';
    for (let i = 0; i < clone.length; i++) {
      if (lastCmd == '--key') newCmds.push(this.wrapArg(this.obfuscateKey(clone[i])));
      else newCmds.push(this.wrapArg(clone[i]));
      lastCmd = clone[i];
    }
    return newCmds.join(' ');
  }
}

class Dependencies {
  private cachedPythonLocation: string;
  private options: Options;
  private extension;
  private dependenciesFolder: string;

  constructor(extension, options: Options) {
    this.options = options;
    this.extension = extension;
    this.dependenciesFolder = extension.extensionLocation.fsPath + path.sep + 'dist';
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

  public getPythonLocation(callback: (string) => void): void {
    if (this.cachedPythonLocation) return callback(this.cachedPythonLocation);

    let locations: string[] = [
      this.dependenciesFolder + path.sep + 'python' + path.sep + 'pythonw',
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
      locations.push('\\python' + i + '\\pythonw');
      locations.push('\\Python' + i + '\\pythonw');
    }

    this.findPython(locations, python => {
      if (python) this.cachedPythonLocation = python;
      callback(python);
    });
  }

  public getCoreLocation(): string {
    let dir =
      this.dependenciesFolder +
      path.sep +
      'wakatime-master' +
      path.sep +
      'wakatime' +
      path.sep +
      'cli.py';
    return dir;
  }

  public static isWindows(): boolean {
    return os.type() === 'Windows_NT';
  }

  private findPython(locations: string[], callback: (string) => void): void {
    const binary: string = locations.shift();
    if (!binary) {
      callback(null);
      return;
    }

    logger.debug('Looking for python at: ' + binary);

    const args = ['--version'];
    child_process.execFile(binary, args, (error, stdout, stderr) => {
      const output: string = stdout.toString() + stderr.toString();
      if (!error && this.isSupportedPythonVersion(binary, output)) {
        this.cachedPythonLocation = binary;
        logger.debug('Valid python version: ' + output);
        callback(binary);
      } else {
        logger.debug('Invalid python version: ' + output);
        this.findPython(locations, callback);
      }
    });
  }

  private isCoreInstalled(): boolean {
    return fs.existsSync(this.getCoreLocation());
  }

  private isCoreLatest(callback: (boolean) => void): void {
    this.getPythonLocation(pythonBinary => {
      if (pythonBinary) {
        let args = [this.getCoreLocation(), '--version'];
        child_process.execFile(pythonBinary, args, (error, stdout, stderr) => {
          if (!(error != null)) {
            let currentVersion = stderr.toString().trim();
            logger.debug('Current wakatime-core version is ' + currentVersion);

            logger.debug('Checking for updates to wakatime-core...');
            this.getLatestCoreVersion(latestVersion => {
              if (currentVersion === latestVersion) {
                logger.debug('wakatime-core is up to date.');
                if (callback) callback(true);
              } else if (latestVersion) {
                logger.debug('Found an updated wakatime-core v' + latestVersion);
                if (callback) callback(false);
              } else {
                logger.debug('Unable to find latest wakatime-core version from GitHub.');
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

  private async getLatestCoreVersion(callback: (string) => void): Promise<void> {
    let url = 'https://raw.githubusercontent.com/wakatime/wakatime/master/wakatime/__about__.py';
    const request = await import('request');
    this.options.getSetting('settings', 'proxy', function(err, proxy) {
      let options = { url: url };
      if (proxy && proxy.trim()) options['proxy'] = proxy.trim();
      request.get(options, function(error, response, body) {
        let version = null;
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
    logger.debug('Downloading wakatime-core...');
    let url = 'https://github.com/wakatime/wakatime/archive/master.zip';
    let zipFile = this.dependenciesFolder + path.sep + 'wakatime-master.zip';

    this.downloadFile(url, zipFile, () => {
      this.extractCore(zipFile, callback);
    });
  }

  private extractCore(zipFile: string, callback: () => void): void {
    logger.debug('Extracting wakatime-core into "' + this.dependenciesFolder + '"...');
    this.removeCore(() => {
      this.unzip(zipFile, this.dependenciesFolder, callback);
      logger.debug('Finished extracting wakatime-core.');
    });
  }

  private async removeCore(callback: () => void): Promise<void> {
    if (fs.existsSync(this.dependenciesFolder + path.sep + 'wakatime-master')) {
      try {
        const rimraf = await import('rimraf');
        rimraf(this.dependenciesFolder + path.sep + 'wakatime-master', () => {
          if (callback != null) {
            return callback();
          }
        });
      } catch (e) {
        logger.warn(e);
      }
    } else {
      if (callback != null) {
        return callback();
      }
    }
  }

  private async downloadFile(url: string, outputFile: string, callback: () => void): Promise<void> {
    const request = await import('request');
    this.options.getSetting('settings', 'proxy', function(err, proxy) {
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

  private async unzip(file: string, outputDir: string, callback: () => void = null): Promise<void> {
    if (fs.existsSync(file)) {
      try {
        const AdmZip = await import('adm-zip');
        let zip = new AdmZip(file);
        zip.extractAllTo(outputDir, true);
      } catch (e) {
        return logger.error(e);
      } finally {
        fs.unlink(file, unlinkError => {
          if (callback) {
            return callback();
          }
        });
      }
    }
  }

  private isPythonInstalled(callback: (boolean) => void): void {
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

      logger.debug('Downloading python...');
      let zipFile = this.dependenciesFolder + path.sep + 'python.zip';
      this.downloadFile(url, zipFile, () => {
        logger.debug('Extracting python...');
        this.unzip(zipFile, this.dependenciesFolder + path.sep + 'python');
        logger.debug('Finished installing python.');

        callback();
      });
    } else {
      logger.error(
        'WakaTime depends on Python. Install it from https://python.org/downloads then restart VSCode.',
      );
      // window.alert('WakaTime depends on Python. Install it from https://python.org/downloads then restart VSCode.');
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

    // Older Ananconda python distributions not supported
    if (isAnaconda) {
      if (parseInt(ver[1]) >= 3 && parseInt(ver[2]) >= 5) return true;
    } else {
      // Only support Python 2.7+ because 2.6 has SSL problems
      if (parseInt(ver[1]) >= 2 || parseInt(ver[2]) >= 7) return true;
    }

    return false;
  }
}

class Options {
  private configFile = path.join(this.getWakaHome(), '.wakatime.cfg');
  private logFile = path.join(this.getWakaHome(), '.wakatime.log');

  private getWakaHome(): string {
    let home = process.env.WAKATIME_HOME;
    if (home) {
      return home;
    } else {
      return this.getUserHomeDir();
    }
  }

  public getSetting(section: string, key: string, callback: (string, any) => void): void {
    fs.readFile(this.getConfigFile(), 'utf-8', (err: NodeJS.ErrnoException, content: string) => {
      if (err) {
        if (callback) callback(new Error('could not read ' + this.getConfigFile()), null);
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
              if (callback) callback(null, parts[1].trim());
              return;
            }
          }
        }

        if (callback) callback(null, null);
      }
    });
  }

  public setSetting(section: string, key: string, val: string, callback?: (Error) => void): void {
    fs.readFile(this.getConfigFile(), 'utf-8', (err: NodeJS.ErrnoException, content: string) => {
      // ignore errors because config file might not exist yet
      if (err) content = '';

      let contents = [];
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

      fs.writeFile(this.getConfigFile(), contents.join('\n'), function(err2) {
        if (err) {
          if (callback) callback(new Error('could not write to ' + this.getConfigFile()));
        } else {
          if (callback) callback(null);
        }
      });
    });
  }

  public getConfigFile(): string {
    return this.configFile;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public getUserHomeDir(): string {
    return process.env[Dependencies.isWindows() ? 'USERPROFILE' : 'HOME'] || '';
  }

  public startsWith(outer: string, inner: string): boolean {
    return outer.slice(0, inner.length) === inner;
  }

  public endsWith(outer: string, inner: string): boolean {
    return inner === '' || outer.slice(-inner.length) === inner;
  }
}

class Logger {
  private level: string;
  private levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(level: string) {
    this.setLevel(level);
  }

  public setLevel(level: string): void {
    if (level in this.levels) {
      this.level = level;
    } else {
      throw new TypeError('Invalid level: ' + level);
    }
  }

  public log(level: string, msg: string): void {
    if (!(level in this.levels)) throw new TypeError('Invalid level: ' + level);

    const current: number = this.levels[level];
    const cutoff: number = this.levels[this.level];

    if (current >= cutoff) {
      msg = '[WakaTime] [' + level.toUpperCase() + '] ' + msg;
      if (level == 'debug') console.log(msg);
      if (level == 'info') console.info(msg);
      if (level == 'warn') console.warn(msg);
      if (level == 'error') console.error(msg);
    }
  }

  public debug(msg: string): void {
    this.log('debug', msg);
  }

  public info(msg: string): void {
    this.log('info', msg);
  }

  public warn(msg: string): void {
    this.log('warn', msg);
  }

  public error(msg: string): void {
    this.log('error', msg);
  }
}

function quote(str) {
  if (str.includes(' ')) return '"' + str.replace('"', '\\"') + '"';
  return str;
}
