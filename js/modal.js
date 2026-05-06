'use strict';

// ─── LAB DETAIL MODAL ───────────────────────────────────────────────────────
// Click-into-lab modal: chart, insights, monthly snapshots, tooltip.

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

function buildStatusBoardMonthlySnapshot(lab, monthKey) {
  const currentMonthKey = monthKeyFromDate(referenceDate());
  if (monthKey !== currentMonthKey) return null;
  const metrics = baseMetrics(lab, 'monthly');
  return {
    monthKey,
    demand: metrics.demand,
    capacity: metrics.capacity,
    load: metrics.loadPct,
    ot: metrics.otHrs,
    techs: lab.totalTechs,
    onsite: metrics.onsite,
    avail: metrics.avail,
  };
}

function buildCurrentYearMonthlySnapshot(lab, monthKey) {
  const currentPeriodSnapshot = buildStatusBoardMonthlySnapshot(lab, monthKey);
  if (currentPeriodSnapshot) return currentPeriodSnapshot;
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

