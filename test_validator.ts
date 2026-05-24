import { validateAndMergeFiles } from './src/server/config/validator';

const yamlConfig = `
version: "1"
name: "Test Config"
rules:
  - name: "Test Rule"
    trigger:
      event: "PostSubmit"
    conditions:
      - field: "author_is_banned"
        operator: "=="
        value: tru
    actions:
      - type: "remove_post"
`;

const result = validateAndMergeFiles({ 'test.yml': yamlConfig });
console.log(JSON.stringify(result, null, 2));
