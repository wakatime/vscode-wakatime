import * as vscode from 'vscode';

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

export interface FileLineCount {
  lines: number;
  updatedAt: number;
}

export interface LinesInFiles {
  [fileName: string]: FileLineCount;
}

export interface LineCounts {
  ai: Lines;
  human: Lines;
}
