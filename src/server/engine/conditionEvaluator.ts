import { ConditionBlock, EventContext, ConditionResult } from '../../shared/types';
import { replaceStringPlaceholders } from '../../shared/placeholders';
import { redis } from '@devvit/web/server';

async function getFieldValue(field: string, ctx: EventContext): Promise<any> {
  const resolvedField = replaceStringPlaceholders(field, ctx);

  if (resolvedField.startsWith('counter_')) {
    const key = resolvedField.substring(8);
    const val = await redis.get(`modkit:counter:${key}`);
    return val ? parseInt(val, 10) : 0;
  }

  if (resolvedField.startsWith('custom_')) {
    const key = resolvedField.substring(7);
    return (await redis.get(`modkit:custom:${key}`)) ?? '';
  }

  switch (resolvedField) {
    case 'author_name': return ctx.author.username;
    case 'author_karma': return ctx.author.karma ?? 0;
    case 'author_age_days': return ctx.author.accountAgeDays ?? 0;
    case 'author_is_banned': return ctx.author.isBanned ?? false;
    case 'author_is_mod': return ctx.author.isMod ?? false;
    case 'author_is_approved': return ctx.author.isApproved ?? false;
    case 'author_has_user_flair': return ctx.author.flairText ?? '';
    case 'author_has_mod_note': return ctx.author.hasModNote ?? false;
    case 'author_mod_note_label': return ctx.author.modNoteLabel ?? '';
    
    case 'post_title': return ctx.post?.title ?? '';
    case 'post_body': return ctx.post?.body ?? '';
    case 'post_domain': return ctx.post?.domain ?? '';
    case 'post_domain_tag': {
      const postDomain = ctx.post?.domain;
      if (!postDomain) return '';
      try {
        const existing = JSON.parse((await redis.get('modkit:domains')) ?? '{}');
        return existing[postDomain]?.label ?? '';
      } catch (e) {
        return '';
      }
    }
    case 'post_score': return ctx.post?.score ?? 0;
    case 'post_report_count': return ctx.post?.reportCount ?? 0;
    case 'post_link_type': return ctx.post?.linkType ?? '';
    case 'post_is_nsfw': return ctx.post?.nsfw ?? false;
    case 'post_is_spoiler': return ctx.post?.spoiler ?? false;
    case 'post_flair_text': return ctx.post?.flairText ?? '';
    
    case 'comment_body': return ctx.comment?.body ?? '';
    case 'comment_score': return ctx.comment?.score ?? 0;
    case 'comment_is_top_level': return ctx.comment?.isTopLevel ?? false;
    case 'comment_report_count': return ctx.comment?.reportCount ?? 0;
    
    case 'modmail_subject': return ctx.modmail?.subject ?? '';
    case 'modmail_body': return ctx.modmail?.body ?? '';
    case 'modmail_body_length': return ctx.modmail?.body?.length ?? 0;
    default: return undefined;
  }
}

async function evaluateLeaf(condition: ConditionBlock, ctx: EventContext): Promise<{ passed: boolean, actualValue: any }> {
  if (!condition.field || !condition.operator || condition.value === undefined) {
    return { passed: false, actualValue: null };
  }

  const actualValue = await getFieldValue(condition.field, ctx);
  const expectedValue = condition.value;
  let passed = false;

  if (actualValue === undefined) {
    return { passed: false, actualValue: 'unknown_field' };
  }

  const isArrayExpected = Array.isArray(expectedValue);

  switch (condition.operator) {
    case '==':
      passed = isArrayExpected 
        ? expectedValue.includes(actualValue)
        : actualValue === expectedValue;
      break;
    case '!=':
      passed = isArrayExpected 
        ? !expectedValue.includes(actualValue)
        : actualValue !== expectedValue;
      break;
    case '<':
      passed = typeof actualValue === 'number' && !isArrayExpected && actualValue < expectedValue;
      break;
    case '<=':
      passed = typeof actualValue === 'number' && !isArrayExpected && actualValue <= expectedValue;
      break;
    case '>':
      passed = typeof actualValue === 'number' && !isArrayExpected && actualValue > expectedValue;
      break;
    case '>=':
      passed = typeof actualValue === 'number' && !isArrayExpected && actualValue >= expectedValue;
      break;
    case 'contains':
      if (typeof actualValue !== 'string') {
        passed = false;
      } else if (isArrayExpected) {
        passed = expectedValue.some(v => actualValue.toLowerCase().includes(String(v).toLowerCase()));
      } else {
        passed = actualValue.toLowerCase().includes(String(expectedValue).toLowerCase());
      }
      break;
    case 'regex':
      if (typeof actualValue !== 'string') {
        passed = false;
      } else if (isArrayExpected) {
        passed = expectedValue.some(pattern => {
          try {
            let regexStr = String(pattern);
            if (regexStr.startsWith('(?i)')) {
              regexStr = regexStr.substring(4);
            }
            return new RegExp(regexStr, 'i').test(actualValue);
          } catch (e) {
            console.error(`[CONDITION EVALUATOR] Invalid regex in array: ${pattern}`);
            return false;
          }
        });
      } else {
        try {
          let regexStr = String(expectedValue);
          if (regexStr.startsWith('(?i)')) {
            regexStr = regexStr.substring(4);
          }
          passed = new RegExp(regexStr, 'i').test(actualValue);
        } catch (e) {
          console.error(`[CONDITION EVALUATOR] Invalid regex: ${expectedValue}`);
          passed = false;
        }
      }
      break;
  }

  console.log(`[CONDITION EVALUATOR] Evaluated field '${condition.field}' with operator '${condition.operator}' against expected '${expectedValue}'. Actual value was '${actualValue}'. Result: ${passed}`);
  
  return { passed, actualValue };
}

export async function evaluateConditionsWithDetails(
  conditions: ConditionBlock[],
  ctx: EventContext
): Promise<{ passed: boolean; details: ConditionResult[] }> {
  
  if (!conditions || conditions.length === 0) {
    return { passed: true, details: [] };
  }

  const details: ConditionResult[] = [];

  async function evaluateNode(node: ConditionBlock): Promise<boolean> {
    if (node.any_of) {
      if (node.any_of.length === 0) return true;
      for (const child of node.any_of) {
        if (await evaluateNode(child)) return true;
      }
      return false;
    }
    
    if (node.all_of) {
      if (node.all_of.length === 0) return true;
      for (const child of node.all_of) {
        if (!(await evaluateNode(child))) return false;
      }
      return true;
    }

    if (node.none_of) {
      if (node.none_of.length === 0) return true;
      for (const child of node.none_of) {
        if (await evaluateNode(child)) return false;
      }
      return true;
    }

    // Leaf node
    const { passed, actualValue } = await evaluateLeaf(node, ctx);
    if (node.field) {
      details.push({
        conditionKey: `${node.field} ${node.operator}`,
        passed,
        actualValue,
        expectedValue: node.value
      });
    }
    return passed;
  }

  // By default, the top-level array acts as an implicit "all_of"
  let passed = true;
  for (const c of conditions) {
    if (!(await evaluateNode(c))) {
      passed = false;
      break;
    }
  }

  return { passed, details };
}

export async function evaluateConditions(
  conditions: ConditionBlock[],
  ctx: EventContext
): Promise<boolean> {
  if (!conditions || conditions.length === 0) return true;
  const result = await evaluateConditionsWithDetails(conditions, ctx);
  return result.passed;
}
