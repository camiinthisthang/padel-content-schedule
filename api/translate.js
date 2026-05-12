// Vercel serverless function — translate short reel-idea strings EN -> ES with
// Claude Haiku. The Anthropic key stays server-side (ANTHROPIC_API_KEY env var).
//
//   POST /api/translate   body: { "texts": ["...", "..."] }
//   -> { "translations": ["...", "..."] }   (same order, same length)
//
// If the key isn't set or Anthropic errors, returns { translations: null } so
// the frontend can just keep showing English. No npm deps — uses global fetch.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(200).json({ translations: null, note: 'ANTHROPIC_API_KEY not set' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  let texts = body && Array.isArray(body.texts) ? body.texts : null;
  if (!texts || !texts.length) { res.status(400).json({ error: 'body must be { texts: string[] }' }); return; }
  texts = texts.slice(0, 80).map(t => String(t == null ? '' : t).slice(0, 600));

  const numbered = texts.map((t, i) => `${i + 1}. ${t.replace(/\s+/g, ' ').trim()}`).join('\n');
  const system =
    'You translate short social-media video ideas / hooks from English into natural, casual Latin-American Spanish — the way a content creator would actually say it, not stiff textbook Spanish. Keep them punchy and roughly the same length. Keep names, @handles, #hashtags, and numbers/$ amounts exactly as they are. If an item is already in Spanish, return it unchanged. Output ONLY a JSON array of strings — one element per input item, in the same order — with no markdown, no keys, no commentary.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: `Translate these ${texts.length} item(s):\n\n${numbered}` }]
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      res.status(200).json({ translations: null, error: 'anthropic ' + r.status, detail: detail.slice(0, 400) });
      return;
    }

    const data = await r.json();
    const txt = (data.content || []).map(b => (b && b.text) || '').join('').trim();
    let arr = null;
    try { arr = JSON.parse(txt); }
    catch {
      const m = txt.match(/\[[\s\S]*\]/);
      if (m) { try { arr = JSON.parse(m[0]); } catch {} }
    }
    if (!Array.isArray(arr)) { res.status(200).json({ translations: null, error: 'unparseable response', raw: txt.slice(0, 400) }); return; }

    const translations = texts.map((t, i) => {
      const v = arr[i];
      return (typeof v === 'string' && v.trim()) ? v.trim() : t;
    });
    res.status(200).json({ translations });
  } catch (e) {
    res.status(200).json({ translations: null, error: 'request failed', detail: String(e).slice(0, 400) });
  }
}
