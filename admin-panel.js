/**
 * Shared Passkey-Protected FreeLLMAPI Admin Panel (Passkey: 8590584541)
 * Runs directly inside index.html (fixing file:/// localStorage isolation!)
 * and can also be mounted standalone on admin.html (/admin).
 */

(function (global) {
  const SESSION_UNLOCK_KEY = 'COACH_ADMIN_UNLOCKED_V1';
  let onCloseCallback = null;
  let cooldownTimer = null;
  let mounted = false;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function showAdminToast(msg) {
    const t = document.getElementById('admToast');
    if (!t) return;
    t.innerText = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
  }

  function injectStyles() {
    if (document.getElementById('admPanelStyles')) return;
    const style = document.createElement('style');
    style.id = 'admPanelStyles';
    style.textContent = `
      #admOverlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: linear-gradient(135deg, #0b132b 0%, #162040 55%, #12333d 100%);
        color: #f8fafc;
        font-family: 'Nunito', sans-serif;
        overflow-y: auto;
        display: none;
      }
      #admOverlay * { box-sizing: border-box; user-select: text; }
      #admLockScreen {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .adm-lock-card {
        background: rgba(19, 29, 58, 0.95);
        border: 1.5px solid rgba(118, 185, 0, 0.45);
        border-radius: 24px;
        padding: 36px 32px;
        width: 100%;
        max-width: 420px;
        text-align: center;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      }
      .adm-lock-icon {
        width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 18px;
        background: linear-gradient(135deg, #76b900, #3e6b00);
        display: flex; align-items: center; justify-content: center; font-size: 1.9rem;
      }
      .adm-passkey-input {
        width: 100%; padding: 14px 16px; border-radius: 14px;
        border: 2px solid rgba(255,255,255,0.14); background: #0d152a; color: #fff;
        font-size: 1.25rem; font-family: monospace; letter-spacing: 4px; text-align: center;
        outline: none; margin: 16px 0 10px;
      }
      .adm-passkey-input:focus { border-color: #76b900; }
      .adm-header {
        background: rgba(11, 19, 43, 0.9);
        backdrop-filter: blur(12px);
        border-bottom: 1.5px solid rgba(118, 185, 0, 0.35);
        padding: 14px 24px;
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 12px; position: sticky; top: 0; z-index: 10;
      }
      .adm-container {
        max-width: 1360px; margin: 0 auto; padding: 22px;
        display: flex; flex-direction: column; gap: 20px;
      }
      .adm-btn {
        padding: 9px 15px; border-radius: 10px; border: none; font-weight: 800;
        font-size: 0.86rem; cursor: pointer; display: inline-flex; align-items: center;
        justify-content: center; gap: 6px; font-family: 'Nunito', sans-serif;
      }
      .adm-btn-primary { background: #76b900; color: #0b132b; }
      .adm-btn-primary:hover { background: #8ed900; }
      .adm-btn-sec { background: rgba(255,255,255,0.11); color: #fff; border: 1px solid rgba(255,255,255,0.15); }
      .adm-btn-sec:hover { background: rgba(255,255,255,0.2); }
      .adm-btn-danger { background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.35); }
      .adm-btn-sm { padding: 5px 10px; font-size: 0.78rem; border-radius: 8px; }
      .adm-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
      .adm-stat {
        background: rgba(19, 29, 58, 0.88); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px; padding: 15px 18px;
      }
      .adm-panel {
        background: rgba(19, 29, 58, 0.9); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 20px; padding: 20px;
      }
      .adm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 18px; }
      @media (max-width: 540px) { .adm-grid { grid-template-columns: 1fr; } }
      .adm-card {
        background: rgba(19, 29, 58, 0.94); border: 1.5px solid rgba(255,255,255,0.12);
        border-radius: 20px; padding: 18px; display: flex; flex-direction: column; gap: 13px;
      }
      .adm-input, .adm-select, .adm-textarea {
        width: 100%; padding: 10px 12px; border-radius: 10px;
        border: 1.5px solid rgba(255,255,255,0.14); background: #0d152a; color: #fff;
        font-family: 'Nunito', sans-serif; font-size: 0.9rem; outline: none;
      }
      .adm-input:focus, .adm-select:focus, .adm-textarea:focus { border-color: #76b900; }
      .adm-add-row { display: grid; grid-template-columns: 120px 1fr auto; gap: 8px; }
      @media (max-width: 600px) { .adm-add-row { grid-template-columns: 1fr; } }
      .adm-key-item {
        background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
        border-radius: 12px; padding: 10px 12px; display: flex; align-items: center;
        justify-content: space-between; gap: 10px; flex-wrap: wrap;
      }
      .adm-pill {
        font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 12px; text-transform: uppercase;
      }
      .adm-st-ready { background: rgba(34,197,94,0.2); color: #86efac; }
      .adm-st-cool { background: rgba(245,158,11,0.22); color: #fcd34d; }
      .adm-st-off { background: rgba(148,163,184,0.2); color: #cbd5e1; }
      .adm-playground-out {
        margin-top: 12px; background: #0d152a; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px; padding: 14px; font-family: monospace; font-size: 0.85rem;
        white-space: pre-wrap; color: #e2e8f0; max-height: 250px; overflow-y: auto;
      }
      .adm-log-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .adm-log-table th, .adm-log-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .adm-log-table th { color: #94a3b8; text-transform: uppercase; font-size: 0.72rem; }
      #admToast {
        position: fixed; bottom: 24px; right: 24px; z-index: 10001;
        background: #1e293b; border: 1.5px solid #76b900; color: #fff;
        padding: 12px 18px; border-radius: 12px; font-weight: 700; font-size: 0.9rem;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45); display: none;
      }
    `;
    document.head.appendChild(style);
  }

  function mountDom() {
    if (mounted) return;
    mounted = true;
    injectStyles();

    const wrapper = document.createElement('div');
    wrapper.id = 'admOverlay';
    wrapper.innerHTML = `
      <section id="admLockScreen">
        <div class="adm-lock-card" id="admLockCard">
          <div class="adm-lock-icon">🔐</div>
          <h1 style="font-family:'Fredoka',sans-serif; font-size:1.55rem; margin-bottom:6px;">Coach Admin Panel</h1>
          <p style="color:#94a3b8; font-size:0.9rem;">Enter administrator passkey to manage FreeLLMAPI providers &amp; multi-key rotation.</p>
          <form id="admLockForm">
            <input type="password" id="admPasskeyInput" class="adm-passkey-input" placeholder="••••••••••" autocomplete="off" inputmode="numeric" />
            <div id="admLockError" style="color:#fca5a5; font-size:0.86rem; font-weight:700; min-height:22px; margin-bottom:10px;"></div>
            <button type="submit" class="adm-btn adm-btn-primary" style="width:100%; padding:13px; font-size:1rem;">🔓 Unlock Admin Dashboard</button>
          </form>
          <button class="adm-btn adm-btn-sec" id="admBackBtn1" style="width:100%; padding:12px; margin-top:12px;">← Back to Talking Statue</button>
        </div>
      </section>

      <div id="admDashboard" style="display:none;">
        <div class="adm-header">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:1.5rem;">🗿</span>
            <div>
              <div style="font-family:'Fredoka',sans-serif; font-size:1.3rem; display:flex; align-items:center; gap:8px;">
                English Coach Admin
                <span style="font-size:0.7rem; background:rgba(118,185,0,0.2); border:1px solid #76b900; color:#bef264; padding:2px 8px; border-radius:8px; font-weight:800;">FREELMAPI ROUTER</span>
              </div>
              <div style="font-size:0.78rem; color:#94a3b8;">Multi-Provider &amp; Multi-Key Rotation (NVIDIA • Groq • Google AI Studio • OpenRouter)</div>
            </div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="adm-btn adm-btn-sec" onclick="AdminPanel.clearCooldowns()">♻️ Reset Cooldowns</button>
            <button class="adm-btn adm-btn-sec" onclick="AdminPanel.exportJson()">⬇️ Export JSON</button>
            <button class="adm-btn adm-btn-sec" onclick="document.getElementById('admImportInput').click()">⬆️ Import JSON</button>
            <input type="file" id="admImportInput" accept=".json" style="display:none" onchange="AdminPanel.importJson(event)" />
            <button class="adm-btn adm-btn-primary" id="admBackBtn2">🗿 Return to Talking Statue</button>
            <button class="adm-btn adm-btn-danger" onclick="AdminPanel.lock()">🔒 Lock</button>
          </div>
        </div>

        <div class="adm-container">
          <div class="adm-stats">
            <div class="adm-stat"><div style="font-size:0.75rem; color:#94a3b8; font-weight:800;">ACTIVE API KEYS</div><div id="admStatKeys" style="font-family:'Fredoka',sans-serif; font-size:1.8rem; color:#76b900;">0</div></div>
            <div class="adm-stat"><div style="font-size:0.75rem; color:#94a3b8; font-weight:800;">TOTAL REQUESTS</div><div id="admStatReq" style="font-family:'Fredoka',sans-serif; font-size:1.8rem;">0</div></div>
            <div class="adm-stat"><div style="font-size:0.75rem; color:#94a3b8; font-weight:800;">SUCCESS RATE</div><div id="admStatRate" style="font-family:'Fredoka',sans-serif; font-size:1.8rem; color:#4ade80;">100%</div></div>
            <div class="adm-stat"><div style="font-size:0.75rem; color:#94a3b8; font-weight:800;">AUTO-FAILOVERS</div><div id="admStatFail" style="font-family:'Fredoka',sans-serif; font-size:1.8rem; color:#f4d06f;">0</div></div>
          </div>

          <div class="adm-panel">
            <div style="font-family:'Fredoka',sans-serif; font-size:1.15rem; margin-bottom:12px;">🔀 FreeLLMAPI Routing Strategy &amp; Failover</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
              <div>
                <label style="display:block; font-size:0.76rem; font-weight:800; color:#94a3b8; margin-bottom:5px;">ROUTING MODE</label>
                <select id="admStrategy" class="adm-select" onchange="AdminPanel.saveGlobal()">
                  <option value="auto:balanced">Auto: Balanced (Groq → Google → NVIDIA → OpenRouter)</option>
                  <option value="auto:fast">Auto: Fastest Voice (Groq → Google → NVIDIA → OpenRouter)</option>
                  <option value="auto:smart">Auto: Smartest Coach (NVIDIA → Google → Groq → OpenRouter)</option>
                  <option value="round-robin">Global Round-Robin (Rotate All Providers Equally)</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.76rem; font-weight:800; color:#94a3b8; margin-bottom:5px;">PREFERRED PRIMARY PROVIDER</label>
                <select id="admPinned" class="adm-select" onchange="AdminPanel.saveGlobal()">
                  <option value="auto">Automatic (Follow Routing Mode)</option>
                  <option value="nvidia">NVIDIA NIM First (Failover to others)</option>
                  <option value="groq">Groq Cloud First (Failover to others)</option>
                  <option value="google">Google AI Studio First (Failover to others)</option>
                  <option value="openrouter">OpenRouter First (Failover to others)</option>
                </select>
              </div>
              <div>
                <label style="display:block; font-size:0.76rem; font-weight:800; color:#94a3b8; margin-bottom:5px;">COOLDOWN (SECONDS)</label>
                <input type="number" id="admCooldown" class="adm-input" min="10" max="600" value="60" onchange="AdminPanel.saveGlobal()" />
              </div>
            </div>
          </div>

          <div class="adm-grid" id="admProvidersGrid"></div>

          <div class="adm-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
              <div style="font-family:'Fredoka',sans-serif; font-size:1.15rem;">🧪 Live Router Playground</div>
              <button class="adm-btn adm-btn-primary adm-btn-sm" onclick="AdminPanel.runPlayground()">▶ Send Test Through Router</button>
            </div>
            <input type="text" id="admPlayPrompt" class="adm-input" value="Yesterday I go to Kozhikode beach with my father and eat banana chips." />
            <div class="adm-playground-out" id="admPlayOut">Click "⚡ Test" on any key or "Send Test Through Router" to verify live responses.</div>
          </div>

          <div class="adm-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-family:'Fredoka',sans-serif; font-size:1.15rem;">📜 Recent Routing &amp; Failover Telemetry</div>
              <button class="adm-btn adm-btn-sec adm-btn-sm" onclick="AdminPanel.clearLogs()">🗑️ Clear Logs</button>
            </div>
            <div style="overflow-x:auto;">
              <table class="adm-log-table">
                <thead><tr><th>Time</th><th>Status</th><th>Provider</th><th>Model</th><th>Key</th><th>Latency</th><th>Note</th></tr></thead>
                <tbody id="admLogsBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div id="admToast"></div>
    `;
    document.body.appendChild(wrapper);

    document.getElementById('admLockForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('admPasskeyInput');
      const err = document.getElementById('admLockError');
      if (inp.value.trim() === FreeLLMRouter.ADMIN_PASSKEY) {
        sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
        err.innerText = '';
        showDashboard();
      } else {
        err.innerText = '❌ Incorrect passkey. Access denied.';
        inp.value = '';
        inp.focus();
      }
    });

    const handleClose = () => close();
    document.getElementById('admBackBtn1').onclick = handleClose;
    document.getElementById('admBackBtn2').onclick = handleClose;
  }

  function renderAll() {
    const cfg = FreeLLMRouter.loadConfig();

    document.getElementById('admStatKeys').innerText = FreeLLMRouter.countActiveKeys(cfg);
    const tot = cfg.stats.totalRequests || 0;
    const ok = cfg.stats.totalSuccess || 0;
    document.getElementById('admStatReq').innerText = tot;
    document.getElementById('admStatRate').innerText = `${tot > 0 ? Math.round((ok / tot) * 100) : 100}%`;
    document.getElementById('admStatFail').innerText = cfg.stats.totalFailovers || 0;

    document.getElementById('admStrategy').value = cfg.strategy || 'auto:balanced';
    document.getElementById('admPinned').value = cfg.pinnedProvider || 'auto';
    document.getElementById('admCooldown').value = cfg.cooldownSeconds || 60;

    const grid = document.getElementById('admProvidersGrid');
    grid.innerHTML = '';

    for (const pid of ['nvidia', 'groq', 'google', 'openrouter']) {
      const meta = FreeLLMRouter.PROVIDER_CATALOG[pid];
      const pCfg = cfg.providers[pid];

      const merged = [...meta.models];
      (pCfg.liveModels || []).forEach(lm => {
        if (!merged.some(m => m.id === lm.id)) merged.push(lm);
      });
      if (pCfg.model && !merged.some(m => m.id === pCfg.model)) {
        merged.unshift({ id: pCfg.model, label: `${pCfg.model} (Custom)` });
      }
      const modelOptions = merged.map(m =>
        `<option value="${escapeHtml(m.id)}" ${pCfg.model === m.id ? 'selected' : ''}>${escapeHtml(m.label)}</option>`
      ).join('');

      const keysHtml = !pCfg.keys.length
        ? `<div style="text-align:center; color:#94a3b8; font-size:0.84rem; padding:12px; border-radius:10px; background:rgba(0,0,0,0.2);">No keys saved for ${meta.name} yet.</div>`
        : pCfg.keys.map((kObj, idx) => {
            const cool = FreeLLMRouter.getKeyCooldownRemaining(kObj);
            const pillClass = !kObj.enabled ? 'adm-st-off' : (cool > 0 ? 'adm-st-cool' : 'adm-st-ready');
            const pillText = !kObj.enabled ? 'Disabled' : (cool > 0 ? `Cooldown ${cool}s` : 'Ready');
            return `
              <div class="adm-key-item">
                <div style="min-width:170px;">
                  <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:0.88rem;">
                    <span>#${idx + 1} ${escapeHtml(kObj.label)}</span>
                    <span class="adm-pill ${pillClass}" data-adm-pill="${pid}:${kObj.id}">${pillText}</span>
                  </div>
                  <div style="font-family:monospace; font-size:0.78rem; color:#94a3b8;">
                    ${FreeLLMRouter.maskKey(kObj.key)} • Calls: ${kObj.requests || 0} • Err: ${kObj.errors || 0}
                  </div>
                  ${kObj.lastError ? `<div style="font-size:0.73rem; color:#fca5a5;">Err: ${escapeHtml(kObj.lastError.slice(0, 75))}</div>` : ''}
                </div>
                <div style="display:flex; gap:6px;">
                  <button class="adm-btn adm-btn-sec adm-btn-sm" onclick="AdminPanel.testKey('${pid}','${kObj.id}')">⚡ Test</button>
                  <button class="adm-btn adm-btn-sec adm-btn-sm" onclick="AdminPanel.toggleKey('${pid}','${kObj.id}')">${kObj.enabled ? 'Pause' : 'Enable'}</button>
                  <button class="adm-btn adm-btn-danger adm-btn-sm" onclick="AdminPanel.deleteKey('${pid}','${kObj.id}')">✕</button>
                </div>
              </div>
            `;
          }).join('');

      const card = document.createElement('div');
      card.className = 'adm-card';
      card.style.borderTop = `4px solid ${meta.color}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="width:13px; height:13px; border-radius:50%; background:${meta.color};"></span>
            <div>
              <div style="font-family:'Fredoka',sans-serif; font-size:1.12rem;">${meta.name} <span style="font-size:0.7rem; background:rgba(255,255,255,0.1); padding:2px 7px; border-radius:7px; color:#cbd5e1;">${meta.badge}</span></div>
              <a href="${meta.getKeyUrl}" target="_blank" style="font-size:0.76rem; color:#7dd3fc; text-decoration:none; font-weight:700;">Get Free API Key ↗</a>
            </div>
          </div>
          <label style="display:inline-flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:700; cursor:pointer;">
            <input type="checkbox" ${pCfg.enabled ? 'checked' : ''} onchange="AdminPanel.toggleProvider('${pid}', this.checked)" style="width:17px; height:17px; accent-color:#76b900;" />
            <span>${pCfg.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>

        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label style="font-size:0.75rem; font-weight:800; color:#94a3b8;">ACTIVE MODEL</label>
            <button class="adm-btn adm-btn-sec adm-btn-sm" onclick="AdminPanel.fetchModels('${pid}')">🔄 Fetch Live Models</button>
          </div>
          <select class="adm-select" onchange="AdminPanel.setModel('${pid}', this.value)">${modelOptions}</select>
        </div>

        <div style="background:rgba(11,19,43,0.55); border:1px dashed rgba(255,255,255,0.18); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px;">
          <div style="font-size:0.76rem; font-weight:800; color:#94a3b8; display:flex; justify-content:space-between;">
            <span>ADD API KEY (${pCfg.keys.length} saved — auto-rotates)</span>
            <a href="#" onclick="event.preventDefault(); AdminPanel.toggleBulk('${pid}')" style="color:#7dd3fc; text-decoration:none;">+ Bulk Paste Multiple</a>
          </div>
          <div class="adm-add-row">
            <input type="text" id="admLabel-${pid}" class="adm-input" placeholder="Label (Key 1)" autocomplete="off" />
            <input type="text" id="admKey-${pid}" class="adm-input" style="font-family:monospace;" placeholder="${meta.keyPlaceholder}" autocomplete="off" spellcheck="false" onkeydown="if(event.key==='Enter'){event.preventDefault();AdminPanel.addKey('${pid}');}" />
            <button class="adm-btn adm-btn-primary" onclick="AdminPanel.addKey('${pid}')">+ Add</button>
          </div>
          <div id="admBulk-${pid}" style="display:none; margin-top:4px;">
            <textarea id="admBulkTxt-${pid}" class="adm-textarea" placeholder="Paste multiple ${meta.name} keys (one per line)..."></textarea>
            <button class="adm-btn adm-btn-sec adm-btn-sm" style="margin-top:6px;" onclick="AdminPanel.addBulk('${pid}')">📥 Add All Keys</button>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">${keysHtml}</div>
      `;
      grid.appendChild(card);
    }

    renderLogs();
  }

  function renderLogs() {
    const logs = FreeLLMRouter.loadLogs();
    const tbody = document.getElementById('admLogsBody');
    if (!tbody) return;
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:14px;">No requests logged yet.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${escapeHtml(l.time)}</td>
        <td><span class="adm-pill ${l.status === 'ok' ? 'adm-st-ready' : 'adm-st-cool'}">${l.status === 'ok' ? 'OK' : 'FAIL'}</span></td>
        <td><strong>${escapeHtml(l.provider)}</strong></td>
        <td style="font-family:monospace; font-size:0.76rem;">${escapeHtml(l.model)}</td>
        <td>${escapeHtml(l.keyLabel)}</td>
        <td>${l.latencyMs ? l.latencyMs + 'ms' : '-'}</td>
        <td style="color:${l.status === 'ok' ? '#86efac' : '#fca5a5'};">${escapeHtml(l.failover)}</td>
      </tr>
    `).join('');
  }

  function refreshPillsInPlace() {
    const cfg = FreeLLMRouter.loadConfig();
    Object.keys(cfg.providers || {}).forEach(pid => {
      (cfg.providers[pid].keys || []).forEach(kObj => {
        const pill = document.querySelector(`[data-adm-pill="${pid}:${kObj.id}"]`);
        if (!pill) return;
        const cool = FreeLLMRouter.getKeyCooldownRemaining(kObj);
        if (!kObj.enabled) { pill.className = 'adm-pill adm-st-off'; pill.innerText = 'Disabled'; }
        else if (cool > 0) { pill.className = 'adm-pill adm-st-cool'; pill.innerText = `Cooldown ${cool}s`; }
        else { pill.className = 'adm-pill adm-st-ready'; pill.innerText = 'Ready'; }
      });
    });
  }

  async function showDashboard() {
    document.getElementById('admLockScreen').style.display = 'none';
    document.getElementById('admDashboard').style.display = 'block';
    await FreeLLMRouter.hydrateFromServerIfAvailable();
    renderAll();
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(refreshPillsInPlace, 5000);
  }

  function open(onClose) {
    onCloseCallback = onClose || null;
    mountDom();
    document.getElementById('admOverlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    if (sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1') {
      showDashboard();
    } else {
      document.getElementById('admDashboard').style.display = 'none';
      document.getElementById('admLockScreen').style.display = 'flex';
      setTimeout(() => {
        const inp = document.getElementById('admPasskeyInput');
        if (inp) inp.focus();
      }, 60);
    }
  }

  function close() {
    clearInterval(cooldownTimer);
    const ov = document.getElementById('admOverlay');
    if (ov) ov.style.display = 'none';
    document.body.style.overflow = '';
    if (typeof onCloseCallback === 'function') onCloseCallback();
  }

  function lock() {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    clearInterval(cooldownTimer);
    document.getElementById('admDashboard').style.display = 'none';
    document.getElementById('admLockScreen').style.display = 'flex';
    const inp = document.getElementById('admPasskeyInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  global.AdminPanel = {
    open,
    close,
    lock,
    saveGlobal() {
      const cfg = FreeLLMRouter.loadConfig();
      cfg.strategy = document.getElementById('admStrategy').value;
      cfg.pinnedProvider = document.getElementById('admPinned').value;
      cfg.cooldownSeconds = Math.max(10, parseInt(document.getElementById('admCooldown').value, 10) || 60);
      FreeLLMRouter.saveConfig(cfg);
      showAdminToast('✅ Routing settings saved!');
    },
    toggleProvider(pid, enabled) {
      const cfg = FreeLLMRouter.loadConfig();
      cfg.providers[pid].enabled = enabled;
      FreeLLMRouter.saveConfig(cfg);
      renderAll();
    },
    setModel(pid, model) {
      const cfg = FreeLLMRouter.loadConfig();
      cfg.providers[pid].model = model;
      FreeLLMRouter.saveConfig(cfg);
      showAdminToast(`✅ Model set to ${model}`);
    },
    toggleBulk(pid) {
      const el = document.getElementById(`admBulk-${pid}`);
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    },
    addKey(pid) {
      const keyEl = document.getElementById(`admKey-${pid}`);
      const lblEl = document.getElementById(`admLabel-${pid}`);
      const rawKey = keyEl.value.trim();
      if (!rawKey) return showAdminToast('⚠️ Paste an API key first.');
      const cfg = FreeLLMRouter.loadConfig();
      const label = lblEl.value.trim() || `${FreeLLMRouter.PROVIDER_CATALOG[pid].name} #${cfg.providers[pid].keys.length + 1}`;
      cfg.providers[pid].keys.push(FreeLLMRouter.createKeyEntry(rawKey, label));
      FreeLLMRouter.saveConfig(cfg);
      renderAll();
      showAdminToast(`✅ Added "${label}" — ready for Statue!`);
    },
    addBulk(pid) {
      const ta = document.getElementById(`admBulkTxt-${pid}`);
      const lines = ta.value.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 5);
      if (!lines.length) return showAdminToast('⚠️ Paste one or more keys (one per line).');
      const cfg = FreeLLMRouter.loadConfig();
      lines.forEach(k => {
        cfg.providers[pid].keys.push(FreeLLMRouter.createKeyEntry(k, `${FreeLLMRouter.PROVIDER_CATALOG[pid].name} #${cfg.providers[pid].keys.length + 1}`));
      });
      FreeLLMRouter.saveConfig(cfg);
      renderAll();
      showAdminToast(`✅ Added ${lines.length} keys!`);
    },
    toggleKey(pid, keyId) {
      const cfg = FreeLLMRouter.loadConfig();
      const k = cfg.providers[pid].keys.find(x => x.id === keyId);
      if (!k) return;
      k.enabled = !k.enabled;
      FreeLLMRouter.saveConfig(cfg);
      renderAll();
    },
    deleteKey(pid, keyId) {
      const cfg = FreeLLMRouter.loadConfig();
      cfg.providers[pid].keys = cfg.providers[pid].keys.filter(x => x.id !== keyId);
      FreeLLMRouter.saveConfig(cfg);
      renderAll();
      showAdminToast('🗑️ Key deleted.');
    },
    clearCooldowns() {
      const cfg = FreeLLMRouter.loadConfig();
      Object.keys(cfg.providers).forEach(pid => cfg.providers[pid].keys.forEach(k => { k.cooldownUntil = 0; k.lastError = ''; }));
      FreeLLMRouter.saveConfig(cfg);
      renderAll();
      showAdminToast('♻️ Cooldowns cleared!');
    },
    async fetchModels(pid) {
      const name = FreeLLMRouter.PROVIDER_CATALOG[pid].name;
      showAdminToast(`🔄 Fetching live models for ${name}...`);
      try {
        const list = await FreeLLMRouter.fetchLiveModels(pid);
        renderAll();
        showAdminToast(`✅ Loaded ${list.length} live models!`);
      } catch (err) {
        showAdminToast(`❌ ${err.message.slice(0, 85)}`);
      }
    },
    async testKey(pid, keyId) {
      const cfg = FreeLLMRouter.loadConfig();
      const name = FreeLLMRouter.PROVIDER_CATALOG[pid].name;
      const out = document.getElementById('admPlayOut');
      showAdminToast(`⚡ Testing ${name}...`);
      out.innerText = `⏳ Testing ${name} (${cfg.providers[pid].model})...`;
      try {
        const res = await FreeLLMRouter.chat({
          overrideProviderId: pid,
          overrideKeyId: keyId,
          jsonMode: false,
          maxTokens: 256,
          messages: [
            { role: 'system', content: 'Reply in one short friendly sentence.' },
            { role: 'user', content: 'Say hello to Kerala students!' }
          ]
        });
        renderAll();
        out.innerText = `✅ ${name} Key Works!\nModel   : ${res.model}\nKey     : ${res.keyLabel}\nLatency : ${res.latencyMs} ms\nReply   : ${res.content}`;
        showAdminToast(`✅ ${name} OK! (${res.latencyMs}ms)`);
      } catch (err) {
        renderAll();
        out.innerText = `❌ ${name} Key Failed:\n${err.message}`;
        showAdminToast(`❌ Failed: ${err.message.slice(0, 85)}`);
      }
    },
    async runPlayground() {
      const out = document.getElementById('admPlayOut');
      const prompt = document.getElementById('admPlayPrompt').value.trim();
      out.innerText = '⏳ Routing through FreeLLMAPI engine...';
      try {
        const res = await FreeLLMRouter.chat({
          jsonMode: true,
          maxTokens: 450,
          messages: [
            { role: 'system', content: 'You are Coach Arya for Kerala school students. Return JSON: {"spoken":"short 2 sentence reply","correction":"fix","tip":"tip","student_input_rating":"Good"}' },
            { role: 'user', content: prompt }
          ]
        });
        renderAll();
        out.innerText = `✅ Routed Successfully!\nProvider : ${res.providerName}\nModel    : ${res.model}\nKey Used : ${res.keyLabel}\nLatency  : ${res.latencyMs} ms\n\n${res.content}`;
      } catch (err) {
        renderAll();
        out.innerText = `❌ Router Error:\n${err.message}`;
      }
    },
    clearLogs() { FreeLLMRouter.clearLogs(); renderLogs(); },
    exportJson() {
      const blob = new Blob([JSON.stringify(FreeLLMRouter.loadConfig(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'kerala-coach-freellmapi-keys.json'; a.click();
      URL.revokeObjectURL(url);
    },
    importJson(e) {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed.providers) throw new Error('Invalid');
          FreeLLMRouter.saveConfig(parsed);
          renderAll();
          showAdminToast('⬆️ Keys imported!');
        } catch { showAdminToast('❌ Invalid JSON file.'); }
      };
      r.readAsText(f);
    }
  };
})(window);
