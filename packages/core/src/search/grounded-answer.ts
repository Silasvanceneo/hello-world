import type { GroundingSnippet } from '@hello-world/shared';

export type GroundedAnswerValidation =
  | { ok: true }
  | { ok: false; message: string };

export function createGroundingSnippets(
  pages: Array<Omit<GroundingSnippet, 'index'> | GroundingSnippet>,
  options: { maxSnippets?: number; maxCharacters?: number } = {},
): GroundingSnippet[] {
  const maxSnippets = options.maxSnippets ?? 6;
  const maxCharacters = options.maxCharacters ?? 1200;
  return pages
    .slice(0, maxSnippets)
    .map((page, index) => ({
      index: 'index' in page ? page.index : index + 1,
      title: page.title.trim() || page.sourceDomain || page.url,
      url: sanitizeUrl(page.url),
      text: page.text.replace(/\s+/g, ' ').trim().slice(0, maxCharacters),
      retrievedAt: page.retrievedAt,
      sourceDomain: page.sourceDomain,
      viaDesktopProxy: page.viaDesktopProxy,
    }))
    .filter((snippet) => snippet.url && snippet.text);
}

export function buildGroundedAnswerPrompt(query: string, snippets: GroundingSnippet[]): string {
  const sources = snippets.map((snippet) => [
    `[${snippet.index}] ${snippet.title}`,
    `URL: ${snippet.url}`,
    `Domain: ${snippet.sourceDomain}`,
    `Retrieved ${snippet.retrievedAt}`,
    snippet.viaDesktopProxy ? 'Fetched via Desktop proxy' : 'Fetched directly',
    snippet.text,
  ].join('\n')).join('\n\n');
  return [
    'Use only the sources below. Cite every factual claim with [n].',
    'If the sources are insufficient, say that the sources do not answer the question.',
    '',
    `Question: ${query}`,
    '',
    sources,
  ].join('\n');
}

export function validateGroundedAnswer(answer: string, snippets: GroundingSnippet[]): GroundedAnswerValidation {
  if (!snippets.length) {
    return { ok: false, message: 'Grounded answers require search sources.' };
  }
  const cited = snippets.some((snippet) => answer.includes(`[${snippet.index}]`));
  if (!cited) {
    return { ok: false, message: 'Grounded answers require at least one source citation.' };
  }
  return { ok: true };
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password|authorization|api[_-]?key/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\?$/, '');
  } catch {
    return value.trim();
  }
}
