/**
 * Vercel Serverless MP3 Text-to-Speech Endpoint (/api/tts)
 * Returns real audio/mpeg Indian English (en-IN) audio so HTML5 <audio> speaks
 * reliably on Android, iOS, Chrome, and Edge with zero speechSynthesis silent bugs.
 */

function splitTextForTts(text, maxLen = 175) {
  const clean = String(text || '')
    .replace(/[*_#`~]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];

  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) || [clean];
  const chunks = [];
  let current = '';

  for (const s of sentences) {
    if ((current + s).length > maxLen && current.trim()) {
      chunks.push(current.trim());
      current = s;
    } else if (s.length > maxLen) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      const words = s.split(' ');
      let buf = '';
      for (const w of words) {
        if ((buf + ' ' + w).trim().length > maxLen && buf.trim()) {
          chunks.push(buf.trim());
          buf = w;
        } else {
          buf = (buf + ' ' + w).trim();
        }
      }
      if (buf.trim()) current = buf + ' ';
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 8);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  try {
    let text = '';
    let lang = 'en-IN';

    if (req.method === 'GET') {
      text = req.query?.text || '';
      lang = req.query?.lang || 'en-IN';
    } else if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      text = body.text || '';
      lang = body.lang || 'en-IN';
    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const chunks = splitTextForTts(text);
    if (!chunks.length) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    const safeLang = /^[a-z]{2}(-[A-Z]{2})?$/.test(lang) ? lang : 'en-IN';
    const audioBuffers = [];

    for (const chunk of chunks) {
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(safeLang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
      const upstream = await fetch(ttsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
        }
      });
      if (!upstream.ok) {
        return res.status(502).json({ error: `TTS upstream HTTP ${upstream.status}` });
      }
      const arrBuf = await upstream.arrayBuffer();
      audioBuffers.push(Buffer.from(arrBuf));
    }

    const merged = Buffer.concat(audioBuffers);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(merged);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'TTS generation failed' });
  }
};
