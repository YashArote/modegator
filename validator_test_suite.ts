import { validateAndMergeFiles } from './src/server/config/validator';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

let passed = 0;
let failed = 0;

function runTest(name: string, yamlContent: string, expectValid: boolean, expectedErrorsContains: string[] = []) {
  console.log(`Running: ${name}...`);
  const result = validateAndMergeFiles({ 'test.yml': yamlContent });

  if (result.valid === expectValid) {
    if (!expectValid && expectedErrorsContains.length > 0) {
      let missingError = false;
      const allErrors = result.errors?.join(' | ') || '';
      for (const errStr of expectedErrorsContains) {
        if (!allErrors.includes(errStr)) {
          console.error(`  ${FAIL}: Expected error to contain "${errStr}" but got errors:`, result.errors);
          missingError = true;
          failed++;
        }
      }
      if (!missingError) {
        console.log(`  ${PASS}`);
        passed++;
      }
    } else {
      console.log(`  ${PASS}`);
      passed++;
    }
  } else {
    console.error(`  ${FAIL}: Expected valid=${expectValid}, got valid=${result.valid}`);
    if (result.errors) console.error(`    Errors:`, result.errors);
    failed++;
  }
}

// =========================================================
// 1. Valid Complex Nested Case
// =========================================================
runTest('Valid Complex Config', `
version: "1"
name: "Complex Setup"
macros:
  - name: "LogIt"
    actions:
      - type: "store_value"
        key: "test"
        value: "ok"
rules:
  - name: "Super Rule"
    trigger:
      event: "PostSubmit"
    conditions:
      - any_of:
          - all_of:
              - field: "author_is_banned"
                operator: "=="
                value: false
              - field: "post_score"
                operator: ">="
                value: 50
          - none_of:
              - field: "post_is_nsfw"
                operator: "=="
                value: true
    actions:
      - type: "remove_post"
        spam: false
      - type: "delay"
        duration_ms: 1000
      - type: "run_macro"
        macro: "LogIt"
`, true);

// =========================================================
// 2. Strict Key Checking
// =========================================================
runTest('Invalid root key in Rule', `
rules:
  - name: "Bad Rule"
    trigger: { event: "PostSubmit" }
    acti: [] # Should be actions
`, false, ["Unknown property 'acti'"]);

runTest('Invalid key in Action', `
rules:
  - name: "Bad Action Key"
    trigger: { event: "PostSubmit" }
    actions:
      - type: "remove_post"
        spamm: true # Typo
`, false, ["Unknown property 'spamm'"]);

runTest('Invalid key in Condition', `
rules:
  - name: "Bad Condition Key"
    trigger: { event: "PostSubmit" }
    conditions:
      - field: "post_score"
        operator: ">"
        value: 5
        extra_thing: "hello"
`, false, ["Unknown property 'extra_thing'"]);

// =========================================================
// 3. Strict Type Checking (Conditions)
// =========================================================
runTest('Wrong type for boolean condition (tru)', `
rules:
  - name: "Wrong bool"
    trigger: { event: "PostSubmit" }
    conditions:
      - field: "author_is_banned"
        operator: "=="
        value: tru
`, false, ["must be of type 'boolean', but got 'string'"]);

runTest('Wrong type for number condition', `
rules:
  - name: "Wrong number"
    trigger: { event: "PostSubmit" }
    conditions:
      - field: "post_score"
        operator: "=="
        value: "50"
`, false, ["must be of type 'number', but got 'string'"]);

// =========================================================
// 4. Operator Compatibility
// =========================================================
runTest('Invalid operator for number', `
rules:
  - name: "Bad operator"
    trigger: { event: "PostSubmit" }
    conditions:
      - field: "post_score"
        operator: "<"
        value: "fifty" # string with <
`, false, ["Operator '<' requires a number value"]);

runTest('Invalid operator for regex', `
rules:
  - name: "Bad regex"
    trigger: { event: "PostSubmit" }
    conditions:
      - field: "post_title"
        operator: "regex"
        value: 123 # number with regex
`, false, ["Operator 'regex' requires a string value"]);

// =========================================================
// 5. Strict Type Checking (Actions)
// =========================================================
runTest('Wrong type for action property (spam: tru)', `
rules:
  - name: "Bad spam type"
    trigger: { event: "PostSubmit" }
    actions:
      - type: "remove_post"
        spam: tru
`, false, ["Property 'spam' must be of type 'boolean', but got 'string'"]);

runTest('Wrong type for action property (duration_ms)', `
rules:
  - name: "Bad duration"
    trigger: { event: "PostSubmit" }
    actions:
      - type: "delay"
        duration_ms: "1000"
`, false, ["Property 'duration_ms' must be of type 'number', but got 'string'"]);

// =========================================================
// 6. Macro Reference Validation
// =========================================================
runTest('Undefined macro reference', `
rules:
  - name: "Call undefined"
    trigger: { event: "PostSubmit" }
    actions:
      - type: "run_macro"
        macro: "NonExistent"
`, false, ["Macro \"NonExistent\" is referenced but never defined"]);

// =========================================================
// 7. Duplicate Names
// =========================================================
runTest('Duplicate rule names', `
rules:
  - name: "Duplicate"
    trigger: { event: "PostSubmit" }
  - name: "Duplicate"
    trigger: { event: "CommentSubmit" }
`, false, ["defined multiple times"]);

// =========================================================
// 8. UI Action Validations
// =========================================================
runTest('Valid UI Action with new properties', `
version: "1"
name: "UI Action Config"
macros:
  - name: "Soft Warn User"
    actions:
      - type: "lock_post"
ui_actions:
  - name: "Warn Member"
    label: "Warn Member"
    location: "comment"
    for_user_type: "moderator"
    confirm: true
    confirm_message: "Are you sure?"
    run_macro: "Soft Warn User"
`, true);

runTest('Invalid UI Action confirm type', `
version: "1"
name: "UI Action Config"
ui_actions:
  - name: "Warn Member"
    label: "Warn Member"
    location: "comment"
    confirm: "yes" # Should be boolean
`, false, ["'confirm' must be a boolean"]);

runTest('Invalid UI Action for_user_type type', `
version: "1"
name: "UI Action Config"
ui_actions:
  - name: "Warn Member"
    label: "Warn Member"
    location: "comment"
    for_user_type: 123 # Should be string
`, false, ["'for_user_type' must be a string"]);

console.log('--------------------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
