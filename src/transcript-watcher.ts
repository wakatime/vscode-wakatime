import * as fs from 'fs';
import * as fsAsync from 'fs/promises';
import * as path from 'path';

import {
  CursorRow,
  ParsedGlob,
  SqlJsInit,
  SqlJsModule,
  TRANSCRIPT_POLL_INTERVAL,
  TrackedFile,
  TranscriptHeartbeat,
} from './constants';

import { Desktop } from './desktop';
import { Logger } from './logger';

export class TranscriptWatcher {
  private globs: ParsedGlob[] = [];
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activityCallback: ((aiName: string, entities: TranscriptHeartbeat[]) => void) | null =
    null;
  private anyActivityCallback: ((timestampMs: number) => void) | null = null;
  private logger: Logger;
  private pollIntervalMs: number;
  private initializedAt: number;
  private sqlJsPromise: Promise<SqlJsModule | null> | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
    this.pollIntervalMs = TRANSCRIPT_POLL_INTERVAL * 1000;
    this.initializedAt = Date.now();

    const aiExtensions = Desktop.getAIExtensionsWithTranscriptLogs();
    if (aiExtensions.length === 0) return;

    for (const ext of aiExtensions) {
      for (const glob of ext.transcriptLogGlobs) {
        const parsed = this.parseGlob(glob, ext.name);
        if (parsed) {
          this.globs.push(parsed);
        }
      }
    }

