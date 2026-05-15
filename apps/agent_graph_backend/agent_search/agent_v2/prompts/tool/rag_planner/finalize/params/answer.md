---
slug: tool.rag_planner.finalize.params.answer
version: 1
status: active
notion_page_id: null
owner: null
updated_at: null
placeholders: []
---
The final answer to the user's question. Every factual claim MUST be followed by `[[doc_id:chunk_id]]` citation(s). If no chunk supports the answer, emit the refusal sentence verbatim instead.