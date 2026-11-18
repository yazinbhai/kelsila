/**
 * Optional Server-Side FreeLLMAPI Router (/api/server-chat)
 * If you set GROQ_API_KEYS, GOOGLE_API_KEYS, NVIDIA_API_KEYS, or OPENROUTER_API_KEYS
 * (comma-separated for multiple keys per provider) in Vercel Project Settings -> Environment Variables,
 * EVERY phone, tablet, and school PC gets full AI power automatically without entering keys per device!
 */

function parseKeys(envVar) {
  return String(envVar || '')
    .split(/[,\n\r]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

function getServerPools() {
  return {
    groq: {
      name: 'Groq Cloud (Server)',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      keys: [...parseKeys(process.env.GROQ_API_KEYS), ...parseKeys(process.env.GROQ_API_KEY)]
    },
    google: {
      name: 'Google AI Studio (Server)',
      model: process.env.GOOGLE_MODEL || 'gemini-3.5-flash-lite',
      keys: [...parseKeys(process.env.GOOGLE_API_KEYS), ...parseKeys(process.env.GOOGLE_API_KEY), ...parseKeys(process.env.GEMINI_API_KEY)]
    },
    nvidia: {
      name: 'NVIDIA NIM (Server)',
      model: process.env.NVIDIA_MODEL || 'google/gemma-4-31b-it',
      keys: [...parseKeys(process.env.NVIDIA_API_KEYS), ...parseKeys(process.env.NVIDIA_API_KEY)]
    },
    openrouter: {
      name: 'OpenRouter (Server)',
      model: process.env.OPENROUTER_MODEL || 'openrouter/free',
      keys: [...parseKeys(process.env.OPENROUTER_API_KEYS), ...parseKeys(process.env.OPENROUTER_API_KEY)]
    }
  };
}

let rrCounter = 0;

module.exports = async function handler(req, res) {
  const pools = getServerPools();
  const totalKeys = Object.values(pools).reduce((sum, p) => sum + p.keys.length, 0);

  if (req.method === 'GET') {
    return res.status(200).json({
      configured: totalKeys > 0,
      totalKeys,
      providers: Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, v.keys.length]))
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (totalKeys === 0) {
    return res.status(404).json({ error: 'No server-side environment keys configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { messages = [], temperature = 0.7, maxTokens = 700 } = body;

  const order = ['groq', 'google', 'nvidia', 'openrouter'];
  const errors = [];

  for (const pid of order) {
    const pool = pools[pid];
    if (!pool.keys.length) continue;

    const startIdx = rrCounter % pool.keys.length;
    rrCounter++;

    for (let offset = 0; offset < pool.keys.length; offset++) {
      const apiKey = pool.keys[(startIdx + offset) % pool.keys.length];
      const t0 = Date.now();
      try {
        let content = '';
        if (pid === 'google') {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(pool.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const sys = messages.find(m => m.role === 'system');
          const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));
          const payload = {
            contents: chatMsgs,
            generationConfig: { temperature, maxOutputTokens: maxTokens }
          };
          if (sys) payload.systemInstruction = { parts: [{ text: sys.content }] };
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const d = await r.json();
          const parts = d?.candidates?.[0]?.content?.parts || [];
          content = parts.filter(p => !p.thought && p.text).map(p => p.text).join('').trim()
                 || parts.map(p => p.text || '').join('').trim();
        } else {
          const endpoints = {
            groq: 'https://api.groq.com/openai/v1/chat/completions',
            nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
            openrouter: 'https://openrouter.ai/api/v1/chat/completions'
          };
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          };
          if (pid === 'openrouter') {
            headers['HTTP-Referer'] = 'https://kelsila.vercel.app';
            headers['X-Title'] = 'Kerala AI English Coach Statue';
          }
          const r = await fetch(endpoints[pid], {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: pool.model, messages, temperature, max_tokens: maxTokens })
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const d = await r.json();
          const msg = d?.choices?.[0]?.message || {};
          content = (msg.content || msg.reasoning_content || '').trim();
        }

        if (!content) throw new Error('Empty response');

        return res.status(200).json({
          content,
          providerId: pid,
          providerName: pool.name,
          model: pool.model,
          keyLabel: `Server Env #${((startIdx + offset) % pool.keys.length) + 1}`,
          latencyMs: Date.now() - t0
        });
      } catch (e) {
        errors.push(`${pid}: ${e.message}`);
      }
    }
  }

  return res.status(502).json({ error: 'All server keys failed: ' + errors.join(' | ') });
};
