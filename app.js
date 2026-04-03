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
const INDYSOFT_LABS = new Set([
  'Tangent Decatur Cal Lab',
  'Tangent Indianapolis Lab',
  'Montreal Cal Lab',
  'Biomedical',
  'Chesapeake Cal Lab',
  'Cleveland Cal Lab',
  'San Diego Cal Lab',
  'Pipettes Milford Lab',
  'Pipettes Field Service',
  'Pipettes San Diego Lab'
]);

let scheduleRows = [];
let currentWeekStart = getThisMonday();
let labRows = [];
let scenarioLabRows = [];
let sortKey = 'status';
let sortDir = 1;
let colHelpTipEl = null;
let currentView = 'weekly';
let currentThresh = 0.85;
const PAGE_TABS = new Set(['overview', 'scenario']);
let currentPageTab = 'overview';
let platformFilterMode = 'caltrak';
let selectedLabNames = new Set();
let labPickerInitialized = false;
let labPickerSearchTerm = '';
let selectAllVisibleLabsOnNextRender = false;
let scenarioSelectedLabNames = new Set();
let scenarioLabPickerInitialized = false;
let scenarioLabPickerSearchTerm = '';
let scenarioLastAvailableLabNames = new Set();
let scenarioProfiles = [];
let scenarioPersistenceEnabled = false;
let scenarioRowsByLab = new Map();
let scenarioAggregate = null;
const defaultScenarioModel = () => ({
  id: null,
  name: '',
  enabled: false,
  scopeType: 'selection',
  scopePlatform: 'caltrak',
  onsitePct: 0,
  productivityPct: 0,
  headcountDelta: 0,
  demandPct: 0,
  selectedLabs: [],
  view: 'weekly',
  statusFilter: 'all'
});
let scenarioModel = defaultScenarioModel();
let stdHoursOverrides = {};
const DEFAULT_STD_HOURS_BY_MONTH = typeof HARDCODED_STD_HOURS_BY_MONTH !== 'undefined'
  ? HARDCODED_STD_HOURS_BY_MONTH
  : {};
let stdHoursByMonth = JSON.parse(JSON.stringify(DEFAULT_STD_HOURS_BY_MONTH));
const stdHoursSourceName = 'Historical standard hours (Mar 2025-Mar 2026)';
let stdHoursRangeOverrides = [];
let stdHoursPersistenceEnabled = false;
let stdUploadModalResolver = null;
let schedulePersistenceEnabled = false;
const DEFAULT_HEADCOUNT_BY_MONTH = typeof HARDCODED_MONTHLY_HEADCOUNT !== 'undefined'
  ? HARDCODED_MONTHLY_HEADCOUNT
  : {};
let headcountByMonth = JSON.parse(JSON.stringify(DEFAULT_HEADCOUNT_BY_MONTH));
const headcountSourceName = 'Historical baseline (Apr 2025-Mar 2026)';
const STD_HOURS_LAB_HEADERS = [
  'Lab',
  'Lab / Department',
  'Lab Name',
  'Department',
  'Location'
];
const STD_HOURS_VALUE_HEADERS = [
  'Current Std Hours',
  'Std Hours',
  'Standard Hours',
  'StdHrs',
  'Weekly Demand',
  'Demand Hrs'
];
const STD_HOURS_CODE_TO_LAB = {
  '01': 'Rochester Cal Lab',
  '02': 'Portland Cal Lab',
  '05': 'Houston Cal Lab',
  '06': 'Philadelphia Cal Lab',
  '09': 'Toronto Cal Lab',
  '11': 'Boston Cal Lab',
  '12': 'Puerto Rico Cal Lab',
  '13': 'Pittsburgh Cal Lab',
  '15': 'Dayton Cal Lab',
  '17': 'Charlotte Cal Lab',
  '19': 'Los Angeles Cal Lab',
  '23': 'Denver Cal Lab',
  '24': 'Phoenix Cal Lab',
  '25': 'Tangent Indianapolis Lab',
  '26': 'Tangent Decatur Cal Lab',
  '31': 'San Diego Cal Lab',
  '33': 'Ottawa Cal Lab',
  '34': 'Montreal Cal Lab',
  '42': 'Pipettes Milford Lab',
  '49': 'Biomedical',
  '56': 'Chesapeake Cal Lab',
  '61': 'Palm Beach Cal Lab',
  '68': 'Cleveland Cal Lab',
  'M5': 'St. Louis Cal Lab',
  'C08': 'Honda Lincoln, AL (AAP)',
  'C09': 'Honda Greensburg IN (IAP)',
  'C10': 'Honda Marysville OH (MAP)',
  'C11': 'Honda E Liberty, OH (ELP)',
  'C12': 'Honda Anna, OH (AEP)',
  'C13': 'Honda Dayton, OH'
};

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
    demandHeader: 'Qtr demand',
    capHeader: 'Qtr cap',
    gapHeader: 'Qtr gap',
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

function tokenizeLabKey(v) {
  const stop = new Set(['cal', 'lab', 'cbl', 'dept', 'department', 'site', 'service', 'field']);
  return normalizeLabForMatch(v)
    .split(' ')
    .map(t => t.trim())
    .filter(t => t && !stop.has(t) && !/^\d+$/.test(t));
}

function findLabByKeyword(keyword) {
  const kwNorm = normalizeLabForMatch(keyword);
  if (!kwNorm) return null;
  const direct = BASE_LABS.find(l => {
    const labNorm = normalizeLabForMatch(l.lab);
    return labNorm.includes(kwNorm) || kwNorm.includes(labNorm);
  });
  if (direct) return direct;

  const kwTokens = tokenizeLabKey(keyword);
  if (!kwTokens.length) return null;

  let best = null;
  let bestScore = 0;
  BASE_LABS.forEach(l => {
    const labTokens = tokenizeLabKey(l.lab);
    if (!labTokens.length) return;
    const overlap = kwTokens.filter(t => labTokens.includes(t)).length;
    if (!overlap) return;
    const score = overlap / kwTokens.length;
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  });

  return bestScore >= 0.5 ? best : null;
}

function getLabPlatform(labName) {
  return INDYSOFT_LABS.has(labName) ? 'Indysoft' : 'CalTrak';
}

function normalizeScenarioConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const selectedLabs = Array.isArray(src.selectedLabs)
    ? [...new Set(src.selectedLabs.map(v => String(v || '').trim()).filter(Boolean))]
    : [];
  const view = String(src.view || 'weekly').toLowerCase();
  const statusFilter = String(src.statusFilter || 'all').toLowerCase();
  const scopeType = String(src.scopeType || 'all').toLowerCase();
  const scopePlatform = String(src.scopePlatform || 'caltrak').toLowerCase();
  return {
    enabled: Boolean(src.enabled),
    scopeType: ['all', 'platform', 'selection'].includes(scopeType) ? scopeType : 'selection',
    scopePlatform: ['caltrak', 'indysoft'].includes(scopePlatform) ? scopePlatform : 'caltrak',
    onsitePct: toNum(src.onsitePct, 0),
    productivityPct: toNum(src.productivityPct, 0),
    headcountDelta: toNum(src.headcountDelta, 0),
    demandPct: toNum(src.demandPct, 0),
    selectedLabs,
    view: ['weekly', 'monthly', 'quarterly', 'yearly'].includes(view) ? view : 'weekly',
    statusFilter: ['all', 'over', 'risk', 'ok'].includes(statusFilter) ? statusFilter : 'all'
  };
}

function isScenarioScopeMatch(row) {
  if (!scenarioModel.enabled) return false;
  return scenarioSelectedLabNames.has(row.lab);
}

function getScenarioProfileNameFallback() {
  const stamp = new Date().toLocaleString();
  return `Scenario ${stamp}`;
}

function getScenarioScopeLabel() {
  const selectedCount = scenarioSelectedLabNames.size;
  const totalCount = scenarioLabRows.length;
  if (!totalCount) return 'no labs';
  if (!selectedCount) return 'no selected labs';
  if (selectedCount === totalCount) return 'all visible labs';
  return `${selectedCount} selected lab${selectedCount === 1 ? '' : 's'}`;
}

function updateScenarioSnapshot() {
  const snapshotEl = document.getElementById('scenario-snapshot');
  if (!snapshotEl) return;

  if (!scenarioModel.enabled) {
    snapshotEl.classList.remove('is-active');
    snapshotEl.textContent = 'Scenario workspace is ready. Open Scenario Analysis to run what-if tests from the current baseline.';
    return;
  }

  const fmtSigned = (value, suffix = '') => {
    const n = Number(value);
    if (!Number.isFinite(n)) return `0${suffix}`;
    const rounded = Number.isInteger(n) ? n : Number(n.toFixed(1));
    return `${rounded > 0 ? '+' : ''}${rounded}${suffix}`;
  };
  const scenarioName = (scenarioModel.name || 'Untitled').trim() || 'Untitled';
  snapshotEl.classList.add('is-active');
  snapshotEl.textContent =
    `Scenario "${scenarioName}" prepared for ${getScenarioScopeLabel()} · ` +
    `Onsite ${fmtSigned(scenarioModel.onsitePct, '%')} · ` +
    `Productivity ${fmtSigned(scenarioModel.productivityPct, '%')} · ` +
    `Headcount ${fmtSigned(scenarioModel.headcountDelta)} · ` +
    `Demand ${fmtSigned(scenarioModel.demandPct, '%')} · Dashboard remains baseline`;
}

