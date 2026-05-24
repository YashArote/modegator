import { Hono } from 'hono';
import { getLogs } from '../storage/logStore';

export const logRoutes = new Hono();

// GET /api/logs — Returns most recent action logs
logRoutes.get('/', async (c) => {
  const limitStr = c.req.query('limit');
  const cursorStr = c.req.query('cursor');
  const limit = limitStr ? parseInt(limitStr, 10) : 50;
  const cursor = cursorStr ? parseInt(cursorStr, 10) : undefined;

  try {
    const logs = await getLogs(limit, cursor);
    return c.json({ success: true, logs: logs ?? [] });
  } catch (e) {
    return c.json({ success: false, error: 'Failed to fetch logs' }, 500);
  }
});
