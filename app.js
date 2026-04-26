/* ============================================================
   DocOS — app.js — v3.1 Full Production
   ============================================================ */

'use strict';

/* ═══════════════════════════════════════════════
   1. CONSTANTS & CONFIG
═══════════════════════════════════════════════ */

const APP_VERSION = '4.5.0';
const LS_KEY = 'docos_v3';
const THEMES = [
  { id: 'black-blue',   label: 'Синя',    color: '#3B82F6' },
  { id: 'black-yellow', label: 'Жълта',   color: '#EAB308' },
  { id: 'black-red',    label: 'Червена', color: '#EF4444' },
  { id: 'black-green',  label: 'Зелена',  color: '#22C55E' },
  { id: 'black-orange', label: 'Оранж',   color: '#F97316' },
  { id: 'chameleon',    label: 'Хамелеон',color: '#A855F7' },
];

const FOLDER_EMOJIS = ['📁','📂','💼','🏠','🏥','🚗','🎓','💰','📋','🔒','⚡','🌍','📦','🧾','🏛️','💡'];

const DOC_TYPE_ICONS = {
  pdf: '📄', image: '🖼️', video: '🎬', doc: '📝', xls: '📊',
  txt: '📃', contract: '📋', invoice: '🧾', bank: '🏦',
  medical: '🏥', tax: '💸', id: '🪪', insurance: '🛡️', cv: '🧑', application: '🧾', other: '📄'
};

const DOC_TYPE_LABELS = {
  cv: 'CV / Lebenslauf',
  invoice: 'Фактура',
  contract: 'Договор',
  application: 'Кандидатура',
  id: 'Лична карта / Паспорт',
  medical: 'Медицински',
  bank: 'Банка',
  insurance: 'Застраховка',
  tax: 'Данъци',
  pdf: 'PDF',
  image: 'Изображение',
  video: 'Видео',
  other: 'Документ'
};

const SAFE_LOCAL_BUDGET_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB fallback — real quota comes from navigator.storage.estimate()
const ARCHIVE_PLAN_BYTES = 2 * 1024 * 1024 * 1024 * 1024;

// IndexedDB storage layer — adapted from stable IndexedDB/idb patterns
const ASSET_DB_NAME = 'docos_assets';
const ASSET_DB_VERSION = 1;
const ASSET_STORE = 'assets';
const LEGACY_DATA_URL_PREFIX = 'data:';
const MAX_LOCAL_FILE_BYTES = 100 * 1024 * 1024;
const PDF_JS_CDN_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';
const OCR_LANG_PRIMARY = 'eng+deu+bul';
const OCR_LANG_FALLBACK = 'eng';
const PARSER_VERSION = 5;
const DEFAULT_PHONE_COUNTRIES = ['DE', 'AT', 'BG', 'ES'];
const SMART_PARSE_TEXT_LIMIT = 18000;
const AUTO_FILL_IMAGE_OCR_MAX_BYTES = 12 * 1024 * 1024;
const AUTO_FILL_PROGRESS_TOAST_MS = 1600;
const PASS6_FUSE_THRESHOLD = 0.34;
const BULK_FAST_MODE_MIN_FILES = 3;
const BULK_BACKGROUND_ENRICH_CONCURRENCY = 2;
const BULK_BACKGROUND_START_DELAY_MS = 120;
const PWA_SW_FILE = 'sw.js';
const PWA_RUNTIME_CACHE = 'docos-runtime-v2';
const EXTERNAL_RUNTIME_URLS = [
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css',
  'https://cdn.jsdelivr.net/npm/idb@8/build/umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs',
  'https://cdn.jsdelivr.net/npm/compromise@14.15.0/+esm',
  'https://cdn.jsdelivr.net/npm/compromise-dates@3.7.1/+esm',
  'https://cdn.jsdelivr.net/npm/libphonenumber-js@1.12.38/+esm',
  'https://cdn.jsdelivr.net/npm/chrono-node@2.8.4/+esm',
  'https://cdn.jsdelivr.net/npm/franc-min@6.2.0/+esm',
  'https://cdn.jsdelivr.net/npm/p-limit@7.1.1/+esm',
  'https://cdn.jsdelivr.net/npm/@json-editor/json-editor@2.15.2/dist/jsoneditor.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js',
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/customParseFormat.js',
  PDF_JS_CDN_WORKER
];

/* ═══════════════════════════════════════════════
   2. STATE
═══════════════════════════════════════════════ */

let state = {
  folders: [],
  documents: [],
  deadlines: [],
  alerts: [],
  quickLinks: [],
  theme: 'black-blue',
  currentTab: 'dashboard',
  currentFolderId: null,
  intakeQueue: [],
  _version: 3
};


/* ═══════════════════════════════════════════════
   3. PERSISTENCE & MIGRATION
═══════════════════════════════════════════════ */

let assetDbPromise = null;
const runtimeAssetUrls = new Map();
const storageRuntime = {
  usageBytes: null,
  quotaBytes: null,
  lastEstimateAt: 0,
  persisted: null,
  persistCheckAt: 0
};

let storageTruthChart = null;
const runtimeRetryFiles = new Map();
let runtimeBatchSummary = null;
let runtimeBatchBusy = false;
let runtimeBulkEnrichLimit = null;
let runtimeBulkEnrichLimitPromise = null;
const runtimeBulkEnrichJobs = new Map();
let runtimeDeferredRefreshTimer = null;
let runtimeReminderTimer = null;
const pwaRuntime = {
  swRegistration: null,
  swReady: false,
  standaloneMq: null,
  runtimeCache: {
    total: EXTERNAL_RUNTIME_URLS.length,
    cached: 0,
    inProgress: false,
    warmedAt: 0,
    lastError: ''
  }
};
const runtimeOpenSheets = new Set();
let runtimeViewportSyncBound = false;
let runtimeViewportFrame = null;
let runtimeViewportWidth = 0;
let runtimeShellHeight = 0;
let runtimeOverlayHeight = 0;
let runtimeScrollGuardsBound = false;

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state = Object.assign({}, state, saved);
    state.documents = (state.documents || []).map(migrateDoc);
    state.intakeQueue = (state.intakeQueue || []).map(migrateQueueItem);
    if (!Array.isArray(state.folders)) state.folders = [];
    if (!Array.isArray(state.deadlines)) state.deadlines = [];
    if (!Array.isArray(state.alerts)) state.alerts = [];
    if (!Array.isArray(state.quickLinks)) state.quickLinks = [];
    state.deadlines = state.deadlines.map(normalizeDeadline);
    state.alerts = state.alerts.map(normalizeAlert).filter(Boolean);
    if (!Array.isArray(state.intakeQueue)) state.intakeQueue = [];
    if (!state.theme) state.theme = 'black-blue';
  } catch (e) {
    console.warn('DocOS: state load error', e);
  }
}

function migrateDoc(d) {
  return {
    id:               d.id               || uid(),
    title:            d.title            || d.name || 'Документ',
    folderId:         d.folderId         !== undefined ? d.folderId : null,
    status:           d.status           || 'saved',
    sourceType:       d.sourceType       || 'upload',
    institution:      d.institution      || '',
    date:             d.date             || '',
    detectedDate:     d.detectedDate     || '',
    detectedYear:     d.detectedYear     || '',
    detectedTime:     d.detectedTime     || '',
    summary:          d.summary          || '',
    confidence:       d.confidence       !== undefined ? d.confidence : 0,
    createdAt:        d.createdAt        || new Date().toISOString(),
    previewType:      d.previewType      || 'other',
    originalFileName: d.originalFileName || d.name || '',
    previewDataUrl:   typeof d.previewDataUrl === 'string' ? d.previewDataUrl : '',
    docType:          d.docType          || 'other',
    blobKey:          d.blobKey          || d.assetKey || '',
    fileMime:         d.fileMime         || d.mimeType || '',
    fileSize:         Number(d.fileSize) || 0,
    extractedText:    d.extractedText    || '',
    cleanFileName:    d.cleanFileName    || cleanupImportedFileName(d.originalFileName || d.name || ''),
    parserVersion:    Number(d.parserVersion) || 0,
    parsedData:       normalizeParsedData(d.parsedData || null),
    homeHidden:       d.homeHidden !== undefined ? !!d.homeHidden : !!(d.folderId || d.contextFolderId || d.folderScope),
  };
}

function migrateQueueItem(item) {
  return {
    id:               item.id               || uid(),
    originalFileName: item.originalFileName || item.name || 'Документ',
    fileSize:         Number(item.fileSize) || 0,
    fileMime:         item.fileMime         || item.mimeType || '',
    previewType:      item.previewType      || 'other',
    previewDataUrl:   typeof item.previewDataUrl === 'string' ? item.previewDataUrl : '',
    rawDataUrl:       typeof item.rawDataUrl === 'string' ? item.rawDataUrl : '',
    blobKey:          item.blobKey          || item.assetKey || '',
    suggestedTitle:   item.suggestedTitle   || item.originalFileName || 'Документ',
    docType:          item.docType          || 'other',
    docTypeLabel:     item.docTypeLabel     || 'Документ',
    institution:      item.institution      || '',
    institutionIcon:  item.institutionIcon  || '',
    detectedDate:     item.detectedDate     || '',
    detectedYear:     item.detectedYear     || '',
    detectedTime:     item.detectedTime     || '',
    confidence:       item.confidence       !== undefined ? item.confidence : 0,
    suggestedFolderId:item.suggestedFolderId !== undefined ? item.suggestedFolderId : null,
    isReview:         !!item.isReview,
    contextFolderId:  item.contextFolderId  !== undefined ? item.contextFolderId : null,
    extractedText:    item.extractedText    || '',
    summary:          item.summary          || '',
    cleanFileName:    item.cleanFileName    || cleanupImportedFileName(item.originalFileName || item.name || ''),
    parserVersion:    Number(item.parserVersion) || 0,
    parsedData:       normalizeParsedData(item.parsedData || null),
    uploadState:      item.uploadState      || 'готово',
    uploadError:      item.uploadError      || '',
    transientRetryId: item.transientRetryId || '',
    batchId:          item.batchId          || '',
    homeHidden:       item.homeHidden !== undefined ? !!item.homeHidden : !!(item.contextFolderId || item.suggestedFolderId),
  };
}

function normalizeDeadline(item) {
  if (!item) return null;
  const date = typeof item.date === 'string' ? item.date.slice(0, 10) : '';
  const color = DEADLINE_COLORS.includes(item.color) ? item.color : (item.color || '#3B82F6');
  const normalized = {
    id: item.id || uid(),
    title: item.title || 'Термин',
    date,
    time: item.time || '',
    note: item.note || '',
    color,
    reminderEnabled: !!item.reminderEnabled,
    reminderMode: item.reminderMode || '1d',
    remindAt: item.remindAt || '',
    remindedAt: item.remindedAt || '',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
  if (normalized.reminderEnabled && !normalized.remindAt) normalized.remindAt = computeReminderAt(normalized);
  return normalized;
}

function normalizeAlert(item) {
  if (!item || !item.id) return null;
  return {
    id: item.id,
    sourceId: item.sourceId || '',
    title: item.title || 'Напомняне',
    body: item.body || '',
    createdAt: item.createdAt || new Date().toISOString(),
    seen: !!item.seen
  };
}

function localDateString(date = new Date()) {
  if (window.dayjs) return dayjs(date).format('YYYY-MM-DD');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function combineLocalDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const safeTime = timeStr || '09:00';
  if (window.dayjs) {
    const parsed = dayjs(`${dateStr} ${safeTime}`, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD H:mm']);
    return parsed.isValid() ? parsed.toDate() : null;
  }
  const [y,m,d] = String(dateStr).split('-').map(Number);
  const [hh,mm] = safeTime.split(':').map(v => Number(v || 0));
  if (!y || !m || !d) return null;
  return new Date(y, m-1, d, hh||0, mm||0, 0, 0);
}

function computeReminderAt(item) {
  const base = combineLocalDateTime(item?.date, item?.time || '09:00');
  if (!base) return '';
  const dt = new Date(base.getTime());
  const mode = item?.reminderMode || '1d';
  if (mode === '1d') dt.setDate(dt.getDate() - 1);
  else if (mode === '2h') dt.setHours(dt.getHours() - 2);
  else if (mode === '30m') dt.setMinutes(dt.getMinutes() - 30);
  return dt.toISOString();
}

function formatDateTime(deadline) {
  if (!deadline?.date) return '—';
  const base = combineLocalDateTime(deadline.date, deadline.time || '09:00') || new Date(deadline.date);
  const datePart = base.toLocaleDateString('bg-BG', { day:'2-digit', month:'2-digit', year:'numeric' });
  return deadline.time ? `${datePart} · ${deadline.time}` : datePart;
}

function reminderModeLabel(mode) {
  if (mode === 'same') return 'В часа';
  if (mode === '2h') return '2 часа по-рано';
  if (mode === '30m') return '30 мин по-рано';
  return '1 ден по-рано';
}

function isIosDevice() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneMode() {
  try {
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!window.navigator.standalone;
  } catch {
    return !!window.navigator.standalone;
  }
}

function supportsServiceWorker() {
  return !!(window.isSecureContext && 'serviceWorker' in navigator);
}

function supportsNotifications() {
  return 'Notification' in window;
}

function supportsBadging() {
  return typeof navigator.setAppBadge === 'function' && typeof navigator.clearAppBadge === 'function';
}

async function syncAppBadge() {
  if (!supportsBadging()) return;
  try {
    const unseen = (state.alerts || []).filter(a => !a.seen).length;
    const upcoming = (state.deadlines || []).filter(dl => dl.reminderEnabled && dl.remindAt && !dl.remindedAt).length;
    const total = unseen + upcoming;
    if (total > 0) await navigator.setAppBadge(total);
    else await navigator.clearAppBadge();
  } catch {}
}


async function fetchRuntimeAssetForCache(url, timeoutMs = 12000) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!response || (!response.ok && response.type !== 'opaque')) {
      throw new Error(`Невалиден отговор ${response ? response.status : '0'}`);
    }
    return response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getRuntimeCacheMetrics() {
  const total = EXTERNAL_RUNTIME_URLS.length;
  if (!('caches' in window) || !window.caches) {
    return { supported: false, total, cached: 0 };
  }
  try {
    const cache = await window.caches.open(PWA_RUNTIME_CACHE);
    const checks = await Promise.all(EXTERNAL_RUNTIME_URLS.map(url => cache.match(url).then(hit => !!hit).catch(() => false)));
    const cached = checks.filter(Boolean).length;
    return { supported: true, total, cached };
  } catch {
    return { supported: false, total, cached: 0 };
  }
}

async function refreshRuntimeCacheTruth() {
  const metrics = await getRuntimeCacheMetrics();
  pwaRuntime.runtimeCache.total = metrics.total;
  pwaRuntime.runtimeCache.cached = metrics.cached;
  updatePwaStatusUi();
  return metrics;
}

async function warmExternalRuntimeCache() {
  if (!('caches' in window) || !window.caches || !navigator.onLine) {
    return refreshRuntimeCacheTruth();
  }
  if (pwaRuntime.runtimeCache.inProgress) return refreshRuntimeCacheTruth();

  pwaRuntime.runtimeCache.inProgress = true;
  pwaRuntime.runtimeCache.lastError = '';
  updatePwaStatusUi();

  try {
    const cache = await window.caches.open(PWA_RUNTIME_CACHE);
    const existing = await Promise.all(EXTERNAL_RUNTIME_URLS.map(url => cache.match(url).then(hit => !!hit).catch(() => false)));
    const missingUrls = EXTERNAL_RUNTIME_URLS.filter((_, idx) => !existing[idx]);
    if (!missingUrls.length) {
      pwaRuntime.runtimeCache.warmedAt = Date.now();
      pwaRuntime.runtimeCache.lastError = '';
      return await refreshRuntimeCacheTruth();
    }
    const results = await Promise.allSettled(missingUrls.map(async (url) => {
      const response = await fetchRuntimeAssetForCache(url);
      await cache.put(url, response.clone());
      return url;
    }));
    const failed = results.filter(r => r.status === 'rejected');
    pwaRuntime.runtimeCache.warmedAt = Date.now();
    pwaRuntime.runtimeCache.lastError = failed.length ? `${failed.length} модула не се запазиха` : '';
    return await refreshRuntimeCacheTruth();
  } catch (err) {
    pwaRuntime.runtimeCache.lastError = err?.message || 'Грешка при запазване';
    return await refreshRuntimeCacheTruth();
  } finally {
    pwaRuntime.runtimeCache.inProgress = false;
    updatePwaStatusUi();
  }
}

function getPwaStatusModel() {
  const standalone = isStandaloneMode();
  const ios = isIosDevice();
  const notifPermission = supportsNotifications() ? Notification.permission : 'unsupported';
  const notificationState = notifPermission === 'granted'
    ? 'Позволени'
    : notifPermission === 'denied'
      ? 'Блокирани'
      : (ios && !standalone ? 'Добави към Начален екран' : 'Готови за включване');
  return {
    standalone,
    ios,
    secure: window.isSecureContext,
    sw: supportsServiceWorker(),
    notifications: supportsNotifications(),
    notifPermission,
    notificationState,
    offlineReady: !!pwaRuntime.swReady,
    online: navigator.onLine !== false,
    runtimeCacheSupported: 'caches' in window && !!window.caches,
    runtimeCacheTotal: pwaRuntime.runtimeCache.total || EXTERNAL_RUNTIME_URLS.length,
    runtimeCacheCount: pwaRuntime.runtimeCache.cached || 0,
    runtimeCacheBusy: !!pwaRuntime.runtimeCache.inProgress,
    runtimeCacheError: pwaRuntime.runtimeCache.lastError || ''
  };
}

function updatePwaStatusUi() {
  const modeEl = document.getElementById('pwaModeValue');
  const offlineEl = document.getElementById('pwaOfflineValue');
  const runtimeEl = document.getElementById('pwaRuntimeCacheValue');
  const notifEl = document.getElementById('pwaNotifValue');
  const explainEl = document.getElementById('pwaExplain');
  const enableBtn = document.getElementById('pwaEnableNotifBtn');
  const versionBadge = document.getElementById('appVersionBadge');
  const versionValue = document.getElementById('settingsVersionValue');
  const m = getPwaStatusModel();

  if (versionBadge) versionBadge.textContent = `v${APP_VERSION}`;
  if (versionValue) versionValue.textContent = APP_VERSION;

  if (modeEl) {
    modeEl.textContent = m.standalone ? 'Начален екран' : 'Браузър';
    modeEl.className = 'settings-value ' + (m.standalone ? 'is-good' : 'is-info');
  }
  if (offlineEl) {
    offlineEl.textContent = m.offlineReady ? 'Готов' : (m.sw ? 'Подготвен' : 'Недостъпен');
    offlineEl.className = 'settings-value ' + (m.offlineReady ? 'is-good' : 'is-warn');
  }
  if (runtimeEl) {
    if (!m.runtimeCacheSupported) {
      runtimeEl.textContent = 'Недостъпно';
      runtimeEl.className = 'settings-value is-warn';
    } else if (m.runtimeCacheBusy) {
      runtimeEl.textContent = `Зареждане ${m.runtimeCacheCount}/${m.runtimeCacheTotal}`;
      runtimeEl.className = 'settings-value is-info';
    } else if (m.runtimeCacheCount >= m.runtimeCacheTotal && m.runtimeCacheTotal > 0) {
      runtimeEl.textContent = 'Готови';
      runtimeEl.className = 'settings-value is-good';
    } else if (m.runtimeCacheCount > 0) {
      runtimeEl.textContent = `Частично ${m.runtimeCacheCount}/${m.runtimeCacheTotal}`;
      runtimeEl.className = 'settings-value is-info';
    } else {
      runtimeEl.textContent = m.online ? 'Празно' : 'Няма мрежа';
      runtimeEl.className = 'settings-value is-warn';
    }
  }
  if (notifEl) {
    notifEl.textContent = m.notificationState;
    notifEl.className = 'settings-value ' + ((m.notifPermission === 'granted') ? 'is-good' : (m.notifPermission === 'denied' ? 'is-warn' : 'is-info'));
  }
  if (explainEl) {
    if (!m.secure) explainEl.textContent = 'Режимът като приложение и известията искат HTTPS домейн.';
    else if (m.ios && !m.standalone) explainEl.textContent = 'На iPhone първо добави DocOS към Начален екран, после разреши известията.';
    else if (m.runtimeCacheBusy) explainEl.textContent = 'DocOS подгрява мрежовите модули за по-стабилен старт при слаб интернет.';
    else if (m.runtimeCacheCount < m.runtimeCacheTotal) explainEl.textContent = 'Офлайн основата е готова, но външните модули още не са напълно запазени на това устройство.';
    else if (m.notifPermission === 'granted') explainEl.textContent = 'DocOS е готов за локални напомняния, значка на иконата и по-стабилен старт дори при слаб интернет.';
    else explainEl.textContent = 'Разреши известията след отваряне от Начален екран за по-надеждни напомняния.';
  }
  if (enableBtn) enableBtn.disabled = !m.notifications || (m.ios && !m.standalone);
}

function openPwaHelpSheet() {
  showSheet('pwaHelpSheet', 'pwaHelpBackdrop');
}

async function registerServiceWorkerIfSupported() {
  if (!supportsServiceWorker()) { updatePwaStatusUi(); return null; }
  try {
    const reg = await navigator.serviceWorker.register(PWA_SW_FILE, { scope: './' });
    pwaRuntime.swRegistration = reg;
    pwaRuntime.swReady = !!(navigator.serviceWorker.controller || reg.active || reg.waiting);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'activated' || installing.state === 'installed') {
          pwaRuntime.swReady = true;
          updatePwaStatusUi();
        }
      });
    });
    navigator.serviceWorker.ready.then(() => { pwaRuntime.swReady = true; updatePwaStatusUi(); }).catch(() => {});
    updatePwaStatusUi();
    return reg;
  } catch (err) {
    console.warn('DocOS: service worker skipped', err);
    updatePwaStatusUi();
    return null;
  }
}


let dockAudioCtx = null;
let dockAudioLastAt = 0;
let dockAudioSuspendTimer = null;
const DOCK_SOUND_PREF_KEY = 'docos_dock_sound_v1';

function isDockSoundEnabled() {
  try {
    const v = localStorage.getItem(DOCK_SOUND_PREF_KEY);
    if (v === null) {
      localStorage.setItem(DOCK_SOUND_PREF_KEY, '1');
      return true;
    }
    return v !== '0';
  } catch {
    return true;
  }
}

function pinDockSoundEnabled() {
  try { localStorage.setItem(DOCK_SOUND_PREF_KEY, '1'); } catch {}
}

function getDockAudioContext() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!dockAudioCtx || dockAudioCtx.state === 'closed') dockAudioCtx = new Ctx();
    return dockAudioCtx;
  } catch {
    return null;
  }
}

function scheduleDockAudioSuspend(delayMs = 280) {
  clearTimeout(dockAudioSuspendTimer);
  dockAudioSuspendTimer = setTimeout(() => {
    try {
      if (dockAudioCtx && dockAudioCtx.state === 'running') dockAudioCtx.suspend().catch(() => {});
    } catch {}
  }, delayMs);
}

function primeDockAudio() {
  if (!isDockSoundEnabled()) return;
  pinDockSoundEnabled();
  const ctx = getDockAudioContext();
  if (!ctx) return;
  clearTimeout(dockAudioSuspendTimer);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function playDockPressFx(kind = 'home') {
  try {
    if (!isDockSoundEnabled()) return;
    pinDockSoundEnabled();
    const nowPerf = performance.now();
    if (nowPerf - dockAudioLastAt < 70) return;
    dockAudioLastAt = nowPerf;

    const ctx = getDockAudioContext();
    if (!ctx) return;
    clearTimeout(dockAudioSuspendTimer);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const profileMap = {
      home:      { duration: 0.12, filter: 2200, tones: [[540, 760, 'triangle', 0.030], [1080, 860, 'sine', 0.012]] },
      documents: { duration: 0.13, filter: 2100, tones: [[420, 620, 'sine', 0.026], [860, 740, 'triangle', 0.010]] },
      scan:      { duration: 0.18, filter: 2600, tones: [[660, 980, 'triangle', 0.036], [1320, 1110, 'sine', 0.014]] },
      agent:     { duration: 0.14, filter: 2400, tones: [[460, 680, 'triangle', 0.028], [920, 1100, 'sine', 0.012]] },
      more:      { duration: 0.14, filter: 2000, tones: [[580, 760, 'sine', 0.026], [1160, 930, 'triangle', 0.011]] },
      default:   { duration: 0.12, filter: 2200, tones: [[520, 720, 'triangle', 0.028], [1040, 860, 'sine', 0.012]] }
    };
    const profile = profileMap[kind] || profileMap.default;
    const t0 = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(profile.filter, t0);
    filter.Q.value = 0.8;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(1, t0 + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + profile.duration + 0.03);

    filter.connect(master).connect(ctx.destination);

    profile.tones.forEach(([start, end, type, peakGain], idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(start, t0);
      osc.frequency.exponentialRampToValueAtTime(end, t0 + profile.duration * (idx === 0 ? 0.84 : 0.68));
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.01 + (idx * 0.003));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + profile.duration);
      osc.connect(gain).connect(filter);
      osc.start(t0);
      osc.stop(t0 + profile.duration + 0.04);
    });

    const suspendAfter = Math.ceil((profile.duration + 0.16) * 1000);
    scheduleDockAudioSuspend(suspendAfter);
    setTimeout(() => {
      try { filter.disconnect(); } catch {}
      try { master.disconnect(); } catch {}
    }, Math.ceil((profile.duration + 0.12) * 1000));
  } catch {}
}

function playReminderChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.34);
    osc.onended = () => { try { ctx.close(); } catch {} };
  } catch {}
}


window.addEventListener('pagehide', () => {
  clearTimeout(dockAudioSuspendTimer);
  try { if (dockAudioCtx && dockAudioCtx.state === 'running') dockAudioCtx.suspend().catch(() => {}); } catch {}
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(dockAudioSuspendTimer);
    try { if (dockAudioCtx && dockAudioCtx.state === 'running') dockAudioCtx.suspend().catch(() => {}); } catch {}
  }
});

function clearReminderTimer() {
  if (runtimeReminderTimer) { clearTimeout(runtimeReminderTimer); runtimeReminderTimer = null; }
}

function scheduleNextReminderCheck() {
  clearReminderTimer();
  const pending = (state.deadlines || [])
    .filter(dl => dl.reminderEnabled && dl.remindAt && !dl.remindedAt)
    .map(dl => ({ dl, at: new Date(dl.remindAt).getTime() }))
    .filter(x => Number.isFinite(x.at))
    .sort((a,b) => a.at - b.at);
  if (!pending.length) return;
  const now = Date.now();
  const nextAt = pending[0].at;
  const delay = Math.max(250, Math.min(nextAt - now, 30 * 1000));
  runtimeReminderTimer = setTimeout(() => {
    processDueReminders();
    scheduleNextReminderCheck();
  }, delay);
}

function requestReminderPermission() {
  if (!supportsNotifications()) {
    showToast('⚠️ Известията не се поддържат');
    return Promise.resolve('unsupported');
  }
  if (isIosDevice() && !isStandaloneMode()) {
    openPwaHelpSheet();
    showToast('📱 Първо отвори DocOS от Начален екран');
    return Promise.resolve('home-screen-required');
  }
  return Notification.requestPermission().then(permission => {
    refreshReminderHint();
    updateNotifBadge();
    updatePwaStatusUi();
    return permission;
  }).catch(() => 'denied');
}

function upsertAlert(alert) {
  if (!alert) return;
  const idx = (state.alerts || []).findIndex(a => a.id === alert.id);
  if (idx >= 0) state.alerts[idx] = { ...state.alerts[idx], ...alert };
  else state.alerts.unshift(alert);
  state.alerts = (state.alerts || []).slice(0, 40);
}

function getDeadlinesForDate(dateStr) {
  return [...(state.deadlines || [])].filter(dl => dl.date === dateStr).sort((a, b) => {
    const ta = a.time || '23:59';
    const tb = b.time || '23:59';
    return ta.localeCompare(tb);
  });
}

function markAlertsSeen() {
  let changed = false;
  (state.alerts || []).forEach(a => { if (!a.seen) { a.seen = true; changed = true; } });
  if (changed) saveState();
  updateNotifBadge();
}

function updateNotifBadge() {
  const dot = document.getElementById('notifDot');
  const unseen = (state.alerts || []).some(a => !a.seen);
  const upcoming = (state.deadlines || []).some(dl => dl.reminderEnabled && dl.remindAt && !dl.remindedAt);
  if (dot) dot.style.display = unseen || upcoming ? 'block' : 'none';
  syncAppBadge().catch(() => {});
}

function renderAlertsSheet() {
  const headline = document.getElementById('alertsHeadline');
  const el = document.getElementById('alertsList');
  if (!headline || !el) return;
  const alerts = [...(state.alerts || [])].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const upcoming = [...(state.deadlines || [])].filter(dl => dl.reminderEnabled && dl.remindAt && !dl.remindedAt).sort((a,b) => new Date(a.remindAt) - new Date(b.remindAt)).slice(0,6);
  headline.textContent = alerts.length ? `${alerts.length} напомняния` : (upcoming.length ? 'Предстоящи напомняния' : 'Няма известия');
  let html = '';
  if (upcoming.length) {
    html += `<div class="alerts-group-title">Предстоящи</div>`;
    html += upcoming.map(dl => `<button type="button" class="alert-card is-upcoming" data-alert-open="${dl.id}"><span class="alert-color" style="background:${escHtml(dl.color||'#3B82F6')}"></span><div class="alert-copy"><strong>${escHtml(dl.title)}</strong><small>${escHtml(formatDateTime(dl))} · ${escHtml(reminderModeLabel(dl.reminderMode))}</small></div></button>`).join('');
  }
  if (alerts.length) {
    html += `<div class="alerts-group-title">Последни</div>`;
    html += alerts.map(a => `<button type="button" class="alert-card ${a.seen ? '' : 'is-unseen'}" data-alert-open="${escHtml(a.sourceId)}"><span class="alert-color" style="background:var(--accent)"></span><div class="alert-copy"><strong>${escHtml(a.title)}</strong><small>${escHtml(a.body || 'Напомняне')}</small></div></button>`).join('');
  }
  if (!html) html = '<div class="empty-sub" style="padding:.5rem 0;text-align:center">Няма известия</div>';
  el.innerHTML = html;
  el.querySelectorAll('[data-alert-open]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.alertOpen;
    const dl = (state.deadlines || []).find(x => x.id === id);
    if (!dl) return;
    closeSheet('alertsSheet', 'alertsBackdrop');
    openDeadlineSheet(dl.date, dl.id);
  }));
}

function showAlertsSheet() {
  renderAlertsSheet();
  markAlertsSeen();
  showSheet('alertsSheet', 'alertsBackdrop');
}

function renderDeadlineDayList(dateStr, selectedId = '') {
  const el = document.getElementById('deadlineDayList');
  if (!el) return;
  const items = getDeadlinesForDate(dateStr);
  if (!items.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:.35rem 0;text-align:center">Няма термини за тази дата</div>';
    return;
  }
  el.innerHTML = items.map(dl => `<button type="button" class="deadline-mini-card ${selectedId === dl.id ? 'active' : ''}" data-deadline-open="${dl.id}"><span class="deadline-mini-dot" style="background:${escHtml(dl.color || '#3B82F6')}"></span><div class="deadline-mini-copy"><strong>${escHtml(dl.title)}</strong><small>${escHtml(dl.time || 'Без час')}${dl.reminderEnabled ? ' · 🔔' : ''}</small></div></button>`).join('');
  el.querySelectorAll('[data-deadline-open]').forEach(btn => btn.addEventListener('click', () => openDeadlineSheet(dateStr, btn.dataset.deadlineOpen)));
}

function fillDeadlineSheet(deadline, dateStr) {
  const editing = deadline ? normalizeDeadline(deadline) : normalizeDeadline({ date: dateStr || localDateString(), reminderMode: '1d', color: '#3B82F6' });
  document.getElementById('deadlineEditId').value = editing.id || '';
  document.getElementById('deadlineTitle').value = editing.title === 'Термин' && !deadline ? '' : (editing.title || '');
  document.getElementById('deadlineNote').value = editing.note || '';
  document.getElementById('deadlineDate').value = editing.date || dateStr || localDateString();
  document.getElementById('deadlineTime').value = editing.time || '';
  document.getElementById('deadlineColor').value = editing.color || '#3B82F6';
  document.getElementById('deadlineReminderEnabled').checked = !!editing.reminderEnabled;
  document.getElementById('deadlineReminderMode').value = editing.reminderMode || '1d';
  document.getElementById('deadlineSheetTitle').textContent = deadline ? 'Редакция на термин' : 'Нов термин';
  document.getElementById('deadlineSelectedDateLabel').textContent = formatDate(editing.date);
  const delBtn = document.getElementById('deadlineDeleteBtn');
  if (delBtn) delBtn.style.display = deadline ? 'block' : 'none';
  document.querySelectorAll('.dl-color-dot').forEach(btn => btn.classList.toggle('active', btn.dataset.color === (editing.color || '#3B82F6')));
  renderDeadlineDayList(editing.date || dateStr || localDateString(), editing.id);
}

function openDeadlineSheet(dateStr = localDateString(), deadlineId = '') {
  const dl = deadlineId ? (state.deadlines || []).find(item => item.id === deadlineId) : null;
  fillDeadlineSheet(dl, dateStr);
  showSheet('deadlineSheet', 'deadlineBackdrop');
}

function closeDeadlineSheet() {
  closeSheet('deadlineSheet', 'deadlineBackdrop');
}

function saveDeadlineFromSheet() {
  const editId = document.getElementById('deadlineEditId').value;
  const title = document.getElementById('deadlineTitle').value.trim();
  const note = document.getElementById('deadlineNote').value.trim();
  const date = document.getElementById('deadlineDate').value;
  const time = document.getElementById('deadlineTime').value;
  const color = document.getElementById('deadlineColor').value || '#3B82F6';
  const reminderEnabled = document.getElementById('deadlineReminderEnabled').checked;
  const reminderMode = document.getElementById('deadlineReminderMode').value || '1d';
  if (!title || !date) { showToast('⚠️ Въведи термин и дата'); return; }
  const base = normalizeDeadline({ id: editId || uid(), title, note, date, time, color, reminderEnabled, reminderMode, remindedAt: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  base.remindAt = reminderEnabled ? computeReminderAt(base) : '';
  const idx = (state.deadlines || []).findIndex(x => x.id === base.id);
  if (idx >= 0) state.deadlines[idx] = { ...state.deadlines[idx], ...base, updatedAt: new Date().toISOString(), remindedAt: reminderEnabled ? '' : state.deadlines[idx].remindedAt || '' };
  else state.deadlines.push(base);
  saveState();
  closeDeadlineSheet();
  renderDashboard();
  renderMoreTab();
  processDueReminders();
  scheduleNextReminderCheck();
  showToast(idx >= 0 ? '✅ Терминът е обновен' : '✅ Терминът е запазен');
}

function deleteDeadlineFromSheet() {
  const editId = document.getElementById('deadlineEditId').value;
  if (!editId) return;
  state.deadlines = (state.deadlines || []).filter(d => d.id !== editId);
  state.alerts = (state.alerts || []).filter(a => a.sourceId !== editId);
  saveState();
  closeDeadlineSheet();
  renderDashboard();
  renderMoreTab();
  updateNotifBadge();
  scheduleNextReminderCheck();
  showToast('🗑 Терминът е изтрит');
}

async function notifyReminder(deadline) {
  const body = `${deadline.note ? deadline.note + ' · ' : ''}${formatDateTime(deadline)}`;
  let sent = false;
  // SW notification (best for PWA)
  if (pwaRuntime.swRegistration && supportsNotifications() && Notification.permission === 'granted') {
    try {
      await pwaRuntime.swRegistration.showNotification(deadline.title, {
        body, tag: `docos-${deadline.id}`, icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png', vibrate: [200, 100, 200]
      });
      sent = true;
    } catch (e) { console.warn('SW notif failed', e); }
  }
  // Fallback
  if (!sent && supportsNotifications() && Notification.permission === 'granted') {
    try { new Notification(deadline.title, { body, tag: `docos-${deadline.id}`, icon: 'icons/icon-192.png' }); } catch {}
  }
  playReminderChime();
  showToast(`🔔 ${deadline.title}`, 3200);
}

function processDueReminders() {
  const now = new Date();
  let changed = false;
  (state.deadlines || []).forEach(dl => {
    if (!dl.reminderEnabled || !dl.remindAt || dl.remindedAt) return;
    const remindAt = new Date(dl.remindAt);
    if (isNaN(remindAt.getTime()) || remindAt > now) return;
    dl.remindedAt = new Date().toISOString();
    upsertAlert({ id: `alert_${dl.id}_${dl.remindedAt}`, sourceId: dl.id, title: dl.title, body: `${formatDateTime(dl)}${dl.note ? ' · ' + dl.note : ''}`, createdAt: dl.remindedAt, seen: false });
    notifyReminder(dl);
    changed = true;
  });
  if (changed) {
    saveState();
    renderDeadlines();
    updateNotifBadge();
    updatePwaStatusUi();
  }
}

function getTodayDeadlineMap(year, month) {
  const map = new Map();
  (state.deadlines || []).forEach(dl => {
    if (!dl.date) return;
    const d = new Date(`${dl.date}T00:00:00`);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const key = d.getDate();
    const bucket = map.get(key) || [];
    bucket.push(dl);
    map.set(key, bucket);
  });
  return map;
}

function isCalendarDaySelected(dateStr) {
  return document.getElementById('deadlineDate')?.value === dateStr;
}

function openTodayDeadlineComposer() {
  openDeadlineSheet(localDateString());
}

function isReminderSupported() {
  return 'Notification' in window;
}

function refreshReminderHint() {
  const hint = document.getElementById('deadlineReminderHint');
  if (!hint) return;
  const permission = supportsNotifications() ? Notification.permission : 'unsupported';
  if (permission === 'granted') hint.textContent = isStandaloneMode() ? 'Известията са позволени. DocOS може да показва локални напомняния и badge, когато платформата го позволява.' : 'Известията са позволени, но за iPhone най-надеждно е DocOS да се отвори от Начален екран.';
  else if (permission === 'denied') hint.textContent = 'Известията са отказани. Ще виждаш напомняния само вътре в приложението.';
  else if (isIosDevice() && !isStandaloneMode()) hint.textContent = 'На iPhone добави DocOS към Начален екран, после натисни „Разреши“. Така шансът за реални известия е най-добър.';
  else if (permission === 'default') hint.textContent = 'Натисни „Разреши“, за да получаваш локални известия.';
  else hint.textContent = 'Това устройство не поддържа системни известия в този режим.';
}

function initDeadlineColorRow() {
  document.querySelectorAll('.dl-color-dot').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('deadlineColor').value = btn.dataset.color;
      document.querySelectorAll('.dl-color-dot').forEach(x => x.classList.toggle('active', x === btn));
    });
  });
  // Quick type chips
  document.querySelectorAll('.dl-type-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const titleInput = document.getElementById('deadlineTitle');
      if (titleInput && !titleInput.value.trim()) {
        titleInput.value = chip.dataset.dltype;
      }
      document.querySelectorAll('.dl-type-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });
}

function deadlineHomeList(d) {
  return `${escHtml(d.title)} · ${escHtml(formatDateTime(d))}`;
}

function openDeadlineFromDashboard(dateStr) {
  openDeadlineSheet(dateStr);
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith(LEGACY_DATA_URL_PREFIX);
}

function isBlobUrl(value) {
  return typeof value === 'string' && value.startsWith('blob:');
}

function buildPersistableStateSnapshot() {
  return {
    ...state,
    documents: (state.documents || []).map(doc => {
      const clean = migrateDoc(doc);
      return {
        ...clean,
        previewDataUrl: isDataUrl(clean.previewDataUrl) ? clean.previewDataUrl : ''
      };
    }),
    intakeQueue: (state.intakeQueue || []).map(item => {
      const clean = migrateQueueItem(item);
      return {
        ...clean,
        previewDataUrl: isDataUrl(clean.previewDataUrl) ? clean.previewDataUrl : '',
        rawDataUrl: isDataUrl(clean.rawDataUrl) ? clean.rawDataUrl : ''
      };
    })
  };
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(buildPersistableStateSnapshot()));
  } catch (e) {
    showToast('⚠️ Грешка при запис');
  }
}

