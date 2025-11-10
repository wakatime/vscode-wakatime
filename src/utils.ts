import * as vscode from 'vscode';
import { TIME_BETWEEN_HEARTBEATS_MS } from './constants';

export class Utils {
  private static appNames = {
    'Arduino IDE': 'arduino',
    'Azure Data Studio': 'azdata',
    Cursor: 'cursor',
    Onivim: 'onivim',
    'Onivim 2': 'onivim',
    'SQL Operations Studio': 'sqlops',
    Trae: 'trae',
    'Visual Studio Code': 'vscode',
    Windsurf: 'windsurf',
  };

  public static quote(str: string): string {
    if (str.includes(' ')) return `"${str.replace('"', '\\"')}"`;
    return str;
  }

  public static apiKeyInvalid(key?: string): string {
    const err = 'Invalid api key... check https://wakatime.com/api-key for your key';
    if (!key) return err;
    const re = new RegExp(
      '^(waka_)?[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$',
      'i',
    );
    if (!re.test(key)) return err;
    return '';
  }

  public static validateApiUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url.trim();
    return '';
  }

  public static validateProxy(proxy: string): string {
    if (!proxy) return '';
    let re;
    if (proxy.indexOf('\\') === -1) {
      re = new RegExp('^((https?|socks5)://)?([^:@]+(:([^:@])+)?@)?[\\w\\.-]+(:\\d+)?$', 'i');
    } else {
      re = new RegExp('^.*\\\\.+$', 'i');
    }
    if (!re.test(proxy)) {
      const ipv6 = new RegExp(
        '^((https?|socks5)://)?([^:@]+(:([^:@])+)?@)?(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]).){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))(:\\d+)?$',
        'i',
      );
      if (!ipv6.test(proxy)) {
        return 'Invalid proxy. Valid formats are https://user:pass@host:port or socks5://user:pass@host:port or domain\\user:pass';
      }
    }
    return '';
  }

  public static formatDate(date: Date): String {
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
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hour}:${
      minute < 10 ? `0${minute}` : minute
    } ${ampm}`;
  }

  public static obfuscateKey(key: string): string {
    let newKey = '';
    if (key) {
      newKey = key;
      if (key.length > 4)
        newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
    }
    return newKey;
  }

  public static wrapArg(arg: string): string {
    if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
    return arg;
  }

  public static formatArguments(binary: string, args: string[]): string {
    let clone = args.slice(0);
    clone.unshift(this.wrapArg(binary));
    let newCmds: string[] = [];
    let lastCmd = '';
    for (let i = 0; i < clone.length; i++) {
      if (lastCmd == '--key') newCmds.push(this.wrapArg(this.obfuscateKey(clone[i])));
      else newCmds.push(this.wrapArg(clone[i]));
      lastCmd = clone[i];
    }
    return newCmds.join(' ');
  }

  public static isRemoteUri(uri: vscode.Uri): boolean {
    if (!uri) return false;
    return uri.scheme === 'vscode-remote';
  }

  public static apiUrlToDashboardUrl(url: string): string {
    url = url
      .replace('://api.', '://')
      .replace('/api/v1', '')
      .replace(/^api\./, '')
      .replace('/api', '');
    return url;
  }

  public static enoughTimePassed(lastHeartbeat: number, now: number): boolean {
    return lastHeartbeat + TIME_BETWEEN_HEARTBEATS_MS < now;
  }

  public static isPullRequest(uri: vscode.Uri): boolean {
    if (!uri) return false;
    return uri.scheme === 'pr';
  }

  public static isAIChatSidebar(uri: vscode.Uri | undefined): boolean {
    // first check if the active tab is the Claude Code sidebar
    const activeTab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
    const viewType = (activeTab?.input as { viewType?: string } | undefined)?.viewType;
    if (viewType?.includes('claude') && activeTab?.label.toLowerCase().includes('claude')) {
      return true;
    }

    // second, check if the active uri has an AI sidebar scheme
    if (!uri) return false;
    if (uri.fsPath.endsWith('.log')) return false;
    if (uri.scheme === 'vscode-chat-code-block') return true;
    if (uri.scheme === 'openai-codex') return true;
    return false;
  }

  public static isPossibleAICodeInsert(e: vscode.TextDocumentChangeEvent): boolean {
    if (e.document.fileName.endsWith('.log')) return false;
    if (e.contentChanges.length !== 1) return false;

    const text = e.contentChanges?.[0].text.trim();
    if (text.length <= 2) return false;

    // inserted text must be 2+ lines or single line 50+ chars long to qualify as AI
    return (text.match(/[\n\r]/g) || []).length > 2 || text.length > 50;
  }

  public static getFocusedFile(document?: vscode.TextDocument): string | undefined {
    const doc = document ?? vscode.window.activeTextEditor?.document;
    if (doc) {
      const file = doc.fileName;
      if (Utils.isRemoteUri(doc.uri)) {
        return `${doc.uri.authority}${doc.uri.path}`.replace('ssh-remote+', 'ssh://');
        // TODO: how to support 'dev-container', 'attached-container', 'wsl', and 'codespaces' schemes?
      }
      return file;
    }
  }

  public static isPossibleHumanCodeInsert(e: vscode.TextDocumentChangeEvent): boolean {
    if (e.contentChanges.length !== 1) return false;
    if (
      e.contentChanges?.[0].text.trim().length === 1 &&
      e.contentChanges?.[0].text !== '\n' &&
      e.contentChanges?.[0].text !== '\r'
    )
      return true;
    if (e.contentChanges?.[0].text.length === 0) return true;
    return false;
  }

  public static getEditorName(): string {
    if (this.appNames[vscode.env.appName]) {
      return this.appNames[vscode.env.appName];
    } else if (vscode.env.appName.toLowerCase().includes('visual')) {
      return 'vscode';
    } else {
      return vscode.env.appName.replace(/\s/g, '').toLowerCase();
    }
  }

  public static isAICapableEditor(): boolean {
    const editorName = vscode.env.appName.toLowerCase();
    return editorName.includes('cursor') || editorName.includes('windsurf');
  }

  public static hasAIExtensions(): boolean {
    const commonAIExtensions = [
      'anthropic.claude-code',
      'codeium.codeium',
      'continue.continue',
      'github.copilot-chat',
      'github.copilot',
      'ms-vscode.vscode-ai-toolkit',
      'openai.openai-gpt-vscode',
      'openai.chatgpt',
      'sourcegraph.cody-ai',
      'supermaven.supermaven',
      'tabnine.tabnine-vscode',
    ];

    return commonAIExtensions.some((extensionId) => {
      const extension = vscode.extensions.getExtension(extensionId);
      return extension && extension.isActive;
    });
  }

  public static checkAICapabilities(): boolean {
    return this.isAICapableEditor() || this.hasAIExtensions();
  }
}

interface FileSelection {
  selection: vscode.Position;
  lastHeartbeatAt: number;
}

export interface FileSelectionMap {
  [key: string]: FileSelection;
}

export interface Lines {
  [fileName: string]: number;
}

export interface LineCounts {
  ai: Lines;
  human: Lines;
}
