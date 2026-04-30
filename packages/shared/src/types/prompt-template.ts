export type PromptTemplateScope = 'local' | 'sync';

export type PromptTemplate = {
  id: string;
  title: string;
  body: string;
  variables: string[];
  tags: string[];
  favorite: boolean;
  scope: PromptTemplateScope;
  createdAt: string;
  updatedAt: string;
};

export type PromptTemplateDraft = {
  title: string;
  body: string;
  variables?: string[];
  tags?: string[];
  favorite?: boolean;
  scope?: PromptTemplateScope;
};
