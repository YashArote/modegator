import { Hono } from 'hono';
import { redis, reddit } from '@devvit/web/server';
import { KEYS } from '../storage/keys';
import { evaluateConditions } from '../engine/conditionEvaluator';
import { executeActions } from '../engine/actionExecutor';
import { resolveMacro } from '../engine/macroRunner';
import { buildContextFromId } from '../engine/testRunner';
import type { ModKitConfig, EventContext } from '../../shared/types';

export const triggerRoutes = new Hono();

async function loadConfig(): Promise<ModKitConfig | null> {
  const raw = await redis.get(KEYS.CONFIG_PARSED);
  if (!raw) return null;
  return JSON.parse(raw) as ModKitConfig;
}

// A generic webhook handler for Devvit Trigger Events
async function handleTriggerEvent(c: any, eventName: string) {
  const payload = await c.req.json();
  const event = payload.event || payload; // Depending on Devvit webhook format, the event might be wrapped

  console.log(`\n[TRIGGER EVENT] Received event: ${eventName}`);
  if (eventName === 'ModMail') {
    console.log(`[TRIGGER EVENT] Raw ModMail Payload:`, JSON.stringify(event));
  }

  const config = await loadConfig();
  if (!config) {
    console.log(`[TRIGGER EVENT] Ignored: No configuration found in Redis.`);
    return c.json({ success: false, reason: 'No config' }, 200);
  }

  const rules = config.rules?.filter(r => r.trigger.event === eventName) ?? [];
  if (rules.length === 0) {
    console.log(`[TRIGGER EVENT] Ignored: No active rules target the event '${eventName}'.`);
    return c.json({ success: true, reason: 'No rules matched trigger' }, 200);
  }

  let ctx: EventContext;
  
  try {
    if (eventName.startsWith('Post') && event.post?.id) {
      ctx = await buildContextFromId(event.post.id, eventName);
      if (event.report) {
        ctx.report = { reason: event.report.reason };
      }
    } else if (eventName.startsWith('Comment') && event.comment?.id) {
      ctx = await buildContextFromId(event.comment.id, eventName);
      if (event.report) {
        ctx.report = { reason: event.report.reason };
      }
    } else if (eventName === 'ModMail') {
      const subredditName = (await reddit.getCurrentSubreddit()).name;
      let subject = '';
      let body = '';
      if (event.conversationId) {
        try {
          const convo = await reddit.modMail.getConversation({ conversationId: event.conversationId });
          subject = convo.conversation?.subject ?? '';
          
          // Get the body of the most recent message
          if (convo.conversation?.messages) {
            const messages = Object.values(convo.conversation.messages);
            if (messages.length > 0) {
              body = messages[messages.length - 1].bodyMarkdown ?? messages[messages.length - 1].body ?? '';
            }
          }
        } catch (e) {
          console.error("Failed to fetch ModMail conversation data:", e);
        }
      }

      ctx = {
        type: eventName,
        subredditName,
        author: { username: event.messageAuthor?.name ?? event.author?.name ?? 'unknown' },
        modmail: {
          id: event.conversationId ?? '',
          subject: subject,
          body: body,
        }
      };
    } else {
      return c.json({ success: false, reason: 'Invalid event payload' }, 400);
    }
  } catch (err) {
    console.error('Error building context for trigger', err);
    return c.json({ success: false, reason: 'Failed to build context' }, 500);
  }

  try {
    const appUser = await reddit.getAppUser();
    if (ctx.author.username === appUser.username) {
      console.log(`[TRIGGER EVENT] Ignored: Event triggered by the bot itself.`);
      return c.json({ success: true, reason: 'Ignored bot action' }, 200);
    }
  } catch (err) {
    console.error('Failed to check app user', err);
  }

  console.log(`[TRIGGER EVENT] Context successfully built for target ID: ${ctx.post?.id ?? ctx.comment?.id ?? ctx.modmail?.id ?? 'Unknown'}`);

  for (const rule of rules) {
    console.log(`[TRIGGER EVENT] Evaluating rule: "${rule.name}"`);
    const matched = await evaluateConditions(rule.conditions ?? [], ctx);
    
    if (matched) {
      console.log(`[TRIGGER EVENT] Rule "${rule.name}" PASSED. Executing primary actions...`);
      const actions = rule.run_macro ? resolveMacro(rule.run_macro, config) : rule.actions ?? [];
      await executeActions(actions, ctx, { dryRun: config.settings?.dry_run_mode ?? false, ruleName: rule.name, config });
    } else {
      console.log(`[TRIGGER EVENT] Rule "${rule.name}" FAILED.`);
      if (rule.fallback_actions && rule.fallback_actions.length > 0) {
        console.log(`[TRIGGER EVENT] Rule "${rule.name}" fallback_actions found. Executing fallback actions...`);
        await executeActions(rule.fallback_actions, ctx, { dryRun: config.settings?.dry_run_mode ?? false, ruleName: rule.name + ' (Fallback)', config });
      }
    }
  }

  console.log(`[TRIGGER EVENT] Processing complete for ${eventName}.`);

  return c.json({ success: true }, 200);
}

triggerRoutes.post('/on-post-submit', (c) => handleTriggerEvent(c, 'PostSubmit'));
triggerRoutes.post('/on-comment-create', (c) => handleTriggerEvent(c, 'CommentSubmit'));
triggerRoutes.post('/on-post-report', (c) => handleTriggerEvent(c, 'PostReport'));
triggerRoutes.post('/on-comment-report', (c) => handleTriggerEvent(c, 'CommentReport'));
triggerRoutes.post('/on-post-update', (c) => handleTriggerEvent(c, 'PostUpdate'));
triggerRoutes.post('/on-comment-update', (c) => handleTriggerEvent(c, 'CommentUpdate'));
triggerRoutes.post('/on-mod-mail', (c) => handleTriggerEvent(c, 'ModMail'));
