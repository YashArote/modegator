import { reddit, redis } from '@devvit/web/server';
import { resolvePlaceholders } from '../../shared/placeholders';
import { appendToLog } from '../storage/logStore';
import { resolveMacro } from './macroRunner';
import { evaluateConditions } from './conditionEvaluator';
import type { ActionBlock, EventContext, ActionLog, ExecOptions } from '../../shared/types';

/** Maps YAML named colors to hex values accepted by the Reddit flair API. */
const COLOR_MAP: Record<string, string> = {
  red:    '#FF585B',
  orange: '#FF6314',
  yellow: '#FFD635',
  green:  '#46D160',
  blue:   '#0DD3BB',
  gray:   '#EAEDEF',
};

/** Resolves an ActionBlock color field to a valid backgroundColor hex string. */
function resolveFlairColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (color.startsWith('#')) return color;          // already a hex value
  return COLOR_MAP[color.toLowerCase()] ?? undefined;
}

async function resolveObjectStatePlaceholders(obj: any): Promise<any> {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    let str = obj;
    const matches = str.match(/\{\{(counter_[^}]+|custom_[^}]+)\}\}/g);
    if (matches) {
      for (const match of matches) {
        const inner = match.slice(2, -2).trim();
        if (inner.startsWith('counter_')) {
          const k = inner.substring(8);
          const val = await redis.get(`modkit:counter:${k}`);
          str = str.replace(match, val ? val : '0');
        } else if (inner.startsWith('custom_')) {
          const k = inner.substring(7);
          const val = await redis.get(`modkit:custom:${k}`);
          str = str.replace(match, val ? val : '');
        }
      }
    }
    return str;
  }
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => resolveObjectStatePlaceholders(item)));
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = await resolveObjectStatePlaceholders(v);
    }
    return result;
  }
  return obj;
}

async function resolveStatePlaceholders(action: ActionBlock) {
  const update = async (key: keyof ActionBlock) => {
    if (typeof action[key] === 'string') {
      let str = action[key] as string;
      const matches = str.match(/\{\{(counter_[^}]+|custom_[^}]+)\}\}/g);
      if (matches) {
        for (const match of matches) {
          const inner = match.slice(2, -2).trim();
          if (inner.startsWith('counter_')) {
            const k = inner.substring(8);
            const val = await redis.get(`modkit:counter:${k}`);
            str = str.replace(match, val ? val : '0');
          } else if (inner.startsWith('custom_')) {
            const k = inner.substring(7);
            const val = await redis.get(`modkit:custom:${k}`);
            str = str.replace(match, val ? val : '');
          }
        }
        (action as any)[key] = str;
      }
    }
  };

  await update('text');
  await update('reason');
  await update('mod_note');
  await update('message');
  await update('note');
  await update('to');
  await update('subject');
  await update('body');
  if (action.url && action.url !== 'discord' && action.url !== 'slack') {
    await update('url');
  }
  await update('key');
  await update('domain');
  await update('value');

  if (action.headers) {
    action.headers = await resolveObjectStatePlaceholders(action.headers);
  }
  if (action.payload) {
    action.payload = await resolveObjectStatePlaceholders(action.payload);
  }
}

