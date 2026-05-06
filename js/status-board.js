'use strict';

// ─── STATUS BOARD UI ────────────────────────────────────────────────────────
// Status Board tab rendering, filters, lab picker, week nav, header tooltips.

let labPickerInitialized = false;
let labPickerSearchTerm = '';
let scenLabPickerSearchTerm = '';
let headerHelpTipEl = null;

// ─── UTILS (DOM-bound) ───────────────────────────────────────────────────────
// Pure utilities (labKey, esc, fmt, clamp, scale, isIndySoft, etc.) live in
// js/utils.js. This section keeps only utilities that touch DOM/browser state.

function ensureHeaderHelpTip() {
  if (headerHelpTipEl) return headerHelpTipEl;
  const el = document.createElement('div');
  el.className = 'header-help-tip';
  document.body.appendChild(el);
  headerHelpTipEl = el;
  return el;
}

function hideHeaderHelpTip() {
  if (!headerHelpTipEl) return;
  headerHelpTipEl.classList.remove('show');
}

function showHeaderHelpTip(text, x, y) {
  if (!text) return hideHeaderHelpTip();
  const tip = ensureHeaderHelpTip();
  tip.textContent = text;
  tip.classList.add('show');
  const pad = 12;
  const rect = tip.getBoundingClientRect();
  let left = x + 14;
  let top = y + 14;
  if (left + rect.width > window.innerWidth - pad) left = x - rect.width - 14;
  if (top + rect.height > window.innerHeight - pad) top = y - rect.height - 14;
  tip.style.left = `${Math.max(pad, left)}px`;
  tip.style.top = `${Math.max(pad, top)}px`;
}

function initHeaderTooltips() {
  const table = document.getElementById('status-table');
  if (!table) return;
  table.querySelectorAll('thead th').forEach(th => {
    const text = th.getAttribute('data-help') || th.getAttribute('title') || '';
    if (!text) return;
    th.dataset.help = text;
    th.classList.add('has-help');
    th.removeAttribute('title');
  });

  table.addEventListener('mousemove', (e) => {
    const th = e.target.closest('thead th.has-help');
    if (!th) return hideHeaderHelpTip();
    showHeaderHelpTip(th.dataset.help || '', e.clientX, e.clientY);
  });
  table.addEventListener('mouseleave', hideHeaderHelpTip);
  window.addEventListener('scroll', hideHeaderHelpTip, {passive: true});
}

