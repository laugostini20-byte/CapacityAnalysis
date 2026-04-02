const BASE_LABS = [
  {n:1, lab:'Martin Cal Lab (Burns)',       techs:61, stdHrs:null},
  {n:2, lab:'Essco Cal Lab',                techs:58, stdHrs:null},
  {n:3, lab:'Houston Cal Lab',              techs:34, stdHrs:943},
  {n:4, lab:'Biomedical',          techs:33, stdHrs:null},
  {n:5, lab:'Philadelphia Cal Lab',         techs:30, stdHrs:618},
  {n:6, lab:'Rochester Cal Lab',            techs:27, stdHrs:1084},
  {n:7, lab:'Montreal Cal Lab',             techs:24, stdHrs:null},
  {n:8, lab:'Pipettes Milford Lab',         techs:21, stdHrs:null},
  {n:9, lab:'Dayton Cal Lab',               techs:19, stdHrs:882},
  {n:10,lab:'Toronto Cal Lab',              techs:19, stdHrs:321},
  {n:11,lab:'Charlotte Cal Lab',            techs:17, stdHrs:369},
  {n:12,lab:'Denver Cal Lab',               techs:15, stdHrs:552},
  {n:13,lab:'Pittsburgh Cal Lab',           techs:14, stdHrs:515},
  {n:14,lab:'Martin Cal Lab (RMS)',         techs:13, stdHrs:null},
  {n:15,lab:'Los Angeles Cal Lab',          techs:13, stdHrs:539},
  {n:16,lab:'Chesapeake Cal Lab',           techs:12, stdHrs:null},
  {n:17,lab:'Cleveland Cal Lab',            techs:12, stdHrs:null},
  {n:18,lab:'St. Louis Cal Lab',            techs:12, stdHrs:487},
  {n:19,lab:'Pipettes Field Service',       techs:11, stdHrs:null},
  {n:20,lab:'Boston Cal Lab',               techs:9,  stdHrs:274},
  {n:21,lab:'Alliance Cal Lab',             techs:7,  stdHrs:null},
  {n:22,lab:'Portland Cal Lab',             techs:7,  stdHrs:354},
  {n:23,lab:'Martin Cal Lab (Mund)',        techs:7,  stdHrs:null},
  {n:24,lab:'Honda Lincoln, AL (AAP)',      techs:7,  stdHrs:166},
  {n:25,lab:'Phoenix Cal Lab',              techs:7,  stdHrs:null},
  {n:26,lab:'San Diego Cal Lab',            techs:6,  stdHrs:null},
  {n:27,lab:'Martin Cal Lab (GLC)',         techs:5,  stdHrs:null},
  {n:28,lab:'Tangent Indianapolis Lab',     techs:5,  stdHrs:null},
  {n:29,lab:'Palm Beach Cal Lab',           techs:4,  stdHrs:140},
  {n:30,lab:'Honda E Liberty, OH (ELP)',    techs:3,  stdHrs:54},
  {n:31,lab:'Honda Greensburg IN (IAP)',    techs:3,  stdHrs:57},
  {n:32,lab:'Ottawa Cal Lab',               techs:3,  stdHrs:77},
  {n:33,lab:'Martin Cal Lab (PTS)',         techs:3,  stdHrs:null},
  {n:34,lab:'Tangent Decatur Cal Lab',      techs:3,  stdHrs:null},
  {n:35,lab:'Pipettes San Diego Lab',       techs:3,  stdHrs:null},
  {n:36,lab:'Honda Dayton, OH',             techs:2,  stdHrs:82},
  {n:37,lab:'Martin Cal Lab (Los Alam)',    techs:2,  stdHrs:null},
  {n:38,lab:'Puerto Rico Cal Lab',          techs:2,  stdHrs:29},
  {n:39,lab:'Martin Cal Lab (Eau)',         techs:2,  stdHrs:null},
  {n:40,lab:'Honda Anna, OH (AEP)',         techs:1,  stdHrs:23},
  {n:41,lab:'Honda Marysville OH (MAP)',    techs:1,  stdHrs:44},
];

const SCHEDULE_LAB_MAP = {
  '01':'Rochester','02':'Portland','05':'Houston','06':'Philadelphia',
  '09':'Toronto','11':'Boston','15':'Dayton','17':'Charlotte',
  '19':'Los Angeles','23':'Denver','24':'Phoenix','31':'San Diego',
  '33':'Ottawa','61':'Palm Beach','M5':'St. Louis'
};

