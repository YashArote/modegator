import { ConditionBlock, EventContext, ConditionResult } from '../../shared/types';

function getFieldValue(field: string, ctx: EventContext): any {
  switch (field) {
    case 'author_name': return ctx.author.username;
    case 'author_karma': return ctx.author.karma ?? 0;
    case 'author_age_days': return ctx.author.accountAgeDays ?? 0;
    case 'author_is_banned': return ctx.author.isBanned ?? false;
    case 'author_is_mod': return ctx.author.isMod ?? false;
    
    case 'post_title': return ctx.post?.title ?? '';
    case 'post_body': return ctx.post?.body ?? '';
    case 'post_domain': return ctx.post?.domain ?? '';
    case 'post_score': return ctx.post?.score ?? 0;
    case 'post_report_count': return ctx.post?.reportCount ?? 0;
    case 'post_link_type': return ctx.post?.linkType ?? '';
    case 'post_is_nsfw': return ctx.post?.nsfw ?? false;
    
    case 'comment_body': return ctx.comment?.body ?? '';
    case 'comment_score': return ctx.comment?.score ?? 0;
    case 'comment_is_top_level': return ctx.comment?.isTopLevel ?? false;
    
    case 'modmail_subject': return ctx.modmail?.subject ?? '';
    case 'modmail_body': return ctx.modmail?.body ?? '';
    default: return undefined;
  }
}

function evaluateLeaf(condition: ConditionBlock, ctx: EventContext): { passed: boolean, actualValue: any } {
  if (!condition.field || !condition.operator || condition.value === undefined) {
    return { passed: false, actualValue: null };
  }

  const actualValue = getFieldValue(condition.field, ctx);
  const expectedValue = condition.value;
  let passed = false;

  if (actualValue === undefined) {
    return { passed: false, actualValue: 'unknown_field' };
  }

  switch (condition.operator) {
    case '==':
      passed = actualValue === expectedValue;
      break;
    case '!=':
      passed = actualValue !== expectedValue;
      break;
    case '<':
      passed = typeof actualValue === 'number' && actualValue < expectedValue;
      break;
    case '<=':
      passed = typeof actualValue === 'number' && actualValue <= expectedValue;
      break;
    case '>':
      passed = typeof actualValue === 'number' && actualValue > expectedValue;
      break;
    case '>=':
      passed = typeof actualValue === 'number' && actualValue >= expectedValue;
      break;
    case 'contains':
      passed = typeof actualValue === 'string' && actualValue.toLowerCase().includes(String(expectedValue).toLowerCase());
      break;
    case 'regex':
      try {
        let regexStr = String(expectedValue);
        // Safely strip Python-style inline case-insensitivity flag common in AutoModerator scripts
        if (regexStr.startsWith('(?i)')) {
          regexStr = regexStr.substring(4);
        }
        passed = typeof actualValue === 'string' && new RegExp(regexStr, 'i').test(actualValue);
      } catch (e) {
        console.error(`[CONDITION EVALUATOR] Invalid regex: ${expectedValue}`);
        passed = false;
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

  function evaluateNode(node: ConditionBlock): boolean {
    if (node.any_of) {
      if (node.any_of.length === 0) return true;
      return node.any_of.some(child => evaluateNode(child));
    }
    
    if (node.all_of) {
      if (node.all_of.length === 0) return true;
      return node.all_of.every(child => evaluateNode(child));
    }

    if (node.none_of) {
      if (node.none_of.length === 0) return true;
      return !node.none_of.some(child => evaluateNode(child));
    }

    // Leaf node
    const { passed, actualValue } = evaluateLeaf(node, ctx);
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
  const passed = conditions.every(c => evaluateNode(c));

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
