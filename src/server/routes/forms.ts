import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { KEYS } from '../storage/keys';
import type { ModKitConfig } from '../../shared/types';

export const formRoutes = new Hono();

// GET /api/forms/:location — returns dynamic options for menu form
// location = "post" | "comment" | "subreddit"
formRoutes.get('/:location', async (c) => {
  const location = c.req.param('location');
  const raw = await redis.get(KEYS.CONFIG_PARSED);

  if (!raw) {
    return c.json({ options: [], hasConfig: false });
  }

  const config = JSON.parse(raw) as ModKitConfig;
  const actions = config.ui_actions?.filter(a => a.location === location) ?? [];

  return c.json({
    hasConfig: true,
    options: actions.map(a => ({
      label: a.label,
      value: a.name,
      confirm: a.confirm,
      confirmMessage: a.confirm_message,
    })),
  });
});
