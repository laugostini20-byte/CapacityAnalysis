'use strict';

// ─── ANALYSIS TAB ────────────────────────────────────────────────────────────
// Analysis tab: per-lab interactive what-if scratch pad.

// ─── ANALYSIS TAB FUNCTIONS ──────────────────────────────────────────────────

function setAnalysisView(v) {
  analysisState.view = v;
  document.querySelectorAll('#analysis-view-bar .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === v);
  });
  renderAnalysisRows();
}

function toggleAnalysisLab(labName) {
  if (analysisState.selectedLabs.has(labName)) {
    analysisState.selectedLabs.delete(labName);
    delete analysisState.perLab[labName];
  } else {
    const lab = st.labList.find(l => l.labName === labName);
    if (lab) analysisState.perLab[labName] = defaultAnalysisInputs(lab);
    analysisState.selectedLabs.add(labName);
  }
  renderAnalysisLabList();
  renderAnalysisRows();
}

function onAnalysisLabSearch(term) {
  analysisState.searchTerm = term.toLowerCase();
  renderAnalysisLabList();
}

function renderAnalysisLabList() {
  const container = document.getElementById('analysis-lab-list');
  if (!container) return;
  const term = analysisState.searchTerm;
  const labs = st.labList.filter(l => !term || l.labName.toLowerCase().includes(term));

  container.innerHTML = labs.map(lab => {
    const selected = analysisState.selectedLabs.has(lab.labName);
    const metrics  = baseMetrics(lab, analysisState.view);
    const dotColor = metrics.status === 'over' ? '#ef4444'
                   : metrics.status === 'risk' ? '#f59e0b' : '#22c55e';
    return `<div class="analysis-lab-item${selected ? ' selected' : ''}"
                 onclick="toggleAnalysisLab(${JSON.stringify(lab.labName).replace(/"/g, '&quot;')})">
      <div class="analysis-lab-check">${selected ? '✓' : ''}</div>
      <span>${esc(lab.labName)}</span>
      <div class="analysis-status-dot" style="background:${dotColor}"></div>
    </div>`;
  }).join('');
}

function analysisLoadClass(load) {
  if (!Number.isFinite(load)) return 'over';
  return load > 100 ? 'over' : load >= 80 ? 'risk' : 'ok';
}

function analysisBaBoxStyle(load) {
  if (!Number.isFinite(load) || load > 100) return 'background:#fef2f2;border:1px solid #fecaca';
  if (load >= 80) return 'background:#fffbeb;border:1px solid #fde68a';
  return 'background:#f0fdf4;border:1px solid #bbf7d0';
}

function analysisLoadColor(load) {
  if (!Number.isFinite(load) || load > 100) return '#ef4444';
  if (load >= 80) return '#f59e0b';
  return '#16a34a';
}

function analysisGainRow(dotColor, text, val, valColor, muted) {
  const textStyle = muted ? 'color:#9ca3af' : '';
  const valStyle  = `color:${muted ? '#9ca3af' : valColor}`;
  return `<div class="analysis-gain-row">
    <div class="analysis-gain-dot" style="background:${muted ? '#9ca3af' : dotColor}"></div>
    <div class="analysis-gain-text" style="${textStyle}">${text}</div>
    <div class="analysis-gain-val" style="${valStyle}">${val}</div>
  </div>`;
}

function analysisViewUnitLabel(view) {
  return view === 'weekly' ? 'wk' : view === 'monthly' ? 'mo' : view === 'quarterly' ? 'qtr' : 'yr';
}

function renderAnalysisAutoPill(snap) {
  return snap.autoDelta > 0
    ? `<div class="analysis-auto-saving">saves ${fmt(snap.autoSaving * 100, 1)}% tech time &nbsp;(${snap.autoDelta}% × 30%)</div>`
    : `<div style="font-size:10px;color:#9ca3af;font-style:italic">No change — current equals target.</div>`;
}

