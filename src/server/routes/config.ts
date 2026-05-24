import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import YAML from 'yaml';
import { validateAndMergeFiles } from '../config/validator';
import { syncScheduledTasks } from '../config/syncScheduler';
import type { UiResponse } from '../../shared/types';
import { KEYS } from '../storage/keys';
import { BUILT_IN_TEMPLATES } from '../config/defaults';

export const configRoutes = new Hono();

// GET /api/config — returns current files and parsed config
configRoutes.get('/', async (c) => {
  const filesRecord = await redis.hGetAll(KEYS.CONFIG_FILES);
  const parsed = await redis.get(KEYS.CONFIG_PARSED);
  
  // Backwards compatibility fallback if hash is empty but string exists
  if (Object.keys(filesRecord).length === 0) {
    const legacyYaml = await redis.get(KEYS.CONFIG_YAML);
    if (legacyYaml) {
      filesRecord['legacy_config.yml'] = legacyYaml;
    }
  }

  return c.json({
    files: filesRecord,
    parsed: parsed ? JSON.parse(parsed) : null,
    hasConfig: Object.keys(filesRecord).length > 0,
  });
});

// POST /api/config — validate and save new files
configRoutes.post('/', async (c) => {
  const { files } = await c.req.json<{ files: Record<string, string> }>();
  
  const result = validateAndMergeFiles(files);
  if (!result.valid) {
    return c.json({ success: false, errors: result.errors }, 400);
  }

  // Clear existing files and set new ones
  await redis.del(KEYS.CONFIG_FILES);
  const record: Record<string, string> = {};
  for (const [filename, content] of Object.entries(files)) {
    if (content.trim()) {
      record[filename] = content;
    }
  }

  // Save history snapshot
  const timestamp = Date.now();
  await redis.zAdd(KEYS.CONFIG_HISTORY, {
    member: JSON.stringify({ timestamp, files }),
    score: timestamp
  });

  // Keep a maximum of 20 backups
  await redis.zRemRangeByRank(KEYS.CONFIG_HISTORY, 0, -21);

  await redis.hSet(KEYS.CONFIG_FILES, record);
  await redis.set(KEYS.CONFIG_PARSED, JSON.stringify(result.merged));
    
  // Synchronize scheduled cron tasks with Devvit API
  await syncScheduledTasks(result.merged);

  // Clear legacy key to avoid confusion
  await redis.del(KEYS.CONFIG_YAML);

  return c.json({ success: true, merged: result.merged });
});

// GET /api/config/templates — built-in starter templates
configRoutes.get('/templates', async (c) => {
  return c.json({ templates: BUILT_IN_TEMPLATES });
});
