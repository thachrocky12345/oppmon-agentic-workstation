---
slug: tool.rag_planner.finalize.description
version: 1
status: active
notion_page_id: null
owner: null
updated_at: null
placeholders: []
---
Emit the final answer. Every factual claim MUST carry `[[doc_id:chunk_id]]` citation markers. If no retrieved chunk supports the user's question, emit the refusal sentence verbatim: "I don't have information about that in the provided collections."