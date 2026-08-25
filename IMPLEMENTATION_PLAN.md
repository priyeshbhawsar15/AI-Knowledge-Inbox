---
type: "plan"
area: "project"
project: "AI Knowledge Inbox"
status: "active"
tags:
  - "project"
  - "plan"
  - "implementation"
parent: "[[20 Projects/AI Knowledge Inbox/Project]]"
---

# AI Knowledge Inbox — Detailed Implementation Plan

> **Coding-agent execution contract:** This plan implements Priyesh's approved system design in the canonical Gaming PC repository `/home/priyesh/Work/ai-knowledge-box`. Follow phases in order, keep each phase independently verifiable, and do not invent requirements that conflict with the indexed specifications. Implementation is authorized; public deployment, Caddy wiring, authentication, and merging into another branch are not.

## 0. Reference Specifications & Document Index

The repository must contain every source below before implementation begins. The Markdown system design is authoritative when a summarized task conflicts with a detail.

| Document | Repository path | What it specifies | Used by |
|---|---|---|---|
| Approved system design | `SYSTEM_DESIGN.md` | Scope, architecture, component boundaries, API contracts, schemas, state machines, security, failure behavior, deployment, tests, and acceptance criteria. | All phases |
| Interactive design companion | `docs/specs/system-design.html` | Accessible architecture map and equivalent implementation context. | Architecture orientation and review |
| Assignment requirements | `docs/specs/turium-assignment.md` | Original Turium functional and non-functional requirements normalized from the supplied PDF. | All phases, especially final rubric review |
| This execution plan | `IMPLEMENTATION_PLAN.md` | Ordered tasks, paths, tests, phase gates, rollback points, and completion evidence. | All phases |

### Source priority

1. `SYSTEM_DESIGN.md` is authoritative for implementation behavior.
2. `docs/specs/turium-assignment.md` defines the assignment rubric.
3. `IMPLEMENTATION_PLAN.md` controls execution order and verification.
4. If a material contradiction remains, stop and document it in the final report rather than guessing.

## 1. Execution boundaries

### Authorized

- Implement the full application in `/home/priyesh/Work/ai-knowledge-box` on the Gaming PC `pb-desk`.
- Create and work on branch `implementation/ai-knowledge-inbox`; do not merge it.
- Install repository-scoped npm dependencies and Playwright's repository browser if needed.
- Create SQLite databases only under repository test/artifact directories or Docker volumes.
- Build and run local processes and Docker Compose for verification.
- Use deterministic fixture HTTP servers and fake OpenAI-compatible AI servers for automated tests.
- Produce screenshots, test reports, and an implementation report under `artifacts/`.

### Prohibited

- Do not expose the application publicly, alter Caddy/DNS, or deploy to The Shell.
- Do not reuse, print, inspect, or copy Pi/OmniRoute/Codex credentials into the application.
- Do not commit `.env`, credentials, provider payloads, database files, logs containing note content, or generated browser caches.
- Do not call a real AI provider unless a separate app-specific key is already supplied in a local `.env` and the user explicitly authorizes a live smoke test. The current handoff does not authorize it.
- Do not add authentication, Redis, PostgreSQL, a dedicated vector database, Kubernetes, crawling, file upload, editing, deletion, pinning, labels, archive, checklists, drag reordering, or note colors.
- Do not add dummy records or hardcoded fallback UI data. Test fixtures are allowed only inside tests.
- Do not delegate to subagents or spawn another coding agent. Pi must perform the work directly.
- Do not merge or push. Local commits on the implementation branch are allowed, but the final report must enumerate them.

### Environment facts

- Host: `pb-desk`, user `priyesh`.
- Repository: `/home/priyesh/Work/ai-knowledge-box`; currently an empty Git repository with an unborn `master` branch.
- Runtime: Node `22.23.2`, npm `12.0.2`, Docker Engine `29.7.2`, Docker Compose `5.5.0`.
- Browser tooling: system Chromium and Playwright CLI are available.
- Package manager: use npm workspaces because npm is installed and Corepack/pnpm are not. Pin the package manager in `package.json`; do not globally install a package manager.
- Resource constraint: use one Playwright worker and avoid concurrent Docker builds/browser suites.

## 2. Target repository structure

