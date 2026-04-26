/* ═══════════════════════════════════════════════════════════
   DocOS CLOUD — Zero-login device sync
   - Generates a private device UUID on first run (the "recovery key")
   - Auto-syncs state JSON to docos_state, keyed by that UUID
   - No email, no password, no magic link — just works
   - To use on another device: paste the recovery key
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://dlbnjiomldlijbshxysh.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_2Z8I6H60MJdoOpwFBCbyJg_wa8kbDVP';
  var LS_STATE = 'docos_v3';
  var LS_DEVICE_ID = 'docos_cloud_device_id';
  var LS_LAST_SYNC = 'docos_cloud_last_sync';
  var LS_AUTOSYNC = 'docos_cloud_autosync';

  var sb = null;
  var deviceId = null;
  var pushTimer = null;
  var pushing = false;
  var lastPushedHash = null;
  var autosync = localStorage.getItem(LS_AUTOSYNC) !== '0';

  function $(id) { return document.getElementById(id); }
  function fmtBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function timeAgo(ts) {
    if (!ts) return 'никога';
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return Math.floor(s) + 'с';
    if (s < 3600) return Math.floor(s / 60) + 'м';
    if (s < 86400) return Math.floor(s / 3600) + 'ч';
    return Math.floor(s / 86400) + 'д';
  }
  function toast(msg, type) {
    var t = $('docosCloudToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'docosCloudToast';
      t.className = 'cloud-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.dataset.type = type || 'info';
    t.classList.add('cloud-toast--show');
    clearTimeout(t.__hideTimer);
    t.__hideTimer = setTimeout(function () { t.classList.remove('cloud-toast--show'); }, 2800);
  }

  // ── Device UUID ─────────────────────────────────────────
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  function getDeviceId() {
    return localStorage.getItem(LS_DEVICE_ID) || null;
  }
  function createNewDeviceId() {
    var id = uuid();
    localStorage.setItem(LS_DEVICE_ID, id);
    return id;
  }
  function setDeviceId(newId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newId)) {
      toast('Невалиден код', 'err');
      return false;
    }
    localStorage.setItem(LS_DEVICE_ID, newId.toLowerCase());
    deviceId = newId.toLowerCase();
    return true;
  }

  // ── Supabase ────────────────────────────────────────────
  function loadSupabaseLib() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var tries = [
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
        'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js'
      ];
      var idx = 0;
      function attempt() {
        if (idx >= tries.length) return reject(new Error('Supabase библиотеката не се зарежда'));
        var s = document.createElement('script');
        s.src = tries[idx++];
        s.onload = function () {
          if (window.supabase && window.supabase.createClient) resolve(window.supabase);
          else attempt();
        };
        s.onerror = attempt;
        document.head.appendChild(s);
      }
      var waitMs = 0;
      var poll = setInterval(function () {
        if (window.supabase && window.supabase.createClient) { clearInterval(poll); resolve(window.supabase); }
        else if ((waitMs += 100) > 800) { clearInterval(poll); attempt(); }
      }, 100);
    });
  }

  async function initClient() {
    if (sb) return sb;
    var lib = await loadSupabaseLib();
    sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return sb;
  }

  // ── State ───────────────────────────────────────────────
  function readLocalState() {
    try { return JSON.parse(localStorage.getItem(LS_STATE) || '{}'); }
    catch (_) { return {}; }
  }
  function writeLocalState(obj) {
    try { localStorage.setItem(LS_STATE, JSON.stringify(obj)); return true; }
    catch (_) { return false; }
  }
  function hashState(obj) {
    try {
      var s = JSON.stringify(obj);
      var h = 0;
      for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
      return String(h);
    } catch (_) { return String(Math.random()); }
  }

  async function pushState(silent) {
    if (pushing) return false;
    pushing = true;
    try {
      await initClient();
      var state = readLocalState();
      var hash = hashState(state);
      if (silent && hash === lastPushedHash) { pushing = false; return true; }
      var bytes = new Blob([JSON.stringify(state)]).size;
      var label = navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/);
      var ret = await sb.from('docos_state').upsert({
        user_id: deviceId,
        state: state,
        bytes_total: bytes,
        device_label: label ? label[0] : 'Web',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (ret.error) throw ret.error;
      lastPushedHash = hash;
      localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
      if (!silent) toast('☁️ Архивирано', 'ok');
      renderPanel();
      return true;
    } catch (e) {
      console.error('[cloud push]', e);
      if (!silent) toast('Грешка при качване', 'err');
      return false;
    } finally {
      pushing = false;
    }
  }

  async function pullState() {
    try {
      await initClient();
      var ret = await sb.from('docos_state').select('state, updated_at').eq('user_id', deviceId).maybeSingle();
      if (ret.error) throw ret.error;
      if (!ret.data || !ret.data.state) { toast('Няма архив за този код', 'warn'); return false; }
      writeLocalState(ret.data.state);
      toast('📥 Изтеглено — рестартирам...', 'ok');
      setTimeout(function () { location.reload(); }, 900);
      return true;
    } catch (e) {
      console.error('[cloud pull]', e);
      toast('Грешка при изтегляне', 'err');
      return false;
    }
  }

  function schedulePush(delay) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushState(true); }, delay || 2500);
  }

  // ── UI ──────────────────────────────────────────────────
  function ensureUi() {
    if ($('docosCloudFab')) return;
    var fab = document.createElement('button');
    fab.id = 'docosCloudFab';
    fab.className = 'cloud-fab';
    fab.title = 'Облачна памет';
    fab.innerHTML = '<span class="cloud-fab-ico">☁️</span><span class="cloud-fab-dot" id="docosCloudFabDot"></span>';
    fab.addEventListener('click', openPanel);
    document.body.appendChild(fab);

    var backdrop = document.createElement('div');
    backdrop.id = 'docosCloudBackdrop';
    backdrop.className = 'cloud-backdrop';
    backdrop.addEventListener('click', closePanel);
    document.body.appendChild(backdrop);

    var panel = document.createElement('div');
    panel.id = 'docosCloudPanel';
    panel.className = 'cloud-panel';
    panel.innerHTML = '<div class="cloud-handle"></div>' +
      '<div class="cloud-head"><span class="cloud-title">☁️ Мега Памет</span><button class="cloud-close" id="docosCloudClose">✕</button></div>' +
      '<div class="cloud-body" id="docosCloudBody"></div>';
    document.body.appendChild(panel);
    $('docosCloudClose').addEventListener('click', closePanel);
  }

  async function openPanel() {
    ensureUi();
    if (!deviceId) { showFirstRunModal(); return; }
    renderPanel();
    $('docosCloudBackdrop').classList.add('cloud-backdrop--show');
    $('docosCloudPanel').classList.add('cloud-panel--show');
  }
  function closePanel() {
    if (!$('docosCloudPanel')) return;
    $('docosCloudBackdrop').classList.remove('cloud-backdrop--show');
    $('docosCloudPanel').classList.remove('cloud-panel--show');
  }

  function renderPanel() {
    if (!$('docosCloudBody')) return;
    var dot = $('docosCloudFabDot');
    if (dot) dot.classList.add('cloud-fab-dot--on');

    var body = $('docosCloudBody');
    var lastSync = parseInt(localStorage.getItem(LS_LAST_SYNC) || '0', 10);
    var stateBytes = new Blob([localStorage.getItem(LS_STATE) || '']).size;

    body.innerHTML =
      '<div class="cloud-section cloud-section--row">' +
        '<div>' +
          '<div class="cloud-user">☁️ Активна</div>' +
          '<div class="cloud-sub">Последна синхр.: ' + timeAgo(lastSync) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="cloud-section">' +
        '<div class="cloud-stats">' +
          '<div class="cloud-stat"><div class="cloud-stat-num">' + fmtBytes(stateBytes) + '</div><div class="cloud-stat-label">Локално</div></div>' +
          '<div class="cloud-stat"><div class="cloud-stat-num" id="docosCloudCloudSize">—</div><div class="cloud-stat-label">В облака</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="cloud-section">' +
        '<div class="cloud-toggle"><label class="cloud-toggle-label">' +
          '<input type="checkbox" id="docosCloudAuto" ' + (autosync ? 'checked' : '') + '/>' +
          '<span class="cloud-toggle-slot"></span>' +
          '<span>Автоматична синхронизация</span>' +
        '</label></div>' +
      '</div>' +

      '<div class="cloud-section cloud-grid">' +
        '<button class="cloud-btn cloud-btn--primary" id="docosCloudPush">📤 Архивирай сега</button>' +
        '<button class="cloud-btn" id="docosCloudPull">📥 Възстанови</button>' +
      '</div>' +

      '<div class="cloud-section">' +
        '<label class="cloud-label">🔑 Твоят ключ за възстановяване</label>' +
        '<div class="cloud-blurb" style="margin-bottom:8px;font-size:.85em;opacity:.75">Запази го! С него възстановяваш всичко на друго устройство.</div>' +
        '<input type="text" id="docosCloudKey" class="cloud-input" value="' + deviceId + '" readonly style="font-family:monospace;font-size:.78em" onclick="this.select()"/>' +
        '<button class="cloud-btn" id="docosCloudCopy" style="margin-top:8px">📋 Копирай ключа</button>' +
      '</div>' +

      '<div class="cloud-section">' +
        '<label class="cloud-label">🔄 Свържи към друго устройство</label>' +
        '<div class="cloud-blurb" style="margin-bottom:8px;font-size:.85em;opacity:.75">Постави ключ от друго устройство, за да изтеглиш данните оттам.</div>' +
        '<input type="text" id="docosCloudRestoreKey" class="cloud-input" placeholder="постави ключа тук" style="font-family:monospace;font-size:.78em"/>' +
        '<button class="cloud-btn" id="docosCloudRestore" style="margin-top:8px">🔗 Свържи и изтегли</button>' +
      '</div>' +

      '<div class="cloud-foot">Без email · без парола · без магически линкове</div>';

    $('docosCloudAuto').addEventListener('change', function (e) {
      autosync = e.target.checked;
      localStorage.setItem(LS_AUTOSYNC, autosync ? '1' : '0');
      if (autosync) { schedulePush(500); toast('Авто синхронизация ВКЛ', 'ok'); }
      else { clearTimeout(pushTimer); toast('Авто синхронизация ИЗКЛ', 'info'); }
    });
    $('docosCloudPush').addEventListener('click', function () { pushState(false); });
    $('docosCloudPull').addEventListener('click', pullState);
    $('docosCloudCopy').addEventListener('click', function () {
      var inp = $('docosCloudKey');
      inp.select();
      try {
        navigator.clipboard.writeText(inp.value).then(function () { toast('📋 Копирано', 'ok'); });
      } catch (_) {
        document.execCommand('copy');
        toast('📋 Копирано', 'ok');
      }
    });
    $('docosCloudRestore').addEventListener('click', async function () {
      var k = ($('docosCloudRestoreKey').value || '').trim();
      if (!k) { toast('Постави ключ първо', 'warn'); return; }
      if (!confirm('Това ще ЗАМЕНИ текущите ти данни с тези от другото устройство. Продължи?')) return;
      if (!setDeviceId(k)) return;
      this.disabled = true; this.textContent = 'Изтеглям...';
      await pullState();
    });

    refreshCounts();
  }

  async function refreshCounts() {
    try {
      await initClient();
      var ret = await sb.from('docos_state').select('bytes_total').eq('user_id', deviceId).maybeSingle();
      var c = $('docosCloudCloudSize');
      if (c) c.textContent = (ret.data && ret.data.bytes_total) ? fmtBytes(ret.data.bytes_total) : '—';
    } catch (_) {}
  }

  // ── Auto-sync on localStorage change ────────────────────
  var origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    var ret = origSetItem.apply(this, arguments);
    if (k === LS_STATE && autosync) schedulePush(2500);
    return ret;
  };

  // ── First-run modal (when no device key exists) ─────────
  function showFirstRunModal() {
    if ($('docosFirstRun')) return;
    var m = document.createElement('div');
    m.id = 'docosFirstRun';
    m.className = 'cloud-firstrun';
    m.innerHTML =
      '<div class="cloud-firstrun-card">' +
        '<div class="cloud-firstrun-ico">☁️</div>' +
        '<div class="cloud-firstrun-title">Облачна памет</div>' +
        '<div class="cloud-firstrun-sub">Първо отваряне в този браузър. Избери:</div>' +
        '<button class="cloud-btn cloud-btn--primary" id="docosFirstRunNew">🆕 Ново устройство — създай ключ</button>' +
        '<div class="cloud-firstrun-or">— или —</div>' +
        '<div class="cloud-firstrun-blurb">Имаш ключ от друг браузър/телефон? Постави го тук и веднага синхронизираш всичко:</div>' +
        '<input type="text" id="docosFirstRunKey" class="cloud-input" placeholder="постави ключа тук" style="font-family:monospace;font-size:.78em"/>' +
        '<button class="cloud-btn" id="docosFirstRunRestore" style="margin-top:8px">🔗 Свържи към съществуващия ми облак</button>' +
      '</div>';
    document.body.appendChild(m);

    $('docosFirstRunNew').addEventListener('click', function () {
      deviceId = createNewDeviceId();
      m.remove();
      toast('☁️ Облакът активиран', 'ok');
      startSync();
    });
    $('docosFirstRunRestore').addEventListener('click', async function () {
      var k = ($('docosFirstRunKey').value || '').trim();
      if (!k) { toast('Постави ключ първо', 'warn'); return; }
      if (!setDeviceId(k)) return;
      this.disabled = true; this.textContent = 'Свързвам...';
      await initClient();
      var ret = await sb.from('docos_state').select('state').eq('user_id', deviceId).maybeSingle();
      if (ret.error || !ret.data || !ret.data.state) {
        toast('Няма архив за този ключ', 'err');
        localStorage.removeItem(LS_DEVICE_ID);
        deviceId = null;
        this.disabled = false; this.textContent = '🔗 Свържи към съществуващия ми облак';
        return;
      }
      writeLocalState(ret.data.state);
      toast('📥 Свързан — рестартирам...', 'ok');
      setTimeout(function () { location.reload(); }, 1000);
    });
  }

  function startSync() {
    initClient().then(function () {
      var local = readLocalState();
      if (Object.keys(local).length === 0) {
        sb.from('docos_state').select('state').eq('user_id', deviceId).maybeSingle().then(function (r) {
          if (r.data && r.data.state && Object.keys(r.data.state).length > 0) {
            writeLocalState(r.data.state);
            toast('📥 Възстановени данни от облака', 'ok');
            setTimeout(function () { location.reload(); }, 1200);
          }
        }).catch(function () {});
      }
      if (autosync) schedulePush(3000);
    }).catch(function (e) { console.warn('[cloud init]', e); });
  }

  // ── Boot ────────────────────────────────────────────────
  function boot() {
    deviceId = getDeviceId();
    ensureUi();
    if (!deviceId) {
      showFirstRunModal();
    } else {
      startSync();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DocOSCloud = { pushState: pushState, pullState: pullState, openPanel: openPanel, getDeviceId: function () { return deviceId; } };
})();
