# CapacityIQ Redesign — Design Spec

**Date:** 2026-04-03
**Author:** Louis (Sr. Director of Operations context)
**Status:** Approved for implementation

---

## 1. Overview

CapacityIQ is a capacity and demand management tool for a multi-site calibration lab operation. It replaces an incrementally-built tool that mixed historical data with scenario projections in confusing ways. The redesign starts from a single primary question: **which labs need attention right now?**

### Primary User

Sr. Director of Operations, overseeing ~25 labs. Uses the tool to:
- Understand current headcount and capacity at each lab
- Determine whether labs can absorb new work (and how much)
- Plan staffing decisions (hiring, onsite schedule changes)
- Model hypothetical scenarios ("what if we take this job split across Charlotte and Dallas?")
- Understand overtime exposure across the network

### What the tool does NOT cover

- On-time delivery % (an outcome, not an input)
- Full cost modeling or billing rates
- Equipment or facility constraints

---

## 2. Data Sources

| Source | Frequency | Content |
|---|---|---|
| Standard hours upload | Weekly (Monday) | Current std hrs/week per lab — the single source of truth for demand |
| Headcount upload | As-needed | Techs per lab (total and onsite) |
| Onsite schedule | As-needed | Days/week onsite per lab |
| Historical snapshots | Daily since Mar 2025 | Std hrs per lab per day — used for trend analysis only |

**Key rule:** The Scenario Planner always projects from the current week's base std hours. Historical data is only used in the Status Board for trend indicators. Historical data never influences scenario calculations.

**Upload date:** The "Week of [date]" shown in the nav bar reflects the effective date embedded in the std hours upload file (e.g. a column or filename date). If no date is embedded, it falls back to the upload timestamp. The date represents the week the std hours snapshot was taken, not the upload date.

---

## 3. Core Concepts

### Capacity

```
Capacity (hrs/week) = available techs × productivity hrs/day × days/week onsite
```

- Default productivity: **70%** of an 8-hr shift = **5.6 hrs/day**
- Productivity is editable per lab (whole-number %, clamped to 1–100%)
- "Available techs" = onsite techs (not total headcount)

### Demand

```
Demand (hrs/week) = current base std hours (from latest weekly upload)
```

Scales to other views by multiplying by the appropriate week count:
- Monthly: × 4.33 weeks
- Quarterly: × 13 weeks
- Yearly: × 52 weeks

### Margin

**Status Board (raw):**
```
Margin = Capacity − Demand
```
Uses raw regular capacity (no OT). Positive = headroom. Negative = overloaded.

**Scenario Planner result rows:**
```
Margin = Effective Capacity − Demand   (Effective Capacity = Capacity + OT Authorized)
```
Uses OT-boosted capacity to show net headroom after authorized overtime is applied.

### Load %

**Status Board (baseline only):**
```
Load % = Demand ÷ Capacity × 100
```
Uses raw regular capacity. No OT adjustment.

**Scenario Planner result rows:**
```
Load % = Demand ÷ Effective Capacity × 100
Effective Capacity = Capacity + OT Authorized
```
Uses OT-boosted capacity so the result row reflects what happens when authorized OT is applied.

The status thresholds (OVER / AT RISK / HEALTHY) in the Scenario Planner are evaluated against the OT-boosted Load %.

### OT Hours

```
OT Hours = max(0, Demand − Capacity)
```

Always uses **regular capacity** (no OT), both on the Status Board and in Scenario Planner result rows. This shows the raw hours of demand that exceed regular capacity — how much OT would actually be needed. A tooltip on the OT Hrs column header explains: "Hours exceeding regular capacity, before OT authorization. A lab can show 0 OT Hrs in Load % terms while still showing OT Hrs here if OT has been authorized to cover the gap."

### Status Thresholds

Applied to Load % in both views (Status Board uses raw Load %, Scenario result rows use OT-boosted Load %):

| Status | Load % |
|---|---|
| OVER | > 100% |
| AT RISK | 80–100% |
| HEALTHY | < 80% |

---

