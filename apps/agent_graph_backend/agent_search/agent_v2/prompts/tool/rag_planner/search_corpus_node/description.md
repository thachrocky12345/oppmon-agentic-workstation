---
slug: tool.rag_planner.search_corpus_node.description
version: 1
status: active
notion_page_id: null
owner: null
updated_at: null
placeholders: []
---
Search the user's document collections for chunks matching the sub-question. Returns `status=OK` with cited chunks (ids of the form `doc_id:chunk_id`), or `status=UNANSWERED` if retrieval is empty (mark that sub-question UNANSWERED per HARD RULE #2). Safe to call in parallel for independent nodes.