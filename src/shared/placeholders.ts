import { ActionBlock, EventContext } from './types';

export function replaceStringPlaceholders(str: string, ctx: EventContext): string {
  if (!str) return str;

  const now = new Date();
  const date = now.toISOString().split('T')[0] ?? '';
  const time = (now.toISOString().split('T')[1] ?? '').substring(0, 5);

  const baseTokens: Record<string, string | undefined> = {
    'author': ctx.author.username ?? '',
    'author_name': ctx.author.username ?? '',
    'post_id': ctx.post?.id ?? '',
    'post_title': ctx.post?.title ?? '',
    'post_url': ctx.post?.url ?? '',
    'post_domain': ctx.post?.domain ?? '',
    'post_flair': ctx.post?.flairText ?? '',
    'comment_id': ctx.comment?.id ?? '',
    'comment_body': (ctx.comment?.body ?? '').substring(0, 500),
    'subreddit': ctx.subredditName ?? '',
    'report_reason': ctx.report?.reason ?? '',
    'date': date,
    'time': time,
    'author_karma': String(ctx.author.karma ?? 0),
    'author_age_days': String(ctx.author.accountAgeDays ?? 0),
  };

  // Find all {{...}} patterns
  let replaced = str;
  const matches = replaced.match(/\{\{([^}]+)\}\}/g);
  
  if (matches) {
    for (const match of matches) {
      // match is e.g. "{{author | lowercase}}"
      const inner = match.slice(2, -2).trim();
      const parts = inner.split('|').map(p => p.trim());
      
      const tokenKey = parts[0];
      if (tokenKey) {
        let val = baseTokens[tokenKey];
        
        if (val !== undefined) {
          // Apply pipeline filters
          for (let i = 1; i < parts.length; i++) {
            const filter = parts[i];
            if (filter === 'lowercase') val = val.toLowerCase();
            else if (filter === 'uppercase') val = val.toUpperCase();
            else if (filter === 'trim') val = val.trim();
          }
          
          replaced = replaced.replace(match, val);
        }
      }
    }
  }

  return replaced;
}

export function resolveObjectPlaceholders(obj: any, ctx: EventContext): any {
  if (!obj) return obj;
  if (typeof obj === 'string') return replaceStringPlaceholders(obj, ctx);
  if (Array.isArray(obj)) return obj.map(item => resolveObjectPlaceholders(item, ctx));
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveObjectPlaceholders(v, ctx);
    }
    return result;
  }
  return obj;
}

export function resolvePlaceholders(action: ActionBlock, ctx: EventContext): ActionBlock {
  const newAction = { ...action };

  const update = (key: keyof ActionBlock) => {
    if (typeof newAction[key] === 'string') {
      (newAction as any)[key] = replaceStringPlaceholders(newAction[key] as string, ctx);
    }
  };

  update('text');
  update('reason');
  update('mod_note');
  update('message');
  update('note');
  update('to');
  update('subject');
  update('body');
  if (newAction.url && newAction.url !== 'discord' && newAction.url !== 'slack') {
    update('url');
  }
  update('key');
  update('domain');
  update('tag');
  update('value');

  if (newAction.headers) {
    newAction.headers = resolveObjectPlaceholders(newAction.headers, ctx);
  }
  if (newAction.payload) {
    newAction.payload = resolveObjectPlaceholders(newAction.payload, ctx);
  }

  return newAction;
}
