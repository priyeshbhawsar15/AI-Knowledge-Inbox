# AI Knowledge Inbox

A private, single-user knowledge inbox for saving text notes and public URLs, then asking grounded questions about them. It runs a React interface, an Express API, a durable SQLite-backed ingestion worker, and an OpenAI-compatible embedding/chat provider.

## What it does

- Save a plain-text note or public URL through a Keep-inspired card interface.
- Process content asynchronously: safely fetch URLs, extract text, chunk it, create embeddings, and persist the result.
- Ask a question and receive a RAG answer with citations to the saved source chunks.
- Keep accepted jobs, items, chunks, and vectors durable across API/worker container restarts.

![Desktop Screenshot](artifacts/screenshots/desktop-1440x1000.png)

## Architecture Overview

```text
[ React SPA (Google Keep-inspired UI) ]
                   │ (HTTP JSON)
                   ▼
┌────────────────────────────────────────────────────────┐
│ Express API                                            │
│ - POST /ingest, GET /items, GET /items/:id, POST /query│
│ - Storage: SQLite WAL + In-Memory Disposable Vector    │
└───────────┬────────────────────────────────────────────┘
            │
            ├───────────────────────┐ (claim/write durable jobs)
            ▼                       ▼
┌────────────────────────┐  ┌────────────────────────────────────┐
│ SQLite Database        │  │ Ingestion Worker                   │
│ - items, jobs, chunks, │  │ - SSRF-safe Fetcher (5 redirects)  │
│   embeddings, events   │  │ - HTML Extractor & Paragraph Chunker│
└────────────────────────┘  │ - OpenAI Embedding Publisher       │
                            └────────────────────────────────────┘
```

## Key Trade-Offs & Rationale

### 1. Chunking Strategy Rationale

We employ a **paragraph-aware deterministic chunker** targeting **800 tokens** per chunk with **120 tokens overlap** between adjacent chunks (~4 characters per token approximation):

- **Paragraph boundaries (`\n\n`):** Preserves semantic coherence by avoiding arbitrary sentence cuts.
- **800-token target:** Fits well within OpenAI embedding models (`text-embedding-3-small` / 1536d) while providing enough semantic context for RAG chunk retrieval.
- **120-token overlap:** Ensures key transitions between paragraphs are captured across chunk boundaries.
- **Sliding window for long paragraphs:** Paragraphs >800 tokens are split using a sliding window to guarantee bounded chunk sizes.

### 2. Vector Storage & Retrieval Choice

- **Durable Source of Truth:** SQLite (`better-sqlite3` in WAL mode) stores Float32 embedding BLOBs in the `chunks` table (`dimensions * 4` bytes).
- **Disposable API Vector Index:** The API maintains a complete, process-local in-memory vector snapshot built from ready chunks. Cosine similarity ranking is exact and O(N) over up to 10,000 items.
- **Atomic Index Reload:** When `index_version` bumps or on startup, the API reloads ready chunks off to the side and performs an atomic pointer swap, avoiding query lock contention.

### 3. SSRF & Fetch Security Controls

- **Protocol & Port Restrictions:** Only `http:` and `https:` protocols on standard ports (80, 443) are accepted. Credentials in URLs are forbidden.
- **DNS & IP Validation:** Target hostnames are resolved via DNS prior to connection. Loopback (`127.0.0.0/8`, `::1`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), multicast (`224.0.0.0/4`), and reserved IP ranges are blocked.
- **Redirect Revalidation:** Up to 5 redirects are manually followed, with every hop independently revalidated against SSRF IP policies to prevent DNS rebinding attacks.
- **Streaming & Content Caps:** 30-second overall timeout, 10-second connect budget, 2 MiB streamed body limit, and strict `text/html` / `text/plain` Content-Type validation.

### 4. Scale Breakpoints & Production Evolution

- **Current Limits:** Designed for single-operator use up to 10,000 items on local hardware.
- **Breakpoints:** Single SQLite writer bottleneck, process-local in-memory vector index memory footprint, single-worker polling queue.
- **Production Path:** Migrate jobs and items to PostgreSQL, vectors to `pgvector` / managed vector DB, replace worker polling with Redis/SQS queue, deploy stateless API and worker instances.

## AI Provider Data Disclosure

Raw document text, questions, and embedding requests are sent to the configured OpenAI-compatible API endpoint (`AI_BASE_URL`). Ensure non-public or sensitive information is handled according to your AI provider's data privacy policies.

## Visual & Interaction Design Signature

- **Google Keep-Inspired Interaction:** Low-friction collapsed composer ("Take a note or paste a URL...") that expands in place on focus, combined with a responsive 4-column desktop / 2-column tablet / 1-column mobile card grid.
- **Original Visual Identity:** Warm paper-neutral canvas (`#FBF9F5`), charcoal text (`#1C1917`), soft white cards (`#FFFFFF`), and gold accent (`#D97706`).
- **Knowledge Pulse Signature:** Slim edge indicator on each note card communicating `queued`, `processing`, `ready`, or `failed` status, combined with accessible non-color-only icon + text badges.

## Run with Docker Compose

### Requirements

- Docker Engine with the Compose plugin
- An OpenAI-compatible embedding and chat provider. The provider key stays local in `.env`; never commit it.

### Start the application

```bash
# 1. Clone and enter the repository
git clone <repository_url>
cd ai-knowledge-box

# 2. Create local provider configuration
cp .env.example .env
```

Edit `.env` and set `AI_BASE_URL`, `AI_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, and `CHAT_MODEL` for your provider. Do not put secrets in source code or commit `.env`.

```bash
# 3. Build and start the API and ingestion worker in the background
docker compose up --build -d

# 4. Confirm both services are running
docker compose ps
curl -fsS http://127.0.0.1:3000/health/ready
```

Open the UI at [http://127.0.0.1:3000](http://127.0.0.1:3000). The Compose port is intentionally bound to loopback only.

```bash
# Follow service logs
docker compose logs -f api worker

# Stop the application while retaining the SQLite data volume
docker compose down
```

> The `knowledge-data` Docker volume holds the SQLite database. Do not run `docker compose down -v` unless you intentionally want to delete all saved items, jobs, chunks, and vectors.

## Local Development Setup

Requirements: Node.js 22 LTS and npm 10+.

```bash
npm install
npm run build
```

Run these in three terminals from the repository root:

```bash
# Terminal 1: Express API on http://127.0.0.1:3000
npm run dev --workspace=@ai-knowledge-inbox/api

# Terminal 2: durable ingestion worker
npm run dev --workspace=@ai-knowledge-inbox/worker

# Terminal 3: Vite web UI on http://127.0.0.1:5173
npm run dev --workspace=@ai-knowledge-inbox/web
```

Vite proxies `/ingest`, `/items`, `/query`, and `/health` to the local API during development.

## Backup & Restore Runbook

To backup the SQLite database:

1. Copy `/data/knowledge.db` (or run `sqlite3 /data/knowledge.db ".backup '/data/backup.db'"`).
2. To restore: stop containers, replace `/data/knowledge.db`, run `PRAGMA integrity_check`, and restart.

## Verification & Test Matrix

- `npm run typecheck` — TypeScript strict type checks
- `npm run lint` — ESLint validation
- `npm test` — Vitest unit and integration suite
- `npm run test:compose` — isolated Docker Compose ingestion, retrieval, restart-persistence pipeline
- `npm run test:e2e` — build, Compose pipeline, Playwright browser flows, and responsive screenshots
