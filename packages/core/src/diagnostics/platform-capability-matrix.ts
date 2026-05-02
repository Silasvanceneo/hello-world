export type ProductPlatform = 'web' | 'desktop' | 'mobile';

export type CapabilityStatus = 'available' | 'desktop_only' | 'runtime_required' | 'unavailable' | 'blocked';

export type PlatformCapabilityId =
  | 'cloud_chat'
  | 'native_providers'
  | 'rag_query'
  | 'rag_management'
  | 'web_search'
  | 'http_mcp'
  | 'stdio_mcp'
  | 'desktop_proxy'
  | 'sandboxed_code_execution'
  | 'voice_io'
  | 'camera_input'
  | 'terminal';

export type PlatformCapability = {
  id: PlatformCapabilityId;
  label: string;
  status: CapabilityStatus;
  note: string;
};

export type PlatformCapabilitySummary = {
  platform: ProductPlatform;
  capabilities: Record<PlatformCapabilityId, PlatformCapability>;
  availableCount: number;
  blockedCount: number;
};

export type PlatformCapabilityMatrix = Record<ProductPlatform, PlatformCapabilitySummary>;

const labels: Record<PlatformCapabilityId, string> = {
  cloud_chat: 'Cloud and local chat',
  native_providers: 'Native provider adapters',
  rag_query: 'RAG query',
  rag_management: 'RAG management',
  web_search: 'Web search',
  http_mcp: 'HTTP MCP',
  stdio_mcp: 'stdio MCP',
  desktop_proxy: 'Desktop page proxy',
  sandboxed_code_execution: 'Sandboxed code execution',
  voice_io: 'Voice input and speech playback',
  camera_input: 'Camera input',
  terminal: 'Terminal',
};

export function createPlatformCapabilityMatrix(): PlatformCapabilityMatrix {
  return {
    web: summarizePlatformReadinessFromStatuses('web', {
      cloud_chat: ['available', 'Runtime provider credentials stay in memory.'],
      native_providers: ['available', 'OpenAI, Anthropic, Gemini, Azure OpenAI, DashScope, Ollama, and OpenAI-compatible adapters are configured through the shared runtime.'],
      rag_query: ['available', 'Lightweight local index and citation rendering are supported.'],
      rag_management: ['available', 'Shared safe source ingestion is available; directory import is Desktop-only.'],
      web_search: ['available', 'Brave, Tavily, Bing, SearXNG, and custom endpoints normalize results with runtime-only keys.'],
      http_mcp: ['available', 'HTTP MCP is the shared safe subset.'],
      stdio_mcp: ['unavailable', 'stdio MCP is Desktop-only.'],
      desktop_proxy: ['unavailable', 'Page proxy is Desktop-only.'],
      sandboxed_code_execution: ['unavailable', 'Code execution is hidden on Web.'],
      voice_io: ['available', 'Browser speech APIs are used when available.'],
      camera_input: ['unavailable', 'Mobile camera and browser image attachments cover image input separately.'],
      terminal: ['blocked', 'Terminal and arbitrary shell access remain blocked.'],
    }),
    desktop: summarizePlatformReadinessFromStatuses('desktop', {
      cloud_chat: ['available', 'Shared Web runtime plus Desktop keychain for provider secrets.'],
      native_providers: ['available', 'Full shared provider adapter set.'],
      rag_query: ['available', 'Shared retrieval plus Desktop durable index mode.'],
      rag_management: ['available', 'Shared ingestion plus Desktop directory import capability.'],
      web_search: ['available', 'Shared search normalization plus Desktop proxy fallback for page fetches.'],
      http_mcp: ['available', 'Shared safe HTTP MCP subset.'],
      stdio_mcp: ['desktop_only', 'Desktop-only registration and plugin control plane with explicit confirmation.'],
      desktop_proxy: ['desktop_only', 'Desktop fetch proxy may support grounded page extraction when browser CORS blocks direct fetch.'],
      sandboxed_code_execution: ['desktop_only', 'Controlled JavaScript/Python runner with confirmation, temp directory, timeout, and output limits.'],
      voice_io: ['available', 'Shared WebView speech APIs when available.'],
      camera_input: ['unavailable', 'Desktop uses screenshot and clipboard image workflows instead of mobile camera.'],
      terminal: ['blocked', 'No terminal or arbitrary shell endpoint is exposed.'],
    }),
    mobile: summarizePlatformReadinessFromStatuses('mobile', {
      cloud_chat: ['available', 'Shared provider runtime with runtime-only credentials.'],
      native_providers: ['available', 'Shared provider adapter set when network and CORS/runtime allow.'],
      rag_query: ['available', 'Lightweight local index and citation rendering are supported.'],
      rag_management: ['available', 'Shared safe source ingestion is available; directory import is not supported.'],
      web_search: ['available', 'Shared search normalization with runtime-only keys.'],
      http_mcp: ['available', 'HTTP MCP is the shared safe subset.'],
      stdio_mcp: ['unavailable', 'stdio MCP is forbidden on Mobile.'],
      desktop_proxy: ['unavailable', 'Desktop proxy is not available on Mobile.'],
      sandboxed_code_execution: ['unavailable', 'Code execution is hidden on Mobile.'],
      voice_io: ['available', 'Speech Recognition/Synthesis are exposed when the WebView supports them.'],
      camera_input: ['available', 'Capacitor Camera captures images for chat attachments.'],
      terminal: ['blocked', 'Terminal and arbitrary shell access remain blocked.'],
    }),
  };
}

