# CLAUDE.md — Padel Content Schedule

Working notes + roadmap for the content-planning app. Read this before changing anything.

## What this app is (current state)

A single-page content planner for a padel athlete (Cami) and her video editors.

- **Frontend:** one static file, `public/index.html` — vanilla HTML/CSS/JS. **No framework, no bundler, no npm dependencies in the app.** Keep it that way for the UI.
- **Storage:** Supabase, via the REST API called directly from the browser. One key/value table:
  `content_plan(key text primary key, value text not null, updated_at timestamptz)`. RLS is on with a wide-open policy (private 2–3 person tool, no sensitive data). See `supabase/schema.sql`.
  - `localStorage` is a synchronous local cache + offline fallback. Every write mirrors to Supabase (debounced/batched); on load + every 20s + on focus the whole table is pulled back down. Badge in the Planner shows `Cloud sync on` / `Reconnecting…` / `Local only`.
- **Build/deploy:** `build.js` copies `public/` → `dist/` and replaces `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` from env vars (Vercel) or a local `.env`. `vercel.json` sets `buildCommand: node build.js`, `outputDirectory: dist`. Pushing to `main` on GitHub (`camiinthisthang/padel-content-schedule`, public) auto-deploys to Vercel project `content-schedule`. Live at https://content-schedule-lovat.vercel.app.

### Storage key patterns (localStorage keys ⇄ `content_plan.key`)

| key | value |
|---|---|
| `padel_ideas` | JSON array of idea objects (see below) |
| `w_YYYY-MM-DD` | JSON object of week-slot idea text, keyed by the **Monday** of that week; slot keys like `mon_0`, `tue_1`, plus optional `_trip: true` |
| `sc_YYYY-MM-DD_N` | script text for slot `N` (0/1) on that date |

**Idea object** (in `padel_ideas`): `{ text: string, id: number }` today. New optional fields get added by features below — always keep old objects (missing the new field) working.

### Things to know before editing `index.html`
- All reads are synchronous off `localStorage` (`lw`, `li`, `getScript`). All writes go through `lset(key,value)` / `ldel(key)`, which write localStorage **and** push to Supabase. Never call `localStorage.setItem` directly for app data — use `lset`.
- Renders rebuild DOM via `innerHTML`; the periodic sync skips re-rendering while a `<textarea>`/`<input>` is focused so it doesn't yank the cursor.
- `SCH` array defines the weekly template (6 active days, 2 slots/day). `currentView` is `'week'` or `'month'`.
- If the Supabase env vars aren't injected, the app silently runs localStorage-only. Don't break that.
- `git config` on this machine is now `Camila Ramos <camirgarzon@gmail.com>` globally — commits must use that email or Vercel git-deploys get blocked.

### Architecture note for the AI features below
Features 2 and 3 need server-side work (API keys must not ship to the browser). Add a `/api` folder of **Vercel Serverless Functions** (Node, `export default function handler(req,res)`) — this does **not** violate the "no framework" rule, which is about the frontend. Update `vercel.json` accordingly (it already builds fine; Vercel auto-detects `/api/*.js` as functions even with a custom `buildCommand` — verify this, or add a `functions` config). New Supabase tables are fine alongside the k/v table; add them to `supabase/schema.sql`.

---

## Roadmap

Build order: **Feature 1 → Feature 4 polish → Feature 2 → Feature 3.** Each must leave the app fully working and deployable.

### Feature 1 — Inspiration video link on every idea  ✅ DONE (see CHANGELOG below if present)
**Goal:** each video idea can optionally link to a reference/inspo video URL so Cami and the editors picture the same thing.

**Data model:**
- Ideas bank: idea object gains optional `inspo?: string` (a URL). → `{ text, id, inspo }`.
- Calendar slots: a parallel k/v key `insp_YYYY-MM-DD_N` holds the inspo URL for that slot (mirrors how `sc_` works for scripts). Don't change the slot-text storage shape.

**UX:**
- On each idea chip in the ideas bank: a small 🔗 affordance. Empty → click to paste a URL (prompt or inline input). Set → shows as a tiny "inspo ↗" link that opens in a new tab; small ✕ to clear.
- On each calendar slot (week + month views): same small 🔗 button next to the existing ✍️/📝 script button; colored when set; opens the URL in a new tab on click, or a prompt to set/edit.
- Dragging an idea onto a calendar slot copies the idea **text** as today; if the idea has an `inspo`, also copy it into that slot's `insp_` key.
- Validate lightly: accept anything starting `http`, trim whitespace; if it's an Instagram/TikTok/YouTube URL, that's the common case but don't hard-restrict.

**Risk:** low. No new deps, no schema change, backward compatible.

### Feature 4 — Scripts attached to calendar dates  ⚠️ MOSTLY ALREADY EXISTS
The per-slot script modal already exists: the ✍️ / 📝 button on each week/month slot opens a modal showing the idea + a big script textarea, autosaves to `sc_YYYY-MM-DD_N`. Both owner and editor see the same thing (no roles in this app). So the core ask is **done**.

