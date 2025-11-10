// import * as azdata from 'azdata';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  AI_RECENT_PASTES_TIME_MS,
  COMMAND_DASHBOARD,
  Heartbeat,
  LogLevel,
  SEND_BUFFER_SECONDS,
} from './constants';
import { Options, Setting } from './options';

import { Dependencies } from './dependencies';
import { Desktop } from './desktop';
import { Logger } from './logger';
import { FileSelectionMap, LineCounts, Lines, Utils } from './utils';

export class WakaTime {
  private agentName: string;
  private extension: any;
  private statusBar?: vscode.StatusBarItem = undefined;
  private statusBarTeamYou?: vscode.StatusBarItem = undefined;
  private statusBarTeamOther?: vscode.StatusBarItem = undefined;
  private disposable: vscode.Disposable;
  private lastFile: string;
  private lastHeartbeat: number = 0;
  private lastDebug: boolean = false;
  private lastCompile: boolean = false;
  private lastAICodeGenerating: boolean = false;
  private dedupe: FileSelectionMap = {};
  private debounceId: any = null;
  private debounceMs = 50;
  private AIDebounceId: any = null;
  private AIdebounceMs = 1000;
  private AIdebounceCount = 0;
  private AIrecentPastes: number[] = [];
  private dependencies: Dependencies;
  private options: Options;
  private logger: Logger;
  private fetchTodayInterval: number = 60000;
  private lastFetchToday: number = 0;
  private showStatusBar: boolean;
  private showCodingActivity: boolean;
  private showStatusBarTeam: boolean;
  private hasTeamFeatures: boolean;
  private disabled: boolean = true;
  private extensionPath: string;
  private isCompiling: boolean = false;
  private isDebugging: boolean = false;
  private isAICodeGenerating: boolean = false;
  private hasAICapabilities: boolean = false;
  private currentlyFocusedFile: string;
  private teamDevsForFileCache = {};
  private resourcesLocation: string;
  private lastApiKeyPrompted: number = 0;
  private isMetricsEnabled: boolean = false;
  private heartbeats: Heartbeat[] = [];
  private lastSent: number = 0;
  private linesInFiles: Lines = {};
  private lineChanges: LineCounts = { ai: {}, human: {} };

  constructor(extensionPath: string, logger: Logger) {
    this.extensionPath = extensionPath;
    this.logger = logger;
    this.setResourcesLocation();
    this.options = new Options(logger, this.resourcesLocation);
  }

  public initialize(): void {
    this.options.getSetting('settings', 'debug', false, (setting: Setting) => {
      if (setting.value === 'true') {
        this.logger.setLevel(LogLevel.DEBUG);
      }
      this.options.getSetting('settings', 'metrics', false, (metrics: Setting) => {
        if (metrics.value === 'true') {
          this.isMetricsEnabled = true;
        }

        this.dependencies = new Dependencies(this.options, this.logger, this.resourcesLocation);

        const extension = vscode.extensions.getExtension('WakaTime.vscode-wakatime');
        this.extension = (extension != undefined && extension.packageJSON) || { version: '0.0.0' };
        this.agentName = Utils.getEditorName();

        this.hasAICapabilities = Utils.checkAICapabilities();

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
    this.sendHeartbeats();
    this.statusBar?.dispose();
    this.statusBarTeamYou?.dispose();
    this.statusBarTeamOther?.dispose();
    this.disposable?.dispose();
  }

  private setResourcesLocation() {
    const home = Desktop.getHomeDirectory();
    const folder = path.join(home, '.wakatime');

    try {
      fs.mkdirSync(folder, { recursive: true });
      this.resourcesLocation = folder;
    } catch (e) {
      this.resourcesLocation = this.extensionPath;
    }
  }

  public initializeDependencies(): void {
    this.logger.debug(`Initializing WakaTime v${this.extension.version}`);

    const align = this.options.getStatusBarAlignment();
    const priority = this.options.getStatusBarPriority();

    this.statusBar = vscode.window.createStatusBarItem(
      'com.wakatime.statusbar',
      align,
      priority + 2,
    );
    this.statusBar.name = 'WakaTime';
    this.statusBar.command = COMMAND_DASHBOARD;

    this.statusBarTeamYou = vscode.window.createStatusBarItem(
      'com.wakatime.teamyou',
      align,
      priority + 1,
    );
    this.statusBarTeamYou.name = 'WakaTime Top dev';

    this.statusBarTeamOther = vscode.window.createStatusBarItem(
      'com.wakatime.teamother',
      align,
      priority,
    );
    this.statusBarTeamOther.name = 'WakaTime Team Total';

    this.options.getSetting('settings', 'status_bar_team', false, (statusBarTeam: Setting) => {
      this.showStatusBarTeam = statusBarTeam.value !== 'false';
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

              this.dependencies.checkAndInstallCli(() => {
                this.logger.debug('WakaTime initialized');
                this.updateStatusBarText();
                this.updateStatusBarTooltip('WakaTime: Initialized');
                this.getCodingActivity();
              });
            },
          );
        },
      );
    });
  }