let scheduleRows = [];
let currentWeekStart = getThisMonday();
let labRows = [];
let sortKey = 'status';
let sortDir = 1;
let colHelpTipEl = null;
let currentView = 'weekly';
let currentThresh = 0.85;
let stdHoursOverrides = {};
let schedulePersistenceEnabled = false;
const DEFAULT_HEADCOUNT_BY_MONTH = typeof HARDCODED_MONTHLY_HEADCOUNT !== 'undefined'
  ? HARDCODED_MONTHLY_HEADCOUNT
  : {};
let headcountByMonth = JSON.parse(JSON.stringify(DEFAULT_HEADCOUNT_BY_MONTH));
const headcountSourceName = 'Historical baseline (Apr 2025-Mar 2026)';

const VIEW_META = {
  weekly: {
    label: 'Weekly',
    demandKey: 'wDemand',
    capKey: 'wCap',
    gapKey: 'wGap',
    utilKey: 'wUtil',
    demandHeader: 'Std hrs',
    capHeader: 'Weekly cap',
    gapHeader: 'Weekly gap',
    demandHelp: 'Standard weekly demand hours for the lab.',
    capHelp: 'Estimated weekly supply capacity from available techs and assumptions.',
    gapHelp: 'Weekly cap minus weekly demand; negative means shortfall.'
  },
  monthly: {
    label: 'Monthly',
    demandKey: 'mDemand',
    capKey: 'mCap',
    gapKey: 'mGap',
    utilKey: 'mUtil',
    demandHeader: 'Month demand',
    capHeader: 'Month cap',
    gapHeader: 'Month gap',
    demandHelp: 'Estimated monthly demand converted from weekly demand using Weeks/month.',
    capHelp: 'Estimated monthly capacity using Weeks/month.',
    gapHelp: 'Monthly cap minus monthly demand; negative means shortfall.'
  },
  quarterly: {
    label: 'Quarterly',
    demandKey: 'qDemand',
    capKey: 'qCap',
    gapKey: 'qGap',
    utilKey: 'qUtil',
    demandHeader: 'Quarter demand',
    capHeader: 'Quarter cap',
    gapHeader: 'Quarter gap',
    demandHelp: 'Demand for the fiscal quarter (3 months). Fiscal calendar runs Apr-Mar.',
    capHelp: 'Capacity for the fiscal quarter (3 months). Fiscal calendar runs Apr-Mar.',
    gapHelp: 'Quarter cap minus quarter demand; negative means shortfall.'
  },
  yearly: {
    label: 'Yearly',
    demandKey: 'yDemand',
    capKey: 'yCap',
    gapKey: 'yGap',
    utilKey: 'yUtil',
    demandHeader: 'FY demand',
    capHeader: 'FY cap',
    gapHeader: 'FY gap',
    demandHelp: 'Demand for the full fiscal year (Apr-Mar).',
    capHelp: 'Capacity for the full fiscal year (Apr-Mar).',
    gapHelp: 'Fiscal-year capacity minus fiscal-year demand; negative means shortfall.'
  }
};