**Polish to consider (low priority, do if time):**
- Make the script button more discoverable — slightly larger, or a "Script" text label on hover.
- Show a tiny "✓ script" tag on slots that have one (currently only the button icon changes color).
- Optional: a per-script meta line — `{ updatedAt, by }` — but "by" requires some notion of who's using the app; skip unless a `?role=editor` style switch is added.
- Optional: a "this week's scripts" list view so an editor sees everything to write in one place.
Don't over-build this; it works.

### Feature 2 — Spanish for the editors
**Goal:** the editors mostly read Spanish. Every reel idea should be readable in Spanish for them, without making Cami (who types some in English, some already in Spanish) do double work.

**Key facts:**
- Some ideas are **already in Spanish** (e.g. lots in the hardcoded "Pillars" section; and Cami types Spanish hooks). Don't "translate" those — detect and leave them.
- The hardcoded strategy content (Pillars, Phase plan) is mixed ES/EN already and is reference text — leave it.

**Approach (recommended):**
1. **Language detection (client, heuristic, no API):** score text for Spanish vs English using ñ/¿/¡/Spanish accent patterns + stopword lists (`el la los las de que en un una por para con mi su es está cómo qué` vs `the a an of to in for with my your how what`). Short reel-idea strings → this is plenty accurate. Expose `detectLang(text) -> 'es' | 'en'`.
2. **Translation, English → Spanish:** via a serverless function `/api/translate` so the API key stays server-side. Pick one provider:
   - **Anthropic (Claude)** — best quality, the org already uses Claude. Env: `ANTHROPIC_API_KEY`. Use `claude-haiku-4-5` for cost; system prompt: "Translate this short social-media video idea from English to natural, casual Latin-American Spanish. Keep it punchy. Return only the translation." Batch multiple ideas in one call.
   - DeepL (`DEEPL_API_KEY`, free 500k chars/mo) or Google Translate (needs billing) are alternatives — less context-aware for slang.
3. **Caching:** store the Spanish version on the idea object: `{ text, id, inspo, es }`. `es` is filled lazily (when the editor view is toggled, or via a "Traducir todo" button) and pushed to Supabase so the editor doesn't wait and we don't re-pay. When `text` is edited, clear `es`. If `detectLang(text)==='es'`, set `es = text` immediately (no API call).
   - For calendar-slot ideas (plain strings, no object): translate on demand and cache under `tr_<sha256(text).slice(0,16)>` → Spanish, shared across slots with the same text. Or accept no caching there for v1.
4. **UX:** a global toggle near the top — `🌐 EN | ES`. In ES mode, every idea/slot renders its Spanish version (auto-translating EN ones, with a subtle "traduciendo…" state). Optionally remember the choice in `localStorage` (`ui_lang`) — the editor sets it once. The original text stays the source of truth; ES is a derived/cached view. Maybe show the original in a tooltip.

**Risk:** medium. Needs `ANTHROPIC_API_KEY` (or other) added to Vercel env vars. Build the function + UI so it's dormant until the key is set (mirror how Supabase degrades gracefully). Watch cost — cache aggressively, batch, use Haiku.

### Feature 3 — Apify pull + Gemini video analysis → performance insights & repurposing
**Goal:** pull Cami's own posted videos, have an AI actually watch them, figure out which performed best and which content pillar each belongs to, suggest new videos that reuse what made the winners work, and flag videos worth repurposing ~40 days after their original post date.

**Pieces:**

1. **Ingest (Apify):** serverless `/api/sync/account` (and a Vercel Cron, e.g. daily) — `apify/instagram-scraper`, `directUrls: ['https://www.instagram.com/<handle>/']`, `resultsType: 'posts'`, `resultsLimit: 50`. Env: `APIFY_TOKEN`, and the IG handle (store in `content_plan` under key `ig_username`, or a new `settings` table). Map fields: `id`→ig_post_id, `shortCode`, `url`, `type`/`productType` (clips ⇒ reel), `caption`, `displayUrl`→thumbnail, `timestamp`→posted_at, `videoViewCount ?? videoPlayCount`→views, `likesCount`, `commentsCount`, and the video file URL (`videoUrl`) for analysis. Cost guard: log `run.usageTotalUsd`, fail loud over ~$1/run.

2. **New Supabase tables** (add to `supabase/schema.sql`, keep the k/v table too):
   - `videos(id, ig_post_id unique, ig_url, shortcode, post_type, caption, thumbnail_url, video_url, posted_at, view_count, like_count, comment_count, last_synced_at)`
   - `video_metrics(id, video_id fk, view_count, like_count, comment_count, captured_at)` — daily snapshots so "best performing" can use a stable number and we can see growth curves.
   - `video_analysis(id, video_id fk unique, pillar text, pillar_confidence, hook_text, hook_type, format text, summary text, what_worked jsonb, suggested_followups jsonb, repurpose_formats jsonb, model text, analyzed_at)`
   - Same open RLS policy as `content_plan`.

