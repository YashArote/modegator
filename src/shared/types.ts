export interface ModKitConfig {
  version: string;
  name: string;
  description?: string;
  macros?: Record<string, MacroBlock>;
  rules?: RuleBlock[];
  ui_actions?: UIAction[];
  scheduled?: ScheduledTask[];
  settings?: Settings;
}

export interface MacroBlock {
  actions: ActionBlock[];
}

export interface RuleBlock {
  name: string;
  trigger: TriggerBlock;
  conditions?: ConditionBlock[];
  actions?: ActionBlock[];
  fallback_actions?: ActionBlock[];
  run_macro?: string;
}

export interface UIAction {
  name: string;
  label: string;
  location: 'post' | 'comment' | 'subreddit';
  actions?: ActionBlock[];
  run_macro?: string;
  for_user_type?: string;
  confirm?: boolean;
  confirm_message?: string;
}

export interface ScheduledTask {
  name: string;
  cron: string;
  actions?: ActionBlock[];
  run_macro?: string;
}

export interface Settings {
  enable_action_log?: boolean;
  log_retention_days?: number;
  max_actions_per_user_per_hour?: number;
  dry_run_mode?: boolean;
  discord_webhook_url?: string;
  slack_webhook_url?: string;
}

export interface TriggerBlock {
  event: string;
}

export interface ConditionBlock {
  // Logic Nodes
  any_of?: ConditionBlock[];
  all_of?: ConditionBlock[];
  none_of?: ConditionBlock[];

  // Leaf Nodes
  field?: string;
  operator?: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'regex';
  value?: any;
}

export interface ActionBlock {
  type: string;
  
  // Post Actions
  spam?: boolean;
  flair_text?: string;
  flair_css_class?: string;

  // Comment Actions
  text?: string;
  distinguish?: boolean;
  sticky?: boolean;

  // User Actions
  duration?: number | 'permanent';
  reason?: string;
  mod_note?: string;
  message?: string;

  // ModMail actions
  internal?: boolean;
  hidden?: boolean;

  // Communication Actions
  to?: string;
  subject?: string;
  body?: string;
  url?: string;

  // Mod notes
  label?: 'BOT_BAN' | 'PERMA_BAN' | 'BAN' | 'ABUSE_WARNING' | 'SPAM_WARNING' | 'SPAM_WATCH' | 'SOLID_CONTRIBUTOR' | 'HELPFUL_USER';
  note?: string;

  // Storage actions
  key?: string;
  value?: string;
  domain?: string;
  color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'gray';

  // Flow control & Timing
  macro?: string;
  duration_ms?: number; // for delay action
  conditions?: ConditionBlock[]; // for stop_if action
}

export interface EventContext {
  type: string;
  subredditName: string;
  author: {
    username: string;
    karma?: number;
    accountAgeDays?: number;
    isMod?: boolean;
    isBanned?: boolean;
    isApproved?: boolean;
    flairText?: string;
    hasModNote?: boolean;
    modNoteLabel?: string;
  };
  post?: {
    id: string;
    title: string;
    body: string;
    domain: string;
    linkType: 'link' | 'self' | string;
    score: number;
    reportCount: number;
    nsfw: boolean;
    spoiler: boolean;
    flairText: string;
    url?: string;
  };
  comment?: {
    id: string;
    postId: string;
    body: string;
    score: number;
    reportCount: number;
    isTopLevel: boolean;
  };
  modmail?: {
    id: string;
    subject: string;
    body: string;
  };
  report?: {
    reason: string;
  };
  synthetic?: boolean;
}

export interface ActionLog {
  action: ActionBlock;
  status: 'SUCCESS' | 'ERROR' | 'DRY_RUN';
  timestamp: number;
  error?: string;
  ruleName?: string;
  targetId?: string;
  targetUrl?: string;
  targetAuthor?: string;
}

export interface ExecOptions {
  dryRun: boolean;
  ruleName: string;
  config: ModKitConfig;
}

export interface ConditionResult {
  conditionKey: string;
  passed: boolean;
  actualValue: any;
  expectedValue: any;
}

export interface TestResult {
  ruleName: string;
  matched: boolean;
  conditionResults: ConditionResult[];
  actionLogs: ActionLog[];
  dataSource: 'specific' | 'auto-fetched';
}
