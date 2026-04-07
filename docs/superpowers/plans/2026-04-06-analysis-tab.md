# Analysis Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Analysis" tab to CapacityIQ — a per-lab, interactive what-if scratch pad that shows a before/after capacity snapshot as the user adjusts variables (headcount, OT, productivity, demand, automation utilization) independently per lab.

**Architecture:** All new code lives in `index.html` (HTML structure + CSS) and `app.js` (new functions only, all prefixed `analysis`). The only change to existing code is one new case added to `switchTab()`. A new top-level `analysisState` object holds tab state completely separate from `st`.

**Tech Stack:** Vanilla JS (ES6), HTML, inline CSS — same as existing app. No libraries, no build step. Node.js/Express backend unchanged.

---

## File Map

| File | Change type | What changes |
|---|---|---|
| `index.html` | Modify | +1 nav tab button, +1 `view-panel` div, +CSS block for analysis styles |
| `app.js` | Modify | +`analysisState`, +8 new functions, +1 case in `switchTab()` |

No other files change.

---

## Task 1: Create the branch

**Files:** none (git only)

- [ ] **Step 1: Create and switch to the feature branch**

```bash
cd "/Users/louis/Work Stuff/Capacity Model Tool"
git checkout main
git pull origin main
git checkout -b feature/analysis-tab
```

Expected: `Switched to a new branch 'feature/analysis-tab'`

---

## Task 2: Add HTML structure — nav tab + view panel

**Files:**
- Modify: `index.html` (nav tab button + empty view-panel div)

The existing `switchTab()` uses `tabs[i]` array indexing to match nav buttons positionally. The Analysis tab must be added as the **third** button (index 2) and the array updated to match.

- [ ] **Step 1: Add the Analysis nav tab button**

In `index.html`, find:
```html
    <button class="nav-tab" onclick="switchTab('scenario-planner')">Scenario Planner</button>
```
Add immediately after it:
```html
    <button class="nav-tab" onclick="switchTab('analysis')">Analysis</button>
```

- [ ] **Step 2: Add the Analysis view panel div**

In `index.html`, find the closing `</div>` of `id="view-scenario-planner"`. Add immediately after it:
```html
<!-- ─── ANALYSIS TAB ──────────────────────────────────────────────────────── -->
<div id="view-analysis" class="view-panel">
  <!-- rendered by renderAnalysisTab() -->
</div>
```

- [ ] **Step 3: Update switchTab() to handle the new tab**

In `app.js`, find:
```javascript
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
```
Replace with:
```javascript
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
```

- [ ] **Step 4: Verify in browser — tab click works**

Start the server: `~/.nvm/versions/node/v20.20.0/bin/node server.js`
Open http://localhost:3000
- Click "Analysis" tab — it highlights, the view-analysis div becomes visible (empty is fine)
- Click back to Status Board and Scenario Planner — they still work normally

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat: add Analysis tab shell and switchTab wiring"
```

---

## Task 3: Add CSS for the Analysis tab

**Files:**
- Modify: `index.html` (add CSS inside the existing `<style>` block)

- [ ] **Step 1: Add analysis CSS to the `<style>` block in index.html**

Find the closing `</style>` tag in `index.html`. Insert the following block immediately before it:

```css
/* ── ANALYSIS TAB ── */
#view-analysis{padding:16px 20px}
.analysis-layout{display:grid;grid-template-columns:210px 1fr;gap:16px;align-items:start}

