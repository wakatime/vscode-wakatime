import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import { StdioOptions } from 'child_process';

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

  public static getConfigFile(): string {
    const wakaHome = process.env.WAKATIME_HOME;
    if (wakaHome) {
      if (!wakaHome.startsWith('~')) return this.joinConfigPath(wakaHome, '.wakatime.cfg');
      if (wakaHome === '~' || wakaHome[1] === '/' || wakaHome[1] === '\\') {
        // go-homedir prefers HOME on Windows, unlike Node's os.homedir().
        const home = this.isWindows()
          ? process.env.HOME ||
            process.env.USERPROFILE ||
            (process.env.HOMEDRIVE && process.env.HOMEPATH
              ? process.env.HOMEDRIVE + process.env.HOMEPATH
              : '')
          : os.homedir();
        if (home) {
          return this.joinConfigPath(this.joinConfigPath(home, wakaHome.slice(1)), '.wakatime.cfg');
        }
      }
    }

    // A rejected WAKATIME_HOME must not be selected again by getHomeDirectory().
    const home = this.isPortable()
      ? (process.env.VSCODE_PORTABLE as string)
      : process.env[this.isWindows() ? 'USERPROFILE' : 'HOME'] || process.cwd();
    const legacy = this.joinConfigPath(home, '.wakatime.cfg');
    if (this.isPortable()) return legacy;

    try {
      fs.statSync(legacy);
      return legacy;
    } catch (err) {
      // Only a missing legacy config permits fallback, matching wakatime-cli.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return legacy;
    }

    const configHome = process.env.XDG_CONFIG_HOME || '';
    return this.joinConfigPath(
      this.isAbsoluteConfigPath(configHome) ? configHome : this.joinConfigPath(home, '.config'),
      'wakatime',
      'wakatime.cfg',
    );
  }

  private static isAbsoluteConfigPath(configHome: string): boolean {
    if (!this.isWindows()) return path.isAbsolute(configHome);

    const windowsPath = configHome.replace(/\//g, '\\');
    const volume = this.windowsVolume(windowsPath);
    return !!volume && (windowsPath.startsWith('\\\\') || windowsPath[volume.length] === '\\');
  }

  private static windowsVolume(windowsPath: string): string {
    if (windowsPath[1] === ':' && windowsPath.charCodeAt(0) < 128) {
      return windowsPath.slice(0, 2);
    }

    // Match Go's volume requirement, including UNC and Windows device paths.
    const doubleSlash = windowsPath.startsWith('\\\\');
    const device = ['\\\\.', '\\\\?', '\\??'].some((prefix) =>
      windowsPath.startsWith(prefix + '\\'),
    );
    const parts = windowsPath.slice(device ? 4 : 2).split('\\');
    const volumeParts = device ? (parts[0].toUpperCase() === 'UNC' ? 3 : 1) : 2;
    if (!(doubleSlash || device) || parts.slice(0, volumeParts).includes('..')) return '';
    return windowsPath.slice(0, (device ? 4 : 2) + parts.slice(0, volumeParts).join('\\').length);
  }

  private static joinConfigPath(...parts: string[]): string {
    if (!this.isWindows()) return path.join(...parts);

    let joined = '';
    for (const part of parts) {
      if (!joined) joined = part;
      else if (/[\\/]$/.test(joined)) {
        const value = part.replace(/^[\\/]+/, '');
        // Do not create a device prefix by joining a root with a literal ?? directory.
        if (joined.length === 1 && /^\?\?(?:[\\/]|$)/.test(value)) joined += '.\\';
        joined += value;
      } else joined += (joined.endsWith(':') ? '' : '\\') + part;
    }

    const windowsPath = joined.replace(/\//g, '\\');
    const volume = this.windowsVolume(windowsPath);
    const rest = windowsPath.slice(volume.length);
    if (!rest && windowsPath.startsWith('\\\\')) return volume;
    // Normalize below Go's volume boundary, so .. cannot remove a device or UNC volume.
    let cleaned = path.win32.normalize('C:' + rest).slice(2);
    // Go Clean drops trailing separators except at a root; Node normalize keeps them.
    if (cleaned.length > 1 && cleaned.endsWith('\\')) cleaned = cleaned.slice(0, -1);
    if (!volume && cleaned !== joined) {
      // Go keeps cleanup from turning relative/rooted paths into drives/devices.
      if (cleaned.split('\\', 1)[0].includes(':')) return '.\\' + cleaned;
      if (cleaned.startsWith('\\??')) return '\\.' + cleaned;
    }
    return volume + cleaned;
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
}
