import * as fs from 'fs';
import * as path from 'path';
import {
  ParsedGlob,
  TrackedFile,
  TRANSCRIPT_ACTIVITY_TIMEOUT,
  TRANSCRIPT_POLL_INTERVAL,
  TranscriptEntity,
} from './constants';
import { Logger } from './logger';
import { Desktop } from './desktop';

export class TranscriptWatcher {
  private globs: ParsedGlob[] = [];
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activityCallback: ((aiName: string, entities: TranscriptEntity[]) => void) | null = null;
  private logger: Logger;
  private pollIntervalMs: number;
  private activityTimeoutMs: number;

  constructor(logger: Logger) {
    this.logger = logger;
    this.pollIntervalMs = TRANSCRIPT_POLL_INTERVAL * 1000;
    this.activityTimeoutMs = TRANSCRIPT_ACTIVITY_TIMEOUT * 1000;

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

  public onActivity(callback: (aiName: string, entities: TranscriptEntity[]) => void): void {
    this.activityCallback = callback;
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

  public poll(): void {
    for (const glob of this.globs) {
      try {
        if (!fs.existsSync(glob.baseDir)) continue;
        const files = this.findFiles(glob.baseDir, '', glob.filePattern, 0, 10);
        for (const file of files) {
          this.processFile(file, glob.aiName);
        }
      } catch {
        // directory may not exist or not be readable
      }
    }
  }

  private processFile(filePath: string, aiName: string): void {
    try {
      // Only support jsonl transcripts for now
      if (!filePath.endsWith('.jsonl')) return;

      const stat = fs.statSync(filePath);

      // Only read recently modified or created files
      const recency = Date.now() - Math.max(stat.mtimeMs, stat.birthtimeMs);
      if (recency > this.activityTimeoutMs) return;

      const tracked = this.trackedFiles.get(filePath);
      const lastOffset = tracked?.lastReadOffset ?? 0;

      // No new content since last read
      if (stat.size <= lastOffset) return;

      const fd = fs.openSync(filePath, 'r');
      try {
        const buffer = Buffer.alloc(stat.size - lastOffset);
        fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
        const content = buffer.toString('utf-8');

        const { entities, projectFolder } = this.parseContent(
          aiName,
          content,
          tracked?.projectFolder,
        );

        this.trackedFiles.set(filePath, {
          aiName,
          lastReadOffset: stat.size,
          projectFolder: projectFolder ?? tracked?.projectFolder,
        });

        if (entities.length > 0 && this.activityCallback) {
          this.activityCallback(aiName, entities);
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      this.logger.warn(`Error processing transcript ${filePath}: ${e}`);
    }
  }

  private parseContent(
    aiName: string,
    content: string,
    currentProjectFolder?: string,
  ): { entities: TranscriptEntity[]; projectFolder?: string } {
    const entityMap = new Map<string, number>();
    let projectFolder = currentProjectFolder;

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);

        // Extract cwd from session metadata
        if (entry.cwd && typeof entry.cwd === 'string') {
          projectFolder = entry.cwd;
        }

        const results = this.extractFileEntity(aiName, entry);
        if (results) {
          for (const result of results) {
            const filePath =
              path.isAbsolute(result.filePath) || !projectFolder
                ? result.filePath
                : path.resolve(projectFolder, result.filePath);
            const prev = entityMap.get(filePath) ?? 0;
            entityMap.set(filePath, prev + result.lineChanges);
          }
        }
      } catch {
        // not valid JSON, skip
      }
    }

    const entities: TranscriptEntity[] = [];
    for (const [filePath, lineChanges] of entityMap) {
      entities.push({ filePath, lineChanges, projectFolder });
    }
    return { entities, projectFolder };
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
    const genericResult = entry.tool_result ?? entry.result ?? entry.output;
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
      const lines = result.diff.split('\n');
      return (
        lines.filter((l: string) => l.startsWith('+')).length -
        lines.filter((l: string) => l.startsWith('-')).length
      );
    }
    return 0;
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

    if (baseParts.length === 0 || patternParts.length === 0) return null;

    const baseDir = baseParts.join(path.sep);
    const filePattern = this.globToRegex(patternParts.join('/'));
    return { aiName, baseDir, filePattern };
  }

  private findFiles(
    baseDir: string,
    relPath: string,
    pattern: RegExp,
    depth: number,
    maxDepth: number,
  ): string[] {
    if (depth > maxDepth) return [];
    const results: string[] = [];
    const fullPath = relPath ? path.join(baseDir, relPath) : baseDir;

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryRel = relPath ? relPath + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
          results.push(...this.findFiles(baseDir, entryRel, pattern, depth + 1, maxDepth));
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
