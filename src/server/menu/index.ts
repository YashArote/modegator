import { Devvit } from '@devvit/public-api';
import { yamlUploadFormKey } from '../forms/yamlUpload';

export function registerMenuItems() {
  // Add a subreddit-level menu item to spawn the Devvit Web dashboard
  Devvit.addMenuItem({
    location: 'subreddit',
    label: '🛡️ Open MG Dashboard',
    forUserType: 'moderator',
    onPress: async (_event, context) => {
      try {
        const subreddit = await context.reddit.getCurrentSubreddit();
        const post = await context.reddit.submitPost({
          title: 'MG Automation Dashboard',
          subredditName: subreddit.name,
          preview: Devvit.createElement(
            'vstack',
            { height: '100%', width: '100%', alignment: 'middle center' },
            Devvit.createElement('text', { size: 'large' }, 'Loading MG Dashboard...')
          ),
        });

        context.ui.showToast('Dashboard post created! Navigating...');
        context.ui.navigateTo(post);
      } catch (e) {
        context.ui.showToast('Failed to create MG dashboard post.');
      }
    }
  });

  Devvit.addMenuItem({
    location: 'post',
    label: '🛡️ MG Actions',
    forUserType: 'moderator',
    onPress: async (_event, context) => {
      context.ui.showToast('MG post actions feature coming soon!');
    }
  });

  Devvit.addMenuItem({
    location: 'comment',
    label: '🛡️ MG Actions',
    forUserType: 'moderator',
    onPress: async (_event, context) => {
      context.ui.showToast('MG comment actions feature coming soon!');
    }
  });
}
