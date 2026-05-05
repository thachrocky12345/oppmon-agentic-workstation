# Final Corrected Plan: RGDEV-210 + RGDEV-192 — Provider Portal "Your Links"

**Date:** 2026-03-15
**Worktree:** `RG-Frontend/.claude/worktrees/agent-ab3dfd6d/`
**Sources:** Data Model Audit + UX/Scenario Audit + Fix Plan A + Fix Plan B (merged, deduplicated)

---

## Section 1 — What Was Correctly Implemented (Do NOT Touch)

- **Redux slice structure** — `ProviderBookingLinkState` interface, `initialState`, `fetchBookingLink` thunk with 404-as-null handling, `generateBookingLinkThunk` with idempotent behavior, `clearBookingLinkError` action export
- **REST helper** — all 4 endpoints wired correctly in `src/restapis/bookingLink.ts` (fetch, generate, deactivate, QR with `responseType: "blob"`)
- **QR blob lifecycle** — lazy fetch on click, `URL.revokeObjectURL` cleanup on unmount, no blob leak on collapse/re-expand, download anchor guarded by `showQr && blobUrl`
- **Profile URL derivation** — reads `profileHandle` from `careProviderSliceV1.careProviderDetail`, null-safe with `?? null` coercion, `ProfileLinkCard` returns `null` when handle missing
- **Fee copy accuracy** — Profile 12%, Booking Link 10%, no inversion, matches backend constants
- **Grid layout** — `xs={12} md={6}` side-by-side on desktop, full-width fallback when `profileHandle` is null
- **Auth guard** — mounted under `/cp/profile/` route namespace, page-level guard sufficient, graceful 404/400 handling for wrong-role access
- **Fetch dispatch timing** — `fetchBookingLink` dispatched in `YourLinksPanel` `useEffect` on mount only
- **Double-click guard** — Generate button disabled while `isGenerating || isLoading`
- **Deactivate pending handler** — only sets `isLoading`, does NOT prematurely mutate `is_active`
- **No polling** — deliberate per plan spec
- **Web Share API guard** — `handleShare` checks `navigator.share` before calling, falls back to copy
- **Share payload fields** — `{ title, url }` only, correct and safe
- **TypeScript types** — `BookingLinkData` interface mirrors backend serializer accurately
- **Stats zero state** — both-zero renders encouraging italic message
- **Generate idempotency** — no false "created" toast, URL from response payload

---

## Section 2 — Fixes Required (Ordered by Severity)

### Fix 1 — CRITICAL: `deactivateBookingLinkThunk.fulfilled` corrupts Redux state

- **Severity:** Critical
- **File:** `src/store/slices/providerBookingLinkSlice.ts`
- **Problem:** The fulfilled handler sets `state.bookingLink = action.payload`, but the backend returns `{"detail": "Booking Link deactivated."}` (not a `BookingLinkData` object), destroying all fields (`is_active`, `booking_link_url`, stats, etc.) and breaking all downstream reads.
- **Fix:**

**Old (lines 121-124):**
```ts
    builder.addCase(deactivateBookingLinkThunk.fulfilled, (state, action) => {
      state.isLoading = false;
      state.bookingLink = action.payload;
    });
```

**New:**
```ts
    builder.addCase(deactivateBookingLinkThunk.fulfilled, (state) => {
      state.isLoading = false;
      if (state.bookingLink) {
        state.bookingLink.is_active = false;
      }
    });
```

---

### Fix 2 — HIGH: No confirmation dialog before deactivation

- **Severity:** High
- **File:** `src/containers/provider-links/BookingLinkCard.tsx`
- **Problem:** Clicking "Deactivate link" immediately fires `deactivateBookingLinkThunk()` with zero confirmation. A single accidental click deactivates the provider's booking link.
- **Fix:**

**2a. Add MUI Dialog imports (lines 1-12):**

**Old:**
```tsx
import React, { useCallback, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
```

**New:**
```tsx
import React, { useCallback, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
```

**2b. Add dialog state (after line 30):**

**Old:**
```tsx
  const [copied, setCopied] = useState(false);

  const bookingLink: BookingLinkData | null = useSelector(
```

