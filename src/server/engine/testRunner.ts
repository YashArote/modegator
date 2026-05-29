import { reddit } from '@devvit/web/server';
import { evaluateConditionsWithDetails } from './conditionEvaluator';
import { executeActions } from './actionExecutor';
import { resolveMacro } from './macroRunner';
import type { ModKitConfig, EventContext, TestResult } from '../../shared/types';

// ─── Author Context ───────────────────────────────────────────────────────────

/**
 * Fetches all author-related fields for the condition evaluator.
 * isMod/isBanned/isApproved/flairText/hasModNote do NOT exist as simple properties
 * on the Reddit User object — they require separate API calls per-subreddit.
 */
export async function getAuthorContext(username: string, subredditName: string) {
  let author;
  try {
    author = await reddit.getUserByUsername(username);
  } catch (e) { /* user not found / suspended */ }

  // User.linkKarma + User.commentKarma are direct getters
  const karma = author ? (author.linkKarma ?? 0) + (author.commentKarma ?? 0) : 0;
  // User.createdAt is a Date — compute age in days
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
      // None of these are properties on User — each requires a dedicated API call
      const [mods, bans, approveds, notes, flair] = await Promise.all([
        reddit.getModerators({ subredditName, username: authorUser.username }).all(),
        reddit.getBannedUsers({ subredditName, username: authorUser.username }).all(),
        reddit.getApprovedUsers({ subredditName, username: authorUser.username }).all(),
        reddit.getModNotes({ subreddit: subredditName, user: authorUser.username, limit: 1 }).all(),
        authorUser.getUserFlairBySubreddit(subredditName),
      ]);
      isMod = mods.length > 0;
      isBanned = bans.length > 0;
      isApproved = approveds.length > 0;
      if (notes.length > 0) {
        hasModNote = true;
        modNoteLabel = notes[0]!.userNote?.label ?? '';
      }
      // UserFlair.flairText is the plain-text flair for this user in this subreddit
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

// ─── Post / Comment Context Builders ─────────────────────────────────────────

/**
 * Maps a Reddit Post API object to EventContext.post.
 * FIELD MAPPING (Reddit API name → EventContext name):
 *   Post.title              → post.title         (direct)
 *   Post.body               → post.body          (string | undefined → coerced to string)
 *   Post.score              → post.score         (direct)
 *   Post.numberOfReports    → post.reportCount   (RENAMED — NOT "reportCount" on the API object)
 *   Post.nsfw               → post.nsfw          (boolean getter; also available as isNsfw())
 *   Post.spoiler            → post.spoiler       (boolean getter; also available as isSpoiler())
 *   Post.flair?.text        → post.flairText     (CommonFlair | undefined → text string)
 *   Post.url + .permalink   → post.domain        (computed: extract hostname from external url)
 *   Post.url + .permalink   → post.linkType      (computed: 'self' if url == permalink, else 'link')
 *   Post.url                → post.url           (direct)
 */
function buildPostContext(post: {
  id: any;
  title: string;
  body?: string;
  url: string;
  permalink: string;
  score: number;
  numberOfReports: number;
  nsfw: boolean;
  spoiler: boolean;
  flair?: { text?: string } | null;
}): NonNullable<EventContext['post']> {
  const isSelfPost = !post.url || post.url.endsWith(post.permalink);
  const linkType = isSelfPost ? 'self' : 'link';
  let domain = 'reddit.com';
  if (!isSelfPost && post.url) {
    try {
      domain = new URL(post.url).hostname.replace(/^www\./, '');
    } catch {
      domain = '';
    }
  }

  return {
    id: post.id,
    title: post.title,
    body: post.body ?? '',
    domain,
    linkType,
    score: post.score,
    // Post.nsfw is a boolean getter — NOT a method call
    nsfw: post.nsfw,
    // Post.spoiler is a boolean getter — NOT a method call
    spoiler: post.spoiler,
    // Post.flair is CommonFlair | undefined; .text is the plain text representation
    flairText: post.flair?.text ?? '',
    url: post.url,
  };
}

/**
 * Maps a Reddit Comment API object to EventContext.comment.
 * FIELD MAPPING (Reddit API name → EventContext name):
 *   Comment.body        → comment.body         (string — always defined, no undefined)
 *   Comment.score       → comment.score        (direct)
 *   Comment.numReports  → comment.reportCount  (RENAMED — Note: Comment uses "numReports",
 *                                               Post uses "numberOfReports" — different names!)
 *   Comment.parentId    → comment.isTopLevel   (computed: T3 parent = top-level; T1 = nested reply)
 *   Comment.postId      → comment.postId       (direct)
 */
function buildCommentContext(comment: {
  id: any;
  postId: any;
  body: string;
  score: number;
  numReports: number;
  parentId: string;
}): NonNullable<EventContext['comment']> {
  return {
    id: comment.id,
    postId: comment.postId,
    // Comment.body is always string (unlike Post.body which is string | undefined)
    body: comment.body,
    score: comment.score,
    // parentId is T1 (comment id) | T3 (post id)
    // If parent is a post (starts with t3_), this comment is top-level
    isTopLevel: !comment.parentId.startsWith('t1_'),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds a full EventContext from a Reddit post or comment ID.
 * Used by both the live trigger path and the test runner.
 * Fetches the full object from the Reddit API (getPostById / getCommentById)
 * and maps all fields via buildPostContext / buildCommentContext.
 */
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
    return {
      type,
      subredditName,
      author: authorCtx,
      post: buildPostContext(post),
    };
  }

  if (id.startsWith('t1_')) {
    const comment = await reddit.getCommentById(id as any);
    console.log('--- TestRunner: Fetched Comment Object ---');
    console.log(JSON.stringify(comment.toJSON(), null, 2));
    const authorCtx = await getAuthorContext(comment.authorName, subredditName);
    return {
      type,
      subredditName,
      author: authorCtx,
      comment: buildCommentContext(comment),
    };
  }

  throw new Error('Unsupported ID format');
}

export async function runDryRunTest(
  triggerType: string,
  targetId: string | undefined,
  config: ModKitConfig
): Promise<TestResult[]> {
  const ctx = targetId
    ? await buildContextFromId(targetId, triggerType)
    : await autoFetchContext(triggerType);
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
        const fallbackLogs = await executeActions(
          rule.fallback_actions, ctx,
          { dryRun: true, ruleName: rule.name + ' (Fallback)', config }
        );
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

// ─── Auto-fetch (test runner without a specific ID) ───────────────────────────

async function autoFetchContext(triggerType: string): Promise<EventContext> {
  const subredditName = (await reddit.getCurrentSubreddit()).name;

  // POST triggers — fetch the most recent post
  if (triggerType === 'PostSubmit' || triggerType === 'PostReport' || triggerType === 'PostUpdate') {
    try {
      const posts = await reddit.getNewPosts({ subredditName, limit: 1 }).all();
      if (posts.length > 0) {
        const post = posts[0]!;
        console.log('--- TestRunner (Auto): Fetched Post Object ---');
        console.log(JSON.stringify(post.toJSON(), null, 2));
        const authorCtx = await getAuthorContext(post.authorName, subredditName);
        return {
          type: triggerType,
          subredditName,
          author: authorCtx,
          post: buildPostContext(post),
        };
      }
    } catch (e) {
      console.error('[TestRunner] autoFetchContext (post): API call failed, using synthetic context.', e);
    }
  }

  // COMMENT triggers — try to fetch a real recent comment.
  // Previously this immediately fell back to synthetic (fake) data, which meant all
  // comment condition fields (reportCount, score, isTopLevel, body) used hardcoded values.
  if (triggerType === 'CommentSubmit' || triggerType === 'CommentReport' || triggerType === 'CommentUpdate') {
    try {
      // Scan up to 5 recent posts to find one that has at least one comment
      const posts = await reddit.getNewPosts({ subredditName, limit: 5 }).all();
      for (const post of posts) {
        const comments = await reddit.getComments({ postId: post.id as any, limit: 1 }).all();
        if (comments.length > 0) {
          const comment = comments[0]!;
          console.log('--- TestRunner (Auto): Fetched Comment Object ---');
          console.log(JSON.stringify(comment.toJSON(), null, 2));
          const authorCtx = await getAuthorContext(comment.authorName, subredditName);
          return {
            type: triggerType,
            subredditName,
            author: authorCtx,
            comment: buildCommentContext(comment),
          };
        }
      }
    } catch (e) {
      console.error('[TestRunner] autoFetchContext (comment): API call failed, using synthetic context.', e);
    }
  }

  // Final fallback: synthetic context (for ModMail or when subreddit has no posts/comments)
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
      modNoteLabel: '',
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
      url: 'https://reddit.com',
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
