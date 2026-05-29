import YAML from 'yaml';
import { ActionBlock, ConditionBlock, TriggerBlock } from '../../shared/types';

const ALLOWED_ACTIONS = new Set([
  'remove_post', 'approve_post', 'lock_post', 'unlock_post', 'set_post_flair',
  'mark_post_nsfw', 'unmark_post_nsfw', 'mark_post_spoiler', 'unmark_post_spoiler',
  'remove_comment', 'approve_comment', 'lock_comment', 'submit_comment',
  'ban_user', 'unban_user', 'mute_user', 'unmute_user', 'set_user_flair', 'clear_user_flair',
  'approve_user', 'remove_approval', 'add_mod_note', 'reply_modmail', 'send_modmail', 'sendmodmail', 'send_private_message',
  'send_webhook', 'store_value', 'increment_counter', 'tag_domain', 'stop_if', 'if', 'delay', 'run_macro'
]);

const ALLOWED_FIELDS = new Set([
  'author_name', 'author_karma', 'author_age_days', 'author_is_banned', 'author_is_mod', 'author_is_approved', 'author_has_user_flair', 'author_has_mod_note', 'author_mod_note_label',
  'post_title', 'post_body', 'post_domain', 'post_domain_tag', 'post_score', 'post_link_type', 'post_is_nsfw', 'post_is_spoiler', 'post_flair_text',
  'comment_body', 'comment_score', 'comment_is_top_level', 'modmail_subject', 'modmail_body', 'modmail_body_length'
]);

const FIELD_TYPES: Record<string, 'string' | 'number' | 'boolean'> = {
  'author_name': 'string',
  'author_karma': 'number',
  'author_age_days': 'number',
  'author_is_banned': 'boolean',
  'author_is_mod': 'boolean',
  'author_is_approved': 'boolean',
  'author_has_user_flair': 'string',
  'author_has_mod_note': 'boolean',
  'author_mod_note_label': 'string',
  'post_title': 'string',
  'post_body': 'string',
  'post_domain': 'string',
  'post_domain_tag': 'string',
  'post_score': 'number',
  'post_link_type': 'string',
  'post_is_nsfw': 'boolean',
  'post_is_spoiler': 'boolean',
  'post_flair_text': 'string',
  'comment_body': 'string',
  'comment_score': 'number',
  'comment_is_top_level': 'boolean',
  'modmail_subject': 'string',
  'modmail_body': 'string',
  'modmail_body_length': 'number'
};

const ALLOWED_RULE_KEYS = new Set(['name', 'trigger', 'conditions', 'actions', 'fallback_actions', 'run_macro']);
const ALLOWED_TRIGGER_KEYS = new Set(['event']);
const ALLOWED_UIACTION_KEYS = new Set(['name', 'label', 'location', 'actions', 'run_macro', 'for_user_type', 'confirm', 'confirm_message']);
const ALLOWED_SCHEDULED_KEYS = new Set(['name', 'cron', 'actions', 'run_macro']);
const ALLOWED_MACRO_KEYS = new Set(['name', 'actions']);
const ALLOWED_CONDITION_KEYS = new Set(['any_of', 'all_of', 'none_of', 'field', 'operator', 'value']);
const ALLOWED_ACTION_KEYS = new Set([
  'type', 'spam', 'flair_text', 'flair_css_class', 'text', 'distinguish', 'sticky',
  'duration', 'reason', 'mod_note', 'message', 'label', 'note', 'internal', 'hidden',
  'to', 'subject', 'body', 'url', 'key', 'value', 'domain', 'tag', 'color', 'text_color', 'macro', 'duration_ms', 'conditions', 'then', 'headers', 'payload'
]);

const ALLOWED_OPERATORS = new Set(['==', '!=', '<', '<=', '>', '>=', 'contains', 'regex']);
const ALLOWED_TRIGGERS = new Set(['PostSubmit', 'CommentSubmit', 'PostReport', 'CommentReport', 'PostUpdate', 'CommentUpdate', 'ModMail']);

