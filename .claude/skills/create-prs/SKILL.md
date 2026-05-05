---
name: create-prs
description: Create pull requests for one or both repos (Lumy-Backend, RG-Frontend) merging to main. Use when asked to "create PR", "open PR", "merge to main", or "submit for review".
argument-hint: [be|fe|both]
---

# Create Pull Requests

## Prerequisites
- `gh` CLI installed and authenticated (`gh auth status`)
- If not installed: `winget install GitHub.cli`
- If not authenticated: `gh auth login --git-protocol https --web`
- Both repos pushed to origin

## Workflow

### Step 1: Check state of target repo(s)
For each repo (`C:\Projects\ReallyGlobal\Lumy-Backend` and/or `C:\Projects\ReallyGlobal\RG-Frontend`):

```bash
git status -sb                           # uncommitted changes?
git diff --stat origin/main...HEAD       # what's in this PR?
git log --oneline origin/main..HEAD      # commit history
```

### Step 2: Commit any uncommitted work
If there are staged/unstaged changes, commit them first with a descriptive message.

### Step 3: Push branch
```bash
git push -u origin <branch-name>
```

### Step 4: Create PR
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr create --base main --head <branch> --title "<title>" --body "$(cat <<'EOF'
## Summary
<bullet points>

## Test plan
<checklist>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### PR Title Guidelines
- Under 70 characters
- Descriptive: what the branch brings (features, fixes, infra)
- Examples:
  - `Docker dev stack + Talk Now + risk screening + seed data`
  - `Fix auth token refresh and add geolocation hooks`

### PR Body Template
```markdown
## Summary
- **Category**: Description of changes
- **Category**: Description of changes

## Test plan
- [ ] Test step 1
- [ ] Test step 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Repo Details
| Repo | Path | Remote | Default branch |
|---|---|---|---|
| Backend | `C:\Projects\ReallyGlobal\Lumy-Backend` | `https://github.com/reallyhq/Lumy-Backend` | `main` |
| Frontend | `C:\Projects\ReallyGlobal\RG-Frontend` | `https://github.com/reallyhq/RG-Frontend` | `main` |

## Windows/MSYS Note
- `gh` may not be in bash PATH after install. Use: `export PATH="/c/Program Files/GitHub CLI:$PATH"`
- If `gh auth login` hangs on device flow, it will print a code + URL. User must complete in browser.