function getThisMonday() {
  const d = new Date(); d.setHours(0,0,0,0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function fmtDate(d) { return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function fmtDateShort(d) { return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }

function workdaysInRange(start, end, wStart, wEnd) {
  const lo = start < wStart ? wStart : start;
  const hi = end > wEnd ? wEnd : end;
  if (lo > hi) return 0;
  let c = 0, cur = new Date(lo);
  while (cur <= hi) { const dow = cur.getDay(); if (dow!==0&&dow!==6) c++; cur.setDate(cur.getDate()+1); }
  return c;
}

function parseAnyDate(v) {
  if (!v) return null;
  if (typeof v === 'number') { const d=new Date(Math.round((v-25569)*86400*1000)); return isNaN(d)?null:d; }
  const d = new Date(String(v)); return isNaN(d)?null:d;
}

function normalizeLabForMatch(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findLabByKeyword(keyword) {
  const kwNorm = normalizeLabForMatch(keyword);
  if (!kwNorm) return null;
  return BASE_LABS.find(l => {
    const labNorm = normalizeLabForMatch(l.lab);
    return labNorm.includes(kwNorm) || kwNorm.includes(labNorm);
  }) || null;
}

function resolveLabName(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\w+)\s*-\s*(.+)/);
  if (m) {
    const kw = SCHEDULE_LAB_MAP[m[1].trim()] || m[2].trim();
    const found = findLabByKeyword(kw);
    if (found) return found.lab;
  }
  const found = findLabByKeyword(s);
  return found ? found.lab : null;
}

function normalizeHeader(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getRowValueByHeaders(row, headerCandidates) {
  const map = {};
  Object.keys(row || {}).forEach(key => { map[normalizeHeader(key)] = row[key]; });
  for (const header of headerCandidates) {
    const val = map[normalizeHeader(header)];
    if (val != null && String(val).trim() !== '') return val;
  }
  return null;
}

function parseHoursValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/,/g, '').replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function getMonthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function addMonths(d, n) {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}

function getHeadcountForLabMonth(lab, monthKey) {
  const monthMap = headcountByMonth[monthKey];
  if (monthMap) {
    if (Number.isFinite(monthMap[lab.lab])) return monthMap[lab.lab];
    return 0;
  }
  return lab.techs;
}

function getFiscalQuarterMonthKeys(date) {
  const fiscalMonth = (date.getMonth() + 9) % 12;
  const offset = fiscalMonth % 3;
  const start = addMonths(new Date(date.getFullYear(), date.getMonth(), 1), -offset);
  return [0, 1, 2].map(i => getMonthKey(addMonths(start, i)));
}

function getFiscalYearMonthKeys(date) {
  const fyStartYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const start = new Date(fyStartYear, 3, 1);
  return Array.from({length: 12}, (_, i) => getMonthKey(addMonths(start, i)));
}

function getStdHoursForLab(lab) {
  if (Object.prototype.hasOwnProperty.call(stdHoursOverrides, lab.lab)) {
    return stdHoursOverrides[lab.lab];
  }
  return lab.stdHrs;
}

async function parseRowsFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const txt = await file.text();
    return Papa.parse(txt, {header:true, skipEmptyLines:true}).data;
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array', cellDates:false});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
}

function rowsFromApiEvents(events) {
  return (events || []).map(e => ({
    Lab: e.lab,
    'Start Time': e.startDate,
    'End Time': e.endDate,
    'Number of Tech': e.techCount
  }));
}

async function fetchPersistedScheduleRows() {
  let res;
  try {
    res = await fetch('/api/schedules', {headers: {Accept: 'application/json'}});
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Schedule fetch failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.events)) return [];
  return rowsFromApiEvents(payload.events);
}

