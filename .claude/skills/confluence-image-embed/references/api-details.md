# Confluence Image Embed — API Reference & Python Code

All code uses Python stdlib only (`urllib`, `base64`, `json`, `mimetypes`). No pip installs required. Compatible with `py -3` on Windows.

---

## Authentication

All requests use HTTP Basic Auth:

```python
import base64

def make_auth_header(email: str, api_token: str) -> str:
    credentials = f"{email}:{api_token}"
    encoded = base64.b64encode(credentials.encode("utf-8")).decode("utf-8")
    return f"Basic {encoded}"
```

---

## Step 1 — Fetch Current Page (version + body)

```python
import urllib.request
import json

def get_page(domain: str, page_id: str, auth_header: str) -> dict:
    url = f"https://{domain}/wiki/rest/api/content/{page_id}?expand=body.storage,version"
    req = urllib.request.Request(url, headers={
        "Authorization": auth_header,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

# Usage:
# page = get_page("reallyhq.atlassian.net", "60456962", auth_header)
# current_version = page["version"]["number"]
# current_body = page["body"]["storage"]["value"]
# page_title = page["title"]
```

---

## Step 2 — Upload Attachment

```python
import urllib.request
import mimetypes
import os
import json

def upload_attachment(domain: str, page_id: str, file_path: str, auth_header: str) -> str:
    """
    Uploads a file as an attachment to a Confluence page.
    Returns the filename as stored by Confluence (use this in the embed tag).
    """
    url = f"https://{domain}/wiki/rest/api/content/{page_id}/child/attachment"
    filename = os.path.basename(file_path)
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    # Build multipart body manually
    boundary = "----PlaywrightScreenshotBoundary"
    with open(file_path, "rb") as f:
        file_data = f.read()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8") + file_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": auth_header,
            "X-Atlassian-Token": "no-check",   # REQUIRED — without this: 403
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        return result["results"][0]["title"]  # exact filename Confluence stored

# Usage:
# stored_name = upload_attachment("reallyhq.atlassian.net", "60456962", "e2e/screenshots/01-homepage.png", auth_header)
# print(stored_name)  # → "01-homepage.png"
```

---

## Step 3 — Build Updated Body

Replace placeholder text and broken ri:url tags with correct ac:image tags.

```python
import re

def make_embed_tag(filename: str) -> str:
    return (
        f'<ac:image ac:align="center" ac:layout="center">'
        f'<ri:attachment ri:filename="{filename}"/>'
        f'</ac:image>'
    )

def fix_broken_url_tags(body: str) -> str:
    """Replace broken <ri:url> tags left by MCP markdown conversion."""
    pattern = r'<ac:image[^>]*><ri:url ri:value="([^"]+)"[^/]*/></ac:image>'
    def replacer(m):
        filename = os.path.basename(m.group(1))
        return make_embed_tag(filename)
    return re.sub(pattern, replacer, body)

def replace_placeholder(body: str, placeholder_filename: str, stored_filename: str) -> str:
    """Replace [Attach: filename.png] text placeholders with embed tags."""
    placeholder = f"[Attach: {placeholder_filename}]"
    return body.replace(placeholder, make_embed_tag(stored_filename))
```

---

## Step 4 — PUT Updated Page

```python
import urllib.request
import json

def update_page(domain: str, page_id: str, title: str, new_version: int, new_body: str, auth_header: str) -> None:
    url = f"https://{domain}/wiki/rest/api/content/{page_id}"
    payload = {
        "version": {"number": new_version},
        "title": title,
        "type": "page",
        "body": {
            "storage": {
                "value": new_body,
                "representation": "storage",   # MUST be "storage" for ac:image tags to work
            }
        },
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": auth_header,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))
        print(f"Updated to version {result['version']['number']}")
```

---

## Complete End-to-End Script