function openAssetDbNative() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, ASSET_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function openAssetDb() {
  if (assetDbPromise) return assetDbPromise;

  if (window.idb && typeof window.idb.openDB === 'function') {
    assetDbPromise = window.idb.openDB(ASSET_DB_NAME, ASSET_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
        }
      }
    });
  } else {
    assetDbPromise = openAssetDbNative();
  }

  return assetDbPromise;
}

async function putAssetRecord(record) {
  const db = await openAssetDb();
  if (typeof db.put === 'function') {
    await db.put(ASSET_STORE, record);
    return record;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB put error'));
  });
}

async function getAssetRecord(id) {
  if (!id) return null;
  const db = await openAssetDb();
  if (typeof db.get === 'function') return db.get(ASSET_STORE, id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const req = tx.objectStore(ASSET_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB get error'));
  });
}

async function deleteAssetRecord(id) {
  if (!id) return;
  const db = await openAssetDb();
  if (typeof db.delete === 'function') {
    await db.delete(ASSET_STORE, id);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB delete error'));
  });
}

async function clearAssetStore() {
  const db = await openAssetDb();
  if (typeof db.clear === 'function') {
    await db.clear(ASSET_STORE);
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB clear error'));
  });
}

async function closeAssetDbConnection() {
  if (!assetDbPromise) return;
  try {
    const db = await assetDbPromise;
    if (db && typeof db.close === 'function') db.close();
  } catch {}
  assetDbPromise = null;
}

async function deleteAssetDatabase() {
  await closeAssetDbConnection();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(ASSET_DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('IndexedDB deleteDatabase error'));
    request.onblocked = () => resolve(false);
  });
}

async function clearOriginCachesBestEffort() {
  if (!('caches' in window) || !window.caches || typeof window.caches.keys !== 'function') return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map(key => window.caches.delete(key)));
  } catch (e) {
    console.warn('DocOS: cache clear skipped', e);
  }
}

async function refreshStorageEstimate(force = false) {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return storageRuntime;
  const now = Date.now();
  if (!force && storageRuntime.lastEstimateAt && (now - storageRuntime.lastEstimateAt) < 1500) return storageRuntime;
  try {
    const estimate = await navigator.storage.estimate();
    storageRuntime.usageBytes = Number(estimate.usage) || 0;
    storageRuntime.quotaBytes = Number(estimate.quota) || 0;
    storageRuntime.usageDetails = estimate && typeof estimate === 'object' ? (estimate.usageDetails || null) : null;
    storageRuntime.lastEstimateAt = now;
  } catch (e) {
    console.warn('DocOS: storage estimate failed', e);
  }
  return storageRuntime;
}

async function refreshStoragePersistence(force = false) {
  if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
    storageRuntime.persisted = null;
    return storageRuntime;
  }
  const now = Date.now();
  if (!force && storageRuntime.persistCheckAt && (now - storageRuntime.persistCheckAt) < 3000) return storageRuntime;
  try {
    storageRuntime.persisted = await navigator.storage.persisted();
    storageRuntime.persistCheckAt = now;
  } catch (e) {
    console.warn('DocOS: storage persisted check failed', e);
  }
  return storageRuntime;
}

async function requestPersistentStorageIfAvailable() {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function guessMimeType(fileName, fallback = 'application/octet-stream') {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic',
    pdf: 'application/pdf', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  return map[ext] || fallback;
}

function makeBlobKey(prefix = 'asset') {
  return `${prefix}_${uid()}`;
}

function releaseRuntimeObjectUrl(blobKey) {
  const current = runtimeAssetUrls.get(blobKey);
  if (current) {
    URL.revokeObjectURL(current);
    runtimeAssetUrls.delete(blobKey);
  }
}

function releaseAllRuntimeObjectUrls() {
  runtimeAssetUrls.forEach(url => URL.revokeObjectURL(url));
  runtimeAssetUrls.clear();
}

async function getObjectUrlForBlobKey(blobKey, fallbackBlob = null) {
  if (!blobKey) return '';
  const existing = runtimeAssetUrls.get(blobKey);
  if (existing) return existing;
  let blob = fallbackBlob;
  if (!blob) {
    const record = await getAssetRecord(blobKey);
    blob = record?.blob || null;
  }
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  runtimeAssetUrls.set(blobKey, url);
  return url;
}

async function hydrateRuntimePreviewUrl(record) {
  if (!record) return '';
  const isVisual = record.previewType === 'image' || record.previewType === 'video' || (record.fileMime && record.fileMime.startsWith('video/'));
  if (!isVisual) {
    if (record.previewDataUrl && isDataUrl(record.previewDataUrl)) return record.previewDataUrl;
    if (isBlobUrl(record.previewDataUrl)) record.previewDataUrl = '';
    return record.previewDataUrl || '';
  }
  if (record.previewDataUrl && !isDataUrl(record.previewDataUrl)) return record.previewDataUrl;
  if (!record.blobKey) return record.previewDataUrl || '';
  try {
    // For video, keep the data URL thumbnail; for image, get blob URL
    if (record.previewType === 'video' || (record.fileMime && record.fileMime.startsWith('video/'))) {
      return record.previewDataUrl || '';
    }
    const url = await getObjectUrlForBlobKey(record.blobKey);
    record.previewDataUrl = url || '';
    return record.previewDataUrl;
  } catch {
    record.previewDataUrl = '';
    return '';
  }
}

async function hydrateRuntimePreviewUrls() {
  const jobs = [];
  (state.intakeQueue || []).forEach(item => jobs.push(hydrateRuntimePreviewUrl(item)));
  (state.documents || []).forEach(doc => jobs.push(hydrateRuntimePreviewUrl(doc)));
  await Promise.allSettled(jobs);
}

function isBlobKeyReferenced(blobKey, { excludeQueueId = null, excludeDocId = null } = {}) {
  if (!blobKey) return false;
  const queueHasRef = (state.intakeQueue || []).some(item => item.id !== excludeQueueId && item.blobKey === blobKey);
  if (queueHasRef) return true;
  return (state.documents || []).some(doc => doc.id !== excludeDocId && doc.blobKey === blobKey);
}

async function deleteBlobIfOrphaned(blobKey, opts = {}) {
  if (!blobKey) return;
  if (isBlobKeyReferenced(blobKey, opts)) return;
  releaseRuntimeObjectUrl(blobKey);
  try {
    await deleteAssetRecord(blobKey);
  } catch (e) {
    console.warn('DocOS: asset delete failed', e);
  }
}

async function migrateLegacyInlineDataToIndexedDb() {
  let changed = false;

  for (const item of (state.intakeQueue || [])) {
    if (item.blobKey) continue;
    const inlineData = item.rawDataUrl || item.previewDataUrl;
    if (!isDataUrl(inlineData)) continue;
    try {
      const blob = await dataUrlToBlob(inlineData);
      const blobKey = makeBlobKey('queue');
      await putAssetRecord({
        id: blobKey,
        blob,
        fileName: item.originalFileName || item.suggestedTitle || 'Документ',
        mimeType: item.fileMime || blob.type || guessMimeType(item.originalFileName || '', 'application/octet-stream'),
        size: item.fileSize || blob.size || 0,
        createdAt: new Date().toISOString()
      });
      item.blobKey = blobKey;
      item.fileMime = item.fileMime || blob.type || guessMimeType(item.originalFileName || '', 'application/octet-stream');
      item.fileSize = item.fileSize || blob.size || 0;
      item.rawDataUrl = '';
      item.previewDataUrl = '';
      changed = true;
    } catch (e) {
      console.warn('DocOS: queue migration failed', e);
    }
  }

  for (const doc of (state.documents || [])) {
    if (doc.blobKey) continue;
    if (!isDataUrl(doc.previewDataUrl)) continue;
    try {
      const blob = await dataUrlToBlob(doc.previewDataUrl);
      const blobKey = makeBlobKey('doc');
      await putAssetRecord({
        id: blobKey,
        blob,
        fileName: doc.originalFileName || doc.title || 'Документ',
        mimeType: doc.fileMime || blob.type || guessMimeType(doc.originalFileName || '', 'application/octet-stream'),
        size: doc.fileSize || blob.size || 0,
        createdAt: doc.createdAt || new Date().toISOString()
      });
      doc.blobKey = blobKey;
      doc.fileMime = doc.fileMime || blob.type || guessMimeType(doc.originalFileName || '', 'application/octet-stream');
      doc.fileSize = doc.fileSize || blob.size || 0;
      doc.previewDataUrl = '';
      changed = true;
    } catch (e) {
      console.warn('DocOS: document migration failed', e);
    }
  }

  await hydrateRuntimePreviewUrls();
  if (changed) saveState();
}

function generateVideoThumbDataUrl(file, seekTime = 1.0) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };

    video.addEventListener('loadeddata', () => {
      video.currentTime = Math.min(seekTime, video.duration * 0.1 || seekTime);
    }, { once: true });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 240;
        const scale = Math.min(160 / w, 200 / h, 1);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e);
      }
    }, { once: true });

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('video thumbnail failed'));
    }, { once: true });

    setTimeout(() => { cleanup(); reject(new Error('video thumb timeout')); }, 8000);
  });
}

async function persistUploadedFile(file, ownerPrefix = 'asset', displayFileName = '') {
  const blobKey = makeBlobKey(ownerPrefix);
  const safeFileName = cleanupImportedFileName(displayFileName || file.name || 'Документ');
  const mimeType = file.type || guessMimeType(safeFileName || '', 'application/octet-stream');
  await putAssetRecord({
    id: blobKey,
    blob: file,
    fileName: safeFileName || 'Документ',
    mimeType,
    size: file.size || 0,
    createdAt: new Date().toISOString()
  });

  let previewDataUrl = '';
  if (mimeType.startsWith('image/')) {
    previewDataUrl = await getObjectUrlForBlobKey(blobKey, file);
  } else if (mimeType === 'application/pdf') {
    previewDataUrl = await generatePdfThumbDataUrlFromBlob(file).catch(() => '');
  } else if (mimeType.startsWith('video/')) {
    previewDataUrl = await generateVideoThumbDataUrl(file).catch(() => '');
  }

  return {
    blobKey,
    fileMime: mimeType,
    fileSize: Number(file.size) || 0,
    previewDataUrl
  };
}

function buildFileFingerprint(fileName = '', fileSize = 0, mimeType = '') {
  const clean = cleanupImportedFileName(fileName || '').toLowerCase();
  return [clean, Number(fileSize) || 0, (mimeType || '').toLowerCase()].join('|');
}

function hasLikelyLocalDuplicate(fileName = '', fileSize = 0, mimeType = '') {
  const fp = buildFileFingerprint(fileName, fileSize, mimeType);
  return (state.documents || []).some(doc => buildFileFingerprint(doc.originalFileName || doc.cleanFileName || doc.title || '', doc.fileSize || 0, doc.fileMime || '') === fp)
    || (state.intakeQueue || []).some(item => item.uploadState !== 'грешка' && buildFileFingerprint(item.originalFileName || item.cleanFileName || item.suggestedTitle || '', item.fileSize || 0, item.fileMime || '') === fp);
}

function makeFailedQueueItem(file, contextFolderId = null, message = '', batchId = '') {
  const cleanFileName = cleanupImportedFileName(file?.name || 'Документ');
  const analysis = HEURISTICS.analyze(cleanFileName, file?.type || '');
  const retryId = uid();
  runtimeRetryFiles.set(retryId, { file, contextFolderId, batchId });
  return {
    id: uid(),
    originalFileName: cleanFileName,
    fileSize: Number(file?.size) || 0,
    fileMime: file?.type || guessMimeType(cleanFileName || '', 'application/octet-stream'),
    previewType: analysis.previewType,
    previewDataUrl: '',
    rawDataUrl: '',
    blobKey: '',
    suggestedTitle: analysis.suggestedTitle,
    docType: analysis.docType,
    docTypeLabel: analysis.docTypeLabel,
    institution: analysis.institution,
    institutionIcon: analysis.institutionIcon,
    detectedDate: analysis.detectedDate,
    detectedYear: analysis.detectedYear,
    detectedTime: analysis.detectedTime,
    confidence: Math.max(analysis.confidence || 0, 40),
    suggestedFolderId: contextFolderId || null,
    isReview: false,
    contextFolderId: contextFolderId || null,
    extractedText: '',
    summary: '',
    cleanFileName,
    parserVersion: 0,
    parsedData: normalizeParsedData({
      typeKey: analysis.docType || 'other',
      typeLabel: analysis.docTypeLabel || 'Документ',
      title: analysis.suggestedTitle || cleanFileName.replace(/\.[a-z0-9]{2,5}$/i, ''),
      personName: '',
      organization: analysis.institution || '',
      email: '',
      phone: '',
      address: '',
      normalizedDate: '',
      detectedYear: analysis.detectedYear || '',
      language: '',
      summary: 'Грешка при локалното записване',
      keywords: ['грешка', analysis.docTypeLabel || 'Документ'].filter(Boolean),
      confidence: Math.max(analysis.confidence || 0, 40),
      source: 'неуспешно-записване'
    }),
    uploadState: 'грешка',
    uploadError: message || 'Неуспешно локално запазване',
    transientRetryId: retryId,
    batchId: batchId || ''
  };
}

function updateBatchSummary(summaryPatch = {}) {
  runtimeBatchSummary = Object.assign({
    total: 0,
    queued: 0,
    saved: 0,
    duplicates: 0,
    failed: 0,
    folderId: null,
    batchId: '',
    mode: 'качване',
    finishedAt: ''
  }, runtimeBatchSummary || {}, summaryPatch || {});
}


async function waitForGlobal(predicate, timeout = 8000, eventName = '') {
  if (predicate()) return true;
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let done = false;
    const cleanups = [];
    const finish = ok => {
      if (done) return;
      done = true;
      cleanups.forEach(fn => fn());
      ok ? resolve(true) : reject(new Error('timeout waiting for dependency'));
    };
    const timer = setInterval(() => {
      if (predicate()) return finish(true);
      if (Date.now() - started > timeout) return finish(false);
    }, 120);
    cleanups.push(() => clearInterval(timer));
    if (eventName) {
      const handler = () => predicate() && finish(true);
      window.addEventListener(eventName, handler, { once: true });
      cleanups.push(() => window.removeEventListener(eventName, handler));
    }
  });
}

async function getPdfJsRuntime(timeout = 5000) {
  await waitForGlobal(() => !!(window.DocOSPdfJS && window.DocOSPdfJS.getDocument), timeout, 'docos:pdfjs-ready');
  if (window.DocOSPdfJS?.GlobalWorkerOptions) {
    window.DocOSPdfJS.GlobalWorkerOptions.workerSrc = PDF_JS_CDN_WORKER;
  }
  return window.DocOSPdfJS;
}

async function getTesseractRuntime(timeout = 8000) {
  await waitForGlobal(() => !!(window.Tesseract && window.Tesseract.createWorker), timeout);
  return window.Tesseract;
}

async function getNlpRuntime(timeout = 5000) {
  await waitForGlobal(() => !!window.DocOSNLP, timeout, 'docos:nlp-ready');
  return window.DocOSNLP;
}

async function getChronoRuntime(timeout = 5000) {
  await waitForGlobal(() => !!window.DocOSChrono, timeout, 'docos:chrono-ready');
  return window.DocOSChrono;
}

async function getFrancRuntime(timeout = 5000) {
  await waitForGlobal(() => !!window.DocOSFranc, timeout, 'docos:franc-ready');
  return window.DocOSFranc;
}

function getNameParserRuntime() {
  return typeof window.DocOSParseFullName === 'function' ? window.DocOSParseFullName : null;
}

async function getFuseRuntime(timeout = 3500) {
  await waitForGlobal(() => typeof window.Fuse === 'function', timeout, 'docos:fuse-ready');
  return window.Fuse;
}

async function getChoicesRuntime(timeout = 3500) {
  await waitForGlobal(() => typeof window.Choices === 'function', timeout, 'docos:choices-ready');
  return window.Choices;
}

async function getSortableRuntime(timeout = 3500) {
  await waitForGlobal(() => typeof window.Sortable === 'function', timeout, 'docos:sortable-ready');
  return window.Sortable;
}

async function getPLimitRuntime(timeout = 3500) {
  await waitForGlobal(() => typeof window.DocOSPQueueLimit === 'function', timeout, 'docos:plimit-ready');
  return window.DocOSPQueueLimit;
}

