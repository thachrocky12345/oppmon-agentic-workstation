---
name: proof-of-fix
description: Capture before/after Playwright screenshots proving a bug fix works, upload them as Jira attachments, and post a formatted evidence comment to the ticket. Use when asked to "prove a fix", "show before and after", "attach screenshots to ticket", or "update the ticket with evidence".
argument-hint: [jira-ticket] [fix-branch] [urls-to-capture]
---

# Proof of Fix — Screenshot Evidence for Jira

## Purpose

Produce verifiable before/after evidence for a bug fix and attach it directly
to the Jira ticket. Captures screenshots on `main` (broken state) and on the
fix branch (fixed state), uploads both sets as Jira attachments, and posts a
structured comment linking them.

---

## Invocation

```
/proof-of-fix [jira-ticket] [fix-branch] [url1 url2 ...]
```

| Arg | Description |
|---|---|
| `jira-ticket` | e.g. `RGDEV-165` |
| `fix-branch` | e.g. `RGDEV-165/fix-console-errors` |
| `url1 url2 ...` | Space-separated relative URLs to capture, e.g. `/en` `/en/victorpayne` |

If URLs omitted, infer from the Jira ticket description and linked PR diff.

---

## Step 1 — Read the ticket and PR

Fetch the Jira ticket to understand what was broken and what the fix claims:

```
Use mcp__claude_ai_Atlassian__getJiraIssue with issueIdOrKey={jira-ticket}
```

Then fetch the linked PR to identify which pages/flows to capture:

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr list --repo reallyhq/RG-Frontend --head {fix-branch} --json number,title,body
```

From the ticket + PR, derive the minimum set of URLs that demonstrate the fix.
Aim for 3–6 screenshots maximum. More than that dilutes the evidence.

---

## Step 2 — Capture BEFORE screenshots (main)

```bash
cd /c/Projects/ReallyGlobal/RG-Frontend
git stash   # if dirty
git checkout main
git pull origin main

cd /c/Projects/ReallyGlobal
docker compose up -d --build frontend
```

Wait for frontend to be ready:
```bash
for i in $(seq 1 12); do
  curl -sf http://localhost:3000 > /dev/null && echo "ready" && break
  echo "waiting... ($i)"; sleep 5
done
```

Create output directory:
```bash
mkdir -p C:/Temp/proof-of-fix/{jira-ticket}
```

Run capture script (see Capture Script below) with `mode=before`:
```bash
cd /c/Projects/ReallyGlobal/RG-Frontend
node C:/Temp/capture-proof.js before "{url1}" "{url2}" ...
```

Screenshots saved to `C:/Temp/proof-of-fix/{jira-ticket}/before-*.png`.

---

## Step 3 — Capture AFTER screenshots (fix branch)

```bash
git checkout {fix-branch}
git pull origin {fix-branch}

cd /c/Projects/ReallyGlobal
docker compose up -d --build frontend
```

Wait for frontend ready (same loop as above), then:

```bash
cd /c/Projects/ReallyGlobal/RG-Frontend
node C:/Temp/capture-proof.js after "{url1}" "{url2}" ...
```

Screenshots saved to `C:/Temp/proof-of-fix/{jira-ticket}/after-*.png`.

---

## Step 4 — Upload screenshots to Jira

Upload each screenshot as an attachment to the Jira ticket using the REST API.
The `X-Atlassian-Token: no-check` header is required to bypass XSRF protection
on the attachment endpoint.

```bash
JIRA_TOKEN="<paste SONAR_TOKEN equivalent — ask user if not in env>"
CLOUD="reallyhq.atlassian.net"
TICKET="{jira-ticket}"

