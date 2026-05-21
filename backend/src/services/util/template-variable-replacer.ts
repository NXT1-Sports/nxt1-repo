// backend/src/services/util/template-variable-replacer.ts
// Utility to replace <variable> placeholders in templates with provided values.

export function replaceTemplateVariables(template: string, values: Record<string, string>): string {
  return template.replace(/<([a-zA-Z0-9_]+)>/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}