async function trySyncScheduleToApi(file) {
  const fd = new FormData();
  fd.append('file', file);
  let res;
  try {
    res = await fetch('/api/schedules/sync', {method: 'POST', body: fd});
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Upload sync failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  return res.json();
}

async function loadPersistedSchedule({silent = false} = {}) {
  const rows = await fetchPersistedScheduleRows();
  if (rows == null) return false;
  scheduleRows = rows;
  schedulePersistenceEnabled = true;
  if (!silent) {
    const stEl = document.getElementById('st-sched');
    stEl.innerHTML = `<div class="file-status ok">✓ ${rows.length} persisted onsite entries loaded</div>`;
    document.getElementById('footer-updated').textContent =
      `Schedule loaded from database · ${new Date().toLocaleTimeString()}`;
  }
  recalc();
  return true;
}

function getTechDaysLost(weekStart) {
  const weekEnd = addDays(weekStart, 4);
  const lost = {};
  for (const row of scheduleRows) {
    const labRaw = row['Lab'] || row['lab'] || '';
    const numTechs = parseFloat(row['Number of Tech'] || row['Techs'] || row['Tech Count'] || 0);
    if (!numTechs || numTechs <= 0) continue;
    const start = parseAnyDate(row['Start Time'] || row['Start'] || row['From'] || '');
    const end   = parseAnyDate(row['End Time']   || row['End']   || row['To']   || '');
    if (!start || !end) continue;
    const labName = resolveLabName(labRaw);
    if (!labName) continue;
    const days = workdaysInRange(start, end, weekStart, weekEnd);
    if (days > 0) lost[labName] = (lost[labName]||0) + numTechs * days;
  }
  return lost;
}

function shiftWeek(dir) { currentWeekStart = addDays(currentWeekStart, dir*7); recalc(); }

function getFiscalQuarterLabel(d) {
  const m = d.getMonth();
  if (m >= 3 && m <= 5) return 'Q1 (Apr-Jun)';
  if (m >= 6 && m <= 8) return 'Q2 (Jul-Sep)';
  if (m >= 9 && m <= 11) return 'Q3 (Oct-Dec)';
  return 'Q4 (Jan-Mar)';
}

function getActiveViewMeta() {
  return VIEW_META[currentView] || VIEW_META.weekly;
}

function getDemandForView(row) {
  return row[getActiveViewMeta().demandKey];
}

function getCapForView(row) {
  return row[getActiveViewMeta().capKey];
}

function getGapForView(row) {
  return row[getActiveViewMeta().gapKey];
}

function getUtilForView(row) {
  return row[getActiveViewMeta().utilKey];
}

function getStatusFromUtil(util) {
  if (util == null) return 'ok';
  if (util > 1) return 'over';
  if (util >= currentThresh) return 'risk';
  return 'ok';
}

function fmtHrs(v) {
  if (!Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString();
}

function updateViewDecor() {
  const meta = getActiveViewMeta();
  const demandEl = document.getElementById('hdr-demand');
  const capEl = document.getElementById('hdr-cap');
  const gapEl = document.getElementById('hdr-gap');
  if (demandEl) {
    demandEl.textContent = meta.demandHeader;
    demandEl.setAttribute('data-help', meta.demandHelp);
  }
  if (capEl) {
    capEl.textContent = meta.capHeader;
    capEl.setAttribute('data-help', meta.capHelp);
  }
  if (gapEl) {
    const arr = document.getElementById('arr-gap');
    const arrow = arr ? arr.outerHTML : '<span class="sort-arrow" id="arr-gap"></span>';
    gapEl.innerHTML = `${meta.gapHeader} ${arrow}`;
    gapEl.setAttribute('data-help', meta.gapHelp);
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
  });
}

function updateStatusSummary() {
  const over = labRows.filter(r => getStatusFromUtil(getUtilForView(r)) === 'over').length;
  const risk = labRows.filter(r => getStatusFromUtil(getUtilForView(r)) === 'risk').length;
  const ok = labRows.filter(r => getStatusFromUtil(getUtilForView(r)) === 'ok').length;
  document.getElementById('m-total').textContent = labRows.length;
  document.getElementById('m-over').textContent = over;
  document.getElementById('m-risk').textContent = risk;
  document.getElementById('m-ok').textContent = ok;
}

function setView(view) {
  if (!VIEW_META[view]) return;
  currentView = view;
  updateViewDecor();
  updateStatusSummary();
  renderTable();
}

function ensureColHelpTip() {
  if (colHelpTipEl) return colHelpTipEl;
  colHelpTipEl = document.createElement('div');
  colHelpTipEl.className = 'col-help-tip';
  document.body.appendChild(colHelpTipEl);
  return colHelpTipEl;
}

function positionColHelpTip(e) {
  if (!colHelpTipEl || !colHelpTipEl.classList.contains('show')) return;
  const pad = 12;
  const rect = colHelpTipEl.getBoundingClientRect();
  let left = e.clientX + 12;
  let top = e.clientY + 14;
  if (left + rect.width + pad > window.innerWidth) left = e.clientX - rect.width - 12;
  if (top + rect.height + pad > window.innerHeight) top = e.clientY - rect.height - 14;
  colHelpTipEl.style.left = `${Math.max(pad, left)}px`;
  colHelpTipEl.style.top = `${Math.max(pad, top)}px`;
}

function showColHelpTip(e) {
  const text = e.currentTarget.getAttribute('data-help');
  if (!text) return;
  const tip = ensureColHelpTip();
  tip.textContent = text;
  tip.classList.add('show');
  positionColHelpTip(e);
}

function hideColHelpTip() {
  if (!colHelpTipEl) return;
  colHelpTipEl.classList.remove('show');
}

function initColumnHelpTooltips() {
  document.querySelectorAll('thead th[data-help]').forEach(th => {
    th.addEventListener('mouseenter', showColHelpTip);
    th.addEventListener('mousemove', positionColHelpTip);
    th.addEventListener('mouseleave', hideColHelpTip);
  });
}

function setSort(key) {
  if (sortKey === key) { sortDir *= -1; } else { sortKey = key; sortDir = 1; }
  document.querySelectorAll('[id^="arr-"]').forEach(el => el.textContent = '');
  const el = document.getElementById('arr-'+key);
  if (el) el.textContent = sortDir === 1 ? ' ↑' : ' ↓';
  document.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
  const activeTh = document.querySelector(`thead th[data-sort="${key}"]`);
  if (activeTh) activeTh.classList.add('sorted');
  const sortSelect = document.getElementById('f-sort');
  if (sortSelect && [...sortSelect.options].some(o => o.value === key)) sortSelect.value = key;
  renderTable();
}

function onSortSelect() {
  const key = document.getElementById('f-sort').value;
  if (!key) return;
  sortKey = key;
  sortDir = 1;
  document.querySelectorAll('[id^="arr-"]').forEach(el => el.textContent = '');
  const el = document.getElementById('arr-'+key);
  if (el) el.textContent = ' ↑';
  document.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
  const activeTh = document.querySelector(`thead th[data-sort="${key}"]`);
  if (activeTh) activeTh.classList.add('sorted');
  renderTable();
}

async function loadSchedule(e) {
  const file = e.target.files[0]; if (!file) return;
  const stEl = document.getElementById('st-sched');
  stEl.innerHTML = '<div class="file-status" style="color:#888">Parsing...</div>';
  try {
    const syncPayload = await trySyncScheduleToApi(file);
    if (syncPayload) {
      await loadPersistedSchedule({silent: true});
      const summary = syncPayload.summary || {};
      const inserted = summary.inserted ?? 0;
      const updated = summary.updated ?? 0;
      const unchanged = summary.unchanged ?? 0;
      stEl.innerHTML = `<div class="file-status ok">✓ ${file.name} &nbsp;·&nbsp; ${inserted} new · ${updated} updated · ${unchanged} unchanged</div>`;
      document.getElementById('footer-updated').textContent =
        `Schedule synced to database: ${file.name} · ${new Date().toLocaleTimeString()}`;
      recalc();
      return;
    }

    const rows = await parseRowsFromFile(file);
    scheduleRows = rows;
    schedulePersistenceEnabled = false;
    stEl.innerHTML = `<div class="file-status ok">✓ ${file.name} &nbsp;·&nbsp; ${rows.length} entries loaded</div>`;
    document.getElementById('footer-updated').textContent =
      `Schedule loaded (session only): ${file.name} · ${new Date().toLocaleTimeString()}`;
    recalc();
  } catch(err) {
    stEl.innerHTML = `<div class="file-status err">⚠ Parse error: ${err.message}</div>`;
  }
}

async function loadStdHours(e) {
  const file = e.target.files[0]; if (!file) return;
  const stEl = document.getElementById('st-std');
  stEl.innerHTML = '<div class="file-status" style="color:#888">Parsing...</div>';
  try {
    const rows = await parseRowsFromFile(file);
    const nextOverrides = {};
    let validRows = 0;
    let matchedRows = 0;
    let unmatchedRows = 0;

    for (const row of rows) {
      const labRaw = getRowValueByHeaders(row, [
        'Lab',
        'Lab / Department',
        'Lab Name',
        'Department',
        'Location'
      ]);
      const stdRaw = getRowValueByHeaders(row, [
        'Current Std Hours',
        'Std Hours',
        'Standard Hours',
        'StdHrs',
        'Weekly Demand',
        'Demand Hrs'
      ]);
      const stdHours = parseHoursValue(stdRaw);
      if (!labRaw || stdHours == null) continue;
      validRows++;

      const labName = resolveLabName(labRaw);
      if (!labName) {
        unmatchedRows++;
        continue;
      }
      nextOverrides[labName] = stdHours;
      matchedRows++;
    }

    if (!validRows) {
      stEl.innerHTML = '<div class="file-status err">⚠ No usable rows found. Expected columns like Lab + Current Std Hours.</div>';
      return;
    }
    if (!matchedRows) {
      stEl.innerHTML = '<div class="file-status err">⚠ No labs matched your file rows to the current lab list.</div>';
      return;
    }

    stdHoursOverrides = nextOverrides;
    stEl.innerHTML = `<div class="file-status ok">✓ ${file.name} &nbsp;·&nbsp; ${matchedRows} labs updated${unmatchedRows ? ` · ${unmatchedRows} unmatched` : ''}</div>`;
    recalc();
  } catch (err) {
    stEl.innerHTML = `<div class="file-status err">⚠ Parse error: ${err.message}</div>`;
  }
}

// Drag-and-drop support
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) { document.getElementById('f-sched').files; loadScheduleFromFile(file); }
});

