'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SHIFT_HRS = 8;
const DEFAULT_PROD_PCT = 70;
const WEEKS_PER_MONTH = 4.33;
const WEEKS_PER_QTR = WEEKS_PER_MONTH * 3;
const WEEKS_PER_YEAR = WEEKS_PER_QTR * 4;

const VIEW_SCALE = { weekly: 1, monthly: WEEKS_PER_MONTH, quarterly: WEEKS_PER_QTR, yearly: WEEKS_PER_YEAR };
const VIEW_LABEL = { weekly: 'Wk', monthly: 'Mo', quarterly: 'Qtr', yearly: 'FY' };

// Labs that run on IndySoft (everything else = CalTrak)
const INDYSOFT_LABS = new Set([
  'Tangent Decatur Cal Lab', 'Tangent Indianapolis Lab', 'Montreal Cal Lab',
  'Biomedical', 'Chesapeake Cal Lab', 'Cleveland Cal Lab', 'San Diego Cal Lab',
  'Pipettes Milford Lab', 'Pipettes Field Service', 'Pipettes San Diego Lab'
]);

// Maps schedule export lab codes → canonical BASE_LABS lab keys
// Handles both legacy DB entries ("05 houston") and newly uploaded ones
const SCHEDULE_LAB_KEY_MAP = {
  '01 rochester':    'rochester cal lab',
  '02 portland':     'portland cal lab',
  '05 houston':      'houston cal lab',
  '06 philadelphia': 'philadelphia cal lab',
  '09 toronto':      'toronto cal lab',
  '11 boston':       'boston cal lab',
  '15 dayton':       'dayton cal lab',
  '17 charlotte':    'charlotte cal lab',
  '19 los angeles':  'los angeles cal lab',
  '23 denver':       'denver cal lab',
  '24 phoenix':      'phoenix cal lab',
  '31 san diego':    'san diego cal lab',
  '33 ottawa':       'ottawa cal lab',
  '61 palm beach':   'palm beach cal lab',
  'm5 st louis':     'st louis cal lab',
};

const EMPTY_LAB_MAPPING = Object.freeze({
  aliasToCanonicalKey: {},
  canonicalLabByKey: {},
  systemByCanonicalKey: {},
  isActiveByCanonicalKey: {},
  activeLabKeySet: new Set(),
});

// Base lab list — only labs we actively track
// CalTrak labs with std hours data + IndySoft labs (tracked separately)
// Martin labs and other unmeasured non-IndySoft labs are excluded
const BASE_LABS = [
  // ── CalTrak labs (have std hours / demand data) ──────────────────────────
  {lab:'Houston Cal Lab',             techs:34, stdHrs:943},
  {lab:'Philadelphia Cal Lab',        techs:30, stdHrs:618},
  {lab:'Rochester Cal Lab',           techs:27, stdHrs:1084},
  {lab:'Dayton Cal Lab',              techs:19, stdHrs:882},
  {lab:'Toronto Cal Lab',             techs:19, stdHrs:321},
  {lab:'Charlotte Cal Lab',           techs:17, stdHrs:369},
  {lab:'Denver Cal Lab',              techs:15, stdHrs:552},
  {lab:'Pittsburgh Cal Lab',          techs:14, stdHrs:515},
  {lab:'Los Angeles Cal Lab',         techs:13, stdHrs:539},
  {lab:'St. Louis Cal Lab',           techs:12, stdHrs:487},
  {lab:'Boston Cal Lab',              techs:9,  stdHrs:274},
  {lab:'Portland Cal Lab',            techs:7,  stdHrs:354},
  {lab:'Honda Lincoln, AL (AAP)',     techs:7,  stdHrs:166},
  {lab:'Phoenix Cal Lab',             techs:7,  stdHrs:null},
  {lab:'Palm Beach Cal Lab',          techs:4,  stdHrs:140},
  {lab:'Honda E Liberty, OH (ELP)',   techs:3,  stdHrs:54},
  {lab:'Honda Greensburg IN (IAP)',   techs:3,  stdHrs:57},
  {lab:'Ottawa Cal Lab',              techs:3,  stdHrs:77},
  {lab:'Honda Dayton, OH',            techs:2,  stdHrs:82},
  {lab:'Puerto Rico Cal Lab',         techs:2,  stdHrs:29},
  {lab:'Honda Anna, OH (AEP)',        techs:1,  stdHrs:23},
  {lab:'Honda Marysville OH (MAP)',   techs:1,  stdHrs:44},
  // ── IndySoft labs (shown when IndySoft filter is active) ─────────────────
  {lab:'Biomedical',                  techs:33, stdHrs:null},
  {lab:'Montreal Cal Lab',            techs:24, stdHrs:null},
  {lab:'Pipettes Milford Lab',        techs:21, stdHrs:null},
  {lab:'Chesapeake Cal Lab',          techs:12, stdHrs:null},
  {lab:'Cleveland Cal Lab',           techs:12, stdHrs:null},
  {lab:'Pipettes Field Service',      techs:11, stdHrs:null},
  {lab:'San Diego Cal Lab',           techs:6,  stdHrs:null},
  {lab:'Tangent Indianapolis Lab',    techs:5,  stdHrs:null},
  {lab:'Tangent Decatur Cal Lab',     techs:3,  stdHrs:null},
  {lab:'Pipettes San Diego Lab',      techs:3,  stdHrs:null},
];

// FY month keys in order (Apr–Mar)
const FY_MONTH_SUFFIXES = ['04','05','06','07','08','09','10','11','12','01','02','03'];
const FY_MONTH_LABELS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

// Current fiscal year start (e.g. 2025 for FY 2025-26)
function currentFYStartYear() {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

// ─── STATE ───────────────────────────────────────────────────────────────────
const st = {
  view: 'weekly',
  tab: 'status-board',
  weekOffset: 0,               // weeks forward/back from today (for week nav)
  filters: { system: 'caltrak', status: 'all', selectedLabs: new Set() },
  sortKey: 'load',
  sortDir: -1,                 // -1 = desc (highest load first)
  labList: [],                 // final computed array of lab objects
  labSettings: {},             // { labKey: { productivityPct, daysPerWeek, systemType } }
  scheduleEvents: [],          // from /api/schedules
  dbStdHrs: {},                // { labKey: stdHrsPerWeek } from DB
  historicalWipDaily: {},      // { 'YYYY-MM-DD': { normalizedLabKey: value } }
  historicalWipDates: [],      // sorted dates from historicalWipDaily
  labMapping: {
    aliasToCanonicalKey: {},
    canonicalLabByKey: {},
    systemByCanonicalKey: {},
    isActiveByCanonicalKey: {},
    activeLabKeySet: new Set(),
  },
  dataDate: null,
  savedScenarios: [],
  scen: {
    view: 'weekly',
    id: null,
    name: '',
    selectedLabs: new Set(),   // lab names in scope
    globalOt: 0,
    globalProdAdj: 0,
    globalDaysDelta: 0,
    perLab: {},                // { labName: { demandVal, demandUnit, hireTechs, otOverride, daysOverride, prodOverride } }
  },
  modalLabName: null,
  chart: null,
};

let labPickerInitialized = false;
let labPickerSearchTerm = '';
let headerHelpTipEl = null;

// ─── UTILS ───────────────────────────────────────────────────────────────────
function labKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ensureHeaderHelpTip() {
  if (headerHelpTipEl) return headerHelpTipEl;
  const el = document.createElement('div');
  el.className = 'header-help-tip';
  document.body.appendChild(el);
  headerHelpTipEl = el;
  return el;
}

function hideHeaderHelpTip() {
  if (!headerHelpTipEl) return;
  headerHelpTipEl.classList.remove('show');
}

function showHeaderHelpTip(text, x, y) {
  if (!text) return hideHeaderHelpTip();
  const tip = ensureHeaderHelpTip();
  tip.textContent = text;
  tip.classList.add('show');
  const pad = 12;
  const rect = tip.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + rect.width > window.innerWidth - pad) left = x - rect.width - 14;
  if (top + rect.height > window.innerHeight - pad) top = y - rect.height - 14;
  tip.style.left = `${Math.max(pad, left)}px`;
  tip.style.top = `${Math.max(pad, top)}px`;
}