const ACTION_PROPERTY_TYPES: Record<string, 'string' | 'number' | 'boolean'> = {
  'spam': 'boolean',
  'flair_text': 'string',
  'flair_css_class': 'string',
  'text': 'string',
  'distinguish': 'boolean',
  'sticky': 'boolean',
  'reason': 'string',
  'mod_note': 'string',
  'message': 'string',
  'label': 'string',
  'note': 'string',
  'internal': 'boolean',
  'hidden': 'boolean',
  'to': 'string',
  'subject': 'string',
  'body': 'string',
  'url': 'string',
  'key': 'string',
  'value': 'string',
  'domain': 'string',
  'tag': 'string',
  'color': 'string',
  'text_color': 'string',
  'macro': 'string',
  'duration_ms': 'number'
};

export function validateAndMergeFiles(files: Record<string, string>): { valid: boolean; errors?: string[]; merged?: any } {
  const errors: string[] = [];
  const merged: any = {
    version: '1.0',
    name: 'Merged Config',
    rules: [],
    ui_actions: [],
    scheduled: [],
    macros: [],
    settings: {}
  };

  const seenNames = {
    rules: new Set<string>(),
    ui_actions: new Set<string>(),
    scheduled: new Set<string>(),
    macros: new Set<string>()
  };

  const definedSettings: Record<string, { value: any; file: string }> = {};

  function validateKeys(obj: any, allowedKeys: Set<string>, prefix: string) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${prefix}: Unknown property '${key}'`);
      }
    }
  }

  function validateAction(action: any, prefix: string) {
    if (!action || typeof action !== 'object') {
      errors.push(`${prefix}: Action must be an object`);
      return;
    }
    validateKeys(action, ALLOWED_ACTION_KEYS, prefix);

    // Type check action properties
    for (const [key, expectedType] of Object.entries(ACTION_PROPERTY_TYPES)) {
      if (action[key] !== undefined) {
        if (typeof action[key] !== expectedType) {
          errors.push(`${prefix}: Property '${key}' must be of type '${expectedType}', but got '${typeof action[key]}' (value: ${action[key]})`);
        }
      }
    }

    if (!action.type) {
      errors.push(`${prefix}: Action is missing 'type'`);
      return;
    }
    if (!ALLOWED_ACTIONS.has(action.type)) {
      errors.push(`${prefix}: Unknown action type '${action.type}'`);
    }
    if (action.type === 'delay' && typeof action.duration_ms !== 'number') {
      errors.push(`${prefix}: 'delay' action requires 'duration_ms' as a number`);
    }
    if (action.type === 'ban_user' && action.duration !== undefined && action.duration !== 'permanent' && typeof action.duration !== 'number') {
      errors.push(`${prefix}: 'ban_user' duration must be a number or 'permanent'`);
    }
    if (action.type === 'add_mod_note') {
      const validLabels = ['BOT_BAN', 'PERMA_BAN', 'BAN', 'ABUSE_WARNING', 'SPAM_WARNING', 'SPAM_WATCH', 'SOLID_CONTRIBUTOR', 'HELPFUL_USER'];
      if (!action.label || !validLabels.includes(action.label)) {
        errors.push(`${prefix}: 'add_mod_note' requires 'label' to be one of: ${validLabels.join(', ')}`);
      }
    }
    if (action.type === 'stop_if' && action.conditions) {
      if (!Array.isArray(action.conditions)) {
        errors.push(`${prefix}: 'stop_if' action conditions must be an array`);
      } else {
        action.conditions.forEach((c: any, ci: number) => validateCondition(c, `${prefix}.conditions[${ci}]`));
      }
    }
    if (action.type === 'if') {
      if (!action.conditions || !Array.isArray(action.conditions)) {
        errors.push(`${prefix}: 'if' action requires 'conditions' array`);
      } else {
        action.conditions.forEach((c: any, ci: number) => validateCondition(c, `${prefix}.conditions[${ci}]`));
      }
      if (!action.then || !Array.isArray(action.then)) {
        errors.push(`${prefix}: 'if' action requires 'then' block of actions`);
      } else {
        action.then.forEach((a: any, ai: number) => validateAction(a, `${prefix}.then[${ai}]`));
      }
    }
    if (action.text_color !== undefined) {
      if (action.text_color !== 'dark' && action.text_color !== 'light') {
        errors.push(`${prefix}: 'text_color' must be either 'dark' or 'light'`);
      }
    }
    if (action.headers !== undefined && (typeof action.headers !== 'object' || Array.isArray(action.headers))) {
      errors.push(`${prefix}: 'headers' must be an object`);
    }
    if (action.payload !== undefined && (typeof action.payload !== 'object' || Array.isArray(action.payload))) {
      errors.push(`${prefix}: 'payload' must be an object`);
    }
  }

  function validateCondition(condition: any, prefix: string) {
    if (!condition || typeof condition !== 'object') {
      errors.push(`${prefix}: Condition must be an object`);
      return;
    }
    validateKeys(condition, ALLOWED_CONDITION_KEYS, prefix);

    if (condition.any_of) {
      if (!Array.isArray(condition.any_of)) errors.push(`${prefix}: 'any_of' must be an array`);
      else condition.any_of.forEach((c: any, i: number) => validateCondition(c, `${prefix}.any_of[${i}]`));
      return;
    }
    if (condition.all_of) {
      if (!Array.isArray(condition.all_of)) errors.push(`${prefix}: 'all_of' must be an array`);
      else condition.all_of.forEach((c: any, i: number) => validateCondition(c, `${prefix}.all_of[${i}]`));
      return;
    }
    if (condition.none_of) {
      if (!Array.isArray(condition.none_of)) errors.push(`${prefix}: 'none_of' must be an array`);
      else condition.none_of.forEach((c: any, i: number) => validateCondition(c, `${prefix}.none_of[${i}]`));
      return;
    }

    if (!condition.field) {
      errors.push(`${prefix}: Leaf condition missing 'field' (or any_of/all_of/none_of block)`);
      return;
    }
    if (!ALLOWED_FIELDS.has(condition.field) && !condition.field.startsWith('counter_') && !condition.field.startsWith('custom_')) {
      errors.push(`${prefix}: Unknown field '${condition.field}'`);
    } else {
      let expectedType = FIELD_TYPES[condition.field];
      if (!expectedType) {
        if (condition.field.startsWith('counter_')) expectedType = 'number';
        else if (condition.field.startsWith('custom_')) expectedType = 'string';
      }

      if (expectedType) {
        const val = condition.value;
        if (Array.isArray(val)) {
          if (val.length > 500) {
            errors.push(`${prefix}: Condition value array exceeds maximum size of 500 items (got ${val.length} items)`);
          }
          if (!['==', '!=', 'contains', 'regex'].includes(condition.operator)) {
            errors.push(`${prefix}: Operator '${condition.operator}' does not support array values`);
          } else {
            for (let idx = 0; idx < Math.min(val.length, 1000); idx++) {
              if (typeof val[idx] !== expectedType) {
                errors.push(`${prefix}: Array element at index ${idx} for field '${condition.field}' must be of type '${expectedType}', but got '${typeof val[idx]}' (value: ${val[idx]})`);
              }
            }
          }
        } else {
          if (val !== undefined && typeof val !== expectedType) {
            errors.push(`${prefix}: Value for '${condition.field}' must be of type '${expectedType}', but got '${typeof val}' (value: ${val})`);
          }
        }
      }
    }

    if (!ALLOWED_OPERATORS.has(condition.operator)) {
      errors.push(`${prefix}: Unknown operator '${condition.operator}' for field '${condition.field}'`);
    } else {
      const val = condition.value;
      if (!Array.isArray(val)) {
        if ((condition.operator === '<' || condition.operator === '<=' || condition.operator === '>' || condition.operator === '>=') && typeof val !== 'number') {
          errors.push(`${prefix}: Operator '${condition.operator}' requires a number value`);
        }
        if ((condition.operator === 'contains' || condition.operator === 'regex') && typeof val !== 'string') {
          errors.push(`${prefix}: Operator '${condition.operator}' requires a string value`);
        }
      } else {
        if (condition.operator === '<' || condition.operator === '<=' || condition.operator === '>' || condition.operator === '>=') {
          errors.push(`${prefix}: Operator '${condition.operator}' does not support array values`);
        }
      }
    }

    if (condition.value === undefined) {
      errors.push(`${prefix}: Missing 'value' for field '${condition.field}'`);
    }
  }

  for (const [filename, content] of Object.entries(files)) {
    if (!content.trim()) continue;

    // Check size limit: reject files larger than 100 KB
    if (content.length > 100 * 1024) {
      errors.push(`[${filename}]: Configuration file exceeds the maximum size limit of 100 KB`);
      continue;
    }

    try {
      const parsed = YAML.parse(content);
      if (!parsed || typeof parsed !== 'object') continue;

      // Merge Rules
      if (parsed.rules && Array.isArray(parsed.rules)) {
        for (const [i, rule] of parsed.rules.entries()) {
          const prefix = `[${filename}] Rule[${i}]`;
          validateKeys(rule, ALLOWED_RULE_KEYS, prefix);



          if (!rule.name) {
            errors.push(`${prefix}: Missing name`);
            continue;
          }
          if (seenNames.rules.has(rule.name)) {
            errors.push(`Conflict: Rule name "${rule.name}" is defined multiple times`);
          } else {
            seenNames.rules.add(rule.name);
            merged.rules.push(rule);
          }

          if (!rule.trigger) {
            errors.push(`${prefix}: Missing trigger event`);
          } else {
            validateKeys(rule.trigger, ALLOWED_TRIGGER_KEYS, `${prefix}.trigger`);
            if (!ALLOWED_TRIGGERS.has(rule.trigger.event)) {
              errors.push(`${prefix}: Invalid trigger event '${rule.trigger.event}'`);
            }
          }

          if (rule.conditions && Array.isArray(rule.conditions)) {
            rule.conditions.forEach((c: any, ci: number) => validateCondition(c, `${prefix}.conditions[${ci}]`));
          }

          if (rule.actions && Array.isArray(rule.actions)) {
            rule.actions.forEach((a: any, ai: number) => validateAction(a, `${prefix}.actions[${ai}]`));
          }

          if (rule.fallback_actions && Array.isArray(rule.fallback_actions)) {
            rule.fallback_actions.forEach((a: any, ai: number) => validateAction(a, `${prefix}.fallback_actions[${ai}]`));
          }
        }
      }

      // Merge UI Actions
      if (parsed.ui_actions && Array.isArray(parsed.ui_actions)) {
        for (const [i, action] of parsed.ui_actions.entries()) {
          const prefix = `[${filename}] UIAction[${i}]`;
          validateKeys(action, ALLOWED_UIACTION_KEYS, prefix);

          if (!action.name) {
            errors.push(`${prefix}: Missing name`);
            continue;
          }
          if (seenNames.ui_actions.has(action.name)) {
            errors.push(`Conflict: UI Action name "${action.name}" is defined multiple times`);
          } else {
            seenNames.ui_actions.add(action.name);
            merged.ui_actions.push(action);
          }

          if (action.location && !['post', 'comment', 'subreddit'].includes(action.location)) {
            errors.push(`${prefix}: 'location' must be one of: 'post', 'comment', 'subreddit'`);
          }

          if (action.for_user_type !== undefined && typeof action.for_user_type !== 'string') {
            errors.push(`${prefix}: 'for_user_type' must be a string`);
          }

          if (action.confirm !== undefined && typeof action.confirm !== 'boolean') {
            errors.push(`${prefix}: 'confirm' must be a boolean`);
          }

          if (action.confirm_message !== undefined && typeof action.confirm_message !== 'string') {
            errors.push(`${prefix}: 'confirm_message' must be a string`);
          }

          if (action.actions && Array.isArray(action.actions)) {
            action.actions.forEach((a: any, ai: number) => validateAction(a, `${prefix}.actions[${ai}]`));
          }
        }
      }

      // Merge Scheduled
      if (parsed.scheduled && Array.isArray(parsed.scheduled)) {
        for (const [i, task] of parsed.scheduled.entries()) {
          const prefix = `[${filename}] ScheduledTask[${i}]`;
          validateKeys(task, ALLOWED_SCHEDULED_KEYS, prefix);

          if (!task.name) {
            errors.push(`${prefix}: Missing name`);
            continue;
          }
          if (seenNames.scheduled.has(task.name)) {
            errors.push(`Conflict: Scheduled task name "${task.name}" is defined multiple times`);
          } else {
            seenNames.scheduled.add(task.name);
            merged.scheduled.push(task);
          }

          if (task.actions && Array.isArray(task.actions)) {
            task.actions.forEach((a: any, ai: number) => validateAction(a, `${prefix}.actions[${ai}]`));
          }
        }
      }

      // Merge Macros
      if (parsed.macros && Array.isArray(parsed.macros)) {
        for (const [i, macro] of parsed.macros.entries()) {
          const prefix = `[${filename}] Macro[${i}]`;
          validateKeys(macro, ALLOWED_MACRO_KEYS, prefix);

          if (!macro.name) {
            errors.push(`${prefix}: Missing name`);
            continue;
          }
          if (seenNames.macros.has(macro.name)) {
            errors.push(`Conflict: Macro name "${macro.name}" is defined multiple times`);
          } else {
            seenNames.macros.add(macro.name);
            merged.macros.push(macro);
          }

          if (macro.actions && Array.isArray(macro.actions)) {
            macro.actions.forEach((a: any, ai: number) => validateAction(a, `${prefix}.actions[${ai}]`));
          }
        }
      }

      // Merge Settings
      if (parsed.settings && typeof parsed.settings === 'object') {
        for (const [key, value] of Object.entries(parsed.settings)) {
          if (definedSettings[key]) {
            if (JSON.stringify(definedSettings[key].value) !== JSON.stringify(value)) {
              errors.push(`Conflict: Setting "${key}" defined as different values in ${definedSettings[key].file} and ${filename}`);
            }
          } else {
            definedSettings[key] = { value, file: filename };
            merged.settings[key] = value;
          }
        }
      }

    } catch (e: any) {
      errors.push(`[${filename}] Invalid YAML: ${e.message}`);
    }
  }

  // Cross-reference macro definitions
  const validateMacroReferences = (actions: any[], prefix: string) => {
    if (!actions) return;
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.type === 'run_macro' && a.macro) {
        if (!seenNames.macros.has(a.macro)) {
          errors.push(`${prefix}[${i}]: Macro "${a.macro}" is referenced but never defined.`);
        }
      }
      if (a.type === 'if') {
        if (!a.conditions || !Array.isArray(a.conditions)) {
          errors.push(`${prefix}[${i}]: 'if' action requires 'conditions' array`);
        } else {
          a.conditions.forEach((c: any, ci: number) => validateCondition(c, `${prefix}[${i}].conditions[${ci}]`));
        }
        if (!a.then || !Array.isArray(a.then)) {
          errors.push(`${prefix}[${i}]: 'if' action requires 'then' block of actions`);
        } else {
          validateMacroReferences(a.then, `${prefix}[${i}].then`);
        }
      }
    }
  };

  merged.rules.forEach((r: any) => {
    if (r.run_macro && !seenNames.macros.has(r.run_macro)) {
      errors.push(`Rule "${r.name}" references undefined macro "${r.run_macro}"`);
    }
    validateMacroReferences(r.actions, `Rule "${r.name}" actions`);
    validateMacroReferences(r.fallback_actions, `Rule "${r.name}" fallback_actions`);
  });

  merged.ui_actions.forEach((r: any) => {
    if (r.run_macro && !seenNames.macros.has(r.run_macro)) {
      errors.push(`UI Action "${r.name}" references undefined macro "${r.run_macro}"`);
    }
    validateMacroReferences(r.actions, `UI Action "${r.name}" actions`);
  });

  merged.scheduled.forEach((r: any) => {
    if (r.run_macro && !seenNames.macros.has(r.run_macro)) {
      errors.push(`Scheduled task "${r.name}" references undefined macro "${r.run_macro}"`);
    }
    validateMacroReferences(r.actions, `Scheduled task "${r.name}" actions`);
  });

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, merged };
}
