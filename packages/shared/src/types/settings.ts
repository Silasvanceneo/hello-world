export type AppSettings = {
  theme: 'system' | 'light' | 'dark';
  language: 'system' | 'en' | 'zh-CN';
  defaultProviderId?: string;
  defaultModelId?: string;
  updatedAt: string;
};

export function createDefaultAppSettings(updatedAt: string): AppSettings {
  return { theme: 'system', language: 'system', updatedAt };
}
