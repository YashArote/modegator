import { reddit } from '@devvit/web/server';
import { Hono } from 'hono';
import { appendToLog } from '../storage/logStore';
import type { ActionLog } from '../../shared/types';

export const debugRoutes = new Hono();

debugRoutes.get('/ping', async (c) => {
  try {
    const sub = await reddit.getCurrentSubreddit();
    return c.json({ success: true, sub: sub.name });
  } catch (e: any) {
    return c.json({ success: false, error: e.message, stack: e.stack });
  }
});

debugRoutes.get('/post/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const post = await reddit.getPostById(id as any);
    return c.json({ 
      success: true, 
      id: post.id, 
      title: post.title, 
      author: post.authorName,
      isNsfw: typeof post.isNsfw === 'function' ? post.isNsfw() : 'not a function'
    });
  } catch (e: any) {
    return c.json({ success: false, error: e.message, stack: e.stack });
  }
});

debugRoutes.get('/inject-mock', async (c) => {
  try {
    const mockLog: ActionLog = {
      action: { type: 'remove_post', spam: true },
      status: 'SUCCESS',
      timestamp: Date.now(),
      ruleName: 'Spam Filter Test',
      targetId: 't3_1tlpxur',
      targetUrl: 'https://www.reddit.com/r/modgator_dev/comments/1tlpxur/test_finale/',
      targetAuthor: 'YashArote'
    };
    
    await appendToLog([mockLog], 'Spam Filter Test');
    return c.json({ success: true, message: 'Mock log injected!' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message });
  }
});