```python
"""
confluence_embed_images.py
Usage: py -3 confluence_embed_images.py
Set the CONFIG block before running. Ask user for api_token in-session.
Rotate the token at https://id.atlassian.com/manage-profile/security/api-tokens after use.
"""
import urllib.request, urllib.error, base64, json, mimetypes, os, re

# ── CONFIG ──────────────────────────────────────────────────────────────────
DOMAIN   = "reallyhq.atlassian.net"
PAGE_ID  = "60456962"
EMAIL    = "jeremy@reallyglobal.com"   # update as needed
API_TOKEN = input("Paste your Atlassian API token (will not be saved): ").strip()

# Map placeholder name → local file path
IMAGES = {
    "01-homepage.png":        r"C:\Projects\ReallyGlobal\RG-Frontend\e2e\screenshots\01-homepage.png",
    "02-login-modal.png":     r"C:\Projects\ReallyGlobal\RG-Frontend\e2e\screenshots\02-login-modal.png",
    "03-client-dashboard.png":r"C:\Projects\ReallyGlobal\RG-Frontend\e2e\screenshots\03-client-dashboard.png",
    "04-provider-portal.png": r"C:\Projects\ReallyGlobal\RG-Frontend\e2e\screenshots\04-provider-portal.png",
    "05-search-page.png":     r"C:\Projects\ReallyGlobal\RG-Frontend\e2e\screenshots\05-search-page.png",
}
# ────────────────────────────────────────────────────────────────────────────

def auth_header():
    creds = base64.b64encode(f"{EMAIL}:{API_TOKEN}".encode()).decode()
    return f"Basic {creds}"

def get_page():
    url = f"https://{DOMAIN}/wiki/rest/api/content/{PAGE_ID}?expand=body.storage,version"
    req = urllib.request.Request(url, headers={"Authorization": auth_header(), "Accept": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def upload_attachment(file_path, filename):
    url = f"https://{DOMAIN}/wiki/rest/api/content/{PAGE_ID}/child/attachment"
    mime, _ = mimetypes.guess_type(file_path)
    mime = mime or "application/octet-stream"
    boundary = "ConfluenceUploadBoundary7x"
    with open(file_path, "rb") as f:
        file_data = f.read()
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": auth_header(),
        "X-Atlassian-Token": "no-check",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())["results"][0]["title"]

def make_embed(filename):
    return f'<ac:image ac:align="center" ac:layout="center"><ri:attachment ri:filename="{filename}"/></ac:image>'

def update_page(title, version, body):
    url = f"https://{DOMAIN}/wiki/rest/api/content/{PAGE_ID}"
    payload = {"version": {"number": version}, "title": title, "type": "page",
               "body": {"storage": {"value": body, "representation": "storage"}}}
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="PUT", headers={
        "Authorization": auth_header(), "Content-Type": "application/json", "Accept": "application/json",
    })
    with urllib.request.urlopen(req) as r:
        result = json.loads(r.read().decode())
        print(f"  Page updated to version {result['version']['number']}")

# ── MAIN ─────────────────────────────────────────────────────────────────────
page = get_page()
version = page["version"]["number"]
title   = page["title"]
body    = page["body"]["storage"]["value"]

print(f"Page: {title} (version {version})")

for placeholder, file_path in IMAGES.items():
    print(f"  Uploading {placeholder}...")
    stored = upload_attachment(file_path, placeholder)
    print(f"    Stored as: {stored}")
    # Replace [Attach: filename] placeholder
    body = body.replace(f"[Attach: {placeholder}]", make_embed(stored))
    # Fix any broken ri:url tags for this file
    body = re.sub(
        rf'<ac:image[^>]*><ri:url ri:value="[^"]*{re.escape(placeholder)}"[^/]*/></ac:image>',
        make_embed(stored), body
    )

print("Updating page body...")
update_page(title, version + 1, body)
print("Done. Rotate your API token: https://id.atlassian.com/manage-profile/security/api-tokens")
```

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| 403 on attachment upload | Missing `X-Atlassian-Token: no-check` header | Add the header |
| 409 on page update | Version number wrong | Fetch fresh version before PUT; use `version.number + 1` |
| Image shows as broken link | Used markdown format instead of storage | Ensure `representation: "storage"` in PUT body |
| 404 on upload | Wrong page ID | Verify page ID from Confluence URL |
| Image renders but wrong size | Missing `ac:align`/`ac:layout` attributes | Use the full tag from this doc |
