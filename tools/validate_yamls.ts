/**
 * YAML Validation Script for ModGator Documentation and Templates
 * Run with: npx ts-node --esm tools/validate_yamls.ts
 * 
 * Validates all YAML snippets in:
 *   1. defaults.ts templates
 *   2. All docs/*.md files
 */

import YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

const DOCS_DIR = path.join(process.cwd(), 'website', 'docs');
const DEFAULTS_FILE = path.join(process.cwd(), 'src', 'server', 'config', 'defaults.ts');

// Known valid action types
const VALID_ACTION_TYPES = new Set([
  'remove_post', 'approve_post', 'lock_post', 'unlock_post',
  'set_post_flair', 'mark_post_nsfw', 'unmark_post_nsfw',
  'mark_post_spoiler', 'unmark_post_spoiler',
  'remove_comment', 'approve_comment', 'lock_comment', 'submit_comment',
  'ban_user', 'unban_user', 'mute_user', 'unmute_user',
  'set_user_flair', 'clear_user_flair', 'approve_user', 'remove_approval',
  'add_mod_note',
  'reply_modmail', 'send_modmail', 'sendmodmail', 'send_private_message', 'send_webhook',
  'store_value', 'increment_counter', 'tag_domain',
  'run_macro', 'stop_if', 'if', 'delay',
]);

// Valid condition fields
const VALID_FIELDS = new Set([
  'author_name', 'author_karma', 'author_age_days', 'author_is_banned',
  'author_is_mod', 'author_is_approved', 'author_has_user_flair',
  'author_has_mod_note', 'author_mod_note_label',
  'post_title', 'post_body', 'post_domain', 'post_domain_tag',
  'post_score', 'post_link_type', 'post_is_nsfw', 'post_is_spoiler', 'post_flair_text',
  'comment_body', 'comment_score', 'comment_is_top_level',
  'modmail_subject', 'modmail_body', 'modmail_body_length',
]);

// Valid trigger events
const VALID_EVENTS = new Set([
  'PostSubmit', 'CommentSubmit', 'PostReport', 'CommentReport',
  'PostUpdate', 'CommentUpdate', 'ModMail',
]);

// Valid mod note labels
const VALID_MOD_NOTE_LABELS = new Set([
  'BOT_BAN', 'PERMA_BAN', 'BAN', 'ABUSE_WARNING',
  'SPAM_WARNING', 'SPAM_WATCH', 'SOLID_CONTRIBUTOR', 'HELPFUL_USER',
]);

interface ValidationError {
  source: string;
  error: string;
}

const errors: ValidationError[] = [];
let totalYamls = 0;

function reportError(source: string, msg: string) {
  errors.push({ source, error: msg });
  console.error(`  ❌ ${msg}`);
}

function validateActions(actions: any[], source: string, macroNames: Set<string>) {
  if (!Array.isArray(actions)) return;
  for (const action of actions) {
    if (!action.type) {
      reportError(source, `Action missing 'type': ${JSON.stringify(action)}`);
      continue;
    }
    if (!VALID_ACTION_TYPES.has(action.type)) {
      reportError(source, `Unknown action type: '${action.type}'`);
    }
    if (action.type === 'run_macro' && !macroNames.has(action.macro)) {
      reportError(source, `run_macro references unknown macro: '${action.macro}' (available: ${[...macroNames].join(', ')})`);
    }
    if (action.type === 'add_mod_note' && action.label && !VALID_MOD_NOTE_LABELS.has(action.label)) {
      reportError(source, `add_mod_note has invalid label: '${action.label}'`);
    }
    if (action.type === 'ban_user' && action.duration && typeof action.duration === 'string' && action.duration !== 'permanent') {
      reportError(source, `ban_user duration must be a number or 'permanent', got: '${action.duration}'`);
    }
    if (action.type === 'stop_if' && action.conditions) {
      validateConditions(action.conditions, source, macroNames);
    }
    if (action.type === 'if') {
      if (!action.conditions) reportError(source, `'if' action missing conditions`);
      else validateConditions(action.conditions, source, macroNames);
      if (!action.then) reportError(source, `'if' action missing 'then' block`);
      else validateActions(action.then, source, macroNames);
    }
  }
}

