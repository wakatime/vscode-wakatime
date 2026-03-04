import * as fs from 'fs';
import * as vscode from 'vscode';
import * as os from 'os';
import * as child_process from 'child_process';
import { StdioOptions } from 'child_process';
import { AIExtension, COMMON_AI_EXTENSIONS } from './constants';
import { Utils } from './utils';

export class Desktop {
  public static isWindows(): boolean {
    return os.platform() === 'win32';
  }

  public static isPortable(): boolean {
    return !!process.env['VSCODE_PORTABLE'];
  }

  public static getHomeDirectory(): string {
    let home = process.env.WAKATIME_HOME;
    if (home && home.trim() && fs.existsSync(home.trim())) return home.trim();
    if (this.isPortable()) return process.env['VSCODE_PORTABLE'] as string;
    return process.env[this.isWindows() ? 'USERPROFILE' : 'HOME'] || process.cwd();
  }

  public static buildOptions(stdin?: boolean): Object {
    const options: child_process.ExecFileOptions = {
      windowsHide: true,
    };
    if (stdin) {
      (options as any).stdio = ['pipe', 'pipe', 'pipe'] as StdioOptions;
    }
    if (!this.isWindows() && !process.env.WAKATIME_HOME && !process.env.HOME) {
      options['env'] = { ...process.env, WAKATIME_HOME: this.getHomeDirectory() };
    }
    return options;
  }

  public static getInstalledAIAssistantExtensions(): AIExtension[] {
    const installedExtensionIds = new Set(Utils.getInstalledExtensionIds());
    const home = Desktop.getHomeDirectory().replace(/\/$/, '');

    return COMMON_AI_EXTENSIONS.filter((assistant) =>
      assistant.extensionIds.some((id) => {
        if (!installedExtensionIds.has(id.toLowerCase())) return false;
        const extension = vscode.extensions.getExtension(id);
        return extension && extension.isActive;
      }),
    ).map((assistant) => ({
      ...assistant,
      transcriptLogGlobs: assistant.transcriptLogGlobs.map((glob) =>
        glob.replace(/~/g, home).replace(/\$HOME/g, home),
      ),
    }));
  }
}
