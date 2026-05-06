'use strict';

// ─── ENTRY ─────────────────────────────────────────────────────────────────
// Top-level orchestration only. The rest of the front-end has been split out:
//
//   js/constants.js         — SHIFT_HRS, VIEW_SCALE, BASE_LABS, etc.
//   js/utils.js             — fmt, clamp, esc, labKey, etc.
//   js/state.js             — st, analysisState, defaultAnalysisInputs
//   js/api.js               — apiFetch
//   js/calc.js              — domain math, headcount/WIP lookups, baseMetrics
//   js/status-board.js      — Status Board rendering + filters
//   js/modal.js             — Lab detail modal + chart
//   js/scenario-planner.js  — Scenario Planner tab
//   js/upload.js            — Upload modal + submit
//   js/analysis.js          — Analysis tab
//
// What stays here: loadData, switchTab, init.

// ─── API ─────────────────────────────────────────────────────────────────────
// apiFetch lives in js/api.js. loadData stays here because it touches a lot of
// app-side state and rendering helpers.

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
        if (!isLabActive(key)) return;
        const existing = st.dbStdHrs[key];
        // Keep the record with the latest effectiveDate when multiple DB keys map to the same canonical key
        if (!existing || (l.effectiveDate || '') >= (existing.effectiveDate || '')) {
          st.dbStdHrs[key] = {...l, labKey: key};
        }
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
    const tabs = ['status-board', 'scenario-planner', 'analysis'];
    el.classList.toggle('active', tabs[i] === tabName);
  });
  document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + tabName).classList.add('active');
  if (tabName === 'scenario-planner') renderScenarioPlanner();
  if (tabName === 'analysis') renderAnalysisTab();
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