function setView(v) {
  st.view = v;
  setSegActive('seg-view', v, { weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' });
  updateTableHeaders();
  renderStatusBoard();
}

function setFilter(key, val) {
  st.filters[key] = val.toLowerCase ? val.toLowerCase() : val;
  if (key === 'system') setSegActive('seg-system', val, { all:'All', caltrak:'CalTrak', indysoft:'IndySoft' });
  if (key === 'status') setSegActive('seg-status', val, { all:'All', over:'OVER', risk:'AT RISK', ok:'HEALTHY' });
  renderStatusBoard();
}

function getAvailableLabNames() {
  return [...new Set(st.labList.map(l => l.labName))].sort((a, b) => a.localeCompare(b));
}

function updateLabPickerSummary(availableLabNames = getAvailableLabNames()) {
  const summaryEl = document.getElementById('lab-picker-summary');
  if (!summaryEl) return;
  const selectedCount = st.filters.selectedLabs.size;
  const totalCount = availableLabNames.length;
  if (!totalCount) {
    summaryEl.textContent = 'No labs available';
    return;
  }
  if (selectedCount === 0) {
    summaryEl.textContent = 'No labs selected';
    return;
  }
  if (selectedCount === totalCount) {
    summaryEl.textContent = 'All labs';
    return;
  }
  summaryEl.textContent = selectedCount === 1 ? '1 lab selected' : `${selectedCount} labs selected`;
}

function syncLabPickerSelection(availableLabNames) {
  const availableSet = new Set(availableLabNames);
  const filteredSelected = [...st.filters.selectedLabs].filter(name => availableSet.has(name));
  if (!labPickerInitialized) {
    st.filters.selectedLabs = new Set(availableLabNames);
    labPickerInitialized = true;
    return;
  }
  if (st.filters.selectedLabs.size > 0 && filteredSelected.length === 0 && availableLabNames.length) {
    st.filters.selectedLabs = new Set(availableLabNames);
    return;
  }
  st.filters.selectedLabs = new Set(filteredSelected);
}

function renderLabPickerOptions() {
  const menu = document.getElementById('lab-picker-menu');
  if (!menu) return;
  const availableLabNames = getAvailableLabNames();
  syncLabPickerSelection(availableLabNames);
  updateLabPickerSummary(availableLabNames);

  if (!availableLabNames.length) {
    labPickerSearchTerm = '';
    menu.innerHTML = '<div class="lab-picker-empty">No labs available for this view.</div>';
    return;
  }

  const optionsHtml = availableLabNames
    .map(name => `<label class="lab-picker-option" data-lab-key="${esc(labKey(name))}"><input type="checkbox" value="${esc(name)}" onchange="toggleLabSelection(this.value, this.checked)" ${st.filters.selectedLabs.has(name) ? 'checked' : ''}><span>${esc(name)}</span></label>`)
    .join('');

  menu.innerHTML = `
    <div class="lab-picker-actions">
      <button type="button" class="lab-picker-action" onclick="selectAllLabs(event)">Select all</button>
      <button type="button" class="lab-picker-action" onclick="deselectAllLabs(event)">Deselect all</button>
    </div>
    <div class="lab-picker-search-wrap">
      <input type="text" class="lab-picker-search" id="lab-picker-search" placeholder="Search labs..." value="${esc(labPickerSearchTerm)}" oninput="onLabPickerSearchInput(this.value)">
    </div>
    <div class="lab-picker-list" id="lab-picker-list">${optionsHtml}</div>
    <div class="lab-picker-empty" id="lab-picker-no-results" hidden>No labs match your search.</div>
  `;
  applyLabPickerSearch();
}

function toggleLabSelection(labName, isSelected) {
  if (isSelected) st.filters.selectedLabs.add(labName);
  else st.filters.selectedLabs.delete(labName);
  updateLabPickerSummary();
  renderStatusBoard();
}

function selectAllLabs(e) {
  if (e) e.stopPropagation();
  st.filters.selectedLabs = new Set(getAvailableLabNames());
  renderLabPickerOptions();
  renderStatusBoard();
}

function deselectAllLabs(e) {
  if (e) e.stopPropagation();
  st.filters.selectedLabs.clear();
  renderLabPickerOptions();
  renderStatusBoard();
}

function onLabPickerSearchInput(value) {
  labPickerSearchTerm = labKey(value || '');
  applyLabPickerSearch();
}

function applyLabPickerSearch() {
  const list = document.getElementById('lab-picker-list');
  if (!list) return;
  const noResultsEl = document.getElementById('lab-picker-no-results');
  const options = list.querySelectorAll('.lab-picker-option');
  let shownCount = 0;
  options.forEach(option => {
    const key = option.getAttribute('data-lab-key') || '';
    const isMatch = !labPickerSearchTerm || key.includes(labPickerSearchTerm);
    option.style.display = isMatch ? '' : 'none';
    if (isMatch) shownCount += 1;
  });
  if (noResultsEl) noResultsEl.style.display = shownCount === 0 ? 'block' : 'none';
}

function toggleLabPickerMenu(e) {
  if (e) e.stopPropagation();
  const picker = document.getElementById('lab-picker');
  const menu = document.getElementById('lab-picker-menu');
  if (!picker || !menu) return;
  const isHidden = menu.hasAttribute('hidden');
  if (isHidden) {
    menu.removeAttribute('hidden');
    picker.classList.add('open');
    const searchInput = document.getElementById('lab-picker-search');
    if (searchInput) searchInput.focus();
  } else {
    menu.setAttribute('hidden', '');
    picker.classList.remove('open');
  }
}

function closeLabPickerMenu() {
  const picker = document.getElementById('lab-picker');
  const menu = document.getElementById('lab-picker-menu');
  if (!picker || !menu) return;
  menu.setAttribute('hidden', '');
  picker.classList.remove('open');
}

function handleDocumentClickForLabPicker(e) {
  const picker = document.getElementById('lab-picker');
  if (picker && !picker.contains(e.target)) closeLabPickerMenu();

  const scenPicker = document.getElementById('scen-lab-search-shell');
  if (scenPicker && !scenPicker.contains(e.target)) closeScenLabPicker();
}

// ─── WEEK NAVIGATION ─────────────────────────────────────────────────────────
function shiftWeek(delta) {
  st.weekOffset += delta;
  updateWeekLabel();
  renderStatusBoard();
}

function resetWeek() {
  st.weekOffset = 0;
  updateWeekLabel();
  renderStatusBoard();
}

function updateWeekLabel() {
  const ref = referenceDate();
  const dow = ref.getDay() || 7;
  const mon = new Date(ref); mon.setDate(ref.getDate() - (dow - 1));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const fmt = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  const lbl = document.getElementById('week-label');
  if (lbl) lbl.textContent = `${fmt(mon)} – ${fmt(fri)}`;
  const todayBtn = document.getElementById('today-btn');
  if (todayBtn) todayBtn.style.display = st.weekOffset !== 0 ? 'inline-block' : 'none';
}

// ─── SUMMARY CARDS ───────────────────────────────────────────────────────────
function renderSummaryCards() {
  const all = st.labList;
  const counts = { over: 0, risk: 0, ok: 0 };
  let totalOnsiteTechDays = 0;
  all.forEach(lab => {
    const m = baseMetrics(lab, st.view);
    const s = m.status;
    totalOnsiteTechDays += onsiteTechDays(lab.labName, st.view);
    if (counts[s] !== undefined) counts[s]++;
  });
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('card-total', all.length);
  set('card-over',  counts.over);
  set('card-risk',  counts.risk);
  set('card-ok',    counts.ok);
  const totalOnsiteFTE = totalOnsiteTechDays / 5;
  set('card-onsite', fmt(totalOnsiteFTE, 1));
  const onsiteSub = document.getElementById('card-onsite-sub');
  if (onsiteSub) onsiteSub.textContent = `${fmtInt(totalOnsiteTechDays)} tech-days away · ${st.view}`;
}

function setSegActive(groupId, val, labelMap) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.seg-btn').forEach(btn => {
    const btnVal = Object.keys(labelMap).find(k => labelMap[k] === btn.textContent.trim()) ?? btn.textContent.trim().toLowerCase();
    btn.classList.toggle('active', btnVal === val || btn.textContent.trim() === val ||
      (val === 'all' && btn.textContent.trim() === 'All') ||
      (val === 'over' && btn.textContent.trim() === 'OVER') ||
      (val === 'risk' && btn.textContent.trim() === 'AT RISK') ||
      (val === 'ok' && btn.textContent.trim() === 'HEALTHY') ||
      (val === 'caltrak' && btn.textContent.trim() === 'CalTrak') ||
      (val === 'indysoft' && btn.textContent.trim() === 'IndySoft') ||
      (val === 'weekly' && btn.textContent.trim() === 'Weekly') ||
      (val === 'monthly' && btn.textContent.trim() === 'Monthly') ||
      (val === 'quarterly' && btn.textContent.trim() === 'Quarterly') ||
      (val === 'yearly' && btn.textContent.trim() === 'Yearly'));
  });
}