3. **Analyze (Gemini):** serverless `/api/analyze/video?id=...` (or batch) — Google Gemini multimodal can take a video. Use the **Gemini Files API** to upload the video (download it from Apify's `videoUrl` first, server-side), then call `gemini-2.x-flash` (or `-pro` for the deep ones) with a structured prompt asking it to: describe what happens shot by shot, identify the hook (first 1–3s) and hook type, classify into one of the 4 pillars — **The Journey / Padel Culture / Athlete Era / Girlie Lifestyle** (definitions are in the hardcoded "Pillars" section of `index.html` — feed those in), say in plain terms what made it work (or not), propose 3–5 concrete new video ideas that reuse the same winning element, and list which of the standard repurpose formats fit (Carousel, Split-screen before/after, Ranking countdown, Rating 1–10, Tutorial talking-to-camera, plain repost). Return JSON; store in `video_analysis`. Env: `GOOGLE_API_KEY` (a.k.a. `GEMINI_API_KEY`). Respect rate/size limits; cap which videos get the expensive `-pro` pass (e.g. only the top N by views).

4. **"Best performing" + pillar rollup:** compute per video a simple performance score (views, with like/comment ratio as a tiebreaker; normalize within post type so reels aren't compared to images). Surface: top videos overall, top per pillar, and which pillars over/under-index. This is just queries over `videos` + `video_metrics`.

5. **Repurpose radar:** a list of videos where `now - posted_at` is roughly **35–45 days** AND the video out-performed its post-type median — for each, show the `repurpose_formats` from its analysis and a one-click "add to Ideas bank as a repurpose" (creates an idea like `Repurpose: <caption excerpt> → <format>` with `inspo` set to the original IG URL). Optionally a Vercel Cron that, once a video enters the window, auto-creates the idea (status implied by it being a fresh idea in the bank).

6. **UI:** a new section/tab in `index.html` — e.g. **"Performance & Repurposing"**:
   - KPIs (DM-mono style numbers): views last 30d, reels last 30d, avg views/reel, best performer.
   - Table of synced videos: thumbnail · caption (truncated) · posted date · views · pillar (color chip) · "analyze" / "view analysis".
   - Click a video → drawer with the Gemini analysis: summary, what worked, suggested follow-ups (each with "→ add to Ideas bank"), repurpose formats.
   - "Repurpose radar" panel: the 35–45-day winners.
   - "Sync now" + "Analyze new" buttons (manual triggers for the cron routes), last-sync timestamp.

**Auth on the new routes:** they hit Apify/Gemini (cost) — require either a valid session... there's no session here, so: require a header `Authorization: Bearer ${CRON_SECRET}` for the cron-invoked routes, and for the manual buttons either accept the same secret embedded at build time (acceptable for a private tool) or just leave them open since it's a low-traffic private app — decide with Cami. Add `CRON_SECRET` to env.

**Risk:** high — biggest piece, new infra, two new paid APIs, video downloads. Build it incrementally: (a) Apify ingest + `videos` table + a basic performance table first (independently useful), (b) then Gemini analysis, (c) then repurpose radar. Needs from Cami: `APIFY_TOKEN`, her IG handle, `GOOGLE_API_KEY`, `CRON_SECRET`.

---

## Open questions for Cami (answer when you wake up — none of these block Feature 1)
1. **Translation provider for Feature 2** — Anthropic (recommended, you already use Claude), DeepL, or Google? And do you have/will you add the API key to Vercel?
2. **Instagram handle** for the Apify pull, and do you have an `APIFY_TOKEN`? (You use Apify in the Editor Hub project — same token works.)
3. **Gemini key** — do you have a Google AI Studio / `GOOGLE_API_KEY`? Budget ceiling for video analysis (it can add up)?
4. Should the AI features write straight into the **Ideas bank** (suggested follow-ups, repurpose ideas appear as new idea chips), or land in a separate "AI suggestions" holding area you approve from? (Recommend: separate holding area, you promote the good ones.)
5. Spanish for the editors — auto-translate on a global `EN|ES` toggle (recommended), or show ES underneath every EN idea always?

## Required env vars (set in Vercel → Settings → Environment Variables)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — already set ✅
- `ANTHROPIC_API_KEY` — Feature 2 (if Anthropic chosen) — not set yet
- `APIFY_TOKEN` — Feature 3 — not set yet
- `GOOGLE_API_KEY` (Gemini) — Feature 3 — not set yet
- `CRON_SECRET` — Feature 3 cron routes — not set yet

## Conventions
- Money/counts shown in a mono font, accent color for the headline number (match the existing aesthetic — neutral light theme, pillar colors `--j/--pc/--ae/--gl`).
- Don't hardcode the IG handle or any tunable — read from `content_plan` / a `settings` table.
- Keep the frontend dependency-free; server stuff lives in `/api`.
- Every change: commit with the `camirgarzon@gmail.com` identity, push to `main`, confirm the Vercel deploy goes green.
