export const COMMON_AI_EXTENSIONS: AIExtension[] = [
  {
    name: 'codeium',
    extensionIds: ['codeium.codeium'],
  },
  {
    name: 'cody',
    extensionIds: ['sourcegraph.cody-ai'],
  },
  {
    name: 'continue',
    extensionIds: ['continue.continue'],
  },
  {
    name: 'factory',
    extensionIds: [],
  },
  {
    name: 'openclaw',
    extensionIds: [],
  },
  {
    name: 'supermaven',
    extensionIds: ['supermaven.supermaven'],
  },
  {
    name: 'tabnine',
    extensionIds: ['tabnine.tabnine-vscode'],
  },
  {
    name: 'vscode-ai-toolkit',
    extensionIds: ['ms-vscode.vscode-ai-toolkit'],
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

export const TIME_BETWEEN_HEARTBEATS_MS = 120000;
export const SEND_BUFFER_SECONDS = 30;
export const AI_RECENT_PASTES_TIME_MS = 500;
export const SYNC_AI_HEARTBEATS_DEBOUNCE_SECONDS = 120;

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
  name:
    | 'claude'
    | 'codeium'
    | 'codex'
    | 'cody'
    | 'continue'
    | 'copilot'
    | 'cursor'
    | 'factory'
    | 'gemini'
    | 'openclaw'
    | 'opencode'
    | 'qoder'
    | 'supermaven'
    | 'tabnine'
    | 'vscode-ai-toolkit';
  extensionIds: string[];
}

export const ALLOWED_SCHEMES = ['file', 'vscode-chat-code-block', 'openai-codex', 'vscode-remote'];
