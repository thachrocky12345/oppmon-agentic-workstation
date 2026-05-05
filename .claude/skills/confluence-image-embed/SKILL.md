# Confluence Image Embed Skill

Uploads local image files to a Confluence page as attachments and embeds them correctly using the storage format API. Use this when the Atlassian MCP tool has left broken image references, or when you need to attach and display local screenshots/charts on a Confluence page.

## Trigger phrases
- "embed image in Confluence"
- "add screenshot to the wiki page"
- "upload PNG to Confluence"
- "attach image to Confluence"
- "the images aren't showing on the Confluence page"
- "fix the broken images on the page"

---

## Why This Skill Exists

The Atlassian MCP `updateConfluencePage` tool with `contentFormat: "markdown"` converts `![alt](filename)` into `<ri:url ri:value="filename"/>` — a broken reference that renders as a failed image load in Confluence. The correct approach requires two REST API calls: upload the file as an attachment, then re-embed it using Confluence storage XML format.

---

## Two-Phase Workflow

### Phase 1 — Upload as attachment

```
POST /wiki/rest/api/content/{pageId}/child/attachment
```

- Auth: Basic `base64(email:api_token)`
- **Required header:** `X-Atlassian-Token: no-check` — without this the request 403s
- Body: `multipart/form-data` with the file
- Response: `results[0].title` is the exact filename to use in Phase 2

### Phase 2 — Embed using storage format

```
PUT /wiki/rest/api/content/{pageId}
```

- Body `representation` must be `"storage"` (not `"wiki"` or `"markdown"`)
- **Fetch current version first** — PUT requires `version.number + 1` exactly or it 409s
- Correct XML embed tag:

```xml
<ac:image ac:align="center" ac:layout="center">
  <ri:attachment ri:filename="your-file.png"/>
</ac:image>
```

---

## Fixing Broken ri:url Tags

If the page already contains broken tags from a prior MCP update, replace them before re-uploading:

```
FIND:    <ac:image[^>]*><ri:url ri:value="FILENAME"[^/]*/></ac:image>
REPLACE: <ac:image ac:align="center" ac:layout="center"><ri:attachment ri:filename="FILENAME"/></ac:image>
```

---

## Step-by-Step Execution

### Step 1 — Get page inputs

You need:
- `page_id` — the numeric Confluence page ID
- `domain` — e.g. `reallyhq.atlassian.net`
- `email` — Atlassian account email
- `api_token` — Atlassian API token (ask user to paste in-session; never store)
- `image_paths` — list of local file paths to upload

### Step 2 — Fetch current page version and body

```
GET /wiki/rest/api/content/{pageId}?expand=body.storage,version
```

Parse out:
- `version.number` → increment by 1 for the PUT
- `body.storage.value` → the current page HTML/XML to modify

### Step 3 — Upload each image

Run the Python upload script (see `references/api-details.md`) for each file. Collect the returned filenames.

### Step 4 — Build the updated body

In the page storage XML:
- Replace any `[Attach: filename.png]` placeholder text with the `<ac:image>` embed tag
- Replace any broken `<ri:url>` tags with correct `<ri:attachment>` tags

### Step 5 — PUT the updated page

Send the full updated storage body with `version.number + 1`.

### Step 6 — Verify

Fetch the page again and confirm the attachment count increased and the embed tags are correct.

---

## Security

**Remind the user to rotate their Atlassian API token after this session.** API tokens pasted into terminal or scripts should be treated as temporarily exposed. Rotation takes 30 seconds at https://id.atlassian.com/manage-profile/security/api-tokens.

Never write the API token to any file, commit it, or log it.

---

## Project Constants (ReallyGlobal)

| Constant | Value |
|---|---|
| Domain | `reallyhq.atlassian.net` |
| Cloud ID | `92044829-3f40-4908-abaf-e65a65514b79` |
| Space ID | `98447` (Team Hub) |
| Space key | `TH` |
| QA Testing page | `60456962` |

---

## Full API reference and Python code

See `references/api-details.md`