```text
.
├── apps/
│   ├── api/src/{app.ts,index.ts,middleware/,routes/,services/}
│   ├── worker/src/{index.ts,runner.ts,processors/}
│   └── web/src/{components/,features/,hooks/,lib/,pages/,styles/}
├── packages/
│   ├── ai/src/
│   ├── config/src/
│   ├── contracts/src/
│   ├── db/src/{migrations/,repositories/}
│   ├── domain/src/
│   ├── ingestion/src/
│   └── observability/src/
├── tests/
│   ├── fixtures/
│   ├── integration/
│   ├── e2e/
│   └── support/
├── docs/specs/
├── artifacts/{agent-reports/,screenshots/,test-results/}
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.base.json
├── eslint.config.js
├── .env.example
├── .gitignore
├── IMPLEMENTATION_PLAN.md
├── SYSTEM_DESIGN.md
└── README.md
```

Keep files focused. Application layers may depend inward on contracts/domain abstractions; browser code must never import Node-only DB, filesystem, or secret-bearing modules.

## 3. Phase summary

| Phase | Deliverable | Main verification gate |
|---|---|---|
| 0 | Repository baseline and toolchain | Branch/path/docs verified; install, typecheck, and empty tests run |
| 1 | Shared contracts, configuration, logging, and domain policies | Unit tests for schemas, transitions, errors, and config |
| 2 | SQLite schema, migrations, repositories, queue, and vector encoding | Migration/integrity/transaction/lease tests |
| 3 | Express ingestion and item APIs | Supertest success/error/idempotency/pagination tests |
| 4 | Fetch, extract, chunk, and durable worker | SSRF/redirect/limit/chunk/retry/recovery tests |
| 5 | AI adapter, transactional embedding publication, and vector index | Fake-provider, dimension, atomicity, cosine, reload tests |
| 6 | RAG query endpoint and citation validation | Retrieval, insufficient-context, provider-error, citation tests |
| 7 | Google Keep-inspired React application | Component/accessibility/keyboard/responsive/browser tests |
| 8 | Docker, health, observability, security, and documentation | Compose E2E, restart persistence, secret/log checks |
| 9 | Final rubric audit and evidence | All gates pass; screenshots and report complete |

## 4. Detailed phases

### Phase 0 — Repository baseline and executable skeleton

**Reference specs:** `SYSTEM_DESIGN.md` §§1–3, §10; assignment technology and code-quality constraints.

**Objective:** Establish a reproducible monorepo without making implementation behavior depend on global tooling.

**Tasks:**

1. Verify `hostname`, `pwd`, current branch, Git status, and the four indexed specification files.
2. Create/switch to the unborn branch `implementation/ai-knowledge-inbox`. Do not create or modify `main`/`master` afterward.
3. Create root npm workspaces for `apps/*` and `packages/*`; pin Node `>=22 <23` and npm `12.x`.
4. Add strict shared TypeScript configuration with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`; use `import type` where required.
5. Add scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:unit`, `test:integration`, `test:e2e`, `db:migrate`, and `start`.
6. Configure Vitest workspaces, ESLint, Prettier/check formatting, React Testing Library, Supertest, and Playwright with one worker.
7. Add `.gitignore` for `.env`, `node_modules`, builds, coverage, Playwright caches, SQLite/WAL/SHM files, logs, and runtime artifacts while retaining curated reports/screenshots.
8. Add `.env.example` with placeholders and safe defaults only.
9. Add minimal package entrypoints so install, typecheck, lint, build, and an empty smoke test execute successfully.

