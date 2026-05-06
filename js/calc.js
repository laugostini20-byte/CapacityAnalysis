'use strict';

// ─── DOMAIN / CALC LOGIC ─────────────────────────────────────────────────────
// Pure-ish calculation and lookup helpers. No DOM. Loaded after state.js.

function calcAnalysisSnapshot(lab, inputs, view) {
  const s = VIEW_SCALE[view] ?? 1;
  const onsite = onsiteFTE(lab.labName, view);

  // ── BEFORE (mirrors baseMetrics) ─────────────────────────────────────────
  const hrsPerDayBefore = SHIFT_HRS * (lab.productivityPct / 100);
  const availBefore     = Math.max(0, lab.totalTechs - onsite);
  const capacityBefore  = availBefore * hrsPerDayBefore * lab.daysPerWeek * s;
  const demandBefore    = (lab.stdHrsPerWeek ?? 0) * s;
  const marginBefore    = capacityBefore - demandBefore;
  const loadBefore      = capacityBefore > 0
    ? (demandBefore / capacityBefore) * 100
    : (demandBefore > 0 ? Infinity : 0);

  // ── AFTER ────────────────────────────────────────────────────────────────
  const adjProdPct     = clamp(inputs.productivityPct, 1, 100);
  const hrsPerDayAfter = SHIFT_HRS * (adjProdPct / 100);
  const adjAvail       = Math.max(0, availBefore + (inputs.headcountDelta ?? 0));
  const adjOT          = (inputs.otHrsPerWk ?? 0) * s;
  const capacityAfter  = (adjAvail * hrsPerDayAfter * lab.daysPerWeek * s) + adjOT;

  const autoDelta  = Math.max(0, (inputs.targetAutoPct ?? 0) - (inputs.currentAutoPct ?? 0));
  const autoSaving = (autoDelta / 100) * 0.30;
  const demandRaw  = demandBefore + ((inputs.demandDeltaHrsPerWk ?? 0) * s);
  const demandAfter = Math.max(0, demandRaw * (1 - autoSaving));
  const marginAfter = capacityAfter - demandAfter;
  const loadAfter   = capacityAfter > 0
    ? (demandAfter / capacityAfter) * 100
    : (demandAfter > 0 ? Infinity : 0);

  // ── BREAKDOWN ────────────────────────────────────────────────────────────
  const gainHeadcount = (adjAvail - availBefore) * hrsPerDayAfter * lab.daysPerWeek * s;
  const gainOT        = adjOT;
  const gainProd      = availBefore * (hrsPerDayAfter - hrsPerDayBefore) * lab.daysPerWeek * s;
  const gainAuto      = -(demandBefore * autoSaving);        // negative = demand reduced
  const gainDemand    = (inputs.demandDeltaHrsPerWk ?? 0) * s;

  return {
    before:    { capacity: capacityBefore, demand: demandBefore, margin: marginBefore, load: loadBefore, techs: availBefore },
    after:     { capacity: capacityAfter,  demand: demandAfter,  margin: marginAfter,  load: loadAfter,  techs: adjAvail },
    breakdown: { gainHeadcount, gainOT, gainProd, gainAuto, gainDemand },
    autoDelta, autoSaving,
  };
}

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

function getScenarioProductivityPct(lab, inputs = {}, global = {}) {
  const rawExplicitPct = inputs.productivityPct;
  if (rawExplicitPct != null && String(rawExplicitPct).trim() !== '') {
    const explicitPct = Number(rawExplicitPct);
    if (Number.isFinite(explicitPct)) return clamp(Math.round(explicitPct), 1, 100);
  }

  const legacyAdj = Number(inputs.prodOverride ?? global.prodAdj ?? 0);
  if (Number.isFinite(legacyAdj) && legacyAdj !== 0) {
    return clamp(lab.productivityPct + legacyAdj, 1, 100);
  }
  return clamp(lab.productivityPct, 1, 100);
}

// Scenario metrics use OT-adjusted capacity consistently for capacity, margin, load, and remaining OT.
function scenMetrics(lab, inputs, global, viewStr) {
  const s = scale(viewStr);
  const demandDeltaWeekly = toWeeklyDelta(inputs.demandVal ?? 0, inputs.demandUnit ?? 'weekly');
  const hireTechs = inputs.hireTechs ?? 0;
  const otPerWeek = inputs.otOverride ?? global.ot;
  const daysChange = inputs.daysOverride ?? global.daysDelta;
  const scenProdPct = getScenarioProductivityPct(lab, inputs, global);
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

  return { demand, capacity, effectiveCap, margin, loadPct, otHrs, status, scenTechs, scenAvail, scenProdPct };
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

