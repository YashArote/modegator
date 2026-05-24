import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit, redis } from '@devvit/web/server';

export const menuRoutes = new Hono();

menuRoutes.post('/dashboard', async (c) => {
  try {
    const subreddit = await reddit.getCurrentSubreddit();
    let postId = await redis.get(KEYS.DASHBOARD_POST_ID);

    // Verify the post still exists
    if (postId) {
      try {
        const existingPost = await reddit.getPostById(postId);
        if (!existingPost) {
          postId = undefined;
        }
      } catch (e) {
        postId = undefined;
      }
    }

    if (!postId) {
      // Create a new one
      const post = await reddit.submitCustomPost({
        title: 'MG Automation Dashboard [Private Mod Portal]',
        subredditName: subreddit.name,
      });
      postId = post.id;

      // Save to Redis
      await redis.set(KEYS.DASHBOARD_POST_ID, postId);

      // Immediately hide it from normal users by removing and locking it
      try {
        await post.remove();
        await post.lock();
      } catch (e) {
        console.warn('Failed to lock/remove dashboard post', e);
      }
    }

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId}`,
        showToast: 'Opening MG Dashboard...',
      },
      200
    );
  } catch (error) {
    console.error(`Error handling MG dashboard menu: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to open MG dashboard.',
      },
      200
    );
  }
});

menuRoutes.post('/yaml-upload', async (c) => {
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'yamlUpload',
        form: {
          title: 'Upload ModKit Configuration',
          description: 'Paste your YAML configuration below.',
          acceptLabel: 'Save Config',
          fields: [
            {
              name: 'yaml',
              label: 'YAML Configuration',
              type: 'string',
              multiline: true,
              required: true,
            },
          ],
        },
      },
    },
    200
  );
});

import { KEYS } from '../storage/keys';
import type { ModKitConfig } from '../../shared/types';

async function loadConfig(): Promise<ModKitConfig | null> {
  const raw = await redis.get(KEYS.CONFIG_PARSED);
  if (!raw) return null;
  return JSON.parse(raw) as ModKitConfig;
}

async function handleActionMenu(location: 'post' | 'comment'): Promise<UiResponse> {
  const config = await loadConfig();
  if (!config || !config.ui_actions || config.ui_actions.length === 0) {
    return { showToast: `No ModKit UI actions configured.` };
  }

  const actions = config.ui_actions.filter(a => a.location === location);
  if (actions.length === 0) {
    return { showToast: `No ModKit UI actions configured for ${location}s.` };
  }

  const targetId = location === 'post' ? context.postId : context.commentId;

  return {
    showForm: {
      name: 'executeUiAction',
      form: {
        title: `ModKit Actions (${location})`,
        description: 'Select an action to execute:',
        acceptLabel: 'Execute',
        fields: [
          {
            name: 'actionName',
            label: 'Action',
            type: 'select',
            required: true,
            options: actions.map(a => ({ label: a.label, value: `${a.name}|${targetId}` })),
          },
        ],
      },
    },
  };
}

menuRoutes.post('/post-actions', async (c) => {
  return c.json<UiResponse>(await handleActionMenu('post'), 200);
});

menuRoutes.post('/comment-actions', async (c) => {
  return c.json<UiResponse>(await handleActionMenu('comment'), 200);
});