**New:**
```tsx
  const [copied, setCopied] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const bookingLink: BookingLinkData | null = useSelector(
```

**2c. Add error selector (after `isLoading` selector, line 40):**

**Old:**
```tsx
  const isLoading: boolean = useSelector(
    (state: any) => state?.providerBookingLink?.isLoading
  );
```

**New:**
```tsx
  const isLoading: boolean = useSelector(
    (state: any) => state?.providerBookingLink?.isLoading
  );
  const error: string | null = useSelector(
    (state: any) => state?.providerBookingLink?.error
  );
```

**2d. Add `isDeactivated` flag (after line 42):**

**Old:**
```tsx
  const isActive = bookingLink?.is_active === true;
  const bookingUrl = bookingLink?.booking_link_url || null;
```

**New:**
```tsx
  const isActive = bookingLink?.is_active === true;
  const isDeactivated = bookingLink !== null && !isActive;
  const bookingUrl = bookingLink?.booking_link_url || null;
```

**2e. Replace immediate deactivation with dialog open (lines 49-51):**

**Old:**
```tsx
  const handleDeactivate = useCallback(() => {
    dispatch(deactivateBookingLinkThunk());
  }, [dispatch]);
```

**New:**
```tsx
  const handleDeactivate = useCallback(() => {
    setShowDeactivateDialog(true);
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    setShowDeactivateDialog(false);
    dispatch(deactivateBookingLinkThunk());
  }, [dispatch]);

  const handleCancelDeactivate = useCallback(() => {
    setShowDeactivateDialog(false);
  }, []);
```

**2f. Add `clearBookingLinkError` to imports (lines 19-23):**

**Old:**
```tsx
import {
  generateBookingLinkThunk,
  deactivateBookingLinkThunk,
  BookingLinkData,
} from "../../store/slices/providerBookingLinkSlice";
```

**New:**
```tsx
import {
  generateBookingLinkThunk,
  deactivateBookingLinkThunk,
  clearBookingLinkError,
  BookingLinkData,
} from "../../store/slices/providerBookingLinkSlice";
```

**2g. Add Dialog + Snackbar before closing `</Card>` in active state return (before line 223):**

**Old:**
```tsx
      </CardContent>
    </Card>
  );
```

**New:**
```tsx
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => dispatch(clearBookingLinkError())}>
            {error}
          </Alert>
        )}
      </CardContent>

      {/* Deactivation confirmation dialog */}
      <Dialog
        open={showDeactivateDialog}
        onClose={handleCancelDeactivate}
        aria-labelledby="deactivate-dialog-title"
      >
        <DialogTitle id="deactivate-dialog-title">
          Deactivate your Booking Link?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your Booking Link will stop working immediately. Clients who have it
            saved will see an error page. You can reactivate later, but a new
            link URL will be generated.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeactivate} sx={{ textTransform: "none" }}>
            Keep active
          </Button>
          <Button
            onClick={handleConfirmDeactivate}
            color="error"
            variant="contained"
            sx={{ textTransform: "none" }}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Copy success snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message="Link copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Card>
  );
```

---

### Fix 3 — HIGH: Post-deactivation state indistinguishable from never-had-a-link

- **Severity:** High
- **File:** `src/containers/provider-links/BookingLinkCard.tsx`
- **Problem:** Both "no link" and "inactive link" render the same empty state with "Generate my Booking Link" CTA. Provider loses all context after deactivation.
- **Fix:** Replace the single `if (!bookingLink || !isActive)` early-return block (lines 80-137) with two separate branches:

**Old (lines 80-138):**
```tsx
  // Empty state: no link at all, or link is inactive
  if (!bookingLink || !isActive) {
    return (
      <Card ... >
        <CardContent ...>
          <RocketLaunchIcon ... />
          <Typography variant="h6">Start getting direct bookings</Typography>
          ...
          <Button ...>Generate my Booking Link</Button>
        </CardContent>
      </Card>
    );
  }
```

