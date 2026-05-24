import { Hono } from 'hono';
import { redis, reddit } from '@devvit/web/server';
import { KEYS } from '../storage/keys';
import { executeActions } from '../engine/actionExecutor';
import { resolveMacro } from '../engine/macroRunner';
import type { ModKitConfig, EventContext } from '../../shared/types';

export const schedulerRoutes = new Hono();

async function loadConfig(): Promise<ModKitConfig | null> {
  const raw = await redis.get(KEYS.CONFIG_PARSED);
  if (!raw) return null;
  return JSON.parse(raw) as ModKitConfig;
}

schedulerRoutes.post('/yaml-runner', async (c) => {
  try {
    const payload = await c.req.json();
    const event = payload.event || payload;
    const taskName = event?.data?.taskName;

    if (!taskName) {
      console.error('Scheduler hit without a taskName in data payload');
      return c.json({ success: false, reason: 'Missing taskName' }, 400);
    }

    const config = await loadConfig();
    if (!config) {
      return c.json({ success: false, reason: 'No config' }, 200);
    }

    const task = config.scheduled?.find(t => t.name === taskName);
    if (!task) {
      console.warn(`Scheduled task '${taskName}' not found in config. Probably old cron job.`);
      return c.json({ success: true, reason: 'Task not found in active config' }, 200);
    }

    // Build context for a scheduled task
    const subredditName = (await reddit.getCurrentSubreddit()).name;
    const ctx: EventContext = {
      type: 'ScheduledTask',
      subredditName,
      author: { username: 'AutoModerator' } // System context
    };

    const actions = task.run_macro ? resolveMacro(task.run_macro, config) : task.actions ?? [];
    
    // Execute
    await executeActions(actions, ctx, { dryRun: config.settings?.dry_run_mode ?? false, ruleName: task.name, config });

    return c.json({ success: true }, 200);
  } catch (err) {
    console.error('Error in scheduled task execution', err);
    return c.json({ success: false, error: String(err) }, 500);
  }
});
