# Fix Plan: Provider Links Portal UX/Scenario Audit Failures

**Source audit:** `Audit_ProviderLinksPortal_UXScenario_Results_2026-03-15.md`
**Date:** 2026-03-15
**Worktree:** `C:\Projects\ReallyGlobal\RG-Frontend\.claude\worktrees\agent-ab3dfd6d\`

---

## Fix 1 — Deactivation Confirmation Dialog (Audit Dimension 8, High Severity)

### Problem

`BookingLinkCard.tsx` line 49-51: clicking "Deactivate link" immediately dispatches `deactivateBookingLinkThunk()` with no confirmation. After deactivation, `!bookingLink || !isActive` on line 81 renders the same empty state as "never had a link" — the provider loses all context (stats, URL) and sees "Generate my Booking Link" instead of a reactivation prompt.

### File

`src/containers/provider-links/BookingLinkCard.tsx`

### Changes

#### 1a. Add imports for Dialog and Snackbar components

**Old code (lines 1-11):**
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

**New code:**
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

**Why:** `Dialog` is needed for the deactivation confirmation. `Snackbar` is needed for copy feedback (Fix 2). `Alert` is needed for error display (Fix 3). `CheckIcon` replaces the copy icon on success.

#### 1b. Add confirmation dialog state and deactivated-state detection

**Old code (lines 30-31):**
```tsx
  const [copied, setCopied] = useState(false);

  const bookingLink: BookingLinkData | null = useSelector(
```

**New code:**
```tsx
  const [copied, setCopied] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const bookingLink: BookingLinkData | null = useSelector(
```

**Why:** `showDeactivateDialog` controls the confirmation modal. `snackbarOpen` is for copy feedback (Fix 2).

#### 1c. Add error selector

**Old code (lines 38-40):**
```tsx
  const isLoading: boolean = useSelector(
    (state: any) => state?.providerBookingLink?.isLoading
  );
```

**New code:**
```tsx
  const isLoading: boolean = useSelector(
    (state: any) => state?.providerBookingLink?.isLoading
  );
  const error: string | null = useSelector(
    (state: any) => state?.providerBookingLink?.error
  );
```

**Why:** The Redux slice already stores `error` but BookingLinkCard never reads it. Needed for Fix 3.

#### 1d. Add deactivated-state flag

**Old code (line 42-43):**
```tsx
  const isActive = bookingLink?.is_active === true;
  const bookingUrl = bookingLink?.booking_link_url || null;
```

**New code:**
```tsx
  const isActive = bookingLink?.is_active === true;
  const isDeactivated = bookingLink !== null && !isActive;
  const bookingUrl = bookingLink?.booking_link_url || null;
```

**Why:** Distinguishes "never had a link" (`bookingLink === null`) from "had a link but deactivated" (`bookingLink !== null && !isActive`). This is the core distinction the audit flagged.

#### 1e. Replace immediate deactivation with dialog open

**Old code (lines 49-51):**
```tsx
  const handleDeactivate = useCallback(() => {
    dispatch(deactivateBookingLinkThunk());
  }, [dispatch]);
```

**New code:**
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

**Why:** The audit requires a confirmation step before firing the API call. `handleDeactivate` now opens the dialog; `handleConfirmDeactivate` dispatches only after explicit user confirmation.

#### 1f. Replace the unified empty/deactivated state with two branches

**Old code (lines 80-137):**
```tsx
  // Empty state: no link at all, or link is inactive
  if (!bookingLink || !isActive) {
    return (
      <Card
        variant="outlined"
        sx={{
          borderRadius: "12px",
          height: "100%",
        }}
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
            sx={{
              borderRadius: "100px",
              textTransform: "none",
              px: 3,
            }}
          >
            Generate my Booking Link
          </Button>
        </CardContent>
      </Card>
    );
  }
```

**New code:**
```tsx
  // Deactivated state: had a link, now inactive — distinct from never-had-a-link
  if (isDeactivated) {
    return (
      <Card
        variant="outlined"
        sx={{
          borderRadius: "12px",
          height: "100%",
        }}
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
            Your Booking Link has been deactivated
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: theme.palette.text.secondary, mb: 3, maxWidth: 360, lineHeight: 1.6 }}
          >
            Your previous link is no longer active. Generate a new one below to
            start receiving direct bookings again at the <strong>10%</strong>{" "}
            platform fee.
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
            sx={{
              borderRadius: "100px",
              textTransform: "none",
              px: 3,
            }}
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
        sx={{
          borderRadius: "12px",
          height: "100%",
        }}
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
            sx={{
              borderRadius: "100px",
              textTransform: "none",
              px: 3,
            }}
          >
            Generate my Booking Link
          </Button>
        </CardContent>
      </Card>
    );
  }