function getPhoneParserRuntime() {
  return typeof window.DocOSParsePhoneNumber === 'function' ? window.DocOSParsePhoneNumber : null;
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summarizeExtractedText(text, limit = 900) {
  const clean = normalizeExtractedText(text);
  if (!clean) return '';
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function cleanupImportedFileName(name) {
  let out = String(name || '').trim();
  if (!out) return 'Документ';
  out = out.replace(/\s+/g, ' ');
  const repeatedExt = out.match(/^(.+?)(\.[a-z0-9]{2,5})(?:\s*\d+)?(?:\2(?:\s*\d+)?)*$/i);
  if (repeatedExt) out = `${repeatedExt[1]}${repeatedExt[2]}`;
  out = out.replace(/(\.[a-z0-9]{2,5})\s+\d+$/i, '$1');
  out = out.replace(/\s+\./g, '.');
  return out.slice(0, 180) || 'Документ';
}

function titleCaseLoose(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/(^|[\s\-_/.,])([\p{L}])/gu, (_, sep, chr) => `${sep}${chr.toUpperCase()}`)
    .trim();
}

function compactWhitespace(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function dedupeStrings(items = []) {
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const val = compactWhitespace(raw);
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
  }
  return out;
}


function mapFrancCodeToDocLanguage(code) {
  const map = {
    bul: 'bg', deu: 'de', eng: 'en', spa: 'es', ron: 'ro', rus: 'ru', fra: 'fr', ita: 'it', tur: 'tr', ukr: 'uk'
  };
  return map[String(code || '').toLowerCase()] || '';
}

function isLikelyFullDate(value) {
  return /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(String(value || '')) || /\b\d{4}[./-]\d{1,2}[./-]\d{1,2}\b/.test(String(value || ''));
}

function extractYearValue(value) {
  const match = String(value || '').match(/\b(19\d{2}|20\d{2})\b/);
  return match ? match[1] : '';
}

function splitTopTextLines(text, limit = 24) {
  return String(text || '')
    .split(/\n+/)
    .map(line => compactWhitespace(line.replace(/[|•·•]+/g, ' ')))
    .filter(Boolean)
    .slice(0, limit);
}

function buildDocKeywordStopSet() {
  return new Set([
    'lebenslauf','cv','resume','curriculum','vitae','bewerbung','anschreiben','invoice','rechnung','vertrag','contract',
    'scan','scanned','image','photo','picture','doc','document','dokument','pdf','jpg','jpeg','png','final','neu','new',
    'copy','kopie','version','signed','unsigned','front','back','seite','page'
  ]);
}

function normalizePersonNameCandidate(value) {
  const raw = compactWhitespace(String(value || '').replace(/[|_/]+/g, ' '));
  if (!raw) return '';
  const parser = getNameParserRuntime();
  try {
    if (parser) {
      const parsed = parser(raw, 'all', 1, 0, 0) || parser(raw);
      if (parsed && typeof parsed === 'object') {
        const parts = [parsed.first, parsed.middle, parsed.last].filter(Boolean).map(v => compactWhitespace(v));
        const joined = compactWhitespace(parts.join(' '));
        if (joined && joined.split(/\s+/).length >= 2) return joined;
      }
    }
  } catch {}
  const cleaned = raw
    .replace(/\b(mr|mrs|ms|frau|herr|dr|prof)\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return '';
  if (!words.every(word => /^[\p{L}'-]{2,}$/u.test(word))) return '';
  return titleCaseLoose(words.slice(0, 3).join(' '));
}

function findNameInFileName(fileName) {
  const bare = cleanupImportedFileName(fileName || '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!bare) return '';
  const stop = buildDocKeywordStopSet();
  const tokens = bare.split(/\s+/).filter(token => {
    const lower = token.toLowerCase();
    if (!token) return false;
    if (stop.has(lower)) return false;
    if (/^\d{1,4}$/.test(token)) return false;
    if (token.length < 2) return false;
    return /[\p{L}]/u.test(token);
  });
  if (tokens.length < 2) return '';
  const windows = [];
  for (let size = 3; size >= 2; size -= 1) {
    for (let i = 0; i <= tokens.length - size; i += 1) {
      windows.push(tokens.slice(i, i + size).join(' '));
    }
  }
  for (const candidate of windows) {
    const normalized = normalizePersonNameCandidate(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function isNameLike(value) {
  return !!normalizePersonNameCandidate(value);
}

function scoreDateContext(context, typeKey = 'other') {
  const lower = String(context || '').toLowerCase();
  let score = 0;
  if (/\b(datum|date|issued|issue date|issued on|erstellt|ausgestellt|stand|aktualisiert|updated|created)\b/.test(lower)) score += 22;
  if (/\b(geburtsdatum|date of birth|birth|born|роден|geb\.?)\b/.test(lower)) score -= 45;
  if (/\b(berufserfahrung|experience|employment|ausbildung|education|praktikum|since|von|bis|present)\b/.test(lower)) score -= typeKey === 'cv' ? 24 : 10;
  if (/\d\s*[–-]\s*\d/.test(lower)) score -= 12;
  if (/\b(valid|gültig|expires|exp|ablauf)\b/.test(lower)) score += 6;
  return score;
}

async function detectDateInfoFromTextAndFile(text, cleanFileName = '', typeKey = 'other', fallbackDate = '') {
  const sample = String(text || '').slice(0, SMART_PARSE_TEXT_LIMIT);
  const candidates = [];
  const pushCandidate = (raw, context = '', baseScore = 0, source = 'regex') => {
    const trimmed = compactWhitespace(raw);
    if (!trimmed) return;
    const normalized = isLikelyFullDate(trimmed) ? formatSmartDate(trimmed) : '';
    const year = extractYearValue(trimmed || normalized);
    const score = baseScore + scoreDateContext(context || trimmed, typeKey) + (normalized ? 14 : 0) + (year ? 3 : 0);
    candidates.push({ raw: trimmed, normalizedDate: normalized, year, score, source, context: compactWhitespace(context || '') });
  };

  const fileDateMatches = cleanupImportedFileName(cleanFileName || '').match(/\b(?:\d{4}[._-]\d{1,2}[._-]\d{1,2}|\d{1,2}[._-]\d{1,2}[._-]\d{2,4})\b/g) || [];
  fileDateMatches.forEach(match => pushCandidate(match, `filename ${cleanFileName}`, 18, 'filename-date'));
  const fileYear = extractYearValue(cleanFileName || '');
  if (fileYear) pushCandidate(fileYear, `filename ${cleanFileName}`, 9, 'filename-year');

  const labeledRegex = /(?:datum|date|issued on|issue date|erstellt(?: am)?|ausgestellt(?: am)?|stand|aktualisiert(?: am)?|updated(?: on)?|created(?: on)?)\s*[:\-]?\s*([^\n]{0,40})/gi;
  let labeledMatch;
  while ((labeledMatch = labeledRegex.exec(sample)) !== null) {
    pushCandidate(labeledMatch[1], labeledMatch[0], 18, 'labeled');
  }

  const directMatches = sample.match(/\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/g) || [];
  directMatches.slice(0, 14).forEach(match => {
    const idx = sample.indexOf(match);
    pushCandidate(match, sample.slice(Math.max(0, idx - 40), idx + match.length + 40), 8, 'direct');
  });

  try {
    const chrono = await getChronoRuntime(2200);
    if (chrono && typeof chrono.parse === 'function') {
      const results = chrono.parse(sample, new Date(), { forwardDate: false }) || [];
      results.slice(0, 14).forEach(result => {
        const raw = compactWhitespace(result.text || '');
        const jsDate = result.start && typeof result.start.date === 'function' ? result.start.date() : null;
        const normalized = jsDate && !Number.isNaN(jsDate.getTime())
          ? `${String(jsDate.getDate()).padStart(2, '0')}.${String(jsDate.getMonth() + 1).padStart(2, '0')}.${jsDate.getFullYear()}`
          : '';
        const context = sample.slice(Math.max(0, result.index - 40), result.index + raw.length + 40);
        const year = normalized ? extractYearValue(normalized) : extractYearValue(raw);
        const score = 9 + scoreDateContext(context, typeKey) + (normalized ? 16 : 0);
        candidates.push({ raw, normalizedDate: normalized, year, score, source: 'chrono', context: compactWhitespace(context) });
      });
    }
  } catch {}

  const bestFull = candidates
    .filter(candidate => candidate.normalizedDate)
    .sort((a, b) => b.score - a.score)[0] || null;

  const bestYear = candidates
    .filter(candidate => candidate.year)
    .sort((a, b) => b.score - a.score)[0] || null;

  if (bestFull && bestFull.score >= 12) {
    return {
      normalizedDate: bestFull.normalizedDate,
      detectedYear: bestFull.year || extractYearValue(bestFull.normalizedDate),
      source: bestFull.source,
      confidenceBoost: Math.min(16, Math.max(6, bestFull.score))
    };
  }

  if (bestYear && bestYear.score >= 7) {
    return {
      normalizedDate: isLikelyFullDate(fallbackDate) ? formatSmartDate(fallbackDate) : '',
      detectedYear: bestYear.year,
      source: bestYear.source,
      confidenceBoost: Math.min(10, Math.max(3, bestYear.score))
    };
  }

  return {
    normalizedDate: isLikelyFullDate(fallbackDate) ? formatSmartDate(fallbackDate) : '',
    detectedYear: extractYearValue(fallbackDate || cleanFileName),
    source: fallbackDate ? 'fallback' : '',
    confidenceBoost: 0
  };
}

async function detectLanguageFromTextAsync(text, fallback = '') {
  const sample = compactWhitespace(String(text || '').slice(0, SMART_PARSE_TEXT_LIMIT));
  if (!sample) return detectLanguageFromText(fallback || text || '');
  try {
    const franc = await getFrancRuntime(1600);
    if (typeof franc === 'function') {
      const code = franc(sample, { minLength: 20 });
      const mapped = mapFrancCodeToDocLanguage(code);
      if (mapped) return mapped;
    }
  } catch {}
  return detectLanguageFromText(sample || fallback || '');
}

function extractTopNameCandidates(text, nlpDoc = null) {
  const candidates = [];
  if (nlpDoc) {
    try {
      candidates.push(...(nlpDoc.people?.().out('array') || []));
    } catch {}
  }
  for (const line of splitTopTextLines(text, 18)) {
    const cleaned = line.replace(/[0-9@].*$/, '').trim();
    if (!cleaned) continue;
    if (cleaned.split(/\s+/).length > 4) continue;
    candidates.push(cleaned);
  }
  return dedupeStrings(candidates.map(normalizePersonNameCandidate).filter(Boolean));
}

function chooseBestPersonName(typeKey, cleanFileName, text, nlpDoc = null) {
  const fromFile = findNameInFileName(cleanFileName);
  const topCandidates = extractTopNameCandidates(text, nlpDoc);
  if ((typeKey === 'cv' || typeKey === 'application' || typeKey === 'id') && fromFile) return fromFile;
  if (topCandidates[0]) return topCandidates[0];
  return fromFile || '';
}

function normalizeParsedData(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    typeKey: parsed.typeKey || 'other',
    typeLabel: parsed.typeLabel || DOC_TYPE_LABELS[parsed.typeKey] || 'Документ',
    title: parsed.title || '',
    personName: parsed.personName || '',
    organization: parsed.organization || '',
    email: parsed.email || '',
    phone: parsed.phone || '',
    address: parsed.address || '',
    normalizedDate: parsed.normalizedDate || '',
    detectedYear: parsed.detectedYear || '',
    language: parsed.language || '',
    summary: parsed.summary || '',
    notes: parsed.notes || '',
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
    confidence: Number(parsed.confidence) || 0,
    source: parsed.source || 'smart-parse',
    isConfirmed: !!parsed.isConfirmed,
    confirmedAt: parsed.confirmedAt || '',
  };
}

function extractEmails(text) {
  return dedupeStrings((String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(v => v.toLowerCase()));
}

function extractAddressCandidate(text) {
  const patterns = [
    /\b[\p{L}][\p{L}\s.-]{2,}(?:str\.?|straße|street|st\.?|bul\.?|blvd\.?|ул\.?|ul\.?|weg|allee|platz|ring|gasse|ufer)\s*\d+[\p{L}]?(?:,?\s*\d{4,5}\s*[\p{L}\s.-]{2,})?/iu,
    /\b\d{4,5}\s+[\p{L}][\p{L}\s.-]{2,}(?:germany|deutschland|bulgaria|spain|augsburg|regensburg|sofia)?/iu
  ];
  for (const rx of patterns) {
    const match = String(text || '').match(rx);
    if (match) return compactWhitespace(match[0]);
  }
  return '';
}

function detectLanguageFromText(text) {
  const sample = String(text || '').slice(0, SMART_PARSE_TEXT_LIMIT);
  if (!sample) return '';
  const cyr = (sample.match(/[А-Яа-яЁё]/g) || []).length;
  const deHits = (sample.match(/\b(lebenslauf|berufserfahrung|geburtsdatum|familienstand|fähigkeiten|sprache|ausbildung|vertrag|rechnung|datum)\b/gi) || []).length;
  const enHits = (sample.match(/\b(curriculum vitae|resume|experience|education|skills|invoice|contract|date of birth|phone)\b/gi) || []).length;
  if (cyr > 20 && cyr > deHits * 2 && cyr > enHits * 2) return 'bg';
  if (deHits >= enHits && deHits > 0) return 'de';
  if (enHits > 0) return 'en';
  return cyr > 0 ? 'bg' : 'de';
}

function inferTypeFromText(fullText, fileName = '', currentType = 'other') {
  const lower = `${fileName} ${fullText}`.toLowerCase();
  const tests = [
    { typeKey: 'cv', typeLabel: 'CV / Lebenslauf', keywords: ['lebenslauf', 'curriculum vitae', 'berufserfahrung', 'fähigkeiten', 'kenntnisse', 'ausbildung', 'resume', 'über mich', 'uber mich', 'kontakt', 'sprachen', 'persönliche daten'] },
    { typeKey: 'invoice', typeLabel: 'Фактура', keywords: ['rechnung', 'invoice', 'faktura', 'facture', 'betrag', 'summe', 'mwst', 'brutto', 'netto', 'gesamtbetrag'] },
    { typeKey: 'contract', typeLabel: 'Договор', keywords: ['vertrag', 'contract', 'vereinbarung', 'zusatzvereinbarung', 'arbeitsvertrag', 'mietvertrag'] },
    { typeKey: 'application', typeLabel: 'Кандидатура', keywords: ['bewerbung', 'anschreiben', 'motivation', 'cover letter', 'bewerber', 'application'] },
    { typeKey: 'id', typeLabel: 'Лична карта / Паспорт', keywords: ['reisepass', 'паспорт', 'лична карта', 'identity card', 'personalausweis', 'nationalität', 'geburtsort'] },
    { typeKey: 'medical', typeLabel: 'Медицински', keywords: ['krankenkasse', 'arzt', 'befund', 'medical', 'diagnose', 'überweisung', 'patient', 'versicherungskarte'] },
    { typeKey: 'bank', typeLabel: 'Банка', keywords: ['iban', 'bic', 'kontoauszug', 'bank', 'überweisung', 'sparkasse', 'sepa', 'kontoinhaber'] },
    { typeKey: 'insurance', typeLabel: 'Застраховка', keywords: ['versicherung', 'police', 'policy', 'haftpflicht', 'versicherungsnummer'] },
    { typeKey: 'tax', typeLabel: 'Данъци', keywords: ['steuer', 'finanzamt', 'tax', 'nap', 'данък', 'данъчна', 'steuer-id', 'lohnsteuer'] },
  ];
  for (const test of tests) {
    if (test.keywords.some(keyword => lower.includes(keyword))) return test;
  }
  return {
    typeKey: currentType || 'other',
    typeLabel: currentType === 'other' ? 'Документ' : currentType,
    keywords: []
  };
}

function findLikelyPersonName(text, fileName = '') {
  const blocked = new Set(['SPRACHE','KONTAKT','FÄHIGKEITEN','UBER','ÜBER','MICH','AUSBILDUNG','BERUFSERFAHRUNG','AFF','SECURITY','BMW','WERK','BAYERN','SPORTGESCHÄFT','SOFIA','BULGARIEN','CHICAGO','NAME','PHONE','EMAIL']);
  const candidates = [];
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => compactWhitespace(line.replace(/[^\p{L}\s'-]/gu, ' ')))
    .filter(Boolean)
    .slice(0, 24);

  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 3) continue;
    if (words.some(word => blocked.has(word.toUpperCase()))) continue;
    if (words.some(word => word.length < 2)) continue;
    candidates.push(line);
  }

  const cleanedFile = cleanupImportedFileName(fileName).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  if (/\b[a-zа-я]{2,}\s+[a-zа-я]{2,}\b/i.test(cleanedFile)) candidates.push(cleanedFile);

  const best = dedupeStrings(candidates)
    .map(val => {
      const allCaps = val === val.toUpperCase();
      return allCaps ? titleCaseLoose(val) : val;
    })
    .find(val => {
      const words = val.split(/\s+/);
      return words.length >= 2 && words.length <= 3 && words.every(word => /^[\p{L}'-]{2,}$/u.test(word));
    });

  return best || '';
}

function tryParsePhoneCandidate(candidate, parser) {
  if (!candidate || !parser) return '';
  for (const country of [undefined, ...DEFAULT_PHONE_COUNTRIES]) {
    try {
      const parsed = country ? parser(candidate, country) : parser(candidate);
      if (parsed && typeof parsed.isPossible === 'function' && parsed.isPossible()) {
        return parsed.number || parsed.formatInternational?.() || compactWhitespace(candidate);
      }
    } catch {}
  }
  return '';
}

function extractPhoneValue(text) {
  const parser = getPhoneParserRuntime();
  const candidates = dedupeStrings(String(text || '').match(/(?:\+?\d[\d\s().\/-]{6,}\d)/g) || []);
  for (const candidate of candidates) {
    const normalized = tryParsePhoneCandidate(candidate, parser);
    if (normalized) return normalized;
  }
  return candidates[0] ? compactWhitespace(candidates[0]) : '';
}

function detectDateFromText(text) {
  const lower = String(text || '').slice(0, SMART_PARSE_TEXT_LIMIT);
  const direct = lower.match(/(?:\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b20\d{2}[./-]\d{1,2}[./-]\d{1,2}\b)/);
  if (direct) return direct[0];
  const verbose = lower.match(/\b\d{1,2}\s+(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember|януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s+20\d{2}\b/i);
  return verbose ? compactWhitespace(verbose[0]) : '';
}

function formatSmartDate(value) {
  if (!value) return '';
  const trimmed = compactWhitespace(value);
  const iso = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (iso) return `${String(iso[3]).padStart(2, '0')}.${String(iso[2]).padStart(2, '0')}.${iso[1]}`;
  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) return `${String(dmy[1]).padStart(2, '0')}.${String(dmy[2]).padStart(2, '0')}.${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}`;
  return trimmed;
}

function buildSmartSummary(parsed) {
  const parts = [];
  if (parsed.typeLabel) parts.push(parsed.typeLabel);
  if (parsed.personName) parts.push(parsed.personName);
  else if (parsed.organization) parts.push(parsed.organization);
  if (parsed.normalizedDate) parts.push(parsed.normalizedDate);
  else if (parsed.detectedYear) parts.push(parsed.detectedYear);
  if (parsed.email) parts.push(parsed.email);
  return parts.slice(0, 4).join(' • ');
}

function buildSmartTitle(parsed, fallbackTitle, cleanFileName = '') {
  if (parsed.typeKey === 'cv' && parsed.personName) return `CV — ${parsed.personName}`;
  if (parsed.typeKey === 'application' && parsed.personName) return `Кандидатура — ${parsed.personName}`;
  if ((parsed.typeKey === 'invoice' || parsed.typeKey === 'contract') && parsed.organization) {
    return `${parsed.typeLabel} — ${parsed.organization}${parsed.normalizedDate ? ` — ${parsed.normalizedDate}` : ''}`;
  }
  if (parsed.organization && parsed.normalizedDate) return `${parsed.organization} — ${parsed.normalizedDate}`;
  if (parsed.organization) return `${parsed.typeLabel || 'Документ'} — ${parsed.organization}`;
  if (parsed.personName) return `${parsed.typeLabel || 'Документ'} — ${parsed.personName}`;
  const cleaned = cleanupImportedFileName(cleanFileName).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  return fallbackTitle || cleaned || 'Документ';
}

function renderParsedSummaryHtml(parsed, { includeTitle = false, emptyText = 'Няма структурирани полета още.' } = {}) {
  const data = normalizeParsedData(parsed);
  if (!data) return `<div class="agent-result-empty">${emptyText}</div>`;
  const rows = [];
  if (includeTitle && data.title) rows.push(['Заглавие', data.title]);
  if (data.typeLabel) rows.push(['Тип', data.typeLabel]);
  if (data.personName) rows.push(['Име', data.personName]);
  if (data.organization) rows.push(['Организация', data.organization]);
  if (data.email) rows.push(['Имейл', data.email]);
  if (data.phone) rows.push(['Телефон', data.phone]);
  if (data.address) rows.push(['Адрес', data.address]);
  if (data.normalizedDate) rows.push(['Дата', data.normalizedDate]);
  if (data.detectedYear) rows.push(['Година', data.detectedYear]);
  if (data.language) rows.push(['Език', data.language.toUpperCase()]);
  if (data.summary) rows.push(['Резюме', data.summary]);
  if (data.notes) rows.push(['Ръчни бележки', data.notes]);
  if (data.isConfirmed) rows.push(['Потвърдено', data.confirmedAt ? formatDate(data.confirmedAt) : 'Да']);
  return `
    <div class="smart-parse-grid">
      ${rows.map(([label, value]) => `
        <div class="smart-parse-card">
          <span class="smart-parse-key">${escHtml(label)}</span>
          <strong class="smart-parse-val">${escHtml(value)}</strong>
        </div>
      `).join('')}
    </div>
    ${(data.keywords && data.keywords.length) || data.isConfirmed ? `<div class="smart-tag-row">${data.isConfirmed ? `<span class="smart-tag is-confirmed">Потвърдено</span>` : ''}${(data.keywords||[]).map(tag => `<span class="smart-tag">${escHtml(tag)}</span>`).join('')}</div>` : ''}
  `;
}

async function smartParseDocument(doc, rawText = '') {
  const text = normalizeExtractedText(rawText || doc.extractedText || '').slice(0, SMART_PARSE_TEXT_LIMIT);
  const cleanFileName = cleanupImportedFileName(doc.cleanFileName || doc.originalFileName || doc.title || '');
  const typeInfo = inferTypeFromText(text, cleanFileName, doc.docType || 'other');
  let nlpDoc = null;
  try {
    const runtime = await getNlpRuntime(2600);
    nlpDoc = runtime(text);
  } catch {}

  const organizations = nlpDoc ? dedupeStrings((nlpDoc.organizations?.().out('array') || []).map(val => compactWhitespace(val))) : [];
  const emails = extractEmails(text);
  const phone = extractPhoneValue(text);
  const address = extractAddressCandidate(text);
  const candidateName = chooseBestPersonName(typeInfo.typeKey, cleanFileName, text, nlpDoc) || findLikelyPersonName(text, cleanFileName);
  const organization = (typeInfo.typeKey === 'cv' || typeInfo.typeKey === 'application')
    ? ''
    : (organizations.find(val => val && (!candidateName || val.toUpperCase() !== candidateName.toUpperCase())) || doc.institution || '');
  const dateInfo = await detectDateInfoFromTextAndFile(text, cleanFileName, typeInfo.typeKey, doc.date || doc.detectedDate || '');
  const language = await detectLanguageFromTextAsync(text || cleanFileName, cleanFileName);
  const keywords = dedupeStrings([
    typeInfo.typeLabel,
    organization,
    language,
    candidateName ? 'person' : '',
    emails[0] ? 'email' : '',
    phone ? 'phone' : '',
    address ? 'address' : '',
    dateInfo.normalizedDate ? 'date' : '',
    dateInfo.detectedYear ? 'year' : ''
  ]).slice(0, 8);

  let confidence = 22;
  if (text.length > 120) confidence += 18;
  if (text.length > 1200) confidence += 10;
  if (typeInfo.typeKey && typeInfo.typeKey !== 'other') confidence += 16;
  if (candidateName) confidence += 16;
  if (emails[0]) confidence += 12;
  if (phone) confidence += 10;
  if (address) confidence += 8;
  if (organization) confidence += 8;
  if (dateInfo.normalizedDate) confidence += 10;
  else if (dateInfo.detectedYear) confidence += 4;
  if (language) confidence += 4;
  confidence += Number(dateInfo.confidenceBoost || 0);
  if (typeInfo.typeKey === 'cv' && candidateName) confidence += 8;
  confidence = Math.max(doc.confidence || 0, Math.min(confidence, 99));

  const parsed = normalizeParsedData({
    typeKey: typeInfo.typeKey,
    typeLabel: typeInfo.typeLabel,
    title: '',
    personName: candidateName,
    organization,
    email: emails[0] || '',
    phone,
    address,
    normalizedDate: dateInfo.normalizedDate || '',
    detectedYear: dateInfo.detectedYear || '',
    language,
    summary: '',
    keywords,
    confidence,
    source: 'external-pass5-autofill'
  });
  parsed.summary = buildSmartSummary(parsed);
  parsed.title = buildSmartTitle(parsed, doc.title || cleanFileName.replace(/\.[a-z0-9]{2,5}$/i, ''), cleanFileName);
  return parsed;
}

async function applySmartParseToDoc(doc, rawText = '') {
  if (!doc) return null;
  const parsed = await smartParseDocument(doc, rawText);
  if (!parsed) return null;
  doc.parsedData = parsed;
  doc.parserVersion = PARSER_VERSION;
  doc.cleanFileName = cleanupImportedFileName(doc.cleanFileName || doc.originalFileName || '');
  doc.title = parsed.title || doc.title;
  if (parsed.typeKey && parsed.typeKey !== 'other') doc.docType = parsed.typeKey;
  if (parsed.organization) doc.institution = parsed.organization;
  if (parsed.normalizedDate) {
    doc.date = parsed.normalizedDate;
    doc.detectedDate = parsed.normalizedDate;
  }
  if (parsed.detectedYear) doc.detectedYear = parsed.detectedYear;
  doc.confidence = parsed.confidence || doc.confidence || 0;
  if (rawText) doc.extractedText = normalizeExtractedText(rawText);
  if (parsed.summary) doc.summary = parsed.summary;
  return parsed;
}


async function autoFillIntakeItem(item) {
  if (!item || !item.blobKey || !['pdf', 'image'].includes(item.previewType)) return item;
  let extracted = normalizeExtractedText(item.extractedText || '');
  if (!extracted) {
    if (item.previewType === 'pdf') {
      extracted = await extractPdfTextFromBlobKey(item.blobKey, 5);
    } else if (item.previewType === 'image' && (item.fileSize || 0) <= AUTO_FILL_IMAGE_OCR_MAX_BYTES) {
      extracted = await extractImageTextFromBlobKey(item.blobKey);
    }
  }
  if (!extracted) return item;

  item.extractedText = extracted;
  const draftDoc = makeDocFromIntake(item, { status: 'pending' });
  draftDoc.extractedText = extracted;
  const parsed = await smartParseDocument(draftDoc, extracted);
  if (!parsed) return item;

  item.parsedData = parsed;
  item.parserVersion = PARSER_VERSION;
  item.docType = parsed.typeKey || item.docType || 'other';
  item.docTypeLabel = parsed.typeLabel || DOC_TYPE_LABELS[item.docType] || 'Документ';
  item.suggestedTitle = parsed.title || item.suggestedTitle;
  item.institution = parsed.organization || item.institution || '';
  item.detectedDate = parsed.normalizedDate || '';
  item.detectedYear = parsed.detectedYear || item.detectedYear || '';
  item.summary = parsed.summary || item.summary || '';
  item.confidence = Math.max(item.confidence || 0, parsed.confidence || 0);
  if (!item.suggestedFolderId) {
    const folderHint = HEURISTICS.suggestFolder({
      institution: item.institution || '',
      docTypeLabel: item.docTypeLabel || DOC_TYPE_LABELS[item.docType] || 'Документ',
      suggestedTitle: item.suggestedTitle || item.originalFileName || 'Документ'
    }, state.folders);
    if (folderHint && folderHint.folder?.id) {
      item.suggestedFolderId = folderHint.folder.id;
      item.isReview = !!folderHint.isReview;
    }
  }
  return item;
}

async function upgradeAutoFillMetadataIfNeeded() {
  let changed = false;
  for (const doc of (state.documents || [])) {
    if (Number(doc.parserVersion || 0) >= PARSER_VERSION) continue;
    try {
      await applySmartParseToDoc(doc, doc.extractedText || '');
      changed = true;
    } catch (err) {
      console.warn('DocOS: doc auto-upgrade skipped', err);
    }
  }
  for (const item of (state.intakeQueue || [])) {
    if (Number(item.parserVersion || 0) >= PARSER_VERSION) continue;
    try {
      const draftDoc = makeDocFromIntake(item, { status: 'pending' });
      const parsed = await smartParseDocument(draftDoc, item.extractedText || '');
      if (!parsed) continue;
      item.parsedData = parsed;
      item.parserVersion = PARSER_VERSION;
      item.docType = parsed.typeKey || item.docType || 'other';
      item.docTypeLabel = parsed.typeLabel || DOC_TYPE_LABELS[item.docType] || 'Документ';
      item.suggestedTitle = parsed.title || item.suggestedTitle;
      item.institution = parsed.organization || item.institution || '';
      item.detectedDate = parsed.normalizedDate || item.detectedDate || '';
      item.detectedYear = parsed.detectedYear || item.detectedYear || '';
      item.summary = parsed.summary || item.summary || '';
      item.confidence = Math.max(item.confidence || 0, parsed.confidence || 0);
      changed = true;
    } catch (err) {
      console.warn('DocOS: queue auto-upgrade skipped', err);
    }
  }
  if (changed) saveState();
}

async function smartParseDocById(docId, silent = false) {
  const doc = state.documents.find(d => d.id === docId);
  if (!doc) return;
  if (!doc.extractedText) {
    showToast('⚠️ Първо извади текст');
    return;
  }
  try {
    await applySmartParseToDoc(doc, doc.extractedText);
    saveState();
    renderAgentForDoc(docId);
    if (currentPreviewDocId === docId) openDocPreview(docId);
    if (!silent) showToast('✨ Smart parse обновен');
  } catch (e) {
    console.error('DocOS smart parse failed', e);
    if (!silent) showToast('⚠️ Smart parse не успя');
  }
}

/* ═══════════════════════════════════════════════
   PASS 4 — Structured field editor (external JSON Editor)
═══════════════════════════════════════════════ */

let fieldEditorInstance = null;
let currentFieldEditorDocId = null;

function getJsonEditorRuntime() {
  if (window.JSONEditor) return Promise.resolve(window.JSONEditor);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (window.JSONEditor) resolve(window.JSONEditor);
      else reject(new Error('JSONEditor unavailable'));
    };
    const timer = setTimeout(finish, 3200);
    window.addEventListener('docos:jsoneditor-ready', () => { clearTimeout(timer); finish(); }, { once: true });
  });
}

function parseKeywordText(input) {
  return dedupeStrings(String(input || '').split(/[;,\n]/g));
}

function getDocTypeLabel(typeKey) {
  return DOC_TYPE_LABELS[typeKey] || 'Документ';
}

function getStructuredFieldSchema() {
  const folderIds = [''].concat((state.folders || []).map(f => f.id));
  const folderTitles = ['Без папка'].concat((state.folders || []).map(f => `${f.icon || '📁'} ${f.name}`));
  return {
    type: 'object',
    title: 'Слой за истина',
    format: 'categories',
    options: { disable_properties: true },
    properties: {
      basic: {
        type: 'object',
        title: 'Основни',
        format: 'grid-strict',
        options: { disable_properties: true },
        properties: {
          title: { type: 'string', title: 'Заглавие', minLength: 1, options: { grid_columns: 12 } },
          typeKey: { type: 'string', title: 'Тип документ', enum: ['cv','application','invoice','contract','id','medical','bank','insurance','tax','other'], options: { enum_titles: ['CV / Lebenslauf','Кандидатура','Фактура','Договор','Лична карта / Паспорт','Медицински','Банка','Застраховка','Данъци','Документ'], grid_columns: 6 } },
          status: { type: 'string', title: 'Статус', enum: ['saved','pending'], options: { enum_titles: ['Запазен','За преглед'], grid_columns: 6 } },
          folderId: { type: 'string', title: 'Папка', enum: folderIds, options: { enum_titles: folderTitles, grid_columns: 6 } },
          language: { type: 'string', title: 'Език', enum: ['', 'bg','de','en','other'], options: { enum_titles: ['—','BG','DE','EN','OTHER'], grid_columns: 6 } },
          confidence: { type: 'integer', title: 'Увереност', minimum: 0, maximum: 100, default: 50, options: { grid_columns: 6 } },
          confirmed: { type: 'boolean', title: 'Потвърдено от човек', format: 'checkbox', options: { grid_columns: 6 } }
        }
      },
      contact: {
        type: 'object',
        title: 'Контакт / Организация',
        format: 'grid-strict',
        options: { disable_properties: true },
        properties: {
          personName: { type: 'string', title: 'Име', options: { grid_columns: 6 } },
          organization: { type: 'string', title: 'Организация', options: { grid_columns: 6 } },
          email: { type: 'string', title: 'Имейл', format: 'email', options: { grid_columns: 6 } },
          phone: { type: 'string', title: 'Телефон', options: { grid_columns: 6 } },
          address: { type: 'string', title: 'Адрес', format: 'textarea', options: { grid_columns: 12 } }
        }
      },
      details: {
        type: 'object',
        title: 'Детайли',
        format: 'grid-strict',
        options: { disable_properties: true },
        properties: {
          normalizedDate: { type: 'string', title: 'Дата', options: { grid_columns: 6 } },
          detectedYear: { type: 'string', title: 'Година', options: { grid_columns: 6 } },
          keywordsText: { type: 'string', title: 'Тагове', description: 'Разделяй със запетая', options: { grid_columns: 12 } },
          summary: { type: 'string', title: 'Резюме', format: 'textarea', options: { grid_columns: 12 } },
          notes: { type: 'string', title: 'Ръчни бележки', format: 'textarea', options: { grid_columns: 12 } }
        }
      },
      audit: {
        type: 'object',
        title: 'Контрол',
        format: 'grid-strict',
        options: { disable_properties: true },
        properties: {
          cleanFileName: { type: 'string', title: 'Чисто име на файл', options: { grid_columns: 12 } },
          confirmedAt: { type: 'string', title: 'Потвърдено на', options: { grid_columns: 12 } }
        }
      }
    }
  };
}

function buildStructuredFieldStartValue(doc) {
  const parsed = normalizeParsedData(doc.parsedData || null) || normalizeParsedData({
    typeKey: doc.docType || 'other',
    typeLabel: getDocTypeLabel(doc.docType || 'other'),
    title: doc.title || '',
    organization: doc.institution || '',
    normalizedDate: doc.date || doc.detectedDate || '',
    detectedYear: doc.detectedYear || '',
    summary: doc.summary || '',
    confidence: doc.confidence || 0,
    source: 'external-pass4-jsoneditor'
  });
  return {
    basic: {
      title: parsed.title || doc.title || 'Документ',
      typeKey: parsed.typeKey || doc.docType || 'other',
      status: doc.status || 'saved',
      folderId: doc.folderId || '',
      language: parsed.language || '',
      confidence: Number(parsed.confidence || doc.confidence || 0),
      confirmed: !!parsed.isConfirmed
    },
    contact: {
      personName: parsed.personName || '',
      organization: parsed.organization || doc.institution || '',
      email: parsed.email || '',
      phone: parsed.phone || '',
      address: parsed.address || ''
    },
    details: {
      normalizedDate: parsed.normalizedDate || doc.date || doc.detectedDate || '',
      detectedYear: parsed.detectedYear || doc.detectedYear || '',
      keywordsText: (parsed.keywords || []).join(', '),
      summary: parsed.summary || doc.summary || '',
      notes: parsed.notes || ''
    },
    audit: {
      cleanFileName: cleanupImportedFileName(doc.cleanFileName || doc.originalFileName || doc.title || ''),
      confirmedAt: parsed.confirmedAt || ''
    }
  };
}

function buildParsedDataFromStructuredValue(value, doc, { forceConfirm = false } = {}) {
  const basic = value?.basic || {};
  const contact = value?.contact || {};
  const details = value?.details || {};
  const audit = value?.audit || {};
  const cleanFileName = cleanupImportedFileName(audit.cleanFileName || doc.cleanFileName || doc.originalFileName || doc.title || '');
  const inferredTitle = buildSmartTitle({
    typeKey: basic.typeKey || doc.docType || 'other',
    typeLabel: getDocTypeLabel(basic.typeKey || doc.docType || 'other'),
    personName: compactWhitespace(contact.personName || ''),
    organization: compactWhitespace(contact.organization || ''),
    normalizedDate: compactWhitespace(details.normalizedDate || ''),
  }, compactWhitespace(basic.title || doc.title || ''), cleanFileName);
  const isConfirmed = !!basic.confirmed || !!forceConfirm;
  return normalizeParsedData({
    typeKey: basic.typeKey || doc.docType || 'other',
    typeLabel: getDocTypeLabel(basic.typeKey || doc.docType || 'other'),
    title: compactWhitespace(basic.title || inferredTitle || doc.title || 'Документ'),
    personName: compactWhitespace(contact.personName || ''),
    organization: compactWhitespace(contact.organization || ''),
    email: compactWhitespace(contact.email || ''),
    phone: compactWhitespace(contact.phone || ''),
    address: compactWhitespace(contact.address || ''),
    normalizedDate: compactWhitespace(details.normalizedDate || ''),
    detectedYear: compactWhitespace(details.detectedYear || ''),
    language: compactWhitespace(basic.language || ''),
    summary: compactWhitespace(details.summary || ''),
    notes: compactWhitespace(details.notes || ''),
    keywords: parseKeywordText(details.keywordsText || ''),
    confidence: Math.max(0, Math.min(100, Number(basic.confidence || doc.confidence || 0))),
    source: 'external-pass4-jsoneditor',
    isConfirmed,
    confirmedAt: isConfirmed ? (compactWhitespace(audit.confirmedAt || '') || new Date().toISOString()) : ''
  });
}

function applyStructuredParsedDataToDoc(doc, parsed, formValue = null) {
  if (!doc || !parsed) return;
  const basic = formValue?.basic || {};
  const audit = formValue?.audit || {};
  doc.parsedData = parsed;
  doc.parserVersion = Math.max(PARSER_VERSION, 4);
  doc.title = parsed.title || doc.title || 'Документ';
  doc.docType = parsed.typeKey || doc.docType || 'other';
  doc.institution = parsed.organization || '';
  doc.date = parsed.normalizedDate || '';
  doc.detectedDate = parsed.normalizedDate || '';
  doc.detectedYear = parsed.detectedYear || '';
  doc.confidence = parsed.confidence || 0;
  doc.summary = parsed.summary || parsed.notes || doc.summary || '';
  doc.cleanFileName = cleanupImportedFileName(audit.cleanFileName || doc.cleanFileName || doc.originalFileName || doc.title || '');
  doc.folderId = basic.folderId || null;
  doc.status = parsed.isConfirmed ? 'saved' : (basic.status || doc.status || 'saved');
}

function destroyFieldEditorInstance() {
  try {
    fieldEditorInstance?.destroy?.();
  } catch {}
  fieldEditorInstance = null;
  const mount = document.getElementById('fieldEditorMount');
  if (mount) mount.innerHTML = '';
}

async function openStructuredFieldEditor(docId, source = 'agent') {
  const doc = state.documents.find(d => d.id === docId);
  if (!doc) return;
  try {
    const JSONEditor = await getJsonEditorRuntime();
    currentFieldEditorDocId = docId;
    document.getElementById('fieldEditorDocMeta').innerHTML = `
      <div class="field-editor-docline"><strong>${escHtml(doc.title || 'Документ')}</strong><span class="field-editor-docsub">${escHtml(doc.originalFileName || '—')}</span></div>
      <div class="field-editor-state">${source === 'preview' ? 'Преглед → Полета' : 'Агент → Полета'}</div>
    `;
    destroyFieldEditorInstance();
    fieldEditorInstance = new JSONEditor(document.getElementById('fieldEditorMount'), {
      schema: getStructuredFieldSchema(),
      theme: 'html',
      disable_collapse: true,
      disable_edit_json: true,
      disable_properties: true,
      show_errors: 'change',
      no_additional_properties: true,
      remove_empty_properties: false,
      startval: buildStructuredFieldStartValue(doc)
    });
    showSheet('fieldEditorSheet', 'fieldEditorBackdrop');
  } catch (err) {
    console.error('DocOS JSONEditor unavailable', err);
    showToast('⚠️ Редакторът на полета не се зареди');
  }
}

function closeStructuredFieldEditor() {
  closeSheet('fieldEditorSheet', 'fieldEditorBackdrop');
  destroyFieldEditorInstance();
  currentFieldEditorDocId = null;
}

function refreshViewsAfterStructuredSave(docId) {
  renderDashboard();
  renderMoreTab();
  if (state.currentFolderId) renderFolderDetail();
  else if (state.currentTab === 'documents') renderDocuments();
  else renderDocList?.();
  renderAgentTab();
  const sel = document.getElementById('agentDocSelect');
  if (sel) sel.value = docId || '';
  if (docId) renderAgentForDoc(docId);
  if (currentPreviewDocId === docId) openDocPreview(docId);
}

function saveStructuredFieldEditor({ forceConfirm = false } = {}) {
  const doc = state.documents.find(d => d.id === currentFieldEditorDocId);
  if (!doc || !fieldEditorInstance) return;
  const errors = fieldEditorInstance.validate?.() || [];
  if (errors.length) {
    showToast('⚠️ Поправи маркираните полета');
    return;
  }
  const formValue = fieldEditorInstance.getValue();
  const parsed = buildParsedDataFromStructuredValue(formValue, doc, { forceConfirm });
  applyStructuredParsedDataToDoc(doc, parsed, formValue);
  saveState();
  closeStructuredFieldEditor();
  refreshViewsAfterStructuredSave(doc.id);
  showToast(forceConfirm ? '✅ Полетата са потвърдени' : '💾 Полетата са запазени');
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'download.bin';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

function collectReferencedBlobKeys() {
  const keys = new Set();
  (state.documents || []).forEach(doc => { if (doc.blobKey) keys.add(doc.blobKey); });
  (state.intakeQueue || []).forEach(item => { if (item.blobKey) keys.add(item.blobKey); });
  return [...keys];
}

async function renderPdfPageToCanvas(blob, { pageNumber = 1, maxWidth = 900 } = {}) {
  const pdfjs = await getPdfJsRuntime();
  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages || 1));
  const baseViewport = page.getViewport({ scale: 1 });
  const widthTarget = Math.max(180, Math.min(maxWidth, baseViewport.width));
  const scale = widthTarget / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return { canvas, pdf, pageCount: pdf.numPages || 1 };
}

async function generatePdfThumbDataUrlFromBlob(blob) {
  try {
    const { canvas } = await renderPdfPageToCanvas(blob, { maxWidth: 240 });
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (e) {
    console.warn('DocOS: PDF thumbnail generation failed', e);
    return '';
  }
}

async function renderPdfIntoElement(container, blobKey, fileName = '') {
  const record = await getAssetRecord(blobKey);
  const blob = record?.blob || null;
  if (!blob) throw new Error('missing pdf blob');

  try {
    const { canvas, pageCount } = await renderPdfPageToCanvas(blob, {
      maxWidth: Math.max(260, Math.min((container.clientWidth || 360) - 18, 900))
    });
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'pdf-canvas-wrap';
    wrap.appendChild(canvas);
    const meta = document.createElement('div');
    meta.className = 'pdf-preview-meta';
    meta.textContent = `PDF преглед · страница 1 / ${pageCount}`;
    const link = document.createElement('a');
    link.className = 'preview-download-link';
    link.textContent = '⬇️ Отвори оригиналния PDF';
    link.href = await getObjectUrlForBlobKey(blobKey, blob);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.append(wrap, meta, link);
  } catch (e) {
    const objectUrl = await getObjectUrlForBlobKey(blobKey, blob);
    container.innerHTML = `<iframe src="${objectUrl}" title="PDF преглед" style="width:100%;min-height:54vh;border:0;border-radius:16px;background:#0b0b0f"></iframe>`;
  }
}

async function extractPdfTextFromBlobKey(blobKey, maxPages = 5) {
  const pdfjs = await getPdfJsRuntime();
  const record = await getAssetRecord(blobKey);
  const blob = record?.blob || null;
  if (!blob) throw new Error('missing pdf blob');
  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(pdf.numPages || 1, maxPages);
  const chunks = [];
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = (textContent.items || []).map(item => item.str || '').join(' ').trim();
    if (text) chunks.push(text);
  }
  return normalizeExtractedText(chunks.join('\n\n'));
}

async function extractImageTextFromBlobKey(blobKey) {
  const TesseractRuntime = await getTesseractRuntime();
  const record = await getAssetRecord(blobKey);
  const blob = record?.blob || null;
  if (!blob) throw new Error('missing image blob');
  let worker;
  try {
    try {
      worker = await TesseractRuntime.createWorker(OCR_LANG_PRIMARY);
    } catch (langErr) {
      worker = await TesseractRuntime.createWorker(OCR_LANG_FALLBACK);
    }
    const result = await worker.recognize(blob);
    return normalizeExtractedText(result?.data?.text || '');
  } finally {
    try { if (worker) await worker.terminate(); } catch {}
  }
}

async function exportBackupZip() {
  if (!window.JSZip) {
    showToast('⚠️ Backup engine липсва');
    return;
  }
  try {
    showToast('📦 Създавам backup ZIP...', 2600);
    const zip = new window.JSZip();
    const snapshot = buildPersistableStateSnapshot();
    zip.file('docos-state.json', JSON.stringify(snapshot, null, 2));
    const assetFolder = zip.folder('assets');
    const manifest = [];
    for (const blobKey of collectReferencedBlobKeys()) {
      const record = await getAssetRecord(blobKey);
      if (!record?.blob) continue;
      const fileName = sanitizeFileName(record.fileName || `${blobKey}.bin`);
      const archiveName = `${blobKey}__${fileName}`;
      assetFolder.file(archiveName, record.blob);
      manifest.push({
        blobKey,
        archiveName,
        fileName: record.fileName || fileName,
        mimeType: record.mimeType || record.blob.type || '',
        size: Number(record.size) || Number(record.blob.size) || 0,
        createdAt: record.createdAt || ''
      });
    }
    zip.file('docos-assets.json', JSON.stringify(manifest, null, 2));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    downloadBlob(blob, `docos-backup-${stamp}.zip`);
    showToast('✅ Backup ZIP е готов');
  } catch (e) {
    console.error('DocOS backup export failed', e);
    showToast('⚠️ Backup export failed');
  }
}

async function importBackupZip(file) {
  if (!file || !window.JSZip) {
    showToast('⚠️ Невалиден backup файл');
    return;
  }
  try {
    showToast('📥 Импортирам backup...', 2600);
    const zip = await window.JSZip.loadAsync(file);
    const stateFile = zip.file('docos-state.json');
    if (!stateFile) throw new Error('missing state file');
    const rawState = await stateFile.async('string');
    const imported = JSON.parse(rawState);
    const assetsFile = zip.file('docos-assets.json');
    const manifest = assetsFile ? JSON.parse(await assetsFile.async('string')) : [];

    releaseAllRuntimeObjectUrls();
    await clearAssetStore();

    for (const entry of manifest) {
      const zipped = zip.file(`assets/${entry.archiveName}`);
      if (!zipped) continue;
      const blob = await zipped.async('blob');
      await putAssetRecord({
        id: entry.blobKey,
        blob,
        fileName: entry.fileName || entry.archiveName,
        mimeType: entry.mimeType || blob.type || 'application/octet-stream',
        size: Number(entry.size) || blob.size || 0,
        createdAt: entry.createdAt || new Date().toISOString()
      });
    }

    state = {
      folders: [],
      documents: [],
      deadlines: [],
      quickLinks: [],
      theme: 'black-blue',
      currentTab: 'dashboard',
      currentFolderId: null,
      intakeQueue: [],
      _version: 3,
      ...imported
    };
    state.documents = (state.documents || []).map(migrateDoc);
    state.intakeQueue = (state.intakeQueue || []).map(migrateQueueItem);
    if (!Array.isArray(state.folders)) state.folders = [];
    if (!Array.isArray(state.deadlines)) state.deadlines = [];
    if (!Array.isArray(state.alerts)) state.alerts = [];
    if (!Array.isArray(state.quickLinks)) state.quickLinks = [];
    state.deadlines = state.deadlines.map(normalizeDeadline);
    state.alerts = state.alerts.map(normalizeAlert).filter(Boolean);
    if (!Array.isArray(state.intakeQueue)) state.intakeQueue = [];

    saveState();
    await hydrateRuntimePreviewUrls().catch(() => {});
    await refreshStorageEstimate(true).catch(() => {});
    applyTheme(state.theme || 'black-blue');
    showTab(state.currentTab || 'dashboard');
    showToast('✅ Backup импортът е готов');
  } catch (e) {
    console.error('DocOS backup import failed', e);
    showToast('⚠️ Backup import failed');
  }
}

async function openOriginalFile(doc) {
  if (!doc?.blobKey) {
    showToast('⚠️ Няма оригинален файл');
    return;
  }
  try {
    const objectUrl = await getObjectUrlForBlobKey(doc.blobKey);
    if (!objectUrl) throw new Error('missing object url');
    const win = window.open(objectUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      const record = await getAssetRecord(doc.blobKey);
      if (record?.blob) downloadBlob(record.blob, doc.originalFileName || `${doc.title || 'document'}`);
    }
  } catch (e) {
    console.error('DocOS open file failed', e);
    showToast('⚠️ Не може да се отвори файлът');
  }
}

async function downloadOriginalFile(doc) {
  if (!doc?.blobKey) {
    showToast('⚠️ Няма файл за теглене');
    return;
  }
  try {
    const record = await getAssetRecord(doc.blobKey);
    if (!record?.blob) throw new Error('missing original blob');
    downloadBlob(record.blob, doc.originalFileName || doc.cleanFileName || `${doc.title || 'document'}`);
    showToast('⬇️ Тегленето започна');
  } catch (e) {
    console.error('DocOS download file failed', e);
    showToast('⚠️ Не може да се изтегли файлът');
  }
}

async function extractTextForDoc(docId) {
  const doc = state.documents.find(d => d.id === docId);
  if (!doc?.blobKey) {
    showToast('⚠️ Липсва файл за анализ');
    return;
  }
  const resultPanel = document.getElementById('agentResultPanel');
  if (resultPanel) {
    resultPanel.style.display = 'block';
    resultPanel.innerHTML = `<div class="agent-result-empty">⏳ Анализът върви... първото OCR зареждане може да е по-бавно.</div>`;
  }
  try {
    let text = '';
    if (doc.previewType === 'pdf') text = await extractPdfTextFromBlobKey(doc.blobKey, 5);
    else if (doc.previewType === 'image') text = await extractImageTextFromBlobKey(doc.blobKey);
    else throw new Error('unsupported extract type');
    doc.extractedText = text;
    await applySmartParseToDoc(doc, text);
    saveState();
    renderAgentForDoc(docId);
    if (currentPreviewDocId === docId) openDocPreview(docId);
    showToast(text ? '✅ Текстът е извлечен' : '⚠️ Няма открит текст');
  } catch (e) {
    console.error('DocOS extract text failed', e);
    if (resultPanel) {
      resultPanel.style.display = 'block';
      resultPanel.innerHTML = `<div class="agent-result-empty">⚠️ Анализът не успя. Провери интернет връзката и опитай пак.</div>`;
    }
    showToast('⚠️ Анализът не успя');
  }
}

/* ═══════════════════════════════════════════════
   4. UTILITIES
═══════════════════════════════════════════════ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('bg-BG', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return iso; }
}

function formatBytes(bytes) {
  const num = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = num;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = i <= 1 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - now) / 86400000);
}

function showToast(msg, duration=2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, duration);
}

function confidenceLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function confidenceLabel(score) {
  if (score >= 70) return score + '% ✓';
  if (score >= 40) return score + '% ~';
  return score + '% ?';
}

function percentOf(part, total) {
  if (!total) return 0;
  return Math.min((part / total) * 100, 100);
}

function blobSize(value) {
  try {
    return new Blob([typeof value === 'string' ? value : JSON.stringify(value || '')]).size;
  } catch {
    return 0;
  }
}


function getStorageMetrics() {
  const docs = state.documents || [];
  const queue = state.intakeQueue || [];
  const folders = state.folders || [];
  const deadlines = state.deadlines || [];
  const quickLinks = state.quickLinks || [];

  const docsMetaBytes = blobSize(docs.map(d => ({
    id: d.id, title: d.title, folderId: d.folderId, status: d.status, sourceType: d.sourceType, institution: d.institution,
    date: d.date, detectedDate: d.detectedDate, detectedYear: d.detectedYear, detectedTime: d.detectedTime,
    summary: d.summary, confidence: d.confidence, createdAt: d.createdAt, previewType: d.previewType,
    originalFileName: d.originalFileName, docType: d.docType, blobKey: d.blobKey, fileMime: d.fileMime, fileSize: d.fileSize
  })));

  const queueBytes = blobSize(queue.map(i => ({
    id: i.id, originalFileName: i.originalFileName, suggestedTitle: i.suggestedTitle, docType: i.docType, docTypeLabel: i.docTypeLabel,
    institution: i.institution, detectedDate: i.detectedDate, detectedYear: i.detectedYear, detectedTime: i.detectedTime,
    confidence: i.confidence, suggestedFolderId: i.suggestedFolderId, previewType: i.previewType, blobKey: i.blobKey,
    fileMime: i.fileMime, fileSize: i.fileSize
  })));

  const miscBytes = blobSize({ folders, deadlines, alerts: state.alerts || [], quickLinks, theme: state.theme, currentTab: state.currentTab, currentFolderId: state.currentFolderId });

  const countedBlobKeys = new Set();
  let assetBytes = 0;
  const addAssetBytes = (record) => {
    if (!record) return;
    if (record.blobKey) {
      if (countedBlobKeys.has(record.blobKey)) return;
      countedBlobKeys.add(record.blobKey);
      assetBytes += Number(record.fileSize) || 0;
      return;
    }
    if (record.previewDataUrl) assetBytes += blobSize(record.previewDataUrl);
    if (record.rawDataUrl) assetBytes += blobSize(record.rawDataUrl);
  };

  docs.forEach(addAssetBytes);
  queue.forEach(addAssetBytes);

  const appTrackedBytes = docsMetaBytes + assetBytes + queueBytes + miscBytes;
  const siteUsageBytes = Number(storageRuntime.usageBytes) || 0;
  const localBudgetBytes = Number(storageRuntime.quotaBytes) || SAFE_LOCAL_BUDGET_BYTES;
  const usedBytes = appTrackedBytes;
  const localPct = percentOf(usedBytes, localBudgetBytes);
  const imageCount = docs.filter(d => d.previewType === 'image').length + queue.filter(i => i.previewType === 'image').length;
  const freeBytes = Math.max(localBudgetBytes - usedBytes, 0);
  const untrackedBytes = Math.max(siteUsageBytes - appTrackedBytes, 0);
  const breakdownTotalBytes = docsMetaBytes + assetBytes + queueBytes + miscBytes || 1;
  const sourceLabel = 'DocOS';
  const noteLabel = 'реално';
  const persistedLabel = storageRuntime.persisted === true ? 'Да' : storageRuntime.persisted === false ? 'Не' : '—';
  const truthFoot = 'Показва реално заетото място от DocOS. Браузърният общ usage може да е различен.';

  let health = 'Стабилно';
  let healthClass = '';
  if (localPct >= 85) { health = 'Риск'; healthClass = 'danger'; }
  else if (localPct >= 60) { health = 'Внимание'; healthClass = 'warn'; }

  return {
    usedBytes,
    docsMetaBytes,
    previewBytes: assetBytes,
    queueBytes,
    miscBytes,
    appTrackedBytes,
    siteUsageBytes,
    untrackedBytes,
    localPct,
    imageCount,
    queueCount: queue.length,
    foldersCount: folders.length,
    docsCount: docs.length,
    pendingCount: docs.filter(d => d.status === 'pending').length,
    quickLinksCount: quickLinks.length,
    freeBytes,
    localBudgetBytes,
    health,
    healthClass,
    breakdownTotalBytes,
    sourceLabel,
    noteLabel,
    persistedLabel,
    truthFoot,
    quotaBytes: localBudgetBytes,
    lastSyncLabel: storageRuntime.lastEstimateAt ? new Date(storageRuntime.lastEstimateAt).toLocaleTimeString('bg-BG', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—'
  };
}

function destroyStorageTruthChart() {
  if (storageTruthChart && typeof storageTruthChart.destroy === 'function') {
    storageTruthChart.destroy();
  }
  storageTruthChart = null;
}

function buildStorageTruthChart(metrics) {
  const canvas = document.getElementById('storageTruthChart');
  if (!canvas || !window.Chart) return;

  const segments = [
    { label: 'Метаданни', value: metrics.docsMetaBytes },
    { label: 'Файлове (IDB)', value: metrics.previewBytes },
    { label: 'Опашка', value: metrics.queueBytes },
    { label: 'Папки / настройки', value: metrics.miscBytes }
  ].filter(item => item.value > 0);

  if (metrics.untrackedBytes > 64 * 1024) segments.push({ label: 'Браузърен кеш', value: metrics.untrackedBytes });

  const labels = segments.length ? segments.map(item => item.label) : ['Празно'];
  const data = segments.length ? segments.map(item => item.value) : [1];

  const config = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            color: '#dbe5ff',
            padding: 12
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = Number(context.parsed) || 0;
              return `${context.label}: ${formatBytes(value)}`;
            }
          }
        }
      }
    }
  };

  if (storageTruthChart) {
    storageTruthChart.data = config.data;
    storageTruthChart.options = config.options;
    storageTruthChart.update();
    return;
  }

  storageTruthChart = new window.Chart(canvas, config);
}

async function refreshDashboardTruth(force = false) {
  await Promise.allSettled([
    refreshStorageEstimate(force),
    refreshStoragePersistence(force)
  ]);
  const metrics = getStorageMetrics();
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  setText('storageRingValue', `${metrics.localPct.toFixed(1)}%`);
  setText('storageRealUsedDash', formatBytes(metrics.usedBytes));
  setText('storageRealLimitDash', formatBytes(metrics.localBudgetBytes));
  setText('storageHealthPill', metrics.health);
  setText('storagePlanUsedDash', formatBytes(metrics.usedBytes));
  setText('storagePlanRemainDash', formatBytes(metrics.freeBytes));
  setText('storagePlanNote', metrics.noteLabel);
  setText('storageQuotaTruth', formatBytes(metrics.localBudgetBytes));
  setText('storagePersistTruth', metrics.persistedLabel);
  setText('storageSourceTruth', metrics.sourceLabel);
  setText('storageLastSyncTruth', metrics.lastSyncLabel);
  setText('storageTruthFoot', metrics.truthFoot);

  setText('kpiPreviewBytes', formatBytes(metrics.previewBytes));
  setText('breakMetaBytes', formatBytes(metrics.docsMetaBytes));
  setText('breakPreviewBytes', formatBytes(metrics.previewBytes));
  setText('breakQueueBytes', formatBytes(metrics.queueBytes));
  setText('breakMiscBytes', formatBytes(metrics.miscBytes));
  setText('breakMetaPct', `${percentOf(metrics.docsMetaBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);
  setText('breakPreviewPct', `${percentOf(metrics.previewBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);
  setText('breakQueuePct', `${percentOf(metrics.queueBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);
  setText('breakMiscPct', `${percentOf(metrics.miscBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);

  const ring = document.getElementById('storageRing');
  if (ring) {
    const visibleDeg = Math.max(8, metrics.localPct * 3.6);
    ring.style.setProperty('--ring-pct', `${visibleDeg}deg`);
    ring.style.setProperty('--ring-rot', `${visibleDeg - 90}deg`);
  }
  setText('storageRingUsed', formatBytes(metrics.usedBytes));
  setText('storageRingQuota', formatBytes(metrics.quotaBytes));
  const healthPill = document.getElementById('storageHealthPill');
  if (healthPill) healthPill.className = `storage-health-pill ${metrics.healthClass}`.trim();
  const planFill = document.getElementById('storagePlanFill');
  if (planFill) planFill.style.width = `${Math.max(metrics.localPct, metrics.usedBytes ? 2 : 0)}%`;

  buildStorageTruthChart(metrics);
}



/* ═══════════════════════════════════════════════
   5. HEURISTICS ENGINE
═══════════════════════════════════════════════ */

const HEURISTICS = {

  // Known institution keywords (lowercase)
  institutions: [
    { keywords: ['nap','нап','данъчна','данъчен','данъци','tax'],       label: 'НАП',                icon: '💸' },
    { keywords: ['noi','нои','осигуровки','пенсия','пенсионен'],        label: 'НОИ',                icon: '🏛️' },
    { keywords: ['nzok','нзок','здравна','здравни','здравно'],          label: 'НЗОК',               icon: '🏥' },
    { keywords: ['ток','eвн','евн','evn','енерго','electricity'],       label: 'ЕВН',                icon: '⚡' },
    { keywords: ['виктория','victoria','sofia energy','топлофикация'],  label: 'Топлофикация',       icon: '🔥' },
    { keywords: ['water','вода','вик','кввд'],                          label: 'ВиК',                icon: '💧' },
    { keywords: ['мтел','mtel','телефон','mobile','gsm'],               label: 'Мобилен оператор',   icon: '📱' },
    { keywords: ['виваком','vivacom','bulsatcom','netflash'],           label: 'Интернет доставчик', icon: '🌐' },
    { keywords: ['банк','bank','сметка','account','превод','transfer'], label: 'Банка',              icon: '🏦' },
    { keywords: ['застрахов','insurance','polica','полица'],            label: 'Застраховател',      icon: '🛡️' },
    { keywords: ['нотариус','нотар','notary'],                          label: 'Нотариус',           icon: '⚖️' },
    { keywords: ['общин','municipality','кмет','кмет'],                 label: 'Община',             icon: '🏛️' },
    { keywords: ['болниц','hospital','клиник','clinic','лекар'],        label: 'Болница / Клиника',  icon: '🏥' },
    { keywords: ['наем','rent','наемател','наемодател'],                label: 'Наем',               icon: '🏠' },
    { keywords: ['трудов','труд','работодател','salary','заплат'],      label: 'Работодател',        icon: '💼' },
    { keywords: ['съд','court','иск','дело'],                           label: 'Съд',                icon: '⚖️' },
    { keywords: ['мвр','mvr','паспорт','лична карта','документ за самоличност'], label: 'МВР', icon: '🪪' },
    { keywords: ['университет','univer','college','колеж','диплом'],    label: 'Университет',        icon: '🎓' },
  ],

  // Document type patterns
  docTypes: [
    { keywords: ['фактура','invoice','фак','faktura'],                  type: 'invoice',   label: 'Фактура'  },
    { keywords: ['договор','contract','sporazum','споразумен'],         type: 'contract',  label: 'Договор'  },
    { keywords: ['декларация','declaration'],                           type: 'tax',       label: 'Декларация' },
    { keywords: ['полица','police','застрахов','insurance'],            type: 'insurance', label: 'Застраховка' },
    { keywords: ['сметка','bill','квитанция','receipt'],                type: 'invoice',   label: 'Сметка'   },
    { keywords: ['удостоверение','certificate','certif'],               type: 'doc',       label: 'Удостоверение' },
    { keywords: ['решение','decision','наредба'],                       type: 'doc',       label: 'Решение'  },
    { keywords: ['паспорт','passport','лична карта','id card'],        type: 'id',        label: 'Лична карта / Паспорт' },
    { keywords: ['болничен','sick leave','medical','медицин'],          type: 'medical',   label: 'Медицински' },
    { keywords: ['ведомост','payslip','заплата','salary'],              type: 'bank',      label: 'Ведомост' },
  ],

  // Regex for dates
  dateRegexes: [
    /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/,
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /(20\d{2})/,
    /(\d{1,2})\s(?:януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s(20\d{2})/i,
  ],

  yearRegex: /(20[12]\d)/,
  timeRegex: /(\d{1,2}:\d{2}(?::\d{2})?)/,

  analyze(filename, fileType) {
    const lower = (filename || '').toLowerCase().replace(/[_\-]/g, ' ');
    const ext   = (filename || '').split('.').pop().toLowerCase();
    let score   = 0;
    let result  = {
      suggestedTitle:   filename || 'Нов документ',
      docType:          'other',
      docTypeLabel:     'Документ',
      institution:      '',
      institutionIcon:  '',
      detectedDate:     '',
      detectedYear:     '',
      detectedTime:     '',
      confidence:       0,
    };

    // File type bonus
    let previewType = 'other';
    if (['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext)) {
      previewType = 'image'; score += 5;
    } else if (['mp4','mov','avi','mkv','webm','m4v','3gp'].includes(ext)) {
      previewType = 'video'; score += 5;
    } else if (ext === 'pdf') {
      previewType = 'pdf'; score += 5;
    } else if (['doc','docx'].includes(ext)) {
      previewType = 'doc'; score += 3;
    } else if (['xls','xlsx','csv'].includes(ext)) {
      previewType = 'xls'; score += 3;
    }
    result.previewType = previewType;

    // Detect doc type
    for (const dt of this.docTypes) {
      if (dt.keywords.some(kw => lower.includes(kw))) {
        result.docType      = dt.type;
        result.docTypeLabel = dt.label;
        score += 20;
        break;
      }
    }

    // Detect institution
    for (const inst of this.institutions) {
      if (inst.keywords.some(kw => lower.includes(kw))) {
        result.institution     = inst.label;
        result.institutionIcon = inst.icon;
        score += 20;
        break;
      }
    }

    // Detect date
    for (const rx of this.dateRegexes) {
      const m = lower.match(rx);
      if (m) {
        result.detectedDate = m[0];
        score += 15;
        break;
      }
    }

    // Detect year
    const ym = lower.match(this.yearRegex);
    if (ym) { result.detectedYear = ym[1]; score += 10; }

    // Detect time
    const tm = lower.match(this.timeRegex);
    if (tm) { result.detectedTime = tm[1]; score += 5; }

    // Suggest title
    let titleParts = [];
    if (result.docTypeLabel && result.docTypeLabel !== 'Документ') titleParts.push(result.docTypeLabel);
    if (result.institution) titleParts.push(result.institution);
    if (result.detectedYear) titleParts.push(result.detectedYear);
    if (titleParts.length > 0) {
      result.suggestedTitle = titleParts.join(' — ');
      score += 5;
    }

    result.confidence = Math.min(score, 99);
    return result;
  },

  // Match existing folders — NO auto-creation, NO invention
  suggestFolder(analysis, folders) {
    if (!folders || folders.length === 0) return null;
    const lower = (analysis.institution + ' ' + analysis.docTypeLabel + ' ' + analysis.suggestedTitle).toLowerCase();
    let best = null, bestScore = 0;

    for (const f of folders) {
      const fname = (f.name || '').toLowerCase();
      let fs = 0;
      // Exact institution match in folder name
      if (analysis.institution && fname.includes(analysis.institution.toLowerCase())) fs += 40;
      // Keyword overlap
      const words = lower.split(/\s+/).filter(w => w.length > 2);
      for (const w of words) { if (fname.includes(w)) fs += 8; }
      // Check for generic review folder
      if (fname.includes('преглед') || fname.includes('входящ')) fs += 3;
      // Auto-match screenshots
      if (analysis._autoCategory === 'screenshot' && (fname.includes('скрийншот') || fname.includes('screenshot'))) fs += 50;
      // Auto-match photos/gallery
      if (analysis._autoCategory === 'photo' && (fname.includes('галерия') || fname.includes('снимки') || fname.includes('photo') || fname.includes('gallery'))) fs += 50;
      if (fs > bestScore) { bestScore = fs; best = f; }
    }

    // Require minimum confidence for suggestion
    if (bestScore < 8) {
      // Try to find a "За преглед" folder as fallback
      const review = folders.find(f => (f.name||'').toLowerCase().includes('преглед'));
      if (review) return { folder: review, isReview: true };
      return null;
    }
    return { folder: best, isReview: false };
  },

  // Auto-categorize: screenshot vs photo vs document
  autoCategory(filename, fileType) {
    const lower = (filename || '').toLowerCase();
    const isImage = (fileType || '').startsWith('image/');
    if (!isImage) return 'document';
    // Screenshot detection
    if (lower.includes('screenshot') || lower.includes('скрийншот') || lower.includes('bildschirmfoto') || lower.includes('captura')
      || lower.includes('screen shot') || /^img_\d{4}\.(png|jpg)$/i.test(lower)
      || /^simulator screen/i.test(lower) || lower.includes('снимка на екран')) {
      return 'screenshot';
    }
    // Photo detection (camera files)
    if (/^(img|photo|image|dsc|dcim|pic)[\s_\-]?\d/i.test(lower)
      || /\.(heic|heif)$/i.test(lower)
      || lower.startsWith('img_') || lower.startsWith('photo_')) {
      return 'photo';
    }
    return 'image';
  }
};

/* ═══════════════════════════════════════════════
   6. THEME ENGINE
═══════════════════════════════════════════════ */

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  state.theme = themeId;
  // Update active swatch
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === themeId);
  });
}

function renderThemeGrid() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  grid.innerHTML = THEMES.map(t => `
    <button class="theme-swatch ${state.theme === t.id ? 'active' : ''}" data-theme="${t.id}">
      <div class="theme-dot" style="background:${t.color}"></div>
      <span class="theme-swatch-label">${t.label}</span>
    </button>
  `).join('');
  grid.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      saveState();
    });
  });
}

/* ═══════════════════════════════════════════════
   7. CLOCK / CALENDAR
═══════════════════════════════════════════════ */

const DAYS_BG  = ['Неделя','Понеделник','Вторник','Сряда','Четвъртък','Петък','Събота'];
const MONTHS_BG = ['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
const DAYS_SHORT = ['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
const DEADLINE_COLORS = ['#3B82F6','#22C55E','#F97316','#A855F7','#EF4444','#EAB308'];

function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const timeEl = document.getElementById('clockTime');
  const dateEl = document.getElementById('clockDate');
  const wdEl   = document.getElementById('clockWeekday');
  if (timeEl) timeEl.textContent = `${hh}:${mm}`;
  if (dateEl) dateEl.textContent = `${now.getDate()} ${MONTHS_BG[now.getMonth()]} ${now.getFullYear()}`;
  if (wdEl)   wdEl.textContent   = DAYS_BG[now.getDay()];

  const greetEl = document.getElementById('dashGreeting');
  if (greetEl) {
    const h = now.getHours();
    greetEl.textContent = h < 6 ? 'Добра нощ' : h < 12 ? 'Добро утро' : h < 18 ? 'Добър ден' : 'Добър вечер';
  }
}

function renderCalendar() {
  const el = document.getElementById('calendarMini');
  if (!el) return;
  const now     = new Date();
  const year    = now.getFullYear();
  const month   = now.getMonth();
  const today   = now.getDate();
  const first   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const deadlineMap = getTodayDeadlineMap(year, month);

  let html = DAYS_SHORT.map(d => `<div class="cal-header-cell">${d}</div>`).join('');
  for (let i = 0; i < first; i++) html += '<div class="cal-day other-month"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items = deadlineMap.get(d) || [];
    const isToday = d === today;
    const selected = isCalendarDaySelected(dateStr);
    const dots = items.slice(0,3).map(item => `<i style="background:${escHtml(item.color || '#3B82F6')}"></i>`).join('');
    const extra = items.length > 3 ? `<b>+${items.length - 3}</b>` : '';
    const hasReminder = items.some(item => item.reminderEnabled);
    html += `<button type="button" class="cal-day ${isToday?'today':''} ${items.length?'has-deadline':''} ${selected?'selected':''}" data-cal-date="${dateStr}"><span class="cal-day-num">${d}</span>${hasReminder ? '<span class="cal-day-bell">🔔</span>' : ''}<span class="cal-day-dots">${dots}${extra}</span></button>`;
  }

  el.innerHTML = html;
  el.querySelectorAll('[data-cal-date]').forEach(btn => btn.addEventListener('click', () => openDeadlineFromDashboard(btn.dataset.calDate)));
}

function startClock() {
  updateClock();
  renderCalendar();
  processDueReminders();
  setInterval(updateClock, 1000);
  setInterval(() => {
    renderCalendar();
    processDueReminders();
  }, 30000);
}

/* ═══════════════════════════════════════════════
   8. NAVIGATION
═══════════════════════════════════════════════ */

function showTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));

  const screen = document.getElementById(`screen-${tab}`);
  if (screen) screen.classList.add('active');

  const btn = document.querySelector(`.dock-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  // Render tab content
  switch(tab) {
    case 'dashboard': renderDashboard(); break;
    case 'documents': renderDocuments(); break;
    case 'scan':      renderScanTab();   break;
    case 'agent':     renderAgentTab();  break;
    case 'cinema':    renderCinemaTab(); break;
    case 'more':      renderMoreTab();   break;
  }
}

function pulseDockButton(btn, opts = {}) {
  if (!btn) return;
  const shouldPlaySound = opts.sound !== false;
  const holdMs = Number.isFinite(opts.holdMs) ? opts.holdMs : 520;

  btn.classList.remove('dock-pressed', 'dock-hit');
  void btn.offsetWidth;
  btn.classList.add('dock-pressed', 'dock-hit');

  if (shouldPlaySound) {
    primeDockAudio();
    playDockPressFx(btn.dataset.fx || 'default');
  }

  clearTimeout(btn._dockPulseTimer);
  clearTimeout(btn._dockHitTimer);
  btn._dockPulseTimer = setTimeout(() => btn.classList.remove('dock-pressed'), holdMs);
  btn._dockHitTimer = setTimeout(() => btn.classList.remove('dock-hit'), holdMs + 140);
}


function showFolderDetail(folderId) {
  state.currentFolderId = folderId;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-folder-detail').classList.add('active');
  renderFolderDetail();
}

/* ═══════════════════════════════════════════════
   9. DASHBOARD
═══════════════════════════════════════════════ */

function renderDashboard() {
  const metrics = getStorageMetrics();

  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

  setText('statDocs', metrics.docsCount);
  setText('statFolders', metrics.foldersCount);
  setText('statPending', metrics.pendingCount);

  // Dashboard mini storage
  setText('dashStoragePct', `${metrics.localPct.toFixed(0)}%`);
  const microFill = document.getElementById('dashStorageMicroFill');
  if (microFill) microFill.style.width = `${Math.max(metrics.localPct, metrics.usedBytes ? 2 : 0)}%`;

  // Hero storage pill
  const heroStorageText = document.getElementById('dashHeroStorageText');
  if (heroStorageText) {
    heroStorageText.textContent = `${formatBytes(metrics.usedBytes)} / ${formatBytes(metrics.localBudgetBytes)}`;
  }
  const heroStorageDot = document.querySelector('.dash-hero-storage-dot');
  if (heroStorageDot) {
    if (metrics.localPct > 85) {
      heroStorageDot.style.background = 'var(--danger)';
      heroStorageDot.style.boxShadow = '0 0 8px rgba(239,68,68,0.5)';
    } else if (metrics.localPct > 60) {
      heroStorageDot.style.background = 'var(--warning)';
      heroStorageDot.style.boxShadow = '0 0 8px rgba(245,158,11,0.5)';
    }
  }

  // Dashboard storage widget
  const dashBarFill = document.getElementById('dashStorageBarFill');
  if (dashBarFill) dashBarFill.style.width = `${Math.max(metrics.localPct, metrics.usedBytes ? 1 : 0)}%`;
  setText('dashStorageUsed', `Заето: ${formatBytes(metrics.usedBytes)}`);
  setText('dashStorageFree', `Свободно: ${formatBytes(metrics.freeBytes)}`);
  const dashHealth = document.getElementById('dashStorageHealth');
  if (dashHealth) {
    dashHealth.textContent = metrics.health;
    dashHealth.className = `dash-storage-health ${metrics.healthClass}`.trim();
  }
  // Show persist row if not persisted
  const persistRow = document.getElementById('dashPersistRow');
  if (persistRow) {
    persistRow.style.display = metrics.persistedLabel === 'Не' ? 'flex' : 'none';
  }

  // Settings storage (moved from old dashboard)
  setText('storageRealUsedDash', formatBytes(metrics.usedBytes));
  setText('storageRealLimitDash', formatBytes(metrics.localBudgetBytes));
  setText('storageHealthPill', metrics.health);
  setText('storagePersistTruth', metrics.persistedLabel);

  // Legacy compat — these elements may or may not exist
  setText('storageRingValue', `${metrics.localPct.toFixed(1)}%`);
  setText('storagePlanUsedDash', formatBytes(metrics.usedBytes));
  setText('storagePlanRemainDash', formatBytes(metrics.freeBytes));
  setText('storagePlanNote', metrics.noteLabel);
  setText('storageQuotaTruth', formatBytes(metrics.localBudgetBytes));
  setText('storageSourceTruth', metrics.sourceLabel);
  setText('storageLastSyncTruth', metrics.lastSyncLabel);
  setText('storageTruthFoot', metrics.truthFoot);
  setText('kpiQueueCount', metrics.queueCount);
  setText('kpiImageCount', metrics.imageCount);
  setText('kpiQuickLinks', metrics.quickLinksCount);
  setText('kpiPreviewBytes', formatBytes(metrics.previewBytes));
  setText('breakMetaBytes', formatBytes(metrics.docsMetaBytes));
  setText('breakPreviewBytes', formatBytes(metrics.previewBytes));
  setText('breakQueueBytes', formatBytes(metrics.queueBytes));
  setText('breakMiscBytes', formatBytes(metrics.miscBytes));
  setText('breakMetaPct', `${percentOf(metrics.docsMetaBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);
  setText('breakPreviewPct', `${percentOf(metrics.previewBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);
  setText('breakQueuePct', `${percentOf(metrics.queueBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);
  setText('breakMiscPct', `${percentOf(metrics.miscBytes, metrics.breakdownTotalBytes).toFixed(1)}%`);

  const ring = document.getElementById('storageRing');
  if (ring) {
    const visibleDeg = Math.max(8, metrics.localPct * 3.6);
    ring.style.setProperty('--ring-pct', `${visibleDeg}deg`);
    ring.style.setProperty('--ring-rot', `${visibleDeg - 90}deg`);
  }
  setText('storageRingUsed', formatBytes(metrics.usedBytes));
  setText('storageRingQuota', formatBytes(metrics.quotaBytes));
  const healthPill = document.getElementById('storageHealthPill');
  if (healthPill) healthPill.className = `storage-health-pill ${metrics.healthClass}`.trim();
  const planFill = document.getElementById('storagePlanFill');
  if (planFill) planFill.style.width = `${Math.max(metrics.localPct, metrics.usedBytes ? 2 : 0)}%`;

  buildStorageTruthChart(metrics);
  refreshDashboardTruth();

  renderDashboardFolderRail();
  renderDashboardQueueSnapshot();
  renderDeadlines();
  renderRecentDocs();
  renderCalendar();
}

function renderDashboardFolderRail() {
  const el = document.getElementById('dashFolderRail');
  if (!el) return;
  const folders = [...(state.folders || [])].map(f => ({
    ...f,
    count: state.documents.filter(d => d.folderId === f.id).length,
    pending: state.documents.filter(d => d.folderId === f.id && d.status === 'pending').length
  })).sort((a, b) => (b.count + b.pending) - (a.count + a.pending)).slice(0, 6);

  if (!folders.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:.25rem 0">Няма папки — създай първата.</div>';
    return;
  }

  el.innerHTML = folders.map(f => `
    <button class="dash-folder-card" data-folderid="${f.id}">
      <span class="dash-folder-icon">${f.icon || '📁'}</span>
      <span class="dash-folder-name">${escHtml(f.name)}</span>
      <span class="dash-folder-meta">${f.count} документа${f.pending ? ` · ${f.pending} за преглед` : ''}</span>
    </button>
  `).join('');

  el.querySelectorAll('.dash-folder-card').forEach(card => {
    card.addEventListener('click', () => showFolderDetail(card.dataset.folderid));
  });
}

function hasThumbPreview(record) {
  return !!(record && record.previewDataUrl);
}

function renderThumbBox(record, className, fallbackIcon) {
  const isVideo = record && (record.previewType === 'video' || (record.fileMime && record.fileMime.startsWith('video/')));
  if (hasThumbPreview(record)) {
    const playOverlay = isVideo ? '<span class="thumb-play-icon">▶</span>' : '';
    return `<div class="${className} is-preview">${playOverlay}<img src="${record.previewDataUrl}" alt="preview"/></div>`;
  }
  return `<div class="${className}">${fallbackIcon}</div>`;
}

function renderDashboardQueueSnapshot() {
  const el = document.getElementById('dashQueueSnapshot');
  if (!el) return;
  const queue = [...(state.intakeQueue || [])].filter(item => !item.contextFolderId && !item.homeHidden).slice(-3).reverse();
  if (!queue.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:.25rem 0">Опашката е празна.</div>';
    return;
  }

  el.innerHTML = queue.map(item => {
    const folder = item.suggestedFolderId ? state.folders.find(f => f.id === item.suggestedFolderId) : null;
    const thumb = hasThumbPreview(item) ? `<img src="${item.previewDataUrl}" alt="prev"/>` : `${DOC_TYPE_ICONS[item.previewType] || '📄'}`;
    return `
      <div class="queue-snapshot-card">
        <div class="queue-snapshot-thumb">${thumb}</div>
        <div class="queue-snapshot-copy">
          <strong>${escHtml(item.suggestedTitle || item.originalFileName || 'Документ')}</strong>
          <small>${escHtml(item.docTypeLabel || 'Документ')} · ${folder ? escHtml(folder.name) : 'Без папка'}</small>
        </div>
        <div class="queue-snapshot-side">
          <span class="confidence-badge ${confidenceLevel(item.confidence || 0)}">${confidenceLabel(item.confidence || 0)}</span>
          <button class="link-btn" data-queue-open="${item.id}">Преглед</button>
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('[data-queue-open]').forEach(btn => {
    btn.addEventListener('click', () => openIntakeSheet(btn.dataset.queueOpen));
  });
}

function renderDeadlines() {
  const el = document.getElementById('deadlinesList');
  if (!el) return;
  if (!state.deadlines.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:.5rem 0;text-align:center">Няма добавени термини</div>';
    return;
  }
  const sorted = [...state.deadlines].sort((a,b) => (combineLocalDateTime(a.date, a.time || '09:00') || new Date(a.date)) - (combineLocalDateTime(b.date, b.time || '09:00') || new Date(b.date)));
  el.innerHTML = sorted.map(dl => {
    const days = daysUntil(dl.date);
    const label = days === null ? '' : days < 0 ? `${Math.abs(days)} дни назад` : days === 0 ? 'Днес' : `${days} дни`;
    return `
      <button type="button" class="deadline-item" data-deadline-card="${dl.id}">
        <div class="deadline-dot" style="background:${escHtml(dl.color || '#3B82F6')}"></div>
        <div class="deadline-main">
          <div class="deadline-text-row"><span class="deadline-text">${escHtml(dl.title)}</span>${dl.reminderEnabled ? '<span class="deadline-bell">🔔</span>' : ''}</div>
          ${dl.note ? `<div class="deadline-note">${escHtml(dl.note)}</div>` : ''}
        </div>
        <div class="deadline-side">
          <div class="deadline-date">${escHtml(formatDateTime(dl))}</div>
          <div class="deadline-label">${label}</div>
        </div>
      </button>
    `;
  }).join('');
  el.querySelectorAll('[data-deadline-card]').forEach(btn => btn.addEventListener('click', () => {
    const dl = (state.deadlines || []).find(x => x.id === btn.dataset.deadlineCard);
    if (dl) openDeadlineSheet(dl.date, dl.id);
  }));
}

function renderRecentDocs() {
  const el = document.getElementById('recentDocsList');
  if (!el) return;
  const recent = [...state.documents]
    .filter(d => !d.folderId && !d.homeHidden)
    .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))
    .slice(0,5);

  // Show simple message if no documents
  if (!state.documents.length && !state.folders.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:1rem 0;text-align:center">Качи снимки, видео или документи от бутоните горе.</div>';
    return;
  }

  if (!recent.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:.5rem 0;text-align:center">Няма последни документи извън папки</div>';
    return;
  }
  el.innerHTML = recent.map(d => docItemHTML(d)).join('');
  el.querySelectorAll('.doc-item').forEach(item => {
    item.addEventListener('click', () => openDocPreview(item.dataset.docid));
  });
}

/* ═══════════════════════════════════════════════
   10. DOCUMENTS TAB
═══════════════════════════════════════════════ */

let docFilter = 'all';
let docSort   = 'newest';
let docSearch = '';
let docTypeFilter = 'all';
let docFolderFilter = 'all';
let docTagFilters = [];
let docDuplicatesOnly = false;
let docViewMode = 'list';
let duplicateDocIndex = { byDocId: new Map(), groups: [] };
let docFuse = null;
let docChoices = { type: null, folder: null, tags: null };
let folderSortable = null;

function getDocParsed(d) {
  return normalizeParsedData(d.parsedData || null);
}

function getDocKeywords(d) {
  const parsed = getDocParsed(d);
  return dedupeStrings([
    ...(parsed?.keywords || []),
    parsed?.language || '',
    parsed?.typeLabel || '',
    d.docType || '',
    d.status === 'pending' ? 'за преглед' : 'запазен'
  ].filter(Boolean));
}

function getDocSearchRecord(d) {
  const parsed = getDocParsed(d);
  return {
    id: d.id,
    title: d.title || '',
    institution: d.institution || parsed?.organization || '',
    fileName: d.originalFileName || d.cleanFileName || '',
    personName: parsed?.personName || '',
    email: parsed?.email || '',
    phone: parsed?.phone || '',
    address: parsed?.address || '',
    typeLabel: parsed?.typeLabel || DOC_TYPE_LABELS[d.docType] || d.docType || '',
    tags: getDocKeywords(d).join(' '),
    extractedText: (d.extractedText || '').slice(0, 6000)
  };
}

function rebuildDocFuseIndex() {
  const FuseRuntime = window.Fuse;
  if (typeof FuseRuntime !== 'function') {
    docFuse = null;
    return;
  }
  const records = state.documents.map(getDocSearchRecord);
  docFuse = new FuseRuntime(records, {
    includeScore: true,
    threshold: PASS6_FUSE_THRESHOLD,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: 'title', weight: 0.34 },
      { name: 'personName', weight: 0.18 },
      { name: 'email', weight: 0.16 },
      { name: 'phone', weight: 0.12 },
      { name: 'address', weight: 0.11 },
      { name: 'institution', weight: 0.10 },
      { name: 'fileName', weight: 0.09 },
      { name: 'tags', weight: 0.08 },
      { name: 'typeLabel', weight: 0.07 },
      { name: 'extractedText', weight: 0.04 }
    ]
  });
}

function docTextFingerprint(text) {
  const clean = normalizeExtractedText(text).replace(/\s+/g, ' ').slice(0, 1500);
  if (clean.length < 80) return '';
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0;
  return `txt:${Math.abs(hash)}:${clean.length}`;
}

function buildDuplicateIndex() {
  const groups = new Map();
  const push = (key, reason, doc) => {
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key, reason, docs: [] });
    groups.get(key).docs.push(doc);
  };
  state.documents.forEach(doc => {
    const cleanName = cleanupImportedFileName(doc.originalFileName || doc.cleanFileName || doc.title || '').toLowerCase();
    const parsed = getDocParsed(doc);
    push(cleanName && doc.fileSize ? `file:${cleanName}|${doc.fileSize}` : '', 'Същото име и размер', doc);
    push(docTextFingerprint(doc.extractedText || parsed?.summary || ''), 'Почти еднакъв текст', doc);
    const person = (parsed?.personName || '').toLowerCase();
    const type = (parsed?.typeKey || doc.docType || '').toLowerCase();
    if (person && type && parsed?.detectedYear) push(`meta:${person}|${type}|${parsed.detectedYear}`, 'Същият човек / тип / година', doc);
  });
  const byDocId = new Map();
  const finalGroups = [...groups.values()].filter(group => group.docs.length > 1).map((group, idx) => ({
    id: `dup-${idx + 1}`,
    reason: group.reason,
    docs: group.docs.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))
  }));
  finalGroups.forEach(group => group.docs.forEach(doc => byDocId.set(doc.id, group)));
  duplicateDocIndex = { byDocId, groups: finalGroups };
}

function getDuplicateGroupForDoc(docId) {
  return duplicateDocIndex.byDocId.get(docId) || null;
}

function destroyChoiceInstance(key) {
  if (docChoices[key]) {
    try { docChoices[key].destroy(); } catch (_) {}
    docChoices[key] = null;
  }
}

function setupAdvancedFilterEnhancers() {
  const ChoicesRuntime = window.Choices;
  if (typeof ChoicesRuntime !== 'function') return;
  destroyChoiceInstance('type');
  destroyChoiceInstance('folder');
  destroyChoiceInstance('tags');
  const typeEl = document.getElementById('docTypeFilter');
  const folderEl = document.getElementById('docFolderFilter');
  const tagEl = document.getElementById('docTagFilter');
  if (typeEl) docChoices.type = new ChoicesRuntime(typeEl, { searchEnabled: false, itemSelectText: '', shouldSort: false, classNames: { containerOuter: 'choices docos-choices' } });
  if (folderEl) docChoices.folder = new ChoicesRuntime(folderEl, { searchEnabled: false, itemSelectText: '', shouldSort: false, classNames: { containerOuter: 'choices docos-choices' } });
  if (tagEl) docChoices.tags = new ChoicesRuntime(tagEl, { removeItemButton: true, itemSelectText: '', shouldSort: false, classNames: { containerOuter: 'choices docos-choices docos-choices-multi' } });
}

function populateAdvancedFilterOptions() {
  const typeEl = document.getElementById('docTypeFilter');
  const folderEl = document.getElementById('docFolderFilter');
  const tagEl = document.getElementById('docTagFilter');
  if (typeEl) {
    const types = dedupeStrings(state.documents.map(d => getDocParsed(d)?.typeLabel || DOC_TYPE_LABELS[d.docType] || d.docType || '').filter(Boolean));
    typeEl.innerHTML = '<option value="all">Всички типове</option>' + types.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('');
    typeEl.value = types.includes(docTypeFilter) ? docTypeFilter : 'all';
  }
  if (folderEl) {
    folderEl.innerHTML = '<option value="all">Всички папки</option>' + state.folders.map(f => `<option value="${escHtml(f.id)}">${escHtml((f.icon||'📁') + ' ' + f.name)}</option>`).join('');
    folderEl.value = state.folders.some(f => f.id === docFolderFilter) ? docFolderFilter : 'all';
  }
  if (tagEl) {
    const tags = dedupeStrings(state.documents.flatMap(getDocKeywords)).slice(0, 60);
    tagEl.innerHTML = tags.map(tag => `<option value="${escHtml(tag)}" ${docTagFilters.includes(tag) ? 'selected' : ''}>${escHtml(tag)}</option>`).join('');
  }
  setupAdvancedFilterEnhancers();
}

function updateDocFilterSummary(count) {
  const el = document.getElementById('docFilterSummary');
  if (!el) return;
  const parts = [];
  if (docFilter !== 'all') parts.push(docFilter === 'duplicates' ? 'дубликати' : docFilter);
  if (docTypeFilter !== 'all') parts.push(docTypeFilter);
  if (docFolderFilter !== 'all') {
    const folder = state.folders.find(f => f.id === docFolderFilter);
    if (folder) parts.push(folder.name);
  }
  if (docTagFilters.length) parts.push(`тагове: ${docTagFilters.join(', ')}`);
  el.textContent = parts.length ? `${count} резултата • ${parts.join(' • ')}` : `${count} документа`;
}

function renderDuplicatePanel() {
  const el = document.getElementById('duplicatePanel');
  if (!el) return;
  const groups = duplicateDocIndex.groups || [];
  if (!groups.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'grid';
  el.innerHTML = groups.slice(0, 4).map(group => {
    const lead = group.docs[0];
    return `<button class="duplicate-card" data-docid="${lead.id}" type="button"><strong>${group.docs.length}× вероятен дубликат</strong><small>${escHtml(group.reason)}</small><span>${escHtml(lead.title || lead.originalFileName || 'Документ')}</span></button>`;
  }).join('');
  el.querySelectorAll('.duplicate-card').forEach(btn => btn.addEventListener('click', () => openDocPreview(btn.dataset.docid)));
}

function ensureFolderSortable() {
  const grid = document.getElementById('folderGrid');
  if (!grid || typeof window.Sortable !== 'function') return;
  if (folderSortable) { try { folderSortable.destroy(); } catch (_) {} folderSortable = null; }
  folderSortable = new window.Sortable(grid, {
    animation: 150,
    draggable: '.folder-card',
    ghostClass: 'folder-card-ghost',
    onEnd: evt => {
      if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
      const next = [...state.folders];
      const [moved] = next.splice(evt.oldIndex, 1);
      if (!moved) return;
      next.splice(evt.newIndex, 0, moved);
      state.folders = next;
      saveState();
      renderDocuments();
      renderDashboard();
      showToast('↕️ Папките са пренаредени');
    }
  });
}

function renderDocuments() {
  rebuildDocFuseIndex();
  buildDuplicateIndex();
  populateAdvancedFilterOptions();
  renderDuplicatePanel();
  renderFolderGrid();
  renderDocList();
}


function renderFolderGrid() {
  const el = document.getElementById('folderGrid');
  if (!el) return;
  if (!state.folders.length) {
    el.innerHTML = '<div class="empty-sub" style="grid-column:1/-1;padding:.5rem 0;text-align:center">Няма папки. Добави с бутона горе.</div>';
    if (folderSortable) { try { folderSortable.destroy(); } catch (_) {} folderSortable = null; }
    return;
  }
  el.innerHTML = state.folders.map(f => {
    const docs    = state.documents.filter(d => d.folderId === f.id);
    const count   = docs.length;
    const pending = docs.filter(d => d.status === 'pending').length;
    const images  = docs.filter(d => d.previewType === 'image').length;
    const pdfs    = docs.filter(d => d.previewType === 'pdf').length;
    return `
      <div class="folder-card" data-folderid="${f.id}">
        <div class="folder-card-icon">${f.icon || '📁'}</div>
        <div class="folder-card-name">${escHtml(f.name)}</div>
        <div class="folder-card-count">${count} документа</div>
        <div class="folder-card-stats">
          ${images ? `<span class="folder-card-stat">📷 ${images}</span>` : ''}
          ${pdfs ? `<span class="folder-card-stat">📑 ${pdfs}</span>` : ''}
          ${pending ? `<span class="folder-card-stat">⏳ ${pending}</span>` : ''}
        </div>
        ${pending ? `<div class="folder-card-badge">${pending}</div>` : ''}
      </div>
    `;
  }).join('');
  el.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => showFolderDetail(card.dataset.folderid));
  });
  ensureFolderSortable();
}

function filteredDocs() {
  let docs = [...state.documents];
  if (docFilter === 'pending') docs = docs.filter(d => d.status === 'pending');
  else if (docFilter === 'saved') docs = docs.filter(d => d.status === 'saved');
  else if (docFilter === 'image') docs = docs.filter(d => d.previewType === 'image');
  else if (docFilter === 'video') docs = docs.filter(d => d.previewType === 'video' || (d.fileMime && d.fileMime.startsWith('video/')));
  else if (docFilter === 'pdf') docs = docs.filter(d => d.previewType === 'pdf');
  if (docFilter === 'duplicates' || docDuplicatesOnly) docs = docs.filter(d => !!getDuplicateGroupForDoc(d.id));
  if (docTypeFilter !== 'all') docs = docs.filter(d => (getDocParsed(d)?.typeLabel || DOC_TYPE_LABELS[d.docType] || d.docType || '') === docTypeFilter);
  if (docFolderFilter !== 'all') docs = docs.filter(d => d.folderId === docFolderFilter);
  if (docTagFilters.length) {
    docs = docs.filter(d => {
      const tags = getDocKeywords(d).map(v => v.toLowerCase());
      return docTagFilters.every(tag => tags.includes(String(tag).toLowerCase()));
    });
  }
  if (docSearch.trim()) {
    const q = docSearch.trim();
    if (docFuse) {
      const matchOrder = new Map();
      docFuse.search(q).forEach((result, index) => matchOrder.set(result.item.id, index));
      docs = docs.filter(d => matchOrder.has(d.id)).sort((a,b) => (matchOrder.get(a.id) ?? 9999) - (matchOrder.get(b.id) ?? 9999));
    } else {
      const lower = q.toLowerCase();
      docs = docs.filter(d => {
        const parsed = getDocParsed(d);
        return [d.title, d.institution, d.originalFileName, parsed?.personName, parsed?.email, parsed?.phone, parsed?.address, d.extractedText].filter(Boolean).some(v => String(v).toLowerCase().includes(lower));
      });
    }
  }
  if (docSort === 'newest') docs.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  else if (docSort === 'oldest') docs.sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt));
  else if (docSort === 'name') docs.sort((a,b) => (a.title||'').localeCompare(b.title||''));
  else if (docSort === 'confidence') docs.sort((a,b) => (b.confidence||0)-(a.confidence||0));
  return docs;
}

function renderDocList() {
  const el = document.getElementById('docList');
  if (!el) return;
  const docs = filteredDocs();
  updateDocFilterSummary(docs.length);
  if (!docs.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-text">Няма документи</div><div class="empty-sub">Качи файл или снимай документ от бутона ＋</div></div>';
    return;
  }
  if (docViewMode === 'gallery') {
    el.className = 'doc-gallery';
    el.innerHTML = docs.map(d => galleryItemHTML(d)).join('');
  } else {
    el.className = 'doc-list';
    el.innerHTML = docs.map(d => docItemHTML(d)).join('');
  }
  el.querySelectorAll('.doc-item, .gallery-item').forEach(item => {
    item.addEventListener('click', () => openDocPreview(item.dataset.docid));
  });
}

function galleryItemHTML(d) {
  const confLevel = confidenceLevel(d.confidence || 0);
  const parsed = getDocParsed(d);
  const hasPreview = !!(d.previewDataUrl);
  return `
    <div class="gallery-item" data-docid="${d.id}">
      ${hasPreview
        ? `<img src="${d.previewDataUrl}" alt="${escHtml(d.title)}" loading="lazy"/>`
        : `<div class="gallery-item-fallback">${DOC_TYPE_ICONS[d.previewType] || DOC_TYPE_ICONS[d.docType] || '📄'}</div>`}
      <span class="confidence-badge ${confLevel}" style="font-size:.5rem">${confidenceLabel(d.confidence||0)}</span>
      ${d.status === 'pending' ? '<span class="gallery-item-status">⏳</span>' : ''}
      <div class="gallery-item-overlay">
        <div class="gallery-item-title">${escHtml(d.title)}</div>
        <div class="gallery-item-meta">${escHtml(parsed?.typeLabel || d.docType || '')}${d.institution ? ' · ' + escHtml(d.institution) : ''}</div>
      </div>
    </div>
  `;
}

function docItemHTML(d) {
  const folder = state.folders.find(f => f.id === d.folderId);
  const confLevel = confidenceLevel(d.confidence || 0);
  const thumbHtml = renderThumbBox(d, 'doc-thumb', DOC_TYPE_ICONS[d.previewType] || DOC_TYPE_ICONS[d.docType] || '📄');
  const parsed = getDocParsed(d);
  const tagBadges = (parsed?.keywords || []).slice(0, 3).map(tag => `<span class="doc-type-badge">${escHtml(tag)}</span>`).join('');
  const dup = getDuplicateGroupForDoc(d.id);
  return `
    <div class="doc-item ${dup ? 'is-duplicate' : ''}" data-docid="${d.id}">
      ${thumbHtml}
      <div class="doc-info">
        <div class="doc-title">${escHtml(d.title)} ${dup ? `<span class="duplicate-badge">${dup.docs.length}×</span>` : ''}</div>
        <div class="doc-meta-row">
          ${d.institution ? `<span class="doc-institution">${escHtml(d.institution)}</span>` : ''}
          ${d.detectedYear ? `<span class="doc-date">${d.detectedYear}</span>` : d.detectedDate ? `<span class="doc-date">${escHtml(d.detectedDate)}</span>` : ''}
          <span class="confidence-badge ${confLevel}">${confidenceLabel(d.confidence || 0)}</span>
          <span class="doc-status ${d.status}">${d.status === 'pending' ? '⏳ За преглед' : '✓'}</span>
        </div>
        <div class="doc-meta-row" style="margin-top:.2rem;flex-wrap:wrap">
          ${parsed?.typeLabel ? `<span class="doc-type-badge">${escHtml(parsed.typeLabel)}</span>` : d.docType ? `<span class="doc-type-badge">${escHtml(d.docType)}</span>` : ''}
          ${folder ? `<span class="doc-type-badge" style="color:var(--accent)">${escHtml(folder.icon||'📁')} ${escHtml(folder.name)}</span>` : ''}
          ${tagBadges}
        </div>
        ${dup ? `<div class="duplicate-inline">Дубликат • ${escHtml(dup.reason)}</div>` : ''}
      </div>
    </div>
  `;
}

/* ═════════

/* ═══════════════════════════════════════════════
   11. FOLDER DETAIL
═══════════════════════════════════════════════ */

function getFolderLocalQueue(folderId) {
  return [...(state.intakeQueue || [])]
    .filter(item => item.contextFolderId === folderId)
    .sort((a, b) => {
      const priority = { 'грешка': 0, 'готово': 1, 'записва': 2, 'чака': 3 };
      return (priority[item.uploadState] ?? 9) - (priority[b.uploadState] ?? 9);
    });
}

function renderFolderLocalQueue(folder, queueItems) {
  const summaryEl = document.getElementById('folderLocalSummary');
  const queueEl = document.getElementById('folderLocalQueue');
  if (!summaryEl || !queueEl) return;

  const docsInFolder = state.documents.filter(d => d.folderId === folder.id);
  const duplicateGroups = (duplicateDocIndex.groups || []).filter(group => group.docs.some(doc => doc.folderId === folder.id));
  const failedCount = queueItems.filter(item => item.uploadState === 'грешка').length;
  const pendingCount = queueItems.length;

  if (!pendingCount && !duplicateGroups.length) {
    summaryEl.style.display = 'none';
    summaryEl.innerHTML = '';
    queueEl.style.display = 'none';
    queueEl.innerHTML = '';
    return;
  }

  const parts = [];
  if (docsInFolder.length) parts.push(`${docsInFolder.length} файла`);
  if (duplicateGroups.length) parts.push(`${duplicateGroups.length} дубликата`);
  if (failedCount) parts.push(`${failedCount} грешка`);
  else if (pendingCount) parts.push(`${pendingCount} в опашка`);

  summaryEl.style.display = 'flex';
  summaryEl.innerHTML = `
    <div class="folder-local-summary-copy">
      <strong>Папка: ${escHtml(folder.name)}</strong>
      <small>${parts.join(' • ') || 'Всичко е подредено в папката.'}</small>
    </div>
    ${failedCount ? `<button class="folder-local-action" type="button" id="folderRetryFailedBtn">↻ Повтори ${failedCount}</button>` : ''}
  `;

  if (!queueItems.length) {
    queueEl.style.display = 'none';
    queueEl.innerHTML = '';
  } else {
    queueEl.style.display = 'grid';
    queueEl.innerHTML = queueItems.map(item => {
      const thumb = hasThumbPreview(item) ? `<img src="${item.previewDataUrl}" alt="preview"/>` : `${DOC_TYPE_ICONS[item.previewType] || '📄'}`;
      const stateLabel = item.uploadState === 'грешка'
        ? 'Грешка'
        : item.uploadState === 'анализ'
          ? 'Анализира се'
          : item.uploadState === 'готово'
            ? 'Чака потвърждение'
            : item.uploadState || 'Чака';
      return `
        <div class="folder-local-item ${item.uploadState === 'грешка' ? 'has-error' : ''}">
          <button class="folder-local-thumb" type="button" data-folder-queue-open="${item.id}">${thumb}</button>
          <div class="folder-local-copy">
            <strong>${escHtml(item.suggestedTitle || item.originalFileName || 'Документ')}</strong>
            <small>${escHtml(stateLabel)}${item.uploadError ? ` • ${escHtml(item.uploadError)}` : ''}</small>
          </div>
          <div class="folder-local-actions">
            <button class="batch-mini-btn" type="button" data-folder-queue-open="${item.id}">Преглед</button>
            ${item.uploadState === 'грешка'
              ? `<button class="batch-mini-btn primary" type="button" data-folder-queue-retry="${item.id}">Повтори</button>`
              : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('folderRetryFailedBtn')?.addEventListener('click', async () => {
    const failed = getFolderLocalQueue(folder.id).filter(item => item.uploadState === 'грешка');
    for (const item of failed) await retryFailedIntakeItem(item.id);
    renderFolderDetail();
  });
  queueEl.querySelectorAll('[data-folder-queue-open]').forEach(btn => {
    btn.addEventListener('click', () => openIntakeSheet(btn.dataset.folderQueueOpen));
  });
  queueEl.querySelectorAll('[data-folder-queue-retry]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await retryFailedIntakeItem(btn.dataset.folderQueueRetry);
      renderFolderDetail();
    });
  });
}

function renderFolderDetail() {
  const folder = state.folders.find(f => f.id === state.currentFolderId);
  if (!folder) { showTab('documents'); return; }

  document.getElementById('folderDetailIcon').textContent = folder.icon || '📁';
  document.getElementById('folderDetailName').textContent = folder.name;

  const docs = state.documents.filter(d => d.folderId === folder.id);
  const folderQueue = getFolderLocalQueue(folder.id);
  const listEl  = document.getElementById('folderDocList');
  const emptyEl = document.getElementById('folderEmptyState');

  renderFolderLocalQueue(folder, folderQueue);

  if (!docs.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = folderQueue.length ? 'none' : 'flex';
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = docs
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))
      .map(d => docItemHTML(d)).join('');
    listEl.querySelectorAll('.doc-item').forEach(item => {
      item.addEventListener('click', () => openDocPreview(item.dataset.docid));
    });
  }
}

/* ═══════════════════════════════════════════════
   12. SCAN / INTAKE TAB
═══════════════════════════════════════════════ */

function renderScanTab() {
  const queue = state.intakeQueue || [];
  document.getElementById('queueCount').textContent = queue.length;
  const el    = document.getElementById('intakeQueue');
  const empty = document.getElementById('scanEmptyState');

  const failedCount = queue.filter(item => item.uploadState === 'грешка').length;
  const bannerHtml = runtimeBatchSummary
    ? `<div class="batch-summary ${runtimeBatchSummary.failed ? 'has-failed' : 'is-ok'}">
        <div class="batch-summary-copy">
          <strong>Групово качване</strong>
          <small>${runtimeBatchSummary.total||0} файла · ${runtimeBatchSummary.saved||0} записани · ${runtimeBatchSummary.queued||0} в опашка · ${runtimeBatchSummary.duplicates||0} дубликата · ${runtimeBatchSummary.failed||0} грешка</small>
        </div>
        <div class="batch-summary-actions">
          ${runtimeBatchBusy ? `<button class="batch-mini-btn" type="button" disabled>Записва…</button>` : ''}
          ${failedCount ? `<button class="batch-mini-btn primary" data-batch-action="retry-failed">Повтори ${failedCount}</button>` : ''}
          <button class="batch-mini-btn" data-batch-action="close-summary">Скрий</button>
        </div>
      </div>`
    : '';

  if (!queue.length) {
    el.innerHTML = bannerHtml;
    empty.style.display = 'flex';
    bindScanBatchActions();
    return;
  }
  empty.style.display = 'none';

  el.innerHTML = bannerHtml + queue.map(item => {
    const folderSugg = item.suggestedFolderId
      ? state.folders.find(f => f.id === item.suggestedFolderId)
      : null;
    const confLevel  = confidenceLevel(item.confidence || 0);
    const thumbHtml  = renderThumbBox(item, 'intake-thumb', DOC_TYPE_ICONS[item.previewType] || '📄');
    const stateBadge = item.uploadState === 'грешка'
      ? `<span class="intake-chip error">⚠ ${escHtml(item.uploadError || 'Грешка')}</span>`
      : item.uploadState === 'чака'
        ? `<span class="intake-chip wait">⏳ Чака</span>`
        : '';

    return `
      <div class="intake-item ${item.uploadState === 'грешка' ? 'is-error' : ''}" data-iid="${item.id}">
        <div class="intake-item-header">
          ${thumbHtml}
          <div class="intake-info">
            <div class="intake-filename">${escHtml(item.originalFileName)}</div>
            <div class="intake-suggested-title">${escHtml(item.suggestedTitle)}</div>
            <div class="intake-meta-chips">
              <span class="intake-chip type">${escHtml(item.docTypeLabel||'Документ')}</span>
              ${item.institution ? `<span class="intake-chip institution">${escHtml(item.institution)}</span>` : ''}
              ${item.detectedYear || item.detectedDate ? `<span class="intake-chip date">${item.detectedYear||item.detectedDate}</span>` : ''}
              <span class="confidence-badge ${confLevel}" style="font-size:.62rem">${confidenceLabel(item.confidence||0)}</span>
              ${folderSugg
                ? `<span class="intake-chip folder">📁 ${escHtml(folderSugg.name)}</span>`
                : item.isReview
                  ? `<span class="intake-chip folder">👁 За преглед</span>`
                  : `<span class="intake-chip nofoldr">Без папка</span>`}
              ${stateBadge}
            </div>
          </div>
        </div>
        <div class="intake-item-actions">
          ${item.uploadState === 'грешка'
            ? `<button class="intake-item-btn primary" data-action="retry" data-iid="${item.id}">↻ Повтори</button>`
               + `<button class="intake-item-btn danger" data-action="discard" data-iid="${item.id}">✕</button>`
            : `<button class="intake-item-btn primary" data-action="save" data-iid="${item.id}">💾 Запази</button>`
               + `<button class="intake-item-btn" data-action="edit" data-iid="${item.id}">✏️ Редактирай</button>`
               + `<button class="intake-item-btn danger" data-action="discard" data-iid="${item.id}">✕</button>`}
        </div>
      </div>
    `;
  }).join('');

  bindScanBatchActions();
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const iid    = btn.dataset.iid;
      const action = btn.dataset.action;
      if (action === 'save')    await quickSaveIntakeItem(iid);
      if (action === 'edit')    openIntakeSheet(iid);
      if (action === 'discard') await discardIntakeItem(iid);
      if (action === 'retry')   await retryFailedIntakeItem(iid);
    });
  });
}

