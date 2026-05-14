// Vercel serverless function — pull the athlete's own Instagram posts via the
// Apify "instagram-scraper" actor and store each as a `vid_<igPostId>` row in
// the `content_plan` table. The token / Supabase creds stay server-side.
//
//   POST /api/apify-sync        body: { username?, limit? }  -> { ok, runId, status }
//   GET  /api/apify-sync?runId=…                            -> { ok, status }  while running
//                                                              { ok, status:'DONE', count } when finished (and rows are upserted)
//
// Apify runs take ~30-90s, so the client starts a run then polls this endpoint.
// Everything fails soft: on any error it returns { ok:false, error } and the app
// just shows a message — nothing else breaks. No npm deps (global fetch).

const APIFY = process.env.APIFY_TOKEN;
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_ANON_KEY || '';
const ACTOR = 'apify~instagram-scraper';
const DEFAULT_USER = 'camiinthisthang';

async function sbUpsert(rows) {
  if (!SB_URL || !SB_KEY || !rows.length) return;
  const r = await fetch(SB_URL + '/rest/v1/content_plan', {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error('supabase upsert ' + r.status + ' ' + (await r.text().catch(() => '')));
}

function mapItem(it) {
  const id = it.id || it.shortCode;
  if (!id) return null;
  const productType = (it.productType || '').toLowerCase();
  let type = (it.type || '').toLowerCase();           // 'video' | 'image' | 'sidecar'
  if (type === 'video') type = (productType === 'clips') ? 'reel' : 'video';
  else if (type === 'sidecar') type = 'carousel';
  const shortCode = it.shortCode || null;
  return {
    igPostId: String(id),
    shortCode,
    url: it.url || (shortCode ? 'https://www.instagram.com/p/' + shortCode + '/' : null),
    type: type || 'post',
    caption: (it.caption || '').slice(0, 2200),
    thumbnailUrl: it.displayUrl || (Array.isArray(it.images) && it.images[0]) || null,
    videoUrl: it.videoUrl || null,
    postedAt: it.timestamp || null,
    views: Number(it.videoViewCount ?? it.videoPlayCount ?? it.igPlayCount ?? 0) || 0,
    likes: Number(it.likesCount ?? 0) || 0,
    comments: Number(it.commentsCount ?? 0) || 0,
    syncedAt: new Date().toISOString()
  };
}

module.exports = async function handler(req, res) {
  try {
    if (!APIFY) { res.status(200).json({ ok: false, error: 'APIFY_TOKEN not set in Vercel' }); return; }

    // ── start a run ──────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const username = ((body && body.username) || DEFAULT_USER).replace(/[^A-Za-z0-9._]/g, '');
      let limit = parseInt((body && body.limit) || 100, 10); if (!Number.isFinite(limit)) limit = 100;
      limit = Math.min(Math.max(limit, 6), 250);
      const r = await fetch('https://api.apify.com/v2/acts/' + ACTOR + '/runs?token=' + encodeURIComponent(APIFY), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: ['https://www.instagram.com/' + username + '/'],
          resultsType: 'posts', resultsLimit: limit, addParentData: false
        })
      });
      if (!r.ok) { const t = await r.text().catch(() => ''); res.status(200).json({ ok: false, error: 'apify start ' + r.status, detail: t.slice(0, 400) }); return; }
      const run = await r.json();
      res.status(200).json({ ok: true, runId: run && run.data && run.data.id, status: run && run.data && run.data.status, username });
      return;
    }

    // ── poll a run; ingest on success ────────────────────────────────────────
    if (req.method === 'GET') {
      const runId = (req.query && req.query.runId) || '';
      if (!runId) { res.status(400).json({ ok: false, error: 'runId required' }); return; }
      const sres = await fetch('https://api.apify.com/v2/actor-runs/' + encodeURIComponent(runId) + '?token=' + encodeURIComponent(APIFY));
      if (!sres.ok) { res.status(200).json({ ok: false, error: 'apify status ' + sres.status }); return; }
      const st = (await sres.json()).data || {};
      if (st.status === 'READY' || st.status === 'RUNNING') { res.status(200).json({ ok: true, status: st.status }); return; }
      if (st.status !== 'SUCCEEDED') { res.status(200).json({ ok: false, status: st.status || 'UNKNOWN', error: 'apify run ' + st.status }); return; }

      const dsId = st.defaultDatasetId;
      const ires = await fetch('https://api.apify.com/v2/datasets/' + encodeURIComponent(dsId) + '/items?clean=true&format=json&token=' + encodeURIComponent(APIFY));
      const items = await ires.json();
      const vids = (Array.isArray(items) ? items : []).map(mapItem).filter(Boolean);
      const now = new Date().toISOString();
      const rows = vids.map(v => ({ key: 'vid_' + v.igPostId, value: JSON.stringify(v), updated_at: v.syncedAt }));
      rows.push({ key: 'vid_meta', value: JSON.stringify({ lastSyncAt: now, count: vids.length, username: (req.query && req.query.username) || DEFAULT_USER, costUsd: (st.usageTotalUsd != null ? st.usageTotalUsd : null) }), updated_at: now });
      await sbUpsert(rows);
      res.status(200).json({ ok: true, status: 'DONE', count: vids.length, costUsd: st.usageTotalUsd != null ? st.usageTotalUsd : null });
      return;
    }

    res.status(405).json({ ok: false, error: 'GET or POST only' });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'sync failed', detail: String(e).slice(0, 500) });
  }
};
module.exports.config = { maxDuration: 30 };
