# Analysis Tab — Design Spec
**Date:** 2026-04-06
**Status:** Approved for implementation

---

## Overview

A new third tab ("Analysis") added to CapacityIQ alongside Status Board and Scenario Planner. It is a per-lab, interactive what-if scratch pad that lets users adjust capacity and demand variables for 1–N individual labs and instantly see the impact as a before/after snapshot. No saving or exporting — purely exploratory.

---

## Layout

### Top-level structure
- **View toggle bar** — sticky below the nav, spans full width. Buttons: Weekly (default) | Monthly | Quarterly | Annually. All capacity and demand figures in every snapshot scale with the selected period using `VIEW_SCALE` (same multipliers used throughout the rest of the app).
- **Two-column grid** — `210px` lab list panel (sticky) | flexible lab rows area.

### Lab list panel (left, sticky)
- Title: "Select Labs to Analyze"
- Search input to filter the list
- Scrollable list of all labs from `st.labList`, each showing:
  - Checkbox (checked = selected)
  - Lab name
  - Status dot (red = over 100%, amber = 80–100%, green = under 80%) derived from `baseMetrics(lab, analysisState.view).status`
- Clicking a lab adds/removes its row from the right panel
- **IndySoft labs are included in the list** but show a note in their snapshot ("No std hours data — demand shown as 0") since `stdHrsPerWeek` is null for all IndySoft labs. This mirrors the `(lab.stdHrsPerWeek ?? 0)` fallback used throughout the app.

### Lab rows (right, stacked)
- One row per selected lab, stacked vertically, scroll to see all
- Each row is a card with a header, controls side (left half), and snapshot side (right half)
- An empty-state prompt sits below all rows: "Select a lab from the list to begin"

---

## Lab Row — Header

- Lab name (large, bold)
- System badge (CalTrak / IndySoft)
- Dismiss (×) button — removes lab from selection and clears its state from `analysisState.perLab`

---

## Lab Row — Controls Side (left half)

Each control has a **slider** and a **type-in input** that stay in sync — editing either updates the other. All controls are independent per lab.

| Control | Range | Default | Notes |
|---|---|---|---|
| Headcount Change | −10 to +20 | 0 | Unit: techs. Display: `+3 techs`, `−2 techs`, `0`. Clamped so total available techs never goes below 0 (see calculation). |
| OT Hours / Week | 0 to 80 | 0 | Stored in weekly hrs. Scales with view toggle in the snapshot output. |
| Productivity % | 50% to 100% | Lab's current `productivityPct` from `st.labSettings` (default 70%) | Displayed as integer % |
| Demand Change | −500 to +500 | 0 | Stored in weekly hrs. Label updates with view: "hrs/wk", "hrs/mo", etc. Value displayed and entered in the current view's units. Converted to weekly for storage: `inputValue / VIEW_SCALE[view]`. |
| Automation Utilization | 0–100% each input | 0% / 0% | Two inputs, no slider. See Automation section below. |

**daysPerWeek is not editable** in Analysis mode — it uses the lab's current setting from `st.labSettings[labKey]?.daysPerWeek ?? 5`.

### Automation Utilization control

Two number inputs: **Current baseline** and **Target**.

- **Current baseline**: User-entered. Sets the reference point for where the lab is today in terms of automation utilization. Changing this value alone does not affect any calculation — it only establishes the reference.
- **Target**: The automation utilization % the lab is aiming for. This is the only active lever.
- **Impact formula**:
  ```
  delta = max(0, targetAutoPct - currentAutoPct)   // clamped: no savings if target ≤ current
  automationSavingFraction = (delta / 100) × 0.30   // 30% = fixed effectiveness rate:
                                                     // fully-automated work takes 30% less tech time
  ```
  The 30% rate is a fixed business assumption: automation is estimated to reduce tech time by 30% per standard hour for the work it handles.
- When `targetAutoPct <= currentAutoPct`: no savings pill shown; breakdown row says "Automation unchanged (target ≤ current)".
- **Validation**: both inputs clamped to 0–100. If current > target, delta clamps to 0 (no error thrown, UI just shows no savings).
- Visual treatment: Current baseline has dashed border + muted color (reference only). Target has indigo accent border (active lever).
- Helper note: "Current % sets the lab's starting point — it doesn't change the result. Only the gap between current and target drives capacity impact."
- Savings pill: `saves X.X% tech time  (Y% × 30%)`

---

## Lab Row — Snapshot Side (right half)

### Before / After boxes

**Before** box — real current values from `baseMetrics(lab, analysisState.view)`:
- Load %
- Capacity (hrs for selected view period)
- Demand (hrs for selected view period)
- Margin (Capacity − Demand)

Color: red border if over 100%, amber if 80–100%, green if under 80%.

**After** box — recalculated with all adjustments applied via `calcAnalysisSnapshot()`.

Color follows same thresholds.

Arrow between the boxes.

### Gain breakdown

A panel showing each variable's contribution to the change. Unchanged variables shown grayed as "—":

- Headcount → `+N cap hrs/[period]` (blue)
- OT → `+N cap hrs/[period]` (gold)
- Productivity → `+N cap hrs/[period]` (green)
- Automation → `−N demand hrs/[period]` (indigo, demand reduction)
- Demand change → `+N demand hrs/[period]` (red, or green if negative)

---

## Calculation Logic