**New:**
```tsx
  // Deactivated state: link exists but is inactive
  if (isDeactivated) {
    return (
      <Card
        variant="outlined"
        sx={{ borderRadius: "12px", height: "100%" }}
      >
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            py: 4,
          }}
        >
          <LinkIcon
            sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }}
          />
          <Typography
            variant="h6"
            sx={{ fontWeight: 600, color: theme.palette.secondary.main, mb: 1 }}
          >
            Your Booking Link is inactive
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: theme.palette.text.secondary, mb: 3, maxWidth: 360, lineHeight: 1.6 }}
          >
            Reactivate your link to start receiving direct bookings again at a{" "}
            <strong>10%</strong> platform fee.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2, width: "100%", maxWidth: 360 }} onClose={() => dispatch(clearBookingLinkError())}>
              {error}
            </Alert>
          )}
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            startIcon={
              isGenerating ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <LinkIcon />
              )
            }
            sx={{ borderRadius: "100px", textTransform: "none", px: 3 }}
          >
            Reactivate my Booking Link
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Empty state: never had a link
  if (!bookingLink) {
    return (
      <Card
        variant="outlined"
        sx={{ borderRadius: "12px", height: "100%" }}
      >
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            py: 4,
          }}
        >
          <RocketLaunchIcon
            sx={{ fontSize: 48, color: theme.palette.primary.main, mb: 2 }}
          />
          <Typography
            variant="h6"
            sx={{ fontWeight: 600, color: theme.palette.secondary.main, mb: 1 }}
          >
            Start getting direct bookings
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: theme.palette.text.secondary, mb: 3, maxWidth: 360, lineHeight: 1.6 }}
          >
            Share your Booking Link and clients go straight to scheduling — no
            marketplace browsing. You get a <strong>10%</strong> platform fee
            instead of 12% for every client who books through it.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2, width: "100%", maxWidth: 360 }} onClose={() => dispatch(clearBookingLinkError())}>
              {error}
            </Alert>
          )}
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            startIcon={
              isGenerating ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <LinkIcon />
              )
            }
            sx={{ borderRadius: "100px", textTransform: "none", px: 3 }}
          >
            Generate my Booking Link
          </Button>
        </CardContent>
      </Card>
    );
  }
```

**Note:** The `isDeactivated` check must come BEFORE `!bookingLink` because `isDeactivated` requires `bookingLink !== null`.

---

### Fix 4 — HIGH: Copy feedback tooltip invisible on mobile

- **Severity:** High
- **File:** `src/containers/provider-links/BookingLinkCard.tsx` and `src/containers/provider-links/ProfileLinkCard.tsx`
- **Problem:** "Copied!" feedback is Tooltip-only, which is invisible on mobile touch. No icon change, no toast.
- **Fix:**

**4a. BookingLinkCard — swap copy icon to checkmark on success (line 184-188):**

**Old:**
```tsx
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
```

**New:**
```tsx
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopy}>
              {copied ? (
                <CheckIcon fontSize="small" color="success" />
              ) : (
                <ContentCopyIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
```

**4b. ProfileLinkCard — add imports (lines 1-2):**

**Old:**
```tsx
import React, { useCallback, useState } from "react";
import { Box, Button, Card, CardContent, Chip, IconButton, Tooltip, Typography } from "@mui/material";
```

**New:**
```tsx
import React, { useCallback, useState } from "react";
import { Box, Button, Card, CardContent, Chip, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
```

**4c. ProfileLinkCard — add snackbar state (after line 14):**

**Old:**
```tsx
  const [copied, setCopied] = useState(false);
```

**New:**
```tsx
  const [copied, setCopied] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
```

**4d. ProfileLinkCard — swap copy icon to checkmark (lines 84-88):**

**Old:**
```tsx
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
```

**New:**
```tsx
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopy}>
              {copied ? (
                <CheckIcon fontSize="small" color="success" />
              ) : (
                <ContentCopyIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
```

**4e. ProfileLinkCard — add Snackbar before closing `</Card>` (lines 103-105):**

**Old:**
```tsx
      </CardContent>
    </Card>
  );
```

**New:**
```tsx
      </CardContent>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message="Link copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Card>
  );
```

---

### Fix 5 — HIGH: API errors silently swallowed

