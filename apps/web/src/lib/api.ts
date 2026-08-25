import type {
  IngestRequest,
  IngestResponse,
  ItemsListResponse,
  ItemDetail,
  ItemsQueryParams,
  QueryResponse,
  ErrorEnvelope,
} from '@ai-knowledge-inbox/contracts';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errEnvelope: ErrorEnvelope | null = null;
    try {
      errEnvelope = (await res.json()) as ErrorEnvelope;
    } catch {
      // ignore
    }
    const msg = errEnvelope?.error?.message ?? `API error ${res.status}`;
    const err = new Error(msg);
    (err as unknown as Record<string, unknown>).errorEnvelope = errEnvelope;
    (err as unknown as Record<string, unknown>).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export async function ingestItem(
  data: IngestRequest,
  idempotencyKey?: string
): Promise<IngestResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch('/ingest', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  return handleResponse<IngestResponse>(res);
}

export async function fetchItems(params?: ItemsQueryParams): Promise<ItemsListResponse> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);

  const url = `/items${query.toString() ? '?' + query.toString() : ''}`;
  const res = await fetch(url, { method: 'GET' });
  return handleResponse<ItemsListResponse>(res);
}

export async function fetchItemById(id: string): Promise<ItemDetail> {
  const res = await fetch(`/items/${id}`, { method: 'GET' });
  return handleResponse<ItemDetail>(res);
}

export async function queryKnowledge(question: string, topK = 5): Promise<QueryResponse> {
  const res = await fetch('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, topK }),
  });
  return handleResponse<QueryResponse>(res);
}