## 4. Application Structure

Two top-level views accessible via a persistent nav bar:

1. **Status Board** — current state of all labs
2. **Scenario Planner** — what-if modeling

Clicking any lab row on the Status Board opens the **Lab Detail Modal** (see Section 6).

App name: **CapacityIQ**. Light theme. Clean, modern, functional (no excessive color).

---

## 5. Status Board

### Purpose

Answer at a glance: which labs are over capacity, at risk, or healthy this week?

### Columns

| Column | Description |
|---|---|
| Lab | Lab name |
| Status | Color-coded badge: OVER / AT RISK / HEALTHY |
| Techs | Total headcount |
| Avail | Onsite techs (drives capacity) |
| Productivity % | Editable inline, default 70%, clamped 1–100%. Changes are **persisted immediately** to the DB (not session-only). |
| Demand | Current std hrs/week |
| Capacity | avail × (productivity% × 8 hrs) × days/week |
| Margin | Capacity − Demand |
| Load % | Demand ÷ Capacity × 100 (raw, no OT) |
| OT Hrs | max(0, Demand − Capacity) |
| Trend | Rising / Flat / Falling — see Trend Indicator below |

### Filters

- Status (OVER / AT RISK / HEALTHY) — multi-select
- Lab group (regional groupings from the current tool; exact group names to be confirmed at implementation time from the existing DB)
- Search by lab name (free text, client-side)

### View Toggle

Weekly / Monthly / Quarterly / Yearly. Demand and capacity figures scale with the selected view. All views project from the current base std hours.

### Trend Indicator

Computed from the daily snapshot history (Mar 2025–present). For each lab:

1. Calculate the average std hrs/day over the **most recent 7 days**.
2. Calculate the average std hrs/day over the **7 days ending 30 days ago** (i.e., days 30–23 ago).
3. Compute the percentage change between those two averages.

| Change | Trend label |
|---|---|
| > +5% | ↑ Rising |
| < −5% | ↓ Falling |
| −5% to +5% | → Flat |

If fewer than 7 days of snapshots exist in either window, the trend shows "—" (insufficient data).

### Assumptions Panel

Collapsed by default, expandable. Shows:
- Shift: 8 hrs
- Default productivity: 70% (5.6 hrs/day)
- Weeks/month: 4.33 · Weeks/quarter: 13 · Weeks/year: 52

When any lab has a per-lab productivity override, the panel shows a note: "X labs have custom productivity settings — see Productivity % column."

---

## 6. Lab Detail Modal

### Trigger

Clicking any lab row on the Status Board opens a modal overlay for that lab. Dismissible via close button or clicking outside.

### Purpose

Show how that lab's demand (std hours) has moved over time, and how this fiscal year compares to last fiscal year at the same point in the calendar.

### Chart — Year-over-Year Demand

A line chart with two series on the same axes:

- **X-axis:** Fiscal year months, Apr → Mar (12 points)
- **Y-axis:** Standard hours (weekly average)
- **Line 1 — Last FY (e.g. FY 2024–25):** Plotted from monthly end-of-month snapshot values. 12 data points shown as dots connected by a line. This is the coarser data source (monthly snapshots were all that existed before Mar 2025).
- **Line 2 — This FY (e.g. FY 2025–26):** Plotted from daily snapshots aggregated to weekly averages. Finer resolution. Stops at the current week — future months are blank (no projection).
- **Capacity reference line:** A flat horizontal line showing current regular capacity (hrs/week) for the lab. Lets the user immediately see when demand crossed or approached capacity.
- **"Today" marker:** A vertical dashed line at the current week's position on the x-axis.

### Data Sources by Series

| Series | Source | Granularity |
|---|---|---|
| Last FY | `lab_snapshots` monthly end-of-month rows | 1 point/month |
| This FY | `lab_snapshots` daily rows aggregated to weekly avg | 1 point/week |
| Capacity line | Current `labs` table (avail × productivity × days) | Static flat line |

If a lab has no snapshot data for last FY (e.g. it was added recently), that line is omitted and a note is shown: "No prior-year data available."