**Gate:** `npm install`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` exit `0` from a clean checkout.

**Rollback point:** retain only specifications and toolchain files; no database schema exists yet.

### Phase 1 — Contracts, configuration, observability, and domain policies

**Reference specs:** `SYSTEM_DESIGN.md` §§2, 3 component contracts, 5 API/error contracts, 7 lifecycles, 8 security, 10 configuration/observability.

**Objective:** Define shared behavior before route, worker, or UI code.

**Tasks:**

1. In `packages/contracts`, implement strict Zod schemas and inferred types for:
   - Text and URL `POST /ingest` requests.
   - `202` ingest response.
   - Item summary/detail and cursor-list response.
   - `POST /query` request and cited response.
   - Stable error envelope and health responses.
2. Reject unknown fields and enforce exact limits: 256 KiB body, 50,000 note characters, 2,048 URL characters, 2,000 question characters, `topK` 1–10, and idempotency key UUID/max 128.
3. In `packages/config`, validate all environment values at startup and expose typed, immutable config without logging secrets.
4. In `packages/domain`, implement item/job/index states, transition guards, retry classifications, safe error codes, UUIDv7-prefixed ID helpers, and request normalization/hash policies.
5. In `packages/observability`, configure Pino child loggers and request/job correlation context. Add redaction for authorization headers, API keys, prompts, content, embeddings, provider bodies, and URL query strings.
6. Unit-test all schemas, boundaries, invalid transitions, retry classifications, redaction, and deterministic request hashing.

**Gate:** contract/domain/config/logger tests pass, and a scan confirms no default secret or runtime provider credential exists in source.

### Phase 2 — SQLite schema, migrations, repositories, queue, and vector encoding

**Reference specs:** `SYSTEM_DESIGN.md` §§4 consistency/idempotency, 6 data model, 7 item/job/index lifecycles, 9 SQLite recovery.

**Objective:** Make SQLite the only durable source of truth and prove transaction boundaries before introducing network work.

**Tasks:**

1. Implement Drizzle schema and SQL migrations for `items`, `ingestion_jobs`, `chunks`, `events`, `idempotency_keys`, `system_state`, and `worker_state` exactly as specified.
2. Enable `foreign_keys=ON`, WAL, `synchronous=NORMAL`, and `busy_timeout=5000` on every connection.
3. Implement repository boundaries; keep raw SQL inside `packages/db` only.
4. Implement atomic item + job + accepted-event creation with 24-hour idempotency replay/conflict behavior.
5. Implement cursor pagination ordered by `(created_at DESC, id DESC)` and ensure list APIs cannot return raw content or embeddings.
6. Implement atomic job claim, 60-second lease, 15-second heartbeat, retry scheduling, expired-lease reaping, terminal failure, and worker heartbeat upsert.
7. Implement final publication transaction: replace chunks, mark item ready/job succeeded, clear safe errors, increment index version, and append event together.
8. Implement little-endian `Float32` BLOB encode/decode, byte-length/dimension validation, and L2 normalization.
9. Add integration fixtures using isolated temporary databases; run migrations on empty and already-migrated databases.
10. Test FK/check/unique constraints, lock retries, idempotency conflict, competing claims, lease recovery, no partial publication, vector corruption detection, and `PRAGMA integrity_check`.

**Gate:** all DB integration tests pass repeatedly and leave no repository-root database files.

### Phase 3 — Express API for ingestion and item reads

**Reference specs:** `SYSTEM_DESIGN.md` §§3 API component, 4 ingestion/idempotency, 5 `POST /ingest`, `GET /items`, `GET /items/:id`, error envelope, and health basics.

**Objective:** Expose the durable acceptance path without coupling HTTP code to worker processing.

**Tasks:**

1. Build `createApp(dependencies)` separately from the listening entrypoint for testability.
2. Add request ID middleware, JSON/body-size handling, typed Zod validation, safe error mapping, security headers, and Pino request completion logs.
3. Implement `POST /ingest` with optional `Idempotency-Key`; return only after the item/job/event transaction commits.
4. Implement `GET /items` cursor/status filtering with default 25 and max 100.
5. Implement `GET /items/:id` with chunk count and latest safe error, excluding full raw content and vectors from generic list responses. The item detail contract may include bounded display content required by the approved note viewer; keep source HTML unrendered and document the exact additive field.
6. Add in-memory rate limits: 10 ingest/minute/IP and maximum queue depth 1,000.
7. Add liveness now; defer complete readiness until worker/index phases.
8. Supertest all response shapes, validation failures, `413`, `409`, DB busy handling, pagination stability, no-mutation failures, and content/secret non-disclosure.

**Gate:** API suite passes against an isolated migrated SQLite database and exactly preserves required unprefixed endpoints.

### Phase 4 — Safe fetch, extraction, chunking, and durable worker

**Reference specs:** `SYSTEM_DESIGN.md` §§3 worker/fetcher/extractor, 4 ingestion sequence, 7 job lifecycle, 8 SSRF/fetch limits, 9 failure/retry table.

**Objective:** Run a durable, independently recoverable ingestion process; keep fetcher/extractor/chunker as worker-internal modules, not services.

**Tasks:**

1. Implement `fetchPublicDocument` accepting only HTTP(S), no credentials, and standard ports unless configuration explicitly allows otherwise.
2. Resolve and validate every target/redirect against loopback, private, link-local, multicast, reserved, and localhost-name ranges; revalidate each redirect and pin connections against DNS rebinding.
3. Enforce five redirects, 30-second total, 10-second connect/header budget, streamed 2 MiB cap, HTML/plain-text types, identifiable user agent, and no proxy inheritance.
4. Implement extraction with scripts/styles/forms/navigation/boilerplate removed; return title, canonical URL only when safe, normalized readable text, and stable terminal error for empty/too-short content.
5. Implement paragraph-aware deterministic chunking targeting 800 tokens with 120-token overlap; token-window long paragraphs and record ordinal/count/hash/offset metadata where useful.
6. Implement worker loop: reclaim leases, claim one job, start heartbeat, load item, fetch only URL items, normalize typed notes, extract, chunk, and pass the chunks to the later embedding boundary.
7. Until Phase 5, inject a fake embedding publisher in tests; do not commit a runtime dummy implementation.
8. Classify DNS/network timeout and HTTP 408/429/5xx as transient; URL policy, unsupported type, oversize, empty extraction, and invalid persisted input as terminal. Apply 2/8/32-second jittered retry schedule.
9. Build fixture HTTP-server cases for safe HTML, text, redirects, redirect-to-private, timeout, oversize, unsupported media, malformed/empty pages, and canonical URL edge cases.
10. Prove worker crash before final commit leaves zero searchable chunks and expired leases recover.

**Gate:** worker/ingestion tests pass without internet access; SSRF matrix covers direct and redirected addresses.

### Phase 5 — AI provider adapter, embedding publication, and vector index

**Reference specs:** `SYSTEM_DESIGN.md` §§2 F5/F6, 3 AI/index contracts, 4 ingestion/query consistency, 6 model-change policy, 7 index lifecycle, 9 AI failures, 10 cost controls.

**Objective:** Add one OpenAI-compatible boundary while preserving deterministic offline tests and dimension invariants.

**Tasks:**

1. Implement `packages/ai` using the official OpenAI JavaScript client with injected `baseURL`, key, embedding model/dimensions, and chat model.
2. Batch document embeddings with bounded batch size; enforce response count, finite floats, exact dimensions, and model compatibility.
3. Hash chunks and avoid duplicate re-embedding within retries when the same successful in-memory response can safely be reused; never persist partial vectors.
4. Connect the worker to the final DB publication transaction only after every chunk has a valid vector.
5. Implement the disposable API-side vector index as a complete immutable snapshot of ready, configured-model chunks using normalized `Float32Array`s.
6. Implement exact cosine/dot-product ranking, stale-version detection, off-to-the-side reload, atomic swap, and degraded startup/model mismatch behavior.
7. Implement a deterministic fake OpenAI-compatible HTTP server for integration/E2E tests. It must derive vectors and cited answers from input predictably; it must never be used as a production fallback.
8. Test timeouts, 429/5xx retry, auth/model/shape/dimension terminal failures, malformed BLOBs, empty index, reload during queries, and old-snapshot continuity.

**Gate:** one text and one fixture URL reach `ready` through the real worker/DB path using the fake provider; vectors read back with correct dimensions and index version.

### Phase 6 — Retrieval, RAG prompt, and `POST /query`

**Reference specs:** `SYSTEM_DESIGN.md` §§4 query sequence, 5 query contract, 7 query lifecycle, 8 prompt-injection boundary, 9 malformed citation handling.

**Objective:** Return grounded answers whose citations can only reference retrieved source IDs.

**Tasks:**

1. Validate and normalize the question; reject queries when no ready content exists.
2. Read index metadata, reload if stale, generate the query embedding, and exact-rank configured-model chunks.
3. Enforce minimum relevance, top five default/top ten maximum, bounded per-source snippets and total context tokens.
4. Build context labels `S1…Sn`; quote content as untrusted data and disable tool calling.
5. Request structured JSON containing answer and citation IDs; schema-validate and reject unknown/duplicate-invalid references.
6. If retrieval is insufficient, return an explicit insufficient-context response without a chat-model call.
7. Permit one corrective retry for malformed structured output, then return `502 AI_INVALID_RESPONSE`.
8. Return cited item ID/title/URL/snippet/score and request ID; never fabricate citations.
9. Add tests for relevant ranking, model mismatch, no-ready-content, insufficient score, provider errors, injection-like note text, malformed answers, unknown IDs, and abort behavior.

**Gate:** an integration test ingests deterministic content and asks a question through `POST /query`, proving persisted retrieval and validated sources.

### Phase 7 — Google Keep-inspired React experience

**Reference specs:** `SYSTEM_DESIGN.md` §2 F8/F10 and frontend direction, §3 React contract, §5 APIs, §11 frontend tests and acceptance.

**Objective:** Deliver a low-friction note inbox inspired by Google Keep's interaction model but with original visual identity and no unsupported product features.

**Design invariants:**

- Warm paper-neutral canvas, charcoal text, soft cards, restrained gold accent, original icons/geometry, 12–16 px radii.
- Product signature: slim non-color-only “knowledge pulse” edge/status treatment.
- No Google branding, Keep palette copying, pins, labels, archive, checklists, drag reorder, or per-note colors.

**Tasks:**

1. Build an accessible application shell with prominent search and question surfaces; use real API hooks only.
2. Implement a collapsed “Take a note or paste a URL…” composer that expands on focus to optional title, text/URL mode, Save, and Cancel.
3. Retain entered content and expose stable request/error IDs on recoverable failures. Add a pending card only after durable `202`.
4. Implement a responsive masonry-like card grid: four columns wide, two tablet, one mobile. Use content-led cards with title, bounded preview/hostname, browser-local timestamp, and queued/processing/ready/failed status text plus pulse.
5. Poll pending items approximately every second with backoff and stop in terminal states.
6. Open a centered accessible detail dialog on desktop and full-height sheet on mobile; trap focus, return focus on close, preserve list position, and scroll long content inside the viewer.
7. Implement the question flow, loading/error/insufficient states, answer text, and source snippets that identify or focus the cited card.
8. Implement `/` to focus search, `n` to focus composer when no editable field is active, and `Escape` to close/cancel. Ensure keyboard-visible actions, semantic live regions, reduced motion, and 44 px mobile targets.
9. Implement zero-data, queued, processing, ready, failed, long-title/content, API-down, and no-results states from actual API responses—not hardcoded fallback records.
10. Component-test composer transitions, modes, validation, retained errors, polling, dialog focus/return, local-time rendering, keyboard behavior, citations, and no-color-only status.
11. Run Playwright at exactly 1440×1000, 768×1024, and 390×844. Assert no document-level horizontal overflow, exercise the primary flows with the deterministic backend, and save screenshots with verified pixel dimensions.
12. Perform one visual critique/revision pass after the first screenshots, addressing hierarchy, spacing, contrast, overflow, dense/empty states, and mobile ergonomics.

**Gate:** React tests, accessibility-focused assertions, production build, and browser flows pass; all three screenshots are distinct and dimensions verified.

### Phase 8 — Health, security, Docker Compose, persistence, and README

**Reference specs:** `SYSTEM_DESIGN.md` §§8–11.

**Objective:** Turn the working modules into a reproducible local production-style deliverable.

**Tasks:**

1. Complete `/health/live` and `/health/ready`: current migrations, writable DB, compatible index, and recent worker heartbeat represented without leaking internals.
2. Add CSP, `nosniff`, `no-referrer`, React text-only rendering, bounded request sizes, query rate limit 30/minute/IP, and startup secret/config validation.
3. Ensure logs include service/version/environment/request/job/item IDs, safe events, duration/attempt/status, queue depth, provider latency/token counts, and index metadata—but never content, prompts, vectors, keys, authorization, provider bodies, or full query-string URLs.
4. Add multi-stage non-root Docker image building API, worker, and web assets.
5. Add Compose services `api` and `worker`, one named `/data` volume, loopback host binding `127.0.0.1:3000`, health checks, rotation-safe logging, and identical schema/model configuration.
6. Ensure migrations run once before API readiness; worker refuses schema mismatch.
7. Add a test Compose configuration/profile using the deterministic fake provider and fixture URL service; do not ship it as a production fallback.
8. Run full E2E: start clean Compose, ingest note and URL, wait for ready, query with citations, stop/recreate API and worker without deleting volume, then verify items and query/index rebuild persist.
9. Add README covering setup, architecture, package scripts, configuration, AI-provider disclosure, chunking rationale, SQLite/vector trade-offs, SSRF controls, troubleshooting, backup/restore, scale breakpoints, production evolution, and screenshots.
10. Run dependency audit and secret-pattern scan; triage findings rather than applying risky automatic upgrades.

**Gate:** image build and clean Compose E2E pass; restart persistence is proven by API and SQLite readback; no secret/content logging violations are found.

### Phase 9 — Final rubric audit and handoff evidence

**Reference specs:** all indexed documents, especially `SYSTEM_DESIGN.md` §11 and the assignment rubric.

**Objective:** Prove the result rather than relying on Pi's implementation summary.

**Tasks:**

1. Run from repository root and record exit status for:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e`
   - `docker compose config`
   - production image build
