import type { PromptTemplate, PromptTemplateDraft, PromptTemplateScope } from '@hello-world/shared';

export type CreatePromptTemplateOptions = {
  id?: string;
  now?: () => string;
};

export type RenderedPromptTemplate = {
  text: string;
  missingVariables: string[];
};

export function createPromptTemplate(
  draft: PromptTemplateDraft,
  options: CreatePromptTemplateOptions = {},
): PromptTemplate {
  const now = options.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const body = draft.body.trim();
  return {
    id: options.id ?? crypto.randomUUID(),
    title: draft.title.trim() || 'Untitled template',
    body,
    variables: normalizeList(draft.variables?.length ? draft.variables : extractPromptVariables(body)),
    tags: normalizeList(draft.tags ?? []),
    favorite: draft.favorite ?? false,
    scope: normalizeScope(draft.scope),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function renderPromptTemplate(
  template: PromptTemplate,
  values: Record<string, string>,
): RenderedPromptTemplate {
  const missingVariables: string[] = [];
  const text = template.body.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, name: string) => {
    const value = values[name]?.trim();
    if (!value) {
      if (!missingVariables.includes(name)) missingVariables.push(name);
      return match;
    }
    return value;
  });
  return { text, missingVariables };
}

export function extractPromptVariables(body: string): string[] {
  return normalizeList(Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g), (match) => match[1]));
}

export function upsertPromptTemplate(
  templates: PromptTemplate[],
  template: PromptTemplate,
): PromptTemplate[] {
  return templates.some((item) => item.id === template.id)
    ? templates.map((item) => (item.id === template.id ? template : item))
    : [template, ...templates];
}

export function deletePromptTemplate(templates: PromptTemplate[], templateId: string): PromptTemplate[] {
  return templates.filter((template) => template.id !== templateId);
}

export function exportPromptTemplates(templates: PromptTemplate[]): string {
  return JSON.stringify({ version: 1, templates }, null, 2);
}

export function importPromptTemplates(raw: string): PromptTemplate[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.templates)) {
    throw new Error('Prompt template backup must contain a templates array.');
  }
  return parsed.templates.map((template: PromptTemplate) => ({
    ...template,
    variables: normalizeList(template.variables ?? extractPromptVariables(template.body)),
    tags: normalizeList(template.tags ?? []),
    favorite: template.favorite ?? false,
    scope: normalizeScope(template.scope),
  }));
}

function normalizeList(values: string[]): string[] {
  return values.reduce<string[]>((items, value) => {
    const trimmed = value.trim();
    return trimmed && !items.includes(trimmed) ? [...items, trimmed] : items;
  }, []);
}

function normalizeScope(scope: PromptTemplateScope | undefined): PromptTemplateScope {
  return scope === 'sync' ? 'sync' : 'local';
}
