import { Devvit } from '@devvit/public-api';
import YAML from 'yaml';
import { redis } from '@devvit/web/server';
import { validateAndMergeFiles } from '../config/validator';
import { KEYS } from '../storage/keys';

export const yamlUploadFormKey = Devvit.createForm(
  {
    title: 'Upload ModKit Configuration',
    description: 'Paste your YAML configuration below.',
    fields: [
      {
        name: 'yaml',
        label: 'YAML Configuration',
        type: 'string',
        multiline: true,
        required: true,
      },
    ],
    acceptLabel: 'Save Config',
  },
  async (event, context) => {
    const yamlString = event.values.yaml;
    if (!yamlString) {
      context.ui.showToast('YAML configuration cannot be empty.');
      return;
    }

    try {
      const existingFiles = await redis.hGetAll(KEYS.CONFIG_FILES);
      const filesRecord = Object.keys(existingFiles).length > 0 ? existingFiles : {};
      filesRecord['automod.yml'] = yamlString;

      const result = validateAndMergeFiles(filesRecord);
      if (!result.valid) {
        context.ui.showToast(`Validation Failed: ${result.errors?.join(', ')}`);
        return;
      }

      await redis.hSet(KEYS.CONFIG_FILES, { 'automod.yml': yamlString });
      await redis.set(KEYS.CONFIG_PARSED, JSON.stringify(result.merged));
      context.ui.showToast('✅ ModKit configuration saved successfully!');
    } catch (e) {
      context.ui.showToast('❌ Failed to parse YAML. Please check for syntax errors.');
    }
  }
);