/* View toggle bar */
.analysis-view-bar{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #d0dce8;border-radius:12px;padding:10px 14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,35,66,.08)}
.analysis-view-bar-label{font-size:10px;font-weight:700;color:#6b7a90;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
.analysis-view-note{font-size:11px;color:#9ca3af;margin-left:auto;font-style:italic}

/* Lab list panel */
.analysis-lab-panel{background:#fff;border:1px solid #d0dce8;border-radius:12px;padding:14px;position:sticky;top:72px;box-shadow:0 1px 3px rgba(0,35,66,.08)}
.analysis-lab-panel-title{font-size:10px;font-weight:700;color:#6b7a90;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.analysis-lab-search{width:100%;border:1px solid #d0dce8;border-radius:8px;padding:6px 10px;font-size:12px;outline:none;margin-bottom:8px;color:#1a1a2e}
.analysis-lab-search:focus{border-color:#00539b}
.analysis-lab-list{display:flex;flex-direction:column;gap:2px;max-height:calc(100vh - 220px);overflow-y:auto}
.analysis-lab-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12px;color:#3f3f46;border:1px solid transparent;user-select:none}
.analysis-lab-item:hover{background:#f0f4ff}
.analysis-lab-item.selected{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8;font-weight:600}
.analysis-lab-check{width:14px;height:14px;border-radius:3px;border:1px solid #d0dce8;background:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0}
.analysis-lab-item.selected .analysis-lab-check{background:#00539b;border-color:#00539b;color:#fff}
.analysis-status-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;margin-left:auto}

/* Lab rows */
.analysis-rows{display:flex;flex-direction:column;gap:14px}
.analysis-lab-row{background:#fff;border:1px solid #d0dce8;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,35,66,.08)}
.analysis-row-header{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid #f0f0f0;background:#fafafa}
.analysis-row-name{font-size:14px;font-weight:700;color:#18181b}
.analysis-row-dismiss{margin-left:auto;background:none;border:none;font-size:18px;color:#d1d5db;cursor:pointer;padding:0 4px;line-height:1}
.analysis-row-dismiss:hover{color:#6b7a90}
.analysis-row-body{display:grid;grid-template-columns:1fr 1fr}

/* Controls side */
.analysis-controls{padding:14px 16px;border-right:1px solid #f0f0f0;display:flex;flex-direction:column;gap:11px}
.analysis-controls-title{font-size:10px;font-weight:700;color:#6b7a90;text-transform:uppercase;letter-spacing:.5px}
.analysis-ctrl{display:flex;flex-direction:column;gap:4px}
.analysis-ctrl-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.analysis-ctrl-label{font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.4px}
.analysis-ctrl-input{width:80px;border:1px solid #d0dce8;border-radius:6px;padding:3px 6px;font-size:12px;font-weight:700;text-align:right;background:#fff;outline:none;color:#18181b}
.analysis-ctrl-input:focus{border-color:#00539b;box-shadow:0 0 0 2px rgba(0,83,155,.1)}
.analysis-ctrl-hint{font-size:10px;color:#9ca3af;line-height:1.3}
input.analysis-slider{width:100%;-webkit-appearance:none;height:4px;border-radius:4px;outline:none;cursor:pointer;background:#e4e4e7}
input.analysis-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #00539b;box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:pointer}

/* Automation block */
.analysis-auto-block{background:#f5f4ff;border:1px solid #e0e0fd;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px}
.analysis-auto-title{font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:.4px}
.analysis-auto-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end}
.analysis-auto-field{display:flex;flex-direction:column;gap:3px}
.analysis-auto-field-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.analysis-auto-field-label.baseline{color:#9ca3af}
.analysis-auto-field-label.target{color:#6366f1}
.analysis-auto-input{width:100%;border:1px solid #d0dce8;border-radius:6px;padding:5px 8px;font-size:13px;font-weight:700;text-align:center;outline:none;background:#fff}
.analysis-auto-input.baseline{color:#9ca3af;border-style:dashed}
.analysis-auto-input.target{color:#6366f1;border-color:#a5b4fc}
.analysis-auto-input.target:focus{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
.analysis-auto-arrow{font-size:18px;color:#c4b5fd;text-align:center;padding-bottom:4px}
.analysis-auto-note{font-size:10px;color:#9ca3af;line-height:1.4}
.analysis-auto-saving{display:inline-flex;align-items:center;background:#ede9fe;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700;color:#6366f1;align-self:flex-start}

/* Snapshot side */
.analysis-snapshot{padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.analysis-snapshot-title{font-size:10px;font-weight:700;color:#6b7a90;text-transform:uppercase;letter-spacing:.5px}
.analysis-ba{display:grid;grid-template-columns:1fr 22px 1fr;gap:6px;align-items:center}
.analysis-ba-box{border-radius:10px;padding:10px 12px}
.analysis-ba-label{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}
.analysis-ba-load{font-size:30px;font-weight:800;line-height:1}
.analysis-ba-metrics{margin-top:8px;display:flex;flex-direction:column;gap:3px}
.analysis-ba-row{display:flex;justify-content:space-between;font-size:10px}
.analysis-ba-key{color:#6b7a90}
.analysis-ba-val{font-weight:700;color:#3f3f46}
.analysis-ba-val.pos{color:#16a34a}
.analysis-ba-val.neg{color:#ef4444}
.analysis-ba-arrow{font-size:18px;color:#d1d5db;text-align:center}

/* Gain breakdown */
.analysis-breakdown{background:#f8fafc;border:1px solid #e4e4e7;border-radius:8px;padding:10px}
.analysis-breakdown-title{font-size:9px;font-weight:700;color:#6b7a90;text-transform:uppercase;letter-spacing:.4px;margin-bottom:7px}
.analysis-gain-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:5px}
.analysis-gain-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:2px}
.analysis-gain-text{font-size:10px;color:#3f3f46;flex:1;line-height:1.35}
.analysis-gain-val{font-size:10px;font-weight:700;white-space:nowrap}

/* Empty state */
.analysis-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;color:#a1a1aa;text-align:center;gap:6px;border:2px dashed #e4e4e7;border-radius:14px}
.analysis-empty-title{font-size:13px;font-weight:600;color:#71717a}
.analysis-empty-sub{font-size:11px}
```

- [ ] **Step 2: Verify CSS loads without errors**

Open browser devtools Console tab. Reload the page.
Expected: no CSS parse errors. Analysis tab clicking still works.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add Analysis tab CSS"
```

---

## Task 4: Add analysisState and calcAnalysisSnapshot

**Files:**
- Modify: `app.js` (add after the `st` state object, around line 138)

- [ ] **Step 1: Add analysisState and defaultAnalysisInputs after the `st` declaration**

Find the closing `};` of the `const st = {` block (around line 138). Insert immediately after it:

```javascript
// ─── ANALYSIS TAB STATE ──────────────────────────────────────────────────────
const analysisState = {
  view: 'weekly',
  selectedLabs: new Set(),  // Set of labName strings
  perLab: {},               // { labName: inputs }
  searchTerm: '',
};

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
```

- [ ] **Step 2: Add calcAnalysisSnapshot as a pure function**

Add immediately after `defaultAnalysisInputs`:

```javascript
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
    before:    { capacity: capacityBefore, demand: demandBefore, margin: marginBefore, load: loadBefore },
    after:     { capacity: capacityAfter,  demand: demandAfter,  margin: marginAfter,  load: loadAfter },
    breakdown: { gainHeadcount, gainOT, gainProd, gainAuto, gainDemand },
    autoDelta, autoSaving,
  };
}
```

- [ ] **Step 3: Verify no JS errors**

Reload browser. Open Console.
Expected: no errors. All existing tabs still work.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: add analysisState and calcAnalysisSnapshot"
```

---

## Task 5: Add renderAnalysisLabList

**Files:**
- Modify: `app.js` (add new functions near bottom, before the `init` / `loadData` calls)

- [ ] **Step 1: Add renderAnalysisLabList**

Find the last function in `app.js` before the `loadData()` call at the bottom. Add after it:

```javascript
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
                 onclick="toggleAnalysisLab(${JSON.stringify(lab.labName)})">
      <div class="analysis-lab-check">${selected ? '✓' : ''}</div>
      <span>${esc(lab.labName)}</span>
      <div class="analysis-status-dot" style="background:${dotColor}"></div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 2: Verify no JS errors**

Reload browser. Open Console. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add analysis lab list render and toggle functions"
```

---

## Task 6: Add renderAnalysisLabRow and snapshot HTML helpers

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add the snapshot HTML helper and renderAnalysisLabRow**

Add immediately after the functions added in Task 5:

```javascript
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

function renderAnalysisLabRow(lab) {
  const inputs  = analysisState.perLab[lab.labName];
  const view    = analysisState.view;
  const snap    = calcAnalysisSnapshot(lab, inputs, view);
  const unit    = analysisViewUnitLabel(view);
  const vLabel  = VIEW_LABEL[view] ?? 'Wk';
  const s       = VIEW_SCALE[view] ?? 1;
  const isIndy  = lab.stdHrsPerWeek == null;

  // Demand input: convert stored weekly value to current view units for display
  const demandDisplayVal = Math.round((inputs.demandDeltaHrsPerWk ?? 0) * s);

  // Auto saving pill
  const autoPill = snap.autoDelta > 0
    ? `<div class="analysis-auto-saving">saves ${fmt(snap.autoSaving * 100, 1)}% tech time &nbsp;(${snap.autoDelta}% × 30%)</div>`
    : `<div style="font-size:10px;color:#9ca3af;font-style:italic">No change — current equals target.</div>`;

  // Gain breakdown rows
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

  const labNameJson = JSON.stringify(lab.labName);

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
          ${autoPill}
        </div>
      </div>

      <!-- Snapshot -->
      <div class="analysis-snapshot">
        <div class="analysis-snapshot-title">Capacity Snapshot — ${vLabel}</div>
        ${indyNote}
        <div class="analysis-ba">
          <div class="analysis-ba-box" style="${analysisBaBoxStyle(snap.before.load)}">
            <div class="analysis-ba-label">Before</div>
            <div class="analysis-ba-load" style="color:${analysisLoadColor(snap.before.load)}">${fmt(snap.before.load, 0)}%</div>
            <div class="analysis-ba-metrics">
              <div class="analysis-ba-row"><span class="analysis-ba-key">Capacity</span><span class="analysis-ba-val">${fmtInt(snap.before.capacity)} hrs/${unit}</span></div>
              <div class="analysis-ba-row"><span class="analysis-ba-key">Demand</span><span class="analysis-ba-val">${fmtInt(snap.before.demand)} hrs/${unit}</span></div>
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
              <div class="analysis-ba-row"><span class="analysis-ba-key">Margin</span><span class="analysis-ba-val ${snap.after.margin >= 0 ? 'pos' : 'neg'}">${snap.after.margin >= 0 ? '+' : ''}${fmtInt(snap.after.margin)} hrs</span></div>
            </div>
          </div>
        </div>
        <div class="analysis-breakdown">
          <div class="analysis-breakdown-title">Where the change comes from</div>
          ${gainRows}
        </div>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 2: Verify no JS errors**

Reload browser. Console should show no errors.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add renderAnalysisLabRow and snapshot HTML helpers"
```

---

## Task 7: Add input handler functions and renderAnalysisRows

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add input handlers and renderAnalysisRows / renderAnalysisTab**

Add immediately after the functions from Task 6:

```javascript
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
  const rowEl = document.getElementById('analysis-row-' + labKey(labName));
  if (!rowEl) return;
  rowEl.outerHTML = renderAnalysisLabRow(lab);
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
```

- [ ] **Step 2: Verify no JS errors**

Reload browser. Console should be clean.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add analysis input handlers, renderAnalysisRows, renderAnalysisTab"
```

---

## Task 8: End-to-end browser verification

No code changes — this task is verification only.

- [ ] **Step 1: Full smoke test**

With the server running (`~/.nvm/versions/node/v20.20.0/bin/node server.js`), open http://localhost:3000 and verify:

1. Three nav tabs visible: Status Board, Scenario Planner, Analysis
2. Status Board tab: table renders correctly, week nav works, filters work
3. Scenario Planner tab: scenario controls render correctly
4. Analysis tab:
   - Lab list appears with all labs, status dots
   - Search filters the list
   - Clicking a lab adds a row on the right
   - Clicking again removes it
   - Before values match Status Board for the same lab at Weekly view
   - Adjusting headcount slider updates the number input and recalculates snapshot
   - Typing in number input updates the slider and recalculates snapshot
   - OT, productivity, demand sliders and inputs all sync and recalculate
   - Automation: changing Current % alone does NOT change the After values
   - Automation: changing Target % DOES change After values and shows savings pill
   - Automation: if Target ≤ Current, no savings pill shown, breakdown row says "unchanged"
   - View toggle: switching to Monthly scales all values by 4.33, Weekly restores originals
   - View toggle: demand change label updates to "hrs/mo" etc.
   - Dismiss × button removes the row
   - Adding 3+ labs and scrolling works

- [ ] **Step 2: Verify no regressions on existing tabs**

- Status Board sort, filter, week nav all still work
- Lab modal opens on row click and shows chart
- Scenario Planner saves/loads scenarios

- [ ] **Step 3: Commit final verification note**

```bash
git commit --allow-empty -m "chore: analysis tab verified end-to-end"
```

---

## Task 9: Push branch

- [ ] **Step 1: Push to remote**

```bash
git push -u origin feature/analysis-tab
```

Expected: branch appears on GitHub at `laugostini20-byte/CapacityAnalysis`