2. Run `git diff --check`; inventory tracked and untracked files; ensure no `.env`, DB, WAL/SHM, raw logs, browser cache, or secret-bearing artifact is tracked.
3. Review required endpoint names and payloads against the assignment and shared Zod contracts.
4. Trace one accepted item from API transaction → queued job → worker stages → final chunks/vectors → index → cited query response.
5. Verify restart durability and read back persisted title/status/chunk count without exposing note body in logs.
6. Verify SSRF tests cover direct and redirected loopback/private/link-local cases.
7. Verify screenshots at 1440×1000, 768×1024, and 390×844; report their actual dimensions and ensure mobile has no horizontal overflow.
8. Confirm every out-of-scope feature remains absent and no dummy UI data exists.
9. Write `artifacts/agent-reports/pi-gemini-implementation.md` with:
   - Model route and repository/branch.
   - Phase completion table.
   - Exact files/components created.
   - Commands and exit codes.
   - Browser screenshot paths/dimensions and whether data was deterministic/test or live.
   - Compose persistence evidence.
   - Known limitations or blockers.
   - Git commits and final `git status --short`.
10. Do not merge or push. Stop local dev servers/Compose after evidence capture unless required for an explicitly reported preview.

**Final gate:** all mandatory checks pass, or the report clearly marks the implementation blocked/incomplete with exact failing commands and preserves useful work.

