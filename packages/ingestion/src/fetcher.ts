import { validateUrlAndResolveIp } from './ssrf.js';
import { Agent, fetch as undiciFetch } from 'undici';
import { isIP } from 'node:net';

export interface FetchedDocument {
  finalUrl: string;
  contentType: string;
  bodyText: string;
  statusCode: number;
}

export interface FetchOptions {
  allowLocalhostInTests?: boolean;
  maxRedirects?: number;
  overallTimeoutMs?: number;
  connectTimeoutMs?: number;
  bodyCapBytes?: number;
}

export async function fetchPublicDocument(
  initialUrl: string,
  options?: FetchOptions
): Promise<FetchedDocument> {
  const maxRedirects = options?.maxRedirects ?? 5;
  const overallTimeoutMs = options?.overallTimeoutMs ?? 30000;
  const connectTimeoutMs = options?.connectTimeoutMs ?? 10000;
  const bodyCapBytes = options?.bodyCapBytes ?? 2 * 1024 * 1024; // 2 MiB

  let currentUrl = initialUrl;
  let redirectCount = 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), overallTimeoutMs);

  try {
    while (redirectCount <= maxRedirects) {
      const dest = await validateUrlAndResolveIp(
        currentUrl,
        options?.allowLocalhostInTests !== undefined
          ? { allowLocalhostInTests: options.allowLocalhostInTests }
          : {}
      );

      // Create undici Agent pinning connection to validated IP with 10s connect/headers budget
      const pinnedAgent = new Agent({
        connect: {
          lookup: (_hostname, _opts, cb) => {
            cb(null, [
              {
                address: dest.resolvedIp,
                family: isIP(dest.resolvedIp) === 6 ? 6 : 4,
              },
            ]);
          },
          timeout: connectTimeoutMs,
        },
        headersTimeout: connectTimeoutMs,
        bodyTimeout: overallTimeoutMs,
      });

      try {
        const response = (await undiciFetch(dest.url.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          dispatcher: pinnedAgent,
          headers: {
            'User-Agent': 'AIKnowledgeInboxBot/1.0 (+https://github.com/ai-knowledge-inbox)',
            Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
          },
        })) as unknown as Response;

        if (response.status >= 300 && response.status < 400) {
          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new Error('URL_FETCH_FAILED: Exceeded maximum allowed redirects (5)');
          }
          const location = response.headers.get('location');
          if (!location) {
            throw new Error('URL_FETCH_FAILED: Redirect missing Location header');
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }

        if (response.status !== 200) {
          throw new Error(`URL_FETCH_FAILED: HTTP status ${response.status}`);
        }

        const contentTypeHeader = response.headers.get('content-type') ?? '';
        const rawContentType = contentTypeHeader.split(';')[0]?.trim().toLowerCase() ?? '';

        if (rawContentType !== 'text/html' && rawContentType !== 'text/plain') {
          throw new Error(`URL_POLICY_VIOLATION: Unsupported Content-Type "${contentTypeHeader}"`);
        }

        if (!response.body) {
          throw new Error('URL_FETCH_FAILED: Response body is empty');
        }

        const reader = (response.body as ReadableStream<Uint8Array>).getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.byteLength;
          if (totalBytes > bodyCapBytes) {
            reader.cancel();
            throw new Error(`PAYLOAD_TOO_LARGE: Downloaded content exceeded 2 MiB limit`);
          }
          chunks.push(value);
        }

        const fullBuffer = Buffer.concat(chunks);
        const bodyText = fullBuffer.toString('utf8');

        return {
          finalUrl: dest.url.toString(),
          contentType: rawContentType,
          bodyText,
          statusCode: response.status,
        };
      } finally {
        await pinnedAgent.close().catch(() => {});
      }
    }

    throw new Error('URL_FETCH_FAILED: Exceeded maximum allowed redirects');
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('URL_FETCH_TIMEOUT: Fetch request timed out after 30 seconds');
      }
      throw err;
    }
    throw new Error('URL_FETCH_FAILED: Unknown fetch error');
  } finally {
    clearTimeout(timeoutId);
  }
}
