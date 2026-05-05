# Fix Plan: Provider Links Portal — Data Model Audit
# RGDEV-210 + RGDEV-192
# Date: 2026-03-15

**Worktree:** `RG-Frontend/.claude/worktrees/agent-ab3dfd6d/`
**Source audit:** `Audit_ProviderLinksPortal_DataModel_Results_2026-03-15.md`

---

## Fix 1 — CRITICAL: `deactivateBookingLinkThunk.fulfilled` corrupts Redux state

**File:** `src/store/slices/providerBookingLinkSlice.ts`
**Lines:** 121-123
**Audit ref:** Section 1c
**Risk:** HIGH

**Problem:** The backend `POST /api/v1/booking-link/deactivate/` returns `{"detail": "Booking Link deactivated."}`, not a `BookingLinkData` object. The fulfilled handler overwrites `state.bookingLink` with this message object, destroying `is_active`, `booking_link_url`, `click_count`, etc. All downstream reads break.

**Old code (lines 121-123):**
```ts
    builder.addCase(deactivateBookingLinkThunk.fulfilled, (state, action) => {
      state.isLoading = false;
      state.bookingLink = action.payload;
    });
```

**New code:**
```ts
    builder.addCase(deactivateBookingLinkThunk.fulfilled, (state) => {
      state.isLoading = false;
      if (state.bookingLink) {
        state.bookingLink.is_active = false;
      }
    });
```

**Why correct:** Optimistic local mutation. The backend already persisted `is_active = false`; we mirror that in Redux without depending on the response payload shape. The existing `BookingLinkData` object (with `id`, `booking_link_url`, stats, etc.) is preserved. If the user reactivates later, `generateBookingLinkThunk.fulfilled` overwrites the entire object from the API response.

---

## Fix 2 — MEDIUM: Three-state rendering (empty / inactive / active)

**File:** `src/containers/provider-links/BookingLinkCard.tsx`
**Lines:** 80-137 (the early-return branch)
**Audit ref:** Sections 5a, 5d
**Risk:** Medium

**Problem:** Both "no link" and "inactive link" states render the same card with "Generate my Booking Link" CTA. The plan requires a distinct "Reactivate" state for inactive links.

**Old code (lines 80-81):**
```ts
  // Empty state: no link at all, or link is inactive
  if (!bookingLink || !isActive) {
```

**New code — split into two branches:**

Replace lines 80-137 with:

```ts
  // Empty state: no link exists yet
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
            <Typography
              variant="body2"
              sx={{ color: theme.palette.error.main, mb: 2 }}
            >
              {error}
            </Typography>
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

  // Inactive state: link exists but is deactivated
  if (!isActive) {
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
            <Typography
              variant="body2"
              sx={{ color: theme.palette.error.main, mb: 2 }}
            >
              {error}
            </Typography>
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
```

**Additional requirement:** The component must read `error` from Redux. Add this selector near the existing selectors (after line 40):

```ts
  const error: string | null = useSelector(
    (state: any) => state?.providerBookingLink?.error
  );
```

**Why correct:** Three distinct visual states: (1) no link = "Generate", (2) inactive = "Reactivate" with different icon/headline, (3) active = full card. Both empty and inactive states also display Redux errors (fixes Section 13e). The `handleGenerate` action is correct for both states because the backend `generate` endpoint handles both creation and reactivation.

---

## Fix 3 — MEDIUM: Generate 400 error not surfaced to user

**File:** `src/containers/provider-links/BookingLinkCard.tsx`
**Audit ref:** Section 13e
**Risk:** Medium

**Problem:** When `generateBookingLinkThunk` is rejected (e.g., 400 "Complete your profile"), the error is stored in Redux but never displayed. The button simply re-enables.

**Fix:** Already included in Fix 2 above. Both the empty-state and inactive-state cards now render `{error && <Typography color="error">...}` above the CTA button.

**No additional code changes needed beyond Fix 2.**

---

## Fix 4 — MEDIUM: Clipboard fallback for non-HTTPS / older browsers

**Files:**
- `src/containers/provider-links/BookingLinkCard.tsx` (lines 53-61)
- `src/containers/provider-links/ProfileLinkCard.tsx` (lines 20-28)

**Audit ref:** Sections 7b, 7c, 7d
**Risk:** Medium

**Problem:** Both cards use `navigator.clipboard.writeText()` with no fallback. On non-HTTPS contexts or older browsers, copy silently fails. The handler is also duplicated across both files.

**Fix:** Create a shared utility and use it in both components.

### Step 4a: Create shared utility

**New file:** `src/containers/provider-links/utils/copyToClipboard.ts`

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
    // Prevent scrolling on iOS
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

### Step 4b: Update BookingLinkCard.tsx

