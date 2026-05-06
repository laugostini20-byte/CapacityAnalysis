'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
// Front-end state objects. Loaded after constants.js + utils.js, before app.js.
// All declarations here are mutated extensively by app.js — keeping them in one
// place makes the shape easy to find when reading the code.

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
    globalProdAdj: 0,          // legacy scenario field; new UI uses per-lab productivityPct
    globalDaysDelta: 0,
    perLab: {},                // { labName: { demandVal, demandUnit, hireTechs, otOverride, daysOverride, productivityPct, prodOverride } }
  },
  modalLabName: null,
  modalMetric: 'load',
  modalComparePrev: true,
  modalMonthIndex: null,
  chart: null,
};

// ─── ANALYSIS TAB STATE ──────────────────────────────────────────────────────
const analysisState = {
  view: 'weekly',
  selectedLabs: new Set(),  // Set of labName strings
  perLab: {},               // { labName: inputs }
  searchTerm: '',
};

// Default inputs for a newly-added lab in the Analysis tab.
function defaultAnalysisInputs(lab) {
  return {
    headcountDelta:      0,
    otHrsPerWk:          0,
    productivityPct:     lab.productivityPct,
    demandDeltaHrsPerWk: 0,   // stored in weekly hrs
    currentAutoPct:      0,
    targetAutoPct:       0,
  };
}

// ─── HISTORICAL WIP TAB STATE ────────────────────────────────────────────────
const historicalWipState = {
  coverage: null,    // {firstDate, lastDate, today, daysBehind, totalEntries, labCount, lastUpload}
  rangeStart: null,  // ISO date — defaults to lastDate - 60d
  rangeEnd: null,    // ISO date — defaults to lastDate
  searchTerm: '',
};
