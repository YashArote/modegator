import { Hono } from 'hono';
import { redis, reddit } from '@devvit/web/server';
import { KEYS } from '../storage/keys';
import { executeActions } from '../engine/actionExecutor';
import { resolveMacro } from '../engine/macroRunner';
import { checkRateLimit } from '../engine/rateGuard';
import { buildContextFromId } from '../engine/testRunner';
import type { ModKitConfig } from '../../shared/types';

export const actionRoutes = new Hono();

// POST /api/actions/execute — run a ui_action by name
actionRoutes.post('/execute', async (c) => {
  const { actionName, targetId, targetType } = await c.req.json<{
    actionName: string;
    targetId: string;      // post or comment Reddit ID
    targetType: 'post' | 'comment' | 'subreddit';
  }>();

  const raw = await redis.get(KEYS.CONFIG_PARSED);
  if (!raw) return c.json({ success: false, error: 'No config loaded' }, 400);

  const config = JSON.parse(raw) as ModKitConfig;
  const action = config.ui_actions?.find(a => a.name === actionName);
  if (!action) return c.json({ success: false, error: 'Action not found' }, 404);

  // Rate limiting
  const username = await reddit.getCurrentUsername();
  const allowed = await checkRateLimit(username, config.settings?.max_actions_per_user_per_hour ?? 10);
  if (!allowed) return c.json({ success: false, error: 'Rate limit exceeded' }, 429);

  // Build event context from the target ID
  let eventCtx;
  if (targetType === 'subreddit') {
    const subredditName = (await reddit.getCurrentSubreddit()).name;
    eventCtx = { type: 'ui_action', subredditName, author: { username: username ?? 'unknown' } };
  } else {
    eventCtx = await buildContextFromId(targetId, targetType);
  }

  const actions = action.run_macro
    ? resolveMacro(action.run_macro, config)
    : action.actions ?? [];

  const dryRun = config.settings?.dry_run_mode ?? false;
  const logs = await executeActions(actions, eventCtx, { dryRun, ruleName: action.label, config });

  return c.json({ success: true, logs });
});
