'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const SHIFT_HRS = 8;
const DEFAULT_PROD_PCT = 70;
const WEEKS_PER_MONTH = 4.33;
const WEEKS_PER_QTR = 13;
const WEEKS_PER_YEAR = 52;

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
  filters: { system: 'all', status: 'all', search: '' },
  sortKey: 'load',
  sortDir: -1,                 // -1 = desc (highest load first)
  labList: [],                 // final computed array of lab objects
  labSettings: {},             // { labKey: { productivityPct, daysPerWeek, systemType } }
  scheduleEvents: [],          // from /api/schedules
  dbStdHrs: {},                // { labKey: stdHrsPerWeek } from DB
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

// ─── UTILS ───────────────────────────────────────────────────────────────────
function labKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  const avail = Math.max(0, lab.totalTechs - onsiteFTE(lab.labName, viewStr));
  const capacity = avail * hrsPerDay * lab.daysPerWeek * s;
  const margin = capacity - demand;
  const loadPct = capacity > 0 ? (demand / capacity) * 100 : (demand > 0 ? Infinity : 0);
  const otHrs = Math.max(0, demand - capacity);
  const status = getStatus(loadPct);
  return { demand, capacity, margin, loadPct, otHrs, avail, status };
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

// Historical peak WIP for a lab — finds the same period one year ago and returns
// the highest daily WIP snapshot recorded in that window.
// Weekly: same Mon–Sun last year. Monthly: same calendar month LY. Etc.
function historicalAvg(labName, viewStr) {
  const daily = typeof HARDCODED_STD_HOURS_DAILY !== 'undefined' ? HARDCODED_STD_HOURS_DAILY : {};
  if (!Object.keys(daily).length) return null;

  const now = referenceDate();
  // Shift back exactly one year
  const ly = new Date(now);
  ly.setFullYear(ly.getFullYear() - 1);

  let lyStart, lyEnd;
  const pad = n => String(n).padStart(2, '0');
  const toStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (viewStr === 'weekly') {
    const dow = ly.getDay() || 7;
    const mon = new Date(ly); mon.setDate(ly.getDate() - (dow - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    lyStart = toStr(mon); lyEnd = toStr(sun);
  } else if (viewStr === 'monthly') {
    lyStart = `${ly.getFullYear()}-${pad(ly.getMonth()+1)}-01`;
    lyEnd = toStr(new Date(ly.getFullYear(), ly.getMonth()+1, 0));
  } else if (viewStr === 'quarterly') {
    // Same fiscal quarter LY
    const fyStart = ly.getMonth() >= 3 ? ly.getFullYear() : ly.getFullYear() - 1;
    const fiscalMo = (ly.getMonth() - 3 + 12) % 12;
    const qIdx = Math.floor(fiscalMo / 3);
    const qStartCal = (qIdx * 3 + 3) % 12;
    const qStartYear = qStartCal <= 2 ? fyStart + 1 : fyStart;
    const qEndCal = (qStartCal + 2) % 12;
    const qEndYear = qEndCal < qStartCal ? fyStart + 1 : qStartYear;
    lyStart = toStr(new Date(qStartYear, qStartCal, 1));
    lyEnd   = toStr(new Date(qEndYear, qEndCal + 1, 0));
  } else {
    // Yearly — full prior fiscal year
    const fyStart = ly.getMonth() >= 3 ? ly.getFullYear() : ly.getFullYear() - 1;
    lyStart = `${fyStart}-04-01`;
    lyEnd   = `${fyStart + 1}-03-31`;
  }

  // Find peak daily WIP in that window
  let peak = null;
  for (const [dateStr, labs] of Object.entries(daily)) {
    if (dateStr < lyStart || dateStr > lyEnd) continue;
    const v = labs[labName];
    if (v != null && (peak === null || v > peak)) peak = v;
  }
  return peak;
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
      workDays: 5 * 13,
    };
  }
  // yearly — current fiscal year Apr–Mar
  const fyStart = m >= 3 ? y : y - 1;
  return { start: `${fyStart}-04-01`, end: `${fyStart+1}-03-31`, workDays: 5 * 52 };
}

