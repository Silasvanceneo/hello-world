export type SearchProviderType = 'brave' | 'tavily' | 'bing' | 'searxng' | 'custom';

export type GroundingSnippet = {
  index: number;
  title: string;
  url: string;
  text: string;
  retrievedAt: string;
  sourceDomain: string;
  viaDesktopProxy?: boolean;
};
