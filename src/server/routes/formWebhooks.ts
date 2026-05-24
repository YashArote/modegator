import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import YAML from 'yaml';
import { redis } from '@devvit/web/server';
import { validateAndMergeFiles } from '../config/validator';
import { syncScheduledTasks } from '../config/syncScheduler';
import { KEYS } from '../storage/keys';
import { buildContextFromId } from '../engine/testRunner';
import { executeActions } from '../engine/actionExecutor';
import { resolveMacro } from '../engine/macroRunner';
import type { ModKitConfig, EventContext } from '../../shared/types';
import { context } from '@devvit/web/server';

export const formWebhookRoutes = new Hono();

formWebhookRoutes.post('/yaml-upload-submit', async (c) => {
  const values = await c.req.json<{ yaml: string }>();
  const yamlString = values.yaml;
  
  if (!yamlString) {
    return c.json<UiResponse>({ showToast: 'YAML configuration cannot be empty.' }, 200);
  }

  try {
    const existingFiles = await redis.hGetAll(KEYS.CONFIG_FILES);
    const filesRecord = Object.keys(existingFiles).length > 0 ? existingFiles : {};
    
    // Extract name from YAML
    const match = yamlString.match(/^name:\s*(.+)$/m);
    let filename = `uploaded-${Date.now()}.yml`;
    if (match && match[1].trim()) {
      filename = match[1].trim().replace(/['"]/g, '');
      if (!filename.endsWith('.yml')) filename += '.yml';
    }
    
    filesRecord[filename] = yamlString;

    const result = validateAndMergeFiles(filesRecord);
    if (!result.valid) {
      return c.json<UiResponse>({ showToast: `Validation Failed: ${result.errors?.join(', ')}` }, 200);
    }

    await redis.hSet(KEYS.CONFIG_FILES, { [filename]: yamlString });
    await redis.set(KEYS.CONFIG_PARSED, JSON.stringify(result.merged));
    
    // Sync scheduled tasks
    await syncScheduledTasks(result.merged);
    
    return c.json<UiResponse>({ showToast: 'ModKit configuration saved successfully!' }, 200);
  } catch (e) {
    return c.json<UiResponse>({ showToast: 'Failed to parse YAML. Please check for syntax errors.' }, 200);
  }
});

formWebhookRoutes.post('/execute-ui-action', async (c) => {
  const values = await c.req.json<any>();
  let rawActionName = values.actionName;
  if (Array.isArray(rawActionName)) rawActionName = rawActionName[0];
  if (!rawActionName) return c.json<UiResponse>({ showToast: 'No action selected.' }, 200);

  const parts = rawActionName.split('|');
  const actionName = parts[0];
  const targetId = parts[1];

  if (!targetId) {
    return c.json<UiResponse>({ showToast: 'Could not determine target post or comment.' }, 200);
  }

  try {
    const raw = await redis.get(KEYS.CONFIG_PARSED);
    if (!raw) return c.json<UiResponse>({ showToast: 'No ModKit configuration found.' }, 200);
    const config = JSON.parse(raw) as ModKitConfig;

    const actionDef = config.ui_actions?.find(a => a.name === actionName);
    if (!actionDef) return c.json<UiResponse>({ showToast: 'Action definition not found.' }, 200);

    const eventName = targetId.startsWith('t1_') ? 'CommentSubmit' : 'PostSubmit';

    const ctx: EventContext = await buildContextFromId(targetId, eventName);

    const actions = actionDef.run_macro ? resolveMacro(actionDef.run_macro, config) : actionDef.actions ?? [];
    
    await executeActions(actions, ctx, { dryRun: config.settings?.dry_run_mode ?? false, ruleName: actionDef.name, config });

    return c.json<UiResponse>({ showToast: `Executed "${actionDef.label}" successfully!` }, 200);

  } catch (e: any) {
    console.error(`Error executing UI Action: ${e}`);
    return c.json<UiResponse>({ showToast: `Error executing action: ${e.message}` }, 200);
  }
});