    this.logger.debug(
      `AI Transcript watcher initialized for ${aiExtensions.map((e) => e.name).join(', ')}`,
    );
  }

  public onAICodingActivityHandler(
    callback: (aiName: string, entities: TranscriptHeartbeat[]) => void,
  ): void {
    this.activityCallback = callback;
  }

  public onAnyActivityHandler(callback: (timestampMs: number) => void): void {
    this.anyActivityCallback = callback;
  }

  public start(): void {
    if (this.globs.length === 0) return;
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
    this.logger.debug('AI Transcript watcher started');
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.debug('AI Transcript watcher stopped');
    }
  }

  public async poll(): Promise<boolean> {
    this.logger.debug('Polling for AI transcript log changes...');
    let found = false;
    for (const glob of this.globs) {
      try {
        if (!fs.existsSync(glob.baseDir)) continue;
        const files = this.findFiles(glob, glob.baseDir, '', glob.filePattern, 0, 10);
        for (const file of files) {
          if (await this.processJSONLogFile(file, glob.aiName)) {
            found = true;
          }
          if (await this.processSQLiteFile(file, glob.aiName)) {
            found = true;
          }
        }
      } catch {
        // directory may not exist or not be readable
      }
    }
    return found;
  }

  private async getSqlJs(): Promise<SqlJsModule | null> {
    if (!this.sqlJsPromise) {
      try {
        const requireFunc = eval('require') as NodeRequire;
        const initSqlJs = requireFunc('sql.js') as SqlJsInit;
        const wasmPath = requireFunc.resolve('sql.js/dist/sql-wasm.wasm');
        this.sqlJsPromise = fsAsync
          .readFile(wasmPath)
          .then((wasmBinary) => initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }));
      } catch (e) {
        this.logger.warn('sql.js not available; SQLite transcript logs will be skipped.');
        this.logger.debugException(e);
        this.sqlJsPromise = Promise.resolve(null);
      }
    }

    return this.sqlJsPromise;
  }

  private async processJSONLogFile(filePath: string, aiName: string): Promise<boolean> {
    try {
      if (!filePath.endsWith('.jsonl')) return false;

      const stat = await fsAsync.stat(filePath);

      const tracked = this.trackedFiles.get(filePath);
      let cutoff = tracked?.lastReadTime ?? this.initializedAt;

      // Only read transcripts modified since we last read them
      if (Math.max(stat.mtimeMs, stat.birthtimeMs) < cutoff) return false;

      let lastOffset = tracked?.lastReadOffset ?? 0;
      if (stat.size < lastOffset) lastOffset = 0;
      if (stat.size == lastOffset) return false;

      this.logger.debug(`Found new ${aiName} AI changes in: ${filePath}`);

      const now = Date.now();

      const fd = fs.openSync(filePath, 'r');
      try {
        const buffer = Buffer.alloc(stat.size - lastOffset);
        fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
        const content = buffer.toString('utf-8');
        this.anyActivityCallback?.(now);

        const cliLastHeartbeatAt =
          aiName == 'claude' ? this.readCliStateLastHeartbeatAt(filePath) : undefined;
        if (cliLastHeartbeatAt && cliLastHeartbeatAt * 1000 > cutoff) {
          cutoff = cliLastHeartbeatAt * 1000;
        }
        if (aiName == 'claude') {
          this.writeCliStateLastHeartbeatAt(filePath, now);
        }

        const { heartbeats, projectFolder } = this.parseContent(
          aiName,
          content,
          cutoff,
          tracked?.projectFolder,
          Math.max(stat.mtimeMs, stat.birthtimeMs),
        );

        this.trackedFiles.set(filePath, {
          aiName,
          lastReadOffset: stat.size,
          lastReadTime: now,
          projectFolder: projectFolder ?? tracked?.projectFolder,
        });

        if (heartbeats.length > 0 && this.activityCallback) {
          this.activityCallback(aiName, heartbeats);
          return true;
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      this.logger.warn(`Error processing transcript: ${filePath}`);
      this.logger.warnException(e);
    }
    return false;
  }

  private async processSQLiteFile(filePath: string, aiName: string): Promise<boolean> {
    try {
      if (!filePath.endsWith('.vscdb')) return false;

      const stat = await fsAsync.stat(filePath);

      const tracked = this.trackedFiles.get(filePath);
      let cutoff = tracked?.lastReadTime ?? this.initializedAt;

      // Only read transcripts modified since we last read them
      if (Math.max(stat.mtimeMs, stat.birthtimeMs) < cutoff) return false;

      const now = Date.now();

      const heartbeats = await this.querySQLiteFile(
        filePath,
        cutoff,
        Math.max(stat.mtimeMs, stat.birthtimeMs),
      );
      this.logger.debug(`Read ${heartbeats.length} transcript heartbeats from ${filePath}`);

      if (heartbeats.length > 0 && this.activityCallback) {
        this.trackedFiles.set(filePath, {
          aiName,
          lastReadOffset: stat.size,
          lastReadTime: now,
          projectFolder: tracked?.projectFolder,
        });

        this.activityCallback(aiName, heartbeats);
        return true;
      }
    } catch (e) {
      this.logger.debug(`Error processing transcript: ${filePath}`);
      this.logger.debugException(e);
      console.error(e);
    }
    return false;
  }

  private async querySQLiteFile(
    filePath: string,
    cutoff: number,
    fallbackTimestamp?: number,
  ): Promise<TranscriptHeartbeat[]> {
    const SQL = await this.getSqlJs();
    if (!SQL) return [];
    const db = new SQL.Database(new Uint8Array(await fsAsync.readFile(filePath)));

    try {
      const results = db.exec("SELECT value FROM cursorDiskKV WHERE key like 'bubbleId:%'");
      if (results.length === 0) return [];

      return results[0].values
        .map((row) => row[0])
        .filter((value): value is string => typeof value === 'string')
        .map((row) => {
          try {
            return JSON.parse(row);
          } catch (_e) {}
        })
        .filter((entry) => typeof entry === 'object')
        .filter((entry: CursorRow) => entry.toolFormerData?.name?.startsWith('edit_file_'))
        .map((entry: CursorRow) => {
          const params = JSON.parse(entry.toolFormerData?.params ?? '') as
            | {
                relativeWorkspacePath?: string;
                streamingContent?: string;
              }
            | undefined;
          if (!params?.relativeWorkspacePath || !params?.streamingContent) return;
          if (!entry.createdAt) return;
          const ts = new Date(entry.createdAt ?? fallbackTimestamp);
          if (ts.getTime() < cutoff) return;
          return {
            time: ts.getTime() / 1000,
            filePath: params.relativeWorkspacePath,
            lineChanges: this.lineChangesFromDiff(params.streamingContent),
          };
        })
        .filter(Boolean)
        .filter((hb) => !!hb?.filePath) as TranscriptHeartbeat[];
    } finally {
      db.close();
    }
  }

  private readCliStateLastHeartbeatAt(transcriptPath: string): number | undefined {
    const stateFile = transcriptPath + '.wakatime';
    try {
      if (!fs.existsSync(stateFile)) return undefined;
      const raw = fs.readFileSync(stateFile, 'utf-8');
      const state = JSON.parse(raw);
      if (typeof state.lastHeartbeatAt === 'number') return state.lastHeartbeatAt;
    } catch (e) {
      this.logger.debug(`Claude state file unreadable: ${stateFile}`);
      this.logger.debugException(e);
    }
    return undefined;
  }

  private writeCliStateLastHeartbeatAt(transcriptPath: string, now: number): void {
    const stateFile = transcriptPath + '.wakatime';
    try {
      fs.writeFileSync(stateFile, JSON.stringify({ lastHeartbeatAt: now / 1000 }, null, 2));
    } catch (e) {
      this.logger.debug(`Claude state file unwritable: ${stateFile}`);
      this.logger.debugException(e);
    }
  }

  private parseContent(
    aiName: string,
    content: string,
    cutoff: number,
    currentProjectFolder?: string,
    fallbackTimestamp?: number,
  ): { heartbeats: TranscriptHeartbeat[]; projectFolder?: string } {
    const entityMap = new Map<string, { lineChanges: number; timestamp: Date }>();
    let projectFolder = currentProjectFolder;

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        // Extract cwd from session metadata
        if (entry.cwd && typeof entry.cwd === 'string') {
          projectFolder = entry.cwd;
        }

        if (!entry.timestamp) continue;
        const ts = new Date(entry.timestamp ?? fallbackTimestamp);
        if (ts.getTime() < cutoff) continue;

        const results = this.extractFileEntity(aiName, entry);
        if (results) {
          for (const result of results) {
            const filePath =
              path.isAbsolute(result.filePath) || !projectFolder
                ? result.filePath
                : path.resolve(projectFolder, result.filePath);
            const prev = entityMap.get(filePath);
            entityMap.set(filePath, {
              lineChanges: (prev?.lineChanges ?? 0) + result.lineChanges,
              timestamp: ts,
            });
          }
        }
      } catch (e) {
        this.logger.debugException(e);
      }
    }

    const heartbeats: TranscriptHeartbeat[] = [];
    for (const [filePath, data] of entityMap) {
      heartbeats.push({
        filePath,
        lineChanges: data.lineChanges,
        time: data.timestamp.getTime() / 1000,
        projectFolder,
      });
    }
    return { heartbeats, projectFolder };
  }

  private extractFileEntity(
    _aiName: string,
    entry: any,
  ): { filePath: string; lineChanges: number }[] | null {
    if (entry.toolUseResult?.filePath) {
      const result = this.parseClaudeToolResult(entry.toolUseResult);
      return result ? [result] : null;
    }

    if (entry.payload?.name === 'apply_patch' && typeof entry.payload?.input === 'string') {
      return this.parseCodexPatch(entry.payload.input);
    }

    // Generic format: look for tool_result, result, output with file paths
    const genericResult = (entry.tool_result ?? entry.result ?? entry.output) as {
      file_path?: string;
      filePath?: string;
      path?: string;
    };
    if (genericResult) {
      const fp = genericResult.file_path ?? genericResult.filePath ?? genericResult.path;
      if (fp && typeof fp === 'string') {
        return [{ filePath: fp, lineChanges: this.extractGenericLineChanges(genericResult) }];
      }
    }

    return null;
  }

  private parseCodexPatch(input: string): { filePath: string; lineChanges: number }[] | null {
    const results: { filePath: string; lineChanges: number }[] = [];
    let currentFile: string | null = null;
    let additions = 0;
    let deletions = 0;

    for (const line of input.split('\n')) {
      const updateMatch = line.match(/^\*\*\* (?:Update|Add) File:\s*(.+)/);
      if (updateMatch) {
        if (currentFile) {
          results.push({ filePath: currentFile, lineChanges: additions - deletions });
        }
        currentFile = updateMatch[1].trim();
        additions = 0;
        deletions = 0;
        continue;
      }

      const deleteMatch = line.match(/^\*\*\* Delete File:\s*(.+)/);
      if (deleteMatch) {
        if (currentFile) {
          results.push({ filePath: currentFile, lineChanges: additions - deletions });
        }
        currentFile = deleteMatch[1].trim();
        additions = 0;
        deletions = 0;
        continue;
      }

      if (line.startsWith('*** ') || line.startsWith('@@')) continue;

      if (currentFile) {
        if (line.startsWith('+')) additions++;
        else if (line.startsWith('-')) deletions++;
      }
    }

    if (currentFile) {
      results.push({ filePath: currentFile, lineChanges: additions - deletions });
    }

    return results.length > 0 ? results : null;
  }

  private parseClaudeToolResult(toolResult: any): { filePath: string; lineChanges: number } | null {
    const filePath = toolResult.filePath;
    if (!filePath || typeof filePath !== 'string') return null;

    // Structured patches: sum of (newLines - oldLines)
    const patches = toolResult.structuredPatch;
    if (Array.isArray(patches) && patches.length > 0) {
      const lineChanges = patches.reduce(
        (sum: number, p: any) => sum + ((p.newLines ?? 0) - (p.oldLines ?? 0)),
        0,
      );
      return { filePath, lineChanges };
    }

    // New file: content without originalFile
    if (toolResult.content && !toolResult.originalFile) {
      const lineChanges = toolResult.content.split('\n').length;
      return { filePath, lineChanges };
    }

    return null;
  }

  private extractGenericLineChanges(result: any): number {
    if (Array.isArray(result.structuredPatch) && result.structuredPatch.length > 0) {
      return result.structuredPatch.reduce(
        (sum: number, p: any) => sum + ((p.newLines ?? 0) - (p.oldLines ?? 0)),
        0,
      );
    }
    if (result.content && typeof result.content === 'string' && !result.originalFile) {
      return result.content.split('\n').length;
    }
    if (result.diff && typeof result.diff === 'string') {
      return this.lineChangesFromDiff(result.diff);
    }
    return 0;
  }

  private lineChangesFromDiff(diff: string): number {
    const lines = diff.split('\n');
    return (
      lines.filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length -
      lines.filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length
    );
  }

  private parseGlob(glob: string, aiName: string): ParsedGlob | null {
    const parts = glob.split('/');
    const baseParts: string[] = [];
    const patternParts: string[] = [];
    let inPattern = false;

    for (const part of parts) {
      if (inPattern || part.includes('*') || part.includes('?')) {
        inPattern = true;
        patternParts.push(part);
      } else {
        baseParts.push(part);
      }
    }

    if (baseParts.length === 0 && patternParts.length === 0) return null;

    const baseDir = baseParts.join(path.sep);
    const filePattern = this.globToRegex(patternParts.join('/'));
    return { aiName, baseDir, filePattern, isLiteral: patternParts.length == 0 };
  }

  private findFiles(
    glob: ParsedGlob,
    baseDir: string,
    relPath: string,
    pattern: RegExp,
    depth: number,
    maxDepth: number,
  ): string[] {
    if (depth > maxDepth) return [];
    if (depth === 0 && glob.isLiteral) {
      if (fs.existsSync(baseDir)) return [baseDir];
      return [];
    }
    const results: string[] = [];
    const fullPath = relPath ? path.join(baseDir, relPath) : baseDir;

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryRel = relPath ? relPath + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
          results.push(...this.findFiles(glob, baseDir, entryRel, pattern, depth + 1, maxDepth));
        } else if (entry.isFile() && pattern.test(entryRel)) {
          results.push(path.join(baseDir, entryRel));
        }
      }
    } catch {
      // not readable
    }

    return results;
  }

  private globToRegex(glob: string): RegExp {
    let regex = '^';
    let i = 0;
    while (i < glob.length) {
      const c = glob[i];
      if (c === '*' && glob[i + 1] === '*') {
        regex += glob[i + 2] === '/' ? '(?:.+/)?' : '.*';
        i += glob[i + 2] === '/' ? 3 : 2;
      } else if (c === '*') {
        regex += '[^/]*';
        i++;
      } else if (c === '?') {
        regex += '[^/]';
        i++;
      } else if ('.+^${}()|[]\\'.includes(c)) {
        regex += '\\' + c;
        i++;
      } else {
        regex += c;
        i++;
      }
    }
    regex += '$';
    return new RegExp(regex);
  }
}