function renderAnalysisSnapshotInner(lab, inputs, view, snap) {
  const unit = analysisViewUnitLabel(view);
  const vLabel = VIEW_LABEL[view] ?? 'Wk';
  const s = VIEW_SCALE[view] ?? 1;
  const isIndy = lab.stdHrsPerWeek == null;
  const demandDisplayVal = Math.round((inputs.demandDeltaHrsPerWk ?? 0) * s);
  const bd = snap.breakdown;

  const gainRows = [
    analysisGainRow('#00539b', inputs.headcountDelta === 0 ? 'Headcount unchanged' : `${inputs.headcountDelta > 0 ? '+' : ''}${inputs.headcountDelta} techs`,
      inputs.headcountDelta === 0 ? '—' : `${bd.gainHeadcount >= 0 ? '+' : ''}${fmtInt(bd.gainHeadcount)} cap hrs/${unit}`,
      '#00539b', inputs.headcountDelta === 0),
    analysisGainRow('#ebae1f', inputs.otHrsPerWk === 0 ? 'OT unchanged' : `OT +${inputs.otHrsPerWk} hrs/wk`,
      inputs.otHrsPerWk === 0 ? '—' : `+${fmtInt(bd.gainOT)} cap hrs/${unit}`,
      '#b7740a', inputs.otHrsPerWk === 0),
    analysisGainRow('#22c55e',
      inputs.productivityPct === lab.productivityPct ? 'Productivity unchanged' : `Productivity ${lab.productivityPct}% → ${inputs.productivityPct}%`,
      inputs.productivityPct === lab.productivityPct ? '—' : `${bd.gainProd >= 0 ? '+' : ''}${fmtInt(bd.gainProd)} cap hrs/${unit}`,
      '#16a34a', inputs.productivityPct === lab.productivityPct),
    analysisGainRow('#6366f1',
      snap.autoDelta === 0 ? 'Automation unchanged (current = target)' : `Automation ${inputs.currentAutoPct}% → ${inputs.targetAutoPct}% (${fmt(snap.autoSaving * 100, 1)}% time saving)`,
      snap.autoDelta === 0 ? '—' : `${fmtInt(bd.gainAuto)} demand hrs/${unit}`,
      '#6366f1', snap.autoDelta === 0),
    analysisGainRow('#ef4444',
      inputs.demandDeltaHrsPerWk === 0 ? 'Demand unchanged' : `Demand ${demandDisplayVal >= 0 ? '+' : ''}${demandDisplayVal} hrs/${unit}`,
      inputs.demandDeltaHrsPerWk === 0 ? '—' : `${bd.gainDemand >= 0 ? '+' : ''}${fmtInt(bd.gainDemand)} demand hrs/${unit}`,
      bd.gainDemand >= 0 ? '#ef4444' : '#16a34a', inputs.demandDeltaHrsPerWk === 0),
  ].join('');

  const indyNote = isIndy
    ? `<div style="font-size:10px;color:#9ca3af;margin-top:4px">IndySoft lab — no std hours data, demand shown as 0.</div>` : '';

  return `
    <div class="analysis-snapshot-title">Capacity Snapshot — ${vLabel}</div>
    ${indyNote}
    <div class="analysis-ba">
      <div class="analysis-ba-box" style="${analysisBaBoxStyle(snap.before.load)}">
        <div class="analysis-ba-label">Before</div>
        <div class="analysis-ba-load" style="color:${analysisLoadColor(snap.before.load)}">${fmt(snap.before.load, 0)}%</div>
        <div class="analysis-ba-metrics">
          <div class="analysis-ba-row"><span class="analysis-ba-key">Capacity</span><span class="analysis-ba-val">${fmtInt(snap.before.capacity)} hrs/${unit}</span></div>
          <div class="analysis-ba-row"><span class="analysis-ba-key">Demand</span><span class="analysis-ba-val">${fmtInt(snap.before.demand)} hrs/${unit}</span></div>
          <div class="analysis-ba-row"><span class="analysis-ba-key">Avail Techs</span><span class="analysis-ba-val">${snap.before.techs}</span></div>
          <div class="analysis-ba-row"><span class="analysis-ba-key">Margin</span><span class="analysis-ba-val ${snap.before.margin >= 0 ? 'pos' : 'neg'}">${snap.before.margin >= 0 ? '+' : ''}${fmtInt(snap.before.margin)} hrs</span></div>
        </div>
      </div>
      <div class="analysis-ba-arrow">→</div>
      <div class="analysis-ba-box" style="${analysisBaBoxStyle(snap.after.load)}">
        <div class="analysis-ba-label">After</div>
        <div class="analysis-ba-load" style="color:${analysisLoadColor(snap.after.load)}">${fmt(snap.after.load, 0)}%</div>
        <div class="analysis-ba-metrics">
          <div class="analysis-ba-row"><span class="analysis-ba-key">Capacity</span><span class="analysis-ba-val">${fmtInt(snap.after.capacity)} hrs/${unit}</span></div>
          <div class="analysis-ba-row"><span class="analysis-ba-key">Demand</span><span class="analysis-ba-val">${fmtInt(snap.after.demand)} hrs/${unit}</span></div>
          <div class="analysis-ba-row"><span class="analysis-ba-key">Avail Techs</span><span class="analysis-ba-val ${snap.after.techs !== snap.before.techs ? (snap.after.techs > snap.before.techs ? 'pos' : 'neg') : ''}">${snap.after.techs}</span></div>
          <div class="analysis-ba-row"><span class="analysis-ba-key">Margin</span><span class="analysis-ba-val ${snap.after.margin >= 0 ? 'pos' : 'neg'}">${snap.after.margin >= 0 ? '+' : ''}${fmtInt(snap.after.margin)} hrs</span></div>
        </div>
      </div>
    </div>
    <div class="analysis-breakdown">
      <div class="analysis-breakdown-title">Where the change comes from</div>
      ${gainRows}
    </div>`;
}