for img in C:/Temp/proof-of-fix/{jira-ticket}/*.png; do
  fname=$(basename "$img")
  MSYS_NO_PATHCONV=1 curl -sf \
    -H "Authorization: Bearer ${JIRA_TOKEN}" \
    -H "X-Atlassian-Token: no-check" \
    -F "file=@${img};type=image/png" \
    "https://${CLOUD}/rest/api/3/issue/${TICKET}/attachments" \
    | python3 -c "
import sys, json
attachments = json.load(sys.stdin)
for a in attachments:
    print(f'Uploaded: {a[\"filename\"]} -> {a[\"content\"]}')
"
done
```

Collect all returned attachment content URLs into a list for the comment.

If `JIRA_TOKEN` is not available in environment, ask the user to paste it
in-session. Do NOT save it to any file.

**Alternatively:** Use `mcp__claude_ai_Atlassian__fetchAtlassian` with:
- method: POST
- url: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue/{ticket}/attachments`
- headers: `{"X-Atlassian-Token": "no-check"}`
- body: multipart form with the image file

---

## Step 5 — Post evidence comment to Jira

Use `mcp__claude_ai_Atlassian__addCommentToJiraIssue` with:

```
cloudId: reallyhq.atlassian.net
issueIdOrKey: {jira-ticket}
contentFormat: markdown
commentBody: |
  ## Proof of Fix — {jira-ticket}

  **Branch:** `{fix-branch}`
  **Captured:** {date}
  **Stack:** Docker localhost:3000

  ### What was broken

  {1-2 sentence description from ticket, specific and factual}

  ### Evidence

  | Screen | Before (main) | After ({fix-branch}) |
  |---|---|---|
  | {url1 description} | ![before]({attachment-url-1}) | ![after]({attachment-url-2}) |
  | {url2 description} | ![before]({attachment-url-3}) | ![after]({attachment-url-4}) |

  ### What changed

  {Bullet list of specific code changes that caused the improvement, with file:line references}

  Verified manually against the test plan in the PR description.
```

---

## Capture Script

Save as `C:/Temp/capture-proof.js` before running.

```javascript
const { chromium } = require('./node_modules/playwright');
const path = require('path');
const fs = require('fs');

const [,, mode, ...urls] = process.argv;
// mode = 'before' or 'after'
// urls = list of relative paths e.g. '/en' '/en/victorpayne'

const ticket = process.env.PROOF_TICKET ?? 'unknown';
const outDir = path.join('C:/Temp/proof-of-fix', ticket);
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'; // NOSONAR

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Collect JS errors — if the page crashes, note it in the filename
  const jsErrors = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));

  for (const url of urls) {
    const slug = url.replace(/^\//, '').replace(/\//g, '-') || 'home';
    const outPath = path.join(outDir, `${mode}-${slug}.png`);

    jsErrors.length = 0;
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for React hydration — networkidle is unreliable on this stack
    // (ipapi.co/ipinfo.io keep polling). Use a fixed wait after domcontentloaded.
    await page.waitForTimeout(4000);

    const crashed = jsErrors.some(e =>
      e.includes('ReferenceError') || e.includes('TypeError') || e.includes('is not defined')
    );

    if (crashed) {
      // Take the screenshot anyway — a blank/crashed page IS the evidence
      console.log(`JS ERROR on ${url}: ${jsErrors[0]}`);
      const errorPath = path.join(outDir, `${mode}-${slug}-CRASHED.png`);
      await page.screenshot({ path: errorPath, fullPage: true });
      console.log(`Saved (crashed): ${errorPath}`);
    } else {
      await page.screenshot({ path: outPath, fullPage: true });
      console.log(`Saved: ${outPath}`);
    }
  }

  await browser.close();
  console.log('Capture complete.');
})();
```

---

## Security rules

- Never capture or upload screenshots from authenticated routes containing
  patient data, appointment records, or provider notes — these may contain PHI.
- Only capture public-facing pages or generic post-login landing screens
  (dashboard shell, empty state) for authenticated flows.
- Do not log auth tokens or session values anywhere in this workflow.
- Jira tokens are session-only — request from user in-session, never write to file.

---

## Output

At the end of the skill, report:

```
## Proof of Fix — {jira-ticket}

Screenshots captured: N before, N after
Attachments uploaded: N files to {jira-ticket}
Jira comment posted: yes / failed (reason)

Files:
  C:/Temp/proof-of-fix/{jira-ticket}/before-*.png
  C:/Temp/proof-of-fix/{jira-ticket}/after-*.png
```

---

## Related skills

- `visual-pr-audit` — full visual audit + code bug fix (PR-focused, does not post to Jira)
- `qa-pr` — functional Playwright QA before PR approval
- `confluence-image-embed` — embed local images into a Confluence page
