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

---

## 3. Core Concepts

### Capacity

```
Capacity (hrs/week) = available techs × productivity hrs/day × days/week onsite
```

- Default productivity: **70%** of an 8-hr shift = **5.6 hrs/day**
- Productivity is editable per lab
- "Available techs" = onsite techs (not total headcount)

### Demand

```
Demand (hrs/week) = current base std hours (from latest weekly upload)
```

- Scales to monthly/quarterly/yearly views by multiplying by the appropriate week count
- Monthly: × 4.33 weeks
- Quarterly: × 13 weeks
- Yearly: × 52 weeks

### Margin

```
Margin = Capacity − Demand
```

Positive = headroom. Negative = overloaded.

### Load %

```
Load % = Demand ÷ Capacity × 100
```

### OT Hours

```
OT Hours = max(0, Demand − Capacity)
```

Hours of demand that exceed regular capacity. OT authorized (a configurable value) can expand effective capacity in scenario modeling:

```
Effective Capacity = Capacity + OT Authorized
```

### Status Thresholds

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
| Productivity % | Editable inline, default 70% |
| Demand | Current std hrs/week |
| Capacity | Computed from avail × productivity × days |
| Margin | Capacity − Demand |
| Load % | Demand ÷ Capacity × 100 |
| OT Hrs | max(0, Demand − Capacity) |
| Trend | Rising / Flat / Falling based on 30-day daily snapshot history |

### Filters

- Status (OVER / AT RISK / HEALTHY)
- Region or lab group (same buckets as current tool)
- Search by lab name

### View Toggle

Weekly / Monthly / Quarterly / Yearly. Demand and capacity figures scale with the selected view. All views project from the current base std hours.

### Trend Indicator

Uses the daily snapshot history (Mar 2025–present) to show a 30-day rolling direction per lab. Displayed as a small arrow icon or label (↑ Rising, → Flat, ↓ Falling). Helps identify labs whose demand is growing even if they're currently healthy.

### Assumptions Panel

Visible on the page (collapsed by default): shows global assumptions — Shift: 8 hrs · Default productivity: 70% · Weeks/month: 4.33. Makes the math transparent.

---

## 6. Scenario Planner

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
  - OT hours authorized (stepper, hrs/week)
  - Productivity adjustment (stepper, %)
  - Onsite techs change (stepper, count)

### Right Panel — Impact Summary Cards

One card per selected lab. Shows:
- Lab name
- Status before → after (color-coded badges)
- Load % before → after
- OT hours needed before → after

### Right Panel — View Toggle

Weekly / Monthly / Quarterly / Yearly. The demand delta entered per lab is converted to weekly and then scaled by the selected view. The unit selector on the demand input (weekly/monthly/annual) auto-converts for the user.

### Right Panel — Results Table

Columns: **Lab · Techs · Avail · Demand · Capacity · Margin · Load % · OT Hrs**

For each selected lab, three rows are shown in a single bordered block:

1. **Baseline row** — current state, color-coded by status
2. **Per-lab input row** — adjustment controls:
   - Demand delta (stepper + unit selector: weekly/monthly/annual) with auto-display of weekly equivalent (e.g. "+3,000 annual hrs ≈ +58/wk")
   - Hire techs (stepper)
   - OT override (stepper; shows "global" when using the global default)
3. **Scenario result row** — projected state after applying adjustments, color-coded by resulting status. Sub-label shows the applied assumptions (e.g. "+2 techs · +3,000 annual hrs · 40 OT hrs (global)")

### Scenario Calculation Rules

- Demand in scenario = `(base std hrs + weekly demand delta) × view scale factor`
- Weekly demand delta = input value converted to weekly (annual ÷ 52, monthly ÷ 4.33)
- Capacity in scenario = `(avail techs + hired techs) × (productivity + productivity adjustment) × days/week`
- Effective capacity = scenario capacity + OT authorized (per-lab override or global default)
- Load % = demand ÷ effective capacity × 100
- OT Hrs = max(0, demand − scenario capacity) — uses regular capacity, not OT-boosted, to show raw gap
- Historical data is never used in scenario calculations

### Saved Scenarios

Scenarios can be named and saved. Saved scenarios can be reloaded from a dropdown. This allows the director to return to previously built scenarios (e.g. "Big job split — Q3") without re-entering inputs.

---

## 7. Data Upload Flow

Three upload types:
1. **Std hours** — weekly, replaces current demand baseline for all labs
2. **Headcount** — replaces techs count per lab
3. **Onsite schedule** — replaces days/week onsite per lab

Uploads are CSV or Excel. The app validates and previews before committing. After upload, the date shown in the nav ("Week of Apr 7, 2025") updates to reflect the new data date.

---

## 8. Technical Architecture

### Stack (retained from current tool)

- **Frontend:** Vanilla JavaScript, single HTML page
- **Backend:** Node.js / Express
- **Database:** PostgreSQL

### Key Data Model Changes

- `lab_snapshots` table: stores daily std hours per lab (already exists from Mar 2025)
- `scenarios` table: new — stores named scenarios with per-lab inputs as JSON
- `assumptions` table: global and per-lab productivity %, OT defaults

### Separation of Concerns (lessons from current tool)

- Demand baseline (current std hrs) is stored and retrieved separately from historical snapshots
- Scenario calculations are performed entirely client-side from the current baseline — no historical data involved
- View scaling (weekly → monthly → quarterly → yearly) is a pure multiplier applied at render time, not stored

---

## 9. Out of Scope

- Cost modeling (OT cost, labor cost, billing)
- On-time delivery tracking or targets
- Equipment capacity
- Multi-user authentication / role-based access
- Mobile layout (desktop-only tool)