function updateTableHeaders() {
  const lbl = VIEW_LABEL[st.view] ?? '';
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('th-demand', lbl + ' Demand');
  set('th-hist',   'PY As-Of');
  set('th-capacity', lbl + ' Capacity');
  set('th-margin', lbl + ' Margin');
  set('th-ot', 'OT Hrs Needed');
}

function sortBy(key) {
  if (st.sortKey === key) st.sortDir *= -1;
  else { st.sortKey = key; st.sortDir = -1; }
  renderStatusBoard();
}

// ─── STATUS BOARD ────────────────────────────────────────────────────────────
function filteredLabs() {
  const { system, status } = st.filters;
  const selected = st.filters.selectedLabs;
  return st.labList.filter(lab => {
    if (system !== 'all' && lab.systemType !== system) return false;
    if (!selected.has(lab.labName)) return false;
    const m = baseMetrics(lab, st.view);
    if (status !== 'all' && m.status !== status) return false;
    return true;
  });
}

function sortedLabs(labs) {
  const key = st.sortKey;
  return [...labs].sort((a, b) => {
    const ma = baseMetrics(a, st.view);
    const mb = baseMetrics(b, st.view);
    let va, vb;
    switch (key) {
      case 'lab':      va = a.labName; vb = b.labName; break;
      case 'system':   va = a.systemType; vb = b.systemType; break;
      case 'status':   va = ma.loadPct; vb = mb.loadPct; break;
      case 'techs':    va = a.totalTechs; vb = b.totalTechs; break;
      case 'onsite':   va = ma.onsite; vb = mb.onsite; break;
      case 'avail':    va = baseMetrics(a, st.view).avail; vb = baseMetrics(b, st.view).avail; break;
      case 'prod':     va = a.productivityPct; vb = b.productivityPct; break;
      case 'demand':   va = ma.demand; vb = mb.demand; break;
      case 'capacity': va = ma.capacity; vb = mb.capacity; break;
      case 'margin':   va = ma.margin; vb = mb.margin; break;
      case 'load':     va = ma.loadPct; vb = mb.loadPct; break;
      case 'ot':       va = ma.otHrs; vb = mb.otHrs; break;
      case 'hist':     va = historicalAvg(a.labName, st.view) ?? -1; vb = historicalAvg(b.labName, st.view) ?? -1; break;
      default: va = 0; vb = 0;
    }
    if (typeof va === 'string') return st.sortDir * va.localeCompare(vb);
    return st.sortDir * ((vb ?? -Infinity) - (va ?? -Infinity));
  });
}

