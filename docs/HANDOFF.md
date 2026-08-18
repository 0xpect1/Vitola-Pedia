# Vitola Pedia — Engineering Handoff

Written for whoever picks this up next. Assumes no prior context on the
session that produced the current state.

**Live:** https://vitolapedia.com (GitHub Pages, `0xpect1/Vitola-Pedia`, branch `main`)
**Deploy:** push to `main`. Pages rebuilds in ~40s. Remote is SSH (`git@github.com:…`); HTTPS will prompt for a password that no longer works.

---

## 1. What this is

A static, no-build cigar encyclopedia: 1,458 cigars, 134 brands, 30 pipe
blends. Vanilla JS, no framework, no bundler. `index.html` loads ~20 scripts
in order and everything hangs off globals.

Recently gained: a live multi-user Lounge (Supabase), brand Houses pages, a
guided picker, a smoke journal, ⌘K palette, and an analytics layer.

---

## 2. Services and credentials

| Service | Status | Where configured |
|---|---|---|
| **Supabase** | **LIVE** — project `kygxntaptlnyxinchgxm` | `js/lounge-adapter.js` → `LOUNGE_CONFIG.supabase` |
| **Cloudflare Web Analytics** | **LIVE** — token `463a1d0b…` | `js/analytics.js` → `CONFIG.cloudflareToken` |
| **Cloudflare Turnstile** | Wired, **disabled** | `js/analytics.js` n/a — `LOUNGE_CONFIG.turnstileSiteKey` (null) |
| Reddit OAuth | Not set up | `LOUNGE_CONFIG.reddit` (null) |

### Supabase
- Uses the **newer `sb_publishable_…` key format**, not a legacy anon JWT. Works identically in `supabase-js` v2.
- Anonymous sign-ins are **enabled**. Schema is **applied** (`docs/lounge-schema.sql`).
- Realtime replication: confirm `lounge_posts` and `lounge_comments` are in the `supabase_realtime` publication.
- Free tier: 200 concurrent realtime connections, 50k MAU, **projects pause after ~7 days of inactivity**.

### ⚠️ Security debt
The **Turnstile secret key was pasted into a chat log** during setup. It is
not in this repo (verified by grep), but it should be **rotated in the
Cloudflare dashboard**. The sitekey is public and harmless.

Never commit the Supabase `service_role` key. It bypasses all RLS.

---

## 3. Architecture

Load order in `index.html` matters — later files wrap earlier ones.

```
js/data.js              1.9MB  const CIGARS = [...]      (source of truth)
js/pipe_tobacco_data.js        const PIPE_TOBACCOS
js/world-data.js         27KB  Natural Earth country paths for the map
js/app.js                      filters, search, render, modal, compare, routing
js/immersive.js                ember trail, humidor, COTD, tilt, burn line
js/avatars.js                  avatar marks / emoji / upload → one string
js/lounge-adapter.js           backend interface (Local + Supabase)
js/lounge.js                   Lounge UI: map, rail, feed, profiles
js/enrich.js                   modal: percentiles, size viz, similar, share
js/brand-logos.js              BRAND_LOGOS manifest + resolver
js/houses.js                   Houses index + brand pages
js/journal.js                  smoke journal + palate profile
js/icons.js                    drawn SVG icon set (replaces emoji)
js/picker.js                   guided "what should I smoke?"
js/rails.js                    the two shelves under the hero
js/analytics.js                pageviews + events, provider-agnostic
js/palette.js                  ⌘K command palette
```

CSS mirrors this: `style.css` (base) + one file per subsystem + `refine.css`
(materials pass, loaded last).

### Data rule
`js/data.js` and `data/cigars.json` **must stay in sync**. Both are 1,458
entries. Any edit to one needs the same edit to the other.

---

## 4. Gotchas — read this before touching anything

These cost real time to find. Every one is a live trap.

1. **`const CIGARS` is script-scoped, NOT on `window`.**
   `window.CIGARS` is `undefined`. Reference the bare identifier with a
   `typeof` guard. This silently broke the Lounge cigar picker.