function bindScanBatchActions() {
  const root = document.getElementById('intakeQueue');
  if (!root) return;
  root.querySelectorAll('[data-batch-action]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const action = btn.dataset.batchAction;
      if (action === 'retry-failed') await retryAllFailedIntakeItems();
      if (action === 'close-summary') {
        runtimeBatchSummary = null;
        renderScanTab();
      }
    });
  });
}



function scheduleDeferredUiRefresh({ folderId = null } = {}) {
  if (runtimeDeferredRefreshTimer) clearTimeout(runtimeDeferredRefreshTimer);
  runtimeDeferredRefreshTimer = setTimeout(() => {
    runtimeDeferredRefreshTimer = null;
    renderScanTab();
    renderDashboard();
    renderMoreTab();
    if (folderId && state.currentFolderId === folderId) renderFolderDetail();
    if (currentPreviewDocId) openDocPreview(currentPreviewDocId);
  }, 90);
}

async function getBulkEnrichLimit() {
  if (runtimeBulkEnrichLimit) return runtimeBulkEnrichLimit;
  if (runtimeBulkEnrichLimitPromise) return runtimeBulkEnrichLimitPromise;
  runtimeBulkEnrichLimitPromise = getPLimitRuntime()
    .then(pLimit => {
      runtimeBulkEnrichLimit = pLimit(BULK_BACKGROUND_ENRICH_CONCURRENCY);
      return runtimeBulkEnrichLimit;
    })
    .catch(err => {
      console.warn('DocOS bulk enrich limiter unavailable', err);
      runtimeBulkEnrichLimit = null;
      return null;
    })
    .finally(() => {
      runtimeBulkEnrichLimitPromise = null;
    });
  return runtimeBulkEnrichLimitPromise;
}

