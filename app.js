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

// Calendar-month labels for modal charts
const CAL_MONTH_SUFFIXES = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const CAL_MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
  dbStdHrsTimelineByLab: {},   // { labKey: [{effectiveFrom,effectiveTo,stdHours,updatedAt}] }
  dbHeadcountByMonth: {},      // { 'YYYY-MM': { labKey: headcount } } from DB
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
  modalMetric: 'load',
  modalComparePrev: true,
  modalMonthIndex: null,
  chart: null,
};

let labPickerInitialized = false;
let labPickerSearchTerm = '';
let scenLabPickerSearchTerm = '';
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

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
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

function scenarioStatusColor(status) {
  return status === 'ok' ? '#16a34a' : status === 'risk' ? '#d97706' : '#ef4444';
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

// Scenario metrics use OT-adjusted capacity consistently for capacity, margin, load, and remaining OT.
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
  const otHrs = Math.max(0, demand - effectiveCap);
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

function getHistoricalWipSource() {
  const live = st.historicalWipDaily || {};
  if (Object.keys(live).length) {
    return {
      daily: live,
      dates: st.historicalWipDates.length ? st.historicalWipDates : Object.keys(live).sort(),
    };
  }
  const fallback = typeof HARDCODED_STD_HOURS_DAILY !== 'undefined' ? HARDCODED_STD_HOURS_DAILY : {};
  return {
    daily: fallback,
    dates: Object.keys(fallback).sort(),
  };
}

function historicalLabLookupKeys(labName) {
  const canonicalKey = mapToCanonicalLabKey(labName);
  const canonicalName = canonicalLabNameForKey(canonicalKey, labName);
  return [...new Set([
    labKey(labName),
    labKey(canonicalName),
    canonicalKey,
    labName,
    canonicalName,
  ].filter(Boolean))];
}

function getHistoricalWipForMonth(labName, monthKey, throughDate = null) {
  const { daily, dates } = getHistoricalWipSource();
  if (!dates.length) return null;
  const monthPrefix = `${monthKey}-`;
  const lookupKeys = historicalLabLookupKeys(labName);
  let total = 0;
  let count = 0;
  for (const dateStr of dates) {
    if (!dateStr.startsWith(monthPrefix)) continue;
    if (throughDate && dateStr > throughDate) continue;
    const labs = daily[dateStr] || {};
    for (const key of lookupKeys) {
      const raw = labs[key];
      if (raw != null && Number.isFinite(Number(raw))) {
        total += Number(raw);
        count += 1;
        break;
      }
    }
  }
  return count ? total / count : null;
}

function hasHistoricalWipForLab(labName) {
  const { daily, dates } = getHistoricalWipSource();
  if (!dates.length) return false;
  const lookupKeys = historicalLabLookupKeys(labName);
  for (const dateStr of dates) {
    const labs = daily[dateStr] || {};
    for (const key of lookupKeys) {
      const raw = labs[key];
      if (raw != null && Number.isFinite(Number(raw))) return true;
    }
  }
  return false;
}

// ─── DATA LAYER ──────────────────────────────────────────────────────────────
function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getHeadcountFromStaticMonth(monthData, canonicalKey) {
  if (!monthData) return null;
  for (const [name, rawVal] of Object.entries(monthData)) {
    const n = Number(rawVal);
    if (!Number.isFinite(n)) continue;
    if (mapToCanonicalLabKey(name) === canonicalKey) return n;
  }
  return null;
}

function getDbHeadcountForDateByKey(canonicalKey, refDate) {
  const byMonth = st.dbHeadcountByMonth || {};
  const months = Object.keys(byMonth).sort();
  if (!months.length) return null;
  const target = monthKeyFromDate(refDate);

  // Primary: latest uploaded value at or before target month.
  for (let i = months.length - 1; i >= 0; i--) {
    const m = months[i];
    if (m > target) continue;
    const v = byMonth[m]?.[canonicalKey];
    if (v != null) return Number(v);
  }
  return null;
}

function getStaticHeadcountForDateByKey(canonicalKey, refDate) {
  const hc = typeof HARDCODED_MONTHLY_HEADCOUNT !== 'undefined' ? HARDCODED_MONTHLY_HEADCOUNT : {};
  const keys = Object.keys(hc).sort();
  if (!keys.length) return null;
  const target = monthKeyFromDate(refDate);

  // Primary: nearest month at or before target.
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i] > target) continue;
    const v = getHeadcountFromStaticMonth(hc[keys[i]], canonicalKey);
    if (v != null) return v;
  }
  // Fallback: earliest month after target.
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] < target) continue;
    const v = getHeadcountFromStaticMonth(hc[keys[i]], canonicalKey);
    if (v != null) return v;
  }
  return null;
}

function getHeadcountForDate(labName, refDate) {
  const canonicalKey = mapToCanonicalLabKey(labName);
  const dbVal = getDbHeadcountForDateByKey(canonicalKey, refDate);
  if (dbVal != null) return dbVal;
  return getStaticHeadcountForDateByKey(canonicalKey, refDate);
}