2. **Three files chain-wrap `window.openModal`** — `immersive.js`,
   `enrich.js`, `journal.js`. Each stores the previous and calls it. If you
   add a fourth, wrap the same way and verify all four still fire
   (`scratchpad/test-hooks.js` pattern).

3. **IntersectionObserver won't re-fire while the target stays
   intersecting.** The progressive card render needs an explicit geometry
   check after each append (`fillViewport()` in `app.js`) plus a scroll
   fallback. Don't "simplify" it back to a bare observer.

4. **CSS grid `1fr` floors at min-content.** A horizontally-scrolling child
   blows the column out past the viewport. Use `minmax(0, 1fr)`. This bit
   the shelves.

5. **Turnstile never issues tokens to headless browsers** — by design. Use
   Cloudflare's test sitekey `1x00000000000000000000AA` to verify the flow;
   the real key can only be exercised in a real browser.

6. **The landing gate hides bugs in tests.** Calling `enterSite()` skips it.
   A touch-scroll entry bug survived several passes because every test
   bypassed the gate. Test the real path at least once.

7. **The Cloudflare beacon is CORS-blocked on `localhost`** — it only
   accepts the registered domain. Expect console errors locally; they are
   not failures.

8. **`switchView` is wrapped by both `houses.js` and `lounge.js`.** Order
   matters; both call through.

9. **Presence ≠ session.** `listPresence()` means "who is lit".
   `listRoom()` means "who is here". The map shows room members with a
   location; the count shows all room members.

10. **Audit the adapter against the SQL** whenever you add a table. Every
    `.from()` / `.rpc()` in `lounge-adapter.js` must exist in
    `docs/lounge-schema.sql`. `lounge_smokes` was missing once and would
    have broken live on day one.

---

## 5. Outstanding work

Ordered by my assessment of leverage. Items 1 and 2 are the ones I'd do first.

### 5.1 Moderation — **BLOCKER before promoting the Lounge**

The room is live and public with **no moderation whatsoever**. You cannot
delete another person's post, hide anything, mute, or report.

**Owner's stated policy, verbatim and non-negotiable:**
> STRICTLY no illegal activities, no CP, nothing at all in that nature is
> ever allowed.

Minimum viable implementation:

- `hidden boolean default false` on `lounge_posts`, `lounge_comments`, and the chat path; filter it out of `lounge_posts_v` / `lounge_comments_v`.
- **Owner role** — hardcode the owner's `member_id` or add an `is_admin` column; RLS policy allowing that principal to update `hidden` on any row.
- **Report button** on every post, comment and chat message → `lounge_reports` table.
- **Client-side blocklist** for the worst terms, so the most egregious content never renders even before a human sees it. This is a stopgap, not a solution.
- **Ban list** — `lounge_bans` keyed on `member_id`, checked in RLS `with check` clauses so a banned member cannot write at all.
- Chat is ephemeral (broadcast, no table) — **there is currently no way to remove a chat message after the fact.** Consider persisting chat so it can be moderated, accepting the storage cost. This is a real gap given the policy above.

**Legal note worth surfacing to the owner:** a public room with user-generated
content on a tobacco site has obligations (age gating, CSAM reporting duties in
most jurisdictions). Recommend they take advice before scaling it.

### 5.2 SEO — highest compounding value

Currently: **`sitemap.xml` contains exactly one URL.** All 1,458 cigars and
134 houses are invisible to search.

- **Generate a full sitemap** — `/#/cigar/<id>` for 1,458 cigars, `/#/house/<slug>` for 134 houses. ⚠️ **Hash fragments are not indexable.** This needs a routing decision first: either pre-render static HTML per cigar (best), or move to path-based routes with a 404-fallback SPA shim. Do not just list hash URLs; they will be ignored.
- **Per-cigar meta tags** — title, description, and `Product` + `AggregateRating` JSON-LD. The existing JSON-LD covers only 20 cigars.
- **Content is JS-rendered.** Googlebot executes JS but indexes it slowly and imperfectly. Pre-rendering 1,458 static pages at build time is the robust answer, and this repo has no build step — that's the tension to resolve.
- Long-tail targets are strong: "Padrón 1964 Anniversary Maduro review", "best cigars under $10", "<brand> cigars".