- **Severity:** High
- **File:** `src/containers/provider-links/BookingLinkCard.tsx`
- **Problem:** Redux slice stores `error` on thunk rejection but `BookingLinkCard` never reads or displays it. Backend 400 errors (e.g., "Complete your profile before generating a Booking Link") are invisible to the user.
- **Fix:** Already included in Fix 2c (error selector) and Fix 3 (Alert components in all three state branches). No additional changes needed.

---

### Fix 6 — MEDIUM: Clipboard fallback for non-HTTPS / older browsers

- **Severity:** Medium
- **Files:** `src/containers/provider-links/BookingLinkCard.tsx`, `src/containers/provider-links/ProfileLinkCard.tsx`
- **Problem:** Both `handleCopy` functions use `navigator.clipboard.writeText()` only. On non-HTTPS contexts, copy silently fails. Handler is also duplicated.
- **Fix:**

**6a. Create shared utility — new file `src/containers/provider-links/utils/copyToClipboard.ts`:**

```ts
/**
 * Copy text to clipboard with fallback for non-HTTPS / older browsers.
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Primary: Clipboard API (requires HTTPS or localhost)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // Fallback: document.execCommand('copy') via temporary textarea
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
```

**6b. BookingLinkCard — replace `handleCopy` (lines 53-62):**

Add import:
```ts
import { copyToClipboard } from "./utils/copyToClipboard";
```

**Old:**
```tsx
  const handleCopy = useCallback(async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy booking link", err);
    }
  }, [bookingUrl]);
```

**New:**
```tsx
  const handleCopy = useCallback(async () => {
    if (!bookingUrl) return;
    const success = await copyToClipboard(bookingUrl);
    if (success) {
      setCopied(true);
      setSnackbarOpen(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [bookingUrl]);
```

**6c. ProfileLinkCard — replace `handleCopy` (lines 20-29):**

Add import:
```ts
import { copyToClipboard } from "./utils/copyToClipboard";
```

**Old:**
```tsx
  const handleCopy = useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy profile URL", err);
    }
  }, [profileUrl]);
```

**New:**
```tsx
  const handleCopy = useCallback(async () => {
    if (!profileUrl) return;
    const success = await copyToClipboard(profileUrl);
    if (success) {
      setCopied(true);
      setSnackbarOpen(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [profileUrl]);
```

---

### Fix 7 — LOW: Conversion rate shows em dash instead of "0%" when clicks > 0 but bookings = 0

- **Severity:** Low
- **File:** `src/containers/provider-links/LinkStats.tsx`
- **Problem:** When `clickCount > 0` but `bookingCount === 0`, conversion shows em dash (implying "no data") instead of "0%" (the actual conversion rate).
- **Fix:**

**Old (lines 63-66):**
```ts
  const conversionRate =
    bookingCount > 0 && clickCount > 0
      ? `${((bookingCount / clickCount) * 100).toFixed(0)}%`
      : "\u2014";
```

**New:**
```ts
  const conversionRate =
    clickCount > 0
      ? `${((bookingCount / clickCount) * 100).toFixed(0)}%`
      : "\u2014";
```

---

### Fix 8 — LOW: Share button tooltip misleading on desktop

- **Severity:** Low
- **Files:** `src/containers/provider-links/BookingLinkCard.tsx` (line 189), `src/containers/provider-links/ProfileLinkCard.tsx` (line 89)
- **Problem:** Share button shows tooltip "Share" on desktop where Web Share API is unavailable. Falls back to copy (functional) but tooltip is misleading.
- **Fix:**

**Old (both files):**
```tsx
          <Tooltip title="Share">
```

**New (both files):**
```tsx
          <Tooltip title={typeof navigator !== "undefined" && navigator.share ? "Share" : "Share link"}>
```

---

## Section 3 — Do NOT Change (PASS Items)

These items passed both audits. No modifications.