function validateConditions(conditions: any[], source: string, macroNames: Set<string>) {
  if (!Array.isArray(conditions)) return;
  for (const cond of conditions) {
    if (cond.all_of) { validateConditions(cond.all_of, source, macroNames); continue; }
    if (cond.any_of) { validateConditions(cond.any_of, source, macroNames); continue; }
    if (cond.none_of) { validateConditions(cond.none_of, source, macroNames); continue; }
    if (!cond.field) continue;
    // Check field — allow counter_ and custom_ prefixes
    const field = cond.field as string;
    if (!VALID_FIELDS.has(field) && !field.startsWith('counter_') && !field.startsWith('custom_')) {
      // Could be a dynamic field with placeholders — allow those
      if (!field.includes('{{')) {
        reportError(source, `Unknown condition field: '${field}'`);
      }
    }
    // Validate post_link_type values
    if (field === 'post_link_type' && cond.operator === '==' && cond.value) {
      const val = cond.value;
      const allowed = ['link', 'self'];
      if (!allowed.includes(val) && !Array.isArray(val)) {
        reportError(source, `post_link_type should be 'link' or 'self', not '${val}'`);
      }
    }
  }
}

function validateYamlDoc(doc: any, source: string, globalMacros?: Set<string>) {
  // Combine local macros with any cross-template macros (app merges all files)
  const macroNames = new Set<string>(globalMacros);
  if (Array.isArray(doc.macros)) {
    for (const macro of doc.macros) {
      if (macro.name) macroNames.add(macro.name);
    }
  }

  // Validate macros
  if (Array.isArray(doc.macros)) {
    for (const macro of doc.macros) {
      if (Array.isArray(macro.actions)) {
        validateActions(macro.actions, source + ` > macro '${macro.name}'`, macroNames);
      }
    }
  }

  // Validate rules
  if (Array.isArray(doc.rules)) {
    for (const rule of doc.rules) {
      const ruleCtx = source + ` > rule '${rule.name}'`;
      if (!rule.trigger?.event) {
        reportError(source, `Rule '${rule.name}' missing trigger.event`);
      } else if (!VALID_EVENTS.has(rule.trigger.event)) {
        reportError(source, `Rule '${rule.name}' has unknown trigger event: '${rule.trigger.event}'`);
      }
      if (rule.conditions) validateConditions(rule.conditions, ruleCtx, macroNames);
      if (rule.actions) validateActions(rule.actions, ruleCtx, macroNames);
      if (rule.fallback_actions) validateActions(rule.fallback_actions, ruleCtx + ' (fallback)', macroNames);
    }
  }

  // Validate ui_actions
  if (Array.isArray(doc.ui_actions)) {
    for (const uiAction of doc.ui_actions) {
      const ctx = source + ` > ui_action '${uiAction.name}'`;
      if (uiAction.run_macro && !macroNames.has(uiAction.run_macro)) {
        reportError(source, `ui_action '${uiAction.name}' references unknown macro: '${uiAction.run_macro}'`);
      }
      if (uiAction.actions) validateActions(uiAction.actions, ctx, macroNames);
    }
  }

  // Validate scheduled tasks
  if (Array.isArray(doc.scheduled)) {
    for (const task of doc.scheduled) {
      const ctx = source + ` > scheduled '${task.name}'`;
      if (task.run_macro && !macroNames.has(task.run_macro)) {
        reportError(source, `scheduled task '${task.name}' references unknown macro: '${task.run_macro}'`);
      }
      if (task.actions) validateActions(task.actions, ctx, macroNames);
    }
  }
}