async function enrichSavedDocBackground(docId, contextFolderId = null) {
  const doc = (state.documents || []).find(d => d.id === docId);
  if (!doc || !doc.blobKey || !['pdf', 'image'].includes(doc.previewType)) return;
  try {
    let extracted = normalizeExtractedText(doc.extractedText || '');
    if (!extracted) {
      if (doc.previewType === 'pdf') {
        extracted = await extractPdfTextFromBlobKey(doc.blobKey, 5);
      } else if (doc.previewType === 'image' && (doc.fileSize || 0) <= AUTO_FILL_IMAGE_OCR_MAX_BYTES) {
        extracted = await extractImageTextFromBlobKey(doc.blobKey);
      }
    }
    if (extracted) doc.extractedText = extracted;
    await applySmartParseToDoc(doc, extracted || doc.extractedText || '');
    saveState();
  } catch (err) {
    console.warn('DocOS background enrich doc failed', err);
  } finally {
    scheduleDeferredUiRefresh({ folderId: contextFolderId || doc.folderId || null });
  }
}

async function enrichIntakeItemBackground(itemId) {
  const item = (state.intakeQueue || []).find(i => i.id === itemId);
  if (!item || !item.blobKey || !['pdf', 'image'].includes(item.previewType)) return;
  try {
    item.uploadState = 'анализ';
    saveState();
    await autoFillIntakeItem(item);
    item.uploadState = 'готово';
    item.uploadError = '';
    saveState();
  } catch (err) {
    console.warn('DocOS background enrich queue item failed', err);
    item.uploadState = 'готово';
    saveState();
  } finally {
    scheduleDeferredUiRefresh({ folderId: item.contextFolderId || null });
  }
}

function scheduleBackgroundDocEnrich(docId, contextFolderId = null) {
  if (!docId) return;
  const jobKey = `doc:${docId}`;
  if (runtimeBulkEnrichJobs.has(jobKey)) return;
  const run = async () => {
    await new Promise(resolve => setTimeout(resolve, BULK_BACKGROUND_START_DELAY_MS));
    await enrichSavedDocBackground(docId, contextFolderId);
  };
  const start = async () => {
    const limit = await getBulkEnrichLimit();
    return limit ? limit(run) : run();
  };
  const job = start().finally(() => runtimeBulkEnrichJobs.delete(jobKey));
  runtimeBulkEnrichJobs.set(jobKey, job);
}

function scheduleBackgroundIntakeEnrich(itemId) {
  if (!itemId) return;
  const jobKey = `queue:${itemId}`;
  if (runtimeBulkEnrichJobs.has(jobKey)) return;
  const start = async () => {
    const limit = await getBulkEnrichLimit();
    const run = async () => {
      await new Promise(resolve => setTimeout(resolve, BULK_BACKGROUND_START_DELAY_MS));
      await enrichIntakeItemBackground(itemId);
    };
    return limit ? limit(run) : run();
  };
  const job = start().finally(() => runtimeBulkEnrichJobs.delete(jobKey));
  runtimeBulkEnrichJobs.set(jobKey, job);
}

