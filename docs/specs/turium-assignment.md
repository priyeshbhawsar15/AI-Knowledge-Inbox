---
type: "requirements"
area: "project"
project: "AI Knowledge Inbox"
status: "approved"
tags:
  - "project"
  - "requirements"
  - "interview-assignment"
parent: "[[20 Projects/AI Knowledge Inbox/Project]]"
---

# Turium AI Interview Assignment — Normalized Requirements

> Canonical transcription of the PDF supplied by Priyesh for implementation planning. The approved system design refines these requirements without expanding the assignment into a production platform.

## Goal

Build a small production-style web application that lets a user:

1. Save short notes or URLs.
2. Ask questions over saved content.
3. Receive answers powered by a simple retrieval-augmented generation pipeline.

The task intentionally exercises frontend, backend, asynchronous processing, AI integration, and system design without unnecessary infrastructure.

- Expected effort: 6–12 hours of real work.
- Calendar cap: 2–3 days.

## Functional requirements

### Content ingestion

- Add plain-text notes.
- Add URLs and fetch their page content server-side.
- Store raw content and metadata, including timestamp and source type.
- No authentication is required; a single-user system is acceptable.

### Semantic search and RAG

- Use an intentional chunking strategy.
- Generate embeddings with OpenAI, a local model, or an equivalent provider.
- Store vectors in memory, SQLite, or another lightweight database.
- Accept a question and retrieve the most relevant chunks.
- Send the retrieved context and question to an LLM.
- Return an answer with cited sources.

### Frontend

- Provide note and URL input.
- List saved items.
- Provide a question interface.
- Display the answer and source snippets.
- Use React hooks and reasonable state management.
- Favor clarity over decorative complexity.

### API design

Required endpoints:

- `POST /ingest`
- `GET /items`
- `POST /query`

The implementation will be evaluated on request/response shapes, error handling, input validation, and naming.

## Non-functional expectations

### Trade-off awareness

The implementation and README must explain:

- Chunking rationale.
- Vector-store choice.
- What fails or becomes inefficient at scale.
- What would change for production.

### Debuggability

- Structured logging.
- Clear error messages.
- Sensible HTTP status codes.

### Code quality

- Separation of concerns.
- No god files.
- No copy-paste-heavy structure.
- Clear naming.

## Technology constraints

- Backend: Node + Express or FastAPI.
- AI: OpenAI or an equivalent API.
- Persistence/vector storage: SQLite, memory, or a simple vector store.
- Frontend: React; Tailwind and shadcn are optional.
- Avoid full authentication systems, Kubernetes-style infrastructure, and other overengineering.

## Approved refinement

The implementation must follow [[20 Projects/AI Knowledge Inbox/docs/system-design/ai-knowledge-inbox|AI Knowledge Inbox — System Design]], including the durable SQLite-backed ingestion queue, separate worker process, exact in-process cosine retrieval, SSRF-safe URL fetching, and the Google Keep-inspired—but visually original—note composer and card browsing experience.
