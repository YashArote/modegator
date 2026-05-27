import { reddit } from '@devvit/web/server';
import { evaluateConditionsWithDetails } from './conditionEvaluator';
import { executeActions } from './actionExecutor';
import { resolveMacro } from './macroRunner';
import type { ModKitConfig, EventContext, TestResult } from '../../shared/types';

async function getAuthorContext(username: string, subredditName: string) {
  let author;
  try {
    author = await reddit.getUserByUsername(username);
  } catch (e) { /* ignore */ }

  const karma = author ? (author.linkKarma ?? 0) + (author.commentKarma ?? 0) : 0;
  const accountAgeDays = author?.createdAt 
    ? Math.floor((Date.now() - new Date(author.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  let isMod = false;
  let isBanned = false;
  let isApproved = false;
  let hasModNote = false;
  let modNoteLabel = '';
  let flairText = '';

  if (author?.username) {
    const authorUser = author;
    try {
      const [mods, bans, approveds, notes, flair] = await Promise.all([
        reddit.getModerators({ subredditName, username: authorUser.username }).all(),
        reddit.getBannedUsers({ subredditName, username: authorUser.username }).all(),
        reddit.getApprovedUsers({ subredditName, username: authorUser.username }).all(),
        reddit.getModNotes({ subreddit: subredditName, user: authorUser.username, limit: 1 }).all(),
        authorUser.getUserFlairBySubreddit(subredditName)
      ]);
      isMod = mods.length > 0;
      isBanned = bans.length > 0;
      isApproved = approveds.length > 0;
      if (notes.length > 0) {
        hasModNote = true;
        modNoteLabel = notes[0]!.userNote?.label ?? '';
      }
      flairText = flair?.flairText ?? '';
    } catch (e) {
      console.error(`Failed to fetch additional author data for ${authorUser.username}`, e);
    }
  }

  return {
    username: author?.username ?? username,
    karma,
    accountAgeDays,
    isMod,
    isBanned,
    isApproved,
    flairText,
    hasModNote,
    modNoteLabel,
  };
}

export async function buildContextFromId(rawId: string, type: string): Promise<EventContext> {
  const subredditName = (await reddit.getCurrentSubreddit()).name;
  
  let id = rawId.trim();
  if (!id.startsWith('t3_') && !id.startsWith('t1_')) {
    id = type.startsWith('Comment') ? `t1_${id}` : `t3_${id}`;
  }

  if (id.startsWith('t3_')) {
    const post = await reddit.getPostById(id as any);
    console.log('--- TestRunner: Fetched Post Object ---');
    console.log(JSON.stringify(post.toJSON(), null, 2));
    
    const authorCtx = await getAuthorContext(post.authorName, subredditName);

    // Parse domain
    let domain = '';
    const isSelfPost = !post.url || post.url.endsWith(post.permalink);
    const linkType = isSelfPost ? 'self' : 'link';
    if (!isSelfPost && post.url) {
      try {
        const url = new URL(post.url);
        domain = url.hostname.replace(/^www\./, '');
      } catch (e) {
        domain = '';
      }
    } else {
      domain = 'reddit.com';
    }

    return {
      type,
      subredditName,
      author: authorCtx,
      post: {
        id: post.id,
        title: post.title,
        body: post.body ?? '',
        domain,
        linkType,
        score: post.score,
        reportCount: post.numberOfReports ?? 0,
        nsfw: post.isNsfw(),
        spoiler: post.isSpoiler(),
        flairText: post.flair?.text ?? '',
        url: post.url
      }
    };
  } else if (id.startsWith('t1_')) {
    const comment = await reddit.getCommentById(id as any);
    console.log('--- TestRunner: Fetched Comment Object ---');
    console.log(JSON.stringify(comment.toJSON(), null, 2));
    
    const authorCtx = await getAuthorContext(comment.authorName, subredditName);

    return {
      type,
      subredditName,
      author: authorCtx,
      comment: {
        id: comment.id,
        postId: comment.postId,
        body: comment.body ?? '',
        score: comment.score,
        reportCount: comment.numReports ?? 0,
        isTopLevel: !comment.parentId.startsWith('t1_'),
      }
    };
  }

  throw new Error('Unsupported ID format');
}

export async function runDryRunTest(
  triggerType: string,
  targetId: string | undefined,
  config: ModKitConfig
): Promise<TestResult[]> {

  const ctx = targetId ? await buildContextFromId(targetId, triggerType) : await autoFetchContext(triggerType);
  const results: TestResult[] = [];

  for (const rule of config.rules ?? []) {
    if (rule.trigger.event !== triggerType) continue;

    const { passed, details } = await evaluateConditionsWithDetails(rule.conditions ?? [], ctx);

    if (passed) {
      const actions = rule.run_macro ? resolveMacro(rule.run_macro, config) : rule.actions ?? [];
      const actionLogs = await executeActions(actions, ctx, { dryRun: true, ruleName: rule.name, config });
      
      results.push({
        ruleName: rule.name,
        matched: true,
        conditionResults: details,
        actionLogs,
        dataSource: targetId ? 'specific' : 'auto-fetched',
      });
    } else {
      results.push({
        ruleName: rule.name,
        matched: false,
        conditionResults: details,
        actionLogs: [],
        dataSource: targetId ? 'specific' : 'auto-fetched',
      });
      
      if (rule.fallback_actions && rule.fallback_actions.length > 0) {
        const fallbackLogs = await executeActions(rule.fallback_actions, ctx, { dryRun: true, ruleName: rule.name + ' (Fallback)', config });
        results.push({
          ruleName: rule.name + ' (Fallback)',
          matched: true,
          conditionResults: [],
          actionLogs: fallbackLogs,
          dataSource: targetId ? 'specific' : 'auto-fetched',
        });
      }
    }
  }

  return results;
}

async function autoFetchContext(triggerType: string): Promise<EventContext> {
  const subredditName = (await reddit.getCurrentSubreddit()).name;

  if (triggerType === 'PostSubmit' || triggerType === 'PostReport' || triggerType === 'PostUpdate') {
    const posts = await reddit.getNewPosts({ subredditName, limit: 1 }).all();
    if (posts.length > 0) {
      const post = posts[0]!;
      console.log('--- TestRunner (Auto): Fetched Post Object ---');
      console.log(JSON.stringify(post.toJSON(), null, 2));
      
      const authorCtx = await getAuthorContext(post.authorName, subredditName);

      // Parse domain
      let domain = '';
      const isSelfPost = !post.url || post.url.endsWith(post.permalink);
      const linkType = isSelfPost ? 'self' : 'link';
      if (!isSelfPost && post.url) {
        try {
          const url = new URL(post.url);
          domain = url.hostname.replace(/^www\./, '');
        } catch (e) {
          domain = '';
        }
      } else {
        domain = 'reddit.com';
      }

      return { 
        type: triggerType, 
        subredditName,
        author: authorCtx,
        post: {
          id: post.id,
          title: post.title,
          body: post.body ?? '',
          domain,
          linkType,
          score: post.score,
          reportCount: post.numberOfReports ?? 0,
          nsfw: post.isNsfw(),
          spoiler: post.isSpoiler(),
          flairText: post.flair?.text ?? '',
          url: post.url
        }
      };
    }
  }

  if (triggerType === 'CommentSubmit' || triggerType === 'CommentReport' || triggerType === 'CommentUpdate') {
    return buildSyntheticContext(triggerType, subredditName);
  }

  return buildSyntheticContext(triggerType, subredditName);
}

function buildSyntheticContext(triggerType: string, subredditName: string): EventContext {
  return {
    type: triggerType,
    subredditName,
    synthetic: true,
    author: {
      username: 'test_user',
      karma: 1,
      accountAgeDays: 1,
      isMod: false,
      isBanned: false,
      isApproved: false,
      flairText: '',
      hasModNote: false,
      modNoteLabel: ''
    },
    post: triggerType.startsWith('Post') ? {
      id: 't3_test',
      title: 'Test Post Title',
      body: 'Test post body with http://example.com link',
      domain: 'example.com',
      linkType: 'link',
      score: -5,
      reportCount: 6,
      nsfw: false,
      spoiler: false,
      flairText: '',
      url: 'https://reddit.com'
    } : undefined,
    comment: triggerType.startsWith('Comment') ? {
      id: 't1_test',
      postId: 't3_test',
      body: 'Test comment body',
      score: -10,
      reportCount: 3,
      isTopLevel: true,
    } : undefined,
    modmail: triggerType === 'ModMail' ? {
      id: 'test_conversation',
      subject: 'ban appeal',
      body: 'I am sorry please unban me',
    } : undefined,
  };
}
