/**
 * Vercel Serverless CORS Proxy for Kerala AI English Coach (FreeLLMAPI Router)
 * Supports POST (chat completions) and GET (live model list discovery)
 * Strictly allowlisted to official AI provider hosts only.
 */

const ALLOWED_HOSTS = new Set([
  'integrate.api.nvidia.com',
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai'
]);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { targetUrl, method = 'POST', headers = {}, payload = null } = body;

    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'Missing targetUrl' });
    }

    const parsedUrl = new URL(targetUrl);
    if (parsedUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      return res.status(403).json({ error: 'Target host not allowed' });
    }

    const safeMethod = method === 'GET' ? 'GET' : 'POST';
    const forwardHeaders = {};
    if (safeMethod === 'POST') forwardHeaders['Content-Type'] = 'application/json';
    if (headers['Authorization']) forwardHeaders['Authorization'] = headers['Authorization'];
    if (headers['HTTP-Referer']) forwardHeaders['HTTP-Referer'] = headers['HTTP-Referer'];
    if (headers['X-Title']) forwardHeaders['X-Title'] = headers['X-Title'];

    const fetchOpts = { method: safeMethod, headers: forwardHeaders };
    if (safeMethod === 'POST' && payload !== null) {
      fetchOpts.body = JSON.stringify(payload);
    }

    const upstream = await fetch(targetUrl, fetchOpts);
    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Upstream proxy error' });
  }
};
