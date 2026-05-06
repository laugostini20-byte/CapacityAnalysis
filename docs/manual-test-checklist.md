# Manual Test Checklist

Run before and after any non-trivial change (refactors, refactors disguised
as features, dependency bumps). If anything diverges between a "before" pass
and an "after" pass, treat the change as broken until proven otherwise.

## Page load
- [ ] App loads with no console errors (DevTools → Console)
- [ ] "Week of [date]" label in the nav shows the current data date
- [ ] Status Board tab is visible by default

## Status Board tab
- [ ] Summary cards show numbers (Total Labs, Over, At Risk, Healthy, Onsite)
- [ ] Lab table shows all expected labs with Demand / Capacity / Margin / Load%
- [ ] Click a column header — table re-sorts
- [ ] View toggle (Weekly / Monthly / Quarterly / Yearly) scales numbers correctly
- [ ] Status filter (All / Over / At Risk / Healthy) filters the table
- [ ] System filter (All / CalTrak / IndySoft) filters the table
- [ ] Lab picker — uncheck a few labs and the table updates
- [ ] Click a lab row — modal opens with chart and details
- [ ] Modal close (×) works
- [ ] Week navigation arrows (← →) shift; "Today" returns to current

## Scenario Planner tab
- [ ] Tab renders
- [ ] Add a lab, adjust OT or days — impact cards update
- [ ] Save a named scenario → reload page → load it back
- [ ] Reset clears the scenario inputs

## Analysis tab
- [ ] Tab renders
- [ ] Check a lab from the list — its row appears
- [ ] Sliders (Headcount / OT / Productivity / Demand) update the snapshot live
- [ ] Dismiss (×) removes the lab

## Uploads
- [ ] "Upload data" opens the modal
- [ ] Std Hours upload → preview matched/unmatched counts → save → numbers update
- [ ] Onsite schedule upload → preview → save → onsite values update
- [ ] Headcount upload → preview → save → tech counts update

## Lab settings (in modal)
- [ ] Edit productivity % → save → persists across reload
- [ ] Edit days/week → save → persists

## API / backend
- [ ] `GET /api/health` returns OK
- [ ] No 500s in DevTools → Network during normal use
