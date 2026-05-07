# Jira Epic — Web Chat + RAG Document Management

**Epic ID**: TAG-200
**Epic Name**: Dashboard Chat with RAG Citations + Admin Document Management
**Sprint Length**: ~9 working days (45 story points)
**Priority**: P1 — needed for demo to show "non-CLI users can also use the platform"
**Path**: Path C (RAG-grounded chat now, agent loop deferred to v2)

---

## Decisions committed

1. **Chat architecture**: Backend-orchestrated, SSE streaming to browser. Frontend never holds API keys, never calls LiteLLM directly.
2. **Chat capabilities v1**: Model selection + RAG grounding + citation display. NO skills, NO MCP tools, NO agent loop.
3. **Document storage**: Files on Docker volume + chunks/embeddings in Postgres. Original files servable for "click to review."
4. **Extensibility**: Backend designed so v2 can add agent loop without rewriting UI.

---

## CLI parity (for testing & headless users)

The same RAG chat that the dashboard renders is exposed through the OppMon CLI. Use this for QA, scripted demos, and headless agent flows. Run all commands from the repo root.

```bash
# Auth (one-time)
pnpm oppmon:login                       # interactive (OAuth device-code)
# or, headless:
set TAG_TOKEN=...                       # cmd.exe — paste token from /api/auth/login
pnpm oppmon:login -- --headless

# One-shot chat (RAG-only, strict)
pnpm oppmon:chat "summarize the latest ADR"

# Interactive REPL
pnpm oppmon:chat

# Pick provider, model, RAG collection
pnpm oppmon:chat -- -p ollama -m llama3.2:latest -c <collectionId> "explain auth"

# Enable web search fallback + tools (live data, exploratory mode)
pnpm oppmon:chat -- --web-fallback --enable-tools "what's the current weather in Dallas?"

# Disable streaming (print full response when ready)
pnpm oppmon:chat -- --no-stream "give me a one-paragraph summary"
```

> **Don't use `pnpm dev:api login` or `pnpm dev:api chat`.** `dev:api` is the Turbo task that boots the API server and treats trailing args as additional task names — it will fail with `Could not find task 'login'`. Always use the `pnpm oppmon:*` aliases (defined in root `package.json`).

The CLI hits the same endpoints as the dashboard:
- `POST /api/rag/chat/stream` (SSE NDJSON) — streaming path
- `POST /api/rag/chat` — non-streaming path (`--no-stream`)

Citation payloads ride on the `citation` event in the SSE stream (matching the dashboard contract from TAG-204/TAG-205), so anything that works in the web UI works in the terminal.

See [`docs/cli-setup-guide.md`](./cli-setup-guide.md) for full setup, troubleshooting, and a flag reference.

---

## High-level data flow

### Chat flow (user-facing)

```
1. USER OPENS /chat
   Browser → GET /api/chat/sessions
   Returns: list of user's past sessions

2. USER STARTS NEW CHAT
   Browser → POST /api/chat/sessions { model_id, title? }
   Returns: { session_id, model: {name, provider} }

3. USER SENDS MESSAGE
   Browser → POST /api/chat/sessions/:id/messages { content }
        ↓ (server)
   - Insert user message row
   - Run RAG retrieval against tenant's collections
       ↓ embed query → top_k chunks → format as system context
   - Build prompt: [system + RAG context + history + new message]
   - Call LiteLLM (via the gateway from TAG-100 epic)
   - SSE stream tokens to browser
   - On completion: insert assistant message, attach citations
   ↓
   Browser receives stream chunks, renders progressively
   On "done" event: receives citations payload, renders links

4. USER CLICKS DOCUMENT LINK
   Browser → GET /api/documents/:id/view
        ↓ (server: RBAC check + tenant scope)
   Streams file from disk → browser renders inline (PDF) or downloads (other)
```

### Admin RAG flow

```
1. ADMIN OPENS /admin/rag
   List of collections, doc count per collection

2. ADMIN CREATES COLLECTION
   POST /api/rag/collections { name, scope: tenant|team, team_id? }

3. ADMIN UPLOADS FILES
   Multipart POST /api/rag/collections/:id/documents
        ↓ (server)
   - Save file to /var/lib/tag/documents/{tenant_id}/{doc_id}/{original_filename}
   - Extract text (via pdf-parse / mammoth / plain read)
   - Chunk into ~800-token segments with 100-token overlap
   - Embed each chunk via OpenAI text-embedding-3-small
   - Insert document row + chunk rows with tenant_id
   ↓
   Stream progress back to UI: "Embedding chunk 12 of 47..."

4. ADMIN MANAGES COLLECTION
   - View document list with chunk counts
   - Re-index a document (new chunks, embeddings rebuilt)
   - Delete a document (cascade chunks + delete file)
```