**Old code (lines 53-61):**
```ts
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
```ts
  const handleCopy = useCallback(async () => {
    if (!bookingUrl) return;
    const success = await copyToClipboard(bookingUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [bookingUrl]);
```

Add import at top:
```ts
import { copyToClipboard } from "./utils/copyToClipboard";
```

### Step 4c: Update ProfileLinkCard.tsx

**Old code (lines 20-28):**
```ts
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
```ts
  const handleCopy = useCallback(async () => {
    if (!profileUrl) return;
    const success = await copyToClipboard(profileUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [profileUrl]);
```

Add import at top:
```ts
import { copyToClipboard } from "./utils/copyToClipboard";
```

**Why correct:** Shared utility eliminates duplication (fixes 7d). Legacy `execCommand` fallback works on non-HTTPS / older browsers (fixes 7b). "Copied!" state only triggers on actual success (fixes 7c). The `textarea` is positioned off-screen to avoid scroll jank on mobile.

---

## Fix 5 — LOW: Conversion rate shows em dash instead of "0%" when clicks > 0 but bookings = 0

**File:** `src/containers/provider-links/LinkStats.tsx`
**Lines:** 63-66
**Audit ref:** Section 6d
**Risk:** Low

**Old code (lines 63-66):**
```ts
  const conversionRate =
    bookingCount > 0 && clickCount > 0
      ? `${((bookingCount / clickCount) * 100).toFixed(0)}%`
      : "\u2014";
```

**New code:**
```ts
  const conversionRate =
    clickCount > 0
      ? `${((bookingCount / clickCount) * 100).toFixed(0)}%`
      : "\u2014";
```

**Why correct:** When `clickCount > 0` and `bookingCount === 0`, the conversion is genuinely 0%, not "no data". The em dash should only appear when there are zero clicks (division by zero). `(0 / N * 100).toFixed(0)` correctly produces `"0"`, so the display will be `"0%"`.

---

## Fix 6 — LOW: Share button always visible on desktop (no Web Share API)

**Files:**
- `src/containers/provider-links/BookingLinkCard.tsx` (lines 189-192)
- `src/containers/provider-links/ProfileLinkCard.tsx` (lines 89-93)

**Audit ref:** Section 8a
**Risk:** Low

**Problem:** Share button is always rendered. On desktop browsers without `navigator.share`, the button is misleading (labeled "Share" but actually copies to clipboard).

**Fix:** Change the tooltip text to be context-aware. Full conditional rendering is not possible at render time in SSR (Next.js), and the `handleShare` already falls back to copy. The pragmatic fix is a dynamic tooltip.

### BookingLinkCard.tsx — line 189

**Old code:**
```tsx
          <Tooltip title="Share">
```

**New code:**
```tsx
          <Tooltip title={typeof navigator !== "undefined" && navigator.share ? "Share" : "Share link"}>
```

### ProfileLinkCard.tsx — line 89

**Old code:**
```tsx
          <Tooltip title="Share">
```

**New code:**
```tsx
          <Tooltip title={typeof navigator !== "undefined" && navigator.share ? "Share" : "Share link"}>
```

**Why correct:** The button still works correctly in all cases (falls back to copy on desktop). The tooltip no longer implies a native share sheet will appear when it won't. A fully conditional render is fragile in SSR contexts because `navigator` is undefined during server-side rendering. Keeping the button visible with an accurate tooltip is the simplest correct approach.

**Alternative (higher effort, better UX):** Wrap in a client-side `useEffect` that sets a `canShare` state, and conditionally render. This is optional for v1.

---

## Fix 7 — QR blob URL cleanup verification

**File:** `src/containers/provider-links/QrCodeDownload.tsx`
**Audit ref:** Section 3c
**Status:** PASS (no fix needed)

The `useEffect` cleanup at lines 18-24 correctly revokes the blob URL on unmount. The `[blobUrl]` dependency ensures cleanup runs when `blobUrl` changes (though in practice it only sets once due to the early return at line 27). The blob is not leaked on collapse/re-expand because `handleShowQr` reuses the existing blob URL.

**No code change required.**

---

## Fix 8 — `navigator.share` runtime guard verification

**File:** `src/containers/provider-links/BookingLinkCard.tsx` (line 66), `ProfileLinkCard.tsx` (line 33)
**Audit ref:** Section 8b
**Status:** PASS (no fix needed)

Both `handleShare` functions check `if (navigator.share)` before calling it, with fallback to `handleCopy()`. No runtime error possible.

**No code change required.**

---

## Implementation Order

Apply fixes in this order to minimize merge conflicts:

1. **Fix 1** — `providerBookingLinkSlice.ts` deactivate handler (critical, standalone)
2. **Fix 4a** — Create `utils/copyToClipboard.ts` (new file, no conflicts)
3. **Fix 4b** — Update `BookingLinkCard.tsx` clipboard handler
4. **Fix 4c** — Update `ProfileLinkCard.tsx` clipboard handler
5. **Fix 2** — `BookingLinkCard.tsx` three-state rendering + error display (largest change)
6. **Fix 5** — `LinkStats.tsx` conversion rate logic
7. **Fix 6** — Tooltip text updates (trivial)

---

## Summary

| Fix | File | Severity | Lines Changed |
|-----|------|----------|---------------|
| 1 | `providerBookingLinkSlice.ts` | CRITICAL | 3 |
| 2 | `BookingLinkCard.tsx` | MEDIUM | ~80 (replace early-return block + add selector) |
| 3 | `BookingLinkCard.tsx` | MEDIUM | included in Fix 2 |
| 4a | `utils/copyToClipboard.ts` | MEDIUM | ~30 (new file) |
| 4b | `BookingLinkCard.tsx` | MEDIUM | 8 |
| 4c | `ProfileLinkCard.tsx` | MEDIUM | 8 |
| 5 | `LinkStats.tsx` | LOW | 2 |
| 6 | `BookingLinkCard.tsx`, `ProfileLinkCard.tsx` | LOW | 2 |
| 7 | N/A | PASS | 0 |
| 8 | N/A | PASS | 0 |

**Total: 6 files touched, ~130 lines changed, 1 new utility file.**