export async function executeActions(
  actions: ActionBlock[],
  ctx: EventContext,
  opts: ExecOptions
): Promise<ActionLog[]> {
  const logs: ActionLog[] = [];

  for (const action of actions) {
    if (action.type === 'run_macro' && action.macro) {
      try {
        const macroActions = resolveMacro(action.macro, opts.config);
        const subLogs = await executeActions(macroActions, ctx, opts);
        logs.push(...subLogs);
      } catch (e) {
        console.error(`[ACTION EXECUTOR] Error resolving macro ${action.macro}:`, e);
        logs.push({ action, status: 'ERROR', error: String(e), timestamp: Date.now() });
      }
      continue;
    }

    const resolved = resolvePlaceholders(action, ctx);
    await resolveStatePlaceholders(resolved);

    const targetId = ctx.post?.id ?? ctx.comment?.id ?? '';
    let targetUrl = '';
    if (ctx.post) {
      targetUrl = `https://reddit.com/r/${ctx.subredditName}/comments/${ctx.post.id.replace('t3_', '')}`;
    } else if (ctx.comment) {
      targetUrl = `https://reddit.com/r/${ctx.subredditName}/comments/${ctx.comment.postId.replace('t3_', '')}/comment/${ctx.comment.id.replace('t1_', '')}`;
    }

    const metadata = {
      ruleName: opts.ruleName,
      targetId,
      targetUrl,
      targetAuthor: ctx.author.username,
    };

    if (opts.dryRun) {
      logs.push({ action: resolved, status: 'DRY_RUN', timestamp: Date.now(), ...metadata });
      continue;
    }

    // Rate Limiting Check
    if (opts.config.settings?.max_actions_per_user_per_hour) {
      const max = opts.config.settings.max_actions_per_user_per_hour;
      const throttleKey = `modkit:throttle:${ctx.author.username}`;
      const count = await redis.incrBy(throttleKey, 1);
      if (count === 1) await redis.expire(throttleKey, 3600); // 1 hour
      if (count > max) {
        console.warn(`[ACTION EXECUTOR] Throttled ${ctx.author.username}: Exceeded ${max} actions/hour`);
        logs.push({ action: resolved, status: 'ERROR', error: `Throttled: Exceeded ${max} actions/hour`, timestamp: Date.now(), ...metadata });
        break;
      }
    }

    try {
      if (action.type === 'stop_if') {
        let shouldStop = true;
        if (action.conditions && action.conditions.length > 0) {
           shouldStop = await evaluateConditions(action.conditions, ctx);
        }
        
        if (shouldStop) {
           console.log(`[ACTION EXECUTOR] stop_if condition met. Halting execution.`);
           logs.push({ action: resolved, status: 'SUCCESS', timestamp: Date.now(), ...metadata });
           break;
        } else {
           console.log(`[ACTION EXECUTOR] stop_if condition not met. Continuing execution.`);
           logs.push({ action: resolved, status: 'SUCCESS', timestamp: Date.now(), ...metadata });
           continue;
        }
      }

      if (action.type === 'if') {
        let shouldRun = false;
        if (action.conditions && action.conditions.length > 0) {
          shouldRun = await evaluateConditions(action.conditions, ctx);
        }
        
        if (shouldRun && action.then) {
          console.log(`[ACTION EXECUTOR] if condition met. Executing then block.`);
          logs.push({ action: resolved, status: 'SUCCESS', timestamp: Date.now(), ...metadata });
          const subLogs = await executeActions(action.then, ctx, opts);
          logs.push(...subLogs);
        } else {
          console.log(`[ACTION EXECUTOR] if condition not met. Skipping then block.`);
          logs.push({ action: resolved, status: 'SUCCESS', timestamp: Date.now(), ...metadata });
        }
        continue;
      }

      await dispatch(resolved, ctx, opts);
      console.log(`[ACTION EXECUTOR] Successfully executed: ${action.type}`);
      logs.push({ action: resolved, status: 'SUCCESS', timestamp: Date.now(), ...metadata });
    } catch (e) {
      console.error(`[ACTION EXECUTOR] Error executing ${action.type}:`, e);
      logs.push({ action: resolved, status: 'ERROR', error: String(e), timestamp: Date.now(), ...metadata });
    }
  }

  if (opts.config.settings?.enable_action_log !== false) {
    await appendToLog(logs, opts.ruleName);
  }

  return logs;
}