### 5.3 Per-cigar share cards (Open Graph)

Every shared link currently shows the same generic preview. Needs per-cigar
OG images. Options: generate 1,458 static images at build time, or an image
service. Pairs naturally with 5.2 since both need per-cigar HTML.

### 5.4 "Notify me when someone lights up"

Owner explicitly requested. Solves the cold-start problem — early visitors
arriving at an empty room and leaving.

- Web Push (needs a service worker + VAPID keys + a push endpoint), or
- Simpler: opt-in email via Supabase, or an in-page notification if the tab is open (`Notification` API).
- Recommend starting with the in-page/tab-open version — no infrastructure and it covers the common case.

### 5.5 Content gaps

- **520 of 1,458 cigars have no image (36%)** — the most visible quality gap. Worst: Drew Estate (32), Partagás (20), H. Upmann (18), Romeo y Julieta (18). Famous Smoke and Cigars International are Cloudflare-walled. Working sources: **Holt's** (direct fetch), **halfwheel**, **Neptune** (Puppeteer only), **Havana House CDN** (Cuban). See the user memory note on image scraping workarounds.
- **360 cigars have no buy links.**
- **87 of 134 houses have no logo.** Mostly Cuban marques run centrally by Habanos SA with no independent site, plus boutiques. Needs manual sourcing; `scripts/scrape-brand-logos.js` already exhausted the automated path. **Review any scrape before shipping** — the first pass returned 87 files of which 40 were wrong (parked-domain placeholders, Surgeon General warning labels, award badges, product shots, and the generic Habanos wordmark standing in for 13 separate marques).

### 5.6 Analytics events have nowhere to land

Events fire and are buffered locally (`VPAnalytics.recent()`) but Cloudflare
Web Analytics is **pageview-only with no JS API**. To collect them: Cloudflare
Zaraz (free, requires DNS on Cloudflare) or Plausible (~$9/mo). One config
line either way; no calling code changes.

### 5.7 Owner question, unanswered

*"What are the largest cigar Discord servers to join?"* — not researched.

---

## 6. Conventions

- **No build step.** Everything must work opening `index.html` from the filesystem. Do not introduce a bundler without a deliberate decision.
- **Escape everything person-authored** before `innerHTML`. Every module has a local `esc()`. The Lounge is now public — this is not optional.
- **Adapter pattern** — the Lounge UI never touches storage. It calls `LoungeBackend`, implemented twice (Local for solo, Supabase for live). Keep that seam.
- **Graceful degradation** — if Supabase is unreachable or the schema is missing, the adapter falls back to solo mode with a console reason rather than showing a broken "Live" room.
- **Never let a metric break the page** — analytics calls are wrapped in try/catch.

## 7. Testing

No test framework. Verification was done with Puppeteer scripts driving a
real browser, kept in the session scratchpad (not committed). The pattern is
worth keeping:

- Drive the real UI, don't call internals — bypassing `enterSite()` hid a real bug.
- Sweep viewport widths (390 → 1600) for horizontal overflow.
- Use two `browser.createBrowserContext()` instances to test genuine multi-user behaviour.
- Screenshot and **actually look** — the three-column shelf bug was visible in a screenshot that was read past. Numbers caught it; eyes didn't.
- Assert on XSS payloads (`<img src=x onerror=…>`) for any new person-authored field.

Puppeteer is in `node_modules` (untracked, gitignored).

## 8. Performance baseline

Do not regress these:

| | Value |
|---|---|
| DOM nodes on load | ~5,100 (was 64,066 before progressive render) |
| Cards in DOM initially | 60 of 1,456, +60 per scroll |
| Full re-render | ~4ms |
| JS heap | ~13MB desktop, ~10MB mobile |
| Lounge join | ~900ms |
| Horizontal page overflow | zero at every width 390–1600 |
