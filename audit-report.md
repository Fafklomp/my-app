# Life Pulse — MVP Audit Report
_Generated: 2026-04-27_

---

## P0 — Broken / Blocks the User

### 1. Spotify auth broken in production
**File:** `supabase/functions/spotify-auth/index.ts` lines 34, 42

Two hardcoded localhost values mean Spotify OAuth is completely non-functional on any deployed instance:

```ts
const REDIRECT_URI = "http://127.0.0.1:5173/callbacks/spotify"   // line 34
"Access-Control-Allow-Origin": "http://localhost:5173"            // line 42
```

Fix: Read `REDIRECT_URI` from `Deno.env.get("SPOTIFY_REDIRECT_URI")` (the env var is already documented in the function header). Change CORS to `"*"` (matching all other functions) or the production domain.

---

### 2. extract-content function blocked by CORS in production
**File:** `supabase/functions/extract-content/index.ts` line 23

```ts
"Access-Control-Allow-Origin": "http://127.0.0.1:5173"
```

The "Extract content" button in VoiceRecorder will silently fail on any deployed instance. Fix: change to `"*"` to match every other Edge Function.

---

### 3. Recipients cannot view published newsletters
**File:** `src/pages/PublishedUpdatePage.jsx` line 1

```js
// TODO: Add public read RLS policy for published versions
```

This TODO has never been actioned. The `newsletter_versions` table has no public-read RLS policy, so unauthenticated recipients hit a permissions error when following their link. The core send-and-share flow is broken for all recipients.

Fix: Add a Supabase migration that allows `SELECT` on `newsletter_versions` where `status = 'sent'`, and on the related `newsletter_photos` rows.

---

## P1 — Missing but Important for MVP

### 4. No way to delete a newsletter
There is a Reset button (clears content, keeps the shell) but no way to fully delete a newsletter record. A user who creates a newsletter for the wrong month is stuck with it permanently.

---

### 5. Rate limiting absent on generate-summary
**File:** `supabase/functions/generate-summary/index.ts` line 16

```ts
// TODO: Add per-user rate limiting before production use.
```

Every button press fires an uncapped Claude Sonnet call. A single user spam-clicking "Regenerate" could rack up significant AI API costs instantly.

---

### 6. Calendar sync error is swallowed silently
**File:** `src/pages/NewsletterDetailPage.jsx` line 313

```js
console.error('Calendar sync error:', ...)
```

If Google Calendar sync fails the user sees nothing — the button just stops spinning. The error goes only to the console. Same pattern on extract-content (line 324) and photo import failures.

---

### 7. Send errors only logged, not shown
**File:** `src/pages/NewsletterDetailPage.jsx` line 397

```js
console.error('Send errors:', errs)
```

If sending to one audience fails, the toast says "Sent with N error(s). Check console for details." — recipients never get the email and the user has no idea what went wrong without opening DevTools.

---

### 8. ConnectSpotify / ConnectGoogle auth failures silently drop
**Files:** `src/components/ConnectSpotify.jsx:24`, `src/components/ConnectGoogle.jsx:31`

Both log errors to console but show the user nothing. If the Edge Function call to get an auth URL fails, the OAuth button just does nothing.

---

### 9. No empty state / prompt when new user lands on dashboard
A brand-new user sees two empty sections ("No newsletter yet", "No audiences yet") with CTAs, which is good, but there is no guidance on what order to do things in. A user could create a newsletter, fill it out, then discover they have no audience to send to. The CTAs should nudge the user toward the right sequence.

---

### 10. ContentCards save has no error handling
**File:** `src/components/ContentCards.jsx`

The debounced `supabase.update()` call that saves "What's On My Radar" cards has no `.catch` or error state. If the DB write fails, the user's content silently disappears on next reload.

---

### 11. AudiencesPage — member add/remove failures not surfaced
**File:** `src/pages/AudiencesPage.jsx`

`handleAddMember` and `handleRemoveMember` both call Supabase without checking for errors, then call `fetchAudiences()` regardless. If the write fails the list re-renders as if it succeeded (or without the new member), with no feedback to the user.

---

### 12. Verbose debug logging left in production code
**File:** `src/pages/DashboardPage.jsx` lines 37–60, `src/pages/NewsletterDetailPage.jsx` lines 226–249

Multiple `console.log` calls exposing auth events, user IDs, provider tokens, and full API request/response bodies. These should be removed or gated behind a `DEBUG` flag before production.

---

## P2 — Polish / Nice to Have

### 13. Forms not disabled during submit (double-submission risk)
**Files:** `src/pages/NewNewsletterPage.jsx`, `src/pages/AudiencesPage.jsx`