// FTE of techs away from lab doing onsite customer work during the view period
// "Number of Tech" in schedule = techs leaving the lab; reduces available capacity
function onsiteFTE(labName, viewStr) {
  if (!st.scheduleEvents.length) return 0;
  const { start: pStart, end: pEnd, workDays } = getPeriodDates(viewStr);
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
  return workDays > 0 ? techDaysAway / workDays : 0;
}

function buildLabList() {
  const labs = [];
  for (const base of BASE_LABS) {
    const key = labKey(base.lab);
    const settings = st.labSettings[key] ?? {};
    const dbEntry = st.dbStdHrs[key];
    const rawStdHrs = dbEntry?.stdHrsPerWeek ?? base.stdHrs;
    // Only show labs that have actual demand data OR are IndySoft (tracked separately)
    if (rawStdHrs == null && !isIndySoft(base.lab)) continue;
    const stdHrs = rawStdHrs ?? 0;
    const totalTechs = getLatestHeadcount(base.lab) ?? base.techs;
    const productivityPct = settings.productivityPct ?? DEFAULT_PROD_PCT;
    const daysPerWeek = settings.daysPerWeek ?? 5;

    labs.push({
      labName: base.lab,
      labKey: key,
      systemType: systemType(base.lab, settings),
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
    const [stdHrsRes, schedulesRes, settingsRes, scenariosRes] = await Promise.allSettled([
      apiFetch('/api/std-hours/current'),
      apiFetch('/api/schedules'),
      apiFetch('/api/lab-settings'),
      apiFetch('/api/scenarios'),
    ]);

    if (stdHrsRes.status === 'fulfilled') {
      const { labs, dataDate } = stdHrsRes.value;
      st.dataDate = dataDate;
      labs.forEach(l => { st.dbStdHrs[l.labKey] = l; });
      if (dataDate) {
        const d = new Date(dataDate + 'T00:00:00');
        document.getElementById('data-date-label').textContent =
          'Week of ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }

    if (schedulesRes.status === 'fulfilled') {
      st.scheduleEvents = (schedulesRes.value.events ?? []).map(e => {
        const raw = labKey(e.lab);
        return {
          labKey: SCHEDULE_LAB_KEY_MAP[raw] ?? raw,  // remap legacy "05 houston" → "houston cal lab"
          startDate: e.startDate,
          endDate: e.endDate,
          techCount: e.techCount,
        };
      });
    }

    if (settingsRes.status === 'fulfilled') {
      st.labSettings = settingsRes.value.settings ?? {};
    }

    if (scenariosRes.status === 'fulfilled') {
      st.savedScenarios = scenariosRes.value.scenarios ?? [];
      renderScenarioDropdown();
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
  all.forEach(lab => {
    const s = baseMetrics(lab, st.view).status;
    if (counts[s] !== undefined) counts[s]++;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('card-total', all.length);
  set('card-over',  counts.over);
  set('card-risk',  counts.risk);
  set('card-ok',    counts.ok);
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
  set('th-hist',   'LY ' + lbl + ' Peak');
  set('th-capacity', lbl + ' Capacity');
  set('th-margin', lbl + ' Margin');
  set('th-ot', lbl + ' OT Hrs');
}

function sortBy(key) {
  if (st.sortKey === key) st.sortDir *= -1;
  else { st.sortKey = key; st.sortDir = -1; }
  renderStatusBoard();
}

// ─── STATUS BOARD ────────────────────────────────────────────────────────────
function filteredLabs() {
  const { system, status, search } = st.filters;
  const q = (search || '').toLowerCase();
  return st.labList.filter(lab => {
    if (system !== 'all' && lab.systemType !== system) return false;
    const m = baseMetrics(lab, st.view);
    if (status !== 'all' && m.status !== status) return false;
    if (q && !lab.labName.toLowerCase().includes(q)) return false;
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
      case 'avail':    va = baseMetrics(a, st.view).avail; vb = baseMetrics(b, st.view).avail; break;
      case 'prod':     va = a.productivityPct; vb = b.productivityPct; break;
      case 'demand':   va = ma.demand; vb = mb.demand; break;
      case 'capacity': va = ma.capacity; vb = mb.capacity; break;
      case 'margin':   va = ma.margin; vb = mb.margin; break;
      case 'load':     va = ma.loadPct; vb = mb.loadPct; break;
      case 'ot':       va = ma.otHrs; vb = mb.otHrs; break;
      case 'hist':     va = historicalAvg(a.labName, st.view) ?? -1; vb = historicalAvg(b.labName, st.view) ?? -1; break;
      case 'trend': {
        const tmap = { up: 2, flat: 1, down: 0, null: -1 };
        va = tmap[computeTrend(a.labName)] ?? -1;
        vb = tmap[computeTrend(b.labName)] ?? -1;
        break;
      }
      default: va = 0; vb = 0;
    }
    if (typeof va === 'string') return st.sortDir * va.localeCompare(vb);
    return st.sortDir * ((vb ?? -Infinity) - (va ?? -Infinity));
  });
}

function renderStatusBoard() {
  updateWeekLabel();
  renderSummaryCards();
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
    const trend = computeTrend(lab.labName);
    const sysType = lab.systemType;
    const lc = m.status;

    const trendHtml = trend === 'up'
      ? '<span class="trend-up">↑ Rising</span>'
      : trend === 'down'
        ? '<span class="trend-down">↓ Falling</span>'
        : trend === 'flat'
          ? '<span class="trend-flat">→ Flat</span>'
          : '<span style="color:#d4d4d8">—</span>';

    const loadClass = lc === 'over' ? 'load-over' : lc === 'risk' ? 'load-risk' : 'load-ok';
    const marginClass = m.margin >= 0 ? 'margin-pos' : 'margin-neg';
    const otClass = m.otHrs > 0 ? 'ot-pos' : 'ot-zero';

    return `<tr onclick="openModal('${esc(lab.labName)}')">
      <td class="td-lab">${esc(lab.labName)}</td>
      <td><span class="badge ${sysType === 'indysoft' ? 'badge-indysoft' : 'badge-caltrak'}">${sysType === 'indysoft' ? 'IndySoft' : 'CalTrak'}</span></td>
      <td><span class="badge ${statusBadgeClass(lc)}">${statusLabel(lc)}</span></td>
      <td class="td-num">${lab.totalTechs}</td>
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
      <td class="td-num">${trendHtml}</td>
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

  // Fetch DB history + build chart
  let dbHistory = [];
  try {
    const res = await apiFetch(`/api/labs/history/${encodeURIComponent(lab.labKey)}`);
    dbHistory = res.history ?? [];
  } catch (e) { /* no DB history */ }

  buildLabChart(lab, dbHistory);
  buildModalStats(labName);
}

function closeModal() {
  document.getElementById('lab-modal').setAttribute('hidden', '');
  if (st.chart) { st.chart.destroy(); st.chart = null; }
  st.modalLabName = null;
}

function onModalBackdropClick(e) {
  if (e.target === document.getElementById('lab-modal')) closeModal();
}

function buildLabChart(lab, dbHistory) {
  const histData = typeof HARDCODED_STD_HOURS_BY_MONTH !== 'undefined' ? HARDCODED_STD_HOURS_BY_MONTH : {};
  const fyStart = currentFYStartYear();
  const prevFYStart = fyStart - 1;

  // Build this FY and last FY series from monthly data
  const thisFY = FY_MONTH_SUFFIXES.map(mo => {
    const yr = mo <= '03' ? fyStart + 1 : fyStart;
    const key = `${yr}-${mo}`;
    return histData[key]?.[lab.labName] ?? null;
  });

  const lastFY = FY_MONTH_SUFFIXES.map(mo => {
    const yr = mo <= '03' ? prevFYStart + 1 : prevFYStart;
    const key = `${yr}-${mo}`;
    return histData[key]?.[lab.labName] ?? null;
  });

  // Also fold in DB history records (group by fiscal month)
  const dbByMonth = {};
  dbHistory.forEach(({ date, stdHrs }) => {
    const d = new Date(date + 'T00:00:00');
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    dbByMonth[`${yr}-${mo}`] = stdHrs;
  });
  // Override monthly data with DB values for this FY
  FY_MONTH_SUFFIXES.forEach((mo, i) => {
    const yr = mo <= '03' ? fyStart + 1 : fyStart;
    const key = `${yr}-${mo}`;
    if (dbByMonth[key] != null) thisFY[i] = dbByMonth[key];
  });
  FY_MONTH_SUFFIXES.forEach((mo, i) => {
    const yr = mo <= '03' ? prevFYStart + 1 : prevFYStart;
    const key = `${yr}-${mo}`;
    if (dbByMonth[key] != null) lastFY[i] = dbByMonth[key];
  });

  // Monthly capacity reference line
  const weeklyAvail = Math.max(0, lab.totalTechs - onsiteFTE(lab.labName, 'weekly'));
  const monthlyCap = weeklyAvail * (SHIFT_HRS * lab.productivityPct / 100) * lab.daysPerWeek * WEEKS_PER_MONTH;
  const capLine = FY_MONTH_LABELS.map(() => monthlyCap);

  const hasLastFY = lastFY.some(v => v != null);

  const ctx = document.getElementById('lab-chart');
  if (st.chart) { st.chart.destroy(); st.chart = null; }

  const datasets = [
    {
      label: `FY ${fyStart}–${String(fyStart + 1).slice(2)}`,
      data: thisFY,
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37,99,235,.08)',
      tension: 0.3,
      spanGaps: true,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
    },
    {
      label: 'Capacity',
      data: capLine,
      borderColor: '#d1d5db',
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
    },
  ];

  if (hasLastFY) {
    datasets.splice(1, 0, {
      label: `FY ${prevFYStart}–${String(prevFYStart + 1).slice(2)}`,
      data: lastFY,
      borderColor: '#a78bfa',
      borderDash: [3, 3],
      tension: 0.3,
      spanGaps: true,
      pointRadius: 3,
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
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y != null ? fmtInt(ctx.parsed.y) + ' hrs' : '—'}`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: '#f0f0f0' },
          ticks: { font: { size: 11 }, callback: v => fmtInt(v) },
          title: { display: true, text: 'Std Hrs / Month', font: { size: 10 }, color: '#a1a1aa' },
        },
      },
    },
  });
}

function buildModalStats(labName) {
  const histData = typeof HARDCODED_STD_HOURS_BY_MONTH !== 'undefined' ? HARDCODED_STD_HOURS_BY_MONTH : {};
  const fyStart = currentFYStartYear();
  const prevFYStart = fyStart - 1;

  const thisFYVals = FY_MONTH_SUFFIXES.map(mo => {
    const yr = mo <= '03' ? fyStart + 1 : fyStart;
    return histData[`${yr}-${mo}`]?.[labName];
  }).filter(v => v != null);

  const lastFYVals = FY_MONTH_SUFFIXES.map(mo => {
    const yr = mo <= '03' ? prevFYStart + 1 : prevFYStart;
    return histData[`${yr}-${mo}`]?.[labName];
  }).filter(v => v != null);

  const avgThis = thisFYVals.length ? thisFYVals.reduce((a, b) => a + b, 0) / thisFYVals.length : null;
  const avgLast = lastFYVals.length ? lastFYVals.reduce((a, b) => a + b, 0) / lastFYVals.length : null;
  const yoy = avgThis != null && avgLast != null && avgLast > 0
    ? ((avgThis - avgLast) / avgLast) * 100 : null;

  const statsEl = document.getElementById('modal-stats');
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">This FY avg</div>
      <div class="stat-value">${avgThis != null ? fmtInt(avgThis) : '—'}</div>
      <div class="stat-sub">std hrs/month · FY${fyStart}–${String(fyStart+1).slice(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Last FY avg</div>
      <div class="stat-value">${avgLast != null ? fmtInt(avgLast) : '—'}</div>
      <div class="stat-sub">std hrs/month · FY${prevFYStart}–${String(prevFYStart+1).slice(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">YoY change</div>
      <div class="stat-value" style="color:${yoy == null ? '#18181b' : yoy > 0 ? '#ef4444' : '#16a34a'}">
        ${yoy != null ? (yoy > 0 ? '+' : '') + fmt(yoy, 1) + '%' : '—'}
      </div>
      <div class="stat-sub">${yoy == null ? 'Insufficient prior-year data' : 'vs prior fiscal year'}</div>
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
function openUploadModal() {
  document.getElementById('upload-modal').removeAttribute('hidden');
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
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const s = data.summary ?? {};
    resultEl.className = 'upload-result ok';
    resultEl.textContent = `Done — ${s.inserted ?? 0} inserted, ${s.updated ?? 0} updated, ${s.unchanged ?? 0} unchanged.` +
      (data.issues?.length ? `\n${data.issues.length} warnings.` : '');
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
  await loadData();
  renderStatusBoard();
}

document.addEventListener('DOMContentLoaded', init);
