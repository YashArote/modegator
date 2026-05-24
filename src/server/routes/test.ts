import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { KEYS } from '../storage/keys';
import { runDryRunTest } from '../engine/testRunner';

export const testRoutes = new Hono();

// POST /api/test/run
// triggerType: string
// targetId?: string — if omitted, auto-fetches most recent post/comment
testRoutes.post('/run', async (c) => {
  const { triggerType, targetId } = await c.req.json<{
    triggerType: string;
    targetId?: string;
  }>();

  const raw = await redis.get(KEYS.CONFIG_PARSED);
  if (!raw) return c.json({ success: false, error: 'No config' }, 400);

  try {
    const config = JSON.parse(raw);
    const results = await runDryRunTest(triggerType, targetId, config);
    await redis.set(KEYS.LAST_TEST_RESULT, JSON.stringify({ results, triggerType, timestamp: Date.now() }));

    return c.json({ success: true, results });
  } catch (err: any) {
    console.error('Test execution error:', err);
    return c.json({ success: false, error: String(err.message || err) }, 500);
  }
});

// GET /api/test/last — retrieve last test result for display
testRoutes.get('/last', async (c) => {
  const raw = await redis.get(KEYS.LAST_TEST_RESULT);
  return c.json(raw ? JSON.parse(raw) : null);
});