async function loadScheduleFromFile(file) {
  const fakeEvent = { target: { files: [file] } };
  await loadSchedule(fakeEvent);
}

function recalc() {
  const hrsPerDay   = parseFloat(document.getElementById('p-hrs').value)   || 5.6;
  const daysPerWeek = parseFloat(document.getElementById('p-days').value)   || 5;
  const weeksPerMo  = parseFloat(document.getElementById('p-weeks').value)  || 4.33;
  currentThresh     = (parseFloat(document.getElementById('p-thresh').value) || 85) / 100;

  const weekEnd = addDays(currentWeekStart, 4);
  document.getElementById('week-label').textContent = `${fmtDate(currentWeekStart)} – ${fmtDate(weekEnd)}`;

  const techDaysLost = getTechDaysLost(currentWeekStart);
  const totalOnsiteFTE = Object.values(techDaysLost).reduce((s,v)=>s+v,0) / daysPerWeek;
  const monthKey = getMonthKey(currentWeekStart);
  const quarterKeys = getFiscalQuarterMonthKeys(currentWeekStart);
  const yearKeys = getFiscalYearMonthKeys(currentWeekStart);
  const hasHeadcountData = Object.keys(headcountByMonth).length > 0;

  const activeLabs = BASE_LABS.filter(l => getStdHoursForLab(l) != null);

  labRows = activeLabs.map(l => {
    const stdHours = getStdHoursForLab(l);
    const baseTech = getHeadcountForLabMonth(l, monthKey);
    const lost    = techDaysLost[l.lab] || 0;
    const lostFTE = lost / daysPerWeek;
    const avail   = Math.max(0, baseTech - lostFTE);
    const wDemand = stdHours;
    const mDemand = wDemand * weeksPerMo;
    const qDemand = mDemand * 3;
    const yDemand = mDemand * 12;

    const wCap    = avail * hrsPerDay * daysPerWeek;
    const monthCapPerFte = hrsPerDay * daysPerWeek * weeksPerMo;
    const mCap    = getHeadcountForLabMonth(l, monthKey) * monthCapPerFte;
    const qCap    = quarterKeys.reduce((s, k) => s + (getHeadcountForLabMonth(l, k) * monthCapPerFte), 0);
    const yCap    = yearKeys.reduce((s, k) => s + (getHeadcountForLabMonth(l, k) * monthCapPerFte), 0);

    const wGap    = wCap - wDemand;
    const mGap    = mCap - mDemand;
    const qGap    = qCap - qDemand;
    const yGap    = yCap - yDemand;

    const wUtil   = wDemand > 0 && wCap > 0 ? wDemand / wCap : null;
    const mUtil   = mDemand > 0 && mCap > 0 ? mDemand / mCap : null;
    const qUtil   = qDemand > 0 && qCap > 0 ? qDemand / qCap : null;
    const yUtil   = yDemand > 0 && yCap > 0 ? yDemand / yCap : null;

    return {
      ...l,
      baseTech,
      lostFTE,
      avail,
      wDemand,
      mDemand,
      qDemand,
      yDemand,
      wCap,
      mCap,
      qCap,
      yCap,
      wGap,
      mGap,
      qGap,
      yGap,
      wUtil,
      mUtil,
      qUtil,
      yUtil
    };
  });

  document.getElementById('m-onsite').textContent = totalOnsiteFTE.toFixed(1);

  const hasOnsite = scheduleRows.length > 0;
  const weekOnsiteEntries = Object.values(techDaysLost).reduce((s,v)=>s+v,0);
  const onsiteText = !hasOnsite
    ? (schedulePersistenceEnabled
      ? 'No onsite entries stored for this week'
      : 'No schedule loaded — using base headcount')
    : weekOnsiteEntries > 0
      ? `${weekOnsiteEntries.toFixed(0)} tech-days on onsite this week`
      : 'No onsite entries for this week';
  const hcText = hasHeadcountData
    ? `Headcount basis: ${monthKey}${headcountSourceName ? ` · ${headcountSourceName}` : ''}`
    : 'Headcount basis: static baseline';
  document.getElementById('week-sub').textContent = `${onsiteText} · ${hcText}`;

  updateViewDecor();
  updateStatusSummary();
  renderTable();
}

