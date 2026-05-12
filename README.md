# Cami Padel — Content Strategy Planner

A single-page content planner (weekly + monthly calendar, ideas bank, per-slot
script editor). Plain HTML/CSS/JS — no framework, no bundler, no app
dependencies. Data is stored in **Supabase** so two people can use it at the
same time, with **localStorage** as an always-available fallback/cache.

## How storage works

- `localStorage` is the fast, synchronous local cache the UI reads from.
- Every write is mirrored to Supabase (debounced + batched). If a write fails,
  the data is already safe locally and is retried automatically.
- On load, every 20s, and on window focus, the app pulls the whole table from
  Supabase into localStorage so both collaborators see each other's changes.
- If the Supabase env vars aren't set, or Supabase is unreachable, the app keeps
  working in localStorage-only mode. The badge in the planner shows
  **Cloud sync on** / **Reconnecting…** / **Local only** accordingly.

Keys mirrored to the `content_plan` table:

| key pattern        | value                                              |
|--------------------|----------------------------------------------------|
| `padel_ideas`      | JSON array of `{ text, id }`                        |
| `w_YYYY-MM-DD`     | JSON object of week-slot ideas (`mon_0`, `tue_1`, …) keyed by the Monday of that week |
| `sc_YYYY-MM-DD_N`  | script text for the slot `N` on that date           |

## Project layout

```
public/index.html      the app (with __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ placeholders)
build.js               copies public/ -> dist/ and injects the Supabase creds
vercel.json            build command + static output dir (dist/)
supabase/schema.sql    run once in the Supabase SQL editor
.env.example           copy to .env for local builds
```

`build.js` reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the environment
(that's how Vercel passes the values you set in the dashboard) and falls back to
a local `.env` file if present.

## 1. Set up Supabase

1. Create a project at <https://supabase.com> (free tier is fine).
2. In the project, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. Open **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **Project API keys → `anon` / `public`** → `SUPABASE_ANON_KEY`

(The anon key is meant to be public; Row Level Security on `content_plan` is the
boundary, and the policy is deliberately open because this is a private 2-person
tool with no sensitive data.)

## 2. Deploy to Vercel

```bash
cd content-schedule
git init && git add -A && git commit -m "Padel content planner"
npx vercel        # first run: link/create the project, accept the defaults
npx vercel env add SUPABASE_URL          # paste the Project URL,  pick: Production, Preview, Development
npx vercel env add SUPABASE_ANON_KEY     # paste the anon key,     pick: Production, Preview, Development
npx vercel --prod                        # deploy with the env vars baked in
```

Vercel will auto-detect the config in `vercel.json` (build command `node
build.js`, output directory `dist`). After the env vars are set you must run
`vercel --prod` again (or trigger a redeploy) so the build picks them up.

Alternatively, in the Vercel dashboard: **Project → Settings → Environment
Variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` (all environments), then
**Deployments → … → Redeploy**.

Once deployed, the URL Vercel gives you is the shared app — open it on as many
devices as you want.

## 3. Local development

```bash
cp .env.example .env     # fill in real values (optional — leave blank for localStorage-only)
npm run build            # writes dist/
npm run dev              # builds, then serves dist/ at http://localhost:4000
```

`public/index.html` always keeps the placeholders; only `dist/` (git-ignored)
ever contains the real credentials.