function renderStatusBoard() {
  buildLabList();
  updateWeekLabel();
  renderSummaryCards();
  renderLabPickerOptions();
  const labs = sortedLabs(filteredLabs());
  const tbody = document.getElementById('status-tbody');
  if (!labs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="13">No labs match the current filters.</td></tr>';
    return;
  }

  // Show prod override note if any lab has custom productivity
  const hasCustomProd = st.labList.some(l => {
    const s = st.labSettings[l.labKey];
    return s && s.productivityPct !== DEFAULT_PROD_PCT;
  });
  const note = document.getElementById('prod-override-note');
  if (note) note.hidden = !hasCustomProd;

  tbody.innerHTML = labs.map(lab => {
    const m = baseMetrics(lab, st.view);
    const sysType = lab.systemType;
    const lc = m.status;

    const loadClass = lc === 'over' ? 'load-over' : lc === 'risk' ? 'load-risk' : 'load-ok';
    const marginClass = m.margin >= 0 ? 'margin-pos' : 'margin-neg';
    const otClass = m.otHrs > 0 ? 'ot-pos' : 'ot-zero';

    return `<tr onclick="openModal('${esc(lab.labName)}')">
      <td class="td-lab">${esc(lab.labName)}</td>
      <td><span class="badge ${sysType === 'indysoft' ? 'badge-indysoft' : 'badge-caltrak'}">${sysType === 'indysoft' ? 'IndySoft' : 'CalTrak'}</span></td>
      <td><span class="badge ${statusBadgeClass(lc)}">${statusLabel(lc)}</span></td>
      <td class="td-num">${lab.totalTechs}</td>
      <td class="td-num">${fmt(m.onsite, 1)}</td>
      <td class="td-num">${fmt(m.avail, 1)}</td>
      <td class="td-num" onclick="event.stopPropagation()">
        <input class="prod-input" type="number" min="1" max="100"
          value="${lab.productivityPct}"
          onchange="saveProdPct('${esc(lab.labName)}','${esc(lab.labKey)}',this.value)"
          title="Edit productivity %">%
      </td>
      <td class="td-num">${fmtInt(m.demand)}</td>
      <td class="td-num" style="color:#a1a1aa">${fmtInt(historicalAvg(lab.labName, st.view))}</td>
      <td class="td-num">${fmtInt(m.capacity)}</td>
      <td class="td-num ${marginClass}">${fmtSgn(m.margin, 0)}</td>
      <td class="td-num ${loadClass}">${fmt(m.loadPct, 1)}%</td>
      <td class="td-num ${otClass}">${m.otHrs > 0 ? fmtInt(m.otHrs) : '—'}</td>
    </tr>`;
  }).join('');
}

async function saveProdPct(labName, key, rawVal) {
  const pct = Math.min(100, Math.max(1, Number(rawVal) || DEFAULT_PROD_PCT));
  st.labSettings[key] = { ...(st.labSettings[key] ?? {}), productivityPct: pct, daysPerWeek: st.labSettings[key]?.daysPerWeek ?? 5 };
  buildLabList();
  renderStatusBoard();
  try {
    await apiFetch(`/api/lab-settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labRaw: labName, productivityPct: pct, daysPerWeek: st.labSettings[key]?.daysPerWeek ?? 5, systemType: systemType(labName, st.labSettings[key]) }),
    });
  } catch (e) { console.error('saveProdPct failed:', e); }
}

