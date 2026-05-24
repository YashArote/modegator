import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { createServer, getServerPort, reddit } from '@devvit/web/server';

import { configRoutes } from './routes/config';
import { actionRoutes } from './routes/actions';
import { testRoutes } from './routes/test';
import { logRoutes } from './routes/logs';
import { formRoutes } from './routes/forms';

import { menuRoutes } from './routes/menuWebhooks';
import { formWebhookRoutes } from './routes/formWebhooks';
import { triggerRoutes } from './triggers';
import { schedulerRoutes } from './scheduler';
import { debugRoutes } from './routes/debug';

const app = new Hono();
app.use('*', cors());

// Auth Middleware: Restrict all /api/* routes to moderators
app.use('/api/*', async (c, next) => {
  try {
    const user = await reddit.getCurrentUser();
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const subreddit = await reddit.getCurrentSubreddit();
    const permissions = await user.getModPermissionsForSubreddit(subreddit.name);
    
    if (!permissions || permissions.length === 0) {
      return c.json({ error: 'Forbidden. Moderator access only.' }, 403);
    }
    
    await next();
  } catch (e) {
    console.error('Auth middleware error:', e);
    return c.json({ error: 'Failed to verify moderator status' }, 500);
  }
});

app.route('/api/config', configRoutes);
app.route('/api/actions', actionRoutes);
app.route('/api/test', testRoutes);
app.route('/api/logs', logRoutes);
app.route('/api/forms', formRoutes);
app.route('/api/debug', debugRoutes);

// Internal Devvit Webhooks
const internal = new Hono();
internal.route('/menu', menuRoutes);
internal.route('/form', formWebhookRoutes);
internal.route('/triggers', triggerRoutes);
internal.route('/scheduler', schedulerRoutes);

app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
