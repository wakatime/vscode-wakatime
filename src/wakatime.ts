import * as vscode from 'vscode';
// import * as azdata from 'azdata';
import * as child_process from 'child_process';

import { Dependencies } from './dependencies';
import { COMMAND_DASHBOARD, LogLevel } from './constants';
import { Options, Setting } from './options';
import { Logger } from './logger';
import { Utils } from './utils';

interface FileSelection {
  selection: vscode.Position;
  lastHeartbeatAt: number;
}

interface FileSelectionMap {
  [key: string]: FileSelection;
}

export class WakaTime {
  private appNames = {
    'Azure Data Studio': 'azdata',
    'SQL Operations Studio': 'sqlops',
    'Visual Studio Code': 'vscode',
    Onivim: 'onivim',
    'Onivim 2': 'onivim',
  };
  private agentName: string;
  private extension;
  private statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  private disposable: vscode.Disposable;
  private lastFile: string;
  private lastHeartbeat: number = 0;
  private dedupe: FileSelectionMap = {};
  private dependencies: Dependencies;
  private options: Options;
  private logger: Logger;
  private getCodingActivityTimeout: number;
  private fetchTodayInterval: number = 60000;
  private lastFetchToday: number = 0;
  private showStatusBar: boolean;
  private showCodingActivity: boolean;
  private disabled: boolean = true;
  private extensionPath: string;

  constructor(extensionPath: string, logger: Logger, options: Options) {
    this.extensionPath = extensionPath;
    this.logger = logger;
    this.options = options;
  }

  public initialize(global: boolean): void {
    this.dependencies = new Dependencies(this.options, this.logger, this.extensionPath, global);
    this.statusBar.command = COMMAND_DASHBOARD;

    let extension = vscode.extensions.getExtension('WakaTime.vscode-wakatime');
    this.extension = (extension != undefined && extension.packageJSON) || { version: '0.0.0' };
    this.logger.debug(`Initializing WakaTime v${this.extension.version}`);
    this.agentName = this.appNames[vscode.env.appName] || 'vscode';
    this.statusBar.text = '$(clock) WakaTime Initializing...';
    this.statusBar.show();

    this.setupEventListeners();

    this.options.getSetting(
      'settings',
      'disabled',
      this.options.getConfigFile(),
      (disabled: Setting) => {
        this.disabled = disabled.value === 'true';
        if (this.disabled) {
          this.setStatusBarVisibility(false);
          this.logger.debug('Extension disabled, will not report coding stats to dashboard.');
          return;
        }

        this.checkApiKey();
        this.initializeDependencies();
      },
    );
  }

  public initializeDependencies(): void {
    this.dependencies.checkAndInstall(() => {
      this.logger.debug('WakaTime initialized.');
      this.statusBar.text = '$(clock)';
      this.statusBar.tooltip = 'WakaTime: Initialized';
      this.options.getSetting(
        'settings',
        'status_bar_enabled',
        this.options.getConfigFile(),
        (setting: Setting) => {
          this.showStatusBar = setting.value !== 'false';
          this.setStatusBarVisibility(this.showStatusBar);
        },
      );
      this.options.getSetting(
        'settings',
        'status_bar_coding_activity',
        this.options.getConfigFile(),
        (setting: Setting) => {
          if (setting.value == 'false') {
            this.showCodingActivity = false;
          } else {
            this.showCodingActivity = true;
            this.getCodingActivity();
          }
        },
      );
    });
  }

  public promptForApiKey(): void {
    this.options.getSetting(
      'settings',
      'api_key',
      this.options.getConfigFile(),
      (setting: Setting) => {
        let defaultVal = setting.value;
        if (Utils.validateKey(defaultVal) != '') defaultVal = '';
        let promptOptions = {
          prompt: 'WakaTime Api Key',
          placeHolder: 'Enter your api key from https://wakatime.com/settings',
          value: defaultVal,
          ignoreFocusOut: true,
          validateInput: Utils.validateKey.bind(this),
        };
        vscode.window.showInputBox(promptOptions).then(val => {
          if (val != undefined) {
            let validation = Utils.validateKey(val);
            if (validation === '') this.options.setSetting('settings', 'api_key', val);
            else vscode.window.setStatusBarMessage(validation);
          } else vscode.window.setStatusBarMessage('WakaTime api key not provided');
        });
      },
    );
  }

