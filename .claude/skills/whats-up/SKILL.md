---
name: whats-up
description: Generate a "Previously on ReallyGlobal..." TV-drama style recap for the engineering team — what shipped, what broke, what's in flight, and what's next. Use when asked "what's up", "catch me up", "what happened", "session recap", or "previously on".
argument-hint: []
---

# What's Up — ReallyGlobal Session Recap

Generate a punchy "Previously on ReallyGlobal..." narrative for the engineering team.

---

## Step 1 — Gather Context (run ALL in parallel)

### 1a. Recent commits — Lumy-Backend
```bash
cd /c/Projects/ReallyGlobal/Lumy-Backend && git log --oneline -20
```

### 1b. Recent commits — RG-Frontend
```bash
cd /c/Projects/ReallyGlobal/RG-Frontend && git log --oneline -20
```

### 1c. Open PRs (both repos)
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
cd /c/Projects/ReallyGlobal/Lumy-Backend && gh pr list --json number,title,state,reviewDecision,headRefName,url --jq '.[] | "#\(.number) [\(.headRefName)] \(.reviewDecision // "pending") — \(.title)\n  \(.url)"'
cd /c/Projects/ReallyGlobal/RG-Frontend && gh pr list --json number,title,state,reviewDecision,headRefName,url --jq '.[] | "#\(.number) [\(.headRefName)] \(.reviewDecision // "pending") — \(.title)\n  \(.url)"'
```

### 1d. Memory + active TODOs
- Read `C:\Users\jerem\.claude\projects\C--projects-ReallyGlobal\memory\MEMORY.md`
- Read `C:\Users\jerem\.claude\projects\C--projects-ReallyGlobal\memory\todos.md` (if it exists)

### 1e. Dirty / uncommitted work
```bash
cd /c/Projects/ReallyGlobal/Lumy-Backend && git status --short
cd /c/Projects/ReallyGlobal/RG-Frontend && git status --short
```

---

## Step 2 — Synthesize

Produce output in **exactly** this format. No extra sections, no boilerplate.

---

**PREVIOUSLY ON REALLYGLOBAL...**

*2–4 sentences, past tense, narrative voice. Describe the story arc of recent work across both repos — what broke, what got built, what got fixed. Use real feature names, branch names, ticket numbers. Think AMC recap card.*

**THE CLIFFHANGER**

*1–2 sentences. What is currently broken, unverified, blocked, or in flight — the thing that isn't resolved yet. If a PR is open and unreviewed, say so. If a fix was applied but not tested on fresh Docker, say so.*

**WHAT'S ON DECK**

*Top 2–3 open items, one line each, written as action items. Pull from memory todos, PR review state, and known blockers.*

---

## Tone Rules

- Past tense for completed work: "The profile completion modal was silently firing for every seeded client because `profile_type` was null..."
- Present tense for current state: "Right now PR #1233 is open as a draft and hasn't been reviewed..."
- Use real names: feature names, branch names, file names, ticket IDs
- Slightly dramatic is fine — this is a recap card, not a status report
- No "In summary", no "As you can see", no bullet-point dumps
- Max ~200 words total
- Must be scannable in 30 seconds
- If nothing notable happened (clean repos, no PRs, no todos), say so directly: "The repos are clean, the stack is running, and everyone's waiting on the next ticket."

---

## Example Output

**PREVIOUSLY ON REALLYGLOBAL...**

The Talk Now WebSocket was spawning 38 connections per page load — one for each `ProviderCard` rendered — until the shared connection was hoisted up to the container. Meanwhile, seeded dev users were getting ambushed by the profile completion modal on every login because `profile_type` was null in all 64 user fixtures. The `RATE_LIMIT_VALUE` env var was also quietly poisoning the rate limiter with a malformed string, throwing `'NoneType' object has no attribute 'groups'` on any login that touched `SendVerificationCodeMutation`. All three were patched and pushed to `RGDEV-166/realtime-translation`.

**THE CLIFFHANGER**

PR #1233 is open as a draft — the realtime translation relay, working hours migration, and seed fixes are all bundled in but nobody's reviewed it yet. A fresh Docker boot hasn't been verified with the new fixtures.

**WHAT'S ON DECK**

- Promote PR #1233 from draft and get it reviewed
- Verify fresh `docker compose up` flow: seeded users log in without profile completion prompts
- Wire live Twilio audio into the translation relay (test page uses file decode; production path not yet connected)
