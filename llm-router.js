/**
 * FreeLLMAPI-Style Unified Multi-Provider, Multi-Key AI Router (2026 Live Catalog)
 * ================================================================================
 * Supports:
 *   - NVIDIA NIM        (integrate.api.nvidia.com)
 *   - Groq Cloud        (api.groq.com)
 *   - Google AI Studio  (generativelanguage.googleapis.com)
 *   - OpenRouter        (openrouter.ai)
 *
 * Features:
 *   - Multiple API keys per provider with per-provider round-robin rotation
 *   - Automatic failover chain across keys AND providers on 429 / 5xx / timeout / auth error
 *   - Per-key cooldown ledger with automatic expiry
 *   - Auto-migration of retired/deprecated model IDs saved in localStorage
 *   - Automatic retry without response_format if a model rejects json_object
 *   - Live model catalog discovery via provider /models endpoints
 *   - Automatic CORS proxy detection (/api/proxy on Vercel & Windows launcher.py)
 */

(function (global) {
  const STORAGE_KEY = 'FREELM_COACH_CONFIG_V1';
  const LOGS_KEY = 'FREELM_COACH_LOGS_V1';
  const ADMIN_PASSKEY = '8590584541';

  // Retired model IDs auto-migrated to live working defaults
  const RETIRED_MODELS = new Set([
    'meta/llama-3.3-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'meta/llama-3.1-70b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'mistralai/mistral-large-2-instruct',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'deepseek/deepseek-r1:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'gemma2-9b-it',
    'mixtral-8x7b-32768',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash'
  ]);

  const PROVIDER_CATALOG = {
    groq: {
      id: 'groq',
      name: 'Groq Cloud',
      badge: 'Ultra-Fast',
      color: '#f55036',
      keyPlaceholder: 'gsk_...',
      getKeyUrl: 'https://console.groq.com/keys',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      modelsEndpoint: 'https://api.groq.com/openai/v1/models',
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
        { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Fastest Voice)' },
        { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (High Quality)' },
        { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Fast)' }
      ],
      needsProxyInBrowser: false,
      type: 'openai'
    },
    google: {
      id: 'google',
      name: 'Google AI Studio',
      badge: 'Gemini Free',
      color: '#4285f4',
      keyPlaceholder: 'AIzaSy...',
      getKeyUrl: 'https://aistudio.google.com/app/apikey',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      defaultModel: 'gemini-3.5-flash-lite',
      models: [
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Fastest & Free Tier)' },
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Best Quality)' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Legacy)' }
      ],
      needsProxyInBrowser: false,
      type: 'google'
    },
    nvidia: {
      id: 'nvidia',
      name: 'NVIDIA NIM',
      badge: 'High Quality',
      color: '#76b900',
      keyPlaceholder: 'nvapi-...',
      getKeyUrl: 'https://build.nvidia.com/',
      endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
      modelsEndpoint: 'https://integrate.api.nvidia.com/v1/models',
      defaultModel: 'google/gemma-4-31b-it',
      models: [
        { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B Instruct (Recommended)' },
        { id: 'google/gemma-3-12b-it', label: 'Gemma 3 12B Instruct (Fastest Voice)' },
        { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning 30B' },
        { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
        { id: 'mistralai/mistral-large-4-1t-a52b', label: 'Mistral Large 4' },
        { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash' }
      ],
      needsProxyInBrowser: true,
      type: 'openai'
    },
    openrouter: {
      id: 'openrouter',
      name: 'OpenRouter',
      badge: 'Multi-Model Free',
      color: '#8b5cf6',
      keyPlaceholder: 'sk-or-v1-...',
      getKeyUrl: 'https://openrouter.ai/keys',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      modelsEndpoint: 'https://openrouter.ai/api/v1/models',
      defaultModel: 'openrouter/free',
      models: [
        { id: 'openrouter/free', label: 'OpenRouter Auto Free (Never Breaks!)' },
        { id: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B (:free)' },
        { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (:free)' },
        { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning (:free)' }
      ],
      needsProxyInBrowser: false,
      type: 'openai'
    }
  };

  const STRATEGY_ORDER = {
    'auto:balanced': ['groq', 'google', 'nvidia', 'openrouter'],
    'auto:fast': ['groq', 'google', 'nvidia', 'openrouter'],
    'auto:smart': ['nvidia', 'google', 'groq', 'openrouter'],
    'round-robin': ['groq', 'google', 'nvidia', 'openrouter']
  };

  function createDefaultConfig() {
    const config = {
      strategy: 'auto:balanced',
      pinnedProvider: 'auto',
      providerRotationIndex: 0,
      cooldownSeconds: 60,
      providers: {
        nvidia: { enabled: true, model: PROVIDER_CATALOG.nvidia.defaultModel, rrIndex: 0, keys: [], liveModels: [] },
        groq: { enabled: true, model: PROVIDER_CATALOG.groq.defaultModel, rrIndex: 0, keys: [], liveModels: [] },
        google: { enabled: true, model: PROVIDER_CATALOG.google.defaultModel, rrIndex: 0, keys: [], liveModels: [] },
        openrouter: { enabled: true, model: PROVIDER_CATALOG.openrouter.defaultModel, rrIndex: 0, keys: [], liveModels: [] }
      },
      stats: {
        totalRequests: 0,
        totalSuccess: 0,
        totalFailovers: 0
      }
    };

    try {
      const legacyKey = localStorage.getItem('NVIDIA_NIM_API_KEY');
      if (legacyKey && legacyKey.trim()) {
        config.providers.nvidia.keys.push(createKeyEntry(legacyKey.trim(), 'Migrated NVIDIA Key'));
      }
    } catch (e) {}

    return config;
  }

  function createKeyEntry(key, label = '') {
    return {
      id: 'k_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      key: key.trim(),
      label: label.trim() || 'API Key',
      enabled: true,
      requests: 0,
      errors: 0,
      cooldownUntil: 0,
      lastError: '',
      lastUsedAt: 0
    };
  }

  let memoryConfig = null;
  let serverKeyCount = 0;

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        if (memoryConfig) return memoryConfig;
        memoryConfig = createDefaultConfig();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryConfig)); } catch (e) {}
        return memoryConfig;
      }
      const parsed = JSON.parse(raw);
      const def = createDefaultConfig();
      let migrated = false;

      parsed.providers = parsed.providers || {};
      Object.keys(PROVIDER_CATALOG).forEach(pid => {
        if (!parsed.providers[pid]) {
          parsed.providers[pid] = def.providers[pid];
          migrated = true;
        } else {
          const p = parsed.providers[pid];
          p.keys = Array.isArray(p.keys) ? p.keys : [];
          p.liveModels = Array.isArray(p.liveModels) ? p.liveModels : [];
          if (!p.model || RETIRED_MODELS.has(p.model)) {
            p.model = PROVIDER_CATALOG[pid].defaultModel;
            migrated = true;
          }
          if (typeof p.rrIndex !== 'number') p.rrIndex = 0;
          if (typeof p.enabled !== 'boolean') p.enabled = true;
        }
      });

      if (!parsed.stats) parsed.stats = def.stats;
      if (!parsed.strategy) parsed.strategy = 'auto:balanced';
      memoryConfig = parsed;
      if (migrated) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } catch (e) {}
      }
      return parsed;
    } catch (e) {
      if (!memoryConfig) memoryConfig = createDefaultConfig();
      return memoryConfig;
    }
  }

  let cloudStatus = { cloudDbConnected: false, envKeyCounts: {}, source: 'none', serverKeyCount: 0 };

  function saveConfig(config, options = {}) {
    memoryConfig = config;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Could not save router config to localStorage (using memory fallback):', e);
    }

    if (options.skipRemoteSync) return;

    // 1. Local Windows launcher.py disk persistence
    if (window.location.protocol.startsWith('http') &&
        (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      }).catch(() => {});
    }

    // 2. Global Cloud DB persistence (Upstash Redis on Vercel) when Admin is unlocked
    if (hasProxyAvailable() && sessionStorage.getItem('COACH_ADMIN_UNLOCKED_V1') === '1') {
      fetch('/api/cloud-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Passkey': ADMIN_PASSKEY
        },
        body: JSON.stringify(config)
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d && d.savedToCloud) {
            cloudStatus.cloudDbConnected = true;
            cloudStatus.source = 'cloud-redis';
            serverKeyCount = countLocalKeys(config);
          }
        })
        .catch(() => {});
    }
  }

  async function loadCloudConfigForAdmin() {
    if (!hasProxyAvailable()) return cloudStatus;
    try {
      const res = await fetch('/api/cloud-config', {
        method: 'GET',
        headers: { 'X-Admin-Passkey': ADMIN_PASSKEY }
      });
      if (res.ok) {
        const data = await res.json();
        cloudStatus.cloudDbConnected = Boolean(data.cloudDbConnected);
        cloudStatus.envKeyCounts = data.envKeyCounts || {};
        const envTotal = Object.values(cloudStatus.envKeyCounts).reduce((a, b) => a + b, 0);

        if (data.config && data.config.providers) {
          // Hydrate cloud config into Admin UI so admin sees exact global keys from any device!
          const cloudCount = countLocalKeys(data.config);
          const localCount = countLocalKeys(loadConfig());
          if (cloudCount > 0 || localCount === 0) {
            saveConfig(data.config, { skipRemoteSync: true });
          } else if (data.cloudDbConnected && localCount > 0) {
            // Admin already had local keys before connecting Redis -> push them up to Cloud!
            saveConfig(loadConfig());
          }
          serverKeyCount = Math.max(cloudCount, envTotal);
          cloudStatus.source = cloudCount > 0 ? 'cloud-redis' : (envTotal > 0 ? 'vercel-env' : 'none');
        } else if (data.cloudDbConnected && countLocalKeys(loadConfig()) > 0) {
          // Push existing local browser keys up to newly connected Cloud DB automatically
          saveConfig(loadConfig());
          serverKeyCount = countLocalKeys(loadConfig()) + envTotal;
          cloudStatus.source = 'cloud-redis';
        } else {
          serverKeyCount = envTotal;
          cloudStatus.source = envTotal > 0 ? 'vercel-env' : 'none';
        }
        cloudStatus.serverKeyCount = serverKeyCount;
      }
    } catch (e) {}
    return cloudStatus;
  }

  function getCloudStatus() {
    return { ...cloudStatus, serverKeyCount };
  }

  function importFromUrlSync() {
    try {
      const hash = window.location.hash || '';
      if (hash.startsWith('#sync=')) {
        const b64 = decodeURIComponent(hash.slice(6));
        const json = decodeURIComponent(escape(atob(b64)));
        const parsed = JSON.parse(json);
        if (parsed && parsed.providers) {
          saveConfig(parsed);
          // Immediately clear sensitive keys from URL bar
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('Sync link import failed:', e);
    }
    return false;
  }

  function createSyncUrl() {
    const cfg = loadConfig();
    const compact = {
      strategy: cfg.strategy,
      pinnedProvider: cfg.pinnedProvider,
      cooldownSeconds: cfg.cooldownSeconds,
      providers: {}
    };
    Object.keys(PROVIDER_CATALOG).forEach(pid => {
      const p = cfg.providers[pid];
      compact.providers[pid] = {
        enabled: p.enabled,
        model: p.model,
        rrIndex: 0,
        keys: (p.keys || []).map(k => ({ id: k.id, key: k.key, label: k.label, enabled: k.enabled, requests: 0, errors: 0, cooldownUntil: 0, lastError: '' }))
      };
    });
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
    const base = window.location.origin && window.location.origin !== 'null'
      ? window.location.origin + '/'
      : window.location.href.split('#')[0].replace(/admin\.html$/i, 'index.html');
    return `${base}#sync=${encodeURIComponent(b64)}`;
  }

  async function hydrateFromServerIfAvailable() {
    importFromUrlSync();

    // 1. Check Windows local launcher.py config.json (never overwrites non-empty local)
    if (window.location.protocol.startsWith('http') &&
        (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          if (data && data.providers) {
            const local = loadConfig();
            if (countLocalKeys(data) > 0 && countLocalKeys(local) === 0) {
              memoryConfig = data;
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }

    // 2. Check global Cloud DB / Vercel Env keys (/api/server-chat) — safe for public student devices!
    if (hasProxyAvailable()) {
      try {
        const sRes = await fetch('/api/server-chat');
        if (sRes.ok) {
          const sData = await sRes.json();
          cloudStatus.cloudDbConnected = Boolean(sData.cloudDbConnected);
          cloudStatus.source = sData.source || 'none';
          if (sData && sData.configured && sData.totalKeys > 0) {
            serverKeyCount = sData.totalKeys;
            cloudStatus.serverKeyCount = sData.totalKeys;
          }
        }
      } catch (e) {}
    }

    return loadConfig();
  }

  function countLocalKeys(config) {
    const cfg = config || loadConfig();
    let count = 0;
    Object.keys(PROVIDER_CATALOG).forEach(pid => {
      const p = cfg.providers[pid];
      if (p && p.enabled && Array.isArray(p.keys)) {
        count += p.keys.filter(k => k.enabled && k.key).length;
      }
    });
    return count;
  }

  function countActiveKeys(config) {
    return countLocalKeys(config) + (config ? 0 : serverKeyCount);
  }

  function loadLogs() {
    try { return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]'); } catch (e) { return []; }
  }

  function addLog(entry) {
    try {
      const logs = loadLogs();
      logs.unshift({ time: new Date().toLocaleTimeString(), ...entry });
      localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 40)));
    } catch (e) {}
  }

  function clearLogs() {
    try { localStorage.removeItem(LOGS_KEY); } catch (e) {}
  }

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 10) return '••••' + key.slice(-3);
    return key.slice(0, 6) + '••••••' + key.slice(-4);
  }

  function getKeyCooldownRemaining(keyObj) {
    if (!keyObj || !keyObj.cooldownUntil) return 0;
    const diff = Math.ceil((keyObj.cooldownUntil - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }

  function hasProxyAvailable() {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  function getSafeReferer() {
    const origin = window.location.origin;
    if (!origin || origin === 'null' || !origin.startsWith('http')) {
      return 'https://kelsila.vercel.app';
    }
    return origin;
  }

  // Live Model Discovery for any provider
  async function fetchLiveModels(providerId) {
    const config = loadConfig();
    const meta = PROVIDER_CATALOG[providerId];
    const pCfg = config.providers[providerId];
    const firstKey = (pCfg.keys.find(k => k.enabled && k.key) || pCfg.keys[0] || {}).key || '';

    let url = meta.modelsEndpoint;
    const headers = {};

    if (meta.type === 'google') {
      if (!firstKey) throw new Error('Add a Google AI Studio key first to fetch live Gemini models.');
      url = `${meta.modelsEndpoint}?key=${encodeURIComponent(firstKey)}`;
    } else if (firstKey) {
      headers['Authorization'] = `Bearer ${firstKey}`;
    }

    let res;
    if (meta.needsProxyInBrowser && hasProxyAvailable()) {
      res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url, method: 'GET', headers })
      });
    } else {
      res = await fetch(url, { method: 'GET', headers });
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120) || res.statusText}`);
    }

    const data = await res.json();
    let discovered = [];

    if (meta.type === 'google') {
      discovered = (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(id => id.includes('gemini') || id.includes('gemma'))
        .slice(0, 25)
        .map(id => ({ id, label: `${id} (Live)` }));
    } else if (providerId === 'openrouter') {
      discovered = [{ id: 'openrouter/free', label: 'OpenRouter Auto Free (Recommended)' }].concat(
        (data.data || [])
          .map(m => m.id)
          .filter(id => id.endsWith(':free'))
          .slice(0, 25)
          .map(id => ({ id, label: `${id} (Live)` }))
      );
    } else {
      discovered = (data.data || [])
        .map(m => m.id)
        .filter(id => !/embed|whisper|guard|tts|clip|detector|calibration|starcoder/i.test(id))
        .slice(0, 25)
        .map(id => ({ id, label: `${id} (Live)` }));
    }

    if (discovered.length) {
      pCfg.liveModels = discovered;
      if (!discovered.some(m => m.id === pCfg.model)) {
        pCfg.model = discovered[0].id;
      }
      saveConfig(config);
    }
    return discovered;
  }

  function buildAttemptChain(config, overrideProviderId = null, overrideKeyId = null) {
    const now = Date.now();
    const attempts = [];
    const coolingAttempts = [];

    if (overrideProviderId && overrideKeyId) {
      const pCfg = config.providers[overrideProviderId];
      if (!pCfg) return [];
      const kObj = pCfg.keys.find(k => k.id === overrideKeyId);
      if (!kObj) return [];
      return [{ providerId: overrideProviderId, keyObj: kObj, model: pCfg.model || PROVIDER_CATALOG[overrideProviderId].defaultModel }];
    }

    let providerOrder = [];
    if (overrideProviderId && PROVIDER_CATALOG[overrideProviderId]) {
      providerOrder = [overrideProviderId];
    } else if (config.pinnedProvider && config.pinnedProvider !== 'auto' && PROVIDER_CATALOG[config.pinnedProvider]) {
      const others = (STRATEGY_ORDER[config.strategy] || STRATEGY_ORDER['auto:balanced']).filter(p => p !== config.pinnedProvider);
      providerOrder = [config.pinnedProvider, ...others];
    } else {
      const base = [...(STRATEGY_ORDER[config.strategy] || STRATEGY_ORDER['auto:balanced'])];
      if (config.strategy === 'round-robin') {
        const start = (config.providerRotationIndex || 0) % base.length;
        providerOrder = [...base.slice(start), ...base.slice(0, start)];
        config.providerRotationIndex = (start + 1) % base.length;
      } else {
        providerOrder = base;
      }
    }

    for (const pid of providerOrder) {
      const pCfg = config.providers[pid];
      if (!pCfg || !pCfg.enabled || !pCfg.keys.length) continue;

      const enabledKeys = pCfg.keys.filter(k => k.enabled && k.key);
      if (!enabledKeys.length) continue;

      const rrStart = (pCfg.rrIndex || 0) % enabledKeys.length;
      const rotatedKeys = [...enabledKeys.slice(rrStart), ...enabledKeys.slice(0, rrStart)];

      for (const kObj of rotatedKeys) {
        const attempt = { providerId: pid, keyObj: kObj, model: pCfg.model || PROVIDER_CATALOG[pid].defaultModel };
        if (kObj.cooldownUntil && kObj.cooldownUntil > now) {
          coolingAttempts.push(attempt);
        } else {
          attempts.push(attempt);
        }
      }
    }

    coolingAttempts.sort((a, b) => (a.keyObj.cooldownUntil || 0) - (b.keyObj.cooldownUntil || 0));
    return [...attempts, ...coolingAttempts];
  }

  async function executeHttpCall(url, headers, bodyObj, useProxy) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 22000);
    try {
      let response;
      if (useProxy && hasProxyAvailable()) {
        response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ targetUrl: url, method: 'POST', headers, payload: bodyObj })
        });
      } else {
        response = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify(bodyObj)
        });
      }
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const tErr = new Error('Request timed out (22s)');
        tErr.status = 408;
        throw tErr;
      }
      if (!hasProxyAvailable() && useProxy) {
        throw new Error('CORS blocked on file:// — run run_coach_kiosk.bat or open on Vercel for NVIDIA NIM');
      }
      throw err;
    }
  }

  async function callSingleProvider({ providerId, keyObj, model, messages, temperature = 0.5, maxTokens = 550, jsonMode = true }) {
    const meta = PROVIDER_CATALOG[providerId];
    const startTime = performance.now();

    let url = '';
    let headers = { 'Content-Type': 'application/json' };
    let bodyObj = {};

    if (meta.type === 'google') {
      url = `${meta.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyObj.key)}`;
      const systemMsg = messages.find(m => m.role === 'system');
      const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      bodyObj = {
        contents: chatMsgs,
        generationConfig: {
          temperature,
          maxOutputTokens: Math.max(maxTokens, 256)
        }
      };
      if (systemMsg) {
        bodyObj.systemInstruction = { parts: [{ text: systemMsg.content }] };
      }
      if (jsonMode) {
        bodyObj.generationConfig.responseMimeType = 'application/json';
      }
    } else {
      url = meta.endpoint;
      headers['Authorization'] = `Bearer ${keyObj.key}`;
      if (providerId === 'openrouter') {
        headers['HTTP-Referer'] = getSafeReferer();
        headers['X-Title'] = 'Kerala AI English Coach Statue';
      }
      bodyObj = {
        model,
        messages,
        temperature,
        max_tokens: Math.max(maxTokens, 200)
      };
      if (jsonMode && providerId === 'groq') {
        bodyObj.response_format = { type: 'json_object' };
      }
    }

    let response = await executeHttpCall(url, headers, bodyObj, meta.needsProxyInBrowser);

    // Smart retry: if a model rejects response_format/responseMimeType with HTTP 400, strip it and retry once
    if (response.status === 400 && (bodyObj.response_format || bodyObj.generationConfig?.responseMimeType)) {
      const retryBody = JSON.parse(JSON.stringify(bodyObj));
      delete retryBody.response_format;
      if (retryBody.generationConfig) delete retryBody.generationConfig.responseMimeType;
      response = await executeHttpCall(url, headers, retryBody, meta.needsProxyInBrowser);
    }

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      let errText = '';
      try { errText = await response.text(); } catch (e) {}
      const err = new Error(`HTTP ${response.status}: ${errText.slice(0, 220) || response.statusText}`);
      err.status = response.status;
      err.latencyMs = latencyMs;
      throw err;
    }

    const data = await response.json();
    let content = '';

    if (meta.type === 'google') {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      content = parts.filter(p => !p.thought && p.text).map(p => p.text).join('').trim()
             || parts.map(p => p.text || '').join('').trim();
    } else {
      const msg = data?.choices?.[0]?.message || {};
      content = (msg.content || msg.reasoning_content || msg.reasoning || '').trim();
    }

    if (!content) {
      throw new Error('Empty response content from provider (model may need higher max_tokens)');
    }

    return {
      content,
      providerId,
      providerName: meta.name,
      model,
      keyId: keyObj.id,
      keyLabel: keyObj.label,
      latencyMs
    };
  }

  async function chat({ messages, temperature = 0.5, maxTokens = 550, jsonMode = true, overrideProviderId = null, overrideKeyId = null }) {
    const config = loadConfig();
    const attempts = buildAttemptChain(config, overrideProviderId, overrideKeyId);

    // Fallback to optional server-side Vercel environment keys (/api/server-chat) if no local browser keys
    if (!attempts.length) {
      if (!overrideKeyId && serverKeyCount > 0 && hasProxyAvailable()) {
        const sRes = await fetch('/api/server-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, temperature, maxTokens })
        });
        if (sRes.ok) {
          return await sRes.json();
        }
      }
      const noKeyErr = new Error('NO_API_KEYS_CONFIGURED');
      noKeyErr.code = 'NO_API_KEYS';
      throw noKeyErr;
    }

    config.stats.totalRequests = (config.stats.totalRequests || 0) + 1;
    const errors = [];

    for (let i = 0; i < attempts.length; i++) {
      const { providerId, keyObj, model } = attempts[i];
      const pCfg = config.providers[providerId];

      try {
        const result = await callSingleProvider({
          providerId,
          keyObj,
          model,
          messages,
          temperature,
          maxTokens,
          jsonMode
        });

        const enabledKeys = pCfg.keys.filter(k => k.enabled && k.key);
        if (enabledKeys.length > 0) {
          const usedPos = enabledKeys.findIndex(k => k.id === keyObj.id);
          pCfg.rrIndex = (usedPos + 1) % enabledKeys.length;
        }

        keyObj.requests = (keyObj.requests || 0) + 1;
        keyObj.cooldownUntil = 0;
        keyObj.lastError = '';
        keyObj.lastUsedAt = Date.now();
        config.stats.totalSuccess = (config.stats.totalSuccess || 0) + 1;
        if (i > 0) {
          config.stats.totalFailovers = (config.stats.totalFailovers || 0) + 1;
        }
        saveConfig(config);

        addLog({
          status: 'ok',
          provider: PROVIDER_CATALOG[providerId].name,
          model,
          keyLabel: `${keyObj.label} (${maskKey(keyObj.key)})`,
          latencyMs: result.latencyMs,
          failover: i > 0 ? `Failover #${i}` : 'Primary'
        });

        return result;
      } catch (err) {
        const status = err.status || 0;
        const baseCooldown = config.cooldownSeconds || 60;
        const cooldownSec = (status === 401 || status === 402 || status === 403) ? 300 : baseCooldown;

        keyObj.errors = (keyObj.errors || 0) + 1;
        keyObj.cooldownUntil = Date.now() + cooldownSec * 1000;
        keyObj.lastError = err.message || 'Unknown error';
        saveConfig(config);

        errors.push(`${PROVIDER_CATALOG[providerId].name} [${keyObj.label}]: ${err.message}`);

        addLog({
          status: 'error',
          provider: PROVIDER_CATALOG[providerId].name,
          model,
          keyLabel: `${keyObj.label} (${maskKey(keyObj.key)})`,
          latencyMs: err.latencyMs || 0,
          failover: `Cooldown ${cooldownSec}s (${err.message.slice(0, 90)})`
        });
      }
    }

    if (!overrideKeyId && serverKeyCount > 0 && hasProxyAvailable()) {
      try {
        const sRes = await fetch('/api/server-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, temperature, maxTokens, jsonMode })
        });
        if (sRes.ok) return await sRes.json();
      } catch (e) {}
    }

    const finalErr = new Error('All configured API keys failed: ' + errors.join(' | '));
    finalErr.code = 'ALL_FAILED';
    throw finalErr;
  }

  global.FreeLLMRouter = {
    ADMIN_PASSKEY,
    PROVIDER_CATALOG,
    loadConfig,
    saveConfig,
    hydrateFromServerIfAvailable,
    loadCloudConfigForAdmin,
    getCloudStatus,
    createSyncUrl,
    importFromUrlSync,
    createKeyEntry,
    maskKey,
    countLocalKeys,
    countActiveKeys,
    getKeyCooldownRemaining,
    fetchLiveModels,
    loadLogs,
    clearLogs,
    chat
  };
})(window);
