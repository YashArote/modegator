import type { ActionBlock, ConditionBlock, RuleBlock, ScheduledTask, UIAction } from './types';

// Map specific fields to English equivalents if necessary
const fieldNameMap: Record<string, string> = {
  'author_karma': "author's karma",
  'author_age_days': "author's account age (in days)",
  'author_is_mod': 'is a moderator',
  'author_is_banned': 'is banned',
  'post_title': "post's title",
  'post_body': "post's body",
  'post_score': "post's score",
  'post_report_count': "post's report count",
  'post_is_nsfw': 'is marked NSFW',
  'comment_body': "comment's body",
  'comment_score': "comment's score",
  'comment_report_count': "comment's report count",
  'comment_is_top_level': 'is a top-level comment',
};

// Map Operators
const operatorMap: Record<string, string> = {
  '==': 'is equal to',
  '!=': 'is not equal to',
  '<': 'is less than',
  '<=': 'is less than or equal to',
  '>': 'is greater than',
  '>=': 'is greater than or equal to',
  'contains': 'contains',
  'regex': 'matches the regular expression',
};

// Explain a single condition recursively
export function explainCondition(cond: ConditionBlock): string {
  if (cond.any_of) {
    return `ANY of the following are true: (${cond.any_of.map(explainCondition).join(' OR ')})`;
  }
  if (cond.all_of) {
    return `ALL of the following are true: (${cond.all_of.map(explainCondition).join(' AND ')})`;
  }
  if (cond.none_of) {
    return `NONE of the following are true: (${cond.none_of.map(explainCondition).join(' AND ')})`;
  }

  // Leaf condition
  if (cond.field && cond.operator) {
    const field = fieldNameMap[cond.field] || cond.field;
    const op = operatorMap[cond.operator] || cond.operator;
    const val = typeof cond.value === 'string' ? `"${cond.value}"` : String(cond.value);

    // E.g. "is marked NSFW is equal to true" -> "is marked NSFW"
    if (cond.operator === '==' && cond.value === true && field.startsWith('is ')) {
      return field;
    }
    if (cond.operator === '==' && cond.value === false && field.startsWith('is ')) {
      return field.replace('is ', 'is NOT ');
    }

    return `the ${field} ${op} ${val}`;
  }

  return 'an unknown condition is met';
}

// Explain a single action
export function explainAction(action: ActionBlock): string {
  switch (action.type) {
    case 'remove_post':
      return `Remove the post${action.spam ? ' and mark as spam' : ''}.`;
    case 'approve_post':
      return 'Approve the post.';
    case 'lock_post':
      return 'Lock the post.';
    case 'unlock_post':
      return 'Unlock the post.';
    case 'set_post_flair':
      return `Set the post's flair to "${action.flair_text || ''}"${action.flair_css_class ? ` (CSS class: ${action.flair_css_class})` : ''}.`;
    case 'mark_post_nsfw':
      return 'Mark the post as NSFW.';
    case 'unmark_post_nsfw':
      return 'Remove the NSFW mark from the post.';
    case 'mark_post_spoiler':
      return 'Mark the post as a spoiler.';
    case 'unmark_post_spoiler':
      return 'Remove the spoiler mark from the post.';
    case 'remove_comment':
      return `Remove the comment${action.spam ? ' and mark as spam' : ''}.`;
    case 'approve_comment':
      return 'Approve the comment.';
    case 'lock_comment':
      return 'Lock the comment.';
    case 'submit_comment':
      return `Reply with a comment: "${action.text || ''}"${action.distinguish ? ' (distinguished)' : ''}${action.sticky ? ' and sticky it' : ''}.`;
    case 'ban_user':
      return `Ban the user${action.duration === 'permanent' || !action.duration ? ' permanently' : ` for ${action.duration} days`} (Reason: "${action.reason || 'None'}").`;
    case 'unban_user':
      return 'Unban the user.';
    case 'mute_user':
      return 'Mute the user in ModMail.';
    case 'unmute_user':
      return 'Unmute the user in ModMail.';
    case 'set_user_flair':
      return `Set the user's flair to "${action.flair_text || ''}".`;
    case 'clear_user_flair':
      return `Clear the user's flair.`;
    case 'approve_user':
      return 'Add the user as an approved submitter.';
    case 'remove_approval':
      return 'Remove the user from approved submitters.';
    case 'add_mod_note':
      return `Add a mod note labeled [${action.label || 'NONE'}]: "${action.note || ''}".`;
    case 'reply_modmail':
      return `Reply to ModMail: "${action.text || ''}"${action.internal ? ' (as an internal note)' : ''}.`;
    case 'send_modmail':
    case 'sendmodmail':
      return `Send a new ModMail to ${action.to || 'the user'} titled "${action.subject || ''}".`;
    case 'send_private_message':
      return `Send a private message to ${action.to || 'the user'} titled "${action.subject || ''}".`;
    case 'send_webhook':
      return `Send a webhook payload to ${action.url || 'the configured URL'}.`;
    case 'store_value':
      return `Store custom value "${action.value}" at key "${action.key}".`;
    case 'increment_counter':
      return `Increment the custom counter "${action.key}".`;
    case 'tag_domain':
      return `Tag the domain "${action.domain}" with color "${action.color}".`;
    case 'stop_if':
      return 'Stop executing further actions if this point is reached.';
    case 'delay':
      return `Wait for ${action.duration_ms} milliseconds.`;
    case 'run_macro':
      return `Execute the macro named "${action.macro}".`;
    default:
      return `Perform custom action: ${action.type}.`;
  }
}

// Generate full explanation for a Rule
export function explainRule(rule: any): string {
  let exp = `When an event triggered by ${rule.trigger?.event || 'Unknown'} occurs`;
  
  if (rule.conditions && rule.conditions.length > 0) {
    const condStr = rule.conditions.map(explainCondition).join(' AND ');
    exp += `, IF ${condStr}`;
  } else {
    exp += `, ALWAYS`;
  }

  exp += `, THEN `;
  
  if (rule.run_macro) {
    exp += `run the macro "${rule.run_macro}".`;
  } else if (rule.actions && rule.actions.length > 0) {
    exp += rule.actions.map(explainAction).join(' ');
  } else {
    exp += `do nothing.`;
  }

  return exp;
}

// Generate explanation for UI Action
export function explainUiAction(action: any): string {
  let exp = `When a ${action.for_user_type || 'moderator'} clicks "${action.label || action.name}" on a ${action.location || 'subreddit'}, `;
  if (action.confirm) {
    exp += `ask for confirmation ("${action.confirm_message || 'Are you sure?'}") then `;
  }
  
  if (action.run_macro) {
    exp += `run the macro "${action.run_macro}".`;
  } else if (action.actions && action.actions.length > 0) {
    exp += action.actions.map(explainAction).join(' ');
  } else {
    exp += `do nothing.`;
  }

  return exp;
}

// Generate explanation for Scheduled Task
export function explainScheduledTask(task: any): string {
  let exp = `On schedule "${task.cron}", `;
  
  if (task.run_macro) {
    exp += `run the macro "${task.run_macro}".`;
  } else if (task.actions && task.actions.length > 0) {
    exp += task.actions.map(explainAction).join(' ');
  } else {
    exp += `do nothing.`;
  }

  return exp;
}

// Generate explanation for Macro
export function explainMacro(macroName: string, macro: any): string {
  let exp = `When the macro "${macroName}" is triggered, `;
  
  if (macro.actions && macro.actions.length > 0) {
    exp += macro.actions.map(explainAction).join(' ');
  } else {
    exp += `it does nothing.`;
  }

  return exp;
}