```

**Why:** The audit's most critical finding: deactivated state was indistinguishable from never-had-a-link. Now:
- `isDeactivated` (`bookingLink !== null && !isActive`) renders a grayed-out `LinkIcon`, headline "Your Booking Link has been deactivated", and CTA "Reactivate my Booking Link".
- `!bookingLink` (null, truly never had a link) renders the original empty state with `RocketLaunchIcon` and "Generate my Booking Link".
- Both states include the `error` Alert (Fix 3).

#### 1g. Add confirmation dialog and snackbar to the active-state return JSX

Insert immediately before the closing `</Card>` tag in the active-state return (before line 224):

**Old code (lines 222-224):**
```tsx
      </CardContent>
    </Card>
  );
```

**New code:**
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

**Why:** The dialog prevents accidental deactivation. The destructive action ("Deactivate") is a red contained button to signal danger. The safe action ("Keep active") is the default/prominent option. Dialog copy explains consequences (link stops working, new URL on reactivate). The Snackbar is for Fix 2.

#### 1h. Add clearBookingLinkError to imports from the slice

**Old code (lines 19-23):**
```tsx
import {
  generateBookingLinkThunk,
  deactivateBookingLinkThunk,
  BookingLinkData,
} from "../../store/slices/providerBookingLinkSlice";
```

**New code:**
```tsx
import {
  generateBookingLinkThunk,
  deactivateBookingLinkThunk,
  clearBookingLinkError,
  BookingLinkData,
} from "../../store/slices/providerBookingLinkSlice";
```

**Why:** Needed for the `onClose` handler on the `Alert` component to dismiss errors.

---

## Fix 2 — Copy Feedback: Snackbar Fallback for Mobile (Audit Dimension 4, Medium Severity)

### Problem

Both `ProfileLinkCard.tsx` and `BookingLinkCard.tsx` show "Copied!" only via a MUI `Tooltip`, which is invisible on mobile touch devices. The icon does not change, so there is zero visual feedback on touch.

### File 1: `src/containers/provider-links/BookingLinkCard.tsx`

#### 2a. Update handleCopy to also trigger snackbar

**Old code (lines 53-62):**
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

**New code:**
```tsx
  const handleCopy = useCallback(async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setSnackbarOpen(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      try {
        const textarea = document.createElement("textarea");
        textarea.value = bookingUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setSnackbarOpen(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setSnackbarOpen(false);
        // If both methods fail, error is inherently visible (nothing happened)
      }
    }
  }, [bookingUrl]);
```

**Why:** `setSnackbarOpen(true)` triggers a visible toast that works on both desktop and mobile. The `document.execCommand("copy")` fallback handles insecure contexts where `navigator.clipboard` is unavailable. The Snackbar JSX was already added in Fix 1g.

#### 2b. Swap copy icon to checkmark on success

**Old code (lines 184-188):**
```tsx
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
```

**New code:**
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

**Why:** The icon swap from copy-icon to green checkmark provides immediate visual feedback without requiring hover (tooltip). This works on both desktop and mobile.

### File 2: `src/containers/provider-links/ProfileLinkCard.tsx`

#### 2c. Add imports

**Old code (lines 1-2):**
```tsx
import React, { useCallback, useState } from "react";
import { Box, Button, Card, CardContent, Chip, IconButton, Tooltip, Typography } from "@mui/material";
```

**New code:**
```tsx
import React, { useCallback, useState } from "react";
import { Box, Button, Card, CardContent, Chip, IconButton, Snackbar, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
```

#### 2d. Add snackbar state

**Old code (line 14):**
```tsx
  const [copied, setCopied] = useState(false);
```

**New code:**
```tsx
  const [copied, setCopied] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
```

#### 2e. Update handleCopy with snackbar trigger and clipboard fallback

**Old code (lines 20-29):**
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

**New code:**
```tsx
  const handleCopy = useCallback(async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setSnackbarOpen(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = profileUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setSnackbarOpen(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Both methods failed — no feedback needed
      }
    }
  }, [profileUrl]);