### Summary Stats (below the chart)

Three quick-read numbers shown beneath the chart:

| Stat | Definition |
|---|---|
| This FY avg | Average weekly std hrs this fiscal year to date |
| Last FY avg | Average weekly std hrs across all of last fiscal year |
| YoY change | (This FY avg − Last FY avg) ÷ Last FY avg × 100, shown as +/−% |

### Header

Modal header shows: lab name · current status badge · current Load % · current OT Hrs.

---

## 7. Scenario Planner

### Purpose

Model hypothetical changes — new work, hiring, schedule changes — across one or more labs simultaneously, with independent per-lab inputs.

### Layout

Two-panel layout:

- **Left panel (240px):** Scenario config + global defaults
- **Right panel:** Impact summary cards + view toggle + results table

### Left Panel — Scenario Config

- Scenario name (text input)
- Save / Load saved scenarios / Reset buttons
- Labs in scope (multi-select, shown as removable tags)
- **Global defaults** (apply to all labs unless overridden per lab):
  - OT hours authorized (stepper, hrs/week, default 0; scales with view toggle at render time — e.g. Monthly shows OT hrs/week × 4.33)
  - Productivity adjustment (stepper, percentage points, default 0; result is clamped to 1–100% when combined with each lab's base productivity)
  - Onsite techs change (stepper, count, default 0; applies to all selected labs)
  - Days/week change (stepper, default 0; adjusts onsite days for all selected labs)

### Right Panel — Impact Summary Cards

One card per selected lab. Shows:
- Lab name
- Status before → after (color-coded badges, status is OT-boosted in the "after" state)
- Load % before → after
- OT hours needed before → after

### Right Panel — View Toggle

Weekly / Monthly / Quarterly / Yearly. The demand delta entered per lab is converted to weekly and then scaled by the selected view. The unit selector on the demand input (weekly/monthly/annual) auto-converts for the user.

### Right Panel — Results Table

Columns: **Lab · Techs · Avail · Demand · Capacity · Margin · Load % · OT Hrs**

For each selected lab, three rows are shown in a single bordered block:

1. **Baseline row** — current state. Shows current total techs, current onsite (Avail), current demand, current capacity (raw), current margin, raw Load %, and raw OT Hrs.

2. **Per-lab input row** — adjustment controls:
   - Demand delta (stepper + unit selector: weekly/monthly/annual) with auto-display of weekly equivalent (e.g. "+3,000 annual hrs ≈ +58/wk")
   - Hire techs (stepper; hired techs are assumed to be onsite and are added to the Avail count in the scenario row)
   - Days/week change (stepper; shows "global" when using the global default; adjusting away from 0 overrides it for this lab; returning the stepper to 0 reverts to the global value)
   - Productivity adjustment (stepper, percentage points; shows "global" when using the global default; overrides the global productivity adjustment for this lab only — does not change the lab's persisted base productivity, which is managed via the Status Board)
   - OT override (stepper; shows "global" when using the global default; adjusting away from the global value overrides it for this lab; manually matching the global value reverts the label to "global")

3. **Scenario result row** — projected state after applying all adjustments:
   - **Techs:** current total + hired techs
   - **Avail:** current onsite + hired techs (hired techs assumed onsite by default)
   - **Demand:** (base std hrs + weekly demand delta) × view scale factor
   - **Capacity:** scenario avail × scenario productivity hrs/day × scenario days/week
   - **Margin:** Effective Capacity − Demand (using OT-boosted capacity)
   - **Load %:** Demand ÷ Effective Capacity × 100
   - **OT Hrs:** max(0, Demand − regular Capacity) (raw, no OT boost)
   - Sub-label shows applied assumptions (e.g. "+2 techs · +3,000 annual hrs · 40 OT hrs (global)")

### Scenario Calculation Rules

```
weekly_demand_delta   = input ÷ 52 (annual) | input ÷ 4.33 (monthly) | input (weekly)
scenario_demand       = (base_std_hrs + weekly_demand_delta) × view_scale_factor
scenario_avail        = current_onsite + hired_techs
days_change           = per_lab_days_change if overridden, else global_days_change
scenario_days         = current_days + days_change
prod_adjustment       = per_lab_prod_adjustment if overridden, else global_prod_adjustment
scenario_prod_pct     = clamp(lab_productivity_pct + prod_adjustment, 1, 100)
scenario_prod_hrs     = 8 × (scenario_prod_pct / 100)
scenario_capacity     = scenario_avail × scenario_prod_hrs × scenario_days
ot_weekly             = per_lab_ot_override if overridden, else global_ot_authorized
ot_for_view           = ot_weekly × view_scale_factor   ← OT scales with view toggle
effective_capacity    = scenario_capacity + ot_for_view
load_pct              = scenario_demand ÷ effective_capacity × 100
ot_hrs                = max(0, scenario_demand − scenario_capacity)  ← raw, no OT boost
margin                = effective_capacity − scenario_demand
```

Historical data is never used in scenario calculations.

### Saved Scenarios

Scenarios store **inputs only** (per-lab demand deltas, hired techs, days changes, OT overrides, global defaults, lab selection, scenario name). They do not snapshot baseline values.

When a saved scenario is reloaded, it recalculates against the **current** baseline data. This means a scenario saved months ago will show updated results if std hours have been re-uploaded since. Labs that were in the saved scenario but no longer exist in the current data are flagged with a warning badge: "Lab not found in current data."

---

## 8. Data Upload Flow

Three upload types, each as CSV or Excel:

### 1. Std Hours (weekly)
- Required columns: `lab_name`, `std_hrs_per_week`
- Optional: `effective_date` column or filename date (YYYY-MM-DD); used for the nav "Week of" display
- **Partial uploads:** If a lab present in the DB is missing from the upload file, its std hours are left unchanged and a warning is shown: "X labs not found in upload — their demand values were not updated."
- **Validation:** Reject rows with missing `lab_name`, non-numeric `std_hrs_per_week`, or negative values. Zero is a valid value (a lab with no active work). Show a preview of valid rows before committing.

### 2. Headcount
- Required columns: `lab_name`, `total_techs`, `onsite_techs`
- `onsite_techs` must be ≤ `total_techs`; rows violating this are rejected
- Same partial-upload behavior as Std Hours

### 3. Onsite Schedule
- Required columns: `lab_name`, `days_per_week`
- `days_per_week` must be between 1 and 7
- Same partial-upload behavior as Std Hours

All uploads preview before commit. The preview shows: valid rows (count), rejected rows (with reason), and unchanged labs (count).

---

## 9. Technical Architecture

### Stack (retained from current tool)

- **Frontend:** Vanilla JavaScript, single HTML page
- **Backend:** Node.js / Express
- **Database:** PostgreSQL

### Key Data Model

- `labs` table: lab_id, lab_name, group, total_techs, onsite_techs, days_per_week, productivity_pct
- `lab_demand` table: lab_id, effective_date, std_hrs_per_week, is_current (boolean). Only one row per lab has `is_current = true` at any time. On upload, the previous row is set to `is_current = false` (archived, not deleted) and a new row is inserted.
- `lab_snapshots` table: lab_id, snapshot_date, std_hrs (daily history since Mar 2025 — read-only for trend)
- `scenarios` table: scenario_id, name, created_at, inputs_json (stores per-lab inputs + global defaults as JSON)

### Separation of Concerns (lessons from current tool)

- Current demand baseline (`lab_demand`) is stored separately from historical snapshots (`lab_snapshots`)
- Scenario calculations are performed entirely client-side from the current baseline — no historical data involved
- View scaling (weekly → monthly → quarterly → yearly) is a pure multiplier applied at render time, not stored
- Load % and status are always computed at render time, never stored

---

## 10. Out of Scope

- Cost modeling (OT cost, labor cost, billing)
- On-time delivery tracking or targets
- Equipment capacity
- Multi-user authentication / role-based access
- Mobile layout (desktop-only tool)
