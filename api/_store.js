/**
 * Shared Cloud Storage & Provider Helper for Vercel Serverless Functions
 * Supports:
 *   1. Upstash Redis / Vercel KV REST API (KV_REST_API_URL / UPSTASH_REDIS_REST_URL)
 *   2. Vercel Environment Variables (GROQ_API_KEYS, GOOGLE_API_KEYS, NVIDIA_API_KEYS, OPENROUTER_API_KEYS)
 * Zero external npm packages required — uses native Node 18+ fetch!
 */

const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || '8590584541';
const REDIS_CONFIG_KEY = 'kelsila:freellmapi:config:v1';

const DEFAULT_MODELS = {
  groq: 'llama-3.3-70b-versatile',
  google: 'gemini-3.5-flash-lite',
  nvidia: 'google/gemma-4-31b-it',
  openrouter: 'openrouter/free'
};

const PROVIDER_NAMES = {
  groq: 'Groq Cloud',
  google: 'Google AI Studio',
  nvidia: 'NVIDIA NIM',
  openrouter: 'OpenRouter'
};

const STRATEGY_ORDER = {
  'auto:balanced': ['groq', 'google', 'nvidia', 'openrouter'],
  'auto:fast': ['groq', 'google', 'nvidia', 'openrouter'],
  'auto:smart': ['nvidia', 'google', 'groq', 'openrouter'],
  'round-robin': ['groq', 'google', 'nvidia', 'openrouter']
};

function getRedisCredentials() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.STORAGE_REST_API_URL ||
    '';
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN ||
    '';
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

function isCloudDbConfigured() {
  return Boolean(getRedisCredentials());
}

async function getCloudConfig() {
  const creds = getRedisCredentials();
  if (!creds) return null;
  try {
    const res = await fetch(`${creds.url}/get/${encodeURIComponent(REDIS_CONFIG_KEY)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch (e) {
    return null;
  }
}

async function saveCloudConfig(configObj) {
  const creds = getRedisCredentials();
  if (!creds) return false;
  try {
    const res = await fetch(`${creds.url}/set/${encodeURIComponent(REDIS_CONFIG_KEY)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(configObj))
    });
    if (res.ok) return true;

    // Fallback to Upstash pipeline format
    const res2 = await fetch(`${creds.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([['SET', REDIS_CONFIG_KEY, JSON.stringify(configObj)]])
    });
    return res2.ok;
  } catch (e) {
    return false;
  }
}

function parseEnvList(val) {
  return String(val || '')
    .split(/[,\n\r]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

function getEnvProviderKeys() {
  return {
    groq: [...parseEnvList(process.env.GROQ_API_KEYS), ...parseEnvList(process.env.GROQ_API_KEY)],
    google: [...parseEnvList(process.env.GOOGLE_API_KEYS), ...parseEnvList(process.env.GOOGLE_API_KEY), ...parseEnvList(process.env.GEMINI_API_KEY)],
    nvidia: [...parseEnvList(process.env.NVIDIA_API_KEYS), ...parseEnvList(process.env.NVIDIA_API_KEY)],
    openrouter: [...parseEnvList(process.env.OPENROUTER_API_KEYS), ...parseEnvList(process.env.OPENROUTER_API_KEY)]
  };
}

function countEnabledKeysInConfig(cfg) {
  if (!cfg || !cfg.providers) return 0;
  let total = 0;
  for (const pid of Object.keys(DEFAULT_MODELS)) {
    const p = cfg.providers[pid];
    if (p && p.enabled !== false && Array.isArray(p.keys)) {
      total += p.keys.filter(k => k.enabled !== false && k.key).length;
    }
  }
  return total;
}

function checkPasskey(req) {
  const headerKey = req.headers['x-admin-passkey'] || req.headers['X-Admin-Passkey'] || '';
  return String(headerKey).trim() === String(ADMIN_PASSKEY).trim();
}

module.exports = {
  ADMIN_PASSKEY,
  DEFAULT_MODELS,
  PROVIDER_NAMES,
  STRATEGY_ORDER,
  isCloudDbConfigured,
  getCloudConfig,
  saveCloudConfig,
  getEnvProviderKeys,
  countEnabledKeysInConfig,
  checkPasskey
};
