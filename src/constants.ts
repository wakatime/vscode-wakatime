export const COMMON_AI_EXTENSIONS: AIExtension[] = [
  {
    name: 'claude',
    extensionIds: ['anthropic.claude-code'],
    transcriptLogGlobs: ['~/.claude/projects/*/*.jsonl'],
  },
  {
    name: 'codex',
    extensionIds: ['openai.chatgpt', 'openai.openai-gpt-vscode'],
    transcriptLogGlobs: ['~/.codex/sessions/**/rollout-*.jsonl'],
  },
  {
    name: 'copilot',
    extensionIds: ['github.copilot', 'github.copilot-chat'],
    transcriptLogGlobs: [],
    // transcriptLogGlobs: ['~/.copilot/session-state/*.jsonl'],
  },
  {
    name: 'cursor',
    extensionIds: [],
    transcriptLogGlobs: [
      // '~/.cursor/projects/*/agent-transcripts/*/*.jsonl',
      // '~/AppData/Roaming/Cursor/projects/*/agent-transcripts/*/*.jsonl',
      '~/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
      '~/.config/Cursor/User/globalStorage/state.vscdb',
      '~/AppData/Roaming/Cursor/Cursor/User/workspaceStorage/state.vscdb',
    ],
  },
  {
    name: 'gemini',
    extensionIds: [],
    transcriptLogGlobs: [],
  },
  {
    name: 'codeium',
    extensionIds: ['codeium.codeium'],
    transcriptLogGlobs: [],
  },
  {
    name: 'continue',
    extensionIds: ['continue.continue'],
    transcriptLogGlobs: [],
  },
  {
    name: 'cody',
    extensionIds: ['sourcegraph.cody-ai'],
    transcriptLogGlobs: [],
  },
  {
    name: 'supermaven',
    extensionIds: ['supermaven.supermaven'],
    transcriptLogGlobs: [],
  },
  {
    name: 'tabnine',
    extensionIds: ['tabnine.tabnine-vscode'],
    transcriptLogGlobs: [],
  },
  {
    name: 'vscode-ai-toolkit',
    extensionIds: ['ms-vscode.vscode-ai-toolkit'],
    transcriptLogGlobs: [],
  },
  {
    name: 'factory',
    extensionIds: [],
    transcriptLogGlobs: [],
    // transcriptLogGlobs: ['~/.factory/sessions/**/*.jsonl', '~/.factory/projects/**/*.jsonl'],
  },
  {
    name: 'opencode',
    extensionIds: [],
    transcriptLogGlobs: [],
    // transcriptLogGlobs: ['~/.local/share/opencode/storage/session/ses_*.json'],
  },
  {
    name: 'openclaw',
    extensionIds: [],
    transcriptLogGlobs: [],
    // transcriptLogGlobs: ['~/.openclaw/agents/**/sessions/*.jsonl', '~/.clawdbot/agents/**/sessions/*.jsonl'],
  },
];

export const COMMAND_API_KEY = 'wakatime.apikey';
export const COMMAND_API_URL = 'wakatime.apiurl';
export const COMMAND_CONFIG_FILE = 'wakatime.config_file';
export const COMMAND_DASHBOARD = 'wakatime.dashboard';
export const COMMAND_DEBUG = 'wakatime.debug';
export const COMMAND_DISABLE = 'wakatime.disable';
export const COMMAND_LOG_FILE = 'wakatime.log_file';
export const COMMAND_PROXY = 'wakatime.proxy';
export const COMMAND_STATUS_BAR_CODING_ACTIVITY = 'wakatime.status_bar_coding_activity';
export const COMMAND_STATUS_BAR_ENABLED = 'wakatime.status_bar_enabled';
export enum LogLevel {
  DEBUG = 0,
  INFO,
  WARN,
  ERROR,
}

export const AI_RECENT_PASTES_TIME_MS = 500;
export const TIME_BETWEEN_HEARTBEATS_MS = 120000;
export const SEND_BUFFER_SECONDS = 30;
export const TRANSCRIPT_POLL_INTERVAL = 15; // seconds

export interface Heartbeat {
  time: number;
  entity: string;
  local_file?: string;
  is_write: boolean;
  lineno?: number;
  cursorpos?: number;
  lines_in_file?: number;
  alternate_project?: string;
  project_folder?: string;
  project_root_count?: number;
  language?: string;
  category?: 'debugging' | 'ai coding' | 'building' | 'code reviewing';
  ai_line_changes?: number;
  human_line_changes?: number;
  agent?: string;
  plugin?: string;
  is_unsaved_entity?: boolean;
}

export interface AIExtension {
  name: string;
  extensionIds: string[];
  transcriptLogGlobs: string[];
}

export interface ParsedGlob {
  aiName: string;
  baseDir: string;
  filePattern: RegExp;
  isLiteral: boolean;
}

export interface TrackedFile {
  aiName: string;
  lastReadOffset: number;
  lastReadTime: number;
  projectFolder?: string;
}

export interface TranscriptHeartbeat {
  filePath: string;
  lineChanges: number;
  time: number;
  projectFolder?: string;
}

export interface CursorRow {
  createdAt?: string;
  toolFormerData?: {
    name?: string;
    params?: string;
    result?: string;
  };
}

export type SqlJsInit = (config?: { wasmBinary?: Uint8Array }) => Promise<SqlJsModule>;
type SqlJsRowValue = string | number | null;

interface SqlJsQueryResult {
  columns: string[];
  values: SqlJsRowValue[][];
}

interface SqlJsDatabase {
  exec(sql: string): SqlJsQueryResult[];
  close(): void;
}

export interface SqlJsModule {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
}