---

## Stories — Chat side

---

### TAG-201 — Database schema for chat

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: None

**Acceptance criteria**:
- [ ] `chat_sessions` table: `id`, `tenant_id`, `user_id`, `team_id` (nullable, for permission scope), `model_id` (FK to models), `title` (auto-generated from first message if not provided), `created_at`, `updated_at`, `deleted_at`
- [ ] `chat_messages` table: `id`, `session_id`, `role` (enum: user|assistant|system), `content` (text), `tokens_used` (jsonb: `{input, output, cached?}`), `created_at`
- [ ] `chat_message_citations` table: `id`, `message_id`, `document_id` (FK to rag_documents), `chunk_id` (FK to rag_chunks), `chunk_index_in_response` (int — which citation # in the response), `created_at`
- [ ] Indexes: `chat_sessions(tenant_id, user_id, deleted_at)`, `chat_messages(session_id, created_at)`, `chat_message_citations(message_id)`
- [ ] Migrations reversible

**Technical notes**:
- `team_id` on chat_sessions: tracks "which team's defaults applied to this chat" for analytics. Doesn't change RBAC (the session belongs to the user).
- Soft-delete sessions, hard-delete messages on session purge (after 90 days, deferred — v2 retention policy).
- Don't store streaming intermediate state in DB. Only the final completed message gets persisted.

---

### TAG-202 — Chat session CRUD API

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-201, depends on multi-provider epic for `models` table

**Acceptance criteria**:
- [ ] `GET /api/chat/sessions` — paginated list of user's own sessions, descending by `updated_at`
- [ ] `POST /api/chat/sessions` — accepts `{model_id, title?}`. Validates user has access to that model (RBAC: tenant or team scope). Returns full session object including model info.
- [ ] `GET /api/chat/sessions/:id` — returns session + last 50 messages. RBAC: only owner or tenant_admin can read.
- [ ] `PATCH /api/chat/sessions/:id` — update title or model_id (mid-conversation model switch is allowed; affects only future messages)
- [ ] `DELETE /api/chat/sessions/:id` — soft delete (set `deleted_at`)
- [ ] `GET /api/chat/sessions/:id/messages?before=<id>&limit=50` — pagination for long histories
- [ ] All endpoints zod-validated
- [ ] Audit log on session create/delete (not on every message — too noisy)

**Technical notes**:
- Auto-generate session title from first user message after the assistant responds (background job, not blocking). Use a small LLM call: "Summarize this conversation in 4-6 words: <first user message>"
- Don't return all messages by default — pagination matters once users have 200+ message conversations.

---

### TAG-203 — RAG retrieval service

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-201, depends on rag_documents/rag_chunks tables (existing from Day 4)

**Description**:
The piece that makes chat "smart about your docs." Given a query and a tenant context, returns the top-k relevant chunks for prompt injection.

**Acceptance criteria**:
- [ ] Service `apps/api/src/services/rag-retriever.ts` exposes `retrieve({tenantId, userId, teamIds, query, topK = 5, collectionFilter? }): Promise<RetrievedChunk[]>`
- [ ] Each `RetrievedChunk` returned: `{chunk_id, document_id, document_title, document_filename, chunk_text, chunk_index, score, collection_id, collection_name}`
- [ ] Embeds the query via OpenAI `text-embedding-3-small`, then runs vector similarity search.
- [ ] **Tenant isolation enforced at SQL layer** (re-using the pattern from RAG day-4 work): `WHERE tenant_id = $1`. Non-negotiable. Tested.
- [ ] Collection scope: only retrieves from collections the user can access — `tenant`-scoped or `team`-scoped to teams the user is a member of. Filter at SQL level.
- [ ] Optional `collectionFilter`: caller can restrict to specific collection_ids (e.g., user picks "search only Engineering Wiki")
- [ ] Returns empty array if no chunks above similarity threshold (default 0.3 cosine similarity). Don't return garbage low-relevance chunks.
- [ ] Test: cross-tenant test (user in tenant A, query against tenant B's collection — must return zero)
- [ ] Test: cross-team test (user in team Engineering, queries Marketing-scoped collection — must return zero)
- [ ] Performance: p95 retrieval latency under 500ms for collections of <100k chunks

**Technical notes**:
- For pgvector index strategy: HNSW index, `m=16, ef_construction=64`. Tune `ef_search` based on result quality vs. latency.
- Cache query embeddings? Probably not in v1 — same query rarely fires twice in the same session.
- The threshold (0.3) is a guess. Validate with real docs before declaring done. Too low = noisy citations; too high = empty results.

---

### TAG-204 — Chat completion endpoint with SSE streaming

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-202, TAG-203, multi-provider epic complete (for LiteLLM gateway)

**Description**:
The flagship endpoint. Takes a user message, runs RAG, calls LLM via LiteLLM, streams response.

**Acceptance criteria**:
- [ ] `POST /api/chat/sessions/:id/messages` accepts `{content, collection_filter?: string[]}`. Returns SSE stream.
- [ ] Step 1: Insert user message row immediately (so it shows in history even if the call fails halfway).
- [ ] Step 2: Run RAG retrieval (TAG-203) using the user's message as query, scoped to their accessible collections.
- [ ] Step 3: Build the prompt:
  ```
  System: You are a helpful assistant. When the user's question relates to the context below, ground your answer in it and cite which document(s) you used. If the context isn't relevant, answer from general knowledge.

  <context>
  [chunk 1] from {document_title}: {chunk_text}
  [chunk 2] from {document_title}: {chunk_text}
  ...
  </context>

  When citing, reference chunks as [1], [2], etc.
  ```
  Then append last N messages from the session, then the new user message.
- [ ] Step 4: Call LiteLLM via the gateway (using the user's virtual key + the session's model_id), with streaming enabled.
- [ ] Step 5: Stream tokens back via SSE:
  - Event `delta`: `{content: "partial text..."}`
  - Event `done`: `{message_id, citations: [{chunk_index_in_response: 1, document_id, document_title, document_url}, ...], tokens_used: {...}}`
  - Event `error`: `{code, message}`
- [ ] Step 6: On `done`, persist assistant message + citations rows in a transaction.
- [ ] Citation extraction: parse the assistant's response for `[N]` references, map back to the chunks passed in context, store in `chat_message_citations`.
- [ ] If LLM call fails mid-stream: still persist the partial response with `error` flag, surface error to client.
- [ ] Token counting: capture from LiteLLM's response, store in `tokens_used`.
- [ ] Rate limit: 30 messages per minute per user (anti-abuse).

**Technical notes**:
- SSE not WebSocket: simpler, works through HTTP/2, no reconnect logic needed.
- For the citation parsing: regex `\[(\d+)\]` is fine. Don't try to be clever with structured output — the LLM is reliable enough at the bracket pattern.
- The "context isn't relevant, answer from general knowledge" instruction is important: without it, the assistant will hallucinate citations or refuse to answer simple questions.
- Don't put RAG context in the user message — put it in system. Otherwise the user sees their own message bloated with retrieved chunks in the history.
- ⚠️ **The path-B extensibility hook**: structure this endpoint so the "build prompt → call LLM" step is a function `runCompletion(messages, model, tools?)`. In v2, you swap this for the agent loop without changing the SSE plumbing.

---

### TAG-205 — Chat UI: session list + new chat

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-202

**Description**:
The left sidebar of the chat UI. Lists past sessions, creates new ones.

**Acceptance criteria**:
- [ ] `/chat` page (Next.js, App Router) with a two-column layout: sidebar (sessions) + main pane (current chat or empty state)
- [ ] Sidebar shows: "New chat" button at top, then session list (title, last message timestamp, current model badge)
- [ ] Click session → opens it in main pane (`/chat/[sessionId]`)
- [ ] "New chat" button: opens a model picker modal (TAG-206 component reused), then creates session via API, redirects to it
- [ ] Right-click / kebab menu on session: rename, delete, change model
- [ ] Mobile-responsive: sidebar collapses to a top bar with a hamburger
- [ ] Use shadcn components: Sidebar (or just custom flex), Button, Dialog, DropdownMenu

**Technical notes**:
- Use Next.js parallel routes if you want session list + active chat to be separate route segments. Or simpler: just URL params with client-side state.
- Don't try to be too clever with optimistic updates here. Real-time-ish is fine.

---

### TAG-206 — Model picker component

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: TAG-202

**Description**:
Dropdown that shows the user's accessible models grouped by source.

**Acceptance criteria**:
- [ ] Component `<ModelPicker value={modelId} onChange={...} />`
- [ ] Fetches `GET /api/models/for-user` (returns models user can access — same endpoint used by CLI in TAG-110 of multi-provider epic)
- [ ] Groups models by provider (Anthropic, Bedrock, etc.) with section headers
- [ ] Shows: display name, provider icon, small "default" badge if it's the team default
- [ ] If user is in multiple teams with different defaults, show all defaults with team labels
- [ ] Empty state: "No models available. Ask your admin to configure one."
- [ ] Used in: new-chat dialog, mid-chat model switcher

---

### TAG-207 — Chat UI: message thread + streaming

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-204, TAG-205

**Description**:
The conversation pane. Renders messages, handles SSE streaming, displays citations.

**Acceptance criteria**:
- [ ] Main pane shows: header (session title editable inline + current model badge + "Switch model" button), message list (scrollable, anchored to bottom), input box at bottom
- [ ] Messages render: user messages right-aligned, assistant messages left-aligned, both with avatars
- [ ] Markdown rendering for assistant messages (code blocks with syntax highlighting via `prismjs` or `shiki`, lists, tables)
- [ ] Code blocks have a "copy" button
- [ ] On send: append user message immediately (optimistic), open SSE connection, append assistant message that fills as tokens arrive
- [ ] During streaming: show a subtle pulsing indicator at the end of the assistant message
- [ ] On `done` event: render citations at the bottom of the assistant message (TAG-208)
- [ ] If streaming is interrupted (network drop, server error): show "Message incomplete — retry?" with retry button
- [ ] Input box: textarea with Enter to send, Shift+Enter for newline, autoexpand to ~10 rows max
- [ ] "Stop generating" button while streaming

**Technical notes**:
- Use `EventSource` for SSE in the browser. Or `fetch` with `ReadableStream` if you need POST body (EventSource is GET-only).
- Library option: `vercel/ai` SDK has React hooks for chat with SSE — saves real time. Worth using even though you're calling your own backend, not theirs.
- Don't render markdown character-by-character during streaming — incomplete markdown looks broken. Render as plain text during streaming, parse markdown on `done`. Or use a streaming-friendly parser like `react-markdown` with strict mode off.
- Scroll behavior: stay at bottom while streaming, but if user scrolls up, don't yank them back.

---

### TAG-208 — Citation display component

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-207

**Description**:
The user-asked feature: citations as clickable links at the bottom of each assistant message.

**Acceptance criteria**:
- [ ] After each assistant message, if it has citations, render a "Sources" section
- [ ] Each citation card: `[N]` badge, document title, collection name, snippet of the cited chunk text (~150 chars), "View document" link
- [ ] Inline `[N]` references in the message body are clickable — clicking scrolls to and highlights the corresponding citation card below
- [ ] "View document" link opens the document viewer modal (TAG-209)
- [ ] Citations are deduplicated: if `[1]` and `[3]` both reference the same document but different chunks, show one card per *chunk*, not per document (so user can see exactly what was cited)
- [ ] If multiple chunks come from the same document, group them visually (collapsible) but with anchors to each
- [ ] Mobile: citation cards are full-width, tap to expand snippet, tap link to open viewer

**Technical notes**:
- The `[N]` numbering matches the order chunks were passed in context, so server-side ordering matters.
- Hover behavior on inline `[N]`: show a small tooltip with chunk preview. Optional but valuable polish.

---

### TAG-209 — Document viewer modal

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-208, TAG-216 (document storage)

**Description**:
The "click to review documents directly" piece. Opens a modal with the source document, scrolled to the cited section if possible.

**Acceptance criteria**:
- [ ] Endpoint `GET /api/documents/:id/view` — RBAC scoped (user can only view docs in their accessible collections), tenant_id verified, streams file with appropriate `Content-Type` and `Content-Disposition: inline`
- [ ] Modal opens with a header (title, filename, "Download" button, close)
- [ ] **PDF**: rendered inline using `<iframe>` or `react-pdf` (preferred — supports highlighting). If chunk has page number metadata, jump to that page.
- [ ] **Markdown**: rendered as styled HTML in the modal (use the same markdown renderer as chat)
- [ ] **Plaintext / .txt**: rendered in monospace `<pre>`
- [ ] **DOCX / DOC**: convert to HTML server-side via `mammoth.js` and render. (Alternative: download-only.)
- [ ] **Other formats**: download-only with a "this file type can't be previewed" message
- [ ] If chunk text is highlightable in the document (markdown/text), scroll to and highlight the cited passage
- [ ] Close: ESC key, click outside, X button
- [ ] Loading state: skeleton while file streams
- [ ] Error state: "Document not found or access denied" — never leak whether it doesn't exist vs. you don't have access

**Technical notes**:
- For PDF: `react-pdf` is the right call. Supports text layer for highlighting.
- For DOCX: `mammoth.js` does decent HTML conversion. Don't try to preserve all formatting — fidelity isn't critical, content is.
- The "highlight cited passage" is a UX win but tricky. v1: scroll to approximate location (chunk index → estimated page or paragraph). v2: actual highlight with text layer.
- Cache rendered DOCX→HTML on first view to avoid repeated conversion.
- ⚠️ Security: the streaming endpoint MUST verify tenant_id at every call. Direct URL access without auth must 401, even if the URL is shared.

---

## Stories — Admin RAG side

---

### TAG-210 — RAG database schema additions

**Type**: Task
**Points**: 2
**Days**: 0.25
**Dependencies**: existing rag_documents/rag_chunks tables

**Description**:
Extend the existing RAG schema for the admin-managed flow.

**Acceptance criteria**:
- [ ] `rag_collections` table (if not already from Day 4): `id`, `tenant_id`, `name`, `description`, `scope` (tenant|team), `team_id` (nullable), `created_by`, `created_at`, `updated_at`, `deleted_at`
- [ ] `rag_documents` table additions: `collection_id` (FK), `original_filename`, `mime_type`, `size_bytes`, `file_path` (relative path on disk), `file_sha256`, `extraction_status` (enum: pending|extracting|extracted|failed), `extraction_error`, `chunk_count`, `uploaded_by_user_id`
- [ ] `rag_chunks` table additions: `chunk_index` (int — order within document), `page_number` (nullable, for PDFs), `metadata_json` (jsonb, optional)
- [ ] Indexes: `rag_documents(tenant_id, collection_id, deleted_at)`, `rag_chunks(document_id, chunk_index)`
- [ ] Migrations reversible

---

### TAG-211 — Document upload endpoint with chunking + embedding pipeline

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-210

**Description**:
The pipeline that turns "admin uploaded a PDF" into "this PDF is searchable in chat." Heavy lifting.

**Acceptance criteria**:
- [ ] `POST /api/rag/collections/:collectionId/documents` accepts multipart upload. RBAC: tenant_admin or team_admin (for team-scoped collections).
- [ ] Validates file: size ≤ 50 MB (configurable per tenant), type in allowed list (`.md`, `.txt`, `.pdf`, `.docx`, `.html`)
- [ ] Computes SHA256 of file content. If a doc with same SHA already exists in this collection, return existing doc ID (idempotency).
- [ ] Stores file at `/var/lib/tag/documents/{tenant_id}/{document_id}/{original_filename}` (mode 0640, owner tag-api). Inserts `rag_documents` row with `extraction_status='pending'`.
- [ ] Returns 202 with document_id. Extraction happens in background job (doesn't block the request).
- [ ] Background extraction job:
  - Reads file from disk
  - Extracts text:
    - `.md` / `.txt`: read as UTF-8
    - `.pdf`: `pdf-parse` library
    - `.docx`: `mammoth.js`
    - `.html`: strip tags, preserve structure (`cheerio`)
  - Chunks at ~800 tokens with 100-token overlap (use `tiktoken` or similar for accurate token counting)
  - For PDFs: capture page number per chunk
  - Embeds each chunk via OpenAI `text-embedding-3-small` (batch up to 100 at a time for efficiency)
  - Inserts `rag_chunks` rows in batches
  - Updates `rag_documents.extraction_status='extracted'`, `chunk_count=N`
  - On failure: `extraction_status='failed'`, `extraction_error='...'`. File is kept for retry.
- [ ] Progress endpoint: `GET /api/rag/documents/:id/status` returns `{status, chunks_processed, chunks_total?, error?}`
- [ ] If file extraction fails (corrupt PDF, etc.), return useful error so admin knows what happened.

**Technical notes**:
- Run the extraction job in a separate worker process or in-process queue. Don't block the API.
- Use `bullmq` (Redis-backed) or `pg-boss` (Postgres-backed). For solo founder MVP, `pg-boss` keeps you on Postgres-only — fewer moving parts.
- File path strategy: `{tenant_id}/{document_id}/{filename}` — tenant-scoped directory makes per-tenant backup/cleanup easy.
- `0640` permissions: tag-api can read/write, tag-router can read (for serving), nothing else.
- 50 MB limit is reasonable for v1. Larger files (manuals, books) need streaming chunking — defer to v2.
- The OpenAI embedding API: handle rate limits, retry with backoff. For batch of 100 chunks, ~1s call. For 1000-chunk doc: ~10s total. Acceptable for background.

---

### TAG-212 — Collection CRUD API

**Type**: Story
**Points**: 3
**Days**: 0.5
**Dependencies**: TAG-210

**Acceptance criteria**:
- [ ] `POST /api/rag/collections`: create. Requires tenant_admin or team_admin. Validates scope (team_admins can only create team-scoped to teams they admin).
- [ ] `GET /api/rag/collections`: list, RBAC-scoped (members see collections they can access; admins see all in their tenant).
- [ ] `GET /api/rag/collections/:id`: get one with document count.
- [ ] `PATCH /api/rag/collections/:id`: rename, change scope (with cascade implications — see notes), enable/disable.
- [ ] `DELETE /api/rag/collections/:id`: soft-delete. Cascade soft-deletes documents and chunks. Files on disk are NOT deleted yet (allow restore window). Hard delete via separate ops endpoint after 30 days (deferred to v2 cleanup job).
- [ ] All mutations audit-logged.

**Technical notes**:
- Changing scope from tenant→team: existing chunks remain accessible to the new scope. Audit clearly so admins understand impact.
- Don't allow scope change from team→tenant if doing so would expose docs another team's docs to people who shouldn't see them. Check carefully.

---

### TAG-213 — Admin RAG UI: collection list + create

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-212

**Description**:
The `/admin/rag` page. Tenant admin's home for managing documents.

**Acceptance criteria**:
- [ ] `/admin/rag` page: paginated table of collections. Columns: name, scope (tenant or team-name), document count, total chunks, created_by, created_at, actions.
- [ ] "New collection" button → dialog: name, optional description, scope radio (tenant / team), team picker (if team scope)
- [ ] Click collection row → goes to collection detail page (TAG-214)
- [ ] Empty state: "No collections yet. Create one to start uploading documents."
- [ ] Edit dialog from row actions: rename, change description
- [ ] Delete: confirmation requires typing collection name (anti-fat-finger), warns about cascading effect on chat citations
- [ ] Mobile responsive

---

### TAG-214 — Admin RAG UI: collection detail + upload

**Type**: Story
**Points**: 8
**Days**: 1.5
**Dependencies**: TAG-211, TAG-213

**Description**:
The actual upload UX. Drag-and-drop, batch uploads, progress display, document list management.

**Acceptance criteria**:
- [ ] `/admin/rag/[collectionId]` page
- [ ] Header: collection name + scope badge + breadcrumb back to /admin/rag
- [ ] Upload zone: drag-and-drop area + "Browse files" button. Supports multiple files at once. Shows file list with size + type before upload.
- [ ] Per-file: shows status (uploading → extracting → embedding → ready, or failed)
- [ ] Progress: actual progress bar during upload (use `XMLHttpRequest.upload.onprogress`); spinner during background extraction (poll status endpoint every 2s)
- [ ] Document list: table with filename, size, type, chunks, uploaded_by, uploaded_at, status, actions
- [ ] Actions per document: View (opens viewer modal — TAG-209), Re-index (re-runs extraction), Delete (soft delete + cascade chunks)
- [ ] Search/filter: filter by filename, status
- [ ] Bulk actions: select multiple → delete multiple

**Technical notes**:
- The upload-progress UX is high-leverage for trust. Users uploading a 30MB PDF want to see what's happening.
- Don't block the UI during background extraction. The user can navigate away and come back; status will reflect current state.
- For drag-and-drop: `react-dropzone` is reliable.
- ⚠️ Validate file type both in UI (UX) and server (security). Don't trust the UI's check.

---

### TAG-215 — Document re-indexing endpoint

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: TAG-211

**Acceptance criteria**:
- [ ] `POST /api/rag/documents/:id/reindex` triggers re-extraction
- [ ] Deletes existing chunks for that document
- [ ] Re-runs the extraction pipeline (TAG-211)
- [ ] Returns 202 with status URL
- [ ] Use case: admin updated chunk size/strategy, or original extraction failed and they want to retry

---

### TAG-216 — Document file storage abstraction

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: None — can build alongside TAG-211

**Description**:
A storage interface so file storage can switch from local-disk to S3 without changing callers.

**Acceptance criteria**:
- [ ] Interface `DocumentStorage` in `packages/shared/src/storage/` with: `put(tenantId, docId, filename, stream): Promise<{path, size, sha256}>`, `get(tenantId, docId, filename): Promise<ReadableStream>`, `delete(tenantId, docId): Promise<void>`, `exists(tenantId, docId): Promise<boolean>`
- [ ] Implementation `LocalDiskStorage`: stores under configurable root (env `TAG_DOCUMENT_ROOT`, default `/var/lib/tag/documents`)
- [ ] Implementation `S3Storage` (deferred to v2): same interface, AWS SDK v3
- [ ] Files written atomically (temp file → rename) so partial uploads don't corrupt state
- [ ] Read returns a stream so large files don't load into memory
- [ ] Tests: roundtrip (put then get), delete cleans up, exists returns correctly
- [ ] Document the on-disk layout in `docs/storage.md`: tenant_id directory tree, permissions, backup strategy

**Technical notes**:
- This is the abstraction that lets you scale later. Don't shortcut it even though local-disk-only seems "fine" for now.
- For local disk: ensure the Docker volume is mounted so files persist across container restarts. `docker-compose.yml` needs `volumes: - tag-documents:/var/lib/tag/documents`.
- Document permissions: `/var/lib/tag/documents` owned by `tag-api`, mode 0750. Files inside: mode 0640.

---

### TAG-217 — Document serving endpoint

**Type**: Story
**Points**: 5
**Days**: 1
**Dependencies**: TAG-216

**Description**:
The endpoint that serves the original document back when user clicks "View document" from a citation.

**Acceptance criteria**:
- [ ] `GET /api/documents/:id/view` — auth required, RBAC enforced
- [ ] Looks up document, validates: same tenant as caller, in a collection the caller can access (tenant OR team scope where caller is member)
- [ ] Streams file from `DocumentStorage` (TAG-216)
- [ ] Sets headers:
  - `Content-Type` from document's `mime_type`
  - `Content-Disposition: inline; filename="<original_filename>"` (browsers will display inline if they can, otherwise download)
  - `Cache-Control: private, max-age=300` (5 min cache; private because per-user RBAC)
- [ ] Range request support (`Accept-Ranges`, partial content) for large PDFs
- [ ] If user lacks access → 404 (not 403; don't leak existence)
- [ ] If file missing on disk (data inconsistency) → 500 with audit log entry, but generic error to user
- [ ] Audit log: every successful view (user_id, document_id, timestamp). Useful for "who has been reading the HR policy doc."
- [ ] Rate limit: 60 views per minute per user.

**Technical notes**:
- Don't serve files via Next.js — pipe through Node's `Readable` stream directly. Next.js API routes have body size quirks.
- ⚠️ Path traversal: never construct file path from user input. Always look up from DB by ID, then build path from stored fields.
- Audit logging on every view is privacy-sensitive but valuable. Document this clearly in your privacy policy. Per your earlier "no surveillance" stance, you may want to make view-logging tenant-configurable (off by default, on for compliance-conscious tenants).

---

### TAG-218 — End-to-end smoke test

**Type**: Task
**Points**: 3
**Days**: 0.5
**Dependencies**: All previous tickets

**Acceptance criteria**:
- [ ] `scripts/smoke-chat-rag.sh`:
  1. Reset DB
  2. Sign up alice (tenant_admin)
  3. Configure an Anthropic model (assumes multi-provider epic done)
  4. Create a collection "Engineering Wiki" (tenant scope)
  5. Upload 3 markdown files via API to that collection
  6. Wait for extraction to complete (poll status, max 60s)
  7. Verify chunk_count > 0 for each document
  8. Sign up bob (member, added to tenant)
  9. As bob: open `/chat`, create new session with the configured model
  10. Send message: "What does our engineering wiki say about deployment?"
  11. Wait for SSE stream to complete
  12. Verify response contains `[1]` references
  13. Verify response includes citations payload with at least 1 citation
  14. Click citation link → verify document opens
  15. Cross-tenant test: sign up carol in a NEW tenant, create a collection with same content, query — verify she sees only her tenant's docs (not Acme's)
  16. Permission test: bob tries to access `/admin/rag` → expect 403
- [ ] Total under 5 minutes
- [ ] Run nightly in CI (real LLM call gated by env)

---

### TAG-219 — Documentation

**Type**: Task
**Points**: 2
**Days**: 0.25
**Dependencies**: All

**Acceptance criteria**:
- [ ] `docs/chat.md`: end-user guide — how to chat, switch models, cite sources
- [ ] `docs/admin/rag.md`: admin guide — creating collections, uploading docs, scoping, file types, size limits, troubleshooting
- [ ] `docs/storage.md`: ops guide — where files live, backup recommendations, disk monitoring
- [ ] In-app: tooltip on the citation section explaining what `[N]` references mean

---

## Sprint plan

9 working days mapped:

| Day | Tickets | Notes |
|---|---|---|
| 1 | TAG-201 (chat schema) + TAG-210 (RAG schema additions) + TAG-216 (storage) | Schema-heavy day, all foundational |
| 2 | TAG-202 (session CRUD) + TAG-212 (collection CRUD) | Two parallel CRUD efforts |
| 3 | TAG-211 (upload pipeline) part 1 | The most complex non-streaming piece |
| 4 | TAG-211 part 2 + TAG-203 (RAG retrieval) | Finish pipeline, build retriever |
| 5 | TAG-204 (chat completion + SSE) | The flagship endpoint |
| 6 | TAG-205 (session list UI) + TAG-206 (model picker) | Frontend day 1 |
| 7 | TAG-207 (message thread + streaming UI) | Frontend day 2 — biggest UI ticket |
| 8 | TAG-208 (citations) + TAG-209 (doc viewer) + TAG-217 (serving endpoint) | Frontend day 3 — citation system |
| 9 | TAG-213 + TAG-214 (admin RAG UI) + TAG-215 (reindex) + TAG-218 (smoke) + TAG-219 (docs) | Admin UI + cleanup |

**Day 9 is packed.** Realistic slip: 1-2 days. Plan for 10-11 days.

---

## Risk register

1. **Streaming UX edge cases.** Network drops, user navigates away mid-stream, race conditions between SSE close and DB persist. Mitigation: write the persistence-on-done logic carefully, test with chaos (kill the connection at random points).
2. **Citation accuracy.** LLM cites `[1]` but the chunk wasn't relevant — looks broken. Mitigation: tune RAG threshold (TAG-203). If chunks aren't relevant, prompt the model to not cite them.
3. **Document upload size + extraction time.** A 50MB PDF with 1000 pages = 5 minutes to extract. UX needs to handle this. Mitigation: clear progress display, ability to navigate away and come back.
4. **Disk space.** Documents accumulate. Mitigation: add disk monitoring + admin alerts before launch. Document a per-tenant quota.

---

## Inserting into the master plan

The 33-day plan now has:
- Days 24-35 (or 24-38 if Option C from the routing epic): Multi-provider routing
- After that, ~10 days for chat + RAG admin

**Realistic delivery to "demo-ready chat":** Day 45-50 of the original plan. That's a meaningful slip from the original Day 33 demo target.

If demo is locked to a specific date, two compression options:
- **Compress chat to 5 days**: drop SSE streaming (use simple request-response), drop document viewer (just download), drop session history UI. Get a working "ask questions, get answers with citations" chat in 5 days. Demoable, not impressive.
- **Defer admin RAG UI to v2**: admins use the API directly for upload (curl) for the demo. UI added post-demo. Saves 3-4 days. The demo flow becomes: pre-seed docs via curl, chat works, admin UI is "coming soon."

Recommend: defer the admin RAG UI for the demo. The demo doesn't need to *show* admins uploading docs live — it needs to show the *result* (chat with grounded answers + citations). Pre-seed via the API and the demo works exactly the same. Build the admin UI properly in week 6.

---

## What this gets you

When TAG-200 epic is done:

- A user opens `/chat`, sees their past conversations, picks a model, asks a question
- The chat returns a grounded answer with `[1]`, `[2]` references
- Below the message, a "Sources" panel shows the cited docs with snippets
- Click a citation → modal opens with the actual PDF/markdown
- Admins manage collections and documents via UI, file uploads work cleanly
- Files live on disk with proper RBAC, never leaked across tenants

That's a competitive product surface. Combined with the CLI experience and the multi-provider routing, you have a real platform — not a demo prop.
