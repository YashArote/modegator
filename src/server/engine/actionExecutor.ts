import { reddit, redis } from '@devvit/web/server';
import { resolvePlaceholders } from '../../shared/placeholders';
import { appendToLog } from '../storage/logStore';
import { resolveMacro } from './macroRunner';
import type { ActionBlock, EventContext, ActionLog, ExecOptions } from '../../shared/types';

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
      await dispatch(resolved, ctx, opts);
      console.log(`[ACTION EXECUTOR] Successfully executed: ${action.type}`);
      logs.push({ action: resolved, status: 'SUCCESS', timestamp: Date.now(), ...metadata });
      
      // Control flow action
      if (action.type === 'stop_if') {
        break;
      }
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
    case 'remove_post':     return reddit.remove(ctx.post!.id as any, action.spam ?? false);
    case 'approve_post':    return reddit.approve(ctx.post!.id as any);
    case 'lock_post':       return (await reddit.getPostById(ctx.post!.id as any)).lock();
    case 'unlock_post':     return (await reddit.getPostById(ctx.post!.id as any)).unlock();
    case 'set_post_flair':
      return reddit.setPostFlair({ subredditName: sub, postId: ctx.post!.id as any, text: action.flair_text, cssClass: action.flair_css_class });
    case 'mark_post_nsfw':   return (await reddit.getPostById(ctx.post!.id as any)).markAsNsfw();
    case 'unmark_post_nsfw': return (await reddit.getPostById(ctx.post!.id as any)).unmarkAsNsfw();
    case 'mark_post_spoiler':   return (await reddit.getPostById(ctx.post!.id as any)).markAsSpoiler();
    case 'unmark_post_spoiler': return (await reddit.getPostById(ctx.post!.id as any)).unmarkAsSpoiler();

    // Comment
    case 'remove_comment':  return reddit.remove(ctx.comment!.id as any, action.spam ?? false);
    case 'approve_comment': return reddit.approve(ctx.comment!.id as any);
    case 'lock_comment':    return (await reddit.getCommentById(ctx.comment!.id as any)).lock();
    case 'submit_comment': {
      const targetId = ctx.post?.id ?? ctx.comment?.id ?? '';
      const comment = await reddit.submitComment({ id: targetId as any, text: action.text ?? '' });
      if (action.distinguish) {
        const c = await reddit.getCommentById(comment.id as any);
        if (action.sticky) await c.distinguish(true);
        else await c.distinguish(false);
      }
      return comment;
    }

    // User
    case 'ban_user':
      return reddit.banUser({
        subredditName: sub,
        username: ctx.author.username,
        duration: action.duration === 'permanent' ? undefined : action.duration,
        reason: action.reason,
        note: action.mod_note,
        message: action.message,
      });
    case 'unban_user':     return reddit.unbanUser(ctx.author.username, sub);
    case 'mute_user':      return reddit.muteUser({ subredditName: sub, username: ctx.author.username });
    case 'unmute_user':    return reddit.unmuteUser(ctx.author.username, sub);
    case 'set_user_flair':
      return reddit.setUserFlair({ subredditName: sub, username: ctx.author.username, text: action.flair_text ?? '' });
    case 'clear_user_flair':
      return reddit.removeUserFlair(sub, ctx.author.username);
    case 'approve_user':   return reddit.approveUser(ctx.author.username, sub);
    case 'remove_approval': return reddit.removeUser(ctx.author.username, sub);

    // Notes
    case 'add_mod_note':
      return reddit.addModNote({
        subreddit: sub,
        user: ctx.author.username,
        label: action.label as any,
        note: action.note ?? '',
        redditId: (ctx.post?.id ?? ctx.comment?.id) as any,
      });

    // ModMail
    case 'reply_modmail':
      return reddit.modMail.reply({
        conversationId: ctx.modmail!.id,
        body: action.text ?? '',
        isInternal: action.internal ?? false,
        isAuthorHidden: action.hidden ?? false,
      });
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
    case 'send_private_message':
      return reddit.sendPrivateMessage({ to: action.to || ctx.author.username, subject: action.subject ?? '', text: action.body ?? '' });

    case 'send_webhook': {
      const url = action.url === 'discord'
        ? opts.config.settings?.discord_webhook_url
        : action.url === 'slack'
        ? opts.config.settings?.slack_webhook_url
        : action.url;
      if (!url) throw new Error('Webhook URL not configured');
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: action.message }),
      });
    }

    // Storage
    case 'store_value':       return redis.set(`modkit:custom:${action.key}`, action.value ?? '');
    case 'increment_counter': return redis.incrBy(`modkit:counter:${action.key}`, 1);
    case 'tag_domain': {
      if (!action.domain) return;
      const existing = JSON.parse((await redis.get('modkit:domains')) ?? '{}');
      existing[action.domain] = { label: action.label, color: action.color };
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