  private updateStatusBarText(text?: string): void {
    if (!this.statusBar) return;
    if (!text) {
      this.statusBar.text = '$(clock)';
    } else {
      this.statusBar.text = '$(clock) ' + text;
    }
  }

  private updateStatusBarTooltip(tooltipText: string): void {
    if (!this.statusBar) return;
    this.statusBar.tooltip = tooltipText;
  }

  private statusBarShowingError(): boolean {
    if (!this.statusBar) return false;
    return this.statusBar.text.indexOf('Error') != -1;
  }

  private updateTeamStatusBarTextForCurrentUser(text?: string): void {
    if (!this.statusBarTeamYou) return;
    if (!text) {
      this.statusBarTeamYou.text = '';
    } else {
      this.statusBarTeamYou.text = text;
    }
  }

  private updateStatusBarTooltipForCurrentUser(tooltipText: string): void {
    if (!this.statusBarTeamYou) return;
    this.statusBarTeamYou.tooltip = tooltipText;
  }

  private updateTeamStatusBarTextForOther(text?: string): void {
    if (!this.statusBarTeamOther) return;
    if (!text) {
      this.statusBarTeamOther.text = '';
    } else {
      this.statusBarTeamOther.text = text;
      this.statusBarTeamOther.tooltip = 'Developer with the most time spent in this file';
    }
  }

  private updateStatusBarTooltipForOther(tooltipText: string): void {
    if (!this.statusBarTeamOther) return;
    this.statusBarTeamOther.tooltip = tooltipText;
  }

  public async promptForApiKey(hidden: boolean = true): Promise<void> {
    let defaultVal = await this.options.getApiKey();
    if (Utils.apiKeyInvalid(defaultVal ?? undefined)) defaultVal = '';
    const promptOptions = {
      prompt: 'WakaTime Api Key',
      placeHolder: 'Enter your api key from https://wakatime.com/api-key',
      value: defaultVal!,
      ignoreFocusOut: true,
      password: hidden,
      validateInput: Utils.apiKeyInvalid.bind(this),
    };
    vscode.window.showInputBox(promptOptions).then((val) => {
      if (val != undefined) {
        const invalid = Utils.apiKeyInvalid(val);
        if (!invalid) {
          this.options.setSetting('settings', 'api_key', val, false);
        } else vscode.window.setStatusBarMessage(invalid);
      } else vscode.window.setStatusBarMessage('WakaTime api key not provided');
    });
  }

  public async promptForApiUrl(): Promise<void> {
    const apiUrl = await this.options.getApiUrl(true);
    const promptOptions = {
      prompt: 'WakaTime Api Url (Defaults to https://api.wakatime.com/api/v1)',
      placeHolder: 'https://api.wakatime.com/api/v1',
      value: apiUrl,
      ignoreFocusOut: true,
      validateInput: Utils.validateApiUrl.bind(this),
    };
    vscode.window.showInputBox(promptOptions).then((val) => {
      if (val) {
        this.options.setSetting('settings', 'api_url', val, false);
      }
    });
  }