```

#### 2f. Swap copy icon to checkmark on success

**Old code (lines 84-88):**
```tsx
          <Tooltip title={copied ? "Copied!" : "Copy link"}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
```

**New code:**
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

#### 2g. Add Snackbar before closing Card tag

**Old code (lines 103-105):**
```tsx
      </CardContent>
    </Card>
  );
```

**New code:**
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

## Fix 3 — Surface API Errors to the User (Audit Dimension 10, Medium Severity)

### Problem

The Redux slice stores `error` on thunk rejection (lines 97-100, 111-113, 125-128 of `providerBookingLinkSlice.ts`), but `BookingLinkCard` never reads it. The "Complete your profile before generating a Booking Link" 400 error is silently swallowed.

### Changes

All changes for Fix 3 are **already included** in the Fix 1 changeset above:

1. **Error selector** — added in Fix 1c (`const error = useSelector(...)`)
2. **`clearBookingLinkError` import** — added in Fix 1h
3. **Alert in empty state** — added in Fix 1f (both `!bookingLink` and `isDeactivated` branches)
4. **Alert in active state** — added in Fix 1g (before `</CardContent>`)

The `Alert` component:
- Uses `severity="error"` for red styling
- Displays the exact error string from Redux (which contains the backend's detail message, e.g., "Complete your profile before generating a Booking Link.")
- Has an `onClose` handler that dispatches `clearBookingLinkError()` to dismiss
- Appears inline within the card, not as a global toast, so it's contextually associated with the booking link action that failed

### No slice changes needed

The slice already:
- Stores `error` on rejection (lines 99, 113, 127)
- Clears `error` on new pending actions (lines 91, 105, 119)
- Exports `clearBookingLinkError` action (line 132)

---

## Summary of All Changes

| File | Fix | What changes |
|---|---|---|
| `BookingLinkCard.tsx` | 1, 2, 3 | Add Dialog/Snackbar/Alert/CheckIcon imports; add `showDeactivateDialog`, `snackbarOpen`, `error` state/selectors; add `isDeactivated` flag; split empty state into deactivated vs never-had-a-link; add confirmation dialog; replace immediate deactivation; add snackbar for copy; add error Alert; swap copy icon to checkmark on success; add clipboard fallback |
| `ProfileLinkCard.tsx` | 2 | Add Snackbar/CheckIcon imports; add `snackbarOpen` state; add snackbar trigger + clipboard fallback in handleCopy; swap copy icon to checkmark on success; add Snackbar component |
| `providerBookingLinkSlice.ts` | — | No changes needed (already stores error and exports clearBookingLinkError) |
| `YourLinksPanel.tsx` | — | No changes needed |

### Verification Checklist

- [ ] Deactivation: click "Deactivate link" opens confirmation dialog, not API call
- [ ] Deactivation: clicking "Keep active" dismisses dialog with no side effects
- [ ] Deactivation: clicking "Deactivate" in dialog fires API call and transitions to deactivated state
- [ ] Deactivated state: shows "Your Booking Link has been deactivated" headline (not "Start getting direct bookings")
- [ ] Deactivated state: CTA reads "Reactivate my Booking Link" (not "Generate")
- [ ] Deactivated state: grayed-out LinkIcon (not RocketLaunchIcon)
- [ ] Copy feedback: Snackbar appears on both desktop click and mobile tap
- [ ] Copy feedback: icon swaps to green checkmark for 2 seconds
- [ ] Copy feedback: works in insecure contexts via `execCommand` fallback
- [ ] API errors: "Complete your profile" 400 error shown as inline Alert
- [ ] API errors: network failures shown as inline Alert
- [ ] API errors: Alert dismissible via close button (dispatches `clearBookingLinkError`)
- [ ] API errors: error clears automatically when user retries (pending state clears it)
