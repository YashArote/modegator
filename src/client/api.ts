const BASE = '/api';

const handleResponse = async (r: Response) => {
  if (r.status === 403) {
    throw new Error('FORBIDDEN');
  }
  return r.json();
};

export const api = {
  config: {
    get: () => fetch(`${BASE}/config`).then(handleResponse),
    save: (files: Record<string, string>) => fetch(`${BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    }).then(handleResponse),
    templates: () => fetch(`${BASE}/config/templates`).then(handleResponse),
  },
  forms: {
    options: (location: string) => fetch(`${BASE}/forms/${location}`).then(handleResponse),
  },
  actions: {
    execute: (actionName: string, targetId: string, targetType: 'post' | 'comment' | 'subreddit') =>
      fetch(`${BASE}/actions/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionName, targetId, targetType }),
      }).then(handleResponse),
  },
  test: {
    run: (triggerType: string, targetId?: string) =>
      fetch(`${BASE}/test/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType, targetId }),
      }).then(handleResponse),
    last: () => fetch(`${BASE}/test/last`).then(handleResponse),
  },
  logs: {
    recent: (limit = 50, cursor?: number) => {
      let url = `${BASE}/logs?limit=${limit}`;
      if (cursor) url += `&cursor=${cursor}`;
      return fetch(url).then(handleResponse);
    },
  },
};
