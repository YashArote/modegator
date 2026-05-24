import { reddit } from '@devvit/web/server';
import { evaluateConditionsWithDetails } from './conditionEvaluator';
import { executeActions } from './actionExecutor';
import { resolveMacro } from './macroRunner';
import type { ModKitConfig, EventContext, TestResult } from '../../shared/types';

export async function buildContextFromId(rawId: string, type: string): Promise<EventContext> {
  const subredditName = (await reddit.getCurrentSubreddit()).name;
  
  let id = rawId.trim();
  if (!id.startsWith('t3_') && !id.startsWith('t1_')) {
    id = type.startsWith('Comment') ? `t1_${id}` : `t3_${id}`;
  }

  if (id.startsWith('t3_')) {
    const post = await reddit.getPostById(id as any);
    let author;
    try { author = await reddit.getUserByUsername(post.authorName); } catch (e) { /* ignore */ }
    return {
      type,
      subredditName,
      author: {
        username: author?.username ?? post.authorName,
        isBanned: false, 
        isMod: false,
      },
      post: {
        id: post.id,
        title: post.title,
        body: post.body ?? '',
        domain: '', // Would need to parse URL
        linkType: 'link', // Simplification
        score: post.score,
        reportCount: 0,
        nsfw: post.isNsfw(),
        flairText: post.flair?.text ?? '',
        url: post.url
      }
    };
  } else if (id.startsWith('t1_')) {
    const comment = await reddit.getCommentById(id as any);
    let author;
    try { author = await reddit.getUserByUsername(comment.authorName); } catch (e) { /* ignore */ }
    return {
      type,
      subredditName,
      author: {
        username: author?.username ?? comment.authorName,
      },
      comment: {
        id: comment.id,
        postId: comment.postId,
        body: comment.body ?? '',
        score: comment.score,
        reportCount: 0,
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
      const post = posts[0];
      let author;
      try { author = await reddit.getUserByUsername(post?.authorName ?? ''); } catch (e) { /* ignore */ }
      return { 
        type: triggerType, 
        subredditName,
        author: { username: author?.username ?? post?.authorName ?? '' },
        post: {
          id: post?.id ?? '',
          title: post?.title ?? '',
          body: post?.body ?? '',
          domain: '',
          linkType: 'self',
          score: post?.score ?? 0,
          reportCount: 0,
          nsfw: post?.isNsfw() ?? false,
          flairText: post?.flair?.text ?? '',
          url: post?.url ?? ''
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
    author: { username: 'test_user', karma: 1, accountAgeDays: 1, isMod: false, isBanned: false },
    post: triggerType.startsWith('Post') ? {
      id: 't3_test',
      title: 'Test Post Title',
      body: 'Test post body with http://example.com link',
      domain: 'example.com',
      linkType: 'link',
      score: -5,
      reportCount: 6,
      nsfw: false,
      flairText: '',
      url: 'https://reddit.com'
    } : undefined,
    comment: triggerType.startsWith('Comment') ? {
      id: 't1_test',
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