  public promptForProxy(): void {
    this.options.getSetting('settings', 'proxy', false, (proxy: Setting) => {
      let defaultVal = proxy.value;
      if (!defaultVal) defaultVal = '';
      const promptOptions = {
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
      const items: string[] = ['true', 'false'];
      const promptOptions = {
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
      const items: string[] = ['disable', 'enable'];
      const helperText = currentVal === 'true' ? 'disabled' : 'enabled';
      const promptOptions = {
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
      const items: string[] = ['true', 'false'];
      const promptOptions = {
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
      const items: string[] = ['true', 'false'];
      const promptOptions = {
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

  public async openDashboardWebsite(): Promise<void> {
    const apiUrl = await this.options.getApiUrl(true);
    const dashboardUrl = Utils.apiUrlToDashboardUrl(apiUrl);
    vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
  }

  public openConfigFile(): void {
    const path = this.options.getConfigFile(false);
    if (path) {
      const uri = vscode.Uri.file(path);
      vscode.window.showTextDocument(uri);
    }
  }

  public openLogFile(): void {
    const path = this.options.getLogFile();
    if (path) {
      const uri = vscode.Uri.file(path);
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
      this.statusBar?.show();
      this.statusBarTeamYou?.show();
      this.statusBarTeamOther?.show();
      this.logger.debug('Status bar icon enabled.');
    } else {
      this.statusBar?.hide();
      this.statusBarTeamYou?.hide();
      this.statusBarTeamOther?.hide();
      this.logger.debug('Status bar icon disabled.');
    }
  }

  private setupEventListeners(): void {
    // subscribe to selection change and editor activation events
    const subscriptions: vscode.Disposable[] = [];
    vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection, this, subscriptions);
    vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument, this, subscriptions);
    vscode.window.onDidChangeActiveTextEditor(this.onChangeTab, this, subscriptions);
    vscode.window.tabGroups.onDidChangeTabs(this.onDidChangeTabs, this, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.onSave, this, subscriptions);

    vscode.workspace.onDidChangeNotebookDocument(this.onChangeNotebook, this, subscriptions);
    vscode.workspace.onDidSaveNotebookDocument(this.onSaveNotebook, this, subscriptions);

    vscode.tasks.onDidStartTask(this.onDidStartTask, this, subscriptions);
    vscode.tasks.onDidEndTask(this.onDidEndTask, this, subscriptions);

    vscode.debug.onDidChangeActiveDebugSession(this.onDebuggingChanged, this, subscriptions);
    vscode.debug.onDidChangeBreakpoints(this.onDebuggingChanged, this, subscriptions);
    vscode.debug.onDidStartDebugSession(this.onDidStartDebugSession, this, subscriptions);
    vscode.debug.onDidTerminateDebugSession(this.onDidTerminateDebugSession, this, subscriptions);

    // create a combined disposable for all event subscriptions
    this.disposable = vscode.Disposable.from(...subscriptions);
  }

  private onDebuggingChanged(): void {
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidStartDebugSession(): void {
    this.isDebugging = true;
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidTerminateDebugSession(): void {
    this.isDebugging = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidStartTask(e: vscode.TaskStartEvent): void {
    if (e.execution.task.isBackground) return;
    if (e.execution.task.detail && e.execution.task.detail.indexOf('watch') !== -1) return;
    this.isCompiling = true;
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidEndTask(): void {
    this.isCompiling = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onChangeSelection(e: vscode.TextEditorSelectionChangeEvent): void {
    if (e.kind === vscode.TextEditorSelectionChangeKind.Command) return;
    if (Utils.isAIChatSidebar(e.textEditor?.document?.uri)) {
      this.isAICodeGenerating = true;
    }
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
    if (Utils.isAIChatSidebar(e.document?.uri)) {
      this.isAICodeGenerating = true;
      this.AIdebounceCount = 0;
    } else if (Utils.isPossibleAICodeInsert(e)) {
      const now = Date.now();
      if (this.recentlyAIPasted(now) && this.hasAICapabilities) {
        this.isAICodeGenerating = true;
        this.AIdebounceCount = 0;
      }
      this.AIrecentPastes.push(now);
    } else if (Utils.isPossibleHumanCodeInsert(e)) {
      this.AIrecentPastes = [];
      if (this.isAICodeGenerating) {
        this.AIdebounceCount++;
        clearTimeout(this.AIDebounceId);
        this.AIDebounceId = setTimeout(() => {
          if (this.AIdebounceCount > 1) {
            this.isAICodeGenerating = false;
          }
        }, this.AIdebounceMs);
      }
    } else if (this.isAICodeGenerating) {
      this.AIdebounceCount = 0;
      clearTimeout(this.AIDebounceId);
      this.updateLineNumbers();
    }

    if (!this.isAICodeGenerating) return;

    this.onEvent(false);
  }

  private onChangeTab(_e: vscode.TextEditor | undefined): void {
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onDidChangeTabs(): void {
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onSave(_e: vscode.TextDocument | undefined): void {
    this.isAICodeGenerating = false;
    this.updateLineNumbers();
    this.onEvent(true);
  }

  private onChangeNotebook(_e: vscode.NotebookDocumentChangeEvent): void {
    this.updateLineNumbers();
    this.onEvent(false);
  }

  private onSaveNotebook(_e: vscode.NotebookDocument | undefined): void {
    this.updateLineNumbers();
    this.onEvent(true);
  }

  private updateLineNumbers(): void {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc) return;
    const file = Utils.getFocusedFile(doc);
    if (!file) return;

    const current = doc.lineCount;
    if (this.linesInFiles[file] === undefined) {
      this.linesInFiles[file] = current;
    }

    const prev = this.linesInFiles[file] ?? current;
    const delta = current - prev;

    const changes = this.isAICodeGenerating ? this.lineChanges.ai : this.lineChanges.human;
    changes[file] = (changes[file] ?? 0) + delta;

    this.linesInFiles[file] = current;
  }

  private onEvent(isWrite: boolean): void {
    if (Date.now() - this.lastSent > SEND_BUFFER_SECONDS * 1000) {
      this.sendHeartbeats();
    }

    clearTimeout(this.debounceId);
    this.debounceId = setTimeout(() => {
      if (this.disabled) return;
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const doc = editor.document;
        if (doc) {
          const file = Utils.getFocusedFile(doc);
          if (!file) {
            return;
          }
          if (this.currentlyFocusedFile !== file) {
            this.updateTeamStatusBarFromJson();
            this.updateTeamStatusBar(doc);
          }

          const time: number = Date.now();
          if (
            isWrite ||
            Utils.enoughTimePassed(this.lastHeartbeat, time) ||
            this.lastFile !== file ||
            this.lastDebug !== this.isDebugging ||
            this.lastCompile !== this.isCompiling ||
            this.lastAICodeGenerating !== this.isAICodeGenerating
          ) {
            this.appendHeartbeat(
              doc,
              time,
              editor.selection.start,
              isWrite,
              this.isCompiling,
              this.isDebugging,
              this.isAICodeGenerating,
            );
            this.lastFile = file;
            this.lastHeartbeat = time;
            this.lastDebug = this.isDebugging;
            this.lastCompile = this.isCompiling;
            this.lastAICodeGenerating = this.isAICodeGenerating;
          }
        }
      }
    }, this.debounceMs);
  }

  private async appendHeartbeat(
    doc: vscode.TextDocument,
    time: number,
    selection: vscode.Position,
    isWrite: boolean,
    isCompiling: boolean,
    isDebugging: boolean,
    isAICoding: boolean,
  ): Promise<void> {
    if (!this.dependencies.isCliInstalled()) return;

    const file = Utils.getFocusedFile(doc);
    if (!file) return;

    // prevent sending the same heartbeat (https://github.com/wakatime/vscode-wakatime/issues/163)
    if (isWrite && this.isDuplicateHeartbeat(file, time, selection)) return;

    const now = Date.now();

    const heartbeat: Heartbeat = {
      entity: file,
      time: now / 1000,
      is_write: isWrite,
      lineno: selection.line + 1,
      cursorpos: selection.character + 1,
      lines_in_file: doc.lineCount,
      ai_line_changes: this.lineChanges.ai[file],
      human_line_changes: this.lineChanges.human[file],
    };

    this.lineChanges = { ai: {}, human: {} };

    if (isDebugging) {
      heartbeat.category = 'debugging';
    } else if (isCompiling) {
      heartbeat.category = 'building';
    } else if (isAICoding) {
      heartbeat.category = 'ai coding';
    } else if (Utils.isPullRequest(doc.uri)) {
      heartbeat.category = 'code reviewing';
    }

    const project = this.getProjectName(doc.uri);
    if (project) heartbeat.alternate_project = project;

    const folder = this.getProjectFolder(doc.uri);
    if (folder) heartbeat.project_folder = folder;

    if (doc.isUntitled) heartbeat.is_unsaved_entity = true;

    this.logger.debug(`Appending heartbeat to local buffer: ${JSON.stringify(heartbeat, null, 2)}`);
    this.heartbeats.push(heartbeat);

    if (now - this.lastSent > SEND_BUFFER_SECONDS * 1000) {
      await this.sendHeartbeats();
    }
  }

  private async sendHeartbeats(): Promise<void> {
    const apiKey = await this.options.getApiKey();
    if (apiKey) {
      await this._sendHeartbeats();
    } else {
      await this.promptForApiKey();
    }
  }

  private async _sendHeartbeats(): Promise<void> {
    if (!this.dependencies.isCliInstalled()) return;

    const heartbeat = this.heartbeats.shift();
    if (!heartbeat) return;

    this.lastSent = Date.now();

    const args: string[] = [];

    args.push('--entity', Utils.quote(heartbeat.entity));

    args.push('--time', String(heartbeat.time));

    const user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    args.push('--plugin', Utils.quote(user_agent));

    args.push('--lineno', String(heartbeat.lineno));
    args.push('--cursorpos', String(heartbeat.cursorpos));
    args.push('--lines-in-file', String(heartbeat.lines_in_file));
    if (heartbeat.category) {
      args.push('--category', heartbeat.category);
    }

    if (heartbeat.ai_line_changes) {
      args.push('--ai-line-changes', String(heartbeat.ai_line_changes));
    }
    if (heartbeat.human_line_changes) {
      args.push('--human-line-changes', String(heartbeat.human_line_changes));
    }

    if (this.isMetricsEnabled) args.push('--metrics');

    const apiKey = await this.options.getApiKey();
    if (!Utils.apiKeyInvalid(apiKey)) args.push('--key', Utils.quote(apiKey));

    const apiUrl = await this.options.getApiUrl();
    if (apiUrl) args.push('--api-url', Utils.quote(apiUrl));

    if (heartbeat.alternate_project) {
      args.push('--alternate-project', Utils.quote(heartbeat.alternate_project));
    }

    if (heartbeat.project_folder) {
      args.push('--project-folder', Utils.quote(heartbeat.project_folder));
    }

    if (heartbeat.is_write) args.push('--write');

    if (Desktop.isWindows() || Desktop.isPortable()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile(false)),
        '--log-file',
        Utils.quote(this.options.getLogFile()),
      );
    }

    if (heartbeat.is_unsaved_entity) args.push('--is-unsaved-entity');

    const extraHeartbeats = this.getExtraHeartbeats();
    if (extraHeartbeats.length > 0) args.push('--extra-heartbeats');

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(`Sending heartbeat: ${Utils.formatArguments(binary, args)}`);
    const options = Desktop.buildOptions(extraHeartbeats.length > 0);
    const proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
      if (error != null) {
        if (stderr && stderr.toString() != '') this.logger.error(stderr.toString());
        if (stdout && stdout.toString() != '') this.logger.error(stdout.toString());
        this.logger.error(error.toString());
      }
    });

    // send any extra heartbeats
    if (proc.stdin) {
      proc.stdin.write(JSON.stringify(extraHeartbeats));
      proc.stdin.write('\n');
      proc.stdin.end();
    } else if (extraHeartbeats.length > 0) {
      this.logger.error('Unable to set stdio[0] to pipe');
      this.heartbeats.push(...extraHeartbeats);
    }

    proc.on('close', async (code, _signal) => {
      if (code == 0) {
        if (this.showStatusBar) this.getCodingActivity();
      } else if (code == 102 || code == 112) {
        if (this.showStatusBar) {
          if (!this.showCodingActivity) this.updateStatusBarText();
          this.updateStatusBarTooltip(
            'WakaTime: working offline... coding activity will sync next time we are online',
          );
        }
        this.logger.warn(
          `Working offline (${code}); Check your ${this.options.getLogFile()} file for more details`,
        );
      } else if (code == 103) {
        const error_msg = `Config parsing error (103); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      } else if (code == 104) {
        const error_msg = 'Invalid Api Key (104); Make sure your Api Key is correct!';
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
        const now: number = Date.now();
        if (this.lastApiKeyPrompted < now - 86400000) {
          // only prompt once per day
          await this.promptForApiKey(false);
          this.lastApiKeyPrompted = now;
        }
      } else {
        const error_msg = `Unknown Error (${code}); Check your ${this.options.getLogFile()} file for more details`;
        if (this.showStatusBar) {
          this.updateStatusBarText('WakaTime Error');
          this.updateStatusBarTooltip(`WakaTime: ${error_msg}`);
        }
        this.logger.error(error_msg);
      }
    });
  }

  private getExtraHeartbeats() {
    const heartbeats: Heartbeat[] = [];
    while (true) {
      const h = this.heartbeats.shift();
      if (!h) return heartbeats;
      heartbeats.push(h);
    }
  }

  private async getCodingActivity() {
    if (!this.showStatusBar) return;

    const cutoff = Date.now() - this.fetchTodayInterval;
    if (this.lastFetchToday > cutoff) return;

    this.lastFetchToday = Date.now();

    const apiKey = await this.options.getApiKey();
    if (!apiKey) return;

    await this._getCodingActivity();
  }

  private async _getCodingActivity() {
    if (!this.dependencies.isCliInstalled()) return;

    const user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    const args = ['--today', '--output', 'json', '--plugin', Utils.quote(user_agent)];

    if (this.isMetricsEnabled) args.push('--metrics');

    const apiKey = await this.options.getApiKey();
    if (!Utils.apiKeyInvalid(apiKey)) args.push('--key', Utils.quote(apiKey));

    const apiUrl = await this.options.getApiUrl();
    if (apiUrl) args.push('--api-url', Utils.quote(apiUrl));

    if (Desktop.isWindows()) {
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
    const options = Desktop.buildOptions();

    try {
      const proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
        if (error != null) {
          if (stderr && stderr.toString() != '') this.logger.debug(stderr.toString());
          if (stdout && stdout.toString() != '') this.logger.debug(stdout.toString());
          this.logger.debug(error.toString());
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
            if (output) {
              let jsonData: any;
              try {
                jsonData = JSON.parse(output);
              } catch (e) {
                this.logger.debug(
                  `Error parsing today coding activity as json:\n${output}\nCheck your ${this.options.getLogFile()} file for more details.`,
                );
              }
              if (jsonData) this.hasTeamFeatures = jsonData?.has_team_features;
              if (jsonData?.text) {
                if (this.showCodingActivity) {
                  this.updateStatusBarText(jsonData.text.trim());
                  this.updateStatusBarTooltip(
                    'WakaTime: Today’s coding time. Click to visit dashboard.',
                  );
                } else {
                  this.updateStatusBarText();
                  this.updateStatusBarTooltip(jsonData.text.trim());
                }
              } else {
                this.updateStatusBarText();
                this.updateStatusBarTooltip(
                  'WakaTime: Calculating time spent today in background...',
                );
              }
              this.updateTeamStatusBar();
            } else {
              this.updateStatusBarText();
              this.updateStatusBarTooltip(
                'WakaTime: Calculating time spent today in background...',
              );
            }
          }
        } else if (code == 102 || code == 112) {
          // noop, working offline
        } else {
          this.logger.debug(
            `Error fetching today coding activity (${code}); Check your ${this.options.getLogFile()} file for more details.`,
          );
        }
      });
    } catch (e) {
      this.logger.debugException(e);
    }
  }

  private async updateTeamStatusBar(doc?: vscode.TextDocument) {
    if (!this.showStatusBarTeam) return;
    if (!this.hasTeamFeatures) return;
    if (!this.dependencies.isCliInstalled()) return;

    if (!doc) {
      doc = vscode.window.activeTextEditor?.document;
      if (!doc) return;
    }

    const file = Utils.getFocusedFile(doc);
    if (!file) {
      return;
    }

    this.currentlyFocusedFile = file;

    // TODO: expire cached text after some hours
    if (this.teamDevsForFileCache[file]) {
      this.updateTeamStatusBarFromJson(this.teamDevsForFileCache[file]);
      return;
    }

    const user_agent =
      this.agentName + '/' + vscode.version + ' vscode-wakatime/' + this.extension.version;
    const args = ['--output', 'json', '--plugin', Utils.quote(user_agent)];

    args.push('--file-experts', Utils.quote(file));

    args.push('--entity', Utils.quote(file));

    if (this.isMetricsEnabled) args.push('--metrics');

    const apiKey = await this.options.getApiKey();
    if (!Utils.apiKeyInvalid(apiKey)) args.push('--key', Utils.quote(apiKey));

    const apiUrl = await this.options.getApiUrl();
    if (apiUrl) args.push('--api-url', Utils.quote(apiUrl));

    const project = this.getProjectName(doc.uri);
    if (project) args.push('--alternate-project', Utils.quote(project));

    const folder = this.getProjectFolder(doc.uri);
    if (folder) args.push('--project-folder', Utils.quote(folder));

    if (Desktop.isWindows()) {
      args.push(
        '--config',
        Utils.quote(this.options.getConfigFile(false)),
        '--logfile',
        Utils.quote(this.options.getLogFile()),
      );
    }

    if (doc.isUntitled) args.push('--is-unsaved-entity');

    const binary = this.dependencies.getCliLocation();
    this.logger.debug(`Fetching devs for file from api: ${Utils.formatArguments(binary, args)}`);
    const options = Desktop.buildOptions();

    try {
      const proc = child_process.execFile(binary, args, options, (error, stdout, stderr) => {
        if (error != null) {
          if (stderr && stderr.toString() != '') this.logger.debug(stderr.toString());
          if (stdout && stdout.toString() != '') this.logger.debug(stdout.toString());
          this.logger.debug(error.toString());
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
          if (output && output.trim()) {
            let jsonData;
            try {
              jsonData = JSON.parse(output);
            } catch (e) {
              this.logger.debug(
                `Error parsing devs for file as json:\n${output}\nCheck your ${this.options.getLogFile()} file for more details.`,
              );
            }

            if (jsonData) this.teamDevsForFileCache[file!] = jsonData;

            // make sure this file is still the currently focused file
            if (file !== this.currentlyFocusedFile) {
              return;
            }

            this.updateTeamStatusBarFromJson(jsonData);
          } else {
            this.updateTeamStatusBarTextForCurrentUser();
            this.updateTeamStatusBarTextForOther();
          }
        } else if (code == 102 || code == 112) {
          // noop, working offline
        } else {
          this.logger.debug(
            `Error fetching devs for file (${code}); Check your ${this.options.getLogFile()} file for more details.`,
          );
        }
      });
    } catch (e) {
      this.logger.debugException(e);
    }
  }

  private updateTeamStatusBarFromJson(jsonData?: any) {
    if (!jsonData) {
      this.updateTeamStatusBarTextForCurrentUser();
      this.updateTeamStatusBarTextForOther();
      return;
    }

    const you = jsonData.you;
    const other = jsonData.other;

    if (you) {
      this.updateTeamStatusBarTextForCurrentUser('You: ' + you.total.text);
      this.updateStatusBarTooltipForCurrentUser('Your total time spent in this file');
    } else {
      this.updateTeamStatusBarTextForCurrentUser();
    }
    if (other) {
      this.updateTeamStatusBarTextForOther(other.user.name + ': ' + other.total.text);
      this.updateStatusBarTooltipForOther(
        other.user.long_name + '’s total time spent in this file',
      );
    } else {
      this.updateTeamStatusBarTextForOther();
    }
  }

  private recentlyAIPasted(time: number): boolean {
    this.AIrecentPastes = this.AIrecentPastes.filter((x) => x + AI_RECENT_PASTES_TIME_MS >= time);
    return this.AIrecentPastes.length > 3;
  }

  private isDuplicateHeartbeat(file: string, time: number, selection: vscode.Position): boolean {
    let duplicate = false;
    const minutes = 30;
    const milliseconds = minutes * 60000;
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

  private getProjectName(uri: vscode.Uri): string {
    if (!vscode.workspace) return '';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      try {
        return workspaceFolder.name;
      } catch (e) {}
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) {
      return vscode.workspace.workspaceFolders[0].name;
    }
    return vscode.workspace.name || '';
  }

  private getProjectFolder(uri: vscode.Uri): string {
    if (!vscode.workspace) return '';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      try {
        return workspaceFolder.uri.fsPath;
      } catch (e) {}
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length) {
      return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }
    return '';
  }
}
