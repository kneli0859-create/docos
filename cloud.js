/* ═══════════════════════════════════════════════════════════
   DocOS CLOUD — Supabase mega-memory layer
   - Magic-link email auth (passwordless)
   - State JSON sync to docos_state table
   - File asset sync to docos-assets storage bucket
   - Auto-sync on change (debounced)
   - All scoped per user via RLS, files prefixed by auth.uid()
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://dlbnjiomldlijbshxysh.supabase.co';
  var SUPABASE_ANON = 'sb_publishable_2Z8I6H60MJdoOpwFBCbyJg_wa8kbDVP';
  var BUCKET = 'docos-assets';
  var LS_STATE = 'docos_v3';
  var LS_AUTOSYNC = 'docos_cloud_autosync';
  var LS_LAST_SYNC = 'docos_cloud_last_sync';
  var IDB_NAME = 'docos_assets';
  var IDB_STORE = 'assets';

  var sb = null;
  var session = null;
  var autosync = localStorage.getItem(LS_AUTOSYNC) === '1';
  var pushTimer = null;
  var pushing = false;
  var lastPushedHash = null;

  function $(id) { return document.getElementById(id); }
  function fmtBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
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

  // ── Supabase client bootstrap ───────────────────────────
  function loadSupabaseLib() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = function () { resolve(window.supabase); };
      s.onerror = function () { reject(new Error('Supabase lib failed to load')); };
      document.head.appendChild(s);
    });
  }

  async function initClient() {
    if (sb) return sb;
    var lib = await loadSupabaseLib();
    sb = lib.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'docos-cloud-auth' }
    });
    var got = await sb.auth.getSession();
    session = got.data.session;
    sb.auth.onAuthStateChange(function (_evt, s) {
      session = s;
      renderPanel();
      if (s && autosync) schedulePush(800);
    });
    return sb;
  }

  // ── State sync ──────────────────────────────────────────
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
    if (!session) { if (!silent) toast('Влез в облака първо', 'warn'); return false; }
    if (pushing) return false;
    pushing = true;
    try {
      var state = readLocalState();
      var hash = hashState(state);
      if (silent && hash === lastPushedHash) { pushing = false; return true; }
      var bytes = new Blob([JSON.stringify(state)]).size;
      var label = navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/);
      var ret = await sb.from('docos_state').upsert({
        user_id: session.user.id,
        state: state,
        bytes_total: bytes,
        device_label: label ? label[0] : 'Web',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (ret.error) throw ret.error;
      lastPushedHash = hash;
      localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
      if (!silent) toast('☁️ Архивирано в облака', 'ok');
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
    if (!session) { toast('Влез в облака първо', 'warn'); return false; }
    try {
      var ret = await sb.from('docos_state').select('state, updated_at').eq('user_id', session.user.id).maybeSingle();
      if (ret.error) throw ret.error;
      if (!ret.data || !ret.data.state) { toast('Няма архив в облака', 'warn'); return false; }
      writeLocalState(ret.data.state);
      toast('📥 Изтеглено — приложението се рестартира', 'ok');
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

  // ── IndexedDB asset access ──────────────────────────────
  function openIdb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGetAll() {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbPut(rec) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(rec);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // ── Asset sync ──────────────────────────────────────────
  async function pushAssets(progressFn) {
    if (!session) { toast('Влез в облака първо', 'warn'); return false; }
    try {
      var assets = await idbGetAll();
      if (!assets.length) { toast('Няма локални файлове', 'warn'); return false; }

      var listed = await sb.storage.from(BUCKET).list(session.user.id, { limit: 1000 });
      var existing = {};
      if (listed.data) listed.data.forEach(function (f) { existing[f.name] = f.metadata && f.metadata.size; });

      var pushed = 0, skipped = 0, failed = 0, totalBytes = 0;
      for (var i = 0; i < assets.length; i++) {
        var a = assets[i];
        if (!a || !a.id) continue;
        var blob = a.blob || a.data || a.file;
        if (!(blob instanceof Blob)) continue;
        var path = session.user.id + '/' + a.id;
        var fileName = a.id;
        if (existing[fileName] && existing[fileName] === blob.size) { skipped++; continue; }
        var up = await sb.storage.from(BUCKET).upload(path, blob, {
          upsert: true,
          contentType: blob.type || 'application/octet-stream'
        });
        if (up.error) { failed++; console.warn('[cloud asset push fail]', a.id, up.error); }
        else { pushed++; totalBytes += blob.size || 0; }
        if (progressFn) progressFn(i + 1, assets.length);
      }
      toast('☁️ ' + pushed + ' качени · ' + skipped + ' пропуснати' + (failed ? ' · ' + failed + ' грешки' : ''), failed ? 'warn' : 'ok');
      localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
      renderPanel();
      return true;
    } catch (e) {
      console.error('[cloud asset push]', e);
      toast('Грешка при качване на файлове', 'err');
      return false;
    }
  }

  async function pullAssets(progressFn) {
    if (!session) { toast('Влез в облака първо', 'warn'); return false; }
    try {
      var listed = await sb.storage.from(BUCKET).list(session.user.id, { limit: 1000 });
      if (listed.error) throw listed.error;
      if (!listed.data || !listed.data.length) { toast('Няма файлове в облака', 'warn'); return false; }
      var pulled = 0, failed = 0;
      for (var i = 0; i < listed.data.length; i++) {
        var f = listed.data[i];
        var path = session.user.id + '/' + f.name;
        var dl = await sb.storage.from(BUCKET).download(path);
        if (dl.error || !dl.data) { failed++; continue; }
        try {
          await idbPut({ id: f.name, blob: dl.data, mime: dl.data.type, restoredFromCloud: true, restoredAt: Date.now() });
          pulled++;
        } catch (_) { failed++; }
        if (progressFn) progressFn(i + 1, listed.data.length);
      }
      toast('📥 ' + pulled + ' изтеглени' + (failed ? ' · ' + failed + ' грешки' : ''), failed ? 'warn' : 'ok');
      return true;
    } catch (e) {
      console.error('[cloud asset pull]', e);
      toast('Грешка при изтегляне на файлове', 'err');
      return false;
    }
  }

  // ── Auth ────────────────────────────────────────────────
  async function sendMagicLink(email) {
    await initClient();
    var ret = await sb.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (ret.error) { toast('Грешка: ' + ret.error.message, 'err'); return false; }
    toast('📧 Провери имейла за линка', 'ok');
    return true;
  }
  async function passwordAuth(email, password) {
    await initClient();
    var r = await sb.auth.signInWithPassword({ email: email, password: password });
    if (!r.error) { toast('☁️ Влязохте', 'ok'); return true; }
    var msg = (r.error && r.error.message) || '';
    if (/invalid login|invalid credentials/i.test(msg)) {
      var u = await sb.auth.signUp({ email: email, password: password });
      if (u.error) { toast('Грешка: ' + u.error.message, 'err'); return false; }
      if (u.data && u.data.session) { toast('☁️ Регистриран и влязохте', 'ok'); return true; }
      toast('📧 Провери имейла за потвърждение', 'warn');
      return false;
    }
    toast('Грешка: ' + msg, 'err');
    return false;
  }
  async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
    session = null;
    toast('Излязохте от облака', 'info');
    renderPanel();
  }

  // ── UI: floating button + panel ─────────────────────────
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
    panel.innerHTML = `
      <div class="cloud-handle"></div>
      <div class="cloud-head">
        <span class="cloud-title">☁️ Мега Памет</span>
        <button class="cloud-close" id="docosCloudClose">✕</button>
      </div>
      <div class="cloud-body" id="docosCloudBody"></div>
    `;
    document.body.appendChild(panel);
    $('docosCloudClose').addEventListener('click', closePanel);
  }

  async function openPanel() {
    ensureUi();
    await initClient();
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
    if (dot) dot.classList.toggle('cloud-fab-dot--on', !!session);

    var body = $('docosCloudBody');
    if (!session) {
      body.innerHTML = `
        <div class="cloud-section">
          <div class="cloud-blurb">Архивирай документи, термини и файлове в облака. Достъп от всякъде. Препоръчвам имейл + парола (работи веднага).</div>
        </div>
        <div class="cloud-section">
          <label class="cloud-label">Имейл</label>
          <input type="email" inputmode="email" autocomplete="email" id="docosCloudEmail" class="cloud-input" placeholder="ti@email.com"/>
          <label class="cloud-label">Парола (нова или съществуваща)</label>
          <input type="password" autocomplete="current-password" id="docosCloudPass" class="cloud-input" placeholder="мин. 6 символа"/>
          <button class="cloud-btn cloud-btn--primary" id="docosCloudPwLogin">🔑 Влез / Регистрирай</button>
          <button class="cloud-btn" id="docosCloudLogin" style="margin-top:8px">📧 Magic link (без парола)</button>
        </div>
        <div class="cloud-foot">Защитено с RLS · файловете ти са видими само за теб</div>
      `;
      $('docosCloudPwLogin').addEventListener('click', async function () {
        var em = ($('docosCloudEmail').value || '').trim();
        var pw = ($('docosCloudPass').value || '');
        if (!em || !/.+@.+\..+/.test(em)) { toast('Невалиден имейл', 'warn'); return; }
        if (!pw || pw.length < 6) { toast('Парола мин. 6 символа', 'warn'); return; }
        this.disabled = true; this.textContent = 'Влизам...';
        await passwordAuth(em, pw);
        this.disabled = false; this.textContent = '🔑 Влез / Регистрирай';
      });
      $('docosCloudLogin').addEventListener('click', async function () {
        var v = ($('docosCloudEmail').value || '').trim();
        if (!v || !/.+@.+\..+/.test(v)) { toast('Невалиден имейл', 'warn'); return; }
        this.disabled = true; this.textContent = 'Изпращам...';
        await sendMagicLink(v);
        this.disabled = false; this.textContent = '📧 Magic link (без парола)';
      });
      return;
    }

    var lastSync = parseInt(localStorage.getItem(LS_LAST_SYNC) || '0', 10);
    var stateBytes = new Blob([localStorage.getItem(LS_STATE) || '']).size;
    body.innerHTML = `
      <div class="cloud-section cloud-section--row">
        <div>
          <div class="cloud-user">${session.user.email || session.user.id.slice(0, 8)}</div>
          <div class="cloud-sub">Свързан · последно ${timeAgo(lastSync)}</div>
        </div>
        <button class="cloud-btn cloud-btn--ghost" id="docosCloudOut">Изход</button>
      </div>

      <div class="cloud-section">
        <div class="cloud-stats">
          <div class="cloud-stat"><div class="cloud-stat-num">${fmtBytes(stateBytes)}</div><div class="cloud-stat-label">Състояние</div></div>
          <div class="cloud-stat"><div class="cloud-stat-num" id="docosCloudAssetCount">—</div><div class="cloud-stat-label">Файлове</div></div>
          <div class="cloud-stat"><div class="cloud-stat-num" id="docosCloudCloudSize">—</div><div class="cloud-stat-label">В облака</div></div>
        </div>
      </div>

      <div class="cloud-section">
        <div class="cloud-toggle">
          <label class="cloud-toggle-label">
            <input type="checkbox" id="docosCloudAuto" ${autosync ? 'checked' : ''}/>
            <span class="cloud-toggle-slot"></span>
            <span>Авто синхронизация (на всяка промяна)</span>
          </label>
        </div>
      </div>

      <div class="cloud-section cloud-grid">
        <button class="cloud-btn cloud-btn--primary" id="docosCloudPushAll">📤 Архивирай всичко</button>
        <button class="cloud-btn" id="docosCloudPullState">📥 Възстанови състояние</button>
        <button class="cloud-btn" id="docosCloudPushAssets">🗂 Качи файлове</button>
        <button class="cloud-btn" id="docosCloudPullAssets">⬇️ Изтегли файлове</button>
      </div>

      <div class="cloud-progress" id="docosCloudProgress" style="display:none">
        <div class="cloud-progress-text" id="docosCloudProgressText">—</div>
        <div class="cloud-progress-bar"><div class="cloud-progress-fill" id="docosCloudProgressFill"></div></div>
      </div>

      <div class="cloud-foot">Файловете ти са в частен bucket с RLS. Никой друг не ги вижда.</div>
    `;

    $('docosCloudOut').addEventListener('click', signOut);
    $('docosCloudAuto').addEventListener('change', function (e) {
      autosync = e.target.checked;
      localStorage.setItem(LS_AUTOSYNC, autosync ? '1' : '0');
      if (autosync) { schedulePush(500); toast('Авто синхронизация включена', 'ok'); }
      else { clearTimeout(pushTimer); toast('Авто синхронизация изключена', 'info'); }
    });

    $('docosCloudPushAll').addEventListener('click', async function () {
      this.disabled = true;
      var prog = $('docosCloudProgress'); prog.style.display = 'block';
      $('docosCloudProgressText').textContent = 'Качвам състояние...';
      $('docosCloudProgressFill').style.width = '20%';
      await pushState();
      $('docosCloudProgressText').textContent = 'Качвам файлове...';
      await pushAssets(function (i, n) {
        $('docosCloudProgressText').textContent = 'Файлове ' + i + '/' + n;
        $('docosCloudProgressFill').style.width = (20 + (i / n) * 80) + '%';
      });
      $('docosCloudProgressFill').style.width = '100%';
      setTimeout(function () { prog.style.display = 'none'; }, 800);
      this.disabled = false;
      refreshCounts();
    });
    $('docosCloudPullState').addEventListener('click', pullState);
    $('docosCloudPushAssets').addEventListener('click', async function () {
      this.disabled = true;
      var prog = $('docosCloudProgress'); prog.style.display = 'block';
      await pushAssets(function (i, n) {
        $('docosCloudProgressText').textContent = 'Файлове ' + i + '/' + n;
        $('docosCloudProgressFill').style.width = (i / n * 100) + '%';
      });
      setTimeout(function () { prog.style.display = 'none'; }, 800);
      this.disabled = false;
      refreshCounts();
    });
    $('docosCloudPullAssets').addEventListener('click', async function () {
      this.disabled = true;
      var prog = $('docosCloudProgress'); prog.style.display = 'block';
      await pullAssets(function (i, n) {
        $('docosCloudProgressText').textContent = 'Файлове ' + i + '/' + n;
        $('docosCloudProgressFill').style.width = (i / n * 100) + '%';
      });
      setTimeout(function () { prog.style.display = 'none'; }, 800);
      this.disabled = false;
    });

    refreshCounts();
  }

  async function refreshCounts() {
    try {
      var local = await idbGetAll();
      var c = $('docosCloudAssetCount'); if (c) c.textContent = String(local.length);
    } catch (_) {}
    if (!session) return;
    try {
      var listed = await sb.storage.from(BUCKET).list(session.user.id, { limit: 1000 });
      if (listed.data) {
        var bytes = 0;
        listed.data.forEach(function (f) { if (f.metadata && f.metadata.size) bytes += f.metadata.size; });
        var c2 = $('docosCloudCloudSize');
        if (c2) c2.textContent = fmtBytes(bytes);
      }
    } catch (_) {}
  }

  // ── Auto-sync hook on localStorage change ───────────────
  var origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    var ret = origSetItem.apply(this, arguments);
    if (k === LS_STATE && autosync && session) schedulePush(2500);
    return ret;
  };

  // ── Boot ────────────────────────────────────────────────
  function boot() {
    ensureUi();
    initClient().catch(function (e) { console.warn('[cloud init]', e); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DocOSCloud = { pushState: pushState, pullState: pullState, pushAssets: pushAssets, pullAssets: pullAssets, openPanel: openPanel };
})();
