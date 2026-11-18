/**
 * FreeLLMAPI-Style Unified Multi-Provider, Multi-Key AI Router
 * ============================================================
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
 *   - Smart routing strategies: auto:balanced, auto:fast, auto:smart, round-robin, or pinned provider
 *   - Automatic CORS proxy detection (/api/proxy on Vercel & Windows launcher.py)
 *   - Live telemetry, per-key usage counters, and routing event logs
 */

(function (global) {
  const STORAGE_KEY = 'FREELM_COACH_CONFIG_V1';
  const LOGS_KEY = 'FREELM_COACH_LOGS_V1';
  const ADMIN_PASSKEY = '8590584541';

  const PROVIDER_CATALOG = {
    groq: {
      id: 'groq',
      name: 'Groq Cloud',
      badge: 'Ultra-Fast',
      color: '#f55036',
      keyPlaceholder: 'gsk_...',
      getKeyUrl: 'https://console.groq.com/keys',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      defaultModel: 'llama-3.3-70b-versatile',
      models: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Recommended)' },
        { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Fastest Voice)' },
        { id: 'gemma2-9b-it', label: 'Gemma 2 9B Instruct' },
        { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' }
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
      defaultModel: 'gemini-2.5-flash',
      models: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Best Balance)' },
        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fast)' },
        { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (High Quota)' },
        { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Smartest)' }
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
      defaultModel: 'meta/llama-3.3-70b-instruct',
      models: [
        { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct (Best Coaching)' },
        { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B Instruct (Fastest)' },
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Nemotron 70B Instruct' },
        { id: 'mistralai/mistral-large-2-instruct', label: 'Mistral Large 2 Instruct' }
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
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      models: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B Instruct (:free)' },
        { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash Exp (:free)' },
        { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1 (:free)' },
        { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B Instruct (:free)' }
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
        nvidia: { enabled: true, model: PROVIDER_CATALOG.nvidia.defaultModel, rrIndex: 0, keys: [] },
        groq: { enabled: true, model: PROVIDER_CATALOG.groq.defaultModel, rrIndex: 0, keys: [] },
        google: { enabled: true, model: PROVIDER_CATALOG.google.defaultModel, rrIndex: 0, keys: [] },
        openrouter: { enabled: true, model: PROVIDER_CATALOG.openrouter.defaultModel, rrIndex: 0, keys: [] }
      },
      stats: {
        totalRequests: 0,
        totalSuccess: 0,
        totalFailovers: 0
      }
    };

    // Migrate legacy single NVIDIA key if present
    try {
      const legacyKey = localStorage.getItem('NVIDIA_NIM_API_KEY');
      const legacyModel = localStorage.getItem('NVIDIA_NIM_MODEL');
      if (legacyKey && legacyKey.trim()) {
        config.providers.nvidia.keys.push(createKeyEntry(legacyKey.trim(), 'Migrated NVIDIA Key'));
        if (legacyModel) config.providers.nvidia.model = legacyModel;
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

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const def = createDefaultConfig();
        saveConfig(def);
        return def;
      }
      const parsed = JSON.parse(raw);
      // Ensure all 4 providers exist
      const def = createDefaultConfig();
      parsed.providers = parsed.providers || {};
      Object.keys(PROVIDER_CATALOG).forEach(pid => {
        if (!parsed.providers[pid]) {
          parsed.providers[pid] = def.providers[pid];
        } else {
          parsed.providers[pid].keys = Array.isArray(parsed.providers[pid].keys) ? parsed.providers[pid].keys : [];
          if (!parsed.providers[pid].model) parsed.providers[pid].model = PROVIDER_CATALOG[pid].defaultModel;
          if (typeof parsed.providers[pid].rrIndex !== 'number') parsed.providers[pid].rrIndex = 0;
          if (typeof parsed.providers[pid].enabled !== 'boolean') parsed.providers[pid].enabled = true;
        }
      });
      if (!parsed.stats) parsed.stats = def.stats;
      if (!parsed.strategy) parsed.strategy = 'auto:balanced';
      return parsed;
    } catch (e) {
      return createDefaultConfig();
    }
  }

  function saveConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Could not save router config to localStorage:', e);
    }
    // Optional background sync to local Windows launcher.py disk storage if running locally
    if (window.location.protocol.startsWith('http') &&
        (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      }).catch(() => {});
    }
  }

  async function hydrateFromServerIfAvailable() {
    if (window.location.protocol.startsWith('http') &&
        (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')) {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          if (data && data.providers) {
            const local = loadConfig();
            const localCount = countActiveKeys(local);
            const serverCount = countActiveKeys(data);
            if (serverCount > 0 && localCount === 0) {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
              return data;
            }
          }
        }
      } catch (e) {}
    }
    return loadConfig();
  }

  function loadLogs() {
    try {
      return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function addLog(entry) {
    try {
      const logs = loadLogs();
      logs.unshift({
        time: new Date().toLocaleTimeString(),
        ...entry
      });
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

  function countActiveKeys(config) {
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

  function getKeyCooldownRemaining(keyObj) {
    if (!keyObj || !keyObj.cooldownUntil) return 0;
    const diff = Math.ceil((keyObj.cooldownUntil - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }

  // Build ordered list of { providerId, keyObj, model } attempts like FreeLLMAPI
  function buildAttemptChain(config, overrideProviderId = null, overrideKeyId = null) {
    const now = Date.now();
    const attempts = [];
    const coolingAttempts = [];

    // Direct single-key test mode
    if (overrideProviderId && overrideKeyId) {
      const pCfg = config.providers[overrideProviderId];
      if (!pCfg) return [];
      const kObj = pCfg.keys.find(k => k.id === overrideKeyId);
      if (!kObj) return [];
      return [{ providerId: overrideProviderId, keyObj: kObj, model: pCfg.model }];
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

      // Round-robin rotation within the SAME provider's multiple keys!
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

    // If all keys are technically cooling down, still try the ones closest to expiry as last resort
    coolingAttempts.sort((a, b) => (a.keyObj.cooldownUntil || 0) - (b.keyObj.cooldownUntil || 0));
    return [...attempts, ...coolingAttempts];
  }

  function hasProxyAvailable() {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  async function callSingleProvider({ providerId, keyObj, model, messages, temperature = 0.5, maxTokens = 450, jsonMode = true }) {
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
          maxOutputTokens: maxTokens
        }
      };
      if (systemMsg) {
        bodyObj.systemInstruction = { parts: [{ text: systemMsg.content }] };
      }
      if (jsonMode) {
        bodyObj.generationConfig.responseMimeType = 'application/json';
      }
    } else {
      // OpenAI-compatible (NVIDIA NIM, Groq, OpenRouter)
      url = meta.endpoint;
      headers['Authorization'] = `Bearer ${keyObj.key}`;
      if (providerId === 'openrouter') {
        headers['HTTP-Referer'] = window.location.origin || 'https://kerala-english-coach.vercel.app';
        headers['X-Title'] = 'Kerala AI English Coach Statue';
      }
      bodyObj = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
      };
      if (jsonMode && (providerId === 'groq' || providerId === 'nvidia')) {
        bodyObj.response_format = { type: 'json_object' };
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    try {
      let response;
      // Use /api/proxy for NVIDIA NIM (avoids browser CORS blocks on Vercel & Windows launcher.py)
      if (meta.needsProxyInBrowser && hasProxyAvailable()) {
        response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            targetUrl: url,
            headers,
            payload: bodyObj
          })
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
      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errText = '';
        try { errText = await response.text(); } catch (e) {}
        const err = new Error(`HTTP ${response.status}: ${errText.slice(0, 180) || response.statusText}`);
        err.status = response.status;
        err.latencyMs = latencyMs;
        throw err;
      }

      const data = await response.json();
      let content = '';

      if (meta.type === 'google') {
        content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        content = data?.choices?.[0]?.message?.content || '';
      }

      if (!content) {
        throw new Error('Empty response content from provider');
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
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const tErr = new Error('Request timed out (18s)');
        tErr.status = 408;
        throw tErr;
      }
      throw err;
    }
  }

  /**
   * Main Unified Router Chat Call (FreeLLMAPI behavior)
   * Rotates keys within each provider & automatically fails over across keys/providers!
   */
  async function chat({ messages, temperature = 0.5, maxTokens = 450, jsonMode = true, overrideProviderId = null, overrideKeyId = null }) {
    const config = loadConfig();
    const attempts = buildAttemptChain(config, overrideProviderId, overrideKeyId);

    if (!attempts.length) {
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

        // Advance per-provider round-robin cursor to next key for the next request
        const enabledKeys = pCfg.keys.filter(k => k.enabled && k.key);
        if (enabledKeys.length > 0) {
          const usedPos = enabledKeys.findIndex(k => k.id === keyObj.id);
          pCfg.rrIndex = (usedPos + 1) % enabledKeys.length;
        }

        // Update success telemetry & clear cooldown
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
        // Longer cooldown for invalid auth/quota (401/402/403), standard cooldown for 429/5xx/network
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
          failover: `Cooldown ${cooldownSec}s (${err.message.slice(0, 70)})`
        });
      }
    }

    const finalErr = new Error('All configured API keys failed or hit rate limits: ' + errors.join(' | '));
    finalErr.code = 'ALL_FAILED';
    throw finalErr;
  }

  // Expose public API
  global.FreeLLMRouter = {
    ADMIN_PASSKEY,
    PROVIDER_CATALOG,
    loadConfig,
    saveConfig,
    hydrateFromServerIfAvailable,
    createKeyEntry,
    maskKey,
    countActiveKeys,
    getKeyCooldownRemaining,
    loadLogs,
    clearLogs,
    chat
  };
})(window);