function updateScenarioControls() {
  const enabledEl = document.getElementById('s-enabled');
  const nameEl = document.getElementById('s-name');
  const scopeTypeEl = document.getElementById('s-scope-type');
  const scopePlatformEl = document.getElementById('s-scope-platform');
  const onsiteEl = document.getElementById('s-onsite-pct');
  const prodEl = document.getElementById('s-prod-pct');
  const hcEl = document.getElementById('s-headcount-delta');
  const demandEl = document.getElementById('s-demand-pct');
  const statusFilterEl = document.getElementById('s-f-status');
  const scopePlatformWrap = document.getElementById('s-scope-platform-wrap');
  const noteEl = document.getElementById('scenario-note');
  const profileEl = document.getElementById('s-profile');

  if (enabledEl) enabledEl.checked = Boolean(scenarioModel.enabled);
  if (nameEl) nameEl.value = scenarioModel.name || '';
  if (scopeTypeEl) scopeTypeEl.value = scenarioModel.scopeType || 'selection';
  if (scopePlatformEl) scopePlatformEl.value = scenarioModel.scopePlatform || 'caltrak';
  if (onsiteEl) onsiteEl.value = String(scenarioModel.onsitePct ?? 0);
  if (prodEl) prodEl.value = String(scenarioModel.productivityPct ?? 0);
  if (hcEl) hcEl.value = String(scenarioModel.headcountDelta ?? 0);
  if (demandEl) demandEl.value = String(scenarioModel.demandPct ?? 0);
  if (statusFilterEl) statusFilterEl.value = scenarioModel.statusFilter || 'all';
  if (profileEl) profileEl.value = scenarioModel.id != null ? String(scenarioModel.id) : '';
  if (scopePlatformWrap && scopeTypeEl) scopePlatformWrap.style.display = (scopeTypeEl.value === 'platform') ? '' : 'none';

  if (noteEl) {
    const modeText = getScenarioScopeLabel();
    noteEl.textContent = scenarioModel.enabled
      ? `Scenario is active for ${modeText} in this tab. Baseline data is unchanged.`
      : 'Scenario mode is off. Open Scenario Analysis to run what-if tests without changing baseline data.';
  }
  updateScenarioSnapshot();
}

function setScenarioModelFromControls({recalcNow = true} = {}) {
  const enabledEl = document.getElementById('s-enabled');
  const nameEl = document.getElementById('s-name');
  const scopeTypeEl = document.getElementById('s-scope-type');
  const scopePlatformEl = document.getElementById('s-scope-platform');
  const onsiteEl = document.getElementById('s-onsite-pct');
  const prodEl = document.getElementById('s-prod-pct');
  const hcEl = document.getElementById('s-headcount-delta');
  const demandEl = document.getElementById('s-demand-pct');

  const statusFilterEl = document.getElementById('s-f-status');
  const parsed = normalizeScenarioConfig({
    enabled: true,
    scopeType: 'selection',
    scopePlatform: 'caltrak',
    onsitePct: onsiteEl ? onsiteEl.value : 0,
    productivityPct: prodEl ? prodEl.value : 0,
    headcountDelta: hcEl ? hcEl.value : 0,
    demandPct: demandEl ? demandEl.value : 0,
    selectedLabs: [...scenarioSelectedLabNames],
    view: currentView,
    statusFilter: statusFilterEl ? statusFilterEl.value : (scenarioModel.statusFilter || 'all')
  });
  scenarioModel = {
    ...scenarioModel,
    ...parsed,
    name: nameEl ? String(nameEl.value || '').trim() : scenarioModel.name
  };
  updateScenarioControls();
  if (recalcNow) recalc();
}

function onScenarioControlChange(recalcNow = true) {
  setScenarioModelFromControls({recalcNow});
}

function onScenarioStatusFilterChange() {
  const statusFilterEl = document.getElementById('s-f-status');
  const next = statusFilterEl ? String(statusFilterEl.value || 'all').toLowerCase() : 'all';
  scenarioModel.statusFilter = ['all', 'over', 'risk', 'ok'].includes(next) ? next : 'all';
  renderScenarioTable();
}

function resetScenarioAnalysis() {
  scenarioModel = {
    ...defaultScenarioModel(),
    enabled: true,
    scopeType: 'selection'
  };
  updateScenarioControls();
  recalc();
}

function labMatchesPlatformFilter(labName) {
  const platform = getLabPlatform(labName);
  if (platformFilterMode === 'all') return true;
  if (platformFilterMode === 'indysoft') return platform === 'Indysoft';
  return platform === 'CalTrak';
}

function onPlatformFilterChange() {
  const currentlyVisibleLabs = getAvailableLabNames();
  const hadAllVisibleSelected = currentlyVisibleLabs.length > 0
    && currentlyVisibleLabs.every(name => selectedLabNames.has(name));
  selectAllVisibleLabsOnNextRender = hadAllVisibleSelected;
  const selectEl = document.getElementById('f-platform');
  const nextMode = selectEl ? String(selectEl.value || 'caltrak').toLowerCase() : 'caltrak';
  platformFilterMode = ['caltrak', 'indysoft', 'all'].includes(nextMode) ? nextMode : 'caltrak';
  recalc();
}

function getAvailableLabNames() {
  return [...new Set(labRows.map(r => r.lab))].sort((a, b) => a.localeCompare(b));
}

function getScenarioAvailableLabNames() {
  return [...new Set(scenarioLabRows.map(r => r.lab))].sort((a, b) => a.localeCompare(b));
}

function updateLabPickerSummary(availableLabNames = getAvailableLabNames()) {
  const summaryEl = document.getElementById('lab-picker-summary');
  if (!summaryEl) return;
  const selectedCount = selectedLabNames.size;
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
  if (selectAllVisibleLabsOnNextRender) {
    selectedLabNames = new Set(availableLabNames);
    selectAllVisibleLabsOnNextRender = false;
    labPickerInitialized = true;
    return;
  }
  const availableSet = new Set(availableLabNames);
  const filteredSelected = [...selectedLabNames].filter(name => availableSet.has(name));
  if (!labPickerInitialized) {
    selectedLabNames = new Set(availableLabNames);
    labPickerInitialized = true;
    return;
  }
  if (selectedLabNames.size > 0 && filteredSelected.length === 0 && availableLabNames.length) {
    selectedLabNames = new Set(availableLabNames);
    return;
  }
  selectedLabNames = new Set(filteredSelected);
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
    .map(name => `<label class="lab-picker-option" data-lab-key="${escapeHtml(normalizeLabForMatch(name))}"><input type="checkbox" value="${escapeHtml(name)}" onchange="toggleLabSelection(this.value, this.checked)" ${selectedLabNames.has(name) ? 'checked' : ''}><span>${escapeHtml(name)}</span></label>`)
    .join('');

  menu.innerHTML = `
    <div class="lab-picker-actions">
      <button type="button" class="lab-picker-action" onclick="selectAllLabs(event)">Select all</button>
      <button type="button" class="lab-picker-action" onclick="deselectAllLabs(event)">Deselect all</button>
    </div>
    <div class="lab-picker-search-wrap">
      <input type="text" class="lab-picker-search" id="lab-picker-search" placeholder="Search labs..." value="${escapeHtml(labPickerSearchTerm)}" oninput="onLabPickerSearchInput(this.value)">
    </div>
    <div class="lab-picker-list" id="lab-picker-list">${optionsHtml}</div>
    <div class="lab-picker-empty" id="lab-picker-no-results" hidden>No labs match your search.</div>
  `;
  applyLabPickerSearch();
}

function getSelectedRows() {
  if (!selectedLabNames.size) return [];
  const selectedSet = new Set(selectedLabNames);
  return labRows.filter(r => selectedSet.has(r.lab));
}

function toggleLabSelection(labName, isSelected) {
  if (isSelected) selectedLabNames.add(labName);
  else selectedLabNames.delete(labName);
  updateLabPickerSummary();
  renderTable();
}

function selectAllLabs(e) {
  if (e) e.stopPropagation();
  selectedLabNames = new Set(getAvailableLabNames());
  labPickerSearchTerm = '';
  renderLabPickerOptions();
  renderTable();
}

