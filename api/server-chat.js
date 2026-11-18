/**
 * Global Server-Side FreeLLMAPI Router (/api/server-chat)
 * Automatically reads API keys & routing strategy from:
 *   1. Upstash Redis Cloud DB (saved via /admin with passkey 8590584541)
 *   2. Vercel Environment Variables (GROQ_API_KEYS, GOOGLE_API_KEYS, NVIDIA_API_KEYS, OPENROUTER_API_KEYS)
 *
 * Powers EVERY student device worldwide over the internet without exposing any API keys to browsers!
 */

const store = require('./_store.js');

let rrCounter = 0;

async function buildServerAttemptChain() {
  const cloudDbConnected = store.isCloudDbConfigured();
  const cloudCfg = cloudDbConnected ? await store.getCloudConfig() : null;
  const envKeys = store.getEnvProviderKeys();
  const now = Date.now();

  const strategy = (cloudCfg && cloudCfg.strategy) || 'auto:balanced';
  const pinned = (cloudCfg && cloudCfg.pinnedProvider) || 'auto';
  const baseOrder = [...(store.STRATEGY_ORDER[strategy] || store.STRATEGY_ORDER['auto:balanced'])];

  let providerOrder = baseOrder;
  if (pinned !== 'auto' && store.DEFAULT_MODELS[pinned]) {
    providerOrder = [pinned, ...baseOrder.filter(p => p !== pinned)];
  } else if (strategy === 'round-robin') {
    const start = rrCounter % baseOrder.length;
    providerOrder = [...baseOrder.slice(start), ...baseOrder.slice(0, start)];
  }

  const attempts = [];
  const coolingAttempts = [];
  const providerCounts = { groq: 0, google: 0, nvidia: 0, openrouter: 0 };

  for (const pid of providerOrder) {
    const pCfg = cloudCfg && cloudCfg.providers ? cloudCfg.providers[pid] : null;
    if (pCfg && pCfg.enabled === false) continue;

    const model = (pCfg && pCfg.model) || process.env[`${pid.toUpperCase()}_MODEL`] || store.DEFAULT_MODELS[pid];
    const combinedKeys = [];

    // 1. Keys saved from /admin in Cloud Redis
    if (pCfg && Array.isArray(pCfg.keys)) {
      pCfg.keys
        .filter(k => k.enabled !== false && k.key)
        .forEach((k, idx) => {
          combinedKeys.push({
            key: k.key,
            label: k.label || `${store.PROVIDER_NAMES[pid]} #${idx + 1}`,
            cooldownUntil: k.cooldownUntil || 0
          });
        });
    }

    // 2. Keys from Vercel Environment Variables
    (envKeys[pid] || []).forEach((k, idx) => {
      if (!combinedKeys.some(x => x.key === k)) {
        combinedKeys.push({
          key: k,
          label: `Env #${idx + 1}`,
          cooldownUntil: 0
        });
      }
    });

    providerCounts[pid] = combinedKeys.length;
    if (!combinedKeys.length) continue;

    const startKey = rrCounter % combinedKeys.length;
    const rotated = [...combinedKeys.slice(startKey), ...combinedKeys.slice(0, startKey)];

    for (const item of rotated) {
      const entry = { providerId: pid, model, apiKey: item.key, label: item.label };
      if (item.cooldownUntil && item.cooldownUntil > now) {
        coolingAttempts.push(entry);
      } else {
        attempts.push(entry);
      }
    }
  }

  rrCounter++;
  const totalKeys = Object.values(providerCounts).reduce((a, b) => a + b, 0);
  return {
    cloudDbConnected,
    totalKeys,
    providerCounts,
    source: cloudCfg && store.countEnabledKeysInConfig(cloudCfg) > 0 ? 'cloud-redis' : (totalKeys > 0 ? 'vercel-env' : 'none'),
    chain: [...attempts, ...coolingAttempts]
  };
}

async function callUpstream({ providerId, model, apiKey, messages, temperature, maxTokens, jsonMode }) {
  const t0 = Date.now();
  let content = '';

  if (providerId === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const sys = messages.find(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const payload = {
      contents: chatMsgs,
      generationConfig: { temperature, maxOutputTokens: Math.max(maxTokens, 256) }
    };
    if (sys) payload.systemInstruction = { parts: [{ text: sys.content }] };
    if (jsonMode) payload.generationConfig.responseMimeType = 'application/json';

    let r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.status === 400 && payload.generationConfig.responseMimeType) {
      delete payload.generationConfig.responseMimeType;
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 140)}`);
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
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://kelsila.vercel.app';
      headers['X-Title'] = 'Kerala AI English Coach Statue';
    }
    const payload = {
      model,
      messages,
      temperature,
      max_tokens: Math.max(maxTokens, 256)
    };
    if (jsonMode && providerId === 'groq') payload.response_format = { type: 'json_object' };

    let r = await fetch(endpoints[providerId], {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (r.status === 400 && payload.response_format) {
      delete payload.response_format;
      r = await fetch(endpoints[providerId], {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 140)}`);
    const d = await r.json();
    const msg = d?.choices?.[0]?.message || {};
    content = (msg.content || msg.reasoning_content || msg.reasoning || '').trim();
  }

  if (!content) throw new Error('Empty response content');
  return { content, latencyMs: Date.now() - t0 };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const info = await buildServerAttemptChain();

  if (req.method === 'GET') {
    return res.status(200).json({
      configured: info.totalKeys > 0,
      totalKeys: info.totalKeys,
      cloudDbConnected: info.cloudDbConnected,
      source: info.source,
      providers: info.providerCounts
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!info.chain.length) {
    return res.status(404).json({ error: 'No global server keys configured yet' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { messages = [], temperature = 0.7, maxTokens = 700, jsonMode = true } = body;
  const errors = [];

  for (const attempt of info.chain) {
    try {
      const result = await callUpstream({
        providerId: attempt.providerId,
        model: attempt.model,
        apiKey: attempt.apiKey,
        messages,
        temperature,
        maxTokens,
        jsonMode
      });

      return res.status(200).json({
        content: result.content,
        providerId: attempt.providerId,
        providerName: `${store.PROVIDER_NAMES[attempt.providerId]} (Cloud)`,
        model: attempt.model,
        keyLabel: attempt.label,
        latencyMs: result.latencyMs
      });
    } catch (err) {
      errors.push(`${attempt.providerId} [${attempt.label}]: ${err.message}`);
    }
  }

  return res.status(502).json({ error: 'All global server keys failed: ' + errors.join(' | ') });
};
