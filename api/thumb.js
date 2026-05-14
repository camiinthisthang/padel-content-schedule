// Vercel serverless function — proxy Instagram CDN images so they actually load.
// instagram's scontent.*.cdninstagram.com images don't reliably hotlink from a
// third-party site, but a server-side fetch works fine. Restricted to IG CDN
// hosts so it's not an open proxy.
//
//   GET /api/thumb?u=<encoded cdninstagram.com image url>

module.exports = async function handler(req, res) {
  const u = req.query && req.query.u;
  if (!u || !/^https:\/\/[a-z0-9.\-]*cdninstagram\.com\//i.test(u)) {
    res.status(400).send('bad or disallowed url');
    return;
  }
  try {
    const r = await fetch(u, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
    });
    if (!r.ok) { res.status(r.status).send('upstream ' + r.status); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=43200, s-maxage=86400, stale-while-revalidate=86400');
    res.status(200).end(buf);
  } catch (e) {
    res.status(502).send('proxy error');
  }
};
module.exports.config = { maxDuration: 15 };