function renderTable() {
  const q  = (document.getElementById('q').value || '').trim().toLowerCase();
  const fs = document.getElementById('f-status').value;

  let rows = [...labRows];
  if (q)  rows = rows.filter(r => r.lab.toLowerCase().includes(q));
  if (fs !== 'all') rows = rows.filter(r => getStatusFromUtil(getUtilForView(r)) === fs);

  const statusOrder = {over:0, risk:1, ok:2};
  rows.sort((a,b) => {
    let av, bv;
    if (sortKey==='status')    {
      av = statusOrder[getStatusFromUtil(getUtilForView(a))];
      bv = statusOrder[getStatusFromUtil(getUtilForView(b))];
    }
    else if (sortKey==='name') { return sortDir * a.lab.localeCompare(b.lab); }
    else if (sortKey==='headcount') { av=a.baseTech; bv=b.baseTech; }
    else if (sortKey==='util') { av=getUtilForView(a)??-1; bv=getUtilForView(b)??-1; }
    else if (sortKey==='gap')  { av=getGapForView(a); bv=getGapForView(b); }
    else if (sortKey==='onsite'){av=a.lostFTE; bv=b.lostFTE; }
    else {
      av = statusOrder[getStatusFromUtil(getUtilForView(a))];
      bv = statusOrder[getStatusFromUtil(getUtilForView(b))];
    }
    if (sortKey === 'status') return sortDir * (av - bv);
    return sortDir * (bv - av);
  });

  document.getElementById('row-count').textContent = `${rows.length} lab${rows.length!==1?'s':''}`;
  const body = document.getElementById('tbl-body');

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9">
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No labs match your filters</div>
        <div class="empty-sub">Try clearing the search or changing the status filter</div>
      </div></td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const demand = getDemandForView(r);
    const cap = getCapForView(r);
    const gap = getGapForView(r);
    const util = getUtilForView(r);
    const status = getStatusFromUtil(util);

    const utilPct  = util != null ? Math.round(util * 100) : null;
    const barPct   = utilPct != null ? Math.min(utilPct, 100) : 0;
    const barCls   = status==='over' ? 'bar-over' : status==='risk' ? 'bar-risk' : 'bar-ok';
    const utilColor= status==='over' ? 'num-red'  : status==='risk' ? 'num-amber' : 'num-green';
    const gapStr   = gap != null ? (gap>=0?'+':'')+Math.round(gap)+' hrs' : '—';
    const gapCls   = gap < 0 ? 'num-red' : gap < cap*0.15 ? 'num-amber' : 'num-green';
    const lostDisp = r.lostFTE > 0
      ? `<span class="num-red">${r.lostFTE.toFixed(1)}</span>`
      : '<span class="num-muted">—</span>';
    const availDisp= r.lostFTE > 0
      ? `<span class="num-amber">${r.avail.toFixed(1)}</span>`
      : `${r.baseTech}`;
    let badge = '';
    if (status==='over') badge='<span class="badge badge-over">&#9650; Over</span>';
    else if (status==='risk') badge='<span class="badge badge-risk">&#9888; At risk</span>';
    else badge='<span class="badge badge-ok">&#10003; Healthy</span>';

    return `<tr>
      <td class="lab-name">${r.lab}</td>
      <td class="num">${r.baseTech}</td>
      <td class="num">${lostDisp}</td>
      <td class="num">${availDisp}</td>
      <td class="num">${fmtHrs(demand)}</td>
      <td class="num">${fmtHrs(cap)}</td>
      <td class="num ${gapCls}">${gapStr}</td>
      <td>${utilPct!=null?`
        <div class="util-wrap">
          <div class="util-pct ${utilColor}">${utilPct}%</div>
          <div class="bar-track"><div class="bar-fill ${barCls}" style="width:${barPct}%"></div></div>
        </div>`:'—'}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

// Init
async function initApp() {
  initColumnHelpTooltips();
  setSort('status');
  recalc();
  try {
    await loadPersistedSchedule();
  } catch (_err) {
    // Keep local-only mode if API is unavailable.
  }
}

initApp();
