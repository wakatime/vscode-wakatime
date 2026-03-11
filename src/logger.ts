import * as vscode from 'vscode';

import { LogLevel } from './constants';

export class Logger {
  private level: LogLevel;
  private static outputChannel: vscode.OutputChannel | null = null;

  constructor(level: LogLevel) {
    this.setLevel(level);
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  private static getOutputChannel(): vscode.OutputChannel {
    if (!Logger.outputChannel) {
      Logger.outputChannel = vscode.window.createOutputChannel('WakaTime');
    }
    return Logger.outputChannel;
  }

  public log(level: LogLevel, msg: string): void {
    if (level >= this.level) {
      msg = `[WakaTime][${LogLevel[level]}] ${msg}`;
      if (vscode.env.appName === 'Cursor') {
        try {
          Logger.getOutputChannel().appendLine(msg);
        } catch {}
      }
      if (level == LogLevel.DEBUG) console.log(msg);
      if (level == LogLevel.INFO) console.info(msg);
      if (level == LogLevel.WARN) console.warn(msg);
      if (level == LogLevel.ERROR) console.error(msg);
    }
  }

  public debug(msg: string): void {
    this.log(LogLevel.DEBUG, msg);
  }

  public debugException(msg: unknown): void {
    if ((msg as Error).message !== undefined) {
      this.log(LogLevel.DEBUG, (msg as Error).message);
    } else {
      this.log(LogLevel.DEBUG, (msg as Error).toString());
    }
  }

  public info(msg: string): void {
    this.log(LogLevel.INFO, msg);
  }

  public warn(msg: string): void {
    this.log(LogLevel.WARN, msg);
  }

  public warnException(msg: unknown): void {
    if ((msg as Error).message !== undefined) {
      this.log(LogLevel.WARN, (msg as Error).message);
    } else {
      this.log(LogLevel.WARN, (msg as Error).toString());
    }
  }

  public error(msg: string): void {
    this.log(LogLevel.ERROR, msg);
  }

  public errorException(msg: unknown): void {
    if ((msg as Error).message !== undefined) {
      this.log(LogLevel.ERROR, (msg as Error).message);
    } else {
      this.log(LogLevel.ERROR, (msg as Error).toString());
    }
  }
}
