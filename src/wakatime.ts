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
  private statusBar?: vscode.StatusBarItem = undefined;
  private disposable: vscode.Disposable;
  private lastFile: string;
  private lastHeartbeat: number = 0;
  private dedupe: FileSelectionMap = {};
  private dependencies: Dependencies;
  private options: Options;
  private logger: Logger;
  private fetchTodayInterval: number = 60000;
  private fetchTodayIntervalId?: NodeJS.Timeout;
  private lastFetchToday: number = 0;
  private showStatusBar: boolean;
  private showCodingActivity: boolean;
  private disabled: boolean = true;
  private extensionPath: string;

  constructor(extensionPath: string, logger: Logger) {
    this.extensionPath = extensionPath;
    this.logger = logger;
    this.options = new Options(logger);
  }

  public initialize(): void {
    this.options.getSetting('settings', 'debug', false, (setting: Setting) => {
      if (setting.value === 'true') {
        this.logger.setLevel(LogLevel.DEBUG);
      }
      this.options.getSetting('settings', 'global', false, (setting: Setting) => {
        const global = setting.value === 'true';
        this.dependencies = new Dependencies(this.options, this.logger, this.extensionPath, global);

        let extension = vscode.extensions.getExtension('WakaTime.vscode-wakatime');
        this.extension = (extension != undefined && extension.packageJSON) || { version: '0.0.0' };
        this.agentName = this.appNames[vscode.env.appName] || 'vscode';

        this.options.getSetting('settings', 'disabled', false, (disabled: Setting) => {
          this.disabled = disabled.value === 'true';
          if (this.disabled) {
            this.dispose();
            return;
          }

          this.initializeDependencies();
        });
      });
    });
  }

  public dispose() {
    this.clearTodayInterval();
    this.statusBar?.dispose();
    this.disposable.dispose();
  }

  public initializeDependencies(): void {
    this.logger.debug(`Initializing WakaTime v${this.extension.version}`);

    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
    );
    this.statusBar.command = COMMAND_DASHBOARD;

    this.options.getSetting(
      'settings',
      'status_bar_enabled',
      false,
      (statusBarEnabled: Setting) => {
        this.showStatusBar = statusBarEnabled.value !== 'false';
        this.setStatusBarVisibility(this.showStatusBar);
        this.updateStatusBarText('WakaTime Initializing...');

        this.checkApiKey();

        this.setupEventListeners();

        this.options.getSetting(
          'settings',
          'status_bar_coding_activity',
          false,
          (showCodingActivity: Setting) => {
            this.showCodingActivity = showCodingActivity.value !== 'false';

            this.dependencies.checkAndInstall(() => {
              this.logger.debug('WakaTime initialized');
              this.updateStatusBarText();
              this.updateStatusBarTooltip('WakaTime: Initialized');
              this.getCodingActivity();
            });

          },
        );
      },
    );
  }

  private updateStatusBarText(text?: string): void {
    if (!this.statusBar) return;
    if (!text) this.statusBar.text = '$(clock)';
    this.statusBar.text = '$(clock) ' +  text;
  }

  private updateStatusBarTooltip(tooltipText: string): void {
    if (!this.statusBar) return;
    this.statusBar.tooltip = tooltipText;
  }

  private statusBarShowingError(): boolean {
    if (!this.statusBar) return false;
    return this.statusBar.text.indexOf('Error') != -1;
  }

  public promptForApiKey(): void {
    this.options.getSetting('settings', 'api_key', false, (setting: Setting) => {
      let defaultVal = setting.value;
      if (Utils.apiKeyInvalid(defaultVal)) defaultVal = '';
      let promptOptions = {
        prompt: 'WakaTime Api Key',
        placeHolder: 'Enter your api key from https://wakatime.com/settings',
        value: defaultVal,
        ignoreFocusOut: true,
        validateInput: Utils.apiKeyInvalid.bind(this),
      };
      vscode.window.showInputBox(promptOptions).then((val) => {
        if (val != undefined) {
          let invalid = Utils.apiKeyInvalid(val);
          if (!invalid) this.options.setSetting('settings', 'api_key', val, false);
          else vscode.window.setStatusBarMessage(invalid);
        } else vscode.window.setStatusBarMessage('WakaTime api key not provided');
      });
    });
  }

  public promptForProxy(): void {
    this.options.getSetting('settings', 'proxy', false, (proxy: Setting) => {
      let defaultVal = proxy.value;
      if (!defaultVal) defaultVal = '';
      let promptOptions = {
        prompt: 'WakaTime Proxy',
        placeHolder: `Proxy format is https://user:pass@host:port (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
        validateInput: Utils.validateProxy.bind(this),
      };
      vscode.window.showInputBox(promptOptions).then((val) => {
        if (val || val === '') this.options.setSetting('settings', 'proxy', val, false);
      });
    });
  }

  public promptForDebug(): void {
    this.options.getSetting('settings', 'debug', false, (debug: Setting) => {
      let defaultVal = debug.value;
      if (!defaultVal || defaultVal !== 'true') defaultVal = 'false';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal == null) return;
        this.options.setSetting('settings', 'debug', newVal, false);
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
    this.options.getSetting('settings', 'disabled', false, (setting: Setting) => {
      const previousValue = this.disabled;
      let currentVal = setting.value;
      if (!currentVal || currentVal !== 'true') currentVal = 'false';
      let items: string[] = ['disable', 'enable'];
      const helperText = currentVal === 'true' ? 'disabled' : 'enabled';
      let promptOptions = {
        placeHolder: `disable or enable (extension is currently "${helperText}")`,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal !== 'enable' && newVal !== 'disable') return;
        this.disabled = newVal === 'disable';
        if (this.disabled != previousValue) {
          if (this.disabled) {
            this.options.setSetting('settings', 'disabled', 'true', false);
            this.logger.debug('Extension disabled, will not report code stats to dashboard');
            this.dispose();
          } else {
            this.options.setSetting('settings', 'disabled', 'false', false);
            this.initializeDependencies();
          }
        }
      });
    });
  }

  public promptStatusBarIcon(): void {
    this.options.getSetting('settings', 'status_bar_enabled', false, (setting: Setting) => {
      let defaultVal = setting.value;
      if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal !== 'true' && newVal !== 'false') return;
        this.options.setSetting('settings', 'status_bar_enabled', newVal, false);
        this.showStatusBar = newVal === 'true'; // cache setting to prevent reading from disc too often
        this.setStatusBarVisibility(this.showStatusBar);
      });
    });
  }

  public promptStatusBarCodingActivity(): void {
    this.options.getSetting('settings', 'status_bar_coding_activity', false, (setting: Setting) => {
      let defaultVal = setting.value;
      if (!defaultVal || defaultVal !== 'false') defaultVal = 'true';
      let items: string[] = ['true', 'false'];
      let promptOptions = {
        placeHolder: `true or false (current value \"${defaultVal}\")`,
        value: defaultVal,
        ignoreFocusOut: true,
      };
      vscode.window.showQuickPick(items, promptOptions).then((newVal) => {
        if (newVal !== 'true' && newVal !== 'false') return;
        this.options.setSetting('settings', 'status_bar_coding_activity', newVal, false);
        if (newVal === 'true') {
          this.logger.debug('Coding activity in status bar has been enabled');
          this.showCodingActivity = true;
          this.getCodingActivity();
        } else {
          this.logger.debug('Coding activity in status bar has been disabled');
          this.showCodingActivity = false;
          if (!this.statusBarShowingError()) {
            this.updateStatusBarText();
          }
        }
      });
    });
  }

  public openDashboardWebsite(): void {
    let url = 'https://wakatime.com/';
    vscode.env.openExternal(vscode.Uri.parse(url));
  }

  public openConfigFile(): void {
    let path = this.options.getConfigFile(false);
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

  private checkApiKey(): void {
    this.options.hasApiKey((hasApiKey) => {
      if (!hasApiKey) this.promptForApiKey();
    });
  }

  private setStatusBarVisibility(isVisible: boolean): void {
    if (isVisible) {
      this.setTodayInterval();
      this.statusBar?.show();
      this.logger.debug('Status bar icon enabled.');
    } else {
      this.clearTodayInterval();
      this.statusBar?.hide();
      this.logger.debug('Status bar icon disabled.');
    }
  }

  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    let subscriptions: vscode.Disposable[] = [];
    vscode.window.onDidChangeTextEditorSelection(this.onChange, this, subscriptions);
    vscode.window.onDidChangeActiveTextEditor(this.onChange, this, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, subscriptions);

    // create a combined disposable for all event subscriptions
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
    this.options.getApiKey((apiKey) => {
      if (apiKey) {
        this._sendHeartbeat(apiKey, file, time, selection, lines, isWrite);
      } else {
        this.promptForApiKey();
      }
    });
  }

  private _sendHeartbeat(
    apiKey: string,
    file: string,
    time: number,
    selection: vscode.Position,
    lines: number,
    isWrite: boolean,
  ): void {
    if (!this.dependencies.isCliInstalled()) return;

    // prevent sending the same heartbeat (https://github.com/wakatime/vscode-wakatime/issues/163)
    if (isWrite && this.isDuplicateHeartbeat(file, time, selection)) return;

    let args: string[] = [];

    args.push('--entity', Utils.quote(file));

    let user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    args.push('--plugin', Utils.quote(user_agent));

    args.push('--lineno', String(selection.line + 1));
    args.push('--cursorpos', String(selection.character + 1));
    args.push('--lines-in-file', String(lines));

    let project = this.getProjectName(file);
    if (project) args.push('--alternate-project', Utils.quote(project));

    if (isWrite) args.push('--write');

    args.push('--key', Utils.quote(apiKey));

    if (Dependencies.isWindows() || Dependencies.isPortable()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile(false)),
        '--log-file',
        Utils.quote(this.options.getLogFile()),
      );
    }

    if (Utils.isUnsavedFile(file)) args.push('--is-unsaved-entity')

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
        if (this.showStatusBar) this.getCodingActivity();
        this.logger.debug(`last heartbeat sent ${Utils.formatDate(new Date())}`);
      } else if (code == 102) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.updateStatusBarText();
          this.updateStatusBarTooltip('WakaTime: working offline... coding activity will sync next time we are online');
        }
        this.logger.warn(
          `Api error (102); Check your ${this.options.getLogFile()} file for more details`,
        );
      } else if (code == 103) {
        let error_msg = `Config parsing error (103); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      } else if (code == 104) {
        let error_msg = 'Invalid Api Key (104); Make sure your Api Key is correct!';
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      } else {
        let error_msg = `Unknown Error (${code}); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      }
    });
  }

  private getCodingActivity() {
    if (!this.showStatusBar) {
      this.clearTodayInterval();
      return;
    }

    this.setTodayInterval();

    // prevent updating if we haven't coded since last checked
    if (this.lastFetchToday > 0 && this.lastFetchToday > this.lastHeartbeat) return;

    const cutoff = Date.now() - this.fetchTodayInterval;
    if (this.lastFetchToday > cutoff) return;

    this.lastFetchToday = Date.now();

    this.options.getApiKey((apiKey) => {
      if (!apiKey) return;
      this._getCodingActivity(apiKey);
    });
  }

  private _getCodingActivity(apiKey: string) {
    if (!this.dependencies.isCliInstalled()) return;

    let user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    let args = ['--today', '--plugin', Utils.quote(user_agent)];
    args.push('--key', Utils.quote(apiKey));
    if (Dependencies.isWindows()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile(false)),
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
        if (this.showStatusBar) {
          if (output && output.trim()) {
            if (this.showCodingActivity) {
              this.updateStatusBarText(output.trim());
              this.updateStatusBarTooltip('WakaTime: Today’s coding time. Click to visit dashboard.');
            } else {
              this.updateStatusBarText();
              this.updateStatusBarTooltip(output.trim());
            }
          } else {
            this.updateStatusBarText();
            this.updateStatusBarTooltip('WakaTime: Calculating time spent today in background...');
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

  private setTodayInterval(): void {
    if (this.fetchTodayIntervalId) return;
    this.fetchTodayIntervalId = setInterval(this.getCodingActivity.bind(this), this.fetchTodayInterval);
  }

  private clearTodayInterval(): void {
    if (this.fetchTodayIntervalId) clearInterval(this.fetchTodayIntervalId);
    this.fetchTodayIntervalId = undefined;
  }
}
