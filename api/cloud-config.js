/**
 * Passkey-Protected Global Cloud Config Endpoint (/api/cloud-config)
 * Lets the Admin save & load multi-provider, multi-key FreeLLMAPI configs in Upstash Redis
 * so changes made in /admin take effect globally on ALL devices over the internet!
 */

const store = require('./_store.js');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Passkey');
    return res.status(204).end();
  }

  if (!store.checkPasskey(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin passkey' });
  }

  const cloudDbConnected = store.isCloudDbConfigured();
  const envKeys = store.getEnvProviderKeys();
  const envKeyCounts = Object.fromEntries(Object.entries(envKeys).map(([k, arr]) => [k, arr.length]));

  if (req.method === 'GET') {
    const config = cloudDbConnected ? await store.getCloudConfig() : null;
    return res.status(200).json({
      cloudDbConnected,
      envKeyCounts,
      config
    });
  }

  if (req.method === 'POST') {
    if (!cloudDbConnected) {
      return res.status(200).json({
        savedToCloud: false,
        cloudDbConnected: false,
        message: 'Connect free Upstash Redis in Vercel -> Storage for global Admin persistence.'
      });
    }

    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!body || !body.providers) {
        return res.status(400).json({ error: 'Invalid config payload' });
      }
      const ok = await store.saveCloudConfig(body);
      return res.status(ok ? 200 : 502).json({
        savedToCloud: ok,
        cloudDbConnected: true
      });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Save failed' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