async function addToIntakeQueue(file, contextFolderId = null, options = {}) {
  const {
    autoSaveFolder = !!contextFolderId,
    deferRender = false,
    silent = false,
    batchId = '',
    showAutoFill = true,
    backgroundAutoFill = false
  } = options || {};

  if (!file) return null;
  if ((file.size || 0) > MAX_LOCAL_FILE_BYTES) {
    if (!silent) showToast(`⚠️ Файлът е твърде голям (${formatBytes(file.size || 0)})`);
    throw new Error('Файлът е твърде голям');
  }

  const cleanFileName = cleanupImportedFileName(file.name);
  if (hasLikelyLocalDuplicate(cleanFileName, file.size || 0, file.type || guessMimeType(cleanFileName))) {
    const duplicateError = new Error('Дубликат');
    duplicateError.code = 'duplicate';
    throw duplicateError;
  }

  try {
    const analysis = HEURISTICS.analyze(cleanFileName, file.type);
    const ext = cleanFileName.split('.').pop().toLowerCase();
    const isImage = ['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext) || (file.type || '').startsWith('image/');

    let suggestedFolderId = null;
    let isReview = false;
    if (contextFolderId) {
      suggestedFolderId = contextFolderId;
    } else {
      // Auto-category: create folders for photos/screenshots if they don't exist
      const autoCategory = HEURISTICS.autoCategory(cleanFileName, file.type);
      analysis._autoCategory = autoCategory;
      if (autoCategory === 'screenshot') {
        let scrFolder = state.folders.find(f => (f.name||'').toLowerCase().includes('скрийншот') || (f.name||'').toLowerCase().includes('screenshot'));
        if (!scrFolder) {
          scrFolder = { id: uid(), name: 'Скрийншоти', icon: '📱', createdAt: new Date().toISOString() };
          state.folders.push(scrFolder);
          saveState();
        }
        suggestedFolderId = scrFolder.id;
      } else if (autoCategory === 'photo') {
        let photoFolder = state.folders.find(f => (f.name||'').toLowerCase().includes('галерия') || (f.name||'').toLowerCase().includes('снимки') || (f.name||'').toLowerCase().includes('photo'));
        if (!photoFolder) {
          photoFolder = { id: uid(), name: 'Галерия', icon: '📷', createdAt: new Date().toISOString() };
          state.folders.push(photoFolder);
          saveState();
        }
        suggestedFolderId = photoFolder.id;
      } else {
        const sugg = HEURISTICS.suggestFolder(analysis, state.folders);
        if (sugg) {
          suggestedFolderId = sugg.folder.id;
          isReview = sugg.isReview;
        }
      }
    }

    const persisted = await persistUploadedFile(file, contextFolderId ? 'folder' : 'upload', cleanFileName);

    const item = {
      id:               uid(),
      originalFileName: cleanFileName,
      fileSize:         Number(file.size) || 0,
      fileMime:         persisted.fileMime,
      previewType:      analysis.previewType,
      previewDataUrl:   isImage ? persisted.previewDataUrl : '',
      rawDataUrl:       '',
      blobKey:          persisted.blobKey,
      suggestedTitle:   analysis.suggestedTitle,
      docType:          analysis.docType,
      docTypeLabel:     analysis.docTypeLabel,
      institution:      analysis.institution,
      institutionIcon:  analysis.institutionIcon,
      detectedDate:     analysis.detectedDate,
      detectedYear:     analysis.detectedYear,
      detectedTime:     analysis.detectedTime,
      confidence:       analysis.confidence,
      suggestedFolderId,
      isReview,
      contextFolderId,
      extractedText:    '',
      summary:          '',
      cleanFileName,
      parserVersion:    0,
      homeHidden:       !!contextFolderId,
      uploadState:      'готово',
      uploadError:      '',
      transientRetryId: '',
      batchId:          batchId || '',
      parsedData:       normalizeParsedData({
        typeKey: analysis.docType || 'other',
        typeLabel: analysis.docTypeLabel || 'Документ',
        title: analysis.suggestedTitle || cleanFileName.replace(/\.[a-z0-9]{2,5}$/i, ''),
        personName: '',
        organization: analysis.institution || '',
        email: '',
        phone: '',
        address: '',
        normalizedDate: formatSmartDate(analysis.detectedDate || ''),
        detectedYear: analysis.detectedYear || '',
        language: '',
        summary: analysis.institution ? `${analysis.docTypeLabel || 'Документ'} • ${analysis.institution}` : (analysis.docTypeLabel || 'Документ'),
        keywords: [analysis.docTypeLabel || 'Документ', analysis.institution || '', analysis.previewType || ''].filter(Boolean),
        confidence: analysis.confidence || 0,
        source: 'filename-heuristics'
      }),
    };

    state.intakeQueue = state.intakeQueue || [];
    state.intakeQueue.push(item);
    saveState();

    if (showAutoFill && ['pdf', 'image'].includes(item.previewType)) {
      if (!silent) showToast('🤖 Авто попълване...');
      try {
        await autoFillIntakeItem(item);
        saveState();
      } catch (autoErr) {
        console.warn('DocOS auto fill failed', autoErr);
      }
    }

    let savedDoc = null;
    if (autoSaveFolder) {
      savedDoc = await quickSaveIntakeItem(item.id, { silent: true, deferRender: true });
    }

    if (backgroundAutoFill && ['pdf', 'image'].includes(item.previewType)) {
      if (savedDoc?.id) scheduleBackgroundDocEnrich(savedDoc.id, contextFolderId || savedDoc.folderId || null);
      else scheduleBackgroundIntakeEnrich(item.id);
    }

    if (!deferRender) {
      await refreshStorageEstimate(true);
      if (contextFolderId && autoSaveFolder) {
        showTab('documents');
        setTimeout(() => showFolderDetail(contextFolderId), 60);
      } else {
        showTab('scan');
        renderScanTab();
        renderDashboard();
        renderMoreTab();
      }
    }
    return item;
  } catch (e) {
    console.error('DocOS upload error', e);
    throw e;
  }
}

async function processBulkUpload(files, contextFolderId = null) {
  const fileList = Array.from(files || []).filter(Boolean);
  if (!fileList.length) return;
  if (runtimeBatchBusy) {
    showToast('⏳ Изчакай текущото качване');
    return;
  }

  const useFastBackground = !!contextFolderId || fileList.length >= BULK_FAST_MODE_MIN_FILES;
  runtimeBatchBusy = true;
  const batchId = uid();
  updateBatchSummary({
    total: fileList.length,
    queued: 0,
    saved: 0,
    duplicates: 0,
    failed: 0,
    folderId: contextFolderId || null,
    batchId,
    mode: contextFolderId ? 'папка' : 'качване',
    finishedAt: ''
  });

  try { await requestPersistentStorageIfAvailable(); } catch (_) {}

  for (const file of fileList) {
    try {
      const item = await addToIntakeQueue(file, contextFolderId, {
        autoSaveFolder: !!contextFolderId,
        deferRender: true,
        silent: true,
        batchId,
        showAutoFill: !useFastBackground,
        backgroundAutoFill: useFastBackground
      });
      if (contextFolderId) runtimeBatchSummary.saved += item ? 1 : 0;
      else runtimeBatchSummary.queued += item ? 1 : 0;
    } catch (err) {
      if (err?.code === 'duplicate' || /Дубликат/i.test(err?.message || '')) {
        runtimeBatchSummary.duplicates += 1;
      } else {
        const failedItem = makeFailedQueueItem(file, contextFolderId, err?.message || 'Неуспешно локално запазване', batchId);
        state.intakeQueue = state.intakeQueue || [];
        state.intakeQueue.push(failedItem);
        saveState();
        runtimeBatchSummary.failed += 1;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  runtimeBatchBusy = false;
  runtimeBatchSummary.finishedAt = new Date().toISOString();
  await refreshStorageEstimate(true);
  renderScanTab();
  renderDashboard();
  renderMoreTab();
  if (contextFolderId) {
    showTab('documents');
    renderFolderDetail();
    if (runtimeBatchSummary.failed > 0) showToast(`📦 ${runtimeBatchSummary.saved} в папката · ${runtimeBatchSummary.failed} грешка`);
    else if (runtimeBatchSummary.duplicates > 0) showToast(`📦 ${runtimeBatchSummary.saved} записани · ${runtimeBatchSummary.duplicates} дубликата`);
    else showToast(`📦 ${runtimeBatchSummary.saved} записани в папката`);
  } else {
    showTab('scan');
    showToast(`📦 ${runtimeBatchSummary.queued} в опашка · ${runtimeBatchSummary.duplicates} дубликата · ${runtimeBatchSummary.failed} грешка`);
  }

  if (useFastBackground) {
    showToast('⚡ Бърз режим: анализът върви на заден план', 2600);
  }
}

async function quickSaveIntakeItem(iid, options = {}) {
  const { silent = false, deferRender = false } = options || {};
  const item = (state.intakeQueue || []).find(i => i.id === iid);
  if (!item) return null;
  const doc = makeDocFromIntake(item);
  state.documents.push(doc);
  state.intakeQueue = state.intakeQueue.filter(i => i.id !== iid);
  saveState();
  if (!deferRender) {
    await refreshStorageEstimate(true);
    if (!silent) showToast('✅ Документът е запазен');
    renderScanTab();
    renderDashboard();
    renderMoreTab();
    if (item.contextFolderId && state.currentFolderId === item.contextFolderId) {
      renderFolderDetail();
    }
  }
  return doc;
}

async function discardIntakeItem(iid) {
  const item = (state.intakeQueue||[]).find(i => i.id === iid);
  state.intakeQueue = (state.intakeQueue||[]).filter(i => i.id !== iid);
  if (item?.transientRetryId) runtimeRetryFiles.delete(item.transientRetryId);
  saveState();
  await deleteBlobIfOrphaned(item?.blobKey, { excludeQueueId: iid });
  await refreshStorageEstimate(true);
  renderScanTab();
  renderDashboard();
  renderMoreTab();
  showToast('🗑 Документът е премахнат от опашката');
}

async function retryFailedIntakeItem(iid) {
  const item = (state.intakeQueue || []).find(i => i.id === iid);
  if (!item || item.uploadState !== 'грешка') return;
  const retryPayload = runtimeRetryFiles.get(item.transientRetryId || '');
  if (!retryPayload?.file) {
    showToast('⚠️ Повторението е налично само в текущата сесия');
    return;
  }
  state.intakeQueue = (state.intakeQueue || []).filter(i => i.id !== iid);
  runtimeRetryFiles.delete(item.transientRetryId || '');
  saveState();
  try {
    const retryContextFolderId = retryPayload.contextFolderId || item.contextFolderId || null;
    const retryFastBackground = !!retryContextFolderId;
    await addToIntakeQueue(retryPayload.file, retryContextFolderId, {
      autoSaveFolder: !!retryContextFolderId,
      deferRender: true,
      silent: true,
      batchId: retryPayload.batchId || item.batchId || '',
      showAutoFill: !retryFastBackground,
      backgroundAutoFill: retryFastBackground
    });
    if (runtimeBatchSummary && runtimeBatchSummary.failed > 0) runtimeBatchSummary.failed -= 1;
    if (runtimeBatchSummary && (retryPayload.contextFolderId || item.contextFolderId)) runtimeBatchSummary.saved += 1;
    if (runtimeBatchSummary && !(retryPayload.contextFolderId || item.contextFolderId)) runtimeBatchSummary.queued += 1;
    await refreshStorageEstimate(true);
    renderScanTab();
    renderDashboard();
    renderMoreTab();
    if (retryPayload.contextFolderId || item.contextFolderId) renderFolderDetail();
    showToast('✅ Повторението беше успешно');
  } catch (err) {
    const failedItem = makeFailedQueueItem(retryPayload.file, retryPayload.contextFolderId || item.contextFolderId || null, err?.message || 'Неуспешно локално запазване', retryPayload.batchId || item.batchId || '');
    state.intakeQueue = state.intakeQueue || [];
    state.intakeQueue.push(failedItem);
    saveState();
    await refreshStorageEstimate(true);
    renderScanTab();
    renderDashboard();
    renderMoreTab();
    showToast('⚠️ Повторението не успя');
  }
}

async function retryAllFailedIntakeItems() {
  const failedItems = (state.intakeQueue || []).filter(item => item.uploadState === 'грешка');
  if (!failedItems.length) return;
  for (const item of failedItems) {
    await retryFailedIntakeItem(item.id);
  }
}

function makeDocFromIntake(item, overrides={}) {
  return {
    id:               uid(),
    title:            overrides.title        || item.suggestedTitle,
    folderId:         overrides.folderId     !== undefined ? overrides.folderId : item.suggestedFolderId,
    status:           overrides.status       || 'saved',
    sourceType:       'upload',
    institution:      overrides.institution  || item.institution,
    date:             overrides.date         || item.detectedDate,
    detectedDate:     item.detectedDate,
    detectedYear:     item.detectedYear,
    detectedTime:     item.detectedTime,
    confidence:       item.confidence,
    createdAt:        new Date().toISOString(),
    previewType:      item.previewType,
    originalFileName: item.originalFileName,
    previewDataUrl:   item.previewDataUrl,
    docType:          item.docType,
    blobKey:          item.blobKey || '',
    fileMime:         item.fileMime || '',
    fileSize:         Number(item.fileSize) || 0,
    extractedText:    item.extractedText || '',
    summary:          overrides.summary || item.summary || (normalizeParsedData(item.parsedData || null)?.summary || ''),
    cleanFileName:    item.cleanFileName || cleanupImportedFileName(item.originalFileName || ''),
    parserVersion:    Number(item.parserVersion) || 0,
    parsedData:       normalizeParsedData(item.parsedData || null),
    homeHidden:       overrides.homeHidden !== undefined ? !!overrides.homeHidden : !!((overrides.folderId !== undefined ? overrides.folderId : (item.contextFolderId || item.suggestedFolderId)) || item.homeHidden),
  };
}


/* ═══════════════════════════════════════════════
   13. INTAKE SHEET (EDIT BEFORE SAVE)
═══════════════════════════════════════════════ */

let currentIntakeId = null;


async function openIntakeSheet(iid) {
  const item = (state.intakeQueue||[]).find(i => i.id === iid);
  if (!item) return;
  currentIntakeId = iid;

  const prevEl = document.getElementById('intakePreviewArea');
  prevEl.innerHTML = `<div class="pdf-preview-card"><div class="pdf-icon">⏳</div><div class="pdf-name">Зареждане на преглед...</div></div>`;

  try {
    if (item.previewType === 'image' && (item.previewDataUrl || item.blobKey)) {
      const previewUrl = item.previewDataUrl || await getObjectUrlForBlobKey(item.blobKey);
      item.previewDataUrl = previewUrl || '';
      if (previewUrl) {
        buildPreviewImageViewer(prevEl, previewUrl, doc.title || doc.originalFileName || 'Изображение');
      } else {
        throw new Error('missing image preview');
      }
    } else if (item.previewType === 'pdf' && item.blobKey) {
      await renderPdfIntoElement(prevEl, item.blobKey, item.originalFileName);
    } else {
      prevEl.innerHTML = `
        <div class="pdf-preview-card">
          <div class="pdf-icon">${DOC_TYPE_ICONS[item.previewType]||'📄'}</div>
          <div class="pdf-name">${escHtml(item.originalFileName)}</div>
          <div style="font-size:.72rem;color:var(--text3)">${formatBytes(item.fileSize||0)}</div>
        </div>`;
    }
  } catch (e) {
    prevEl.innerHTML = `
      <div class="pdf-preview-card">
        <div class="pdf-icon">${DOC_TYPE_ICONS[item.previewType]||'📄'}</div>
        <div class="pdf-name">${escHtml(item.originalFileName)}</div>
        <div style="font-size:.72rem;color:var(--text3)">${formatBytes(item.fileSize||0)}</div>
      </div>`;
  }

  const folderOptions = [
    '<option value="">— Без папка —</option>',
    ...state.folders.map(f => `<option value="${f.id}" ${f.id === item.suggestedFolderId ? 'selected' : ''}>${f.icon||'📁'} ${escHtml(f.name)}</option>`)
  ].join('');

  document.getElementById('intakeMetaForm').innerHTML = `
    <div class="form-group">
      <label class="form-label">Заглавие</label>
      <input type="text" class="form-input" id="intakeTitleInput" value="${escHtml(item.suggestedTitle)}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Институция / Издател</label>
      <input type="text" class="form-input" id="intakeInstInput" value="${escHtml(item.institution)}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Дата на документа</label>
      <input type="text" class="form-input" id="intakeDateInput" value="${escHtml(item.detectedDate)}" placeholder="дд.мм.гггг"/>
    </div>
    <div class="form-group">
      <label class="form-label">Папка</label>
      <select class="form-select" id="intakeFolderSelect">${folderOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Бележка</label>
      <input type="text" class="form-input" id="intakeSummaryInput" value="${escHtml(item.summary || item.parsedData?.summary || '')}" placeholder="Авто попълнено – редакция само при грешка"/>
    </div>
    <div style="font-size:.72rem;color:var(--text3)">Авто попълване: <span class="confidence-badge ${confidenceLevel(item.confidence)}">${confidenceLabel(item.confidence)}</span> &nbsp; Файл: ${escHtml(item.originalFileName)}</div>
  `;

  showSheet('intakeSheet', 'intakeBackdrop');
}


function closeIntakeSheet() {
  hideSheet('intakeSheet', 'intakeBackdrop');
  currentIntakeId = null;
}

function saveIntakeSheet() {
  if (!currentIntakeId) return;
  const item = (state.intakeQueue||[]).find(i => i.id === currentIntakeId);
  if (!item) return;

  const title    = document.getElementById('intakeTitleInput')?.value.trim()   || item.suggestedTitle;
  const inst     = document.getElementById('intakeInstInput')?.value.trim()    || '';
  const date     = document.getElementById('intakeDateInput')?.value.trim()    || '';
  const folderId = document.getElementById('intakeFolderSelect')?.value        || null;
  const summary  = document.getElementById('intakeSummaryInput')?.value.trim() || item.summary || '';

  const doc = makeDocFromIntake(item, { title, institution: inst, date, folderId: folderId||null, summary, homeHidden: !!(folderId || item.contextFolderId || item.suggestedFolderId) });
  state.documents.push(doc);
  state.intakeQueue = state.intakeQueue.filter(i => i.id !== currentIntakeId);
  saveState();
  closeIntakeSheet();
  refreshStorageEstimate(true).catch(()=>{});
  showToast('✅ Документът е запазен');
  renderScanTab();
  renderDashboard();
  renderMoreTab();
}

/* ═══════════════════════════════════════════════
   14. DOCUMENT PREVIEW SHEET
═══════════════════════════════════════════════ */

let currentPreviewDocId = null;
let currentPreviewImageViewer = null;

function destroyPreviewImageViewer() {
  const viewer = currentPreviewImageViewer;
  if (!viewer) return;
  try { viewer.cleanup?.forEach(fn => { try { fn(); } catch (_) {} }); } catch (_) {}
  currentPreviewImageViewer = null;
}

function clampPreviewViewerPan(viewer) {
  if (!viewer) return;
  const halfOverflowX = Math.max(0, (viewer.renderedWidth - viewer.viewportWidth) / 2);
  const halfOverflowY = Math.max(0, (viewer.renderedHeight - viewer.viewportHeight) / 2);
  if (viewer.zoom <= 1.01) {
    viewer.x = 0;
    viewer.y = 0;
    return;
  }
  viewer.x = Math.max(-halfOverflowX, Math.min(halfOverflowX, viewer.x));
  viewer.y = Math.max(-halfOverflowY, Math.min(halfOverflowY, viewer.y));
}

function applyPreviewViewerTransform(viewer) {
  if (!viewer || !viewer.surface) return;
  const totalScale = Math.max(0.001, viewer.baseScale * viewer.zoom);
  viewer.renderedWidth = viewer.imageWidth * totalScale;
  viewer.renderedHeight = viewer.imageHeight * totalScale;
  clampPreviewViewerPan(viewer);
  viewer.surface.style.setProperty('--preview-scale', String(totalScale));
  viewer.surface.style.setProperty('--preview-x', `${viewer.x}px`);
  viewer.surface.style.setProperty('--preview-y', `${viewer.y}px`);
  viewer.viewport.classList.toggle('is-zoomed', viewer.zoom > 1.01);
}

function setPreviewViewerZoom(viewer, nextZoom, opts = {}) {
  if (!viewer) return;
  const target = Math.max(viewer.minZoom, Math.min(viewer.maxZoom, nextZoom));
  viewer.zoom = target;
  if (opts.resetPan || target <= 1.01) {
    viewer.x = 0;
    viewer.y = 0;
  }
  applyPreviewViewerTransform(viewer);
  viewer.fitBtn?.classList.toggle('is-active', viewer.zoom <= 1.01);
  viewer.zoomBtn?.classList.toggle('is-active', viewer.zoom > 1.01 && viewer.zoom < 2.85);
  viewer.actualBtn?.classList.toggle('is-active', viewer.zoom >= 2.85);
}

function buildPreviewImageViewer(root, imageUrl, title) {
  if (!root) return;
  destroyPreviewImageViewer();
  root.innerHTML = `
    <div class="preview-stage preview-stage-clean">
      <div class="preview-zoom-viewport preview-zoom-viewport-clean" id="previewZoomViewport">
        <div class="preview-zoom-backdrop" id="previewZoomBackdrop" aria-hidden="true"></div>
        <div class="preview-zoom-surface" id="previewZoomSurface">
          <img class="preview-zoom-image" id="previewZoomImage" src="${imageUrl}" alt="${escHtml(title || 'Изображение')}" draggable="false"/>
        </div>
      </div>
    </div>`;

  const viewport = root.querySelector('#previewZoomViewport');
  const surface = root.querySelector('#previewZoomSurface');
  const img = root.querySelector('#previewZoomImage');
  const backdrop = root.querySelector('#previewZoomBackdrop');
  const viewer = {
    root, viewport, surface, img, backdrop,
    cleanup: [], imageWidth: 1, imageHeight: 1, viewportWidth: 1, viewportHeight: 1,
    baseScale: 1, zoom: 1, minZoom: 1, maxZoom: 5, x: 0, y: 0,
    renderedWidth: 1, renderedHeight: 1, dragPointerId: null, dragStartX: 0, dragStartY: 0,
    originX: 0, originY: 0, moved: false, lastTapAt: 0
  };
  if (backdrop) backdrop.style.backgroundImage = `url("${imageUrl}")`;

  const measure = () => {
    const rect = viewport.getBoundingClientRect();
    viewer.viewportWidth = Math.max(1, rect.width);
    viewer.viewportHeight = Math.max(1, rect.height);
    viewer.imageWidth = Math.max(1, img.naturalWidth || rect.width);
    viewer.imageHeight = Math.max(1, img.naturalHeight || rect.height);
    const ratio = viewer.imageHeight / viewer.imageWidth;
    viewport.classList.toggle('is-portraitish', ratio > 1.18);
    viewer.baseScale = Math.min(viewer.viewportWidth / viewer.imageWidth, viewer.viewportHeight / viewer.imageHeight);
    // Ensure image fills at least 90% of the smaller viewport dimension
    if (viewer.baseScale > 0) {
      const fillScale = Math.min(
        (viewer.viewportWidth * 0.92) / viewer.imageWidth,
        (viewer.viewportHeight * 0.92) / viewer.imageHeight
      );
      viewer.baseScale = Math.max(viewer.baseScale, fillScale);
    }
    if (!Number.isFinite(viewer.baseScale) || viewer.baseScale <= 0) viewer.baseScale = 1;
    applyPreviewViewerTransform(viewer);
  };

  const requestMeasure = () => requestAnimationFrame(measure);
  const resetToFit = () => setPreviewViewerZoom(viewer, 1, { resetPan: true });
  const toggleZoom = () => setPreviewViewerZoom(viewer, viewer.zoom > 1.01 ? 1 : 2.2, { resetPan: viewer.zoom <= 1.01 });

  const onPointerDown = ev => {
    if (viewer.zoom <= 1.01) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    viewer.dragPointerId = ev.pointerId;
    viewer.dragStartX = ev.clientX;
    viewer.dragStartY = ev.clientY;
    viewer.originX = viewer.x;
    viewer.originY = viewer.y;
    viewer.moved = false;
    viewport.classList.add('is-dragging');
    try { viewport.setPointerCapture?.(ev.pointerId); } catch (_) {}
    ev.preventDefault();
  };
  const onPointerMove = ev => {
    if (viewer.dragPointerId == null || ev.pointerId !== viewer.dragPointerId) return;
    const dx = ev.clientX - viewer.dragStartX;
    const dy = ev.clientY - viewer.dragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) viewer.moved = true;
    viewer.x = viewer.originX + dx;
    viewer.y = viewer.originY + dy;
    applyPreviewViewerTransform(viewer);
    ev.preventDefault();
  };
  const endPointer = ev => {
    if (viewer.dragPointerId != null && ev?.pointerId != null && ev.pointerId !== viewer.dragPointerId) return;
    if (!viewer.moved && ev?.pointerType === 'touch') {
      const now = Date.now();
      if (now - viewer.lastTapAt < 280) {
        toggleZoom();
        viewer.lastTapAt = 0;
      } else {
        viewer.lastTapAt = now;
      }
    }
    if (viewer.dragPointerId != null) {
      try { viewport.releasePointerCapture?.(viewer.dragPointerId); } catch (_) {}
    }
    viewer.dragPointerId = null;
    viewport.classList.remove('is-dragging');
  };
  const onDoubleClick = ev => {
    toggleZoom();
    ev.preventDefault();
  };

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('dblclick', onDoubleClick);
  img.addEventListener('load', requestMeasure, { once: true });
  window.addEventListener('resize', requestMeasure, { passive: true });

  viewer.cleanup.push(
    () => viewport.removeEventListener('pointerdown', onPointerDown),
    () => viewport.removeEventListener('pointermove', onPointerMove),
    () => viewport.removeEventListener('pointerup', endPointer),
    () => viewport.removeEventListener('pointercancel', endPointer),
    () => viewport.removeEventListener('dblclick', onDoubleClick),
    () => window.removeEventListener('resize', requestMeasure)
  );

  currentPreviewImageViewer = viewer;
  resetToFit();
  requestMeasure();
}

function buildPreviewVideoPlayer(root, videoUrl, title) {
  if (!root) return;
  destroyPreviewImageViewer();
  root.innerHTML = `
    <div class="preview-stage preview-stage-clean">
      <div class="preview-video-viewport">
        <video class="preview-video-player" id="previewVideoEl"
          src="${videoUrl}"
          controls
          playsinline
          preload="metadata"
          controlsList="nodownload"
          poster="">
          Браузърът не поддържа видео.
        </video>
        <div class="preview-video-overlay" id="previewVideoOverlay">
          <button class="preview-video-play-btn" id="previewVideoPlayBtn">▶</button>
        </div>
      </div>
      <div class="preview-video-info">
        <span class="preview-video-badge">🎬 Видео</span>
        <span class="preview-video-name">${escHtml(title)}</span>
      </div>
    </div>`;

  const videoEl = root.querySelector('#previewVideoEl');
  const overlay = root.querySelector('#previewVideoOverlay');
  const playBtn = root.querySelector('#previewVideoPlayBtn');

  if (videoEl && overlay && playBtn) {
    playBtn.addEventListener('click', () => {
      videoEl.play();
      overlay.style.display = 'none';
    });
    videoEl.addEventListener('pause', () => {
      if (!videoEl.ended) overlay.style.display = 'flex';
    });
    videoEl.addEventListener('play', () => {
      overlay.style.display = 'none';
    });
    videoEl.addEventListener('ended', () => {
      overlay.style.display = 'flex';
    });
  }
}

async function openDocPreview(docId) {
  const doc = state.documents.find(d => d.id === docId);
  if (!doc) return;
  currentPreviewDocId = docId;

  document.getElementById('previewSheetTitle').textContent = doc.title || 'Документ';

  const prevEl = document.getElementById('previewArea');
  prevEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1.5rem"><div style="font-size:2.2rem">⏳</div><div style="font-size:.8rem;color:var(--text2);text-align:center">Зареждане на преглед...</div></div>`;

  try {
    if (doc.previewType === 'image' && (doc.blobKey || doc.previewDataUrl)) {
      // Use fullscreen gallery viewer for images
      const contextDocs = doc.folderId
        ? state.documents.filter(d => d.folderId === doc.folderId && d.previewType === 'image')
        : state.documents.filter(d => d.previewType === 'image');
      openGalleryViewer(docId, contextDocs);
      return; // Don't open the sheet
    } else if ((doc.previewType === 'video' || (doc.fileMime && doc.fileMime.startsWith('video/'))) && doc.blobKey) {
      const videoUrl = await getObjectUrlForBlobKey(doc.blobKey);
      if (videoUrl) {
        buildPreviewVideoPlayer(prevEl, videoUrl, doc.originalFileName || doc.title || 'Видео');
      } else {
        throw new Error('missing video blob');
      }
    } else if (doc.previewType === 'pdf' && doc.blobKey) {
      await renderPdfIntoElement(prevEl, doc.blobKey, doc.originalFileName || doc.title);
    } else {
      prevEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1.5rem">
          <div style="font-size:3rem">${DOC_TYPE_ICONS[doc.previewType]||DOC_TYPE_ICONS[doc.docType]||'📄'}</div>
          <div style="font-size:.8rem;color:var(--text2);text-align:center">${escHtml(doc.originalFileName||doc.title)}</div>
        </div>`;
    }
  } catch (e) {
    prevEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1.5rem">
        <div style="font-size:3rem">${DOC_TYPE_ICONS[doc.previewType]||DOC_TYPE_ICONS[doc.docType]||'📄'}</div>
        <div style="font-size:.8rem;color:var(--text2);text-align:center">${escHtml(doc.originalFileName||doc.title)}</div>
      </div>`;
  }

  const folder = state.folders.find(f => f.id === doc.folderId);
  const confLevel = confidenceLevel(doc.confidence||0);
  const parsed = normalizeParsedData(doc.parsedData || null);
  const showParsedSummary = !!(parsed && (doc.previewType !== 'image' || Number(parsed.confidence || doc.confidence || 0) >= 0.25));
  document.getElementById('previewMetaPanel').innerHTML = `
    ${showParsedSummary ? `<div class="smart-summary-block"><div class="smart-summary-head"><span>Smart Parse</span><span class="confidence-badge ${confidenceLevel(parsed.confidence || doc.confidence || 0)}">${confidenceLabel(parsed.confidence || doc.confidence || 0)}</span></div>${renderParsedSummaryHtml(parsed, { includeTitle: true })}</div>` : ''}
    <div class="meta-row"><span class="meta-key">Заглавие</span><span class="meta-val">${escHtml(doc.title)}</span></div>
    <div class="meta-row"><span class="meta-key">Статус</span><span class="meta-val ${doc.status==='pending'?'text-accent':''}">${doc.status==='pending'?'⏳ За преглед':'✅ Запазен'}</span></div>
    ${doc.institution ? `<div class="meta-row"><span class="meta-key">Институция</span><span class="meta-val">${escHtml(doc.institution)}</span></div>` : ''}
    ${doc.date||doc.detectedDate ? `<div class="meta-row"><span class="meta-key">Дата</span><span class="meta-val">${escHtml(doc.date||doc.detectedDate)}</span></div>` : ''}
    ${doc.detectedYear ? `<div class="meta-row"><span class="meta-key">Година</span><span class="meta-val">${doc.detectedYear}</span></div>` : ''}
    ${folder ? `<div class="meta-row"><span class="meta-key">Папка</span><span class="meta-val">${escHtml(folder.icon||'📁')} ${escHtml(folder.name)}</span></div>` : ''}
    <div class="meta-row"><span class="meta-key">Увереност</span><span class="meta-val"><span class="confidence-badge ${confLevel}">${confidenceLabel(doc.confidence||0)}</span></span></div>
    ${doc.summary ? `<div class="meta-row"><span class="meta-key">Бележка</span><span class="meta-val">${escHtml(doc.summary)}</span></div>` : ''}
    ${doc.extractedText ? `<details class="raw-text-details"><summary>Суров изваден текст</summary><div class="raw-text-body">${escHtml(summarizeExtractedText(doc.extractedText, 3200))}</div></details>` : ''}
    <div class="meta-row"><span class="meta-key">Добавен</span><span class="meta-val">${formatDate(doc.createdAt)}</span></div>
    ${doc.originalFileName ? `<div class="meta-row"><span class="meta-key">Файл</span><span class="meta-val" style="font-size:.68rem">${escHtml(doc.originalFileName)}</span></div>` : ''}
    ${doc.fileSize ? `<div class="meta-row"><span class="meta-key">Размер</span><span class="meta-val">${formatBytes(doc.fileSize)}</span></div>` : ''}
  `;

  const markBtn = document.getElementById('previewMarkBtn');
  if (markBtn) markBtn.textContent = doc.status === 'pending' ? '✅ Маркирай като готов' : '👁 Маркирай за преглед';

  showSheet('previewSheet', 'previewBackdrop');
  requestHorizontalDriftClamp();
}



function closePreviewSheet() {
  destroyPreviewImageViewer();
  hideSheet('previewSheet', 'previewBackdrop');
  currentPreviewDocId = null;
  requestHorizontalDriftClamp();
}

/* ═══════════════════════════════════════════════
   15. MOVE SHEET
═══════════════════════════════════════════════ */

function openMoveSheet(docId) {
  const el = document.getElementById('moveFolderList');
  el.innerHTML = `
    <div class="move-folder-item move-unassign" data-folderid="">
      <span class="move-folder-item-icon">🚫</span>
      <span class="move-folder-item-name">Без папка</span>
    </div>
    ${state.folders.map(f => `
      <div class="move-folder-item" data-folderid="${f.id}">
        <span class="move-folder-item-icon">${f.icon||'📁'}</span>
        <span class="move-folder-item-name">${escHtml(f.name)}</span>
      </div>
    `).join('')}
  `;
  el.querySelectorAll('.move-folder-item').forEach(item => {
    item.addEventListener('click', () => {
      const doc = state.documents.find(d => d.id === docId);
      if (doc) {
        doc.folderId = item.dataset.folderid || null;
        doc.homeHidden = !!doc.folderId;
        saveState();
        showToast('📂 Преместен');
        closeSheet('moveSheet', 'moveBackdrop');
        // Refresh visible content
        if (state.currentFolderId) renderFolderDetail();
        else renderDocuments();
        openDocPreview(docId);
      }
    });
  });
  closePreviewSheet();
  showSheet('moveSheet', 'moveBackdrop');
}

/* ═══════════════════════════════════════════════
   16. AGENT TAB
═══════════════════════════════════════════════ */

function renderAgentTab() {
  const sel = document.getElementById('agentDocSelect');
  if (!sel) return;

  sel.innerHTML = '<option value="">— Избери документ —</option>' +
    state.documents
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))
      .map(d => `<option value="${d.id}">${escHtml(d.title)}</option>`)
      .join('');

  document.getElementById('agentDocPanel').style.display     = 'none';
  document.getElementById('agentActionsPanel').style.display = 'none';
  document.getElementById('agentResultPanel').style.display  = 'none';
  document.getElementById('agentEmptyState').style.display   = 'flex';
}

function renderAgentForDoc(docId) {
  const doc = state.documents.find(d => d.id === docId);
  if (!doc) return;

  document.getElementById('agentEmptyState').style.display   = 'none';
  document.getElementById('agentDocPanel').style.display     = 'block';
  document.getElementById('agentActionsPanel').style.display = 'flex';

  const folder    = state.folders.find(f => f.id === doc.folderId);
  const confLevel = confidenceLevel(doc.confidence||0);
  const parsed    = normalizeParsedData(doc.parsedData || null);

  document.getElementById('agentDocPanel').innerHTML = `
    <div class="agent-meta-row">
      <span class="agent-meta-label">Заглавие</span>
      <span class="agent-meta-val">${escHtml(doc.title)}</span>
    </div>
    <div class="agent-meta-divider"></div>
    <div class="agent-meta-row">
      <span class="agent-meta-label">Тип</span>
      <span class="agent-meta-val">${escHtml(parsed?.typeLabel || doc.docType || 'Неизвестен')}</span>
    </div>
    ${doc.institution ? `
    <div class="agent-meta-row">
      <span class="agent-meta-label">Институция</span>
      <span class="agent-meta-val">${escHtml(doc.institution)}</span>
    </div>` : ''}
    ${doc.date || doc.detectedDate ? `
    <div class="agent-meta-row">
      <span class="agent-meta-label">Дата</span>
      <span class="agent-meta-val">${escHtml(doc.date||doc.detectedDate)}</span>
    </div>` : ''}
    ${doc.detectedYear ? `
    <div class="agent-meta-row">
      <span class="agent-meta-label">Година</span>
      <span class="agent-meta-val">${doc.detectedYear}</span>
    </div>` : ''}
    ${folder ? `
    <div class="agent-meta-row">
      <span class="agent-meta-label">Папка</span>
      <span class="agent-meta-val">${escHtml(folder.icon||'📁')} ${escHtml(folder.name)}</span>
    </div>` : ''}
    <div class="agent-meta-row">
      <span class="agent-meta-label">Статус</span>
      <span class="agent-meta-val">${doc.status === 'pending' ? '⏳ За преглед' : '✅ Запазен'}</span>
    </div>
    <div class="agent-meta-row">
      <span class="agent-meta-label">Увереност</span>
      <span class="agent-meta-val"><span class="confidence-badge ${confLevel}">${confidenceLabel(doc.confidence||0)}</span></span>
    </div>
    <div class="agent-meta-divider"></div>
    ${parsed ? `<div class="agent-meta-divider"></div>${renderParsedSummaryHtml(parsed, { emptyText: 'Няма smart parse.' })}` : ''}
    <div style="font-size:.72rem;color:var(--text3)">Файл: ${escHtml(doc.originalFileName||'—')}</div>
  `;

  // Build action cards based on doc data
  const actions = buildAgentActions(doc);
  document.getElementById('agentActionsPanel').innerHTML = actions.map(a => `
    <div class="agent-action-card" data-action="${a.action}" data-docid="${doc.id}">
      <span class="agent-action-icon">${a.icon}</span>
      <div class="agent-action-text">
        <div class="agent-action-title">${a.title}</div>
        <div class="agent-action-desc">${a.desc}</div>
      </div>
      <span style="font-size:.8rem;color:var(--text3)">›</span>
    </div>
  `).join('');

  const resultPanel = document.getElementById('agentResultPanel');
  const extracted = normalizeExtractedText(doc.extractedText || '');
  if (resultPanel) {
    if (extracted) {
      resultPanel.style.display = 'block';
      resultPanel.innerHTML = `
        <div class="agent-result-head">
          <div class="agent-result-title">Smart Parse резултат</div>
          <div class="agent-result-meta">${extracted.length} символа</div>
        </div>
        ${renderParsedSummaryHtml(parsed, { includeTitle: true, emptyText: 'Няма smart parse още.' })}
        <details class="raw-text-details" open>
          <summary>Суров OCR / PDF текст</summary>
          <div class="agent-result-body">${escHtml(summarizeExtractedText(extracted, 2600))}</div>
        </details>`;
    } else {
      resultPanel.style.display = 'block';
      resultPanel.innerHTML = `<div class="agent-result-empty">Няма извлечен текст още. Стартирай „Извади текст" или „Smart Parse“ отдолу.</div>`;
    }
  }

  document.querySelectorAll('.agent-action-card').forEach(card => {
    card.addEventListener('click', () => {
      handleAgentAction(card.dataset.action, card.dataset.docid);
    });
  });
}

function buildAgentActions(doc) {
  const actions = [];

  actions.push({
    action: 'preview',
    icon: '👁',
    title: 'Преглед на документа',
    desc:  'Виж пълна информация и preview'
  });

  if (!doc.folderId && state.folders.length > 0) {
    actions.push({
      action: 'move',
      icon: '📂',
      title: 'Добави в папка',
      desc:  'Документът все още не е в папка'
    });
  }

  if (doc.status === 'pending') {
    actions.push({
      action: 'mark-saved',
      icon: '✅',
      title: 'Маркирай като готов',
      desc:  'Документът е прегледан'
    });
  } else {
    actions.push({
      action: 'mark-pending',
      icon: '⏳',
      title: 'Маркирай за преглед',
      desc:  'Нуждае се от внимание'
    });
  }

  if (doc.institution) {
    actions.push({
      action: 'info-inst',
      icon:   '🏛️',
      title: `Документ от: ${doc.institution}`,
      desc:  doc.detectedYear ? `Година: ${doc.detectedYear}` : 'Виж детайли'
    });
  }

  if ((doc.confidence||0) < 40) {
    actions.push({
      action: 'low-confidence',
      icon: '⚠️',
      title: 'Ниска увереност при анализа',
      desc:  'Провери и редактирай информацията ръчно'
    });
  }

  if (doc.blobKey && (doc.previewType === 'image' || doc.previewType === 'pdf')) {
    actions.push({
      action: 'extract-text',
      icon: doc.previewType === 'pdf' ? '📑' : '🧠',
      title: doc.previewType === 'pdf' ? 'Извади текст от PDF' : 'OCR анализ на изображение',
      desc: doc.previewType === 'pdf' ? 'Взима текст с PDF.js от първите страници' : 'Използва Tesseract OCR върху снимката'
    });
  }

  if (doc.extractedText) {
    actions.push({
      action: 'smart-parse',
      icon: '✨',
      title: 'Умен анализ / Полета',
      desc: 'Подрежда име, телефон, email, адрес, тип и заглавие'
    });
  }

  actions.push({
    action: 'edit-fields',
    icon: '🧩',
    title: 'Полета',
    desc: 'Ръчно редактирай и потвърди truth layer'
  });

  actions.push({
    action: 'delete',
    icon: '🗑',
    title: 'Изтрий документа',
    desc:  'Действието е необратимо'
  });

  return actions;
}

async function handleAgentAction(action, docId) {
  const doc = state.documents.find(d => d.id === docId);
  if (!doc) return;

  if (action === 'preview')       { openDocPreview(docId); }
  else if (action === 'move')     { openMoveSheet(docId); }
  else if (action === 'mark-saved') {
    doc.status = 'saved';
    saveState();
    renderAgentForDoc(docId);
    showToast('✅ Маркиран като готов');
  }
  else if (action === 'mark-pending') {
    doc.status = 'pending';
    saveState();
    renderAgentForDoc(docId);
    showToast('⏳ Маркиран за преглед');
  }
  else if (action === 'extract-text') {
    await extractTextForDoc(docId);
  }
  else if (action === 'smart-parse') {
    await smartParseDocById(docId);
  }
  else if (action === 'edit-fields') {
    await openStructuredFieldEditor(docId, 'agent');
  }
  else if (action === 'delete') {
    openConfirm('Изтрий документ', `Сигурен ли си, че искаш да изтриеш "${doc.title}"?`, async () => {
      state.documents = state.documents.filter(d => d.id !== docId);
      saveState();
      await deleteBlobIfOrphaned(doc.blobKey, { excludeDocId: docId });
      await refreshStorageEstimate(true);
      renderAgentTab();
      renderDashboard();
      renderMoreTab();
      showToast('🗑 Изтрит');
    });
  }
  else if (action === 'low-confidence' || action === 'info-inst') {
    openDocPreview(docId);
  }
}

/* ═══════════════════════════════════════════════
   17. MORE / SETTINGS TAB
═══════════════════════════════════════════════ */

function renderMoreTab() {
  renderThemeGrid();
  renderStorageInfo();
  document.getElementById('settingsDocCount').textContent    = state.documents.length;
  document.getElementById('settingsFolderCount').textContent = state.folders.length;
  renderQuickLinks();
  updatePwaStatusUi();
}

function renderStorageInfo() {
  try {
    const metrics = getStorageMetrics();
    const fill = document.getElementById('storageBarFill');
    const usedEl = document.getElementById('storageUsed');
    const totalEl = document.getElementById('storageTotal');
    if (fill) fill.style.width = `${metrics.localPct.toFixed(1)}%`;
    if (usedEl) usedEl.textContent = `Реално: ${formatBytes(metrics.usedBytes)}`;
    if (totalEl) totalEl.textContent = `Лимит: ${formatBytes(metrics.localBudgetBytes)}`;
  } catch(e) {}
}

/* ═══════════════════════════════════════════════
   SMART LINKS ENGINE — 100+ сайта
═══════════════════════════════════════════════ */
const KNOWN_SITES = {
  // 🔍 Търсене
  'google.com':{n:'Google',c:'🔍 Търсене',d:'Търсачка. Пишеш каквото искаш — намира отговора.'},
  'google.de':{n:'Google DE',c:'🔍 Търсене',d:'Немският Google. Търсиш на немски.'},
  'bing.com':{n:'Bing',c:'🔍 Търсене',d:'Търсачка на Microsoft. Алтернатива на Google.'},
  'duckduckgo.com':{n:'DuckDuckGo',c:'🔍 Търсене',d:'Търсачка без следене. По-лично.'},
  // 📱 Социални
  'facebook.com':{n:'Facebook',c:'📱 Социални',d:'Пишеш на приятели, гледаш постове, групи.'},
  'instagram.com':{n:'Instagram',c:'📱 Социални',d:'Снимки и видеа. Качваш, гледаш, следиш хора.'},
  'tiktok.com':{n:'TikTok',c:'📱 Социални',d:'Кратки смешни видеа. Скролваш безкрайно.'},
  'twitter.com':{n:'X (Twitter)',c:'📱 Социални',d:'Кратки постове и новини в реално време.'},
  'x.com':{n:'X (Twitter)',c:'📱 Социални',d:'Кратки постове и новини в реално време.'},
  'linkedin.com':{n:'LinkedIn',c:'📱 Социални',d:'Професионална мрежа. Търсиш работа, контакти.'},
  'reddit.com':{n:'Reddit',c:'📱 Социални',d:'Форуми по теми. Питаш, четеш, дискутираш.'},
  'pinterest.com':{n:'Pinterest',c:'📱 Социални',d:'Снимки за вдъхновение. Идеи за дом, мода, храна.'},
  'snapchat.com':{n:'Snapchat',c:'📱 Социални',d:'Снимки и видеа които изчезват.'},
  'threads.net':{n:'Threads',c:'📱 Социални',d:'Текстова мрежа на Meta. Като Twitter.'},
  // 💬 Чат
  'whatsapp.com':{n:'WhatsApp',c:'💬 Чат',d:'Пишеш и се обаждаш безплатно. Най-популярният чат.'},
  'telegram.org':{n:'Telegram',c:'💬 Чат',d:'Бърз чат. Съобщения, файлове, канали.'},
  'web.telegram.org':{n:'Telegram Web',c:'💬 Чат',d:'Telegram в браузъра.'},
  'discord.com':{n:'Discord',c:'💬 Чат',d:'Чат сървъри. За геймъри и общности.'},
  'signal.org':{n:'Signal',c:'💬 Чат',d:'Криптиран чат. Най-сигурният месинджър.'},
  'viber.com':{n:'Viber',c:'💬 Чат',d:'Чат и обаждания. Популярен в България.'},
  'zoom.us':{n:'Zoom',c:'💬 Чат',d:'Видео разговори. За срещи и обаждания.'},
  'meet.google.com':{n:'Google Meet',c:'💬 Чат',d:'Видео разговори от Google. Безплатно.'},
  // 📧 Поща
  'gmail.com':{n:'Gmail',c:'📧 Поща',d:'Имейл от Google. Получаваш и пращаш писма.'},
  'mail.google.com':{n:'Gmail',c:'📧 Поща',d:'Имейл от Google.'},
  'outlook.com':{n:'Outlook',c:'📧 Поща',d:'Имейл от Microsoft. За работа или лично.'},
  'mail.bg':{n:'Mail.bg',c:'📧 Поща',d:'Български безплатен имейл.'},
  'abv.bg':{n:'ABV',c:'📧 Поща',d:'Български имейл и новини.'},
  'proton.me':{n:'Proton Mail',c:'📧 Поща',d:'Криптиран имейл. Никой не чете писмата ти.'},
  // ▶️ Видео
  'youtube.com':{n:'YouTube',c:'▶️ Видео',d:'Видео платформа. Гледаш всичко — клипове, музика, уроци.'},
  'netflix.com':{n:'Netflix',c:'▶️ Видео',d:'Филми и сериали с абонамент.'},
  'disneyplus.com':{n:'Disney+',c:'▶️ Видео',d:'Disney, Marvel, Star Wars филми.'},
  'hbomax.com':{n:'HBO Max',c:'▶️ Видео',d:'Филми и сериали на HBO.'},
  'primevideo.com':{n:'Prime Video',c:'▶️ Видео',d:'Филми и сериали от Amazon.'},
  'twitch.tv':{n:'Twitch',c:'▶️ Видео',d:'Стрийминг на живо. Гледаш геймъри.'},
  'vimeo.com':{n:'Vimeo',c:'▶️ Видео',d:'Качествени видеа. За творци.'},
  // 🎧 Музика
  'spotify.com':{n:'Spotify',c:'🎧 Музика',d:'Музика. Милиони песни безплатно или с абонамент.'},
  'music.apple.com':{n:'Apple Music',c:'🎧 Музика',d:'Музика от Apple. С абонамент.'},
  'soundcloud.com':{n:'SoundCloud',c:'🎧 Музика',d:'Музика от независими артисти.'},
  'deezer.com':{n:'Deezer',c:'🎧 Музика',d:'Музикален стрийминг. Алтернатива на Spotify.'},
  // 🛒 Магазин
  'amazon.de':{n:'Amazon DE',c:'🛒 Магазин',d:'Най-големият онлайн магазин. Купуваш всичко.'},
  'amazon.com':{n:'Amazon',c:'🛒 Магазин',d:'Най-големият онлайн магазин в света.'},
  'ebay.de':{n:'eBay DE',c:'🛒 Магазин',d:'Купуваш и продаваш нови и втора ръка неща.'},
  'ebay.com':{n:'eBay',c:'🛒 Магазин',d:'Купуваш и продаваш от хора по света.'},
  'olx.bg':{n:'OLX',c:'🛒 Магазин',d:'Български обяви. Купуваш от хора.'},
  'emag.bg':{n:'eMAG',c:'🛒 Магазин',d:'Български онлайн магазин. Електроника, дом.'},
  'aliexpress.com':{n:'AliExpress',c:'🛒 Магазин',d:'Евтини неща от Китай. Бавна доставка.'},
  'etsy.com':{n:'Etsy',c:'🛒 Магазин',d:'Ръчно изработени и уникални неща.'},
  'zalando.de':{n:'Zalando',c:'🛒 Магазин',d:'Дрехи и обувки онлайн. Безплатно връщане.'},
  'aboutyou.de':{n:'About You',c:'🛒 Магазин',d:'Мода онлайн. Дрехи, обувки, аксесоари.'},
  'ikea.com':{n:'IKEA',c:'🛒 Магазин',d:'Мебели и декор за дома. Евтино и модерно.'},
  'lidl.de':{n:'Lidl',c:'🛒 Магазин',d:'Супермаркет. Оферти и продукти.'},
  // 💳 Пари
  'paypal.com':{n:'PayPal',c:'💳 Пари',d:'Онлайн портфейл. Плащаш и получаваш безопасно.'},
  'revolut.com':{n:'Revolut',c:'💳 Пари',d:'Дигитална банка. Карта, преводи, крипто.'},
  'wise.com':{n:'Wise',c:'💳 Пари',d:'Евтини международни преводи.'},
  'n26.com':{n:'N26',c:'💳 Пари',d:'Немска онлайн банка. Безплатна сметка.'},
  'binance.com':{n:'Binance',c:'💳 Пари',d:'Криптовалути. Купуваш и продаваш Bitcoin.'},
  'coinbase.com':{n:'Coinbase',c:'💳 Пари',d:'Криптовалути за начинаещи.'},
  // 🏛️ Държавни
  'nap.bg':{n:'НАП',c:'🏛️ Държавни',d:'Данъчна агенция. Подаваш декларации, плащаш данъци.'},
  'noi.bg':{n:'НОИ',c:'🏛️ Държавни',d:'Осигуряване. Пенсии, болнични, майчинство.'},
  'nzok.bg':{n:'НЗОК',c:'🏛️ Държавни',d:'Здравна каса. Здравни осигуровки.'},
  'egov.bg':{n:'eGov',c:'🏛️ Държавни',d:'Електронно правителство на България.'},
  'mfa.bg':{n:'МВнР',c:'🏛️ Държавни',d:'Министерство на външните работи. Паспорти.'},
  'mvr.bg':{n:'МВР',c:'🏛️ Държавни',d:'Лични карти, шофьорски книжки, адресна.'},
  'arbeitsagentur.de':{n:'Arbeitsagentur',c:'🏛️ Държавни',d:'Немска агенция по заетостта. Работа, помощи.'},
  'elster.de':{n:'ELSTER',c:'🏛️ Държавни',d:'Немски данъци онлайн. Подаваш Steuererklärung.'},
  // 🗺️ Карти и пътуване
  'maps.google.com':{n:'Google Maps',c:'🗺️ Пътуване',d:'Карта и навигация. Показва пътя.'},
  'booking.com':{n:'Booking',c:'🗺️ Пътуване',d:'Резервираш хотели за почивка.'},
  'airbnb.com':{n:'Airbnb',c:'🗺️ Пътуване',d:'Наемаш квартири от хора по света.'},
  'flixbus.de':{n:'FlixBus',c:'🗺️ Пътуване',d:'Евтини автобуси из Европа.'},
  'skyscanner.com':{n:'Skyscanner',c:'🗺️ Пътуване',d:'Сравняваш цени на самолетни билети.'},
  'ryanair.com':{n:'Ryanair',c:'🗺️ Пътуване',d:'Евтини полети из Европа.'},
  'bahn.de':{n:'Deutsche Bahn',c:'🗺️ Пътуване',d:'Немски влакове. Разписания и билети.'},
  // 🤖 AI
  'claude.ai':{n:'Claude',c:'🤖 AI',d:'Умен AI асистент от Anthropic. Питаш каквото искаш.'},
  'chatgpt.com':{n:'ChatGPT',c:'🤖 AI',d:'AI чатбот от OpenAI. Отговаря на въпроси.'},
  'chat.openai.com':{n:'ChatGPT',c:'🤖 AI',d:'AI чатбот от OpenAI.'},
  'gemini.google.com':{n:'Gemini',c:'🤖 AI',d:'AI на Google. Търси и създава.'},
  'perplexity.ai':{n:'Perplexity',c:'🤖 AI',d:'AI търсачка. Дава отговори с източници.'},
  'midjourney.com':{n:'Midjourney',c:'🤖 AI',d:'AI генерира картинки от текст.'},
  'copilot.microsoft.com':{n:'Copilot',c:'🤖 AI',d:'AI асистент на Microsoft.'},
  'poe.com':{n:'Poe',c:'🤖 AI',d:'Много AI модела на едно място.'},
  'huggingface.co':{n:'Hugging Face',c:'🤖 AI',d:'AI модели и datasets. За разработчици.'},
  'replicate.com':{n:'Replicate',c:'🤖 AI',d:'Пускаш AI модели в облака.'},
  'runway.ml':{n:'Runway',c:'🤖 AI',d:'AI за видео. Генерира и редактира клипове.'},
  'elevenlabs.io':{n:'ElevenLabs',c:'🤖 AI',d:'AI гласове. Превръща текст в реч.'},
  'suno.com':{n:'Suno',c:'🤖 AI',d:'AI генерира музика от текст.'},
  // 💻 Програмиране
  'github.com':{n:'GitHub',c:'💻 Dev Tools',d:'Код и проекти. Програмисти споделят код.'},
  'gitlab.com':{n:'GitLab',c:'💻 Dev Tools',d:'Код хостинг. Алтернатива на GitHub.'},
  'stackoverflow.com':{n:'Stack Overflow',c:'💻 Dev Tools',d:'Въпроси и отговори за програмисти.'},
  'vercel.com':{n:'Vercel',c:'💻 Dev Tools',d:'Хостинг за сайтове. Качваш и работи.'},
  'netlify.com':{n:'Netlify',c:'💻 Dev Tools',d:'Хостинг за сайтове. Безплатен план.'},
  'supabase.com':{n:'Supabase',c:'💻 Dev Tools',d:'База данни + Auth + Storage. Безплатен Firebase алтернатива.'},
  'firebase.google.com':{n:'Firebase',c:'💻 Dev Tools',d:'Backend на Google. База данни, хостинг, push.'},
  'cloudflare.com':{n:'Cloudflare',c:'💻 Dev Tools',d:'CDN и защита на сайтове. Прави ги бързи.'},
  'digitalocean.com':{n:'DigitalOcean',c:'💻 Dev Tools',d:'Облачни сървъри. Евтино хостване.'},
  'aws.amazon.com':{n:'AWS',c:'💻 Dev Tools',d:'Облакът на Amazon. Сървъри, бази данни.'},
  'render.com':{n:'Render',c:'💻 Dev Tools',d:'Хостинг за apps. Просто и евтино.'},
  'railway.app':{n:'Railway',c:'💻 Dev Tools',d:'Хостинг за backend apps. Deploy за секунди.'},
  'replit.com':{n:'Replit',c:'💻 Dev Tools',d:'Програмираш в браузъра. Без инсталиране.'},
  'codepen.io':{n:'CodePen',c:'💻 Dev Tools',d:'Тестваш HTML/CSS/JS код онлайн.'},
  'figma.com':{n:'Figma',c:'💻 Dev Tools',d:'Дизайн на интерфейси. За дизайнери.'},
  'canva.com':{n:'Canva',c:'🔧 Инструменти',d:'Правиш постери, презентации, банери лесно.'},
  'notion.so':{n:'Notion',c:'🔧 Инструменти',d:'Бележки, планиране, документи. Всичко в едно.'},
  'trello.com':{n:'Trello',c:'🔧 Инструменти',d:'Задачи с карточки. Организираш работата.'},
  'airtable.com':{n:'Airtable',c:'🔧 Инструменти',d:'Таблици + база данни. Като умен Excel.'},
  'stripe.com':{n:'Stripe',c:'💻 Dev Tools',d:'Плащания онлайн за бизнес. API за пари.'},
  'npm.js.com':{n:'npm',c:'💻 Dev Tools',d:'Пакети за JavaScript програмисти.'},
  // 🔧 Инструменти
  'translate.google.com':{n:'Google Translate',c:'🔧 Инструменти',d:'Преводач. Пишеш на един език — превежда.'},
  'deepl.com':{n:'DeepL',c:'🔧 Инструменти',d:'Най-добрият преводач. По-точен от Google.'},
  'drive.google.com':{n:'Google Drive',c:'🔧 Инструменти',d:'Файлове в облака. 15GB безплатно.'},
  'docs.google.com':{n:'Google Docs',c:'🔧 Инструменти',d:'Документи онлайн. Като Word, безплатно.'},
  'sheets.google.com':{n:'Google Sheets',c:'🔧 Инструменти',d:'Таблици онлайн. Като Excel, безплатно.'},
  'dropbox.com':{n:'Dropbox',c:'🔧 Инструменти',d:'Файлове в облака. Споделяш с хора.'},
  'wetransfer.com':{n:'WeTransfer',c:'🔧 Инструменти',d:'Пращаш големи файлове. До 2GB безплатно.'},
  // 📚 Знание
  'wikipedia.org':{n:'Wikipedia',c:'📚 Знание',d:'Енциклопедия. Информация за абсолютно всичко.'},
  'khanacademy.org':{n:'Khan Academy',c:'📚 Знание',d:'Безплатни уроци. Математика, наука, програмиране.'},
  'udemy.com':{n:'Udemy',c:'📚 Знание',d:'Онлайн курсове. Учиш каквото поискаш.'},
  'coursera.org':{n:'Coursera',c:'📚 Знание',d:'Курсове от университети. Сертификати.'},
  'duolingo.com':{n:'Duolingo',c:'📚 Знание',d:'Учиш езици безплатно. Като игра.'},
  // 🍎 Технологии
  'apple.com':{n:'Apple',c:'🍎 Технологии',d:'iPhone, Mac, iPad. Продукти и поддръжка.'},
  'samsung.com':{n:'Samsung',c:'🍎 Технологии',d:'Телефони, телевизори, техника.'},
  'microsoft.com':{n:'Microsoft',c:'🍎 Технологии',d:'Windows, Office, Teams. Софтуер за работа.'},
  // 🎮 Игри
  'store.steampowered.com':{n:'Steam',c:'🎮 Игри',d:'Магазин за PC игри. Купуваш и играеш.'},
  'epicgames.com':{n:'Epic Games',c:'🎮 Игри',d:'Безплатни игри всяка седмица. Fortnite.'},
  'roblox.com':{n:'Roblox',c:'🎮 Игри',d:'Онлайн игри за деца и тийнейджъри.'},
};

function detectSiteInfo(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const faviconUrl = 'https://www.google.com/s2/favicons?domain=' + hostname + '&sz=64';
    const parts = hostname.split('.');
    const candidates = [hostname];
    if (parts.length > 2) candidates.push(parts.slice(-2).join('.'));
    if (parts.length > 2) candidates.push(parts.slice(-3).join('.'));
    for (const key of candidates) {
      if (KNOWN_SITES[key]) {
        const s = KNOWN_SITES[key];
        return { name: s.n, desc: s.d, icon: '🌐', cat: s.c, favicon: faviconUrl, domain: hostname };
      }
    }
    const siteName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const tld = parts[parts.length - 1];
    let desc = 'Уебсайт', cat = '🌐 Други';
    if (tld === 'bg') { desc = 'Български уебсайт'; cat = '🇧🇬 Български'; }
    else if (tld === 'de') { desc = 'Немски уебсайт'; cat = '🇩🇪 Немски'; }
    else if (tld === 'org') { desc = 'Организация'; }
    else if (tld === 'gov') { desc = 'Държавен сайт'; cat = '🏛️ Държавни'; }
    else if (tld === 'edu') { desc = 'Образователен сайт'; cat = '📚 Знание'; }
    return { name: siteName, desc, icon: '🌐', cat, favicon: faviconUrl, domain: hostname };
  } catch {
    return { name: 'Връзка', desc: 'Уебсайт', icon: '🔗', cat: '🌐 Други', favicon: '', domain: '' };
  }
}

function renderQuickLinks() {
  const el = document.getElementById('quickLinksList');
  if (!el) return;
  if (!state.quickLinks.length) {
    el.innerHTML = '<div class="empty-sub">Добави сайтове с бутона + горе.</div>';
    return;
  }
  const groups = new Map();
  state.quickLinks.forEach(ql => {
    const info = detectSiteInfo(ql.url);
    const cat = info.cat || '🌐 Други';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push({ ql, info });
  });
  let html = '';
  groups.forEach((items, cat) => {
    html += '<div class="ql-cat-title">' + cat + '</div>';
    html += items.map(({ ql, info }) => `
      <a class="quick-link-item" href="${escHtml(ql.url)}" target="_blank" rel="noopener">
        <div class="quick-link-icon">
          ${info.favicon ? '<img src="'+info.favicon+'" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'\'"/>' : ''}
          <span class="ql-fallback" ${info.favicon ? 'style="display:none"' : ''}>${info.icon}</span>
        </div>
        <div class="quick-link-body">
          <div class="quick-link-name">${escHtml(ql.title || info.name)}</div>
          <div class="quick-link-desc">${escHtml(info.desc)}</div>
          ${ql.note ? '<div class="quick-link-note">📌 '+escHtml(ql.note)+'</div>' : ''}
        </div>
        <button class="quick-link-del" data-qlid="${ql.id}" onclick="event.preventDefault();event.stopPropagation();">✕</button>
      </a>
    `).join('');
  });
  el.innerHTML = html;
  el.querySelectorAll('.quick-link-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      state.quickLinks = state.quickLinks.filter(q => q.id !== btn.dataset.qlid);
      saveState(); renderMoreTab();
    });
  });
}