function deselectAllLabs(e) {
  if (e) e.stopPropagation();
  selectedLabNames.clear();
  labPickerSearchTerm = '';
  renderLabPickerOptions();
  renderTable();
}

function onLabPickerSearchInput(value) {
  labPickerSearchTerm = normalizeLabForMatch(value || '');
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

function syncScenarioSelectionToModel() {
  scenarioModel.selectedLabs = [...scenarioSelectedLabNames];
}

function syncScenarioLabPickerSelection(availableLabNames) {
  const availableSet = new Set(availableLabNames);
  const previousAvailableSet = scenarioLastAvailableLabNames;
  const filteredSelected = [...scenarioSelectedLabNames].filter(name => availableSet.has(name));
  const hadAllPreviouslyAvailableSelected = previousAvailableSet.size > 0
    && [...previousAvailableSet].every(name => scenarioSelectedLabNames.has(name));
  if (!scenarioLabPickerInitialized) {
    scenarioSelectedLabNames = new Set(availableLabNames);
    scenarioLabPickerInitialized = true;
    scenarioLastAvailableLabNames = new Set(availableLabNames);
    syncScenarioSelectionToModel();
    return;
  }
  if (hadAllPreviouslyAvailableSelected) {
    scenarioSelectedLabNames = new Set(availableLabNames);
    scenarioLastAvailableLabNames = new Set(availableLabNames);
    syncScenarioSelectionToModel();
    return;
  }
  scenarioSelectedLabNames = new Set(filteredSelected);
  scenarioLastAvailableLabNames = new Set(availableLabNames);
  syncScenarioSelectionToModel();
}

function updateScenarioLabPickerSummary(availableLabNames = getScenarioAvailableLabNames()) {
  const summaryEl = document.getElementById('s-lab-picker-summary');
  if (!summaryEl) return;
  const selectedCount = scenarioSelectedLabNames.size;
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

function renderScenarioLabPickerOptions() {
  const menu = document.getElementById('s-lab-picker-menu');
  if (!menu) return;
  const availableLabNames = getScenarioAvailableLabNames();
  syncScenarioLabPickerSelection(availableLabNames);
  updateScenarioLabPickerSummary(availableLabNames);

  if (!availableLabNames.length) {
    scenarioLabPickerSearchTerm = '';
    menu.innerHTML = '<div class="lab-picker-empty">No labs available for this view.</div>';
    return;
  }

  const optionsHtml = availableLabNames
    .map(name => `<label class="lab-picker-option" data-s-lab-key="${escapeHtml(normalizeLabForMatch(name))}"><input type="checkbox" value="${escapeHtml(name)}" onchange="toggleScenarioLabSelection(this.value, this.checked)" ${scenarioSelectedLabNames.has(name) ? 'checked' : ''}><span>${escapeHtml(name)}</span></label>`)
    .join('');

  menu.innerHTML = `
    <div class="lab-picker-actions">
      <button type="button" class="lab-picker-action" onclick="selectAllScenarioLabs(event)">Select all</button>
      <button type="button" class="lab-picker-action" onclick="deselectAllScenarioLabs(event)">Deselect all</button>
    </div>
    <div class="lab-picker-search-wrap">
      <input type="text" class="lab-picker-search" id="s-lab-picker-search" placeholder="Search labs..." value="${escapeHtml(scenarioLabPickerSearchTerm)}" oninput="onScenarioLabPickerSearchInput(this.value)">
    </div>
    <div class="lab-picker-list" id="s-lab-picker-list">${optionsHtml}</div>
    <div class="lab-picker-empty" id="s-lab-picker-no-results" hidden>No labs match your search.</div>
  `;
  applyScenarioLabPickerSearch();
}

function getScenarioSelectedRows() {
  if (!scenarioSelectedLabNames.size) return [];
  const selectedSet = new Set(scenarioSelectedLabNames);
  return scenarioLabRows.filter(r => selectedSet.has(r.lab));
}

function toggleScenarioLabSelection(labName, isSelected) {
  if (isSelected) scenarioSelectedLabNames.add(labName);
  else scenarioSelectedLabNames.delete(labName);
  syncScenarioSelectionToModel();
  updateScenarioLabPickerSummary();
  recalc();
}

function selectAllScenarioLabs(e) {
  if (e) e.stopPropagation();
  scenarioSelectedLabNames = new Set(getScenarioAvailableLabNames());
  scenarioLabPickerSearchTerm = '';
  syncScenarioSelectionToModel();
  renderScenarioLabPickerOptions();
  recalc();
}

function deselectAllScenarioLabs(e) {
  if (e) e.stopPropagation();
  scenarioSelectedLabNames.clear();
  scenarioLabPickerSearchTerm = '';
  syncScenarioSelectionToModel();
  renderScenarioLabPickerOptions();
  recalc();
}

function onScenarioLabPickerSearchInput(value) {
  scenarioLabPickerSearchTerm = normalizeLabForMatch(value || '');
  applyScenarioLabPickerSearch();
}

function applyScenarioLabPickerSearch() {
  const list = document.getElementById('s-lab-picker-list');
  if (!list) return;
  const noResultsEl = document.getElementById('s-lab-picker-no-results');
  const options = list.querySelectorAll('.lab-picker-option');
  let shownCount = 0;
  options.forEach(option => {
    const key = option.getAttribute('data-s-lab-key') || '';
    const isMatch = !scenarioLabPickerSearchTerm || key.includes(scenarioLabPickerSearchTerm);
    option.style.display = isMatch ? '' : 'none';
    if (isMatch) shownCount += 1;
  });
  if (noResultsEl) noResultsEl.style.display = shownCount === 0 ? 'block' : 'none';
}

function toggleScenarioLabPickerMenu(e) {
  if (e) e.stopPropagation();
  const picker = document.getElementById('s-lab-picker');
  const menu = document.getElementById('s-lab-picker-menu');
  if (!picker || !menu) return;
  const isHidden = menu.hasAttribute('hidden');
  if (isHidden) {
    menu.removeAttribute('hidden');
    picker.classList.add('open');
    const searchInput = document.getElementById('s-lab-picker-search');
    if (searchInput) searchInput.focus();
  } else {
    menu.setAttribute('hidden', '');
    picker.classList.remove('open');
  }
}

function closeScenarioLabPickerMenu() {
  const picker = document.getElementById('s-lab-picker');
  const menu = document.getElementById('s-lab-picker-menu');
  if (!picker || !menu) return;
  menu.setAttribute('hidden', '');
  picker.classList.remove('open');
}

function handleDocumentClickForLabPicker(e) {
  const picker = document.getElementById('lab-picker');
  if (picker && !picker.contains(e.target)) closeLabPickerMenu();
  const scenarioPicker = document.getElementById('s-lab-picker');
  if (scenarioPicker && !scenarioPicker.contains(e.target)) closeScenarioLabPickerMenu();
}

function resolveLabName(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const candidates = [];

  // Schedule-style labels often start with site code (e.g., "05 - Houston").
  const codePrefix = s.match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/);
  if (codePrefix) {
    const code = codePrefix[1].trim();
    if (SCHEDULE_LAB_MAP[code]) candidates.push(SCHEDULE_LAB_MAP[code]);
    const rightPart = codePrefix[2].trim();
    if (/[a-z]/i.test(rightPart)) candidates.push(rightPart);
  }

  // Std-hours files often end with numeric/code suffix (e.g., "Boston - 11").
  // Split on the last hyphen so "Rental/Used-Houston - 48" keeps the full left phrase.
  const trailingCode = s.match(/^(.+)\s*-\s*([A-Za-z0-9]+)\s*$/);
  if (trailingCode) {
    const leftPart = trailingCode[1].trim();
    const rightCode = trailingCode[2].trim();
    if (/[a-z]/i.test(leftPart)) candidates.push(leftPart);
    if (SCHEDULE_LAB_MAP[rightCode]) candidates.push(SCHEDULE_LAB_MAP[rightCode]);
  } else {
    const genericSplit = s.match(/^(.+?)\s*-\s*(.+)$/);
    if (genericSplit) {
      const left = genericSplit[1].trim();
      const right = genericSplit[2].trim();
      if (SCHEDULE_LAB_MAP[left]) candidates.push(SCHEDULE_LAB_MAP[left]);
      if (SCHEDULE_LAB_MAP[right]) candidates.push(SCHEDULE_LAB_MAP[right]);
      if (/[a-z]/i.test(left)) candidates.push(left);
      if (/[a-z]/i.test(right)) candidates.push(right);
    }
  }

  candidates.push(s);

  const seen = new Set();
  for (const kw of candidates) {
    const key = normalizeLabForMatch(kw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const found = findLabByKeyword(kw);
    if (found) return found.lab;
  }
  return null;
}

function resolveStdHoursLabName(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const trailingCode = s.match(/-\s*([A-Za-z0-9]+)\s*$/);
  if (trailingCode) {
    const code = String(trailingCode[1]).toUpperCase();
    if (STD_HOURS_CODE_TO_LAB[code]) return STD_HOURS_CODE_TO_LAB[code];
    // If a code is present but not mapped, skip instead of fuzzy guessing.
    return null;
  }

  // Backward compatibility for non-coded formats.
  return resolveLabName(s);
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

function escapeHtml(v) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMonthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function getMonthStartFromKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(v => parseInt(v, 10));
  if (!Number.isInteger(y) || !Number.isInteger(m)) return null;
  return new Date(y, m - 1, 1);
}

function getMonthBoundsFromKey(monthKey) {
  const start = getMonthStartFromKey(monthKey);
  if (!start) return null;
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return {start, end};
}

function fmtDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  const [y, m, d] = iso.split('-').map(v => parseInt(v, 10));
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function labKeysMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
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

function getDateRangeForView(anchorDate, view = currentView) {
  const base = new Date(anchorDate);
  base.setHours(0, 0, 0, 0);
  if (view === 'monthly') {
    const bounds = getMonthBoundsFromKey(getMonthKey(base));
    if (bounds) return {start: bounds.start, end: bounds.end};
  } else if (view === 'quarterly') {
    const quarterKeys = getFiscalQuarterMonthKeys(base);
    const startBounds = getMonthBoundsFromKey(quarterKeys[0]);
    const endBounds = getMonthBoundsFromKey(quarterKeys[quarterKeys.length - 1]);
    if (startBounds && endBounds) return {start: startBounds.start, end: endBounds.end};
  } else if (view === 'yearly') {
    const yearKeys = getFiscalYearMonthKeys(base);
    const startBounds = getMonthBoundsFromKey(yearKeys[0]);
    const endBounds = getMonthBoundsFromKey(yearKeys[yearKeys.length - 1]);
    if (startBounds && endBounds) return {start: startBounds.start, end: endBounds.end};
  }
  return {start: base, end: addDays(base, 4)};
}

function getOnsitePeriodLabel(view = currentView) {
  if (view === 'monthly') return 'this month';
  if (view === 'quarterly') return 'this quarter';
  if (view === 'yearly') return 'this fiscal year';
  return 'this week';
}

function getStdHoursFromRangeOverrides(lab, periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return null;
  const targetKey = normalizeLabForMatch(lab.lab);
  let winner = null;

  stdHoursRangeOverrides.forEach(row => {
    const from = parseISODate(row.effectiveFrom);
    if (!from || from > periodEnd) return;
    const to = row.effectiveTo ? parseISODate(row.effectiveTo) : null;
    if (to && to < periodStart) return;
    if (!labKeysMatch(targetKey, row.labKey)) return;

    const updatedAt = Date.parse(row.updatedAt || row.createdAt || '') || 0;
    const score = {
      exact: row.labKey === targetKey ? 1 : 0,
      updatedAt,
      id: Number(row.id || 0)
    };
    if (!winner
      || score.exact > winner.score.exact
      || (score.exact === winner.score.exact && score.updatedAt > winner.score.updatedAt)
      || (score.exact === winner.score.exact && score.updatedAt === winner.score.updatedAt && score.id > winner.score.id)) {
      winner = {row, score};
    }
  });

  if (!winner) return null;
  return Number.isFinite(winner.row.stdHours) ? winner.row.stdHours : null;
}

function getStdHoursForLabWeek(lab, weekStart, weekEnd) {
  if (Object.prototype.hasOwnProperty.call(stdHoursOverrides, lab.lab)) {
    return stdHoursOverrides[lab.lab];
  }
  const overrideValue = getStdHoursFromRangeOverrides(lab, weekStart, weekEnd);
  if (overrideValue != null) return overrideValue;
  return getStdHoursForLabMonth(lab, getMonthKey(weekStart));
}

function getStdHoursForLabMonth(lab, monthKey) {
  const bounds = getMonthBoundsFromKey(monthKey);
  const overrideValue = bounds ? getStdHoursFromRangeOverrides(lab, bounds.start, bounds.end) : null;
  if (overrideValue != null) return overrideValue;
  const monthMap = stdHoursByMonth[monthKey];
  if (monthMap && Number.isFinite(monthMap[lab.lab])) return monthMap[lab.lab];
  return lab.stdHrs;
}

function getStdHoursForLab(lab, monthKey = getMonthKey(currentWeekStart)) {
  if (Object.prototype.hasOwnProperty.call(stdHoursOverrides, lab.lab)) {
    return stdHoursOverrides[lab.lab];
  }
  return getStdHoursForLabMonth(lab, monthKey);
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

async function buildStdUploadPreview(file) {
  const rows = await parseRowsFromFile(file);
  let usableRows = 0;
  let matchedRows = 0;
  let unmatchedRows = 0;
  const matchedLabs = new Set();
  const matchedMappingsBySource = new Map();
  const unmatchedLabs = new Set();

  for (const row of rows) {
    const labRaw = getRowValueByHeaders(row, STD_HOURS_LAB_HEADERS);
    const stdRaw = getRowValueByHeaders(row, STD_HOURS_VALUE_HEADERS);
    const stdHours = parseHoursValue(stdRaw);
    if (!labRaw || stdHours == null) continue;
    usableRows++;

    const labName = resolveStdHoursLabName(labRaw);
    const srcLabel = String(labRaw).trim();
    if (labName) {
      matchedRows++;
      matchedLabs.add(labName);
      matchedMappingsBySource.set(srcLabel, labName);
    } else {
      unmatchedRows++;
      unmatchedLabs.add(srcLabel);
    }
  }

  return {
    parsedRows: rows.length,
    usableRows,
    matchedRows,
    unmatchedRows,
    matchedLabs: [...matchedLabs].sort((a, b) => a.localeCompare(b)),
    matchedMappings: [...matchedMappingsBySource.entries()]
      .sort((a, b) => a[0].localeCompare(b[0])),
    unmatchedLabs: [...unmatchedLabs].sort((a, b) => a.localeCompare(b))
  };
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

function rowsFromStdApi(overrides) {
  return (overrides || []).map(row => ({
    id: row.id,
    labRaw: row.lab,
    labKey: normalizeLabForMatch(resolveStdHoursLabName(row.lab) || ''),
    stdHours: Number(row.stdHours),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  })).filter(row => row.labKey && Number.isFinite(row.stdHours) && row.effectiveFrom);
}

async function fetchPersistedStdHours() {
  let res;
  try {
    res = await fetch('/api/std-hours', {headers: {Accept: 'application/json'}});
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Std-hours fetch failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.overrides)) return [];
  return rowsFromStdApi(payload.overrides);
}

async function loadPersistedStdHours({silent = false} = {}) {
  const rows = await fetchPersistedStdHours();
  if (rows == null) return false;
  stdHoursRangeOverrides = rows;
  stdHoursPersistenceEnabled = true;
  if (!silent) {
    const stEl = document.getElementById('st-std');
    stEl.innerHTML = `<div class="file-status ok">✓ ${rows.length} persisted std-hours entries loaded</div>`;
  }
  recalc();
  return true;
}

async function trySyncStdHoursToApi(file, effectiveFrom, effectiveTo) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('effectiveFrom', effectiveFrom);
  if (effectiveTo) fd.append('effectiveTo', effectiveTo);

  let res;
  try {
    res = await fetch('/api/std-hours/sync', {method: 'POST', body: fd});
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Std-hours sync failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  return res.json();
}

function rowsFromScenarioApi(scenarios) {
  return (scenarios || []).map(row => ({
    id: Number(row.id),
    name: String(row.name || '').trim(),
    config: normalizeScenarioConfig(row.config || {}),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  })).filter(row => Number.isInteger(row.id) && row.id > 0 && row.name);
}

async function fetchPersistedScenarios() {
  let res;
  try {
    res = await fetch('/api/scenarios', {headers: {Accept: 'application/json'}});
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Scenario fetch failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  const payload = await res.json();
  if (!payload || !Array.isArray(payload.scenarios)) return [];
  return rowsFromScenarioApi(payload.scenarios);
}

async function saveScenarioToApi(profile) {
  let res;
  try {
    res = await fetch('/api/scenarios', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify(profile)
    });
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Scenario save failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  const payload = await res.json();
  if (!payload || !payload.scenario) return null;
  const saved = rowsFromScenarioApi([payload.scenario])[0];
  return saved || null;
}

async function deleteScenarioFromApi(id) {
  let res;
  try {
    res = await fetch(`/api/scenarios/${id}`, {method: 'DELETE', headers: {Accept: 'application/json'}});
  } catch (_err) {
    return null;
  }
  if (res.status === 404 || res.status === 503) return null;
  if (!res.ok) {
    let msg = `Scenario delete failed (${res.status})`;
    try {
      const payload = await res.json();
      if (payload && payload.error) msg = payload.error;
    } catch (_err) {}
    throw new Error(msg);
  }
  return true;
}

function renderScenarioProfileOptions() {
  const selectEl = document.getElementById('s-profile');
  if (!selectEl) {
    updateScenarioSnapshot();
    return;
  }
  const currentId = scenarioModel.id != null ? String(scenarioModel.id) : '';
  const options = ['<option value="">Saved scenarios</option>']
    .concat(
      scenarioProfiles
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    );
  selectEl.innerHTML = options.join('');
  selectEl.value = currentId;
  updateScenarioSnapshot();
}

async function loadPersistedScenarios({silent = false} = {}) {
  const rows = await fetchPersistedScenarios();
  if (rows == null) return false;
  scenarioProfiles = rows;
  scenarioPersistenceEnabled = true;
  renderScenarioProfileOptions();
  if (!silent) {
    const noteEl = document.getElementById('scenario-note');
    if (noteEl) noteEl.textContent = `Loaded ${rows.length} saved scenarios from database.`;
  }
  return true;
}

function onScenarioProfileSelect() {
  const selectEl = document.getElementById('s-profile');
  if (!selectEl) return;
  const selectedId = Number.parseInt(selectEl.value, 10);
  if (!Number.isInteger(selectedId)) {
    scenarioModel.id = null;
    syncScenarioSelectionToModel();
    updateScenarioControls();
    return;
  }
  const profile = scenarioProfiles.find(p => p.id === selectedId);
  if (!profile) return;
  scenarioModel = {
    ...defaultScenarioModel(),
    ...normalizeScenarioConfig(profile.config || {}),
    id: profile.id,
    name: profile.name,
    enabled: true
  };
  if (Array.isArray(profile.config && profile.config.selectedLabs)) {
    const availableLabs = new Set(getScenarioAvailableLabNames());
    const selectedLabs = (scenarioModel.selectedLabs || []).filter(name => availableLabs.has(name));
    scenarioSelectedLabNames = new Set(selectedLabs);
    scenarioLabPickerInitialized = true;
    scenarioLastAvailableLabNames = new Set(availableLabs);
    syncScenarioSelectionToModel();
  }
  if (VIEW_META[scenarioModel.view]) currentView = scenarioModel.view;
  const statusFilterEl = document.getElementById('s-f-status');
  if (statusFilterEl) statusFilterEl.value = scenarioModel.statusFilter || 'all';
  updateScenarioControls();
  recalc();
}

async function saveScenarioProfile() {
  setScenarioModelFromControls({recalcNow: false});
  const name = scenarioModel.name || getScenarioProfileNameFallback();
  const payload = {
    id: scenarioModel.id,
    name,
    config: normalizeScenarioConfig(scenarioModel)
  };

  const saved = await saveScenarioToApi(payload);
  if (saved) {
    scenarioPersistenceEnabled = true;
    const idx = scenarioProfiles.findIndex(p => p.id === saved.id);
    if (idx >= 0) scenarioProfiles[idx] = saved;
    else scenarioProfiles.push(saved);
    scenarioModel.id = saved.id;
    scenarioModel.name = saved.name;
  } else {
    const fallbackId = scenarioModel.id != null ? scenarioModel.id : -(Date.now());
    const fallback = {
      id: fallbackId,
      name,
      config: normalizeScenarioConfig(scenarioModel),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const idx = scenarioProfiles.findIndex(p => p.id === fallbackId);
    if (idx >= 0) scenarioProfiles[idx] = fallback;
    else scenarioProfiles.push(fallback);
    scenarioModel.id = fallbackId;
    scenarioModel.name = name;
    scenarioPersistenceEnabled = false;
  }

  renderScenarioProfileOptions();
  updateScenarioControls();
  recalc();
}

async function deleteScenarioProfile() {
  const selectEl = document.getElementById('s-profile');
  const selectedId = scenarioModel.id != null ? scenarioModel.id : Number.parseInt(selectEl ? selectEl.value : '', 10);
  if (!Number.isInteger(selectedId)) return;

  const removedFromApi = selectedId > 0 ? await deleteScenarioFromApi(selectedId) : false;
  if (removedFromApi) scenarioPersistenceEnabled = true;
  scenarioProfiles = scenarioProfiles.filter(p => p.id !== selectedId);
  scenarioModel = {...defaultScenarioModel(), enabled: false};
  renderScenarioProfileOptions();
  updateScenarioControls();
  recalc();
}

function setStdUploadModalOpen(open) {
  const modal = document.getElementById('std-upload-modal');
  if (!modal) return;
  modal.classList.toggle('show', open);
}

function closeStdUploadModal(result = null) {
  if (stdUploadModalResolver) stdUploadModalResolver(result);
  stdUploadModalResolver = null;
  setStdUploadModalOpen(false);
  renderStdUploadPreview(null);
}

function renderStdUploadPreview(preview) {
  const summaryEl = document.getElementById('std-preview-summary');
  const matchedEl = document.getElementById('std-preview-matched');
  const unmatchedEl = document.getElementById('std-preview-unmatched');
  const matchedListEl = document.getElementById('std-preview-matched-list');
  const listEl = document.getElementById('std-preview-unmatched-list');
  const applyBtn = document.getElementById('std-upload-apply');
  if (!summaryEl || !matchedEl || !unmatchedEl || !matchedListEl || !listEl || !applyBtn) return;

  if (!preview) {
    summaryEl.textContent = '';
    matchedEl.textContent = '';
    unmatchedEl.textContent = '';
    matchedListEl.innerHTML = '';
    listEl.innerHTML = '';
    applyBtn.disabled = false;
    return;
  }

  summaryEl.textContent = `${preview.usableRows} usable rows found in this file (${preview.parsedRows} total rows).`;
  matchedEl.textContent = `${preview.matchedRows} rows matched (${preview.matchedLabs.length} labs in this tool).`;
  matchedListEl.innerHTML = preview.matchedMappings
    .map(([source, target]) => `<li><span class="match-src">${escapeHtml(source)}</span><span class="match-arrow"> → </span><span class="match-dst">${escapeHtml(target)}</span></li>`)
    .join('');
  if (preview.unmatchedRows) {
    unmatchedEl.textContent = `${preview.unmatchedRows} rows did not match current tool labs.`;
    listEl.innerHTML = preview.unmatchedLabs.map(name => `<li>${escapeHtml(name)}</li>`).join('');
  } else {
    unmatchedEl.textContent = 'All usable rows matched current tool labs.';
    listEl.innerHTML = '';
  }

  applyBtn.disabled = preview.usableRows === 0;
}

function openStdUploadDateModal(fileName, preview) {
  return new Promise(resolve => {
    const fromInput = document.getElementById('std-effective-from');
    const toInput = document.getElementById('std-effective-to');
    const fileEl = document.getElementById('std-upload-file-name');
    if (fileEl) fileEl.textContent = fileName || 'Selected file';
    renderStdUploadPreview(preview);
    if (fromInput) fromInput.value = fmtDateInputValue(currentWeekStart);
    if (toInput) toInput.value = '';

    stdUploadModalResolver = resolve;
    setStdUploadModalOpen(true);
    if (fromInput) fromInput.focus();
  });
}

function initStdUploadModal() {
  const cancelBtn = document.getElementById('std-upload-cancel');
  const applyBtn = document.getElementById('std-upload-apply');
  const modal = document.getElementById('std-upload-modal');

  if (!cancelBtn || !applyBtn || !modal) return;

  cancelBtn.addEventListener('click', () => closeStdUploadModal(null));
  modal.addEventListener('click', e => {
    if (e.target === modal) closeStdUploadModal(null);
  });

  applyBtn.addEventListener('click', () => {
    const fromInput = document.getElementById('std-effective-from');
    const toInput = document.getElementById('std-effective-to');
    const from = fromInput ? String(fromInput.value || '').trim() : '';
    const to = toInput ? String(toInput.value || '').trim() : '';
    const fromDate = parseISODate(from);
    const toDate = to ? parseISODate(to) : null;
    if (!fromDate) {
      alert('Please select a valid Effective from date.');
      return;
    }
    if (to && !toDate) {
      alert('Please select a valid Effective to date, or leave it blank.');
      return;
    }
    if (toDate && fromDate > toDate) {
      alert('Effective to date must be on or after Effective from.');
      return;
    }
    closeStdUploadModal({effectiveFrom: from, effectiveTo: to || null});
  });
}

function getTechDaysLostInRange(rangeStart, rangeEnd, allowedLabs = null) {
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
    if (allowedLabs && !allowedLabs.has(labName)) continue;
    const days = workdaysInRange(start, end, rangeStart, rangeEnd);
    if (days > 0) lost[labName] = (lost[labName]||0) + numTechs * days;
  }
  return lost;
}

function getTechDaysLost(weekStart, allowedLabs = null) {
  const weekEnd = addDays(weekStart, 4);
  return getTechDaysLostInRange(weekStart, weekEnd, allowedLabs);
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

function getBaselineMetricsForRow(row) {
  const demand = getDemandForView(row);
  const cap = getCapForView(row);
  const gap = getGapForView(row);
  const util = getUtilForView(row);
  return {
    demand,
    cap,
    gap,
    util,
    status: getStatusFromUtil(util),
    baseTech: row.baseTech,
    lostFTE: row.lostFTE,
    avail: row.avail
  };
}

function getDisplayMetricsForRow(row, {useScenario = false} = {}) {
  const baseline = getBaselineMetricsForRow(row);
  if (!useScenario || !scenarioModel.enabled) return {...baseline, baseline: null, inScope: false};
  const scenarioRow = scenarioRowsByLab.get(row.lab);
  if (!scenarioRow) return {...baseline, baseline: null, inScope: false};
  return {...scenarioRow, baseline};
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
  const scenarioDemandEl = document.getElementById('s-hdr-demand');
  const scenarioCapEl = document.getElementById('s-hdr-cap');
  const scenarioGapEl = document.getElementById('s-hdr-gap');
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
  if (scenarioDemandEl) {
    scenarioDemandEl.textContent = meta.demandHeader;
    scenarioDemandEl.setAttribute('data-help', meta.demandHelp);
  }
  if (scenarioCapEl) {
    scenarioCapEl.textContent = meta.capHeader;
    scenarioCapEl.setAttribute('data-help', meta.capHelp);
  }
  if (scenarioGapEl) {
    scenarioGapEl.textContent = meta.gapHeader;
    scenarioGapEl.setAttribute('data-help', meta.gapHelp);
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
  });
}

function computeScenarioRows(context) {
  scenarioRowsByLab = new Map();
  scenarioAggregate = null;
  if (!scenarioModel.enabled) return;

  const onsiteMult = 1 + (scenarioModel.onsitePct / 100);
  const prodMult = 1 + (scenarioModel.productivityPct / 100);
  const demandMult = 1 + (scenarioModel.demandPct / 100);
  const hcDelta = scenarioModel.headcountDelta;
  const effectiveHrsPerDay = context.hrsPerDay * prodMult;
  const monthCapPerFte = effectiveHrsPerDay * context.daysPerWeek * context.weeksPerMo;

  let scenarioOnsiteTechDays = 0;
  Object.entries(context.techDaysLostForView).forEach(([labName, techDays]) => {
    const row = context.rowByLab.get(labName);
    const inScope = row ? isScenarioScopeMatch(row) : false;
    scenarioOnsiteTechDays += inScope ? (techDays * onsiteMult) : techDays;
  });

  scenarioLabRows.forEach(row => {
    const inScope = isScenarioScopeMatch(row);
    const baseline = getBaselineMetricsForRow(row);

    if (!inScope) {
      scenarioRowsByLab.set(row.lab, {...baseline, inScope: false});
      return;
    }

    const scenarioBaseTech = Math.max(0, row.baseTech + hcDelta);
    const scenarioLostFTE = Math.max(0, row.lostFTE * onsiteMult);
    const scenarioAvail = Math.max(0, scenarioBaseTech - scenarioLostFTE);
    const scenarioDemand = Math.max(0, baseline.demand * demandMult);

    const scenarioWCap = scenarioAvail * effectiveHrsPerDay * context.daysPerWeek;
    const scenarioMCap = Math.max(0, row.hcMonth + hcDelta) * monthCapPerFte;
    const scenarioQCap = Math.max(0, row.hcQuarterSum + (hcDelta * context.quarterMonthCount)) * monthCapPerFte;
    const scenarioYCap = Math.max(0, row.hcYearSum + (hcDelta * context.yearMonthCount)) * monthCapPerFte;
    const scenarioCap = currentView === 'monthly'
      ? scenarioMCap
      : currentView === 'quarterly'
        ? scenarioQCap
        : currentView === 'yearly'
          ? scenarioYCap
          : scenarioWCap;

    const scenarioGap = scenarioCap - scenarioDemand;
    const scenarioUtil = scenarioDemand > 0 && scenarioCap > 0 ? (scenarioDemand / scenarioCap) : null;

    scenarioRowsByLab.set(row.lab, {
      demand: scenarioDemand,
      cap: scenarioCap,
      gap: scenarioGap,
      util: scenarioUtil,
      status: getStatusFromUtil(scenarioUtil),
      baseTech: scenarioBaseTech,
      lostFTE: scenarioLostFTE,
      avail: scenarioAvail,
      inScope: true
    });
  });

  scenarioAggregate = {
    baselineOnsiteFTE: context.baselineOnsiteFTE,
    scenarioOnsiteFTE: scenarioOnsiteTechDays / context.daysPerWeek
  };
}

function updateScenarioImpact(selectedRows) {
  const impactEl = document.getElementById('scenario-impact');
  if (!impactEl) return;
  if (!scenarioModel.enabled || !selectedRows.length) {
    impactEl.hidden = true;
    return;
  }

  const baselineCounts = {over: 0, risk: 0, ok: 0};
  const scenarioCounts = {over: 0, risk: 0, ok: 0};
  selectedRows.forEach(row => {
    const baseline = getBaselineMetricsForRow(row);
    const display = getDisplayMetricsForRow(row, {useScenario: true});
    baselineCounts[baseline.status] += 1;
    scenarioCounts[display.status] += 1;
  });

  const baseOnsite = scenarioAggregate ? scenarioAggregate.baselineOnsiteFTE : 0;
  const scenOnsite = scenarioAggregate ? scenarioAggregate.scenarioOnsiteFTE : baseOnsite;
  const dOver = scenarioCounts.over - baselineCounts.over;
  const dRisk = scenarioCounts.risk - baselineCounts.risk;
  const dOk = scenarioCounts.ok - baselineCounts.ok;
  const dOnsite = scenOnsite - baseOnsite;
  const fmtDelta = v => `${v > 0 ? '+' : ''}${v}`;
  const fmtDeltaFte = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

  impactEl.textContent =
    `Scenario impact · Over ${baselineCounts.over} → ${scenarioCounts.over} (${fmtDelta(dOver)}) · ` +
    `At risk ${baselineCounts.risk} → ${scenarioCounts.risk} (${fmtDelta(dRisk)}) · ` +
    `Healthy ${baselineCounts.ok} → ${scenarioCounts.ok} (${fmtDelta(dOk)}) · ` +
    `Onsite FTE ${baseOnsite.toFixed(1)} → ${scenOnsite.toFixed(1)} (${fmtDeltaFte(dOnsite)})`;
  impactEl.hidden = false;
}

function updateStatusSummary() {
  const selectedRows = getSelectedRows();
  const over = selectedRows.filter(r => getBaselineMetricsForRow(r).status === 'over').length;
  const risk = selectedRows.filter(r => getBaselineMetricsForRow(r).status === 'risk').length;
  const ok = selectedRows.filter(r => getBaselineMetricsForRow(r).status === 'ok').length;
  document.getElementById('m-total').textContent = selectedRows.length;
  document.getElementById('m-over').textContent = over;
  document.getElementById('m-risk').textContent = risk;
  document.getElementById('m-ok').textContent = ok;
}

function setPageTab(tab) {
  const nextTab = PAGE_TABS.has(tab) ? tab : 'overview';
  currentPageTab = nextTab;

  document.querySelectorAll('.page-tab-btn').forEach(btn => {
    const isActive = btn.dataset.pageTab === nextTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  document.querySelectorAll('.page-tab-pane').forEach(pane => {
    const isActive = pane.dataset.pageTab === nextTab;
    pane.classList.toggle('active', isActive);
    if (isActive) pane.removeAttribute('hidden');
    else pane.setAttribute('hidden', '');
  });

  if (nextTab !== 'overview') closeLabPickerMenu();
  if (nextTab !== 'scenario') closeScenarioLabPickerMenu();
  if (nextTab === 'scenario' && !scenarioModel.enabled) {
    scenarioModel.enabled = true;
    updateScenarioControls();
    recalc();
  }
}

function setView(view) {
  if (!VIEW_META[view]) return;
  currentView = view;
  recalc();
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
  renderScenarioTable();
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
  renderScenarioTable();
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
  stEl.innerHTML = '<div class="file-status" style="color:#888">Analyzing file...</div>';
  try {
    const preview = await buildStdUploadPreview(file);
    if (!preview.usableRows) {
      stEl.innerHTML = '<div class="file-status err">⚠ No usable rows found. Expected columns like Lab + Current Std Hours.</div>';
      return;
    }

    const dateSelection = await openStdUploadDateModal(file.name, preview);
    if (!dateSelection) {
      stEl.innerHTML = '<div class="file-status" style="color:#888">Upload canceled</div>';
      return;
    }

    stEl.innerHTML = '<div class="file-status" style="color:#888">Saving...</div>';
    const syncPayload = await trySyncStdHoursToApi(file, dateSelection.effectiveFrom, dateSelection.effectiveTo);
    if (syncPayload) {
      await loadPersistedStdHours({silent: true});
      const summary = syncPayload.summary || {};
      const inserted = summary.inserted ?? 0;
      const updated = summary.updated ?? 0;
      const unchanged = summary.unchanged ?? 0;
      const dateText = dateSelection.effectiveTo
        ? `${dateSelection.effectiveFrom} to ${dateSelection.effectiveTo}`
        : `${dateSelection.effectiveFrom} onward`;
      stEl.innerHTML =
        `<div class="file-status ok">✓ ${file.name} &nbsp;·&nbsp; ${inserted} new · ${updated} updated · ${unchanged} unchanged &nbsp;·&nbsp; ${preview.matchedLabs.length} matched labs${preview.unmatchedLabs.length ? ` · ${preview.unmatchedLabs.length} unmatched labels` : ''} &nbsp;·&nbsp; ${dateText}</div>`;
      document.getElementById('footer-updated').textContent =
        `Std hours synced to database: ${file.name} · ${new Date().toLocaleTimeString()}`;
      recalc();
      return;
    }

    stEl.innerHTML = '<div class="file-status" style="color:#888">Parsing (session only)...</div>';
    const rows = await parseRowsFromFile(file);
    const nextOverrides = {};
    let validRows = 0;
    let matchedRows = 0;
    let unmatchedRows = 0;

    for (const row of rows) {
      const labRaw = getRowValueByHeaders(row, STD_HOURS_LAB_HEADERS);
      const stdRaw = getRowValueByHeaders(row, STD_HOURS_VALUE_HEADERS);
      const stdHours = parseHoursValue(stdRaw);
      if (!labRaw || stdHours == null) continue;
      validRows++;

      const labName = resolveStdHoursLabName(labRaw);
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
    stdHoursPersistenceEnabled = false;
    recalc();
  } catch (err) {
    stEl.innerHTML = `<div class="file-status err">⚠ Parse error: ${err.message}</div>`;
  } finally {
    const input = document.getElementById('f-std');
    if (input) input.value = '';
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

  const monthKey = getMonthKey(currentWeekStart);
  const quarterKeys = getFiscalQuarterMonthKeys(currentWeekStart);
  const yearKeys = getFiscalYearMonthKeys(currentWeekStart);
  const hasStdHistoryData = Object.keys(stdHoursByMonth).length > 0;
  const hasHeadcountData = Object.keys(headcountByMonth).length > 0;

  const scenarioActiveLabs = BASE_LABS
    .filter(l => getStdHoursForLabWeek(l, currentWeekStart, weekEnd) != null);
  const dashboardActiveLabs = scenarioActiveLabs
    .filter(l => labMatchesPlatformFilter(l.lab));

  const dashboardActiveLabNames = new Set(dashboardActiveLabs.map(l => l.lab));
  const scenarioActiveLabNames = new Set(scenarioActiveLabs.map(l => l.lab));
  const dashboardActiveLabList = [...dashboardActiveLabNames].sort((a, b) => a.localeCompare(b));
  const scenarioActiveLabList = [...scenarioActiveLabNames].sort((a, b) => a.localeCompare(b));
  syncLabPickerSelection(dashboardActiveLabList);
  syncScenarioLabPickerSelection(scenarioActiveLabList);

  const techDaysLostDashboard = getTechDaysLost(currentWeekStart, dashboardActiveLabNames);
  const techDaysLostScenario = getTechDaysLost(currentWeekStart, scenarioActiveLabNames);
  const onsiteRange = getDateRangeForView(currentWeekStart, currentView);
  const techDaysLostForViewDashboard = getTechDaysLostInRange(onsiteRange.start, onsiteRange.end, dashboardActiveLabNames);
  const techDaysLostForViewScenario = getTechDaysLostInRange(onsiteRange.start, onsiteRange.end, scenarioActiveLabNames);
  const onsiteTechDaysForViewDashboard = Object.values(techDaysLostForViewDashboard).reduce((s, v) => s + v, 0);
  const onsiteTechDaysForViewScenario = Object.values(techDaysLostForViewScenario).reduce((s, v) => s + v, 0);
  const totalOnsiteFTE = onsiteTechDaysForViewDashboard / daysPerWeek;

  const mapLabsToRows = (labs, techDaysLostMap) => labs.map(l => {
    const stdHours = getStdHoursForLabWeek(l, currentWeekStart, weekEnd);
    const baseTech = getHeadcountForLabMonth(l, monthKey);
    const hcMonth = getHeadcountForLabMonth(l, monthKey);
    const hcQuarterSum = quarterKeys.reduce((s, k) => s + getHeadcountForLabMonth(l, k), 0);
    const hcYearSum = yearKeys.reduce((s, k) => s + getHeadcountForLabMonth(l, k), 0);
    const lost    = techDaysLostMap[l.lab] || 0;
    const lostFTE = lost / daysPerWeek;
    const avail   = Math.max(0, baseTech - lostFTE);
    const wDemand = stdHours;
    const mDemand = wDemand * weeksPerMo;
    const qDemand = quarterKeys.reduce((s, k) => {
      const wkStd = getStdHoursForLab(l, k);
      return s + (wkStd != null ? wkStd * weeksPerMo : 0);
    }, 0);
    const yDemand = yearKeys.reduce((s, k) => {
      const wkStd = getStdHoursForLab(l, k);
      return s + (wkStd != null ? wkStd * weeksPerMo : 0);
    }, 0);

    const wCap    = avail * hrsPerDay * daysPerWeek;
    const monthCapPerFte = hrsPerDay * daysPerWeek * weeksPerMo;
    const mCap    = hcMonth * monthCapPerFte;
    const qCap    = hcQuarterSum * monthCapPerFte;
    const yCap    = hcYearSum * monthCapPerFte;

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
      platform: getLabPlatform(l.lab),
      baseTech,
      hcMonth,
      hcQuarterSum,
      hcYearSum,
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

  labRows = mapLabsToRows(dashboardActiveLabs, techDaysLostDashboard);
  scenarioLabRows = mapLabsToRows(scenarioActiveLabs, techDaysLostScenario);

  const rowByLab = new Map(scenarioLabRows.map(r => [r.lab, r]));
  computeScenarioRows({
    hrsPerDay,
    daysPerWeek,
    weeksPerMo,
    quarterMonthCount: quarterKeys.length,
    yearMonthCount: yearKeys.length,
    baselineOnsiteFTE: onsiteTechDaysForViewScenario / daysPerWeek,
    techDaysLostForView: techDaysLostForViewScenario,
    rowByLab
  });

  document.getElementById('m-onsite').textContent = totalOnsiteFTE.toFixed(1);
  const onsiteSubEl = document.getElementById('m-onsite-sub');
  if (onsiteSubEl) onsiteSubEl.textContent = `FTE equivalent ${getOnsitePeriodLabel(currentView)}`;

  const hasOnsite = scheduleRows.length > 0;
  const onsitePeriodLabel = getOnsitePeriodLabel(currentView);
  const onsiteText = !hasOnsite
    ? (schedulePersistenceEnabled
      ? `No onsite entries stored for ${onsitePeriodLabel}`
      : 'No schedule loaded — using base headcount')
    : onsiteTechDaysForViewDashboard > 0
      ? `${onsiteTechDaysForViewDashboard.toFixed(0)} tech-days on onsite ${onsitePeriodLabel}`
      : `No onsite entries for ${onsitePeriodLabel}`;
  const hcText = hasHeadcountData
    ? `Headcount basis: ${monthKey}${headcountSourceName ? ` · ${headcountSourceName}` : ''}`
    : 'Headcount basis: static baseline';
  const stdText = hasStdHistoryData
    ? `Std hrs basis: ${monthKey}${stdHoursSourceName ? ` · ${stdHoursSourceName}` : ''}`
    : 'Std hrs basis: static baseline';
  const stdUploadText = stdHoursPersistenceEnabled && stdHoursRangeOverrides.length
    ? `Std uploads active: ${stdHoursRangeOverrides.length}`
    : 'Std uploads: none';
  const scenarioText = scenarioModel.enabled
    ? 'Scenario analysis tab ready'
    : 'Scenario analysis tab idle';
  document.getElementById('week-sub').textContent = `${onsiteText} · ${hcText} · ${stdText} · ${stdUploadText} · ${scenarioText}`;

  updateViewDecor();
  renderLabPickerOptions();
  renderScenarioLabPickerOptions();
  renderTable();
  renderScenarioTable();
  updateScenarioControls();
}

function sortRowsForTable(rows, {useScenario = false} = {}) {
  const statusOrder = {over: 0, risk: 1, ok: 2};
  rows.sort((a, b) => {
    const am = getDisplayMetricsForRow(a, {useScenario});
    const bm = getDisplayMetricsForRow(b, {useScenario});
    let av;
    let bv;
    if (sortKey === 'status') {
      av = statusOrder[am.status];
      bv = statusOrder[bm.status];
    } else if (sortKey === 'name') {
      return sortDir * a.lab.localeCompare(b.lab);
    } else if (sortKey === 'headcount') {
      av = am.baseTech;
      bv = bm.baseTech;
    } else if (sortKey === 'util') {
      av = am.util ?? -1;
      bv = bm.util ?? -1;
    } else if (sortKey === 'gap') {
      av = am.gap;
      bv = bm.gap;
    } else if (sortKey === 'onsite') {
      av = am.lostFTE;
      bv = bm.lostFTE;
    } else {
      av = statusOrder[am.status];
      bv = statusOrder[bm.status];
    }
    if (sortKey === 'status') return sortDir * (av - bv);
    return sortDir * (bv - av);
  });
}

function buildTableRowsHtml(rows, {useScenario = false} = {}) {
  return rows.map(r => {
    const display = getDisplayMetricsForRow(r, {useScenario});
    const baseline = display.baseline;
    const demand = display.demand;
    const cap = display.cap;
    const gap = display.gap;
    const util = display.util;
    const status = display.status;

    const utilPct  = util != null ? Math.round(util * 100) : null;
    const barPct   = utilPct != null ? Math.min(utilPct, 100) : 0;
    const barCls   = status === 'over' ? 'bar-over' : status === 'risk' ? 'bar-risk' : 'bar-ok';
    const utilColor = status === 'over' ? 'num-red' : status === 'risk' ? 'num-amber' : 'num-green';
    const gapStr   = gap != null ? (gap >= 0 ? '+' : '') + Math.round(gap) + ' hrs' : '—';
    const gapCls   = gap < 0 ? 'num-red' : gap < cap * 0.15 ? 'num-amber' : 'num-green';
    const lostDisp = display.lostFTE > 0
      ? `<span class="num-red">${display.lostFTE.toFixed(1)}</span>`
      : '<span class="num-muted">—</span>';
    const availDisp = display.lostFTE > 0
      ? `<span class="num-amber">${display.avail.toFixed(1)}</span>`
      : `${display.baseTech}`;
    const scenarioDeltaText = (currentValue, baselineValue, formatter, suffix = '') => {
      if (!useScenario || !scenarioModel.enabled || !display.inScope || baselineValue == null || currentValue == null) return '';
      const delta = currentValue - baselineValue;
      const deltaStr = `${delta > 0 ? '+' : ''}${suffix === '%' ? Math.round(delta) : Math.round(delta)}${suffix}`;
      return `<span class="num-sub">Base ${formatter(baselineValue)} · Δ ${deltaStr}</span>`;
    };
    const demandSub = baseline ? scenarioDeltaText(demand, baseline.demand, fmtHrs) : '';
    const capSub = baseline ? scenarioDeltaText(cap, baseline.cap, fmtHrs) : '';
    const gapSub = baseline ? scenarioDeltaText(gap, baseline.gap, v => `${v >= 0 ? '+' : ''}${Math.round(v)} hrs`) : '';
    const headcountSub = baseline ? scenarioDeltaText(display.baseTech, baseline.baseTech, v => `${Math.round(v)}`) : '';
    const onsiteSub = baseline ? scenarioDeltaText(display.lostFTE, baseline.lostFTE, v => v > 0 ? v.toFixed(1) : '—') : '';
    const availSub = baseline ? scenarioDeltaText(display.avail, baseline.avail, v => Number.isInteger(v) ? `${v}` : v.toFixed(1)) : '';
    const utilSub = (useScenario && scenarioModel.enabled && display.inScope && baseline && baseline.util != null && util != null)
      ? `<span class="num-sub">Base ${Math.round(baseline.util * 100)}% · Δ ${utilPct - Math.round(baseline.util * 100) > 0 ? '+' : ''}${utilPct - Math.round(baseline.util * 100)}%</span>`
      : '';
    let badge = '';
    if (status === 'over') badge = '<span class="badge badge-over">&#9650; Over</span>';
    else if (status === 'risk') badge = '<span class="badge badge-risk">&#9888; At risk</span>';
    else badge = '<span class="badge badge-ok">&#10003; Healthy</span>';
    const statusSub = (useScenario && scenarioModel.enabled && display.inScope && baseline && baseline.status !== status)
      ? `<span class="num-sub">Base: ${baseline.status === 'over' ? 'Over' : baseline.status === 'risk' ? 'At risk' : 'Healthy'}</span>`
      : '';

    return `<tr>
      <td class="lab-name-cell"><div class="lab-name">${r.lab}</div><div class="platform-tag ${r.platform === 'Indysoft' ? 'platform-indysoft' : 'platform-caltrak'}">${r.platform}</div>${useScenario && scenarioModel.enabled && display.inScope ? '<span class="num-sub">Scenario scope</span>' : ''}</td>
      <td class="num">${Math.round(display.baseTech)}${headcountSub}</td>
      <td class="num">${lostDisp}${onsiteSub}</td>
      <td class="num">${availDisp}${availSub}</td>
      <td class="num">${fmtHrs(demand)}${demandSub}</td>
      <td class="num">${fmtHrs(cap)}${capSub}</td>
      <td class="num ${gapCls}">${gapStr}${gapSub}</td>
      <td class="util-cell">${utilPct != null ? `
        <div class="util-wrap">
          <div class="util-pct ${utilColor}">${utilPct}%</div>
          <div class="bar-track"><div class="bar-fill ${barCls}" style="width:${barPct}%"></div></div>
        </div>${utilSub}` : '—'}</td>
      <td class="status-cell">${badge}${statusSub}</td>
    </tr>`;
  }).join('');
}

function renderRowsIntoTable({
  rows,
  bodyEl,
  rowCountEl,
  useScenario = false,
  emptyTitle = 'No labs match your filters',
  emptySub = 'Try adjusting lab selection or status filter'
}) {
  if (!bodyEl) return;
  if (rowCountEl) rowCountEl.textContent = `${rows.length} lab${rows.length !== 1 ? 's' : ''}`;
  if (!rows.length) {
    bodyEl.innerHTML = `<tr><td colspan="9">
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">${escapeHtml(emptyTitle)}</div>
        <div class="empty-sub">${escapeHtml(emptySub)}</div>
      </div></td></tr>`;
    return;
  }
  bodyEl.innerHTML = buildTableRowsHtml(rows, {useScenario});
}

function renderTable() {
  const fsEl = document.getElementById('f-status');
  const fs = fsEl ? fsEl.value : 'all';
  let rows = getSelectedRows();
  updateStatusSummary();
  if (fs !== 'all') rows = rows.filter(r => getDisplayMetricsForRow(r, {useScenario: false}).status === fs);
  sortRowsForTable(rows, {useScenario: false});
  renderRowsIntoTable({
    rows,
    bodyEl: document.getElementById('tbl-body'),
    rowCountEl: document.getElementById('row-count'),
    useScenario: false
  });
}

function renderScenarioTable() {
  const bodyEl = document.getElementById('s-tbl-body');
  if (!bodyEl) return;
  const fsEl = document.getElementById('s-f-status');
  const fs = scenarioModel.statusFilter || (fsEl ? fsEl.value : 'all');
  if (fsEl && fsEl.value !== fs) fsEl.value = fs;
  let rows = getScenarioSelectedRows();
  if (fs !== 'all') rows = rows.filter(r => getDisplayMetricsForRow(r, {useScenario: true}).status === fs);
  sortRowsForTable(rows, {useScenario: true});
  renderRowsIntoTable({
    rows,
    bodyEl,
    rowCountEl: document.getElementById('s-row-count'),
    useScenario: true,
    emptyTitle: 'No labs selected for scenario',
    emptySub: 'Use the scenario lab selector to choose labs.'
  });
  updateScenarioImpact(getScenarioSelectedRows());
}

// Init
async function initApp() {
  initStdUploadModal();
  initColumnHelpTooltips();
  document.addEventListener('click', handleDocumentClickForLabPicker);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeLabPickerMenu();
      closeScenarioLabPickerMenu();
    }
  });
  renderScenarioProfileOptions();
  updateScenarioControls();
  const platformSelect = document.getElementById('f-platform');
  if (platformSelect) platformSelect.value = platformFilterMode;
  setPageTab(currentPageTab);
  setSort('status');
  recalc();
  try {
    await loadPersistedSchedule();
  } catch (_err) {
    // Keep local-only mode if API is unavailable.
  }
  try {
    await loadPersistedStdHours();
  } catch (_err) {
    // Keep local-only mode if API is unavailable.
  }
  try {
    await loadPersistedScenarios({silent: true});
  } catch (_err) {
    // Keep local-only mode if API is unavailable.
  }
}

initApp();
