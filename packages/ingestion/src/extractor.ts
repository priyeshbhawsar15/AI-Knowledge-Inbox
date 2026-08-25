import { parseHTML } from 'linkedom';

export interface ExtractedDocument {
  title: string | null;
  canonicalUrl: string | null;
  text: string;
}

export function extractTextFromHtml(
  rawContent: string,
  contentType: string,
  sourceUrl?: string
): ExtractedDocument {
  if (contentType === 'text/plain') {
    const normalized = rawContent.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (normalized.length < 20) {
      throw new Error('CONTENT_NOT_EXTRACTABLE: Plain text content is less than 20 characters');
    }
    return {
      title: null,
      canonicalUrl: null,
      text: normalized,
    };
  }

  const { document } = parseHTML(rawContent);

  // Remove non-content elements
  const tagsToRemove = ['script', 'style', 'noscript', 'form', 'nav', 'header', 'footer', 'svg', 'iframe'];
  for (const tag of tagsToRemove) {
    const elements = Array.from(document.querySelectorAll(tag));
    for (const el of elements) {
      el.remove();
    }
  }

  // Extract title
  let title: string | null = null;
  const titleEl = document.querySelector('title');
  if (titleEl && titleEl.textContent) {
    title = titleEl.textContent.trim() || null;
  }

  // Extract canonical URL
  let canonicalUrl: string | null = null;
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) {
    const href = canonicalEl.getAttribute('href');
    if (href) {
      try {
        canonicalUrl = new URL(href, sourceUrl ?? 'https://example.com').toString();
      } catch {
        canonicalUrl = null;
      }
    }
  }

  // Get text content and normalize whitespace
  const bodyText = document.body ? document.body.textContent || '' : document.textContent || '';
  const normalizedText = bodyText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  if (normalizedText.length < 20) {
    throw new Error('CONTENT_NOT_EXTRACTABLE: Extracted body text is less than 20 characters');
  }

  return {
    title,
    canonicalUrl,
    text: normalizedText,
  };
}