function syncViewportCssVars(reason = 'resize') {
  const vv = window.visualViewport;
  const widthCandidates = [
    vv?.width,
    window.innerWidth,
    document.documentElement?.clientWidth,
    document.body?.clientWidth
  ].filter(v => Number.isFinite(v) && v > 0);
  const heightCandidates = [
    vv?.height,
    window.innerHeight,
    document.documentElement?.clientHeight,
    document.body?.clientHeight
  ].filter(v => Number.isFinite(v) && v > 0);
  const width = Math.max(320, Math.round(Math.min(...(widthCandidates.length ? widthCandidates : [390]))));
  const overlayHeight = Math.max(320, Math.round(Math.min(...(heightCandidates.length ? heightCandidates : [844]))));
  const shellCandidate = Math.max(320, Math.round(Math.min(
    window.innerHeight || overlayHeight,
    document.documentElement.clientHeight || overlayHeight,
    overlayHeight
  )));
  const widthChanged = Math.abs(width - runtimeViewportWidth) > 2;
  const overlayChanged = Math.abs(overlayHeight - runtimeOverlayHeight) > 2;
  const majorShellShift = Math.abs(shellCandidate - runtimeShellHeight) > 72;

  if (!runtimeViewportWidth || widthChanged) {
    runtimeViewportWidth = width;
    document.documentElement.style.setProperty('--docos-vw', `${width}px`);
  }

  if (!runtimeOverlayHeight || overlayChanged || reason === 'init') {
    runtimeOverlayHeight = overlayHeight;
    document.documentElement.style.setProperty('--docos-vvh', `${overlayHeight}px`);
  }

  if (!runtimeShellHeight || reason === 'init' || reason === 'orientation' || majorShellShift || widthChanged) {
    runtimeShellHeight = shellCandidate;
    document.documentElement.style.setProperty('--docos-shell-h', `${shellCandidate}px`);
  }
}

function requestViewportCssSync(reason = 'resize') {
  if (runtimeViewportFrame) cancelAnimationFrame(runtimeViewportFrame);
  runtimeViewportFrame = requestAnimationFrame(() => {
    runtimeViewportFrame = null;
    syncViewportCssVars(reason);
  });
}

function initViewportCssSync() {
  if (runtimeViewportSyncBound) {
    requestViewportCssSync('resize');
    return;
  }
  runtimeViewportSyncBound = true;
  requestViewportCssSync('init');
  window.addEventListener('resize', () => requestViewportCssSync('resize'), { passive: true });
  window.addEventListener('orientationchange', () => requestViewportCssSync('orientation'), { passive: true });
  window.addEventListener('pageshow', () => requestViewportCssSync('resize'), { passive: true });
  if (window.visualViewport?.addEventListener) {
    window.visualViewport.addEventListener('resize', () => requestViewportCssSync('resize'), { passive: true });
  }
  document.addEventListener('focusin', () => window.setTimeout(() => requestViewportCssSync('resize'), 120), { passive: true });
  document.addEventListener('focusout', () => window.setTimeout(() => requestViewportCssSync('resize'), 180), { passive: true });
}

function forceHorizontalDriftClamp() {}
function requestHorizontalDriftClamp() {}
function initShellScrollStability() {}

function lockUiForSheet() {
  document.body.classList.add('docos-sheet-open');
  document.getElementById('app')?.classList.add('docos-sheet-open');
}

function unlockUiForSheet() {
  if (runtimeOpenSheets.size === 0) {
    document.body.classList.remove('docos-sheet-open');
    document.getElementById('app')?.classList.remove('docos-sheet-open');
  }
}

function bindBackdropScrollGuard(backdrop) {
  if (!backdrop || backdrop.dataset.scrollGuardBound === '1') return;
  backdrop.addEventListener('touchmove', ev => ev.preventDefault(), { passive: false });
  backdrop.dataset.scrollGuardBound = '1';
}

/* ═══════════════════════════════════════════════
   18. SHEET HELPERS
═══════════════════════════════════════════════ */

function showSheet(sheetId, backdropId) {
  const sheet = document.getElementById(sheetId);
  const backdrop = document.getElementById(backdropId);
  if (!sheet || !backdrop) return;
  bindBackdropScrollGuard(backdrop);
  runtimeOpenSheets.add(sheetId);
  lockUiForSheet();
  backdrop.style.display = 'block';
  sheet.style.display = 'block';
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');
    sheet.classList.add('is-open');
  });
}

function hideSheet(sheetId, backdropId) {
  closeSheet(sheetId, backdropId);
}

function closeSheet(sheetId, backdropId) {
  const sheet = document.getElementById(sheetId);
  const backdrop = document.getElementById(backdropId);
  if (!sheet && !backdrop) return;
  runtimeOpenSheets.delete(sheetId);
  if (sheet) sheet.classList.remove('is-open');
  if (backdrop) backdrop.classList.remove('is-open');
  window.setTimeout(() => {
    if (sheet) sheet.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    unlockUiForSheet();
  }, 220);
}

/* ═══════════════════════════════════════════════
   19. CONFIRM DIALOG
═══════════════════════════════════════════════ */

let confirmCallback = null;

function openConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  showSheet('confirmSheet', 'confirmBackdrop');
}

/* ═══════════════════════════════════════════════
   20. FOLDER CREATION
═══════════════════════════════════════════════ */

let selectedFolderEmoji = '📁';

function openFolderCreateSheet() {
  selectedFolderEmoji = '📁';
  document.getElementById('newFolderName').value = '';

  const picker = document.getElementById('folderEmojiPicker');
  picker.innerHTML = FOLDER_EMOJIS.map(e =>
    `<span class="emoji-opt ${e===selectedFolderEmoji?'selected':''}" data-emoji="${e}">${e}</span>`
  ).join('');
  picker.querySelectorAll('.emoji-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      selectedFolderEmoji = opt.dataset.emoji;
      picker.querySelectorAll('.emoji-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  showSheet('folderCreateSheet', 'folderCreateBackdrop');
}

function saveFolderCreate() {
  const name = document.getElementById('newFolderName').value.trim();
  if (!name) { showToast('⚠️ Въведи име на папката'); return; }

  state.folders.push({ id: uid(), name, icon: selectedFolderEmoji, createdAt: new Date().toISOString() });
  saveState();
  closeSheet('folderCreateSheet', 'folderCreateBackdrop');
  renderDocuments();
  renderDashboard();
  renderMoreTab();
  showToast('📁 Папката е създадена');
}

/* ═══════════════════════════════════════════════
   21. ESCAPE HTML
═══════════════════════════════════════════════ */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* ═══════════════════════════════════════════════
   22. EVENT LISTENERS
═══════════════════════════════════════════════ */

function initEventListeners() {
  document.addEventListener('pointerdown', primeDockAudio, { passive: true });


  // Bottom dock
  document.querySelectorAll('.dock-btn').forEach(btn => {
    btn.addEventListener('pointerdown', () => {
      pulseDockButton(btn, { sound: true, holdMs: btn.classList.contains('dock-center') ? 980 : 520 });
    }, { passive: true });
    btn.addEventListener('click', () => {
      pulseDockButton(btn, { sound: false, holdMs: btn.classList.contains('dock-center') ? 980 : 520 });
      if (btn.dataset.tab) showTab(btn.dataset.tab);
    });
  });

  // Folder back button
  document.getElementById('folderBackBtn')?.addEventListener('click', () => showTab('documents'));

  // Folder upload buttons (from folder detail)
  document.getElementById('folderUploadBtn')?.addEventListener('click', () => {
    document.getElementById('folderFileInput').click();
  });
  document.getElementById('folderCameraBtn')?.addEventListener('click', () => {
    document.getElementById('folderCameraInput').click();
  });

  // Folder file inputs (context = currentFolderId)
  document.getElementById('folderFileInput')?.addEventListener('change', (e) => {
    processBulkUpload(e.target.files, state.currentFolderId);
    e.target.value = '';
  });
  document.getElementById('folderCameraInput')?.addEventListener('change', (e) => {
    processBulkUpload(e.target.files, state.currentFolderId);
    e.target.value = '';
  });

  // Scan tab buttons
  document.getElementById('scanUploadBtn')?.addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('scanCameraBtn')?.addEventListener('click', () => document.getElementById('cameraInput').click());
  document.getElementById('scanImportBtn')?.addEventListener('click', () => {
    showToast('🌐 Импорт от URL — скоро');
  });

  // Generic file inputs (no folder context)
  document.getElementById('fileInput')?.addEventListener('change', (e) => {
    processBulkUpload(e.target.files, null);
    e.target.value = '';
  });
  document.getElementById('cameraInput')?.addEventListener('change', (e) => {
    processBulkUpload(e.target.files, null);
    e.target.value = '';
  });

  // Intake sheet
  document.getElementById('intakeSaveBtn')?.addEventListener('click', saveIntakeSheet);
  document.getElementById('intakeCancelBtn')?.addEventListener('click', closeIntakeSheet);
  document.getElementById('intakeBackdrop')?.addEventListener('click', closeIntakeSheet);

  // Preview sheet actions
  document.getElementById('previewMarkBtn')?.addEventListener('click', () => {
    const doc = state.documents.find(d => d.id === currentPreviewDocId);
    if (!doc) return;
    doc.status = doc.status === 'pending' ? 'saved' : 'pending';
    saveState();
    closePreviewSheet();
    if (state.currentFolderId) renderFolderDetail();
    else if (state.currentTab === 'documents') renderDocuments();
    else renderDashboard();
    showToast(doc.status === 'pending' ? '⏳ Маркиран за преглед' : '✅ Маркиран като готов');
  });
  document.getElementById('previewMoveBtn')?.addEventListener('click', () => {
    if (currentPreviewDocId) openMoveSheet(currentPreviewDocId);
  });
  document.getElementById('previewDownloadBtn')?.addEventListener('click', () => {
    const doc = state.documents.find(d => d.id === currentPreviewDocId);
    if (doc) downloadOriginalFile(doc);
  });
  document.getElementById('previewDeleteBtn')?.addEventListener('click', () => {
    const docId = currentPreviewDocId;
    const doc   = state.documents.find(d => d.id === docId);
    if (!doc) return;
    openConfirm('Изтрий документ', `Изтрий "${doc.title}"?`, () => {
      state.documents = state.documents.filter(d => d.id !== docId);
      saveState();
      deleteBlobIfOrphaned(doc.blobKey, { excludeDocId: docId }).catch(()=>{});
      refreshStorageEstimate(true).catch(()=>{});
      closePreviewSheet();
      renderDashboard();
      renderMoreTab();
      if (state.currentFolderId) renderFolderDetail();
      else if (state.currentTab === 'documents') renderDocuments();
      else renderDashboard();
      showToast('🗑 Документът е изтрит');
    });
  });
  document.getElementById('previewBackdrop')?.addEventListener('click', closePreviewSheet);

  // Move sheet
  document.getElementById('moveCancelBtn')?.addEventListener('click', () => closeSheet('moveSheet','moveBackdrop'));
  document.getElementById('moveBackdrop')?.addEventListener('click', () => closeSheet('moveSheet','moveBackdrop'));

  // Structured field editor
  document.getElementById('fieldEditorCancelBtn')?.addEventListener('click', closeStructuredFieldEditor);
  document.getElementById('fieldEditorSaveBtn')?.addEventListener('click', () => saveStructuredFieldEditor({ forceConfirm: false }));
  document.getElementById('fieldEditorConfirmBtn')?.addEventListener('click', () => saveStructuredFieldEditor({ forceConfirm: true }));
  document.getElementById('fieldEditorBackdrop')?.addEventListener('click', closeStructuredFieldEditor);

  // Create folder
  document.getElementById('createFolderBtn')?.addEventListener('click', openFolderCreateSheet);
  document.getElementById('folderCreateSaveBtn')?.addEventListener('click', saveFolderCreate);
  document.getElementById('folderCreateCancelBtn')?.addEventListener('click', () => closeSheet('folderCreateSheet','folderCreateBackdrop'));
  document.getElementById('folderCreateBackdrop')?.addEventListener('click', () => closeSheet('folderCreateSheet','folderCreateBackdrop'));

  // Термини
  initDeadlineColorRow();
  refreshReminderHint();
  document.getElementById('addDeadlineBtn')?.addEventListener('click', () => openTodayDeadlineComposer());
  document.getElementById('deadlineSaveBtn')?.addEventListener('click', saveDeadlineFromSheet);
  document.getElementById('deadlineDeleteBtn')?.addEventListener('click', deleteDeadlineFromSheet);
  document.getElementById('deadlineCancelBtn')?.addEventListener('click', closeDeadlineSheet);
  document.getElementById('deadlineBackdrop')?.addEventListener('click', closeDeadlineSheet);
  document.getElementById('deadlineDate')?.addEventListener('change', (e) => {
    document.getElementById('deadlineSelectedDateLabel').textContent = formatDate(e.target.value);
    renderDeadlineDayList(e.target.value, document.getElementById('deadlineEditId')?.value || '');
    renderCalendar();
  });
  document.getElementById('deadlineNotifPermissionBtn')?.addEventListener('click', () => requestReminderPermission());
  document.getElementById('deadlineReminderEnabled')?.addEventListener('change', refreshReminderHint);

  // Quick link
  document.getElementById('addQuickLinkBtn')?.addEventListener('click', () => {
    document.getElementById('quickLinkTitle').value = '';
    document.getElementById('quickLinkUrl').value = '';
    const noteEl = document.getElementById('quickLinkNote');
    if (noteEl) noteEl.value = '';
    const preview = document.getElementById('qlPreviewCard');
    if (preview) preview.style.display = 'none';
    showSheet('quickLinkSheet','quickLinkBackdrop');
  });
  // Auto-detect on URL input
  let qlTimer = null;
  document.getElementById('quickLinkUrl')?.addEventListener('input', (e) => {
    clearTimeout(qlTimer);
    qlTimer = setTimeout(() => {
      const url = e.target.value.trim();
      const preview = document.getElementById('qlPreviewCard');
      if (!url || !url.includes('.')) { if (preview) preview.style.display = 'none'; return; }
      const safeUrl = url.startsWith('http') ? url : 'https://' + url;
      try {
        const info = detectSiteInfo(safeUrl);
        if (preview) preview.style.display = 'flex';
        const iconEl = document.getElementById('qlPreviewIcon');
        if (iconEl) iconEl.src = info.favicon || '';
        const nameEl = document.getElementById('qlPreviewName');
        if (nameEl) nameEl.textContent = info.name;
        const descEl = document.getElementById('qlPreviewDesc');
        if (descEl) descEl.textContent = info.desc;
        const titleEl = document.getElementById('quickLinkTitle');
        if (titleEl && !titleEl.value.trim()) titleEl.value = info.name;
      } catch { if (preview) preview.style.display = 'none'; }
    }, 400);
  });
  document.getElementById('quickLinkSaveBtn')?.addEventListener('click', () => {
    let url = document.getElementById('quickLinkUrl').value.trim();
    if (!url) { showToast('Въведи URL'); return; }
    if (!url.startsWith('http')) url = 'https://' + url;
    const info = detectSiteInfo(url);
    const title = document.getElementById('quickLinkTitle').value.trim() || info.name;
    const note = document.getElementById('quickLinkNote')?.value.trim() || '';
    state.quickLinks.push({ id: uid(), title, url, note });
    saveState();
    closeSheet('quickLinkSheet','quickLinkBackdrop');
    renderMoreTab(); renderDashboard();
    showToast('✅ ' + info.name + ' добавен');
  });
  document.getElementById('quickLinkCancelBtn')?.addEventListener('click', () => closeSheet('quickLinkSheet','quickLinkBackdrop'));
  document.getElementById('quickLinkBackdrop')?.addEventListener('click', () => closeSheet('quickLinkSheet','quickLinkBackdrop'));

  // Confirm dialog
  document.getElementById('confirmOkBtn')?.addEventListener('click', () => {
    closeSheet('confirmSheet','confirmBackdrop');
    if (typeof confirmCallback === 'function') { confirmCallback(); confirmCallback = null; }
  });
  document.getElementById('confirmCancelBtn')?.addEventListener('click', () => {
    closeSheet('confirmSheet','confirmBackdrop');
    confirmCallback = null;
  });
  document.getElementById('confirmBackdrop')?.addEventListener('click', () => {
    closeSheet('confirmSheet','confirmBackdrop');
    confirmCallback = null;
  });

  // Theme toggle (topbar)
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    showTab('more');
    setTimeout(() => {
      const themeAnchor = document.getElementById('themeSection') || document.getElementById('themeGrid');
      themeAnchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  });

  // Dashboard quick actions
  document.getElementById('dashQuickUploadBtn')?.addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('dashQuickCameraBtn')?.addEventListener('click', () => document.getElementById('cameraInput').click());
  document.getElementById('dashQuickFolderBtn')?.addEventListener('click', openFolderCreateSheet);
  document.getElementById('dashQuickAgentBtn')?.addEventListener('click', () => showTab('agent'));
  document.getElementById('dashQuickDeadlineBtn')?.addEventListener('click', () => openTodayDeadlineComposer());
  document.getElementById('dashQuickLinksBtn')?.addEventListener('click', () => {
    showTab('more');
    setTimeout(() => document.getElementById('addQuickLinkBtn')?.click(), 120);
  });
  document.getElementById('dashFoldersOpenBtn')?.addEventListener('click', () => showTab('documents'));
  document.getElementById('dashGoScanBtn')?.addEventListener('click', () => showTab('scan'));

  // Persist storage button
  document.getElementById('dashPersistBtn')?.addEventListener('click', async () => {
    const granted = await requestPersistentStorageIfAvailable();
    if (granted) {
      showToast('✅ Паметта е защитена');
    } else {
      showToast('⚠ Браузърът отказа — опитай от PWA');
    }
    await refreshDashboardTruth(true);
    renderDashboard();
  });

  // Dashboard view all
  document.getElementById('dashViewAllBtn')?.addEventListener('click', () => showTab('documents'));

  // Documents — search
  document.getElementById('docSearch')?.addEventListener('input', (e) => {
    docSearch = e.target.value;
    renderDocList();
  });

  // Documents — filter chips
  document.getElementById('docFilterRow')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('#docFilterRow .filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    docFilter = chip.dataset.filter;
    docDuplicatesOnly = docFilter === 'duplicates';
    renderDocList();
  });

  document.getElementById('docTypeFilter')?.addEventListener('change', (e) => {
    docTypeFilter = e.target.value || 'all';
    renderDocList();
  });
  document.getElementById('docFolderFilter')?.addEventListener('change', (e) => {
    docFolderFilter = e.target.value || 'all';
    renderDocList();
  });
  document.getElementById('docTagFilter')?.addEventListener('change', (e) => {
    docTagFilters = [...e.target.selectedOptions].map(opt => opt.value).filter(Boolean);
    renderDocList();
  });
  document.getElementById('docClearFiltersBtn')?.addEventListener('click', () => {
    docSearch = '';
    docFilter = 'all';
    docTypeFilter = 'all';
    docFolderFilter = 'all';
    docTagFilters = [];
    docDuplicatesOnly = false;
    const search = document.getElementById('docSearch');
    if (search) search.value = '';
    document.querySelectorAll('#docFilterRow .filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
    populateAdvancedFilterOptions();
    renderDocList();
  });

  // Documents — sort
  document.getElementById('docSortSelect')?.addEventListener('change', (e) => {
    docSort = e.target.value;
    renderDocList();
  });

  // Documents — view toggle (list/gallery)
  document.getElementById('docViewToggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-toggle-btn');
    if (!btn) return;
    docViewMode = btn.dataset.view || 'list';
    document.querySelectorAll('#docViewToggle .view-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderDocList();
  });

  // Agent — doc select
  document.getElementById('agentDocSelect')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) renderAgentForDoc(val);
    else {
      document.getElementById('agentDocPanel').style.display     = 'none';
      document.getElementById('agentActionsPanel').style.display = 'none';
      document.getElementById('agentResultPanel').style.display  = 'none';
      document.getElementById('agentEmptyState').style.display   = 'flex';
    }
  });

  document.getElementById('exportBackupBtn')?.addEventListener('click', () => {
    exportBackupZip();
  });
  document.getElementById('importBackupBtn')?.addEventListener('click', () => {
    document.getElementById('backupImportInput')?.click();
  });
  document.getElementById('backupImportInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    openConfirm('Внеси архив ZIP', 'Това ще замени текущите документи и файлове. Продължи?', () => {
      importBackupZip(file);
    });
    e.target.value = '';
  });

  // Settings — clear data
  document.getElementById('clearDataBtn')?.addEventListener('click', () => {
    openConfirm('Изчисти данни', 'Всички документи, папки и настройки ще бъдат изтрити. Продължи?', async () => {
      const theme = state.theme;
      state = {
        folders: [], documents: [], deadlines: [], alerts: [], quickLinks: [],
        theme, currentTab: 'dashboard', currentFolderId: null,
        intakeQueue: [], _version: 3
      };
      runtimeRetryFiles.clear();
      runtimeBatchSummary = null;
      runtimeBatchBusy = false;
      releaseAllRuntimeObjectUrls();
      try { localStorage.removeItem(LS_KEY); } catch {}
      try { sessionStorage.removeItem(LS_KEY); } catch {}
      await clearAssetStore().catch(()=>{});
      await deleteAssetDatabase().catch(()=>false);
      await clearOriginCachesBestEffort().catch(()=>{});
      await openAssetDb().catch(()=>{});
      saveState();
      await refreshStorageEstimate(true).catch(()=>{});
      await refreshRuntimeCacheTruth().catch(() => {});
      renderScanTab();
      renderDocumentsTab();
      renderDashboard();
      renderMoreTab();
      showTab('dashboard');
      showToast('🗑 Данните са изчистени');
    });
  });

  // Известия
  document.getElementById('notifBtn')?.addEventListener('click', () => showAlertsSheet());
  document.getElementById('alertsCloseBtn')?.addEventListener('click', () => closeSheet('alertsSheet','alertsBackdrop'));
  document.getElementById('alertsBackdrop')?.addEventListener('click', () => closeSheet('alertsSheet','alertsBackdrop'));

  // PWA / Home Screen
  document.getElementById('pwaHelpBtn')?.addEventListener('click', openPwaHelpSheet);
  document.getElementById('pwaEnableNotifBtn')?.addEventListener('click', () => requestReminderPermission());
  document.getElementById('pwaHelpCloseBtn')?.addEventListener('click', () => closeSheet('pwaHelpSheet','pwaHelpBackdrop'));
  document.getElementById('pwaHelpBackdrop')?.addEventListener('click', () => closeSheet('pwaHelpSheet','pwaHelpBackdrop'));
}

/* ═══════════════════════════════════════════════
   20. FULLSCREEN GALLERY VIEWER
═══════════════════════════════════════════════ */

const galleryState = {
  items: [],       // { id, title, blobKey, previewDataUrl, fileName, fileSize }
  currentIndex: 0,
  open: false
};

async function openGalleryViewer(docId, contextDocs = null) {
  // Build gallery items from context or all images
  let imageDocs = contextDocs || state.documents.filter(d => d.previewType === 'image');
  imageDocs = imageDocs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!imageDocs.length) return;

  galleryState.items = imageDocs.map(d => ({
    id: d.id,
    title: d.title || d.originalFileName || 'Снимка',
    blobKey: d.blobKey,
    previewDataUrl: d.previewDataUrl || '',
    fileName: d.originalFileName || '',
    fileSize: d.fileSize || 0
  }));

  const idx = galleryState.items.findIndex(i => i.id === docId);
  galleryState.currentIndex = idx >= 0 ? idx : 0;
  galleryState.open = true;

  const viewer = document.getElementById('galleryViewer');
  if (viewer) viewer.style.display = 'flex';

  await galleryShowCurrent();
  initGallerySwipe();
}

function closeGalleryViewer() {
  galleryState.open = false;
  const viewer = document.getElementById('galleryViewer');
  if (viewer) viewer.style.display = 'none';
}

