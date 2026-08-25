import { createServer, type Server } from 'node:http';
import { hashString } from '@ai-knowledge-inbox/domain';

export interface FakeProviderServer {
  server: Server;
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
}

export function createDeterministicVector(text: string, dimensions = 1536): number[] {
  const hash = hashString(text);
  const vector: number[] = [];
  let sumSq = 0;

  for (let i = 0; i < dimensions; i++) {
    const charCode = hash.charCodeAt(i % hash.length) ?? 65;
    // Map char code to [-1.0, 1.0]
    const val = (charCode - 80) / 50;
    vector.push(val);
    sumSq += val * val;
  }

  const norm = Math.sqrt(sumSq) || 1;
  return vector.map((v) => v / norm);
}

export async function startFakeAIServer(): Promise<FakeProviderServer> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        const url = req.url ?? '/';

        if (url.includes('/embeddings')) {
          try {
            const payload = JSON.parse(body || '{}');
            const inputs: string[] = Array.isArray(payload.input)
              ? payload.input
              : typeof payload.input === 'string'
              ? [payload.input]
              : ['test'];

            const dims = typeof payload.dimensions === 'number' ? payload.dimensions : 1536;
            const data = inputs.map((inputStr, idx) => {
              const vector = createDeterministicVector(inputStr, dims);
              const embedding =
                payload.encoding_format === 'base64'
                  ? Buffer.from(new Float32Array(vector).buffer).toString('base64')
                  : vector;

              return {
                object: 'embedding',
                index: idx,
                embedding,
              };
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                object: 'list',
                data,
                model: payload.model ?? 'text-embedding-3-small',
                usage: { prompt_tokens: 10, total_tokens: 10 },
              })
            );
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Invalid JSON payload' } }));
          }
        } else if (url.includes('/chat/completions')) {
          try {
            const payload = JSON.parse(body || '{}');
            const messages: Array<{ role: string; content: string }> = payload.messages ?? [];
            const userMsg = messages.find((m) => m.role === 'user')?.content ?? '';

            // Derive cited answer
            let answerText = 'Based on the retrieved context, here is the answer [S1].';
            if (userMsg.toLowerCase().includes('rate limit')) {
              answerText = 'The notes recommend exponential backoff [S1].';
            }

            const jsonResponse = JSON.stringify({
              answer: answerText,
              citations: ['S1'],
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: 'chatcmpl-fake123',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: payload.model ?? 'gpt-4o-mini',
                choices: [
                  {
                    index: 0,
                    message: {
                      role: 'assistant',
                      content: jsonResponse,
                    },
                    finish_reason: 'stop',
                  },
                ],
              })
            );
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Invalid JSON payload' } }));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Not found' } }));
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}/v1`;
      resolve({
        server,
        port,
        baseUrl,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