function renderAnalysisLabRow(lab) {
  const inputs  = analysisState.perLab[lab.labName];
  const view    = analysisState.view;
  const snap    = calcAnalysisSnapshot(lab, inputs, view);
  const unit    = analysisViewUnitLabel(view);
  const s       = VIEW_SCALE[view] ?? 1;

  // Demand input: convert stored weekly value to current view units for display
  const demandDisplayVal = Math.round((inputs.demandDeltaHrsPerWk ?? 0) * s);

  const labNameJson = JSON.stringify(lab.labName).replace(/"/g, '&quot;');

  return `<div class="analysis-lab-row" id="analysis-row-${labKey(lab.labName)}">
    <div class="analysis-row-header">
      <div class="analysis-row-name">${esc(lab.labName)}</div>
      <div class="badge ${lab.systemType === 'indysoft' ? 'badge-indysoft' : 'badge-caltrak'}">${lab.systemType === 'indysoft' ? 'IndySoft' : 'CalTrak'}</div>
      <button class="analysis-row-dismiss" onclick="toggleAnalysisLab(${labNameJson})">×</button>
    </div>
    <div class="analysis-row-body">

      <!-- Controls -->
      <div class="analysis-controls">
        <div class="analysis-controls-title">Adjust Variables</div>

        <div class="analysis-ctrl">
          <div class="analysis-ctrl-top">
            <div class="analysis-ctrl-label">Headcount Change</div>
            <input class="analysis-ctrl-input" type="number" value="${inputs.headcountDelta}"
              oninput="onAnalysisInput(${labNameJson},'headcountDelta',+this.value);syncAnalysisSlider(this,'analysis-slider-hc-${labKey(lab.labName)}')"
              min="-10" max="20" step="1">
          </div>
          <input id="analysis-slider-hc-${labKey(lab.labName)}" class="analysis-slider" type="range" min="-10" max="20" value="${inputs.headcountDelta}"
            oninput="onAnalysisInput(${labNameJson},'headcountDelta',+this.value);syncAnalysisInput(this,'analysis-ctrl-input',${labNameJson},'headcountDelta')">
        </div>

        <div class="analysis-ctrl">
          <div class="analysis-ctrl-top">
            <div class="analysis-ctrl-label">OT Hours / Week</div>
            <input class="analysis-ctrl-input" type="number" value="${inputs.otHrsPerWk}"
              oninput="onAnalysisInput(${labNameJson},'otHrsPerWk',+this.value);syncAnalysisSlider(this,'analysis-slider-ot-${labKey(lab.labName)}')"
              min="0" max="80" step="1">
          </div>
          <input id="analysis-slider-ot-${labKey(lab.labName)}" class="analysis-slider" type="range" min="0" max="80" value="${inputs.otHrsPerWk}"
            oninput="onAnalysisInput(${labNameJson},'otHrsPerWk',+this.value);syncAnalysisInput(this,'analysis-ctrl-input',${labNameJson},'otHrsPerWk')">
        </div>

        <div class="analysis-ctrl">
          <div class="analysis-ctrl-top">
            <div class="analysis-ctrl-label">Productivity %</div>
            <input class="analysis-ctrl-input" type="number" value="${inputs.productivityPct}"
              oninput="onAnalysisInput(${labNameJson},'productivityPct',+this.value);syncAnalysisSlider(this,'analysis-slider-prod-${labKey(lab.labName)}')"
              min="50" max="100" step="1">
          </div>
          <input id="analysis-slider-prod-${labKey(lab.labName)}" class="analysis-slider" type="range" min="50" max="100" value="${inputs.productivityPct}"
            oninput="onAnalysisInput(${labNameJson},'productivityPct',+this.value);syncAnalysisInput(this,'analysis-ctrl-input',${labNameJson},'productivityPct')">
        </div>

        <div class="analysis-ctrl">
          <div class="analysis-ctrl-top">
            <div class="analysis-ctrl-label">Demand Change (hrs/${unit})</div>
            <input class="analysis-ctrl-input" type="number" value="${demandDisplayVal}"
              oninput="onAnalysisDemandInput(${labNameJson},+this.value);syncAnalysisSlider(this,'analysis-slider-dem-${labKey(lab.labName)}')"
              min="${Math.round(-500 * s)}" max="${Math.round(500 * s)}" step="1">
          </div>
          <input id="analysis-slider-dem-${labKey(lab.labName)}" class="analysis-slider" type="range"
            min="${Math.round(-500 * s)}" max="${Math.round(500 * s)}" value="${demandDisplayVal}"
            oninput="onAnalysisDemandInput(${labNameJson},+this.value);syncAnalysisInput(this,'analysis-ctrl-input',${labNameJson},'demandDeltaHrsPerWk')">
          <div class="analysis-ctrl-hint">Absolute hours per ${unit}. Negative = demand reduction.</div>
        </div>

        <!-- Automation -->
        <div class="analysis-auto-block">
          <div class="analysis-auto-title">⚡ Automation Utilization</div>
          <div class="analysis-auto-row">
            <div class="analysis-auto-field">
              <div class="analysis-auto-field-label baseline">Current baseline</div>
              <input class="analysis-auto-input baseline" type="number" min="0" max="100" step="1"
                value="${inputs.currentAutoPct}"
                oninput="onAnalysisInput(${labNameJson},'currentAutoPct',clamp(+this.value,0,100));updateAnalysisLabRow(${labNameJson})">
            </div>
            <div class="analysis-auto-arrow">→</div>
            <div class="analysis-auto-field">
              <div class="analysis-auto-field-label target">Target (drives change)</div>
              <input class="analysis-auto-input target" type="number" min="0" max="100" step="1"
                value="${inputs.targetAutoPct}"
                oninput="onAnalysisInput(${labNameJson},'targetAutoPct',clamp(+this.value,0,100));updateAnalysisLabRow(${labNameJson})">
            </div>
          </div>
          <div class="analysis-auto-note">Current % sets the starting point only. Only the gap between current and target drives capacity impact.</div>
          <span id="analysis-auto-pill-${labKey(lab.labName)}">${renderAnalysisAutoPill(snap)}</span>
        </div>
      </div>

      <!-- Snapshot -->
      <div class="analysis-snapshot" id="analysis-snap-${labKey(lab.labName)}">
        ${renderAnalysisSnapshotInner(lab, inputs, view, snap)}
      </div>
    </div>
  </div>`;
}

function onAnalysisInput(labName, field, val) {
  if (!analysisState.perLab[labName]) return;
  analysisState.perLab[labName][field] = val;
}

function onAnalysisDemandInput(labName, displayVal) {
  // displayVal is in current view units — convert back to weekly for storage
  if (!analysisState.perLab[labName]) return;
  const s = VIEW_SCALE[analysisState.view] ?? 1;
  analysisState.perLab[labName].demandDeltaHrsPerWk = displayVal / s;
  updateAnalysisLabRow(labName);
}

function syncAnalysisSlider(inputEl, sliderId) {
  const slider = document.getElementById(sliderId);
  if (slider) slider.value = inputEl.value;
  // Trigger full row update after sync
  const row = inputEl.closest('.analysis-lab-row');
  if (row) {
    const labName = [...analysisState.selectedLabs].find(n =>
      'analysis-row-' + labKey(n) === row.id
    );
    if (labName) updateAnalysisLabRow(labName);
  }
}

function syncAnalysisInput(sliderEl, inputClass, labName, field) {
  // Find the matching number input in the same .analysis-ctrl
  const ctrl = sliderEl.closest('.analysis-ctrl');
  if (!ctrl) return;
  const inp = ctrl.querySelector('.' + inputClass);
  if (inp) inp.value = sliderEl.value;
  updateAnalysisLabRow(labName);
}

function updateAnalysisLabRow(labName) {
  const lab = st.labList.find(l => l.labName === labName);
  if (!lab || !analysisState.perLab[labName]) return;
  const inputs = analysisState.perLab[labName];
  const view = analysisState.view;
  const snap = calcAnalysisSnapshot(lab, inputs, view);

  const snapEl = document.getElementById('analysis-snap-' + labKey(labName));
  if (snapEl) snapEl.innerHTML = renderAnalysisSnapshotInner(lab, inputs, view, snap);

  const pillEl = document.getElementById('analysis-auto-pill-' + labKey(labName));
  if (pillEl) pillEl.innerHTML = renderAnalysisAutoPill(snap);
}

function renderAnalysisRows() {
  const container = document.getElementById('analysis-rows');
  if (!container) return;
  if (analysisState.selectedLabs.size === 0) {
    container.innerHTML = `<div class="analysis-empty">
      <div style="font-size:28px">＋</div>
      <div class="analysis-empty-title">Select a lab from the list to begin</div>
      <div class="analysis-empty-sub">Each lab gets its own independent controls and snapshot</div>
    </div>`;
    return;
  }
  const rows = [...analysisState.selectedLabs].map(labName => {
    const lab = st.labList.find(l => l.labName === labName);
    return lab ? renderAnalysisLabRow(lab) : '';
  }).join('');
  container.innerHTML = rows;
}

function renderAnalysisTab() {
  const panel = document.getElementById('view-analysis');
  if (!panel) return;

  panel.innerHTML = `
    <!-- View toggle bar -->
    <div class="analysis-view-bar" id="analysis-view-bar">
      <span class="analysis-view-bar-label">View</span>
      <div class="seg-group">
        <button class="seg-btn${analysisState.view === 'weekly'    ? ' active' : ''}" data-view="weekly"    onclick="setAnalysisView('weekly')">Weekly</button>
        <button class="seg-btn${analysisState.view === 'monthly'   ? ' active' : ''}" data-view="monthly"   onclick="setAnalysisView('monthly')">Monthly</button>
        <button class="seg-btn${analysisState.view === 'quarterly' ? ' active' : ''}" data-view="quarterly" onclick="setAnalysisView('quarterly')">Quarterly</button>
        <button class="seg-btn${analysisState.view === 'yearly'    ? ' active' : ''}" data-view="yearly"    onclick="setAnalysisView('yearly')">Annually</button>
      </div>
      <span class="analysis-view-note">All capacity &amp; demand figures scale with selected period</span>
    </div>

    <div class="analysis-layout">
      <!-- Lab list -->
      <div class="analysis-lab-panel">
        <div class="analysis-lab-panel-title">Select Labs to Analyze</div>
        <input class="analysis-lab-search" type="text" placeholder="Search labs…"
          oninput="onAnalysisLabSearch(this.value)" value="${esc(analysisState.searchTerm)}">
        <div class="analysis-lab-list" id="analysis-lab-list"></div>
      </div>

      <!-- Rows -->
      <div class="analysis-rows" id="analysis-rows"></div>
    </div>`;

  renderAnalysisLabList();
  renderAnalysisRows();
}