## 5. Cross-cutting test matrix

| Boundary | Required evidence |
|---|---|
| Validation | Unknown fields and all documented size/range limits rejected without mutation |
| Durability | Item/job/event creation commits atomically; restart retains accepted work |
| Queue safety | Competing claims, leases, heartbeat, backoff, exhaustion, and crash recovery tested |
| Fetch security | Scheme, credentials, ports, DNS, every redirect, private/link-local targets, timeout, size, and type tested |
| Extraction/chunking | Boilerplate removal, empty content, deterministic 800/120 strategy, long paragraph behavior tested |
| Embeddings | Batch count, dimensions, finite values, BLOB length, model mismatch, retry and no-partial publication tested |
| Retrieval | Exact cosine ranking and index version atomic reload tested |
| RAG | Prompt-injection-like sources treated as data; unknown citation IDs rejected |
| UI | Real API states, no mock fallbacks, keyboard/focus, responsive layouts, local time, error retention tested |
| Privacy/logging | No note/page text, prompts, vectors, secrets, authorization, or full query-string URLs in logs |
| Deployment | Loopback-only Compose, non-root image, health/readiness, persistent named volume tested |

## 6. Commit and rollback strategy

1. Work only on `implementation/ai-knowledge-inbox`.
2. Prefer cohesive local commits after phase gates, for example `chore: scaffold workspace`, `feat: add durable ingestion`, `feat: add rag query`, `feat: add knowledge inbox ui`, and `test: prove compose persistence`.
3. Do not rewrite or force-push history.
4. A failed phase should be repaired in place or reverted to the last passing local commit; never conceal failures by deleting tests.
5. Database migrations are forward-only for this assignment. Roll back runtime code by returning to the prior passing commit and restoring a database copy made before an incompatible migration.
6. No merge into `master`/`main` occurs without Priyesh's review and explicit approval.

## 7. Definition of done

Implementation is complete only when:

- All required assignment flows work through the React UI and exact required API endpoints.
- Both note and public-URL ingestion are durable and reach `ready` or a stable, visible failure.
- A query returns grounded cited snippets from persisted content.
- The Keep-inspired composer, card grid, detail viewer, and responsive/accessibility invariants are browser-verified.
- SSRF protections and bounded fetching are covered by tests.
- SQLite survives full API/worker Compose recreation and the in-memory index rebuilds.
- Logs and artifacts contain no secrets or saved content.
- README explains trade-offs and production evolution.
- The final report and curated screenshots exist.
- The implementation branch remains unmerged and unpushed for Priyesh's review.