async function galleryShowCurrent() {
  const item = galleryState.items[galleryState.currentIndex];
  if (!item) return;

  const img = document.getElementById('galleryViewerImg');
  const counter = document.getElementById('galleryViewerCounter');
  const info = document.getElementById('galleryViewerInfo');
  const bg = document.getElementById('galleryViewerBg');
  const prevBtn = document.getElementById('galleryNavPrev');
  const nextBtn = document.getElementById('galleryNavNext');

  // Get full-size URL
  let url = '';
  if (item.blobKey) {
    url = await getObjectUrlForBlobKey(item.blobKey);
  }
  if (!url) url = item.previewDataUrl;

  if (img) {
    img.style.opacity = '0';
    img.src = url;
    img.onload = () => { img.style.opacity = '1'; };
  }

  if (bg) bg.style.backgroundImage = `url("${url}")`;
  if (counter) counter.textContent = `${galleryState.currentIndex + 1} / ${galleryState.items.length}`;
  if (info) {
    info.innerHTML = `
      <div class="gv-title">${escHtml(item.title)}</div>
      <div class="gv-meta">${item.fileName ? escHtml(item.fileName) : ''} ${item.fileSize ? '· ' + formatBytes(item.fileSize) : ''}</div>
    `;
  }

  // Show/hide nav buttons
  if (prevBtn) prevBtn.classList.toggle('hidden', galleryState.currentIndex <= 0);
  if (nextBtn) nextBtn.classList.toggle('hidden', galleryState.currentIndex >= galleryState.items.length - 1);
}

function galleryGoNext() {
  if (galleryState.currentIndex < galleryState.items.length - 1) {
    galleryState.currentIndex++;
    galleryShowCurrent();
  }
}

function galleryGoPrev() {
  if (galleryState.currentIndex > 0) {
    galleryState.currentIndex--;
    galleryShowCurrent();
  }
}

function initGallerySwipe() {
  const stage = document.getElementById('galleryViewerStage');
  if (!stage || stage._gallerySwipeBound) return;
  stage._gallerySwipeBound = true;

  let startX = 0;
  let startY = 0;
  let swiping = false;

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // Only horizontal swipe (not vertical)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) galleryGoNext();
      else galleryGoPrev();
    }
  }, { passive: true });
}

function initGalleryControls() {
  document.getElementById('galleryViewerClose')?.addEventListener('click', closeGalleryViewer);
  document.getElementById('galleryNavPrev')?.addEventListener('click', galleryGoPrev);
  document.getElementById('galleryNavNext')?.addEventListener('click', galleryGoNext);

  document.getElementById('galleryViewerDownload')?.addEventListener('click', async () => {
    const item = galleryState.items[galleryState.currentIndex];
    if (!item || !item.blobKey) return;
    const url = await getObjectUrlForBlobKey(item.blobKey);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = item.fileName || 'photo.jpg';
    a.click();
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (!galleryState.open) return;
    if (e.key === 'Escape') closeGalleryViewer();
    if (e.key === 'ArrowLeft') galleryGoPrev();
    if (e.key === 'ArrowRight') galleryGoNext();
  });
}


/* ═══════════════════════════════════════════════
   21. PIN LOCK
═══════════════════════════════════════════════ */

const PIN_STORAGE_KEY = 'docos_pin_hash';
const PIN_LENGTH = 4;

const pinRuntime = {
  entered: '',
  mode: 'unlock',  // 'unlock' | 'setup' | 'setup-confirm' | 'remove'
  setupFirst: '',
  unlocked: false
};

function hashPin(pin) {
  // Simple hash for local use — not crypto-grade but sufficient for local PIN
  let hash = 0;
  const str = 'docos_salt_' + pin + '_v3';
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'pin_' + Math.abs(hash).toString(36);
}

function hasPinSet() {
  return !!localStorage.getItem(PIN_STORAGE_KEY);
}

function verifyPin(pin) {
  const stored = localStorage.getItem(PIN_STORAGE_KEY);
  return stored && stored === hashPin(pin);
}

function savePin(pin) {
  localStorage.setItem(PIN_STORAGE_KEY, hashPin(pin));
}

function removePin() {
  localStorage.removeItem(PIN_STORAGE_KEY);
}

function showPinLockScreen(mode = 'unlock') {
  const screen = document.getElementById('pinLockScreen');
  if (!screen) return;
  screen.style.display = 'flex';
  pinRuntime.entered = '';
  pinRuntime.mode = mode;
  pinRuntime.setupFirst = '';

  const title = document.getElementById('pinLockTitle');
  const subtitle = document.getElementById('pinLockSubtitle');
  const error = document.getElementById('pinError');
  if (error) error.style.display = 'none';

  if (mode === 'setup') {
    if (title) title.textContent = 'Нов PIN';
    if (subtitle) subtitle.textContent = 'Избери 4-цифрен PIN код';
  } else if (mode === 'setup-confirm') {
    if (title) title.textContent = 'Потвърди PIN';
    if (subtitle) subtitle.textContent = 'Въведи PIN кода отново';
  } else if (mode === 'remove') {
    if (title) title.textContent = 'Премахни PIN';
    if (subtitle) subtitle.textContent = 'Въведи текущия PIN за потвърждение';
  } else {
    if (title) title.textContent = 'Въведи PIN';
    if (subtitle) subtitle.textContent = 'Докосни цифрите за отключване';
  }

  updatePinDots();
}

function hidePinLockScreen() {
  const screen = document.getElementById('pinLockScreen');
  if (screen) screen.style.display = 'none';
  pinRuntime.unlocked = true;
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pinDots .pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinRuntime.entered.length);
    dot.classList.remove('error');
  });
}

function showPinError(msg) {
  const error = document.getElementById('pinError');
  if (error) {
    error.textContent = msg;
    error.style.display = '';
  }
  const dots = document.querySelectorAll('#pinDots .pin-dot');
  dots.forEach(d => { d.classList.add('error'); d.classList.remove('filled'); });

  setTimeout(() => {
    pinRuntime.entered = '';
    updatePinDots();
    if (error) error.style.display = 'none';
  }, 800);
}

function handlePinDigit(digit) {
  if (pinRuntime.entered.length >= PIN_LENGTH) return;
  pinRuntime.entered += digit;
  updatePinDots();

  if (pinRuntime.entered.length === PIN_LENGTH) {
    setTimeout(() => processPinEntry(), 150);
  }
}

function handlePinDelete() {
  if (pinRuntime.entered.length === 0) return;
  pinRuntime.entered = pinRuntime.entered.slice(0, -1);
  updatePinDots();
}

function processPinEntry() {
  const pin = pinRuntime.entered;

  if (pinRuntime.mode === 'unlock') {
    if (verifyPin(pin)) {
      hidePinLockScreen();
      if (typeof showToast === 'function') showToast('🔓 Отключено');
    } else {
      showPinError('Грешен PIN');
    }
  } else if (pinRuntime.mode === 'setup') {
    pinRuntime.setupFirst = pin;
    pinRuntime.entered = '';
    pinRuntime.mode = 'setup-confirm';
    const title = document.getElementById('pinLockTitle');
    const subtitle = document.getElementById('pinLockSubtitle');
    if (title) title.textContent = 'Потвърди PIN';
    if (subtitle) subtitle.textContent = 'Въведи PIN кода отново';
    updatePinDots();
  } else if (pinRuntime.mode === 'setup-confirm') {
    if (pin === pinRuntime.setupFirst) {
      savePin(pin);
      hidePinLockScreen();
      updatePinSettingsUI();
      if (typeof showToast === 'function') showToast('🔐 PIN е зададен');
    } else {
      showPinError('PIN кодовете не съвпадат');
      pinRuntime.mode = 'setup';
      const title = document.getElementById('pinLockTitle');
      const subtitle = document.getElementById('pinLockSubtitle');
      if (title) title.textContent = 'Нов PIN';
      if (subtitle) subtitle.textContent = 'Опитай отново — избери 4-цифрен PIN';
    }
  } else if (pinRuntime.mode === 'remove') {
    if (verifyPin(pin)) {
      removePin();
      hidePinLockScreen();
      updatePinSettingsUI();
      if (typeof showToast === 'function') showToast('🔓 PIN е премахнат');
    } else {
      showPinError('Грешен PIN');
    }
  }
}

function updatePinSettingsUI() {
  const has = hasPinSet();
  const statusEl = document.getElementById('pinStatusValue');
  const setupBtn = document.getElementById('pinSetupBtn');
  const removeBtn = document.getElementById('pinRemoveBtn');

  if (statusEl) {
    statusEl.textContent = has ? 'Активен' : 'Изключено';
    statusEl.className = 'settings-value ' + (has ? 'is-good' : '');
  }
  if (setupBtn) {
    setupBtn.textContent = has ? '🔑 Смени PIN' : '🔑 Задай PIN';
  }
  if (removeBtn) {
    removeBtn.style.display = has ? '' : 'none';
  }
}

function initPinLock() {
  // Wire keypad
  document.querySelectorAll('.pin-key[data-digit]').forEach(key => {
    key.addEventListener('click', () => handlePinDigit(key.dataset.digit));
  });
  document.getElementById('pinDeleteBtn')?.addEventListener('click', handlePinDelete);

  // Settings buttons
  document.getElementById('pinSetupBtn')?.addEventListener('click', () => showPinLockScreen('setup'));
  document.getElementById('pinRemoveBtn')?.addEventListener('click', () => showPinLockScreen('remove'));

  // Show lock on app start if PIN is set
  if (hasPinSet()) {
    showPinLockScreen('unlock');
  }

  // Auto-lock when app goes to background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && hasPinSet()) {
      pinRuntime.unlocked = false;
    }
    if (!document.hidden && hasPinSet() && !pinRuntime.unlocked) {
      showPinLockScreen('unlock');
    }
  });

  updatePinSettingsUI();
}


/* ═══════════════════════════════════════════════
   22. CINEMA PLAYER ENGINE
═══════════════════════════════════════════════ */

const cinemaState = {
  playlist: [],       // { id, name, blobUrl, size, duration, thumbUrl }
  currentIndex: -1,
  subtitleCues: [],   // parsed SRT cues
  resumePositions: {} // id → seconds
};

function renderCinemaTab() {
  const video = document.getElementById('cinemaVideo');
  const empty = document.getElementById('cinemaEmpty');
  const playerWrap = document.getElementById('cinemaPlayerWrap');
  if (!video || !empty || !playerWrap) return;

  const hasVideo = cinemaState.playlist.length > 0 && cinemaState.currentIndex >= 0;
  playerWrap.style.display = hasVideo ? '' : 'none';
  empty.style.display = hasVideo ? 'none' : '';

  renderCinemaPlaylist();
  renderCinemaNowPlaying();

  const countEl = document.getElementById('cinemaPlaylistCount');
  if (countEl) countEl.textContent = cinemaState.playlist.length;
}

function renderCinemaPlaylist() {
  const el = document.getElementById('cinemaPlaylist');
  if (!el) return;
  if (!cinemaState.playlist.length) {
    el.innerHTML = '<div class="empty-sub" style="padding:.5rem 0;text-align:center">Плейлистът е празен</div>';
    return;
  }
  el.innerHTML = cinemaState.playlist.map((item, idx) => `
    <div class="cinema-playlist-item ${idx === cinemaState.currentIndex ? 'active' : ''}" data-cinema-idx="${idx}">
      <span class="cinema-pl-num">${idx + 1}</span>
      <span class="cinema-pl-name">${escHtml(item.name)}</span>
      <span class="cinema-pl-dur">${item.duration ? formatCinemaTime(item.duration) : '—'}</span>
      <button class="cinema-pl-remove" data-cinema-remove="${idx}" title="Премахни">✕</button>
    </div>
  `).join('');

  el.querySelectorAll('.cinema-playlist-item').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-cinema-remove]')) return;
      cinemaPlayIndex(Number(card.dataset.cinemaIdx));
    });
  });
  el.querySelectorAll('[data-cinema-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cinemaRemoveFromPlaylist(Number(btn.dataset.cinemaRemove));
    });
  });
}

function renderCinemaNowPlaying() {
  const wrap = document.getElementById('cinemaNowPlaying');
  const card = document.getElementById('cinemaNowCard');
  if (!wrap || !card) return;
  if (cinemaState.currentIndex < 0 || !cinemaState.playlist[cinemaState.currentIndex]) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const item = cinemaState.playlist[cinemaState.currentIndex];
  card.innerHTML = `
    <div class="cinema-now-info">
      <div class="cinema-now-title">🎬 ${escHtml(item.name)}</div>
      <div class="cinema-now-meta">${formatBytes(item.size)} ${item.duration ? '· ' + formatCinemaTime(item.duration) : ''}</div>
    </div>
  `;
}

async function cinemaAddFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('video/')) continue;
    const blobUrl = URL.createObjectURL(file);
    const item = {
      id: uid(),
      name: file.name.replace(/\.[^.]+$/, ''),
      blobUrl,
      size: file.size,
      duration: 0,
      thumbUrl: ''
    };
    cinemaState.playlist.push(item);

    // Get duration
    try {
      const dur = await getVideoDuration(blobUrl);
      item.duration = dur;
    } catch (_) {}
  }

  if (cinemaState.currentIndex < 0 && cinemaState.playlist.length > 0) {
    cinemaPlayIndex(0);
  }
  renderCinemaTab();
}

function getVideoDuration(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.addEventListener('loadedmetadata', () => resolve(v.duration), { once: true });
    v.addEventListener('error', reject, { once: true });
    setTimeout(() => reject('timeout'), 5000);
  });
}

function cinemaPlayIndex(idx) {
  if (idx < 0 || idx >= cinemaState.playlist.length) return;

  // Save current position
  const video = document.getElementById('cinemaVideo');
  if (video && cinemaState.currentIndex >= 0) {
    const curItem = cinemaState.playlist[cinemaState.currentIndex];
    if (curItem && video.currentTime > 5) {
      cinemaState.resumePositions[curItem.id] = video.currentTime;
    }
  }

  cinemaState.currentIndex = idx;
  const item = cinemaState.playlist[idx];
  if (!video || !item) return;

  // Reset iframe/fallback if previously used for URL streaming
  cinemaDestroyHls?.();
  const iframe = document.getElementById('cinemaIframe');
  if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
  const viewport = document.getElementById('cinemaViewport');
  viewport?.querySelectorAll('.cinema-iframe-fallback').forEach(el => el.remove());
  cinemaHideIframeLoader?.();
  cinemaHideBar?.();
  cinemaSetPlayingMode?.(true);
  video.style.display = '';
  const controls = document.getElementById('cinemaControls');
  if (controls) controls.style.display = '';

  video.src = item.blobUrl;
  video.load();

  // Resume from saved position
  const savedPos = cinemaState.resumePositions[item.id];
  if (savedPos && savedPos > 5) {
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = savedPos;
    }, { once: true });
  }

  video.play().catch(() => {});

  const overlay = document.getElementById('cinemaOverlay');
  if (overlay) overlay.classList.add('hidden');

  // Show resolution badge
  video.addEventListener('loadedmetadata', () => {
    const badge = document.getElementById('cinemaInfoBadge');
    const resEl = document.getElementById('cinemaResolution');
    if (badge && resEl && video.videoWidth) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      let label = `${w}×${h}`;
      if (w >= 7680) label = '8K';
      else if (w >= 3840) label = '4K';
      else if (w >= 2560) label = '1440p';
      else if (w >= 1920) label = '1080p';
      else if (w >= 1280) label = '720p';
      else if (w >= 854) label = '480p';
      resEl.textContent = label;
      badge.style.display = '';
    }
    if (!item.duration && video.duration) item.duration = video.duration;
  }, { once: true });

  renderCinemaTab();
}

/* ─── URL paste / streaming ───────────────────────────── */

const CINEMA_URL_HISTORY_LS = 'cinema_url_history';
const CINEMA_DIRECT_VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|$)/i;
const CINEMA_HLS_RE = /\.m3u8(\?|$)/i;
const CINEMA_DASH_RE = /\.mpd(\?|$)/i;

function cinemaOpenUrlModal() {
  const m = document.getElementById('cinemaUrlModal');
  if (!m) return;
  m.style.display = 'flex';
  cinemaRenderUrlHistory();
  setTimeout(() => document.getElementById('cinemaUrlInput')?.focus(), 100);
}

function cinemaCloseUrlModal() {
  const m = document.getElementById('cinemaUrlModal');
  if (m) m.style.display = 'none';
}

function cinemaGetUrlHistory() {
  try { return JSON.parse(localStorage.getItem(CINEMA_URL_HISTORY_LS) || '[]'); }
  catch (_) { return []; }
}
function cinemaSaveUrlHistory(arr) {
  try { localStorage.setItem(CINEMA_URL_HISTORY_LS, JSON.stringify(arr.slice(0, 10))); } catch (_) {}
}
function cinemaPushUrlHistory(url) {
  let h = cinemaGetUrlHistory().filter(u => u !== url);
  h.unshift(url);
  cinemaSaveUrlHistory(h);
}
function cinemaRenderUrlHistory() {
  const wrap = document.getElementById('cinemaUrlHistory');
  if (!wrap) return;
  const h = cinemaGetUrlHistory();
  if (!h.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div style="font-size:11px;opacity:.5;margin:8px 0 4px;letter-spacing:.5px">ПОСЛЕДНИ</div>' +
    h.map((u, i) => {
      let host = '', path = '';
      try { const x = new URL(u); host = x.hostname.replace(/^www\./, ''); path = x.pathname + x.search; } catch (_) { host = u; }
      return `<div class="cinema-url-history-item" data-url-idx="${i}">
        <span class="url-host">${escHtml(host)}</span>
        <span class="url-path">${escHtml(path)}</span>
        <button class="url-del" data-url-del="${i}">✕</button>
      </div>`;
    }).join('');
  wrap.querySelectorAll('.cinema-url-history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.url-del')) return;
      cinemaPlayUrl(h[Number(item.dataset.urlIdx)]);
    });
  });
  wrap.querySelectorAll('.url-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const arr = cinemaGetUrlHistory();
      arr.splice(Number(btn.dataset.urlDel), 1);
      cinemaSaveUrlHistory(arr);
      cinemaRenderUrlHistory();
    });
  });
}

function cinemaTransformUrl(raw) {
  // Returns { mode: 'video'|'iframe'|'hls', url: string }
  let url;
  try { url = new URL(raw); } catch (_) { return { mode: 'iframe', url: raw }; }
  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v');
    if (id) return { mode: 'iframe', url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
    const m = url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    if (m) return { mode: 'iframe', url: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` };
  }
  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('?')[0];
    if (id) return { mode: 'iframe', url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
  }
  // Vimeo
  if (host === 'vimeo.com') {
    const m = url.pathname.match(/\/(\d+)/);
    if (m) return { mode: 'iframe', url: `https://player.vimeo.com/video/${m[1]}?autoplay=1` };
  }
  // Direct media
  if (CINEMA_HLS_RE.test(url.pathname)) return { mode: 'hls', url: raw };
  if (CINEMA_DIRECT_VIDEO_RE.test(url.pathname)) return { mode: 'video', url: raw };

  // Default: iframe whatever they paste
  return { mode: 'iframe', url: raw };
}

let cinemaHlsInstance = null;
function cinemaDestroyHls() {
  if (cinemaHlsInstance && typeof cinemaHlsInstance.destroy === 'function') {
    try { cinemaHlsInstance.destroy(); } catch (_) {}
  }
  cinemaHlsInstance = null;
}

function cinemaLoadHlsLib() {
  return new Promise((resolve, reject) => {
    if (window.Hls) return resolve(window.Hls);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1';
    s.onload = () => resolve(window.Hls);
    s.onerror = () => reject(new Error('hls.js не зарежда'));
    document.head.appendChild(s);
  });
}

function cinemaSetPlayingMode(on) {
  if (on) document.documentElement.dataset.cinemaPlaying = '1';
  else delete document.documentElement.dataset.cinemaPlaying;
}

function cinemaShowBar(rawUrl) {
  const bar = document.getElementById('cinemaBar');
  const host = document.getElementById('cinemaBarHost');
  const open = document.getElementById('cinemaBarOpen');
  if (!bar) return;
  bar.classList.add('show');
  try { host.textContent = new URL(rawUrl).hostname.replace(/^www\./, ''); }
  catch (_) { host.textContent = rawUrl; }
  if (open) open.href = rawUrl;
}
function cinemaHideBar() {
  document.getElementById('cinemaBar')?.classList.remove('show');
}

function cinemaShowIframeLoader(label) {
  const l = document.getElementById('cinemaIframeLoader');
  const lbl = document.getElementById('cinemaIframeLoaderLbl');
  if (lbl && label) lbl.textContent = label;
  l?.classList.remove('hide');
}
function cinemaHideIframeLoader() {
  document.getElementById('cinemaIframeLoader')?.classList.add('hide');
}

function cinemaStopUrl() {
  const video = document.getElementById('cinemaVideo');
  const iframe = document.getElementById('cinemaIframe');
  const controls = document.getElementById('cinemaControls');
  const viewport = document.getElementById('cinemaViewport');
  const empty = document.getElementById('cinemaEmpty');
  const playerWrap = document.getElementById('cinemaPlayerWrap');

  cinemaDestroyHls();
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.style.display = ''; }
  if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
  if (controls) controls.style.display = '';
  viewport?.querySelectorAll('.cinema-iframe-fallback').forEach(el => el.remove());
  cinemaHideIframeLoader();
  cinemaHideBar();
  cinemaSetPlayingMode(false);

  if (cinemaState.currentIndex < 0) {
    if (playerWrap) playerWrap.style.display = 'none';
    if (empty) empty.style.display = '';
  }
}

async function cinemaPlayUrl(rawUrl) {
  const { mode, url } = cinemaTransformUrl(rawUrl);
  cinemaPushUrlHistory(rawUrl);
  cinemaCloseUrlModal();

  const playerWrap = document.getElementById('cinemaPlayerWrap');
  const empty = document.getElementById('cinemaEmpty');
  const video = document.getElementById('cinemaVideo');
  const iframe = document.getElementById('cinemaIframe');
  const controls = document.getElementById('cinemaControls');
  const overlay = document.getElementById('cinemaOverlay');
  const viewport = document.getElementById('cinemaViewport');

  viewport?.querySelectorAll('.cinema-iframe-fallback').forEach(el => el.remove());

  if (playerWrap) playerWrap.style.display = '';
  if (empty) empty.style.display = 'none';

  cinemaDestroyHls();
  cinemaSetPlayingMode(true);

  if (mode === 'video') {
    cinemaHideBar();
    cinemaHideIframeLoader();
    if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
    if (video) {
      video.style.display = '';
      video.crossOrigin = 'anonymous';
      video.src = url;
      video.load();
      video.play().catch(() => {});
    }
    if (controls) controls.style.display = '';
    if (overlay) overlay.classList.add('hidden');
    showToast('▶ Зареждам видео...');
    return;
  }

  if (mode === 'hls') {
    cinemaHideBar();
    cinemaHideIframeLoader();
    if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
    if (video) video.style.display = '';
    if (controls) controls.style.display = '';
    if (overlay) overlay.classList.add('hidden');

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.load();
      video.play().catch(() => {});
      showToast('▶ HLS поток...');
      return;
    }
    try {
      const Hls = await cinemaLoadHlsLib();
      if (Hls.isSupported()) {
        cinemaHlsInstance = new Hls({ enableWorker: true, lowLatencyMode: false });
        cinemaHlsInstance.loadSource(url);
        cinemaHlsInstance.attachMedia(video);
        cinemaHlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        cinemaHlsInstance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) showToast('HLS грешка: ' + (data.details || 'unknown'));
        });
        showToast('▶ HLS поток...');
      } else { showToast('HLS не се поддържа'); }
    } catch (e) { showToast('hls.js не зареди'); }
    return;
  }

  // iframe mode
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.style.display = 'none'; }
  if (controls) controls.style.display = 'none';
  if (overlay) overlay.classList.add('hidden');
  if (!iframe) return;

  cinemaShowBar(rawUrl);
  cinemaShowIframeLoader('Зареждам ' + (new URL(url).hostname.replace(/^www\./, '')) + '...');

  iframe.style.display = '';
  iframe.src = 'about:blank';

  let didLoad = false;
  let didFail = false;
  const onLoad = () => { didLoad = true; cinemaHideIframeLoader(); };
  const onError = () => { didFail = true; cinemaHideIframeLoader(); cinemaShowIframeFallback(rawUrl); };
  iframe.addEventListener('load', onLoad, { once: true });
  iframe.addEventListener('error', onError, { once: true });

  // Forced rAF before src assign so layout settles
  requestAnimationFrame(() => { iframe.src = url; });

  // Watchdog: if still no load after 8s, mark as blocked.
  setTimeout(() => {
    iframe.removeEventListener('load', onLoad);
    iframe.removeEventListener('error', onError);
    if (!didLoad && !didFail) {
      cinemaHideIframeLoader();
      cinemaShowIframeFallback(rawUrl);
    }
  }, 8000);
}

function cinemaShowIframeFallback(originalUrl) {
  const viewport = document.getElementById('cinemaViewport');
  const iframe = document.getElementById('cinemaIframe');
  if (!viewport) return;
  viewport.querySelectorAll('.cinema-iframe-fallback').forEach(el => el.remove());

  const fb = document.createElement('div');
  fb.className = 'cinema-iframe-fallback';
  fb.innerHTML = `
    <div class="ico">🚫</div>
    <div class="title">Сайтът не позволява вграждане</div>
    <div class="sub">Този източник блокира пускането вътре в DocOS (X-Frame-Options или DRM). Отвори го в нов прозорец и гледай там.</div>
    <a class="open-btn" href="${escHtml(originalUrl)}" target="_blank" rel="noopener noreferrer">↗ Отвори в нов прозорец</a>
  `;
  viewport.appendChild(fb);
  if (iframe) { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
}

function cinemaRemoveFromPlaylist(idx) {
  if (idx < 0 || idx >= cinemaState.playlist.length) return;
  const wasPlaying = idx === cinemaState.currentIndex;
  cinemaState.playlist.splice(idx, 1);
  if (wasPlaying) {
    const video = document.getElementById('cinemaVideo');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    cinemaState.currentIndex = cinemaState.playlist.length > 0 ? Math.min(idx, cinemaState.playlist.length - 1) : -1;
    if (cinemaState.currentIndex >= 0) cinemaPlayIndex(cinemaState.currentIndex);
  } else if (idx < cinemaState.currentIndex) {
    cinemaState.currentIndex--;
  }
  renderCinemaTab();
}

// SRT Parser
function parseSRT(text) {
  const cues = [];
  const blocks = text.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [startStr, endStr] = lines[timeIdx].split('-->').map(s => s.trim());
    const start = parseSRTTime(startStr);
    const end = parseSRTTime(endStr);
    const textLines = lines.slice(timeIdx + 1).join('\n').trim();
    if (start !== null && end !== null && textLines) {
      cues.push({ start, end, text: textLines });
    }
  }
  return cues;
}

function parseSRTTime(str) {
  const m = str.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

function cinemaLoadSubtitles(text) {
  cinemaState.subtitleCues = parseSRT(text);
  showToast(`💬 Заредени ${cinemaState.subtitleCues.length} субтитъра`);
}

function cinemaUpdateSubtitleDisplay(currentTime) {
  const display = document.getElementById('cinemaSubDisplay');
  if (!display) return;
  const cue = cinemaState.subtitleCues.find(c => currentTime >= c.start && currentTime <= c.end);
  if (cue) {
    display.innerHTML = `<span>${escHtml(cue.text).replace(/\n/g, '<br>')}</span>`;
  } else {
    display.innerHTML = '';
  }
}

function formatCinemaTime(sec) {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function initCinemaControls() {
  const video = document.getElementById('cinemaVideo');
  const playPause = document.getElementById('cinemaPlayPause');
  const bigPlay = document.getElementById('cinemaBigPlay');
  const overlay = document.getElementById('cinemaOverlay');
  const rewind = document.getElementById('cinemaRewind');
  const forward = document.getElementById('cinemaForward');
  const pip = document.getElementById('cinemaPiP');
  const fs = document.getElementById('cinemaFullscreen');
  const timeEl = document.getElementById('cinemaTime');
  const progressFill = document.getElementById('cinemaProgressFill');
  const bufferFill = document.getElementById('cinemaProgressBuffer');
  const progressWrap = document.getElementById('cinemaProgressWrap');
  const loadBtn = document.getElementById('cinemaLoadFileBtn');
  const subBtn = document.getElementById('cinemaLoadSubBtn');

  if (!video) return;

  const syncUI = () => {
    if (playPause) playPause.textContent = video.paused ? '▶' : '⏸';
    if (overlay) overlay.classList.toggle('hidden', !video.paused || !video.src);
  };

  video.addEventListener('play', syncUI);
  video.addEventListener('pause', syncUI);
  video.addEventListener('ended', () => {
    syncUI();
    // Auto-play next
    if (cinemaState.currentIndex < cinemaState.playlist.length - 1) {
      cinemaPlayIndex(cinemaState.currentIndex + 1);
    }
  });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (timeEl) timeEl.textContent = `${formatCinemaTime(video.currentTime)} / ${formatCinemaTime(video.duration)}`;
    cinemaUpdateSubtitleDisplay(video.currentTime);
  });

  video.addEventListener('progress', () => {
    if (!video.duration || !video.buffered.length) return;
    const buffered = video.buffered.end(video.buffered.length - 1);
    const pct = (buffered / video.duration) * 100;
    if (bufferFill) bufferFill.style.width = `${pct}%`;
  });

  if (playPause) playPause.addEventListener('click', () => { video.paused ? video.play() : video.pause(); });
  if (bigPlay) bigPlay.addEventListener('click', () => { video.play().catch(() => {}); });
  if (rewind) rewind.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
  if (forward) forward.addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); });

  if (pip) pip.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) { showToast('PiP не е достъпен'); }
  });

  if (fs) fs.addEventListener('click', () => {
    const viewport = document.getElementById('cinemaViewport');
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (viewport?.requestFullscreen) {
        viewport.requestFullscreen();
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch (_) { showToast('Fullscreen не е достъпен'); }
  });

  // Progress bar seek
  if (progressWrap) {
    const seek = (e) => {
      const rect = progressWrap.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      if (video.duration) video.currentTime = pct * video.duration;
    };
    progressWrap.addEventListener('click', seek);
    let seeking = false;
    progressWrap.addEventListener('touchstart', (e) => { seeking = true; seek(e); }, { passive: true });
    progressWrap.addEventListener('touchmove', (e) => { if (seeking) seek(e); }, { passive: true });
    progressWrap.addEventListener('touchend', () => { seeking = false; });
  }

  // Speed control
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 2; // 1x
  const speedBtn = document.getElementById('cinemaSpeed');
  const speedBadge = document.getElementById('cinemaSpeedBadge');
  const speedLabel = document.getElementById('cinemaSpeedLabel');

  if (speedBtn) speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    const rate = speeds[speedIdx];
    video.playbackRate = rate;
    speedBtn.textContent = rate + 'x';
    if (speedLabel) speedLabel.textContent = rate + 'x';
    if (speedBadge) speedBadge.classList.toggle('visible', rate !== 1);
  });

  // Double-tap left/right to seek ±10s
  let lastTapTime = 0;
  let lastTapX = 0;
  const seekLeftEl = document.getElementById('cinemaSeekLeft');
  const seekRightEl = document.getElementById('cinemaSeekRight');

  const showSeekIndicator = (el, text) => {
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 600);
  };

  const viewport = document.getElementById('cinemaViewport');
  if (viewport) {
    // Double-tap detection
    viewport.addEventListener('touchend', (e) => {
      if (e.target.closest('.cinema-controls') || e.target.closest('.cinema-big-play')) return;
      const now = Date.now();
      const touch = e.changedTouches[0];
      if (!touch) return;

      if (now - lastTapTime < 300) {
        // Double tap!
        const rect = viewport.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const half = rect.width / 2;

        if (x < half) {
          // Left side — rewind 10s
          video.currentTime = Math.max(0, video.currentTime - 10);
          showSeekIndicator(seekLeftEl, '-10s');
        } else {
          // Right side — forward 10s
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
          showSeekIndicator(seekRightEl, '+10s');
        }
        lastTapTime = 0;
        e.preventDefault();
      } else {
        lastTapTime = now;
        lastTapX = touch.clientX;
      }
    });

    // Horizontal swipe to seek
    let swipeStartX = 0;
    let swipeStartTime = 0;
    let swiping = false;

    viewport.addEventListener('touchstart', (e) => {
      if (e.target.closest('.cinema-controls') || e.target.closest('.cinema-big-play')) return;
      if (e.touches.length !== 1) return;
      swipeStartX = e.touches[0].clientX;
      swipeStartTime = video.currentTime;
      swiping = true;
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (!swiping || e.touches.length !== 1 || !video.duration) return;
      const dx = e.touches[0].clientX - swipeStartX;
      if (Math.abs(dx) < 20) return;
      // 200px swipe = 30s seek
      const seekAmount = (dx / 200) * 30;
      const newTime = Math.max(0, Math.min(video.duration, swipeStartTime + seekAmount));
      video.currentTime = newTime;
      const diff = Math.round(newTime - swipeStartTime);
      if (diff > 0) {
        showSeekIndicator(seekRightEl, `+${diff}s`);
      } else if (diff < 0) {
        showSeekIndicator(seekLeftEl, `${diff}s`);
      }
    }, { passive: true });

    viewport.addEventListener('touchend', () => { swiping = false; }, { passive: true });
  }

  // File inputs
  if (loadBtn) loadBtn.addEventListener('click', () => document.getElementById('cinemaFileInput')?.click());
  if (subBtn) subBtn.addEventListener('click', () => document.getElementById('cinemaSubInput')?.click());

  // URL paste
  const urlBtn = document.getElementById('cinemaLoadUrlBtn');
  if (urlBtn) urlBtn.addEventListener('click', cinemaOpenUrlModal);
  document.getElementById('cinemaUrlClose')?.addEventListener('click', cinemaCloseUrlModal);
  document.getElementById('cinemaUrlGo')?.addEventListener('click', () => {
    const inp = document.getElementById('cinemaUrlInput');
    const url = (inp?.value || '').trim();
    if (!url) { showToast('Постави линк първо'); return; }
    cinemaPlayUrl(url);
  });
  document.getElementById('cinemaUrlInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('cinemaUrlGo')?.click();
  });
  document.getElementById('cinemaBarStop')?.addEventListener('click', cinemaStopUrl);

  document.getElementById('cinemaFileInput')?.addEventListener('change', (e) => {
    if (e.target.files?.length) cinemaAddFiles(e.target.files);
    e.target.value = '';
  });

  document.getElementById('cinemaSubInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cinemaLoadSubtitles(reader.result);
    reader.readAsText(file);
    e.target.value = '';
  });

  // Single tap viewport to toggle play/pause (with delay to not conflict with double-tap)
  if (viewport) {
    let singleTapTimer = null;
    viewport.addEventListener('click', (e) => {
      if (e.target.closest('.cinema-big-play') || e.target.closest('.cinema-controls')) return;
      if (!video.src) return;
      // Wait to see if it's a double-tap
      if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; return; }
      singleTapTimer = setTimeout(() => {
        video.paused ? video.play() : video.pause();
        singleTapTimer = null;
      }, 320);
    });
  }
}


/* ═══════════════════════════════════════════════
   23. INIT
═══════════════════════════════════════════════ */


async function init() {
  initViewportCssSync();
  loadState();
  await openAssetDb().catch(err => {
    console.warn('DocOS: IndexedDB unavailable, fallback to metadata-only mode', err);
  });
  await requestPersistentStorageIfAvailable().catch(() => false);
  await migrateLegacyInlineDataToIndexedDb().catch(err => {
    console.warn('DocOS: legacy migration skipped', err);
  });
  await hydrateRuntimePreviewUrls().catch(() => {});
  await upgradeAutoFillMetadataIfNeeded().catch(err => {
    console.warn('DocOS: autofill upgrade skipped', err);
  });
  await refreshStorageEstimate(true).catch(() => {});
  await refreshStoragePersistence(true).catch(() => {});
  await registerServiceWorkerIfSupported().catch(() => null);
  await refreshRuntimeCacheTruth().catch(() => {});
  getPdfJsRuntime(3500).catch(() => null);
  getJsonEditorRuntime().catch(() => null);
  getFuseRuntime(2500).catch(() => null);
  getChoicesRuntime(2500).catch(() => null);
  getSortableRuntime(2500).catch(() => null);
  updateNotifBadge();
  applyTheme(state.theme || 'black-blue');
  initEventListeners();
  initShellScrollStability();
  initCinemaControls();
  initPinLock();
  initGalleryControls();
  startClock();
  scheduleNextReminderCheck();
  showTab(state.currentTab || 'dashboard');
  updatePwaStatusUi();
  if (window.matchMedia) {
    pwaRuntime.standaloneMq = window.matchMedia('(display-mode: standalone)');
    if (pwaRuntime.standaloneMq?.addEventListener) pwaRuntime.standaloneMq.addEventListener('change', updatePwaStatusUi);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { processDueReminders(); scheduleNextReminderCheck(); updatePwaStatusUi(); } });
  window.addEventListener('online', () => {
    updatePwaStatusUi();
    warmExternalRuntimeCache().catch(() => refreshRuntimeCacheTruth().catch(() => {}));
  });
  window.addEventListener('offline', updatePwaStatusUi);
  window.addEventListener('beforeunload', () => { releaseAllRuntimeObjectUrls(); clearReminderTimer(); });

  queueMicrotask(() => {
    warmExternalRuntimeCache().catch(() => refreshRuntimeCacheTruth().catch(() => {}));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('DocOS init failed', err);
    showToast('⚠️ Грешка при стартиране');
  });
});