function initHeaderTooltips() {
  const table = document.getElementById('status-table');
  if (!table) return;
  table.querySelectorAll('thead th').forEach(th => {
    const text = th.getAttribute('data-help') || th.getAttribute('title') || '';
    if (!text) return;
    th.dataset.help = text;
    th.classList.add('has-help');
    th.removeAttribute('title');
  });

  table.addEventListener('mousemove', (e) => {
    const th = e.target.closest('thead th.has-help');
    if (!th) return hideHeaderHelpTip();
    showHeaderHelpTip(th.dataset.help || '', e.clientX, e.clientY);
  });
  table.addEventListener('mouseleave', hideHeaderHelpTip);
  window.addEventListener('scroll', hideHeaderHelpTip, {passive: true});
}

function fmt(n, dec = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function fmtSgn(n, dec = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = fmt(Math.abs(n), dec);
  return n >= 0 ? '+' + s : '−' + s;
}

function scale(view) { return VIEW_SCALE[view] ?? 1; }

function isIndySoft(labName) { return INDYSOFT_LABS.has(labName); }

function systemType(labName, settings) {
  if (settings?.systemType) return settings.systemType;
  return isIndySoft(labName) ? 'indysoft' : 'caltrak';
}

function mapToCanonicalLabKey(rawName) {
  const raw = labKey(rawName);
  return st.labMapping.aliasToCanonicalKey[raw] ?? SCHEDULE_LAB_KEY_MAP[raw] ?? raw;
}

function canonicalLabNameForKey(key, fallbackName) {
  return st.labMapping.canonicalLabByKey[key] ?? fallbackName;
}

function isLabActive(key) {
  if (!st.labMapping.activeLabKeySet.size) return true;
  return st.labMapping.activeLabKeySet.has(key);
}

// ─── COMPUTED METRICS ────────────────────────────────────────────────────────
function getStatus(loadPct) {
  if (loadPct > 100) return 'over';
  if (loadPct >= 80) return 'risk';
  return 'ok';
}

function statusLabel(s) {
  return s === 'over' ? 'OVER' : s === 'risk' ? 'AT RISK' : 'HEALTHY';
}

function statusBadgeClass(s) {
  return s === 'over' ? 'badge-over' : s === 'risk' ? 'badge-risk' : 'badge-ok';
}

// Baseline metrics (no OT boost)
function baseMetrics(lab, viewStr) {
  const s = scale(viewStr);
  const hrsPerDay = SHIFT_HRS * (lab.productivityPct / 100);
  const demand = (lab.stdHrsPerWeek ?? 0) * s;
  const onsite = onsiteFTE(lab.labName, viewStr);
  const avail = Math.max(0, lab.totalTechs - onsite);
  const capacity = avail * hrsPerDay * lab.daysPerWeek * s;
  const margin = capacity - demand;
  const loadPct = capacity > 0 ? (demand / capacity) * 100 : (demand > 0 ? Infinity : 0);
  const otHrs = Math.max(0, demand - capacity);
  const status = getStatus(loadPct);
  return { demand, capacity, margin, loadPct, otHrs, onsite, avail, status };
}

// Scenario metrics (OT-boosted capacity for load/margin/status; raw capacity for OT Hrs)
function scenMetrics(lab, inputs, global, viewStr) {
  const s = scale(viewStr);
  const demandDeltaWeekly = toWeeklyDelta(inputs.demandVal ?? 0, inputs.demandUnit ?? 'weekly');
  const hireTechs = inputs.hireTechs ?? 0;
  const otPerWeek = inputs.otOverride ?? global.ot;
  const daysChange = inputs.daysOverride ?? global.daysDelta;
  const prodAdj = inputs.prodOverride ?? global.prodAdj;

  const scenProdPct = Math.min(100, Math.max(1, lab.productivityPct + prodAdj));
  const hrsPerDay = SHIFT_HRS * (scenProdPct / 100);
  const baseAvail = Math.max(0, lab.totalTechs - onsiteFTE(lab.labName, viewStr));
  const scenAvail = baseAvail + hireTechs;
  const scenDays = Math.min(7, Math.max(1, lab.daysPerWeek + daysChange));
  const scenTechs = lab.totalTechs + hireTechs;

  const demand = ((lab.stdHrsPerWeek ?? 0) + demandDeltaWeekly) * s;
  const capacity = scenAvail * hrsPerDay * scenDays * s;
  const effectiveCap = capacity + (otPerWeek * s);
  const margin = effectiveCap - demand;
  const loadPct = effectiveCap > 0 ? (demand / effectiveCap) * 100 : (demand > 0 ? Infinity : 0);
  const otHrs = Math.max(0, demand - capacity);  // raw (no OT boost)
  const status = getStatus(loadPct);

  return { demand, capacity, effectiveCap, margin, loadPct, otHrs, status, scenTechs, scenAvail };
}

function toWeeklyDelta(val, unit) {
  const n = Number(val) || 0;
  if (unit === 'annual') return n / WEEKS_PER_YEAR;
  if (unit === 'monthly') return n / WEEKS_PER_MONTH;
  return n;
}

// Trend: compare avg std hrs last 7 days vs 7 days ending ~30 days ago
// Uses HARDCODED_STD_HOURS_BY_MONTH as monthly proxy
function computeTrend(labName) {
  const data = typeof HARDCODED_STD_HOURS_BY_MONTH !== 'undefined' ? HARDCODED_STD_HOURS_BY_MONTH : {};
  const keys = Object.keys(data).sort();
  if (keys.length < 2) return null;
  const recent = data[keys[keys.length - 1]]?.[labName];
  const prev = data[keys[keys.length - 2]]?.[labName];
  if (recent == null || prev == null || prev === 0) return null;
  const pct = ((recent - prev) / prev) * 100;
  if (pct > 5) return 'up';
  if (pct < -5) return 'down';
  return 'flat';
}

// Historical as-of WIP for a lab — same calendar day last year, or nearest prior day with data.
function historicalAvg(labName, viewStr) {
  const daily = typeof HARDCODED_STD_HOURS_DAILY !== 'undefined' ? HARDCODED_STD_HOURS_DAILY : {};
  const histDaily = st.historicalWipDaily;
  const useDaily = Object.keys(histDaily).length ? histDaily : daily;
  if (!Object.keys(useDaily).length) return null;

  const now = referenceDate();
  // Shift back exactly one year
  const ly = new Date(now);
  ly.setFullYear(ly.getFullYear() - 1);
  const pad = n => String(n).padStart(2, '0');
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const targetLYDate = toStr(ly);
  const dates = st.historicalWipDates.length ? st.historicalWipDates : Object.keys(useDaily).sort();
  const normLab = labKey(labName);
  for (let i = dates.length - 1; i >= 0; i--) {
    const dateStr = dates[i];
    if (dateStr > targetLYDate) continue;
    const labs = useDaily[dateStr] || {};
    const v = labs[normLab] ?? labs[labName];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

// ─── DATA LAYER ──────────────────────────────────────────────────────────────
function getLatestHeadcount(labName) {
  const hc = typeof HARDCODED_MONTHLY_HEADCOUNT !== 'undefined' ? HARDCODED_MONTHLY_HEADCOUNT : {};
  const keys = Object.keys(hc).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    const v = hc[keys[i]]?.[labName];
    if (v != null) return v;
  }
  return null;
}

// Reference date — today offset by weekOffset weeks (used for week nav)
function referenceDate() {
  const d = new Date();
  d.setDate(d.getDate() + st.weekOffset * 7);
  return d;
}

// Returns { start, end, workDays } for the current period matching the view
function getPeriodDates(viewStr) {
  const now = referenceDate();
  const y = now.getFullYear(), m = now.getMonth();
  const pad = n => String(n).padStart(2, '0');
  const localStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (viewStr === 'weekly') {
    const dow = now.getDay() || 7; // Mon=1, Sun=7
    const mon = new Date(now); mon.setDate(now.getDate() - (dow - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: localStr(mon), end: localStr(sun), workDays: 5 };
  }
  if (viewStr === 'monthly') {
    return {
      start: `${y}-${pad(m+1)}-01`,
      end: localStr(new Date(y, m+1, 0)),
      workDays: Math.round(5 * WEEKS_PER_MONTH),
    };
  }
  if (viewStr === 'quarterly') {
    const fyStart = m >= 3 ? y : y - 1;
    const fiscalMo = (m - 3 + 12) % 12;         // 0=Apr
    const qIdx = Math.floor(fiscalMo / 3);        // 0,1,2,3
    const qStartCal = (qIdx * 3 + 3) % 12;       // calendar month (0=Jan)
    const qStartYear = qStartCal <= 2 ? fyStart + 1 : fyStart;
    const qEndCal = (qStartCal + 2) % 12;
    const qEndYear = qEndCal < qStartCal ? fyStart + 1 : qStartYear;
    return {
      start: localStr(new Date(qStartYear, qStartCal, 1)),
      end: localStr(new Date(qEndYear, qEndCal + 1, 0)),
      workDays: Math.round(5 * WEEKS_PER_QTR),
    };
  }
  // yearly — current fiscal year Apr–Mar
  const fyStart = m >= 3 ? y : y - 1;
  return { start: `${fyStart}-04-01`, end: `${fyStart+1}-03-31`, workDays: Math.round(5 * WEEKS_PER_YEAR) };
}

// FTE of techs away from lab doing onsite customer work during the view period
// "Number of Tech" in schedule = techs leaving the lab; reduces available capacity
function onsiteFTE(labName, viewStr) {
  if (!st.scheduleEvents.length) return 0;
  const { start: pStart, end: pEnd, workDays } = getPeriodDates(viewStr);
  const key = labKey(labName);
  const techDaysAway = onsiteTechDays(labName, viewStr);
  return workDays > 0 ? techDaysAway / workDays : 0;
}

function onsiteTechDays(labName, viewStr) {
  if (!st.scheduleEvents.length) return 0;
  const { start: pStart, end: pEnd } = getPeriodDates(viewStr);
  const key = labKey(labName);
  let techDaysAway = 0;
  for (const e of st.scheduleEvents) {
    if (e.labKey !== key || e.techCount <= 0) continue;
    const overlapStart = e.startDate > pStart ? e.startDate : pStart;
    const overlapEnd   = e.endDate   < pEnd   ? e.endDate   : pEnd;
    if (overlapStart > overlapEnd) continue;
    const days = (new Date(overlapEnd) - new Date(overlapStart)) / 86400000 + 1;
    techDaysAway += days * e.techCount;
  }
  return techDaysAway;
}

function buildLabList() {
  const labs = [];
  const seen = new Set();
  for (const base of BASE_LABS) {
    const key = mapToCanonicalLabKey(base.lab);
    if (seen.has(key)) continue;
    if (!isLabActive(key)) continue;
    seen.add(key);

    const settings = st.labSettings[key] ?? {};
    const dbEntry = st.dbStdHrs[key];
    const rawStdHrs = dbEntry?.stdHrsPerWeek ?? base.stdHrs;
    const mappedSystem = st.labMapping.systemByCanonicalKey[key];
    const isMappedIndy = mappedSystem === 'indysoft';
    // Only show labs that have actual demand data OR are IndySoft (tracked separately)
    if (rawStdHrs == null && !isMappedIndy && !isIndySoft(base.lab)) continue;
    const stdHrs = rawStdHrs ?? 0;
    const displayName = canonicalLabNameForKey(key, base.lab);
    const totalTechs = getLatestHeadcount(displayName) ?? getLatestHeadcount(base.lab) ?? base.techs;
    const productivityPct = settings.productivityPct ?? DEFAULT_PROD_PCT;
    const daysPerWeek = settings.daysPerWeek ?? 5;

    labs.push({
      labName: displayName,
      labKey: key,
      systemType: mappedSystem || systemType(base.lab, settings),
      totalTechs,
      productivityPct,
      daysPerWeek,
      stdHrsPerWeek: stdHrs,
    });
  }
  st.labList = labs;
}

// ─── API ─────────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadData() {
  try {
    st.dbStdHrs = {};
    st.scheduleEvents = [];
    st.historicalWipDaily = {};
    st.historicalWipDates = [];

    const [mappingRes, stdHrsRes, schedulesRes, settingsRes, scenariosRes, historicalWipRes] = await Promise.allSettled([
      apiFetch('/api/lab-mapping'),
      apiFetch('/api/std-hours/current'),
      apiFetch('/api/schedules'),
      apiFetch('/api/lab-settings'),
      apiFetch('/api/scenarios'),
      apiFetch('/api/historical-wip'),
    ]);

    if (mappingRes.status === 'fulfilled') {
      const map = mappingRes.value || EMPTY_LAB_MAPPING;
      st.labMapping = {
        aliasToCanonicalKey: map.aliasToCanonicalKey || {},
        canonicalLabByKey: map.canonicalLabByKey || {},
        systemByCanonicalKey: map.systemByCanonicalKey || {},
        isActiveByCanonicalKey: map.isActiveByCanonicalKey || {},
        activeLabKeySet: new Set((map.activeLabs || []).map(l => l.labKey).filter(Boolean)),
      };
    } else {
      st.labMapping = {
        aliasToCanonicalKey: {},
        canonicalLabByKey: {},
        systemByCanonicalKey: {},
        isActiveByCanonicalKey: {},
        activeLabKeySet: new Set(),
      };
    }

    if (stdHrsRes.status === 'fulfilled') {
      const { labs, dataDate } = stdHrsRes.value;
      st.dataDate = dataDate;
      labs.forEach(l => {
        const key = mapToCanonicalLabKey(l.labKey || l.labRaw);
        if (isLabActive(key)) st.dbStdHrs[key] = {...l, labKey: key};
      });
      if (dataDate) {
        const d = new Date(dataDate + 'T00:00:00');
        document.getElementById('data-date-label').textContent =
          'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    if (schedulesRes.status === 'fulfilled') {
      st.scheduleEvents = (schedulesRes.value.events ?? []).map(e => {
        const raw = e.labKey || e.lab;
        return {
          labKey: mapToCanonicalLabKey(raw),
          startDate: e.startDate,
          endDate: e.endDate,
          techCount: e.techCount,
        };
      }).filter(e => isLabActive(e.labKey));
    }

    if (settingsRes.status === 'fulfilled') {
      const rawSettings = settingsRes.value.settings ?? {};
      const mapped = {};
      Object.entries(rawSettings).forEach(([rawKey, val]) => {
        const canonicalKey = mapToCanonicalLabKey(rawKey);
        mapped[canonicalKey] = val;
      });
      st.labSettings = mapped;
    }

    if (scenariosRes.status === 'fulfilled') {
      st.savedScenarios = scenariosRes.value.scenarios ?? [];
      renderScenarioDropdown();
    }

    if (historicalWipRes.status === 'fulfilled') {
      st.historicalWipDaily = historicalWipRes.value.dailyByDate ?? {};
      st.historicalWipDates = Object.keys(st.historicalWipDaily).sort();
    } else {
      st.historicalWipDaily = {};
      st.historicalWipDates = [];
    }
  } catch (e) {
    console.error('loadData error:', e);
  }

  buildLabList();
}

// ─── NAV & FILTERS ───────────────────────────────────────────────────────────
function switchTab(tabName) {
  st.tab = tabName;
  document.querySelectorAll('.nav-tab').forEach((el, i) => {
    const tabs = ['status-board', 'scenario-planner'];
    el.classList.toggle('active', tabs[i] === tabName);
  });
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + tabName).classList.add('active');
  if (tabName === 'scenario-planner') renderScenarioPlanner();
}

function setView(v) {
  st.view = v;
  setSegActive('seg-view', v, { weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' });
  updateTableHeaders();
  renderStatusBoard();
}

function setFilter(key, val) {
  st.filters[key] = val.toLowerCase ? val.toLowerCase() : val;
  if (key === 'system') setSegActive('seg-system', val, { all:'All', caltrak:'CalTrak', indysoft:'IndySoft' });
  if (key === 'status') setSegActive('seg-status', val, { all:'All', over:'OVER', risk:'AT RISK', ok:'HEALTHY' });
  renderStatusBoard();
}

function getAvailableLabNames() {
  return [...new Set(st.labList.map(l => l.labName))].sort((a, b) => a.localeCompare(b));
}

function updateLabPickerSummary(availableLabNames = getAvailableLabNames()) {
  const summaryEl = document.getElementById('lab-picker-summary');
  if (!summaryEl) return;
  const selectedCount = st.filters.selectedLabs.size;
  const totalCount = availableLabNames.length;
  if (!totalCount) {
    summaryEl.textContent = 'No labs available';
    return;
  }
  if (selectedCount === 0) {
    summaryEl.textContent = 'No labs selected';
    return;
  }
  if (selectedCount === totalCount) {
    summaryEl.textContent = 'All labs';
    return;
  }
  summaryEl.textContent = selectedCount === 1 ? '1 lab selected' : `${selectedCount} labs selected`;
}

function syncLabPickerSelection(availableLabNames) {
  const availableSet = new Set(availableLabNames);
  const filteredSelected = [...st.filters.selectedLabs].filter(name => availableSet.has(name));
  if (!labPickerInitialized) {
    st.filters.selectedLabs = new Set(availableLabNames);
    labPickerInitialized = true;
    return;
  }
  if (st.filters.selectedLabs.size > 0 && filteredSelected.length === 0 && availableLabNames.length) {
    st.filters.selectedLabs = new Set(availableLabNames);
    return;
  }
  st.filters.selectedLabs = new Set(filteredSelected);
}

function renderLabPickerOptions() {
  const menu = document.getElementById('lab-picker-menu');
  if (!menu) return;
  const availableLabNames = getAvailableLabNames();
  syncLabPickerSelection(availableLabNames);
  updateLabPickerSummary(availableLabNames);

  if (!availableLabNames.length) {
    labPickerSearchTerm = '';
    menu.innerHTML = '<div class="lab-picker-empty">No labs available for this view.</div>';
    return;
  }

  const optionsHtml = availableLabNames
    .map(name => `<label class="lab-picker-option" data-lab-key="${esc(labKey(name))}"><input type="checkbox" value="${esc(name)}" onchange="toggleLabSelection(this.value, this.checked)" ${st.filters.selectedLabs.has(name) ? 'checked' : ''}><span>${esc(name)}</span></label>`)
    .join('');

  menu.innerHTML = `
    <div class="lab-picker-actions">
      <button type="button" class="lab-picker-action" onclick="selectAllLabs(event)">Select all</button>
      <button type="button" class="lab-picker-action" onclick="deselectAllLabs(event)">Deselect all</button>
    </div>
    <div class="lab-picker-search-wrap">
      <input type="text" class="lab-picker-search" id="lab-picker-search" placeholder="Search labs..." value="${esc(labPickerSearchTerm)}" oninput="onLabPickerSearchInput(this.value)">
    </div>
    <div class="lab-picker-list" id="lab-picker-list">${optionsHtml}</div>
    <div class="lab-picker-empty" id="lab-picker-no-results" hidden>No labs match your search.</div>
  `;
  applyLabPickerSearch();
}

function toggleLabSelection(labName, isSelected) {
  if (isSelected) st.filters.selectedLabs.add(labName);
  else st.filters.selectedLabs.delete(labName);
  updateLabPickerSummary();
  renderStatusBoard();
}

function selectAllLabs(e) {
  if (e) e.stopPropagation();
  st.filters.selectedLabs = new Set(getAvailableLabNames());
  renderLabPickerOptions();
  renderStatusBoard();
}

function deselectAllLabs(e) {
  if (e) e.stopPropagation();
  st.filters.selectedLabs.clear();
  renderLabPickerOptions();
  renderStatusBoard();
}

function onLabPickerSearchInput(value) {
  labPickerSearchTerm = labKey(value || '');
  applyLabPickerSearch();
}

function applyLabPickerSearch() {
  const list = document.getElementById('lab-picker-list');
  if (!list) return;
  const noResultsEl = document.getElementById('lab-picker-no-results');
  const options = list.querySelectorAll('.lab-picker-option');
  let shownCount = 0;
  options.forEach(option => {
    const key = option.getAttribute('data-lab-key') || '';
    const isMatch = !labPickerSearchTerm || key.includes(labPickerSearchTerm);
    option.style.display = isMatch ? '' : 'none';
    if (isMatch) shownCount += 1;
  });
  if (noResultsEl) noResultsEl.style.display = shownCount === 0 ? 'block' : 'none';
}

function toggleLabPickerMenu(e) {
  if (e) e.stopPropagation();
  const picker = document.getElementById('lab-picker');
  const menu = document.getElementById('lab-picker-menu');
  if (!picker || !menu) return;
  const isHidden = menu.hasAttribute('hidden');
  if (isHidden) {
    menu.removeAttribute('hidden');
    picker.classList.add('open');
    const searchInput = document.getElementById('lab-picker-search');
    if (searchInput) searchInput.focus();
  } else {
    menu.setAttribute('hidden', '');
    picker.classList.remove('open');
  }
}

function closeLabPickerMenu() {
  const picker = document.getElementById('lab-picker');
  const menu = document.getElementById('lab-picker-menu');
  if (!picker || !menu) return;
  menu.setAttribute('hidden', '');
  picker.classList.remove('open');
}

function handleDocumentClickForLabPicker(e) {
  const picker = document.getElementById('lab-picker');
  if (!picker) return;
  if (!picker.contains(e.target)) closeLabPickerMenu();
}

// ─── WEEK NAVIGATION ─────────────────────────────────────────────────────────
function shiftWeek(delta) {
  st.weekOffset += delta;
  updateWeekLabel();
  renderStatusBoard();
}

function resetWeek() {
  st.weekOffset = 0;
  updateWeekLabel();
  renderStatusBoard();
}

function updateWeekLabel() {
  const ref = referenceDate();
  const dow = ref.getDay() || 7;
  const mon = new Date(ref); mon.setDate(ref.getDate() - (dow - 1));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const fmt = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  const lbl = document.getElementById('week-label');
  if (lbl) lbl.textContent = `${fmt(mon)} – ${fmt(fri)}`;
  const todayBtn = document.getElementById('today-btn');
  if (todayBtn) todayBtn.style.display = st.weekOffset !== 0 ? 'inline-block' : 'none';
}

// ─── SUMMARY CARDS ───────────────────────────────────────────────────────────
function renderSummaryCards() {
  const all = st.labList;
  const counts = { over: 0, risk: 0, ok: 0 };
  let totalOnsiteTechDays = 0;
  all.forEach(lab => {
    const m = baseMetrics(lab, st.view);
    const s = m.status;
    totalOnsiteTechDays += onsiteTechDays(lab.labName, st.view);
    if (counts[s] !== undefined) counts[s]++;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('card-total', all.length);
  set('card-over',  counts.over);
  set('card-risk',  counts.risk);
  set('card-ok',    counts.ok);
  const totalOnsiteFTE = totalOnsiteTechDays / 5;
  set('card-onsite', fmt(totalOnsiteFTE, 1));
  const onsiteSub = document.getElementById('card-onsite-sub');
  if (onsiteSub) onsiteSub.textContent = `${fmtInt(totalOnsiteTechDays)} tech-days away · ${st.view}`;
}

function setSegActive(groupId, val, labelMap) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.seg-btn').forEach(btn => {
    const btnVal = Object.keys(labelMap).find(k => labelMap[k] === btn.textContent.trim()) ?? btn.textContent.trim().toLowerCase();
    btn.classList.toggle('active', btnVal === val || btn.textContent.trim() === val ||
      (val === 'all' && btn.textContent.trim() === 'All') ||
      (val === 'over' && btn.textContent.trim() === 'OVER') ||
      (val === 'risk' && btn.textContent.trim() === 'AT RISK') ||
      (val === 'ok' && btn.textContent.trim() === 'HEALTHY') ||
      (val === 'caltrak' && btn.textContent.trim() === 'CalTrak') ||
      (val === 'indysoft' && btn.textContent.trim() === 'IndySoft') ||
      (val === 'weekly' && btn.textContent.trim() === 'Weekly') ||
      (val === 'monthly' && btn.textContent.trim() === 'Monthly') ||
      (val === 'quarterly' && btn.textContent.trim() === 'Quarterly') ||
      (val === 'yearly' && btn.textContent.trim() === 'Yearly'));
  });
}

function updateTableHeaders() {
  const lbl = VIEW_LABEL[st.view] ?? '';
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('th-demand', lbl + ' Demand');
  set('th-hist',   'LY As-Of');
  set('th-capacity', lbl + ' Capacity');
  set('th-margin', lbl + ' Margin');
  set('th-ot', 'OT Hrs Needed');
}

function sortBy(key) {
  if (st.sortKey === key) st.sortDir *= -1;
  else { st.sortKey = key; st.sortDir = -1; }
  renderStatusBoard();
}

// ─── STATUS BOARD ────────────────────────────────────────────────────────────
function filteredLabs() {
  const { system, status } = st.filters;
  const selected = st.filters.selectedLabs;
  return st.labList.filter(lab => {
    if (system !== 'all' && lab.systemType !== system) return false;
    if (!selected.has(lab.labName)) return false;
    const m = baseMetrics(lab, st.view);
    if (status !== 'all' && m.status !== status) return false;
    return true;
  });
}

function sortedLabs(labs) {
  const key = st.sortKey;
  return [...labs].sort((a, b) => {
    const ma = baseMetrics(a, st.view);
    const mb = baseMetrics(b, st.view);
    let va, vb;
    switch (key) {
      case 'lab':      va = a.labName; vb = b.labName; break;
      case 'system':   va = a.systemType; vb = b.systemType; break;
      case 'status':   va = ma.loadPct; vb = mb.loadPct; break;
      case 'techs':    va = a.totalTechs; vb = b.totalTechs; break;
      case 'onsite':   va = ma.onsite; vb = mb.onsite; break;
      case 'avail':    va = baseMetrics(a, st.view).avail; vb = baseMetrics(b, st.view).avail; break;
      case 'prod':     va = a.productivityPct; vb = b.productivityPct; break;
      case 'demand':   va = ma.demand; vb = mb.demand; break;
      case 'capacity': va = ma.capacity; vb = mb.capacity; break;
      case 'margin':   va = ma.margin; vb = mb.margin; break;
      case 'load':     va = ma.loadPct; vb = mb.loadPct; break;
      case 'ot':       va = ma.otHrs; vb = mb.otHrs; break;
      case 'hist':     va = historicalAvg(a.labName, st.view) ?? -1; vb = historicalAvg(b.labName, st.view) ?? -1; break;
      default: va = 0; vb = 0;
    }
    if (typeof va === 'string') return st.sortDir * va.localeCompare(vb);
    return st.sortDir * ((vb ?? -Infinity) - (va ?? -Infinity));
  });
}

function renderStatusBoard() {
  updateWeekLabel();
  renderSummaryCards();
  renderLabPickerOptions();
  const labs = sortedLabs(filteredLabs());
  const tbody = document.getElementById('status-tbody');
  if (!labs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="13">No labs match the current filters.</td></tr>';
    return;
  }

  // Show prod override note if any lab has custom productivity
  const hasCustomProd = st.labList.some(l => {
    const s = st.labSettings[l.labKey];
    return s && s.productivityPct !== DEFAULT_PROD_PCT;
  });
  const note = document.getElementById('prod-override-note');
  if (note) note.hidden = !hasCustomProd;

  tbody.innerHTML = labs.map(lab => {
    const m = baseMetrics(lab, st.view);
    const sysType = lab.systemType;
    const lc = m.status;

    const loadClass = lc === 'over' ? 'load-over' : lc === 'risk' ? 'load-risk' : 'load-ok';
    const marginClass = m.margin >= 0 ? 'margin-pos' : 'margin-neg';
    const otClass = m.otHrs > 0 ? 'ot-pos' : 'ot-zero';

    return `<tr onclick="openModal('${esc(lab.labName)}')">
      <td class="td-lab">${esc(lab.labName)}</td>
      <td><span class="badge ${sysType === 'indysoft' ? 'badge-indysoft' : 'badge-caltrak'}">${sysType === 'indysoft' ? 'IndySoft' : 'CalTrak'}</span></td>
      <td><span class="badge ${statusBadgeClass(lc)}">${statusLabel(lc)}</span></td>
      <td class="td-num">${lab.totalTechs}</td>
      <td class="td-num">${fmt(m.onsite, 1)}</td>
      <td class="td-num">${fmt(m.avail, 1)}</td>
      <td class="td-num" onclick="event.stopPropagation()">
        <input class="prod-input" type="number" min="1" max="100"
          value="${lab.productivityPct}"
          onchange="saveProdPct('${esc(lab.labName)}','${esc(lab.labKey)}',this.value)"
          title="Edit productivity %">%
      </td>
      <td class="td-num">${fmtInt(m.demand)}</td>
      <td class="td-num" style="color:#a1a1aa">${fmtInt(historicalAvg(lab.labName, st.view))}</td>
      <td class="td-num">${fmtInt(m.capacity)}</td>
      <td class="td-num ${marginClass}">${fmtSgn(m.margin, 0)}</td>
      <td class="td-num ${loadClass}">${fmt(m.loadPct, 1)}%</td>
      <td class="td-num ${otClass}">${m.otHrs > 0 ? fmtInt(m.otHrs) : '—'}</td>
    </tr>`;
  }).join('');
}

async function saveProdPct(labName, key, rawVal) {
  const pct = Math.min(100, Math.max(1, Number(rawVal) || DEFAULT_PROD_PCT));
  st.labSettings[key] = { ...(st.labSettings[key] ?? {}), productivityPct: pct, daysPerWeek: st.labSettings[key]?.daysPerWeek ?? 5 };
  buildLabList();
  renderStatusBoard();
  try {
    await apiFetch(`/api/lab-settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labRaw: labName, productivityPct: pct, daysPerWeek: st.labSettings[key]?.daysPerWeek ?? 5, systemType: systemType(labName, st.labSettings[key]) }),
    });
  } catch (e) { console.error('saveProdPct failed:', e); }
}

// ─── LAB DETAIL MODAL ────────────────────────────────────────────────────────
async function openModal(labName) {
  st.modalLabName = labName;
  const lab = st.labList.find(l => l.labName === labName);
  if (!lab) return;

  const m = baseMetrics(lab, 'weekly');
  const lc = m.status;

  document.getElementById('modal-lab-name').textContent = labName;
  document.getElementById('modal-lab-sub').innerHTML = `
    <span class="badge ${statusBadgeClass(lc)}">${statusLabel(lc)}</span>
    <span>Load: <strong>${fmt(m.loadPct, 1)}%</strong></span>
    <span>OT: <strong>${m.otHrs > 0 ? fmtInt(m.otHrs) + ' hrs/wk' : '—'}</strong></span>
    <span style="color:#d1d5db">|</span>
    <span>${fmt(baseMetrics(lab,'weekly').avail, 1)} avail · ${lab.daysPerWeek} days/wk · ${lab.productivityPct}% prod</span>
  `;
  document.getElementById('lab-modal').removeAttribute('hidden');

  buildLabChart(lab);
  buildModalStats(lab);
}

function closeModal() {
  document.getElementById('lab-modal').setAttribute('hidden', '');
  if (st.chart) { st.chart.destroy(); st.chart = null; }
  st.modalLabName = null;
}

function onModalBackdropClick(e) {
  if (e.target === document.getElementById('lab-modal')) closeModal();
}

// Compute monthly load % for a lab using historical headcount where available,
// falling back to the lab's current headcount for months not in the dataset.
function monthlyLoadPct(lab, fyStartYear) {
  const wipData   = typeof HARDCODED_STD_HOURS_BY_MONTH    !== 'undefined' ? HARDCODED_STD_HOURS_BY_MONTH    : {};
  const hcData    = typeof HARDCODED_MONTHLY_HEADCOUNT     !== 'undefined' ? HARDCODED_MONTHLY_HEADCOUNT     : {};

  return FY_MONTH_SUFFIXES.map(mo => {
    const yr  = mo <= '03' ? fyStartYear + 1 : fyStartYear;
    const key = `${yr}-${mo}`;
    const demand = wipData[key]?.[lab.labName];
    if (demand == null) return null;
    const techs = hcData[key]?.[lab.labName] ?? lab.totalTechs;
    const monthlyCap = techs * (SHIFT_HRS * lab.productivityPct / 100) * lab.daysPerWeek * WEEKS_PER_MONTH;
    if (monthlyCap <= 0) return null;
    return Math.round((demand / monthlyCap) * 1000) / 10;  // one decimal
  });
}

function buildLabChart(lab) {
  const fyStart     = currentFYStartYear();
  const prevFYStart = fyStart - 1;

  const thisFYLoad = monthlyLoadPct(lab, fyStart);
  const lastFYLoad = monthlyLoadPct(lab, prevFYStart);
  const hasLastFY  = lastFYLoad.some(v => v != null);
  const hasThisFY  = thisFYLoad.some(v => v != null);

  const ctx = document.getElementById('lab-chart');
  if (st.chart) { st.chart.destroy(); st.chart = null; }

  const datasets = [];

  if (hasLastFY) {
    datasets.push({
      label: `FY ${prevFYStart}–${String(prevFYStart + 1).slice(2)}`,
      data: lastFYLoad,
      borderColor: '#a78bfa',
      borderDash: [4, 3],
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 5,
      fill: false,
    });
  }

  if (hasThisFY) {
    datasets.push({
      label: `FY ${fyStart}–${String(fyStart + 1).slice(2)}`,
      data: thisFYLoad,
      borderColor: '#2563eb',
      borderWidth: 2.5,
      tension: 0.3,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
    });
  }

  st.chart = new Chart(ctx, {
    type: 'line',
    data: { labels: FY_MONTH_LABELS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, padding: 12, boxWidth: 24 } },
        tooltip: {
          callbacks: {
            label: c => `${c.dataset.label}: ${c.parsed.y != null ? c.parsed.y.toFixed(1) + '%' : '—'}`,
          },
        },
        annotation: {
          annotations: {
            overLine: {
              type: 'line', yMin: 100, yMax: 100,
              borderColor: 'rgba(239,68,68,0.5)', borderWidth: 1.5, borderDash: [5,4],
              label: { content: 'Over capacity', display: true, position: 'end',
                       font: { size: 9 }, color: '#ef4444', backgroundColor: 'transparent' },
            },
            riskLine: {
              type: 'line', yMin: 80, yMax: 80,
              borderColor: 'rgba(217,119,6,0.4)', borderWidth: 1.5, borderDash: [5,4],
              label: { content: 'At risk', display: true, position: 'end',
                       font: { size: 9 }, color: '#d97706', backgroundColor: 'transparent' },
            },
          },
        },
      },
      scales: {
        x: { grid: { color: '#f4f4f5' }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: '#f4f4f5' },
          min: 0,
          ticks: {
            font: { size: 11 },
            callback: v => v + '%',
          },
          title: { display: true, text: 'Load % (demand ÷ capacity)', font: { size: 10 }, color: '#a1a1aa' },
        },
      },
    },
  });
}

function buildModalStats(lab) {
  const fyStart     = currentFYStartYear();
  const prevFYStart = fyStart - 1;

  const thisFYLoad = monthlyLoadPct(lab, fyStart).filter(v => v != null);
  const lastFYLoad = monthlyLoadPct(lab, prevFYStart).filter(v => v != null);

  const avgThis = thisFYLoad.length ? thisFYLoad.reduce((a,b) => a+b, 0) / thisFYLoad.length : null;
  const avgLast = lastFYLoad.length ? lastFYLoad.reduce((a,b) => a+b, 0) / lastFYLoad.length : null;
  const peakThis = thisFYLoad.length ? Math.max(...thisFYLoad) : null;
  const moOver   = thisFYLoad.filter(v => v > 100).length;
  const yoy = avgThis != null && avgLast != null && avgLast > 0
    ? avgThis - avgLast : null;

  const loadColor = v => v == null ? '#18181b' : v > 100 ? '#ef4444' : v >= 80 ? '#d97706' : '#16a34a';
  const sign = v => v > 0 ? '+' : '';

  const statsEl = document.getElementById('modal-stats');
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Avg load · FY${fyStart}–${String(fyStart+1).slice(2)}</div>
      <div class="stat-value" style="color:${loadColor(avgThis)}">${avgThis != null ? fmt(avgThis,1)+'%' : '—'}</div>
      <div class="stat-sub">${moOver > 0 ? moOver + ' month' + (moOver>1?'s':'')+' over capacity' : 'No months over capacity'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Peak load · this FY</div>
      <div class="stat-value" style="color:${loadColor(peakThis)}">${peakThis != null ? fmt(peakThis,1)+'%' : '—'}</div>
      <div class="stat-sub">highest single month</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg load · FY${prevFYStart}–${String(prevFYStart+1).slice(2)}</div>
      <div class="stat-value" style="color:${loadColor(avgLast)}">${avgLast != null ? fmt(avgLast,1)+'%' : '—'}</div>
      <div class="stat-sub">
        ${yoy != null ? `<span style="color:${yoy > 5 ? '#ef4444' : yoy < -5 ? '#16a34a' : '#d97706'}">${sign(yoy)}${fmt(yoy,1)}pp vs last FY</span>` : 'Insufficient prior-year data'}
      </div>
    </div>
  `;
}

// ─── SCENARIO PLANNER ────────────────────────────────────────────────────────
function setScenView(v) {
  st.scen.view = v;
  const group = document.getElementById('seg-scen-view');
  if (group) {
    const labels = { weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' };
    group.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === labels[v]);
    });
  }
  renderScenarioResults();
}

function adjustGlobal(field, delta) {
  if (field === 'ot') {
    st.scen.globalOt = Math.max(0, st.scen.globalOt + delta);
    document.getElementById('global-ot-val').textContent = st.scen.globalOt;
  } else if (field === 'prod') {
    st.scen.globalProdAdj = Math.max(-50, Math.min(50, st.scen.globalProdAdj + delta));
    document.getElementById('global-prod-val').textContent = st.scen.globalProdAdj + '%';
  } else if (field === 'days') {
    st.scen.globalDaysDelta = Math.max(-4, Math.min(4, st.scen.globalDaysDelta + delta));
    document.getElementById('global-days-val').textContent = st.scen.globalDaysDelta;
  }
  renderScenarioResults();
}

function addScenLab(labName) {
  if (!labName) return;
  st.scen.selectedLabs.add(labName);
  if (!st.scen.perLab[labName]) {
    st.scen.perLab[labName] = { demandVal: 0, demandUnit: 'weekly', hireTechs: 0, otOverride: null, daysOverride: null, prodOverride: null };
  }
  document.getElementById('scen-lab-picker').value = '';
  renderScenLabTags();
  renderScenarioResults();
}

function removeScenLab(labName) {
  st.scen.selectedLabs.delete(labName);
  renderScenLabTags();
  renderScenarioResults();
}

function renderScenLabTags() {
  const container = document.getElementById('scen-lab-tags');
  if (!container) return;
  container.innerHTML = [...st.scen.selectedLabs].map(name =>
    `<span class="lab-tag">${esc(name)}<span class="lab-tag-x" onclick="removeScenLab('${esc(name)}')">×</span></span>`
  ).join('');

  const title = document.getElementById('impact-cards-title');
  if (title) title.textContent = `Scenario impact · ${st.scen.selectedLabs.size} lab${st.scen.selectedLabs.size === 1 ? '' : 's'}`;
}

function populateScenLabPicker() {
  const picker = document.getElementById('scen-lab-picker');
  if (!picker) return;
  picker.innerHTML = '<option value="">Add a lab…</option>' +
    st.labList.map(l => `<option value="${esc(l.labName)}">${esc(l.labName)}</option>`).join('');
}

function renderScenarioPlanner() {
  populateScenLabPicker();
  renderScenLabTags();
  renderScenarioResults();
  renderScenarioDropdown();
}

function renderScenarioDropdown() {
  const sel = document.getElementById('scen-profile-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Saved scenarios…</option>' +
    st.savedScenarios.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

function getScenGlobal() {
  return { ot: st.scen.globalOt, prodAdj: st.scen.globalProdAdj, daysDelta: st.scen.globalDaysDelta };
}

function renderScenarioResults() {
  renderImpactCards();
  renderScenRows();
}

function renderImpactCards() {
  const list = document.getElementById('impact-cards-list');
  if (!list) return;
  const labs = [...st.scen.selectedLabs].map(n => st.labList.find(l => l.labName === n)).filter(Boolean);
  if (!labs.length) {
    list.innerHTML = '<div style="color:#a1a1aa;font-size:12px;padding:4px 0">Add labs in scope to see the impact.</div>';
    return;
  }
  const g = getScenGlobal();
  const sv = st.scen.view;
  list.innerHTML = labs.map(lab => {
    const inputs = st.scen.perLab[lab.labName] ?? {};
    const before = baseMetrics(lab, sv);
    const after = scenMetrics(lab, inputs, g, sv);
    const otBefore = before.otHrs;
    const otAfter = after.otHrs;
    return `<div class="impact-card">
      <div class="impact-lab" title="${esc(lab.labName)}">${esc(lab.labName)}</div>
      <span class="badge ${statusBadgeClass(before.status)}">${statusLabel(before.status)} · ${fmt(before.loadPct,1)}%</span>
      <span class="impact-arrow">→</span>
      <span class="badge ${statusBadgeClass(after.status)}">${statusLabel(after.status)} · ${fmt(after.loadPct,1)}%</span>
      <div class="impact-ot">
        <div class="impact-ot-label">OT needed</div>
        <div class="impact-ot-val">${otBefore > 0 ? fmtInt(otBefore) : '—'} → ${otAfter > 0 ? fmtInt(otAfter) : '—'}</div>
      </div>
    </div>`;
  }).join('');
}

function renderScenRows() {
  const el = document.getElementById('scen-rows');
  if (!el) return;
  const labs = [...st.scen.selectedLabs].map(n => st.labList.find(l => l.labName === n)).filter(Boolean);
  if (!labs.length) {
    el.innerHTML = '<div style="padding:32px;text-align:center;color:#a1a1aa;font-size:12px">No labs selected.</div>';
    return;
  }
  const g = getScenGlobal();
  const sv = st.scen.view;
  el.innerHTML = labs.map(lab => {
    const inputs = st.scen.perLab[lab.labName] ?? {};
    const b = baseMetrics(lab, sv);
    const s = scenMetrics(lab, inputs, g, sv);
    const sc = b.status;
    const rc = s.status;
    const demVal = inputs.demandVal ?? 0;
    const demUnit = inputs.demandUnit ?? 'weekly';
    const weeklyEquiv = toWeeklyDelta(demVal, demUnit);
    const hireTechs = inputs.hireTechs ?? 0;

    const otOverrideVal = inputs.otOverride;
    const daysOverrideVal = inputs.daysOverride;
    const lname = esc(lab.labName);

    const subLabel = [
      hireTechs !== 0 ? `${hireTechs > 0 ? '+' : ''}${hireTechs} techs` : null,
      demVal !== 0 ? `${demVal > 0 ? '+' : ''}${demVal.toLocaleString()} ${demUnit} hrs demand` : null,
      `${otOverrideVal ?? g.ot} OT hrs/wk ${otOverrideVal == null ? '(global)' : '(override)'}`,
    ].filter(Boolean).join(' · ');

    return `<div class="scen-lab-block">
      <div class="scen-row row-baseline s-${sc}">
        <div><div class="scen-row-label" style="font-weight:600">${lname}</div><div class="scen-row-sublabel">Baseline · current</div></div>
        <span>${lab.totalTechs}</span><span>${fmt(baseMetrics(lab, st.scen.view).avail, 1)}</span>
        <span>${fmtInt(b.demand)}</span><span>${fmtInt(b.capacity)}</span>
        <span class="${b.margin >= 0 ? 'margin-pos' : 'margin-neg'}">${fmtSgn(b.margin,0)}</span>
        <span class="${'load-' + sc}">${fmt(b.loadPct,1)}%</span>
        <span class="${b.otHrs > 0 ? 'ot-pos' : 'ot-zero'}">${b.otHrs > 0 ? fmtInt(b.otHrs) : '—'}</span>
      </div>

      <div class="row-inputs">
        <span class="ri-label">${lname.substring(0,12)}…</span>

        <span class="ri-chip">
          <span class="ri-chip-label">Demand</span>
          <div class="stepper" style="zoom:.9">
            <button class="step-btn" onclick="adjustPerLab('${lname}','demandVal',-${demUnit==='annual'?1000:demUnit==='monthly'?100:10})">−</button>
            <div class="step-val">${demVal >= 0 ? '+' : ''}${demVal.toLocaleString()}</div>
            <button class="step-btn" onclick="adjustPerLab('${lname}','demandVal',${demUnit==='annual'?1000:demUnit==='monthly'?100:10})">+</button>
          </div>
          <select class="ri-unit" onchange="setPerLabUnit('${lname}',this.value)">
            <option value="weekly" ${demUnit==='weekly'?'selected':''}>wk hrs</option>
            <option value="monthly" ${demUnit==='monthly'?'selected':''}>mo hrs</option>
            <option value="annual" ${demUnit==='annual'?'selected':''}>annual hrs</option>
          </select>
          ${Math.abs(weeklyEquiv) > 0.1 ? `<span class="ri-equiv">≈ ${weeklyEquiv > 0?'+':''}${fmt(weeklyEquiv,1)}/wk</span>` : ''}
        </span>

        <div class="ri-sep"></div>

        <span class="ri-chip">
          <span class="ri-chip-label">Hire techs</span>
          <div class="stepper" style="zoom:.9">
            <button class="step-btn" onclick="adjustPerLab('${lname}','hireTechs',-1)">−</button>
            <div class="step-val">${hireTechs >= 0 ? '+' : ''}${hireTechs}</div>
            <button class="step-btn" onclick="adjustPerLab('${lname}','hireTechs',1)">+</button>
          </div>
        </span>

        <div class="ri-sep"></div>

        <span class="ri-chip">
          <span class="ri-chip-label">OT override</span>
          <div class="stepper" style="zoom:.9">
            <button class="step-btn" onclick="adjustPerLabOt('${lname}',-10)">−</button>
            <div class="step-val ${otOverrideVal == null ? 'is-global' : ''}">${otOverrideVal == null ? 'global' : otOverrideVal}</div>
            <button class="step-btn" onclick="adjustPerLabOt('${lname}',10)">+</button>
          </div>
        </span>
      </div>

      <div class="scen-row row-result s-${rc}">
        <div>
          <div class="scen-row-label" style="font-size:11px;color:${rc==='ok'?'#16a34a':rc==='risk'?'#d97706':'#ef4444'};font-weight:600">↳ With scenario</div>
          <div class="scen-row-sublabel">${esc(subLabel) || 'No changes applied'}</div>
        </div>
        <span style="font-weight:600">${s.scenTechs}</span>
        <span style="font-weight:600">${s.scenAvail}</span>
        <span>${fmtInt(s.demand)}</span>
        <span>${fmtInt(s.effectiveCap)}</span>
        <span class="${s.margin >= 0 ? 'margin-pos' : 'margin-neg'}">${fmtSgn(s.margin,0)}</span>
        <span class="${'load-' + rc}">${fmt(s.loadPct,1)}%</span>
        <span class="${s.otHrs > 0 ? 'ot-pos' : 'ot-zero'}">${s.otHrs > 0 ? fmtInt(s.otHrs) : '—'}</span>
      </div>
    </div>`;
  }).join('');
}

function getOrInitPerLab(labName) {
  if (!st.scen.perLab[labName]) {
    st.scen.perLab[labName] = { demandVal: 0, demandUnit: 'weekly', hireTechs: 0, otOverride: null, daysOverride: null, prodOverride: null };
  }
  return st.scen.perLab[labName];
}

function adjustPerLab(labName, field, delta) {
  const p = getOrInitPerLab(labName);
  p[field] = (p[field] ?? 0) + delta;
  renderScenarioResults();
}

function setPerLabUnit(labName, unit) {
  const p = getOrInitPerLab(labName);
  p.demandUnit = unit;
  renderScenarioResults();
}

function adjustPerLabOt(labName, delta) {
  const p = getOrInitPerLab(labName);
  const current = p.otOverride ?? st.scen.globalOt;
  const next = Math.max(0, current + delta);
  p.otOverride = next === st.scen.globalOt ? null : next;
  renderScenarioResults();
}

async function saveCurrentScenario() {
  const name = (document.getElementById('scen-name')?.value || '').trim() || 'Untitled';
  const config = {
    v: 2,
    selectedLabs: [...st.scen.selectedLabs],
    globalOt: st.scen.globalOt,
    globalProdAdj: st.scen.globalProdAdj,
    globalDaysDelta: st.scen.globalDaysDelta,
    perLab: st.scen.perLab,
    scenView: st.scen.view,
  };
  try {
    const body = { name, config, ...(st.scen.id ? { id: st.scen.id } : {}) };
    const res = await apiFetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    st.scen.id = res.scenario.id;
    const existing = st.savedScenarios.findIndex(s => s.id === res.scenario.id);
    if (existing >= 0) st.savedScenarios[existing] = res.scenario;
    else st.savedScenarios.unshift(res.scenario);
    renderScenarioDropdown();
    if (document.getElementById('scen-profile-select')) {
      document.getElementById('scen-profile-select').value = st.scen.id;
    }
  } catch (e) { alert('Save failed: ' + e.message); }
}

function loadSavedScenario(id) {
  if (!id) return;
  const profile = st.savedScenarios.find(s => String(s.id) === String(id));
  if (!profile) return;
  const c = profile.config ?? {};
  st.scen.id = profile.id;
  st.scen.name = profile.name;
  st.scen.selectedLabs = new Set(Array.isArray(c.selectedLabs) ? c.selectedLabs : []);
  st.scen.globalOt = c.globalOt ?? 0;
  st.scen.globalProdAdj = c.globalProdAdj ?? 0;
  st.scen.globalDaysDelta = c.globalDaysDelta ?? 0;
  st.scen.perLab = c.perLab ?? {};
  st.scen.view = c.scenView ?? 'weekly';
  // Init any missing perLab entries
  st.scen.selectedLabs.forEach(n => { if (!st.scen.perLab[n]) st.scen.perLab[n] = { demandVal:0, demandUnit:'weekly', hireTechs:0, otOverride:null, daysOverride:null, prodOverride:null }; });
  if (document.getElementById('scen-name')) document.getElementById('scen-name').value = st.scen.name;
  document.getElementById('global-ot-val').textContent = st.scen.globalOt;
  document.getElementById('global-prod-val').textContent = st.scen.globalProdAdj + '%';
  document.getElementById('global-days-val').textContent = st.scen.globalDaysDelta;
  setScenView(st.scen.view);
  renderScenLabTags();
  renderScenarioResults();
}

function resetScenario() {
  st.scen = { view: 'weekly', id: null, name: '', selectedLabs: new Set(), globalOt: 0, globalProdAdj: 0, globalDaysDelta: 0, perLab: {} };
  if (document.getElementById('scen-name')) document.getElementById('scen-name').value = '';
  if (document.getElementById('scen-profile-select')) document.getElementById('scen-profile-select').value = '';
  document.getElementById('global-ot-val').textContent = '0';
  document.getElementById('global-prod-val').textContent = '0%';
  document.getElementById('global-days-val').textContent = '0';
  renderScenLabTags();
  renderScenarioResults();
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
function openUploadModal(defaultTab = 'std-hours') {
  document.getElementById('upload-modal').removeAttribute('hidden');
  switchUploadTab(defaultTab);
}

function closeUploadModal() {
  document.getElementById('upload-modal').setAttribute('hidden', '');
}

function onUploadBackdropClick(e) {
  if (e.target === document.getElementById('upload-modal')) closeUploadModal();
}

function switchUploadTab(tabName) {
  ['std-hours', 'schedule'].forEach(t => {
    document.getElementById(`utab-${t}`)?.classList.toggle('active', t === tabName);
    const pane = document.getElementById(`upload-pane-${t}`);
    if (pane) pane.hidden = t !== tabName;
  });
}

function truncateItems(items, max = 12) {
  if (!Array.isArray(items)) return [];
  if (items.length <= max) return items;
  return items.slice(0, max);
}

function formatScheduleItem(item) {
  const range = `${item.startDate} to ${item.endDate}`;
  const nowVal = `${item.techCount} tech${item.techCount === 1 ? '' : 's'}`;
  if (item.previousTechCount != null) {
    return `${item.labRaw} (${range}): ${item.previousTechCount} -> ${item.techCount} techs`;
  }
  return `${item.labRaw} (${range}): ${nowVal}`;
}

function formatStdHoursItem(item) {
  const range = item.effectiveTo ? `${item.effectiveFrom} to ${item.effectiveTo}` : `${item.effectiveFrom}+`;
  if (item.previousStdHours != null) {
    return `${item.labRaw} (${range}): ${item.previousStdHours} -> ${item.stdHours} std hrs`;
  }
  return `${item.labRaw} (${range}): ${item.stdHours} std hrs`;
}

function formatSkippedReason(reason) {
  if (reason === 'missing_or_invalid_required_fields') return 'missing or invalid required fields';
  if (reason === 'unusable_lab') return 'lab value could not be interpreted';
  if (reason === 'inactive_lab') return 'mapped to inactive lab';
  return reason || 'skipped';
}

function renderUploadReport(type, data) {
  const lines = [];
  const s = data.summary ?? {};
  const details = s.details ?? {};
  const inserted = details.inserted ?? [];
  const updated = details.updated ?? [];
  const unchanged = details.unchanged ?? [];
  const issues = data.issues ?? [];
  const skipped = data.skipped ?? [];

  lines.push(`Upload complete.`);
  lines.push(`Rows parsed: ${data.parsedRows ?? '—'} | Valid rows: ${data.validRows ?? '—'} | Skipped rows: ${data.skippedRows ?? skipped.length ?? 0}`);
  lines.push(`Inserted: ${s.inserted ?? 0} | Updated: ${s.updated ?? 0} | Unchanged: ${s.unchanged ?? 0}`);
  if (type === 'std-hours') {
    const range = data.effectiveTo ? `${data.effectiveFrom} to ${data.effectiveTo}` : `${data.effectiveFrom} onward`;
    lines.push(`Effective range: ${range}`);
  }

  const fmtItem = type === 'std-hours' ? formatStdHoursItem : formatScheduleItem;

  if (inserted.length) {
    lines.push('');
    lines.push(`Inserted labs (${inserted.length}):`);
    truncateItems(inserted).forEach(item => lines.push(`- ${fmtItem(item)}`));
    if (inserted.length > 12) lines.push(`- ...and ${inserted.length - 12} more`);
  }

  if (updated.length) {
    lines.push('');
    lines.push(`Updated labs (${updated.length}):`);
    truncateItems(updated).forEach(item => lines.push(`- ${fmtItem(item)}`));
    if (updated.length > 12) lines.push(`- ...and ${updated.length - 12} more`);
  }

  if (unchanged.length) {
    lines.push('');
    lines.push(`Unchanged labs (${unchanged.length}):`);
    truncateItems(unchanged).forEach(item => lines.push(`- ${fmtItem(item)}`));
    if (unchanged.length > 12) lines.push(`- ...and ${unchanged.length - 12} more`);
  }

  if (skipped.length) {
    lines.push('');
    lines.push(`Skipped rows (${skipped.length}):`);
    truncateItems(skipped).forEach(item => {
      const labText = item.labRaw ? ` (${item.labRaw})` : '';
      lines.push(`- Row ${item.rowNumber}${labText}: ${formatSkippedReason(item.reason)}`);
    });
    if (skipped.length > 12) lines.push(`- ...and ${skipped.length - 12} more`);
  }

  if (issues.length) {
    lines.push('');
    lines.push(`Issues / warnings (${issues.length}):`);
    truncateItems(issues).forEach(msg => lines.push(`- ${msg}`));
    if (issues.length > 12) lines.push(`- ...and ${issues.length - 12} more`);
  }

  return lines.join('\n');
}

async function submitUpload(e, type) {
  e.preventDefault();
  const form = e.target;
  const resultEl = document.getElementById(`upload-result-${type}`);
  resultEl.className = 'upload-result';
  resultEl.textContent = 'Uploading…';

  const fd = new FormData(form);
  const url = type === 'std-hours' ? '/api/std-hours/sync' : '/api/schedules/sync';
  try {
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      const errLines = [data.error || `HTTP ${res.status}`];
      if (Array.isArray(data.issues) && data.issues.length) {
        errLines.push('', `Issues / warnings (${data.issues.length}):`);
        truncateItems(data.issues).forEach(msg => errLines.push(`- ${msg}`));
        if (data.issues.length > 12) errLines.push(`- ...and ${data.issues.length - 12} more`);
      }
      throw new Error(errLines.join('\n'));
    }
    resultEl.className = 'upload-result ok';
    resultEl.textContent = renderUploadReport(type, data);
    form.reset();
    // Refresh data
    await loadData();
    buildLabList();
    renderStatusBoard();
    if (st.tab === 'scenario-planner') renderScenarioPlanner();
  } catch (err) {
    resultEl.className = 'upload-result err';
    resultEl.textContent = 'Error: ' + err.message;
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  updateTableHeaders();
  updateWeekLabel();
  initHeaderTooltips();
  document.addEventListener('click', handleDocumentClickForLabPicker);
  await loadData();
  renderStatusBoard();
}

document.addEventListener('DOMContentLoaded', init);