async function dispatch(action: ActionBlock, ctx: EventContext, opts: ExecOptions) {
  const sub = ctx.subredditName;

  switch (action.type) {
    // Post
    case 'remove_post': {
      if (!ctx.post?.id) throw new Error("Action 'remove_post' requires a post context");
      return reddit.remove(ctx.post.id as any, action.spam ?? false);
    }
    case 'approve_post': {
      if (!ctx.post?.id) throw new Error("Action 'approve_post' requires a post context");
      return reddit.approve(ctx.post.id as any);
    }
    case 'lock_post': {
      if (!ctx.post?.id) throw new Error("Action 'lock_post' requires a post context");
      return (await reddit.getPostById(ctx.post.id as any)).lock();
    }
    case 'unlock_post': {
      if (!ctx.post?.id) throw new Error("Action 'unlock_post' requires a post context");
      return (await reddit.getPostById(ctx.post.id as any)).unlock();
    }
    case 'set_post_flair': {
      if (!ctx.post?.id) throw new Error("Action 'set_post_flair' requires a post context");
      return reddit.setPostFlair({
        subredditName: sub,
        postId: ctx.post.id as any,
        text: action.flair_text,
        cssClass: action.flair_css_class,
        backgroundColor: resolveFlairColor(action.color),
        textColor: action.text_color as any,
      });
    }
    case 'mark_post_nsfw': {
      if (!ctx.post?.id) throw new Error("Action 'mark_post_nsfw' requires a post context");
      return (await reddit.getPostById(ctx.post.id as any)).markAsNsfw();
    }
    case 'unmark_post_nsfw': {
      if (!ctx.post?.id) throw new Error("Action 'unmark_post_nsfw' requires a post context");
      return (await reddit.getPostById(ctx.post.id as any)).unmarkAsNsfw();
    }
    case 'mark_post_spoiler': {
      if (!ctx.post?.id) throw new Error("Action 'mark_post_spoiler' requires a post context");
      return (await reddit.getPostById(ctx.post.id as any)).markAsSpoiler();
    }
    case 'unmark_post_spoiler': {
      if (!ctx.post?.id) throw new Error("Action 'unmark_post_spoiler' requires a post context");
      return (await reddit.getPostById(ctx.post.id as any)).unmarkAsSpoiler();
    }

    // Comment
    case 'remove_comment': {
      if (!ctx.comment?.id) throw new Error("Action 'remove_comment' requires a comment context");
      return reddit.remove(ctx.comment.id as any, action.spam ?? false);
    }
    case 'approve_comment': {
      if (!ctx.comment?.id) throw new Error("Action 'approve_comment' requires a comment context");
      return reddit.approve(ctx.comment.id as any);
    }
    case 'lock_comment': {
      if (!ctx.comment?.id) throw new Error("Action 'lock_comment' requires a comment context");
      return (await reddit.getCommentById(ctx.comment.id as any)).lock();
    }
    case 'submit_comment': {
      const targetId = ctx.post?.id ?? ctx.comment?.id;
      if (!targetId) throw new Error("Action 'submit_comment' requires a post or comment context");
      const comment = await reddit.submitComment({ id: targetId as any, text: action.text ?? '' });
      if (action.distinguish) {
        // distinguish(makeSticky?) — pass true only when sticky is also requested
        await comment.distinguish(action.sticky === true);
      }
      return comment;
    }

    // User
    case 'ban_user': {
      if (!ctx.author?.username) throw new Error("Action 'ban_user' requires an author");
      // The Reddit API accepts duration as a number of days (1-999) or undefined for permanent.
      // YAML 'permanent' string must be stripped; any non-numeric value becomes undefined.
      const banDuration: number | undefined =
        (typeof action.duration === 'number' && action.duration > 0)
          ? action.duration
          : undefined;
      return reddit.banUser({
        subredditName: sub,
        username: ctx.author.username,
        duration: banDuration,
        reason: action.reason,
        note: action.mod_note,
        message: action.message,
      });
    }
    case 'unban_user': {
      if (!ctx.author?.username) throw new Error("Action 'unban_user' requires an author");
      return reddit.unbanUser(ctx.author.username, sub);
    }
    case 'mute_user': {
      if (!ctx.author?.username) throw new Error("Action 'mute_user' requires an author");
      return reddit.muteUser({ subredditName: sub, username: ctx.author.username });
    }
    case 'unmute_user': {
      if (!ctx.author?.username) throw new Error("Action 'unmute_user' requires an author");
      return reddit.unmuteUser(ctx.author.username, sub);
    }
    case 'set_user_flair': {
      if (!ctx.author?.username) throw new Error("Action 'set_user_flair' requires an author");
      return reddit.setUserFlair({
        subredditName: sub,
        username: ctx.author.username,
        text: action.flair_text ?? '',
        cssClass: action.flair_css_class,
        backgroundColor: resolveFlairColor(action.color),
        textColor: action.text_color as any,
      });
    }
    case 'clear_user_flair': {
      if (!ctx.author?.username) throw new Error("Action 'clear_user_flair' requires an author");
      return reddit.removeUserFlair(sub, ctx.author.username);
    }
    case 'approve_user': {
      if (!ctx.author?.username) throw new Error("Action 'approve_user' requires an author");
      return reddit.approveUser(ctx.author.username, sub);
    }
    case 'remove_approval': {
      if (!ctx.author?.username) throw new Error("Action 'remove_approval' requires an author");
      return reddit.removeUser(ctx.author.username, sub);
    }

    // Notes
    case 'add_mod_note': {
      if (!ctx.author?.username) throw new Error("Action 'add_mod_note' requires an author");
      return reddit.addModNote({
        subreddit: sub,
        user: ctx.author.username,
        label: action.label as any,
        note: action.note ?? '',
        redditId: ((ctx.post?.id ?? ctx.comment?.id) || undefined) as any,
      });
    }

    // ModMail
    case 'reply_modmail': {
      if (!ctx.modmail?.id) throw new Error("Action 'reply_modmail' requires a modmail context");
      return reddit.modMail.reply({
        conversationId: ctx.modmail.id,
        body: action.text ?? '',
        isInternal: action.internal ?? false,
        isAuthorHidden: action.hidden ?? false,
      });
    }
    case 'send_modmail':
    case 'sendmodmail': {
      const modmailOpts: any = {
        subredditName: sub,
        subject: action.subject ?? 'ModMail from ModKit',
        body: action.body ?? '',
        isAuthorHidden: action.hidden ?? false,
      };
      const targetUser = action.to || (ctx.author ? ctx.author.username : undefined);
      if (targetUser) {
        modmailOpts.to = targetUser;
      }
      return reddit.modMail.createConversation(modmailOpts);
    }

    // Communication
    case 'send_private_message': {
      if (!ctx.author?.username && !action.to) throw new Error("Action 'send_private_message' requires a recipient user");
      return reddit.sendPrivateMessage({ to: action.to || ctx.author.username, subject: action.subject ?? '', text: action.body ?? '' });
    }

    case 'send_webhook': {
      const url = action.url === 'discord'
        ? opts.config.settings?.discord_webhook_url
        : action.url === 'slack'
        ? opts.config.settings?.slack_webhook_url
        : action.url;
      if (!url) throw new Error('Webhook URL not configured');
      
      const fetchHeaders: any = { 'Content-Type': 'application/json' };
      if (action.headers) {
        Object.assign(fetchHeaders, action.headers);
      }
      
      const fetchBody = action.payload 
        ? JSON.stringify(action.payload)
        : JSON.stringify({ 
            content: action.message, // Discord format
            text: action.message      // Slack format
          });

      return fetch(url, {
        method: 'POST',
        headers: fetchHeaders,
        body: fetchBody,
      });
    }

    // Storage
    case 'store_value':       return redis.set(`modkit:custom:${action.key}`, action.value ?? '');
    case 'increment_counter': return redis.incrBy(`modkit:counter:${action.key}`, 1);
    case 'tag_domain': {
      if (!action.domain) return;
      const existing = JSON.parse((await redis.get('modkit:domains')) ?? '{}');
      existing[action.domain] = { tag: action.tag };
      return redis.set('modkit:domains', JSON.stringify(existing));
    }

    case 'stop_if': {
      // evaluated inline by caller
      return;
    }

    // Timing
    case 'delay':
      if (action.duration_ms && action.duration_ms > 0) {
        return new Promise(resolve => setTimeout(resolve, action.duration_ms));
      }
      return;

    default:
      console.error(`Unknown action type: ${action.type}`);
  }
}