### From Data Model Audit:
1. `fetchBookingLink` thunk — pending/fulfilled/rejected handlers, 404-as-null (Section 1a)
2. `generateBookingLinkThunk` thunk — pending/fulfilled/rejected handlers (Section 1b)
3. Generate idempotency UI — no false toast, no create/reactivate distinction needed, URL from response (Section 2)
4. QR blob lifecycle — UUID for endpoint, local state, revokeObjectURL cleanup, no leak on toggle, download anchor guarded (Section 3)
5. Profile URL derivation — correct source, null safety, URL construction, reactivity (Section 4)
6. Reactivate action calls `generateBookingLink()` — correct, API handles both (Section 5b)
7. URL updates from response after reactivation — fulfilled overwrites entire object (Section 5c)
8. Stats division-by-zero guard — guarded correctly (Section 6a)
9. Stats `booking_count` null guard — `?? 0` belt-and-suspenders (Section 6b)
10. Stats both-zero fallback copy — italic encouraging message (Section 6c)
11. Auth guard — `/cp/` route namespace, graceful for wrong role (Section 9)
12. Insertion point — profile page between Affiliate ID and Password sections (Section 10)
13. REST helper — all 4 endpoints, blob responseType, shared axiosInstance, empty POST body (Section 11)
14. TypeScript types — `BookingLinkData` interface correct (Section 12)
15. Double-click guard — button disabled during `isGenerating || isLoading` (Section 13a)
16. No premature state mutation on deactivate pending (Section 13b)
17. No polling — deliberate per spec (Section 13c)
18. QR hidden when link inactive (Section 13d)

### From UX/Scenario Audit:
1. Empty state clarity — correct headline, body, CTA, icon (Dimension 1)
2. Fee differentiation copy accuracy — 12% profile, 10% booking, no inversion (Dimension 2)
3. Both links visible together without scrolling — Grid layout correct (Dimension 3)
4. QR code URL correctness — UUID PK, blob, lazy fetch, cleanup (Dimension 5)
5. Mobile native share — guarded, correct payloads, no URL inconsistency (Dimension 6)
6. Stats zero state — correct messaging (Dimension 7)
7. Stats isolation — no cross-provider data leakage (Dimension 9)

### Files requiring NO changes:
- `src/containers/provider-links/YourLinksPanel.tsx`
- `src/containers/provider-links/QrCodeDownload.tsx`
- `src/store/slices/providerBookingLinkSlice.ts` (except Fix 1)
- `src/restapis/bookingLink.ts`

---

## Implementation Order

1. **Fix 1** — `providerBookingLinkSlice.ts` deactivate handler (critical, standalone, 3 lines)
2. **Fix 6a** — Create `utils/copyToClipboard.ts` (new file, no conflicts)
3. **Fix 6b + 6c** — Update both cards' `handleCopy` to use shared utility
4. **Fix 2 + 3 + 4 + 5** — `BookingLinkCard.tsx` (imports, state, dialog, three-state, error, icons, snackbar)
5. **Fix 4b-e** — `ProfileLinkCard.tsx` (imports, snackbar state, icon swap, snackbar component)
6. **Fix 7** — `LinkStats.tsx` conversion rate logic (2 lines)
7. **Fix 8** — Tooltip text updates in both cards (trivial)

---

## Verification Checklist

- [ ] Deactivate fulfilled handler sets `is_active = false` (not payload overwrite)
- [ ] "Deactivate link" opens confirmation dialog, not API call
- [ ] "Keep active" dismisses dialog with no side effects
- [ ] "Deactivate" in dialog fires API call and transitions to inactive state
- [ ] Inactive state: "Your Booking Link is inactive" headline, grayed LinkIcon, "Reactivate" CTA
- [ ] Empty state: "Start getting direct bookings" headline, RocketLaunchIcon, "Generate" CTA
- [ ] Copy: Snackbar appears on desktop click and mobile tap
- [ ] Copy: icon swaps to green checkmark for 2 seconds
- [ ] Copy: works in insecure contexts via `execCommand` fallback
- [ ] API errors: shown as inline Alert in all three card states
- [ ] API errors: dismissible via close button
- [ ] Conversion rate: shows "0%" when clicks > 0 but bookings = 0
- [ ] Share tooltip: context-aware text on desktop vs mobile

**Total: 6 files touched (4 modified, 1 new utility), ~150 lines changed.**
