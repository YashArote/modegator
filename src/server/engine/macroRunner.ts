import type { ModKitConfig, ActionBlock } from '../../shared/types';

export function resolveMacro(macroName: string, config: ModKitConfig, depth = 0): ActionBlock[] {
  // Prevent infinite loops in macro resolution
  if (depth > 10) {
    throw new Error(`Macro resolution depth exceeded 10 levels for macro: ${macroName}`);
  }

  let macro;
  if (Array.isArray(config.macros)) {
    console.log(`[MACRO RUNNER] Searching array of ${config.macros.length} macros for '${macroName}'`);
    macro = config.macros.find((m: any) => m.name === macroName);
  } else if (config.macros && typeof config.macros === 'object') {
    console.log(`[MACRO RUNNER] Searching dictionary of macros for '${macroName}'`);
    macro = (config.macros as any)[macroName];
  } else {
    console.warn(`[MACRO RUNNER] config.macros is empty or invalid!`);
  }

  if (!macro || !macro.actions) {
    console.error(`[MACRO RUNNER] Macro '${macroName}' not found or has no actions!`);
    return [];
  }

  console.log(`[MACRO RUNNER] Successfully resolved macro '${macroName}' with ${macro.actions.length} actions.`);

  const resolvedActions: ActionBlock[] = [];

  for (const action of macro.actions) {
    if (action.type === 'run_macro' && action.macro) {
      resolvedActions.push(...resolveMacro(action.macro, config, depth + 1));
    } else {
      resolvedActions.push(action);
    }
  }

  return resolvedActions;
}