export function summarizePlatformReadiness(
  matrix: PlatformCapabilityMatrix,
  platform: ProductPlatform,
): PlatformCapabilitySummary {
  return matrix[platform];
}

export function validateFinalCapabilityMatrix(matrix: PlatformCapabilityMatrix): { ok: boolean; missing: string[] } {
  const required: Array<[ProductPlatform, PlatformCapabilityId, CapabilityStatus[]]> = [
    ['web', 'cloud_chat', ['available']],
    ['web', 'rag_query', ['available']],
    ['web', 'web_search', ['available']],
    ['web', 'http_mcp', ['available']],
    ['desktop', 'cloud_chat', ['available']],
    ['desktop', 'rag_management', ['available']],
    ['desktop', 'desktop_proxy', ['desktop_only']],
    ['desktop', 'stdio_mcp', ['desktop_only']],
    ['desktop', 'sandboxed_code_execution', ['desktop_only']],
    ['mobile', 'cloud_chat', ['available']],
    ['mobile', 'voice_io', ['available']],
    ['mobile', 'camera_input', ['available']],
    ['mobile', 'rag_query', ['available']],
    ['mobile', 'web_search', ['available']],
    ['mobile', 'http_mcp', ['available']],
  ];
  const missing = required.flatMap(([platform, capability, statuses]) => {
    const actual = matrix[platform].capabilities[capability]?.status;
    return statuses.includes(actual) ? [] : [`${platform}.${capability}`];
  });
  return { ok: missing.length === 0, missing };
}

function summarizePlatformReadinessFromStatuses(
  platform: ProductPlatform,
  statuses: Record<PlatformCapabilityId, [CapabilityStatus, string]>,
): PlatformCapabilitySummary {
  const capabilities = Object.fromEntries(Object.entries(statuses).map(([id, [status, note]]) => [
    id,
    { id, label: labels[id as PlatformCapabilityId], status, note },
  ])) as Record<PlatformCapabilityId, PlatformCapability>;
  return {
    platform,
    capabilities,
    availableCount: Object.values(capabilities).filter((capability) => capability.status === 'available' || capability.status === 'desktop_only').length,
    blockedCount: Object.values(capabilities).filter((capability) => capability.status === 'blocked').length,
  };
}
