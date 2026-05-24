import { validateAndMergeFiles } from './src/server/config/validator';

const yamlConfig = `
version: "1"
name: "Test Config"
rules:
  - name: "Test Rule"
    trigger:
      event: "PostSubmit"
    actions:
      - type: "remove_post"
        spam: tru
`;

const result = validateAndMergeFiles({ 'test.yml': yamlConfig });
console.log(JSON.stringify(result, null, 2));