function getLatestHeadcount(labName) {
  const canonicalKey = mapToCanonicalLabKey(labName);
  const now = referenceDate();
  const fromDate = getHeadcountForDate(labName, now);
  if (fromDate != null) return fromDate;
  // Last fallback: scan static values newest to oldest.
  const hc = typeof HARDCODED_MONTHLY_HEADCOUNT !== 'undefined' ? HARDCODED_MONTHLY_HEADCOUNT : {};
  const keys = Object.keys(hc).sort();
  for (let i = keys.length - 1; i >= 0; i--) {
    const v = getHeadcountFromStaticMonth(hc[keys[i]], canonicalKey);
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
  const refDate = referenceDate();
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
    const totalTechs = getHeadcountForDate(displayName, refDate) ?? getHeadcountForDate(base.lab, refDate) ?? getLatestHeadcount(displayName) ?? getLatestHeadcount(base.lab) ?? base.techs;
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
    st.dbStdHrsTimelineByLab = {};
    st.dbHeadcountByMonth = {};
    st.scheduleEvents = [];
    st.historicalWipDaily = {};
    st.historicalWipDates = [];

    const [mappingRes, stdHrsCurrentRes, stdHrsAllRes, schedulesRes, settingsRes, scenariosRes, historicalWipRes, headcountRes] = await Promise.allSettled([
      apiFetch('/api/lab-mapping'),
      apiFetch('/api/std-hours/current'),
      apiFetch('/api/std-hours'),
      apiFetch('/api/schedules'),
      apiFetch('/api/lab-settings'),
      apiFetch('/api/scenarios'),
      apiFetch('/api/historical-wip'),
      apiFetch('/api/headcount'),
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

    if (stdHrsCurrentRes.status === 'fulfilled') {
      const { labs, dataDate } = stdHrsCurrentRes.value;
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

    if (stdHrsAllRes.status === 'fulfilled') {
      const overrides = stdHrsAllRes.value.overrides ?? [];
      const timeline = {};
      overrides.forEach((r) => {
        const key = mapToCanonicalLabKey(r.labKey || r.lab || '');
        const from = String(r.effectiveFrom || '').slice(0, 10);
        const to = r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : null;
        const stdHours = Number(r.stdHours);
        if (!key || !from || !Number.isFinite(stdHours) || !isLabActive(key)) return;
        if (!timeline[key]) timeline[key] = [];
        timeline[key].push({
          effectiveFrom: from,
          effectiveTo: to,
          stdHours,
          updatedAt: r.updatedAt ? String(r.updatedAt) : ''
        });
      });
      Object.values(timeline).forEach((rows) => {
        rows.sort((a, b) => {
          if (a.effectiveFrom === b.effectiveFrom) return a.updatedAt > b.updatedAt ? -1 : 1;
          return a.effectiveFrom > b.effectiveFrom ? -1 : 1;
        });
      });
      st.dbStdHrsTimelineByLab = timeline;
    } else {
      st.dbStdHrsTimelineByLab = {};
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

    if (headcountRes.status === 'fulfilled') {
      const overrides = headcountRes.value.overrides ?? [];
      const byMonth = {};
      overrides.forEach((r) => {
        const month = String(r.effectiveMonth || '').slice(0, 7);
        if (!month) return;
        const key = mapToCanonicalLabKey(r.labKey || r.lab || '');
        const n = Number(r.headcount);
        if (!key || !Number.isFinite(n)) return;
        if (!byMonth[month]) byMonth[month] = {};
        byMonth[month][key] = n;
      });
      st.dbHeadcountByMonth = byMonth;
    } else {
      st.dbHeadcountByMonth = {};
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
  if (picker && !picker.contains(e.target)) closeLabPickerMenu();

  const scenPicker = document.getElementById('scen-lab-search-shell');
  if (scenPicker && !scenPicker.contains(e.target)) closeScenLabPicker();
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
  buildLabList();
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
  st.modalMonthIndex = null;
  const lab = st.labList.find(l => l.labName === labName);
  if (!lab) return;

  document.getElementById('modal-lab-name').textContent = labName;
  document.getElementById('modal-lab-sub').innerHTML = '';
  document.getElementById('lab-modal').removeAttribute('hidden');
  syncModalToolbarState();
  renderModalDetail();
}

function closeModal() {
  document.getElementById('lab-modal').setAttribute('hidden', '');
  if (st.chart) { st.chart.destroy(); st.chart = null; }
  hideChartTooltip();
  st.modalLabName = null;
  st.modalMonthIndex = null;
}

function onModalBackdropClick(e) {
  if (e.target === document.getElementById('lab-modal')) closeModal();
}

function monthKeyForYearIndex(year, monthIndex) {
  return `${year}-${CAL_MONTH_SUFFIXES[monthIndex]}`;
}

const CHART_YEAR_STYLES = {
  baseline: {
    line: '#1d4ed8',
    fill: 'rgba(29,78,216,0.14)',
  },
  current: {
    line: '#f97316',
    fill: 'rgba(249,115,22,0.14)',
  },
};

function yearLabel(year) {
  return String(year);
}

function monthLabelFromKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(n => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return '—';
  return `${new Date(y, m - 1, 1).toLocaleString('en-US', {month: 'short'})} ${y}`;
}

function calendarMonthIndexFromDate(d) {
  return d.getMonth();
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthRangeFromKey(monthKey) {
  const [year, month] = monthKey.split('-').map(n => parseInt(n, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    refDate: start,
    startDate: toISODate(start),
    endDate: toISODate(end),
  };
}

function buildEmptyMonthlySnapshot(monthKey) {
  return {monthKey, demand: null, capacity: null, load: null, ot: null, techs: null, onsite: null, avail: null};
}

function getStdHoursForDate(lab, refDate) {
  const target = toISODate(refDate);
  const key = mapToCanonicalLabKey(lab.labKey || lab.labName);
  const rows = st.dbStdHrsTimelineByLab[key] || [];

  for (const r of rows) {
    if (r.effectiveFrom <= target && (!r.effectiveTo || r.effectiveTo >= target)) {
      if (Number.isFinite(r.stdHours)) return Number(r.stdHours);
    }
  }
  for (const r of rows) {
    if (r.effectiveFrom <= target && Number.isFinite(r.stdHours)) return Number(r.stdHours);
  }

  let nearestAfter = null;
  for (const r of rows) {
    if (r.effectiveFrom > target && Number.isFinite(r.stdHours)) {
      if (!nearestAfter || r.effectiveFrom < nearestAfter.effectiveFrom) nearestAfter = r;
    }
  }
  if (nearestAfter) return Number(nearestAfter.stdHours);

  const current = st.dbStdHrs[key]?.stdHrsPerWeek;
  if (Number.isFinite(Number(current))) return Number(current);
  if (Number.isFinite(Number(lab.stdHrsPerWeek))) return Number(lab.stdHrsPerWeek);
  return 0;
}

function getChartHeadcountForDate(labName, refDate) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth() + 1;
  if (y === 2025 && m < 3) {
    return getHeadcountForDate(labName, new Date(2025, 2, 1));
  }
  return getHeadcountForDate(labName, refDate);
}

function onsiteTechDaysForRange(labName, startDate, endDate) {
  if (!st.scheduleEvents.length) return 0;
  const key = mapToCanonicalLabKey(labName);
  let techDaysAway = 0;
  for (const e of st.scheduleEvents) {
    if (e.labKey !== key || e.techCount <= 0) continue;
    const overlapStart = e.startDate > startDate ? e.startDate : startDate;
    const overlapEnd = e.endDate < endDate ? e.endDate : endDate;
    if (overlapStart > overlapEnd) continue;
    const days = (new Date(`${overlapEnd}T00:00:00`) - new Date(`${overlapStart}T00:00:00`)) / 86400000 + 1;
    techDaysAway += days * e.techCount;
  }
  return techDaysAway;
}

function getMetricValue(snapshot, metric) {
  if (!snapshot) return null;
  if (metric === 'demand') return snapshot.demand;
  if (metric === 'capacity') return snapshot.capacity;
  if (metric === 'ot') return snapshot.ot;
  return snapshot.load;
}

function formatModalMetricValue(metric, val) {
  if (val == null || !Number.isFinite(val)) return '—';
  if (metric === 'load') return `${fmt(val, 1)}%`;
  return `${fmtInt(val)} hrs`;
}

function modalMetricColor(metric, val) {
  if (val == null || !Number.isFinite(val)) return '#18181b';
  if (metric === 'load') return val > 100 ? '#ef4444' : val >= 80 ? '#d97706' : '#16a34a';
  if (metric === 'capacity') return '#0f766e';
  if (metric === 'demand') return '#4f46e5';
  if (metric === 'ot') return val > 0 ? '#ef4444' : '#16a34a';
  return '#18181b';
}

function hasModalSnapshotData(snapshot) {
  return Boolean(snapshot && [snapshot.demand, snapshot.capacity, snapshot.load, snapshot.ot].some(v => v != null && Number.isFinite(v)));
}

function ensureChartTooltip(wrapper) {
  let tooltipEl = wrapper.querySelector('.chart-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    wrapper.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function hideChartTooltip() {
  const wrapper = document.querySelector('.lab-chart-wrap');
  const tooltipEl = wrapper?.querySelector('.chart-tooltip');
  if (tooltipEl) tooltipEl.classList.remove('is-visible');
}

function renderChartTooltip(context, tooltipData) {
  const {chart, tooltip} = context;
  const wrapper = chart?.canvas?.parentNode;
  if (!wrapper) return;
  const tooltipEl = ensureChartTooltip(wrapper);

  if (!tooltip || tooltip.opacity === 0) {
    tooltipEl.classList.remove('is-visible');
    return;
  }

  const dataIndex = tooltip.dataPoints?.[0]?.dataIndex;
  if (dataIndex == null) {
    tooltipEl.classList.remove('is-visible');
    return;
  }

  const baselineSnap = tooltipData.thisSnapshots[dataIndex] || null;
  const currentSnap = tooltipData.prevSnapshots[dataIndex] || null;
  const baselineHasData = hasModalSnapshotData(baselineSnap);
  const currentHasData = hasModalSnapshotData(currentSnap);
  const monthKey = currentSnap?.monthKey || baselineSnap?.monthKey || monthKeyForYearIndex(tooltipData.currentYear, dataIndex);

  if (currentHasData && baselineHasData) {
    const currentMetric = getMetricValue(currentSnap, tooltipData.metric);
    const baselineMetric = getMetricValue(baselineSnap, tooltipData.metric);
    tooltipEl.innerHTML = `
      <div class="chart-tooltip-title">${monthLabelFromKey(monthKey)} comparison</div>
      <div class="chart-tooltip-years">
        <div class="chart-tooltip-year-row">
          <span class="chart-tooltip-swatch" style="background:${CHART_YEAR_STYLES.current.line}"></span>
          <span class="chart-tooltip-year">${yearLabel(tooltipData.currentYear)}</span>
          <span class="chart-tooltip-value">${formatModalMetricValue(tooltipData.metric, currentMetric)}</span>
        </div>
        <div class="chart-tooltip-year-row">
          <span class="chart-tooltip-swatch" style="background:${CHART_YEAR_STYLES.baseline.line}"></span>
          <span class="chart-tooltip-year">${yearLabel(tooltipData.baselineYear)}</span>
          <span class="chart-tooltip-value">${formatModalMetricValue(tooltipData.metric, baselineMetric)}</span>
        </div>
      </div>
    `;
  } else {
    const singleSnap = currentHasData ? currentSnap : baselineSnap;
    const singleYear = currentHasData ? tooltipData.currentYear : tooltipData.baselineYear;
    const singleColor = currentHasData ? CHART_YEAR_STYLES.current.line : CHART_YEAR_STYLES.baseline.line;
    const singleMetric = getMetricValue(singleSnap, tooltipData.metric);
    tooltipEl.innerHTML = `
      <div class="chart-tooltip-title">${monthLabelFromKey(monthKey)}</div>
      <div class="chart-tooltip-years">
        <div class="chart-tooltip-year-row">
          <span class="chart-tooltip-swatch" style="background:${singleColor}"></span>
          <span class="chart-tooltip-year">${yearLabel(singleYear)}</span>
          <span class="chart-tooltip-value">${formatModalMetricValue(tooltipData.metric, singleMetric)}</span>
        </div>
      </div>
    `;
  }

  tooltipEl.classList.add('is-visible');
  const padding = 10;
  const horizontalGap = 18;
  const canPlaceRight = tooltip.caretX + horizontalGap + tooltipEl.offsetWidth + padding <= wrapper.clientWidth;
  let left = canPlaceRight
    ? tooltip.caretX + horizontalGap
    : tooltip.caretX - tooltipEl.offsetWidth - horizontalGap;
  let top = tooltip.caretY - tooltipEl.offsetHeight - 14;
  left = Math.max(padding, Math.min(left, wrapper.clientWidth - tooltipEl.offsetWidth - padding));
  if (top < padding) {
    top = Math.min(wrapper.clientHeight - tooltipEl.offsetHeight - padding, tooltip.caretY + 18);
  }
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function latestMetricIndex(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null && Number.isFinite(values[i])) return i;
  }
  return null;
}

function buildComparableMonthlySnapshot(lab, monthKey, demandOverride = null) {
  const range = monthRangeFromKey(monthKey);
  if (!range) return buildEmptyMonthlySnapshot(monthKey);
  const projectedDemand = getStdHoursForDate(lab, range.refDate) * WEEKS_PER_MONTH;
  const demand = demandOverride != null && Number.isFinite(demandOverride) ? demandOverride : projectedDemand;
  const techs = getChartHeadcountForDate(lab.labName, range.refDate) ?? lab.totalTechs;
  const onsite = 0;
  const avail = techs;
  const capacity = avail * (SHIFT_HRS * lab.productivityPct / 100) * lab.daysPerWeek * WEEKS_PER_MONTH;
  const load = demand != null && Number.isFinite(demand)
    ? (capacity > 0 ? (demand / capacity) * 100 : (demand > 0 ? Infinity : 0))
    : null;
  const ot = demand != null && Number.isFinite(demand) ? Math.max(0, demand - capacity) : null;
  return {monthKey, demand, capacity, load, ot, techs, onsite, avail};
}

function buildHistoricalMonthlySnapshot(lab, monthKey) {
  const range = monthRangeFromKey(monthKey);
  if (!range) return buildEmptyMonthlySnapshot(monthKey);
  const historicalDemand = getHistoricalWipForMonth(lab.labName, monthKey);
  const useHistoricalDemand = historicalDemand != null || hasHistoricalWipForLab(lab.labName);
  const demand = historicalDemand != null
    ? historicalDemand
    : (useHistoricalDemand ? null : getStdHoursForDate(lab, range.refDate) * WEEKS_PER_MONTH);
  return buildComparableMonthlySnapshot(lab, monthKey, demand);
}

function buildProjectedMonthlySnapshot(lab, monthKey, demandOverride = null) {
  const range = monthRangeFromKey(monthKey);
  if (!range) return buildEmptyMonthlySnapshot(monthKey);
  const projectedDemand = getStdHoursForDate(lab, range.refDate) * WEEKS_PER_MONTH;
  const demand = demandOverride != null && Number.isFinite(demandOverride) ? demandOverride : projectedDemand;
  const techs = getChartHeadcountForDate(lab.labName, range.refDate) ?? lab.totalTechs;
  const periodWorkDays = Math.max(1, lab.daysPerWeek * WEEKS_PER_MONTH);
  const onsite = onsiteTechDaysForRange(lab.labName, range.startDate, range.endDate) / periodWorkDays;
  const avail = Math.max(0, techs - onsite);
  const capacity = avail * (SHIFT_HRS * lab.productivityPct / 100) * periodWorkDays;
  const load = capacity > 0 ? (demand / capacity) * 100 : (demand > 0 ? Infinity : 0);
  const ot = Math.max(0, demand - capacity);
  return {monthKey, demand, capacity, load, ot, techs, onsite, avail};
}

function buildCurrentYearMonthlySnapshot(lab, monthKey) {
  const historicalDemand = getHistoricalWipForMonth(lab.labName, monthKey, toISODate(referenceDate()));
  return buildProjectedMonthlySnapshot(lab, monthKey, historicalDemand);
}

function buildYearMonthlySnapshots(lab, year, truncateAfterIndex = null, source = 'projected') {
  return CAL_MONTH_SUFFIXES.map((_, idx) => {
    const monthKey = monthKeyForYearIndex(year, idx);
    if (truncateAfterIndex != null && idx > truncateAfterIndex) return buildEmptyMonthlySnapshot(monthKey);
    if (source === 'historical') return buildHistoricalMonthlySnapshot(lab, monthKey);
    if (source === 'current-year') return buildCurrentYearMonthlySnapshot(lab, monthKey);
    return buildProjectedMonthlySnapshot(lab, monthKey);
  });
}

function syncModalToolbarState() {
  ['load', 'demand', 'capacity', 'ot'].forEach(metric => {
    document.getElementById(`modal-metric-${metric}`)?.classList.toggle('active', st.modalMetric === metric);
  });
  const compare = document.getElementById('modal-compare-prev');
  if (compare) compare.checked = st.modalComparePrev;
}

function setModalMetric(metric) {
  if (!['load', 'demand', 'capacity', 'ot'].includes(metric)) return;
  st.modalMetric = metric;
  syncModalToolbarState();
  renderModalDetail();
}

function toggleModalComparePrev(isChecked) {
  st.modalComparePrev = Boolean(isChecked);
  renderModalDetail();
}

function renderModalDetail() {
  if (!st.modalLabName) return;
  const lab = st.labList.find(l => l.labName === st.modalLabName);
  if (!lab) return;
  const modalData = buildLabChart(lab);
  buildModalHeaderSummary(lab, modalData);
  buildModalInsight(modalData);
  buildModalStats(modalData);
}

function getModalSelectionState(modalData) {
  const idx = st.modalMonthIndex ?? 0;
  const baseline = modalData.thisSnapshots[idx] || null;
  const current = modalData.prevSnapshots[idx] || null;
  const currentHasData = hasModalSnapshotData(current);
  const baselineHasData = hasModalSnapshotData(baseline);
  const selected = currentHasData ? current : baseline;
  const monthKey = selected?.monthKey || current?.monthKey || baseline?.monthKey || monthKeyForYearIndex(modalData.currentYear, idx);
  return {idx, baseline, current, currentHasData, baselineHasData, selected, monthKey};
}

function buildModalHeaderSummary(lab, modalData) {
  const subEl = document.getElementById('modal-lab-sub');
  if (!subEl || !modalData) return;

  const {current, selected} = getModalSelectionState(modalData);
  const headerSnap = current && Number.isFinite(current.load) ? current : selected;
  const loadPct = headerSnap?.load;
  const ot = headerSnap?.ot;
  const avail = headerSnap?.avail;
  const status = Number.isFinite(loadPct) ? getStatus(loadPct) : 'ok';

  subEl.innerHTML = `
    <span class="badge ${statusBadgeClass(status)}">${statusLabel(status)}</span>
    <span>Load: <strong>${Number.isFinite(loadPct) ? `${fmt(loadPct, 1)}%` : '—'}</strong></span>
    <span>OT: <strong>${ot > 0 ? `${fmtInt(ot)} hrs/mo` : '—'}</strong></span>
    <span style="color:#d1d5db">|</span>
    <span>${Number.isFinite(avail) ? fmt(avail, 1) : '—'} avail · ${lab.daysPerWeek} days/wk · ${lab.productivityPct}% prod</span>
  `;
}

function buildLabChart(lab) {
  const metric = st.modalMetric;
  const currentYear = referenceDate().getFullYear();
  const baselineYear = currentYear - 1;
  const currentMonthIdx = calendarMonthIndexFromDate(referenceDate());

  const thisSnapshots = buildYearMonthlySnapshots(lab, baselineYear, null, 'historical');
  const prevSnapshots = buildYearMonthlySnapshots(lab, currentYear, currentMonthIdx, 'current-year');
  const sanitize = v => (v != null && Number.isFinite(v) ? v : null);
  const thisValues = thisSnapshots.map(s => sanitize(getMetricValue(s, metric)));
  const prevValues = prevSnapshots.map(s => sanitize(getMetricValue(s, metric)));
  const hasThis = thisValues.some(v => v != null && Number.isFinite(v));
  const hasPrev = prevValues.some(v => v != null && Number.isFinite(v));

  if (st.modalMonthIndex == null || (!Number.isFinite(prevValues[st.modalMonthIndex]) && !Number.isFinite(thisValues[st.modalMonthIndex]))) {
    st.modalMonthIndex = prevValues[currentMonthIdx] != null
      ? currentMonthIdx
      : latestMetricIndex(prevValues) ?? latestMetricIndex(thisValues) ?? currentMonthIdx;
  }

  const baselineStyle = CHART_YEAR_STYLES.baseline;
  const currentStyle = CHART_YEAR_STYLES.current;

  const datasets = [];
  if (hasThis) {
    datasets.push({
      label: yearLabel(baselineYear),
      fyType: 'this',
      data: thisValues,
      borderColor: baselineStyle.line,
      backgroundColor: baselineStyle.fill,
      borderWidth: 3.2,
      tension: 0.28,
      spanGaps: true,
      pointBackgroundColor: baselineStyle.line,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: (ctx) => {
        if (ctx.parsed?.y == null) return 0;
        return ctx.dataIndex === st.modalMonthIndex ? 6.5 : 3.5;
      },
      pointHoverRadius: 8,
      fill: false,
    });
  }
  if (st.modalComparePrev && hasPrev) {
    datasets.push({
      label: yearLabel(currentYear),
      fyType: 'prev',
      data: prevValues,
      borderColor: currentStyle.line,
      backgroundColor: currentStyle.fill,
      borderDash: [7, 5],
      borderWidth: 3,
      tension: 0.28,
      spanGaps: true,
      pointBackgroundColor: currentStyle.line,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: (ctx) => {
        if (ctx.parsed?.y == null) return 0;
        return ctx.dataIndex === st.modalMonthIndex ? 6 : 3.5;
      },
      pointHoverRadius: 8,
      fill: false,
    });
  }

  const shownValues = datasets
    .flatMap(ds => ds.data)
    .filter(v => v != null && Number.isFinite(v));
  const maxVal = shownValues.length ? Math.max(...shownValues) : (metric === 'load' ? 100 : 0);
  const yMax = metric === 'load'
    ? Math.max(120, Math.ceil((maxVal + 8) / 10) * 10)
    : Math.max(100, Math.ceil((maxVal * 1.18) / 50) * 50);

  const ctx = document.getElementById('lab-chart');
  if (st.chart) { st.chart.destroy(); st.chart = null; }
  hideChartTooltip();

  const plugins = {
    legend: {position: 'top', labels: {font: {size: 11}, padding: 12, boxWidth: 24}},
    tooltip: {
      enabled: false,
      external: (context) => renderChartTooltip(context, {
        metric,
        baselineYear,
        currentYear,
        thisSnapshots,
        prevSnapshots,
      }),
    },
  };

  if (metric === 'load') {
    plugins.annotation = {
      annotations: {
        overLine: {
          type: 'line', yMin: 100, yMax: 100,
          borderColor: 'rgba(239,68,68,0.5)', borderWidth: 1.5, borderDash: [5, 4],
          label: {content: 'Over capacity', display: true, position: 'end', font: {size: 9}, color: '#ef4444', backgroundColor: 'transparent'},
        },
        riskLine: {
          type: 'line', yMin: 80, yMax: 80,
          borderColor: 'rgba(217,119,6,0.45)', borderWidth: 1.5, borderDash: [5, 4],
          label: {content: 'At risk', display: true, position: 'end', font: {size: 9}, color: '#d97706', backgroundColor: 'transparent'},
        },
      },
    };
  }

  st.chart = new Chart(ctx, {
    type: 'line',
    data: {labels: CAL_MONTH_LABELS, datasets},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {mode: 'index', intersect: false},
      onClick: (_evt, elements) => {
        if (!elements?.length) return;
        st.modalMonthIndex = elements[0].index;
        buildModalInsight({
          metric,
          baselineYear,
          currentYear,
          thisSnapshots,
          prevSnapshots,
          thisValues,
          prevValues,
        });
        if (st.chart) st.chart.update();
      },
      plugins,
      scales: {
        x: {grid: {color: '#f4f4f5'}, ticks: {font: {size: 11}}},
        y: {
          grid: {color: '#f4f4f5'},
          min: 0,
          max: yMax,
          ticks: {
            font: {size: 11},
            callback: v => metric === 'load' ? `${v}%` : Number(v).toLocaleString('en-US'),
          },
          title: {
            display: true,
            text: metric === 'load'
              ? 'Load % (demand ÷ capacity)'
              : metric === 'demand'
                ? 'Demand hours'
                : metric === 'capacity'
                  ? 'Capacity hours'
                  : 'Overtime hours needed',
            font: {size: 10},
            color: '#a1a1aa',
          },
        },
      },
    },
  });

  return {metric, baselineYear, currentYear, thisSnapshots, prevSnapshots, thisValues, prevValues};
}

function buildModalInsight(modalData) {
  const insightEl = document.getElementById('modal-insight');
  if (!insightEl || !modalData) return;
  const {baseline, current, currentHasData, selected, monthKey} = getModalSelectionState(modalData);
  const metricLabel = modalData.metric === 'load'
    ? 'Load'
    : modalData.metric === 'demand'
      ? 'Demand'
      : modalData.metric === 'capacity'
        ? 'Capacity'
        : 'OT Needed';

  const currentMetric = getMetricValue(current, modalData.metric);
  const baselineMetric = getMetricValue(baseline, modalData.metric);
  const delta = currentMetric != null && baselineMetric != null ? currentMetric - baselineMetric : null;
  const deltaText = modalData.metric === 'load'
    ? (delta != null ? `${delta > 0 ? '+' : ''}${fmt(delta, 1)}pp` : '—')
    : (delta != null ? `${delta > 0 ? '+' : ''}${fmtInt(delta)} hrs` : '—');
  const deltaColor = delta == null
    ? '#a1a1aa'
    : modalData.metric === 'capacity'
      ? (delta >= 0 ? '#16a34a' : '#ef4444')
      : (delta <= 0 ? '#16a34a' : '#ef4444');

  insightEl.innerHTML = `
    <div class="modal-insight-title">Selected Month · ${monthLabelFromKey(monthKey)}</div>
    <div class="modal-insight-grid">
      <div>
        <div class="modal-insight-k">${metricLabel} (${yearLabel(modalData.currentYear)})</div>
        <div class="modal-insight-v" style="color:${modalMetricColor(modalData.metric, currentMetric)}">${formatModalMetricValue(modalData.metric, currentMetric)}</div>
        <div class="modal-insight-sub">${yearLabel(modalData.baselineYear)}: ${formatModalMetricValue(modalData.metric, baselineMetric)}</div>
      </div>
      <div>
        <div class="modal-insight-k">YoY Delta</div>
        <div class="modal-insight-v" style="color:${deltaColor}">${deltaText}</div>
        <div class="modal-insight-sub">${yearLabel(modalData.currentYear)} vs ${yearLabel(modalData.baselineYear)}</div>
      </div>
      <div>
        <div class="modal-insight-k">Demand</div>
        <div class="modal-insight-v" style="color:${modalMetricColor('demand', selected?.demand)}">${formatModalMetricValue('demand', selected?.demand)}</div>
        <div class="modal-insight-sub">work in queue</div>
      </div>
      <div>
        <div class="modal-insight-k">Capacity</div>
        <div class="modal-insight-v" style="color:${modalMetricColor('capacity', selected?.capacity)}">${formatModalMetricValue('capacity', selected?.capacity)}</div>
        <div class="modal-insight-sub">available throughput</div>
      </div>
      <div>
        <div class="modal-insight-k">Headcount</div>
        <div class="modal-insight-v">${selected?.techs != null ? fmt(selected.techs, 1) : '—'}</div>
        <div class="modal-insight-sub">techs in month</div>
      </div>
    </div>
  `;
}

function buildModalStats(modalData) {
  const statsEl = document.getElementById('modal-stats');
  if (!statsEl || !modalData) return;

  const baselineVals = modalData.thisValues.filter(v => v != null && Number.isFinite(v));
  const currentVals = modalData.prevValues.filter(v => v != null && Number.isFinite(v));
  const avgBaseline = baselineVals.length ? baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length : null;
  const avgCurrent = currentVals.length ? currentVals.reduce((a, b) => a + b, 0) / currentVals.length : null;
  const peakBaseline = baselineVals.length ? Math.max(...baselineVals) : null;
  const latestIdx = calendarMonthIndexFromDate(referenceDate());
  const latestVal = modalData.prevValues[latestIdx] != null ? modalData.prevValues[latestIdx] : (latestMetricIndex(modalData.prevValues) != null ? modalData.prevValues[latestMetricIndex(modalData.prevValues)] : null);
  const latestLabelIdx = modalData.prevValues[latestIdx] != null ? latestIdx : latestMetricIndex(modalData.prevValues);
  const yoyAvg = avgCurrent != null && avgBaseline != null ? avgCurrent - avgBaseline : null;
  const overCount = modalData.metric === 'load' ? currentVals.filter(v => v > 100).length : null;

  const metricName = modalData.metric === 'load'
    ? 'Load'
    : modalData.metric === 'demand'
      ? 'Demand'
      : modalData.metric === 'capacity'
        ? 'Capacity'
        : 'OT Needed';

  const yoyText = modalData.metric === 'load'
    ? (yoyAvg != null ? `${yoyAvg > 0 ? '+' : ''}${fmt(yoyAvg, 1)}pp` : '—')
    : (yoyAvg != null ? `${yoyAvg > 0 ? '+' : ''}${fmtInt(yoyAvg)} hrs` : '—');

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Avg ${metricName} · ${yearLabel(modalData.baselineYear)}</div>
      <div class="stat-value" style="color:${modalMetricColor(modalData.metric, avgBaseline)}">${formatModalMetricValue(modalData.metric, avgBaseline)}</div>
      <div class="stat-sub">
        ${baselineVals.length ? `${baselineVals.length} month${baselineVals.length === 1 ? '' : 's'} with data` : 'No prior-year data'}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Peak ${metricName} · ${yearLabel(modalData.baselineYear)}</div>
      <div class="stat-value" style="color:${modalMetricColor(modalData.metric, peakBaseline)}">${formatModalMetricValue(modalData.metric, peakBaseline)}</div>
      <div class="stat-sub">highest single month</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg ${metricName} · ${yearLabel(modalData.currentYear)}</div>
      <div class="stat-value" style="color:${modalMetricColor(modalData.metric, avgCurrent)}">${formatModalMetricValue(modalData.metric, avgCurrent)}</div>
      <div class="stat-sub">
        ${modalData.metric === 'load'
          ? (overCount > 0 ? `${overCount} month${overCount > 1 ? 's' : ''} over capacity` : 'No months over capacity')
          : `${currentVals.length} month${currentVals.length === 1 ? '' : 's'} with data`}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Current ${metricName} · ${yearLabel(modalData.currentYear)}</div>
      <div class="stat-value" style="color:${modalMetricColor(modalData.metric, latestVal)}">${formatModalMetricValue(modalData.metric, latestVal)}</div>
      <div class="stat-sub">${latestLabelIdx != null ? `${CAL_MONTH_LABELS[latestLabelIdx]} · YoY avg ${yoyText}` : 'No current-year data'}</div>
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

function syncScenarioGlobalInputs() {
  const otInput = document.getElementById('global-ot-input');
  const prodInput = document.getElementById('global-prod-input');
  const daysInput = document.getElementById('global-days-input');
  if (otInput) otInput.value = st.scen.globalOt;
  if (prodInput) prodInput.value = st.scen.globalProdAdj;
  if (daysInput) daysInput.value = st.scen.globalDaysDelta;
}

function setGlobalField(field, rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return;
  if (field === 'ot') {
    st.scen.globalOt = Math.max(0, Math.round(n));
  } else if (field === 'prod') {
    st.scen.globalProdAdj = clamp(Math.round(n), -50, 50);
  } else if (field === 'days') {
    st.scen.globalDaysDelta = clamp(Math.round(n), -4, 4);
  }
  syncScenarioGlobalInputs();
  refreshScenarioComputedOutputs();
}

function addScenLab(labName) {
  if (!labName) return;
  st.scen.selectedLabs.add(labName);
  if (!st.scen.perLab[labName]) {
    st.scen.perLab[labName] = { demandVal: 0, demandUnit: 'weekly', hireTechs: 0, otOverride: null, daysOverride: null, prodOverride: null };
  }
  scenLabPickerSearchTerm = '';
  const searchInput = document.getElementById('scen-lab-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  renderScenLabPicker();
  renderScenLabTags();
  renderScenarioResults();
}

function removeScenLab(labName) {
  st.scen.selectedLabs.delete(labName);
  renderScenLabPicker();
  renderScenLabTags();
  renderScenarioResults();
}

function renderScenLabTags() {
  const container = document.getElementById('scen-lab-tags');
  if (!container) return;
  container.innerHTML = [...st.scen.selectedLabs].map(name => {
    const encodedName = encodeURIComponent(name);
    return `<span class="lab-tag">${esc(name)}<span class="lab-tag-x" onclick="removeScenLab(decodeURIComponent('${encodedName}'))">×</span></span>`;
  }).join('');

  const title = document.getElementById('impact-cards-title');
  if (title) title.textContent = `Scenario impact · ${st.scen.selectedLabs.size} lab${st.scen.selectedLabs.size === 1 ? '' : 's'}`;
}

function availableScenLabNames() {
  return [...new Set(st.labList.map(l => l.labName))]
    .filter(name => !st.scen.selectedLabs.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function filteredScenLabNames() {
  const searchKey = labKey(scenLabPickerSearchTerm);
  return availableScenLabNames().filter(name => !searchKey || labKey(name).includes(searchKey));
}

function renderScenLabPicker() {
  const menu = document.getElementById('scen-lab-search-menu');
  const input = document.getElementById('scen-lab-search');
  if (!menu || !input) return;

  if (input.value !== scenLabPickerSearchTerm) input.value = scenLabPickerSearchTerm;

  const available = availableScenLabNames();
  const filtered = filteredScenLabNames();

  if (!available.length) {
    menu.innerHTML = '<div class="scen-lab-empty">All available labs are already in scope.</div>';
    return;
  }
  if (!filtered.length) {
    menu.innerHTML = '<div class="scen-lab-empty">No labs match your search.</div>';
    return;
  }

  menu.innerHTML = filtered
    .map(name => {
      const encodedName = encodeURIComponent(name);
      return `<button type="button" class="scen-lab-option" onclick="selectScenLab(decodeURIComponent('${encodedName}'))">${esc(name)}</button>`;
    })
    .join('');
}

function openScenLabPicker() {
  const menu = document.getElementById('scen-lab-search-menu');
  if (!menu) return;
  menu.removeAttribute('hidden');
  renderScenLabPicker();
}

function closeScenLabPicker() {
  const menu = document.getElementById('scen-lab-search-menu');
  if (!menu) return;
  menu.setAttribute('hidden', '');
}

function onScenLabSearchInput(value) {
  scenLabPickerSearchTerm = value || '';
  openScenLabPicker();
}

function handleScenLabSearchKeydown(e) {
  if (e.key === 'Escape') {
    closeScenLabPicker();
    return;
  }
  if (e.key !== 'Enter') return;
  const filtered = filteredScenLabNames();
  const exactMatch = filtered.find(name => labKey(name) === labKey(scenLabPickerSearchTerm));
  const choice = exactMatch || (filtered.length === 1 ? filtered[0] : null);
  if (!choice) return;
  e.preventDefault();
  selectScenLab(choice);
}

function selectScenLab(labName) {
  addScenLab(labName);
}

function renderScenarioPlanner() {
  renderScenLabPicker();
  syncScenarioGlobalInputs();
  renderScenLabTags();
  setScenView(st.scen.view);
  renderScenarioDropdown();
}

function renderScenarioDropdown() {
  const sel = document.getElementById('scen-profile-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Saved scenarios…</option>' +
    st.savedScenarios.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = st.scen.id ?? '';
}

function getScenGlobal() {
  return { ot: st.scen.globalOt, prodAdj: st.scen.globalProdAdj, daysDelta: st.scen.globalDaysDelta };
}

function buildScenarioSubLabel(inputs, global) {
  const demVal = inputs.demandVal ?? 0;
  const demUnit = inputs.demandUnit ?? 'weekly';
  const hireTechs = inputs.hireTechs ?? 0;
  const otOverrideVal = inputs.otOverride;
  return [
    hireTechs !== 0 ? `${hireTechs > 0 ? '+' : ''}${hireTechs} techs` : null,
    demVal !== 0 ? `${demVal > 0 ? '+' : ''}${demVal.toLocaleString()} ${demUnit} hrs demand` : null,
    `${otOverrideVal ?? global.ot} OT hrs/wk ${otOverrideVal == null ? '(global)' : '(override)'}`,
  ].filter(Boolean).join(' · ');
}

function updateScenarioRowBlock(lab) {
  const block = document.querySelector(`.scen-lab-block[data-scen-lab="${encodeURIComponent(lab.labName)}"]`);
  if (!block) return;

  const inputs = st.scen.perLab[lab.labName] ?? {};
  const g = getScenGlobal();
  const sv = st.scen.view;
  const s = scenMetrics(lab, inputs, g, sv);
  const rc = s.status;
  const weeklyEquiv = toWeeklyDelta(inputs.demandVal ?? 0, inputs.demandUnit ?? 'weekly');
  const subLabel = buildScenarioSubLabel(inputs, g) || 'No changes applied';
  const otOverrideVal = inputs.otOverride;

  const resultRow = block.querySelector('.row-result');
  if (resultRow) resultRow.className = `scen-row row-result s-${rc}`;

  const labelEl = block.querySelector('.scen-result-label');
  if (labelEl) labelEl.style.color = scenarioStatusColor(rc);
  const subLabelEl = block.querySelector('.scen-result-sublabel');
  if (subLabelEl) subLabelEl.textContent = subLabel;

  const setText = (selector, value) => {
    const el = block.querySelector(selector);
    if (el) el.textContent = value;
  };
  setText('.scen-result-techs', fmtInt(s.scenTechs));
  setText('.scen-result-avail', fmt(s.scenAvail, 1));
  setText('.scen-result-demand', fmtInt(s.demand));
  setText('.scen-result-capacity', fmtInt(s.effectiveCap));
  setText('.scen-result-margin', fmtSgn(s.margin, 0));
  setText('.scen-result-load', `${fmt(s.loadPct, 1)}%`);
  setText('.scen-result-ot', s.otHrs > 0 ? fmtInt(s.otHrs) : '—');

  const marginEl = block.querySelector('.scen-result-margin');
  if (marginEl) marginEl.className = `scen-result-margin ${s.margin >= 0 ? 'margin-pos' : 'margin-neg'}`;
  const loadEl = block.querySelector('.scen-result-load');
  if (loadEl) loadEl.className = `scen-result-load load-${rc}`;
  const otEl = block.querySelector('.scen-result-ot');
  if (otEl) otEl.className = `scen-result-ot ${s.otHrs > 0 ? 'ot-pos' : 'ot-zero'}`;

  const otInput = block.querySelector('.scen-ot-input');
  if (otInput) otInput.placeholder = `Use global (${g.ot})`;
  const otHint = block.querySelector('.scen-ot-hint');
  if (otHint) otHint.textContent = otOverrideVal == null ? `Using global default: ${g.ot}` : 'Blank resets to global';

  const equivEl = block.querySelector('.ri-equiv');
  if (equivEl) {
    if (Math.abs(weeklyEquiv) > 0.1) {
      equivEl.textContent = `≈ ${weeklyEquiv > 0 ? '+' : ''}${fmt(weeklyEquiv, 1)}/wk`;
      equivEl.hidden = false;
    } else {
      equivEl.textContent = '';
      equivEl.hidden = true;
    }
  }
}

function refreshScenarioComputedOutputs() {
  renderImpactCards();
  [...st.scen.selectedLabs]
    .map(name => st.labList.find(l => l.labName === name))
    .filter(Boolean)
    .forEach(updateScenarioRowBlock);
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
    const labNameEsc = esc(lab.labName);
    const labNameShort = esc(lab.labName.length > 18 ? `${lab.labName.slice(0, 18)}…` : lab.labName);
    const encodedLabName = encodeURIComponent(lab.labName);
    const subLabel = buildScenarioSubLabel(inputs, g);

    return `<div class="scen-lab-block" data-scen-lab="${encodedLabName}">
      <div class="scen-row row-baseline s-${sc}">
        <div><div class="scen-row-label" style="font-weight:600">${labNameEsc}</div><div class="scen-row-sublabel">Baseline · current</div></div>
        <span>${fmtInt(lab.totalTechs)}</span><span>${fmt(b.avail, 1)}</span>
        <span>${fmtInt(b.demand)}</span><span>${fmtInt(b.capacity)}</span>
        <span class="${b.margin >= 0 ? 'margin-pos' : 'margin-neg'}">${fmtSgn(b.margin,0)}</span>
        <span class="${'load-' + sc}">${fmt(b.loadPct,1)}%</span>
        <span class="${b.otHrs > 0 ? 'ot-pos' : 'ot-zero'}">${b.otHrs > 0 ? fmtInt(b.otHrs) : '—'}</span>
      </div>

      <div class="row-inputs">
        <div class="row-inputs-label">${labNameShort}</div>

        <label class="scen-field scen-field-hire">
          <span class="scen-field-label">Hire techs</span>
          <input class="scen-number-input" type="number" step="1" value="${hireTechs}" oninput="setPerLabNumber(decodeURIComponent('${encodedLabName}'),'hireTechs',this.value)" onkeydown="handleScenarioNumberKeydown(event)">
        </label>

        <label class="scen-field scen-field-demand">
          <span class="scen-field-label">Demand delta</span>
          <div class="scen-field-inline">
            <input class="scen-number-input" type="number" step="1" value="${demVal}" oninput="setPerLabNumber(decodeURIComponent('${encodedLabName}'),'demandVal',this.value)" onkeydown="handleScenarioNumberKeydown(event)">
            <select class="ri-unit" onchange="setPerLabUnit(decodeURIComponent('${encodedLabName}'),this.value)">
            <option value="weekly" ${demUnit==='weekly'?'selected':''}>wk hrs</option>
            <option value="monthly" ${demUnit==='monthly'?'selected':''}>mo hrs</option>
            <option value="annual" ${demUnit==='annual'?'selected':''}>annual hrs</option>
          </select>
          </div>
          <span class="ri-equiv" ${Math.abs(weeklyEquiv) > 0.1 ? '' : 'hidden'}>${Math.abs(weeklyEquiv) > 0.1 ? `≈ ${weeklyEquiv > 0?'+':''}${fmt(weeklyEquiv,1)}/wk` : ''}</span>
        </label>

        <label class="scen-field scen-field-ot">
          <span class="scen-field-label">OT override</span>
          <input class="scen-number-input scen-ot-input" type="number" min="0" step="1" value="${otOverrideVal ?? ''}" placeholder="Use global (${g.ot})" oninput="setPerLabOt(decodeURIComponent('${encodedLabName}'),this.value)" onkeydown="handleScenarioNumberKeydown(event)">
          <span class="scen-field-hint scen-ot-hint">${otOverrideVal == null ? `Using global default: ${g.ot}` : 'Blank resets to global'}</span>
        </label>
      </div>

      <div class="scen-row row-result s-${rc}">
        <div>
          <div class="scen-row-label scen-result-label" style="font-size:11px;color:${scenarioStatusColor(rc)};font-weight:600">↳ With scenario</div>
          <div class="scen-row-sublabel scen-result-sublabel">${esc(subLabel) || 'No changes applied'}</div>
        </div>
        <span class="scen-result-techs" style="font-weight:600">${fmtInt(s.scenTechs)}</span>
        <span class="scen-result-avail" style="font-weight:600">${fmt(s.scenAvail,1)}</span>
        <span class="scen-result-demand">${fmtInt(s.demand)}</span>
        <span class="scen-result-capacity">${fmtInt(s.effectiveCap)}</span>
        <span class="scen-result-margin ${s.margin >= 0 ? 'margin-pos' : 'margin-neg'}">${fmtSgn(s.margin,0)}</span>
        <span class="scen-result-load ${'load-' + rc}">${fmt(s.loadPct,1)}%</span>
        <span class="scen-result-ot ${s.otHrs > 0 ? 'ot-pos' : 'ot-zero'}">${s.otHrs > 0 ? fmtInt(s.otHrs) : '—'}</span>
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

function handleScenarioNumberKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.target.blur();
}

function setPerLabNumber(labName, field, rawValue) {
  const p = getOrInitPerLab(labName);
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return;
  p[field] = Math.round(n);
  refreshScenarioComputedOutputs();
}

function setPerLabUnit(labName, unit) {
  const p = getOrInitPerLab(labName);
  p.demandUnit = unit;
  refreshScenarioComputedOutputs();
}

function setPerLabOt(labName, rawValue) {
  const p = getOrInitPerLab(labName);
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    p.otOverride = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    p.otOverride = Math.max(0, Math.round(n));
  }
  refreshScenarioComputedOutputs();
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
  syncScenarioGlobalInputs();
  renderScenLabPicker();
  setScenView(st.scen.view);
  renderScenLabTags();
  renderScenarioResults();
}

function resetScenario() {
  st.scen = { view: 'weekly', id: null, name: '', selectedLabs: new Set(), globalOt: 0, globalProdAdj: 0, globalDaysDelta: 0, perLab: {} };
  if (document.getElementById('scen-name')) document.getElementById('scen-name').value = '';
  if (document.getElementById('scen-profile-select')) document.getElementById('scen-profile-select').value = '';
  scenLabPickerSearchTerm = '';
  const searchInput = document.getElementById('scen-lab-search');
  if (searchInput) searchInput.value = '';
  syncScenarioGlobalInputs();
  renderScenLabPicker();
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
  ['std-hours', 'schedule', 'headcount'].forEach(t => {
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

function formatHeadcountItem(item) {
  if (item.previousHeadcount != null) {
    return `${item.labRaw}: ${item.previousHeadcount} -> ${item.headcount} techs`;
  }
  return `${item.labRaw}: ${item.headcount} techs`;
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
  } else if (type === 'headcount') {
    lines.push(`Effective month: ${data.effectiveMonth ?? '—'}`);
  }

  const fmtItem = type === 'std-hours'
    ? formatStdHoursItem
    : type === 'headcount'
      ? formatHeadcountItem
      : formatScheduleItem;

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
  const url = type === 'std-hours'
    ? '/api/std-hours/sync'
    : type === 'headcount'
      ? '/api/headcount/sync'
      : '/api/schedules/sync';
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