The newsletter creation form and the audience name form are not disabled while their async saves are in-flight. A fast double-click could create duplicate records. The button disables correctly but the input fields and form remain active.

---

### 14. No newsletter deletion from dashboard
The dashboard shows past newsletters but provides no way to delete them from that view. The only delete-adjacent action is "Reset" inside the detail page.

---

### 15. Sent newsletters are permanently locked
Once a version is marked `sent` there is no way to correct a mistake — no re-draft, no edit. For an MVP used by one person this is low risk, but worth noting.

---

### 16. No account deletion
There is no way for a user to delete their account and all associated data. This is a GDPR/privacy consideration for when the app is used by people other than the owner.

---

### 17. PublishedUpdatePage — Divider component used before definition
**File:** `src/pages/PublishedUpdatePage.jsx`

`SpotifyPublishedSection` references `<Divider />` at the top of the file, but `Divider` is defined later in the same file. This works in practice (hoisting), but is fragile and confusing.

---

### 18. Page title is generic "Life Pulse" on all pages
`index.html` sets `<title>Life Pulse</title>` which never changes. Per-page titles (e.g. "April 2026 — Life Pulse") would help with browser tab management.

---

### 19. No favicon file verified
`index.html` references `/favicon.svg` — this should be confirmed to exist in the `public/` directory. If it is missing, browsers will log a 404 on every page load.

---

### 20. Mobile: action bar buttons may overflow on small screens
The action bar in `NewsletterDetailPage` uses `flex-wrap` which handles overflow, but "Approve & Publish", "Send to X", "Preview ↗", "Regenerate Summary", and "Reset" all appearing simultaneously could be cramped on a phone screen.

---

## Summary Table

| # | Area | Severity | File |
|---|------|----------|------|
| 1 | Spotify REDIRECT_URI & CORS hardcoded to localhost | **P0** | `spotify-auth/index.ts:34,42` |
| 2 | extract-content CORS hardcoded to localhost | **P0** | `extract-content/index.ts:23` |
| 3 | No public RLS policy — recipients can't read sent newsletters | **P0** | `PublishedUpdatePage.jsx:1` |
| 4 | No newsletter delete | P1 | Dashboard / Detail page |
| 5 | No rate limiting on generate-summary | P1 | `generate-summary/index.ts:16` |
| 6 | Calendar sync error swallowed silently | P1 | `NewsletterDetailPage.jsx:313` |
| 7 | Send errors only in console, not shown to user | P1 | `NewsletterDetailPage.jsx:397` |
| 8 | ConnectSpotify/Google auth failures silent | P1 | `ConnectSpotify.jsx:24`, `ConnectGoogle.jsx:31` |
| 9 | No new-user onboarding sequence | P1 | Dashboard |
| 10 | ContentCards save has no error handling | P1 | `ContentCards.jsx` |
| 11 | AudiencesPage member add/remove errors not surfaced | P1 | `AudiencesPage.jsx` |
| 12 | Debug console.log statements in production code | P1 | `DashboardPage.jsx`, `NewsletterDetailPage.jsx` |
| 13 | Forms not disabled during submit | P2 | `NewNewsletterPage.jsx`, `AudiencesPage.jsx` |
| 14 | No newsletter delete from dashboard | P2 | `DashboardPage.jsx` |
| 15 | Sent newsletters permanently locked | P2 | `NewsletterDetailPage.jsx` |
| 16 | No account deletion | P2 | — |
| 17 | Divider used before definition in PublishedUpdatePage | P2 | `PublishedUpdatePage.jsx` |
| 18 | Static page title on all pages | P2 | `index.html` |
| 19 | `/favicon.svg` existence unverified | P2 | `public/` |
| 20 | Mobile action bar crowding | P2 | `NewsletterDetailPage.jsx` |

---

## What's in Good Shape

- All imports resolve correctly — no broken references found
- RLS enabled on all core tables (newsletters, audience_lists, audience_members, newsletter_versions, calendar_events, storage buckets)
- No API keys or secrets hardcoded in frontend code
- Auth guard on every protected page
- Edge Functions all verify the Supabase session before touching data
- Logout button present in Navbar
- Audience edit/delete fully implemented
- Newsletter Reset feature added
- Loading states present on all major async actions
- Error display for AI generation failures (regen error banner)
- Published update page renders Spotify, Radar, and Coming Up sections correctly
- Google Calendar sync, Google Photos import, and Spotify flows are architecturally complete (just blocked by the CORS/redirect issues above)