Mirrors `baseMetrics` and `scenMetrics` in `app.js` exactly. Uses `onsiteFTE(labName, view)` to account for onsite-away techs, matching the rest of the app.

```js
function calcAnalysisSnapshot(lab, inputs, view) {
  const s = VIEW_SCALE[view];
  const hrsPerDayBefore = SHIFT_HRS * (lab.productivityPct / 100);
  const onsite = onsiteFTE(lab.labName, view);

  // ── BEFORE ──────────────────────────────────────────────────────────────
  const availBefore = Math.max(0, lab.totalTechs - onsite);
  const capacityBefore = availBefore * hrsPerDay * lab.daysPerWeek * s;
  const demandBefore = (lab.stdHrsPerWeek ?? 0) * s;
  const loadBefore = capacityBefore > 0
    ? (demandBefore / capacityBefore) * 100
    : (demandBefore > 0 ? Infinity : 0);

  // ── AFTER ───────────────────────────────────────────────────────────────
  const adjProdPct    = clamp(inputs.productivityPct, 1, 100);
  const hrsPerDayAfter = SHIFT_HRS * (adjProdPct / 100);
  const adjAvail      = Math.max(0, availBefore + inputs.headcountDelta);  // clamp ≥ 0
  const adjOT         = inputs.otHrsPerWk * s;
  const capacityAfter = (adjAvail * hrsPerDayAfter * lab.daysPerWeek * s) + adjOT;

  const demandDeltaWeekly = inputs.demandDeltaHrsPerWk;  // stored in weekly hrs
  const demandRaw  = demandBefore + (demandDeltaWeekly * s);
  const autoDelta  = Math.max(0, inputs.targetAutoPct - inputs.currentAutoPct);
  const autoSaving = (autoDelta / 100) * 0.30;
  const demandAfter = Math.max(0, demandRaw * (1 - autoSaving));

  const loadAfter = capacityAfter > 0
    ? (demandAfter / capacityAfter) * 100
    : (demandAfter > 0 ? Infinity : 0);

  // ── GAIN BREAKDOWN ──────────────────────────────────────────────────────
  const gainHeadcount  = (adjAvail - availBefore) * hrsPerDayAfter * lab.daysPerWeek * s;
  const gainOT         = adjOT;
  const gainProd       = availBefore * (hrsPerDayAfter - hrsPerDayBefore) * lab.daysPerWeek * s;
  const gainAuto       = -(demandBefore * autoSaving);       // negative = demand reduction
  const gainDemand     = demandDeltaWeekly * s;              // positive = demand increase

  return {
    before: { capacity: capacityBefore, demand: demandBefore, load: loadBefore,
              margin: capacityBefore - demandBefore },
    after:  { capacity: capacityAfter,  demand: demandAfter,  load: loadAfter,
              margin: capacityAfter - demandAfter },
    breakdown: { gainHeadcount, gainOT, gainProd, gainAuto, gainDemand },
  };
}
```

---

## State

```js
const analysisState = {
  view: 'weekly',
  selectedLabs: new Set(),    // Set of lab names
  perLab: {},                 // { labName: inputs } — see inputs shape below
};

// Default inputs shape (applied when a lab is first selected):
function defaultAnalysisInputs(lab) {
  return {
    headcountDelta:     0,
    otHrsPerWk:         0,
    productivityPct:    lab.productivityPct,   // lab's current setting
    demandDeltaHrsPerWk: 0,                    // stored weekly, converted from view units on input
    currentAutoPct:     0,
    targetAutoPct:      0,
  };
}
```

No reset button is provided — controls reset to defaults when a lab is dismissed and re-selected.

---

## Implementation Approach

### Files changed
- `index.html`: Add third nav tab button + `<div id="view-analysis" class="view-panel">` + inline CSS for Analysis-specific styles
- `app.js`: New functions only (prefixed `analysis`). Zero modifications to existing functions.

### Only existing-code touch point
`switchTab(tab)` — add one new case:
```js
case 'analysis':
  document.getElementById('view-analysis').classList.add('active');
  renderAnalysisTab();
  break;
```

### New functions in app.js

| Function | Purpose |
|---|---|
| `renderAnalysisTab()` | Rebuilds lab list + all selected lab rows |
| `renderAnalysisLabList()` | Renders left panel lab list from `st.labList` |
| `toggleAnalysisLab(labName)` | Adds/removes from `analysisState.selectedLabs`, triggers re-render |
| `renderAnalysisLabRow(lab)` | Returns HTML string for one lab row |
| `calcAnalysisSnapshot(lab, inputs, view)` | Pure function — returns before/after metrics |
| `updateAnalysisLabRow(labName)` | Called on any input change — recalculates + updates that row's snapshot only |
| `setAnalysisView(view)` | Updates `analysisState.view`, re-renders all rows |
| `defaultAnalysisInputs(lab)` | Returns fresh default inputs for a lab |

### Isolation guarantee
- All new HTML lives in `#view-analysis` — hidden (`display:none`) when not active via `.view-panel` CSS
- No existing functions are modified except `switchTab()` (one new case added)
- `analysisState` is a new top-level `const` — no overlap with `st` or `st.scen`
- No server-side changes required

---

## Out of Scope (this version)
- Saving or exporting analysis results
- Forecast / timeline view (snapshot only)
- Pre-populating current automation % from any data source
- Comparing multiple named configurations side by side
- Editing daysPerWeek per lab