  public promptForProxy(): void {
    this.options.getSetting('settings', 'proxy', this.options.getConfigFile(), (proxy: Setting) => {
      let defaultVal = proxy.value;
      if (!defaultVal) defaultVal = '';
      let promptOptions = {
        prompt: 'WakaTime Proxy',
        placeHolder: `Proxy format is https://user:pass@host:port (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
        validateInput: Utils.validateProxy.bind(this),
      };
      vscode.window.showInputBox(promptOptions).then(val => {
        if (val || val === '') this.options.setSetting('settings', 'proxy', val);
      });
    });
  }

  public promptForDebug(): void {
    this.options.getSetting('settings', 'debug', this.options.getConfigFile(), (debug: Setting) => {
      let defaultVal = debug.value;
      if (!defaultVal || defaultVal !== 'true') defaultVal = 'false';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then(newVal => {
        if (newVal == null) return;
        this.options.setSetting('settings', 'debug', newVal);
        if (newVal === 'true') {
          this.logger.setLevel(LogLevel.DEBUG);
          this.logger.debug('Debug enabled');
        } else {
          this.logger.setLevel(LogLevel.INFO);
        }
      });
    });
  }

  public promptToDisable(): void {
    this.options.getSetting(
      'settings',
      'disabled',
      this.options.getConfigFile(),
      (setting: Setting) => {
        let currentVal = setting.value;
        if (!currentVal || currentVal !== 'true') currentVal = 'false';
        let items: string[] = ['disable', 'enable'];
        const helperText = currentVal === 'true' ? 'disabled' : 'enabled';
        let promptOptions = {
          placeHolder: `disable or enable (extension is currently "${helperText}")`,
          ignoreFocusOut: true,
        };
        vscode.window.showQuickPick(items, promptOptions).then(newVal => {
          if (newVal !== 'enable' && newVal !== 'disable') return;
          this.disabled = newVal === 'disable';
          if (this.disabled) {
            this.options.setSetting('settings', 'disabled', 'true');
            this.setStatusBarVisibility(false);
            this.logger.debug('Extension disabled, will not report coding stats to dashboard.');
          } else {
            this.options.setSetting('settings', 'disabled', 'false');
            this.checkApiKey();
            this.initializeDependencies();
            if (this.showStatusBar) this.setStatusBarVisibility(true);
            this.logger.debug('Extension enabled and reporting coding stats to dashboard.');
          }
        });
      },
    );
  }

  public promptStatusBarIcon(): void {
    this.options.getSetting(
      'settings',
      'status_bar_enabled',
      this.options.getConfigFile(),
      (setting: Setting) => {
        let defaultVal = setting.value;
        if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
        let items: string[] = ['true', 'false'];
        let promptOptions = {
          placeHolder: `true or false (current value \"${defaultVal}\")`,
          value: defaultVal,
          ignoreFocusOut: true,
        };
        vscode.window.showQuickPick(items, promptOptions).then(newVal => {
          if (newVal !== 'true' && newVal !== 'false') return;
          this.options.setSetting('settings', 'status_bar_enabled', newVal);
          this.showStatusBar = newVal === 'true'; // cache setting to prevent reading from disc too often
          this.setStatusBarVisibility(this.showStatusBar);
        });
      },
    );
  }

  public promptStatusBarCodingActivity(): void {
    this.options.getSetting(
      'settings',
      'status_bar_coding_activity',
      this.options.getConfigFile(),
      (setting: Setting) => {
        let defaultVal = setting.value;
        if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
        let items: string[] = ['true', 'false'];
        let promptOptions = {
          placeHolder: `true or false (current value \"${defaultVal}\")`,
          value: defaultVal,
          ignoreFocusOut: true,
        };
        vscode.window.showQuickPick(items, promptOptions).then(newVal => {
          if (newVal !== 'true' && newVal !== 'false') return;
          this.options.setSetting('settings', 'status_bar_coding_activity', newVal);
          if (newVal === 'true') {
            this.logger.debug('Coding activity in status bar has been enabled');
            this.showCodingActivity = true;
            this.getCodingActivity(true);
          } else {
            this.logger.debug('Coding activity in status bar has been disabled');
            this.showCodingActivity = false;
            if (this.statusBar.text.indexOf('Error') == -1) {
              this.statusBar.text = '$(clock)';
            }
          }
        });
      },
    );
  }

  public openDashboardWebsite(): void {
    let url = 'https://wakatime.com/';
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  public openConfigFile(): void {
    let path = this.options.getConfigFile();
    if (path) {
      let uri = vscode.Uri.file(path);
      vscode.window.showTextDocument(uri);
    }
  }

  public openLogFile(): void {
    let path = this.options.getLogFile();
    if (path) {
      let uri = vscode.Uri.file(path);
      vscode.window.showTextDocument(uri);
    }
  }

  public dispose() {
    this.statusBar.dispose();
    this.disposable.dispose();
    clearTimeout(this.getCodingActivityTimeout);
  }

  private checkApiKey(): void {
    this.hasApiKey(hasApiKey => {
      if (!hasApiKey) this.promptForApiKey();
    });
  }

  private hasApiKey(callback: (arg0: boolean) => void): void {
    this.options
      .getApiKeyAsync()
      .then(apiKey => callback(Utils.validateKey(apiKey) === ''))
      .catch(err => {
        this.logger.error(`Error reading api key: ${err}`);
        callback(false);
      });
  }

  private setStatusBarVisibility(isVisible: boolean): void {
    if (isVisible) {
      this.statusBar.show();
      this.logger.debug('Status bar icon enabled.');
    } else {
      this.statusBar.hide();
      this.logger.debug('Status bar icon disabled.');
    }
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
    if (this.disabled) return;

    let editor = vscode.window.activeTextEditor;
    if (editor) {
      let doc = editor.document;
      if (doc) {
        let file: string = doc.fileName;
        if (file) {
          let time: number = Date.now();
          if (isWrite || this.enoughTimePassed(time) || this.lastFile !== file) {
            this.sendHeartbeat(file, time, editor.selection.start, doc.lineCount, isWrite);
            this.lastFile = file;
            this.lastHeartbeat = time;
          }
        }
      }
    }
  }

  private sendHeartbeat(
    file: string,
    time: number,
    selection: vscode.Position,
    lines: number,
    isWrite: boolean,
  ): void {
    this.hasApiKey(hasApiKey => {
      if (hasApiKey) {
        this._sendHeartbeat(file, time, selection, lines, isWrite);
      } else {
        this.promptForApiKey();
      }
    });
  }

  private _sendHeartbeat(
    file: string,
    time: number,
    selection: vscode.Position,
    lines: number,
    isWrite: boolean,
  ): void {
    if (!this.dependencies.isCliInstalled()) return;

    // prevent sending the same heartbeat (https://github.com/wakatime/vscode-wakatime/issues/163)
    if (isWrite && this.isDuplicateHeartbeat(file, time, selection)) return;

    let user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    let args = ['--entity', Utils.quote(file), '--plugin', Utils.quote(user_agent)];
    args.push('--lineno', String(selection.line + 1));
    args.push('--cursorpos', String(selection.character + 1));
    args.push('--lines-in-file', String(lines));
    let project = this.getProjectName(file);
    if (project) args.push('--alternate-project', Utils.quote(project));
    if (isWrite) args.push('--write');
    if (process.env.WAKATIME_API_KEY) args.push('--key', Utils.quote(process.env.WAKATIME_API_KEY));
    if (Dependencies.isWindows() || Dependencies.isPortable()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile()),
        '--log-file',
        Utils.quote(this.options.getLogFile()),
      );
    }

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(`Sending heartbeat: ${Utils.formatArguments(binary, args)}`);
    const options = this.dependencies.buildOptions();
    let proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });
    proc.on('close', (code, _signal) => {
      if (code == 0) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.statusBar.text = '$(clock)';
          this.getCodingActivity();
        }
        this.logger.debug(`last heartbeat sent ${Utils.formatDate(new Date())}`);
      } else if (code == 102) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.statusBar.text = '$(clock)';
          this.statusBar.tooltip =
            'WakaTime: working offline... coding activity will sync next time we are online';
        }
        this.logger.warn(
          `Api eror (102); Check your ${this.options.getLogFile()} file for more details`,
        );
      } else if (code == 103) {
        let error_msg = `Config parsing error (103); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.statusBar.text = '$(clock) WakaTime Error';
          this.statusBar.tooltip = `WakaTime: ${error_msg}`;
        }
        this.logger.error(error_msg);
      } else if (code == 104) {
        let error_msg = 'Invalid Api Key (104); Make sure your Api Key is correct!';
        if (this.showStatusBar) {
          this.statusBar.text = '$(clock) WakaTime Error';
          this.statusBar.tooltip = `WakaTime: ${error_msg}`;
        }
        this.logger.error(error_msg);
      } else {
        let error_msg = `Unknown Error (${code}); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.statusBar.text = '$(clock) WakaTime Error';
          this.statusBar.tooltip = `WakaTime: ${error_msg}`;
        }
        this.logger.error(error_msg);
      }
    });
  }

  private getCodingActivity(force: boolean = false) {
    if (!this.showCodingActivity || !this.showStatusBar) return;
    const cutoff = Date.now() - this.fetchTodayInterval;
    if (!force && this.lastFetchToday > cutoff) return;

    this.lastFetchToday = Date.now();
    this.getCodingActivityTimeout = setTimeout(this.getCodingActivity, this.fetchTodayInterval);

    this.hasApiKey(hasApiKey => {
      if (!hasApiKey) return;
      this._getCodingActivity();
    });
  }

  private _getCodingActivity() {
    if (!this.dependencies.isCliInstalled()) return;
    let user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    let args = ['--today', '--plugin', Utils.quote(user_agent)];
    if (process.env.WAKATIME_API_KEY) args.push('--key', Utils.quote(process.env.WAKATIME_API_KEY));
    if (Dependencies.isWindows()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile()),
        '--logfile',
        Utils.quote(this.options.getLogFile()),
      );
    }

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(
      `Fetching coding activity for Today from api: ${Utils.formatArguments(binary, args)}`,
    );
    const options = this.dependencies.buildOptions();
    let proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });
    let output = '';
    if (proc.stdout) {
      proc.stdout.on('data', (data: string | null) => {
        if (data) output += data;
      });
    }
    proc.on('close', (code, _signal) => {
      if (code == 0) {
        if (this.showStatusBar && this.showCodingActivity) {
          if (output && output.trim()) {
            this.statusBar.text = `$(clock) ${output.trim()}`;
            this.statusBar.tooltip = 'WakaTime: Today’s coding time. Click to visit dashboard.';
          } else {
            this.statusBar.text = `$(clock)`;
            this.statusBar.tooltip = `WakaTime: Calculating time spent today in background...`;
          }
        }
      } else if (code == 102) {
        // noop, working offline
      } else {
        let error_msg = `Error fetching today coding activity (${code}); Check your ${this.options.getLogFile()} file for more details`;
        this.logger.debug(error_msg);
      }
    });
  }

  private enoughTimePassed(time: number): boolean {
    return this.lastHeartbeat + 120000 < time;
  }

  private isDuplicateHeartbeat(file: string, time: number, selection: vscode.Position): boolean {
    let duplicate = false;
    let minutes = 30;
    let milliseconds = minutes * 60000;
    if (
      this.dedupe[file] &&
      this.dedupe[file].lastHeartbeatAt + milliseconds < time &&
      this.dedupe[file].selection.line == selection.line &&
      this.dedupe[file].selection.character == selection.character
    ) {
      duplicate = true;
    }
    this.dedupe[file] = {
      selection: selection,
      lastHeartbeatAt: time,
    };
    return duplicate;
  }

  private getProjectName(file: string): string {
    let uri = vscode.Uri.file(file);
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (vscode.workspace && workspaceFolder) {
      try {
        return workspaceFolder.name;
      } catch (e) {}
    }
    return '';
  }

}