function parseAndValidateYaml(yamlStr: string, source: string, globalMacros?: Set<string>) {
  totalYamls++;
  try {
    const doc = YAML.parse(yamlStr);
    if (!doc || typeof doc !== 'object') {
      reportError(source, 'Parsed YAML is not an object');
      return;
    }
    validateYamlDoc(doc, source, globalMacros);
    console.log(`  ✅ Parsed OK`);
  } catch (e: any) {
    reportError(source, `YAML parse error: ${e.message}`);
  }
}

// ── 1. Validate defaults.ts templates ────────────────────────────────────────

console.log('\n📋 Validating defaults.ts templates...\n');

const defaultsContent = fs.readFileSync(DEFAULTS_FILE, 'utf-8');

// Extract all template YAML strings
const templateEntries: { name: string; yaml: string }[] = [];
const templateMatches = defaultsContent.matchAll(/'([^']+)':\s*`([\s\S]*?)`(?:,\n|\n\})/g);
for (const match of templateMatches) {
  templateEntries.push({ name: match[1]!, yaml: match[2]! });
}

// STEP 1: Collect ALL macro names across ALL templates (cross-template references are valid
// because the app merges all loaded YAML files into a single config before execution).
const globalMacroNames = new Set<string>();
for (const { yaml } of templateEntries) {
  try {
    const doc = YAML.parse(yaml);
    if (Array.isArray(doc?.macros)) {
      for (const macro of doc.macros) {
        if (macro.name) globalMacroNames.add(macro.name);
      }
    }
  } catch { /* will be caught per-template below */ }
}

// STEP 2: Validate each template using the global macro set
for (const { name, yaml } of templateEntries) {
  console.log(`  Template: "${name}"`);
  totalYamls++;
  try {
    const doc = YAML.parse(yaml);
    if (!doc || typeof doc !== 'object') {
      reportError(`defaults.ts > "${name}"`, 'Parsed YAML is not an object');
      continue;
    }
    validateYamlDoc(doc, `defaults.ts > "${name}"`, globalMacroNames);
    console.log(`  ✅ Parsed OK`);
  } catch (e: any) {
    reportError(`defaults.ts > "${name}"`, `YAML parse error: ${e.message}`);
  }
}

// ── 2. Validate all YAML code blocks in docs ─────────────────────────────────

console.log('\n📄 Validating docs YAML code blocks...\n');

function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMarkdownFiles(fullPath));
    else if (entry.name.endsWith('.md')) results.push(fullPath);
  }
  return results;
}

const mdFiles = findMarkdownFiles(DOCS_DIR);
for (const mdFile of mdFiles) {
  const content = fs.readFileSync(mdFile, 'utf-8');
  const relPath = path.relative(DOCS_DIR, mdFile);

  // Extract ```yaml code blocks
  const yamlBlocks = content.matchAll(/```yaml\r?\n([\s\S]*?)```/g);
  let blockIdx = 0;
  for (const block of yamlBlocks) {
    blockIdx++;
    const yamlStr = block[1];
    // Skip if it's just a field snippet (no top-level keys like 'rules:', 'macros:', etc.)
    if (!yamlStr.match(/^(rules:|macros:|ui_actions:|scheduled:|settings:|version:)/m)) {
      console.log(`  ${relPath} block #${blockIdx}: Skipping (snippet, not full doc)`);
      continue;
    }
    console.log(`  ${relPath} block #${blockIdx}:`);
    parseAndValidateYaml(yamlStr, `${relPath} block #${blockIdx}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Validated ${totalYamls} YAML documents.`);
if (errors.length === 0) {
  console.log('✅ ALL YAMLS ARE VALID — no errors found.\n');
} else {
  console.log(`❌ Found ${errors.length} error(s):\n`);
  for (const e of errors) {
    console.log(`  [${e.source}]\n    → ${e.error}\n`);
  }
  process.exit(1);
}
