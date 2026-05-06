'use strict';

// ─── SCENARIO PLANNER ───────────────────────────────────────────────────────
// Scenario Planner tab: lab picker, per-lab inputs, results, save/load.

function createScenarioInputs(overrides = {}) {
  return {
    demandVal: 0,
    demandUnit: 'weekly',
    hireTechs: 0,
    otOverride: null,
    daysOverride: null,
    productivityPct: null,
    prodOverride: null, // legacy saved-scenario field
    ...overrides,
  };
}


function setScenView(v) {
  st.scen.view = v;
  const group = document.getElementById('seg-scen-view');
  if (group) {
    const labels = { weekly:'Weekly', monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' };
    group.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === labels[v]);
    });
  }
  renderScenarioResults();
}

function syncScenarioGlobalInputs() {
  const otInput = document.getElementById('global-ot-input');
  const daysInput = document.getElementById('global-days-input');
  if (otInput) otInput.value = st.scen.globalOt;
  if (daysInput) daysInput.value = st.scen.globalDaysDelta;
}

function setGlobalField(field, rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return;
  if (field === 'ot') {
    st.scen.globalOt = Math.max(0, Math.round(n));
  } else if (field === 'prod') {
    st.scen.globalProdAdj = clamp(Math.round(n), -50, 50);
  } else if (field === 'days') {
    st.scen.globalDaysDelta = clamp(Math.round(n), -4, 4);
  }
  syncScenarioGlobalInputs();
  refreshScenarioComputedOutputs();
}

function addScenLab(labName) {
  if (!labName) return;
  st.scen.selectedLabs.add(labName);
  if (!st.scen.perLab[labName]) {
    st.scen.perLab[labName] = createScenarioInputs();
  }
  scenLabPickerSearchTerm = '';
  const searchInput = document.getElementById('scen-lab-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  renderScenLabPicker();
  renderScenLabTags();
  renderScenarioResults();
}

function removeScenLab(labName) {
  st.scen.selectedLabs.delete(labName);
  renderScenLabPicker();
  renderScenLabTags();
  renderScenarioResults();
}

function renderScenLabTags() {
  const container = document.getElementById('scen-lab-tags');
  if (!container) return;
  container.innerHTML = [...st.scen.selectedLabs].map(name => {
    const encodedName = encodeURIComponent(name);
    return `<span class="lab-tag">${esc(name)}<span class="lab-tag-x" onclick="removeScenLab(decodeURIComponent('${encodedName}'))">×</span></span>`;
  }).join('');

  const title = document.getElementById('impact-cards-title');
  if (title) title.textContent = `Scenario impact · ${st.scen.selectedLabs.size} lab${st.scen.selectedLabs.size === 1 ? '' : 's'}`;
}

function availableScenLabNames() {
  return [...new Set(st.labList.map(l => l.labName))]
    .filter(name => !st.scen.selectedLabs.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function filteredScenLabNames() {
  const searchKey = labKey(scenLabPickerSearchTerm);
  return availableScenLabNames().filter(name => !searchKey || labKey(name).includes(searchKey));
}

function renderScenLabPicker() {
  const menu = document.getElementById('scen-lab-search-menu');
  const input = document.getElementById('scen-lab-search');
  if (!menu || !input) return;

  if (input.value !== scenLabPickerSearchTerm) input.value = scenLabPickerSearchTerm;

  const available = availableScenLabNames();
  const filtered = filteredScenLabNames();

  if (!available.length) {
    menu.innerHTML = '<div class="scen-lab-empty">All available labs are already in scope.</div>';
    return;
  }
  if (!filtered.length) {
    menu.innerHTML = '<div class="scen-lab-empty">No labs match your search.</div>';
    return;
  }

  menu.innerHTML = filtered
    .map(name => {
      const encodedName = encodeURIComponent(name);
      return `<button type="button" class="scen-lab-option" onclick="selectScenLab(decodeURIComponent('${encodedName}'))">${esc(name)}</button>`;
    })
    .join('');
}

function openScenLabPicker() {
  const menu = document.getElementById('scen-lab-search-menu');
  if (!menu) return;
  menu.removeAttribute('hidden');
  renderScenLabPicker();
}

function closeScenLabPicker() {
  const menu = document.getElementById('scen-lab-search-menu');
  if (!menu) return;
  menu.setAttribute('hidden', '');
}

function onScenLabSearchInput(value) {
  scenLabPickerSearchTerm = value || '';
  openScenLabPicker();
}

function handleScenLabSearchKeydown(e) {
  if (e.key === 'Escape') {
    closeScenLabPicker();
    return;
  }
  if (e.key !== 'Enter') return;
  const filtered = filteredScenLabNames();
  const exactMatch = filtered.find(name => labKey(name) === labKey(scenLabPickerSearchTerm));
  const choice = exactMatch || (filtered.length === 1 ? filtered[0] : null);
  if (!choice) return;
  e.preventDefault();
  selectScenLab(choice);
}

function selectScenLab(labName) {
  addScenLab(labName);
}

function renderScenarioPlanner() {
  renderScenLabPicker();
  syncScenarioGlobalInputs();
  renderScenLabTags();
  setScenView(st.scen.view);
  renderScenarioDropdown();
}

function renderScenarioDropdown() {
  const sel = document.getElementById('scen-profile-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Saved scenarios…</option>' +
    st.savedScenarios.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  sel.value = st.scen.id ?? '';
}

function getScenGlobal() {
  return { ot: st.scen.globalOt, prodAdj: st.scen.globalProdAdj, daysDelta: st.scen.globalDaysDelta };
}

function buildScenarioSubLabel(lab, inputs, global, scenProdPct = getScenarioProductivityPct(lab, inputs, global)) {
  const demVal = inputs.demandVal ?? 0;
  const demUnit = inputs.demandUnit ?? 'weekly';
  const hireTechs = inputs.hireTechs ?? 0;
  const otOverrideVal = inputs.otOverride;
  return [
    hireTechs !== 0 ? `${hireTechs > 0 ? '+' : ''}${hireTechs} techs` : null,
    scenProdPct !== lab.productivityPct ? `${fmtInt(scenProdPct)}% prod` : null,
    demVal !== 0 ? `${demVal > 0 ? '+' : ''}${demVal.toLocaleString()} ${demUnit} hrs demand` : null,
    `${otOverrideVal ?? global.ot} OT hrs/wk ${otOverrideVal == null ? '(global)' : '(override)'}`,
  ].filter(Boolean).join(' · ');
}

function updateScenarioRowBlock(lab) {
  const block = document.querySelector(`.scen-lab-block[data-scen-lab="${encodeURIComponent(lab.labName)}"]`);
  if (!block) return;

  const inputs = st.scen.perLab[lab.labName] ?? {};
  const g = getScenGlobal();
  const sv = st.scen.view;
  const s = scenMetrics(lab, inputs, g, sv);
  const rc = s.status;
  const weeklyEquiv = toWeeklyDelta(inputs.demandVal ?? 0, inputs.demandUnit ?? 'weekly');
  const subLabel = buildScenarioSubLabel(lab, inputs, g, s.scenProdPct) || 'No changes applied';
  const otOverrideVal = inputs.otOverride;

  const resultRow = block.querySelector('.row-result');
  if (resultRow) resultRow.className = `scen-row row-result s-${rc}`;

  const labelEl = block.querySelector('.scen-result-label');
  if (labelEl) labelEl.style.color = scenarioStatusColor(rc);
  const subLabelEl = block.querySelector('.scen-result-sublabel');
  if (subLabelEl) subLabelEl.textContent = subLabel;

  const setText = (selector, value) => {
    const el = block.querySelector(selector);
    if (el) el.textContent = value;
  };
  setText('.scen-result-techs', fmtInt(s.scenTechs));
  setText('.scen-result-avail', fmt(s.scenAvail, 1));
  setText('.scen-result-prod', `${fmtInt(s.scenProdPct)}%`);
  setText('.scen-result-demand', fmtInt(s.demand));
  setText('.scen-result-capacity', fmtInt(s.effectiveCap));
  setText('.scen-result-margin', fmtSgn(s.margin, 0));
  setText('.scen-result-load', `${fmt(s.loadPct, 1)}%`);
  setText('.scen-result-ot', s.otHrs > 0 ? fmtInt(s.otHrs) : '—');

  const marginEl = block.querySelector('.scen-result-margin');
  if (marginEl) marginEl.className = `scen-result-margin ${s.margin >= 0 ? 'margin-pos' : 'margin-neg'}`;
  const loadEl = block.querySelector('.scen-result-load');
  if (loadEl) loadEl.className = `scen-result-load load-${rc}`;
  const otEl = block.querySelector('.scen-result-ot');
  if (otEl) otEl.className = `scen-result-ot ${s.otHrs > 0 ? 'ot-pos' : 'ot-zero'}`;

  const otInput = block.querySelector('.scen-ot-input');
  if (otInput) otInput.placeholder = `Use global (${g.ot})`;
  const otHint = block.querySelector('.scen-ot-hint');
  if (otHint) otHint.textContent = otOverrideVal == null ? `Using global default: ${g.ot}` : 'Blank resets to global';
  const prodInput = block.querySelector('.scen-prod-input');
  if (prodInput && document.activeElement !== prodInput) prodInput.value = Math.round(s.scenProdPct);

  const equivEl = block.querySelector('.ri-equiv');
  if (equivEl) {
    if (Math.abs(weeklyEquiv) > 0.1) {
      equivEl.textContent = `≈ ${weeklyEquiv > 0 ? '+' : ''}${fmt(weeklyEquiv, 1)}/wk`;
      equivEl.hidden = false;
    } else {
      equivEl.textContent = '';
      equivEl.hidden = true;
    }
  }
}

function refreshScenarioComputedOutputs() {
  renderImpactCards();
  [...st.scen.selectedLabs]
    .map(name => st.labList.find(l => l.labName === name))
    .filter(Boolean)
    .forEach(updateScenarioRowBlock);
}

function renderScenarioResults() {
  renderImpactCards();
  renderScenRows();
}

function renderImpactCards() {
  const list = document.getElementById('impact-cards-list');
  if (!list) return;
  const labs = [...st.scen.selectedLabs].map(n => st.labList.find(l => l.labName === n)).filter(Boolean);
  if (!labs.length) {
    list.innerHTML = '<div style="color:#a1a1aa;font-size:12px;padding:4px 0">Add labs in scope to see the impact.</div>';
    return;
  }
  const g = getScenGlobal();
  const sv = st.scen.view;
  list.innerHTML = labs.map(lab => {
    const inputs = st.scen.perLab[lab.labName] ?? {};
    const before = baseMetrics(lab, sv);
    const after = scenMetrics(lab, inputs, g, sv);
    const otBefore = before.otHrs;
    const otAfter = after.otHrs;
    return `<div class="impact-card">
      <div class="impact-lab" title="${esc(lab.labName)}">${esc(lab.labName)}</div>
      <span class="badge ${statusBadgeClass(before.status)}">${statusLabel(before.status)} · ${fmt(before.loadPct,1)}%</span>
      <span class="impact-arrow">→</span>
      <span class="badge ${statusBadgeClass(after.status)}">${statusLabel(after.status)} · ${fmt(after.loadPct,1)}%</span>
      <div class="impact-ot">
        <div class="impact-ot-label">OT needed</div>
        <div class="impact-ot-val">${otBefore > 0 ? fmtInt(otBefore) : '—'} → ${otAfter > 0 ? fmtInt(otAfter) : '—'}</div>
      </div>
    </div>`;
  }).join('');
}

function renderScenRows() {
  const el = document.getElementById('scen-rows');
  if (!el) return;
  const labs = [...st.scen.selectedLabs].map(n => st.labList.find(l => l.labName === n)).filter(Boolean);
  if (!labs.length) {
    el.innerHTML = '<div style="padding:32px;text-align:center;color:#a1a1aa;font-size:12px">No labs selected.</div>';
    return;
  }
  const g = getScenGlobal();
  const sv = st.scen.view;
  el.innerHTML = labs.map(lab => {
    const inputs = st.scen.perLab[lab.labName] ?? {};
    const b = baseMetrics(lab, sv);
    const s = scenMetrics(lab, inputs, g, sv);
    const sc = b.status;
    const rc = s.status;
    const demVal = inputs.demandVal ?? 0;
    const demUnit = inputs.demandUnit ?? 'weekly';
    const weeklyEquiv = toWeeklyDelta(demVal, demUnit);
    const hireTechs = inputs.hireTechs ?? 0;

    const otOverrideVal = inputs.otOverride;
    const baselineProdPct = clamp(Math.round(lab.productivityPct), 1, 100);
    const scenProdPct = Math.round(s.scenProdPct);
    const labNameEsc = esc(lab.labName);
    const labNameShort = esc(lab.labName.length > 18 ? `${lab.labName.slice(0, 18)}…` : lab.labName);
    const encodedLabName = encodeURIComponent(lab.labName);
    const subLabel = buildScenarioSubLabel(lab, inputs, g, s.scenProdPct);

    return `<div class="scen-lab-block" data-scen-lab="${encodedLabName}">
      <div class="scen-row row-baseline s-${sc}">
        <div><div class="scen-row-label" style="font-weight:600">${labNameEsc}</div><div class="scen-row-sublabel">Baseline · current</div></div>
        <span>${fmtInt(lab.totalTechs)}</span><span>${fmt(b.avail, 1)}</span>
        <span class="scen-base-prod">${baselineProdPct}%</span>
        <span>${fmtInt(b.demand)}</span><span>${fmtInt(b.capacity)}</span>
        <span class="${b.margin >= 0 ? 'margin-pos' : 'margin-neg'}">${fmtSgn(b.margin,0)}</span>
        <span class="${'load-' + sc}">${fmt(b.loadPct,1)}%</span>
        <span class="${b.otHrs > 0 ? 'ot-pos' : 'ot-zero'}">${b.otHrs > 0 ? fmtInt(b.otHrs) : '—'}</span>
      </div>

      <div class="row-inputs">
        <div class="row-inputs-label">${labNameShort}</div>

        <label class="scen-field scen-field-hire">
          <span class="scen-field-label">Hire techs</span>
          <input class="scen-number-input" type="number" step="1" value="${hireTechs}" oninput="setPerLabNumber(decodeURIComponent('${encodedLabName}'),'hireTechs',this.value)" onkeydown="handleScenarioNumberKeydown(event)">
        </label>

        <label class="scen-field scen-field-prod">
          <span class="scen-field-label">Productivity</span>
          <input class="scen-number-input scen-prod-input" type="number" min="1" max="100" step="1" value="${scenProdPct}" oninput="setPerLabProductivity(decodeURIComponent('${encodedLabName}'),this.value)" onblur="syncPerLabProductivityInput(decodeURIComponent('${encodedLabName}'),this)" onkeydown="handleScenarioNumberKeydown(event)">
          <span class="scen-field-hint">Defaults to current: ${baselineProdPct}%</span>
        </label>

        <label class="scen-field scen-field-demand">
          <span class="scen-field-label">Demand delta</span>
          <div class="scen-field-inline">
            <input class="scen-number-input" type="number" step="1" value="${demVal}" oninput="setPerLabNumber(decodeURIComponent('${encodedLabName}'),'demandVal',this.value)" onkeydown="handleScenarioNumberKeydown(event)">
            <select class="ri-unit" onchange="setPerLabUnit(decodeURIComponent('${encodedLabName}'),this.value)">
            <option value="weekly" ${demUnit==='weekly'?'selected':''}>wk hrs</option>
            <option value="monthly" ${demUnit==='monthly'?'selected':''}>mo hrs</option>
            <option value="annual" ${demUnit==='annual'?'selected':''}>annual hrs</option>
          </select>
          </div>
          <span class="ri-equiv" ${Math.abs(weeklyEquiv) > 0.1 ? '' : 'hidden'}>${Math.abs(weeklyEquiv) > 0.1 ? `≈ ${weeklyEquiv > 0?'+':''}${fmt(weeklyEquiv,1)}/wk` : ''}</span>
        </label>

        <label class="scen-field scen-field-ot">
          <span class="scen-field-label">OT override</span>
          <input class="scen-number-input scen-ot-input" type="number" min="0" step="1" value="${otOverrideVal ?? ''}" placeholder="Use global (${g.ot})" oninput="setPerLabOt(decodeURIComponent('${encodedLabName}'),this.value)" onkeydown="handleScenarioNumberKeydown(event)">
          <span class="scen-field-hint scen-ot-hint">${otOverrideVal == null ? `Using global default: ${g.ot}` : 'Blank resets to global'}</span>
        </label>
      </div>

      <div class="scen-row row-result s-${rc}">
        <div>
          <div class="scen-row-label scen-result-label" style="font-size:11px;color:${scenarioStatusColor(rc)};font-weight:600">↳ With scenario</div>
          <div class="scen-row-sublabel scen-result-sublabel">${esc(subLabel) || 'No changes applied'}</div>
        </div>
        <span class="scen-result-techs" style="font-weight:600">${fmtInt(s.scenTechs)}</span>
        <span class="scen-result-avail" style="font-weight:600">${fmt(s.scenAvail,1)}</span>
        <span class="scen-result-prod" style="font-weight:600">${scenProdPct}%</span>
        <span class="scen-result-demand">${fmtInt(s.demand)}</span>
        <span class="scen-result-capacity">${fmtInt(s.effectiveCap)}</span>
        <span class="scen-result-margin ${s.margin >= 0 ? 'margin-pos' : 'margin-neg'}">${fmtSgn(s.margin,0)}</span>
        <span class="scen-result-load ${'load-' + rc}">${fmt(s.loadPct,1)}%</span>
        <span class="scen-result-ot ${s.otHrs > 0 ? 'ot-pos' : 'ot-zero'}">${s.otHrs > 0 ? fmtInt(s.otHrs) : '—'}</span>
      </div>
    </div>`;
  }).join('');
}

function getOrInitPerLab(labName) {
  if (!st.scen.perLab[labName]) {
    st.scen.perLab[labName] = createScenarioInputs();
  }
  return st.scen.perLab[labName];
}

function handleScenarioNumberKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.target.blur();
}

function setPerLabNumber(labName, field, rawValue) {
  const p = getOrInitPerLab(labName);
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return;
  p[field] = Math.round(n);
  refreshScenarioComputedOutputs();
}

function setPerLabUnit(labName, unit) {
  const p = getOrInitPerLab(labName);
  p.demandUnit = unit;
  refreshScenarioComputedOutputs();
}

function setPerLabOt(labName, rawValue) {
  const p = getOrInitPerLab(labName);
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    p.otOverride = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    p.otOverride = Math.max(0, Math.round(n));
  }
  refreshScenarioComputedOutputs();
}

function setPerLabProductivity(labName, rawValue) {
  const p = getOrInitPerLab(labName);
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    p.productivityPct = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    p.productivityPct = clamp(Math.round(n), 1, 100);
  }
  refreshScenarioComputedOutputs();
}

function syncPerLabProductivityInput(labName, inputEl) {
  const lab = st.labList.find(item => item.labName === labName);
  if (!lab || !inputEl) return;
  const inputs = getOrInitPerLab(labName);
  inputEl.value = Math.round(getScenarioProductivityPct(lab, inputs, getScenGlobal()));
}

async function saveCurrentScenario() {
  const name = (document.getElementById('scen-name')?.value || '').trim() || 'Untitled';
  const config = {
    v: 2,
    selectedLabs: [...st.scen.selectedLabs],
    globalOt: st.scen.globalOt,
    globalProdAdj: st.scen.globalProdAdj,
    globalDaysDelta: st.scen.globalDaysDelta,
    perLab: st.scen.perLab,
    scenView: st.scen.view,
  };
  try {
    const body = { name, config, ...(st.scen.id ? { id: st.scen.id } : {}) };
    const res = await apiFetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    st.scen.id = res.scenario.id;
    const existing = st.savedScenarios.findIndex(s => s.id === res.scenario.id);
    if (existing >= 0) st.savedScenarios[existing] = res.scenario;
    else st.savedScenarios.unshift(res.scenario);
    renderScenarioDropdown();
    if (document.getElementById('scen-profile-select')) {
      document.getElementById('scen-profile-select').value = st.scen.id;
    }
  } catch (e) { alert('Save failed: ' + e.message); }
}

function loadSavedScenario(id) {
  if (!id) return;
  const profile = st.savedScenarios.find(s => String(s.id) === String(id));
  if (!profile) return;
  const c = profile.config ?? {};
  st.scen.id = profile.id;
  st.scen.name = profile.name;
  st.scen.selectedLabs = new Set(Array.isArray(c.selectedLabs) ? c.selectedLabs : []);
  st.scen.globalOt = c.globalOt ?? 0;
  st.scen.globalProdAdj = c.globalProdAdj ?? 0;
  st.scen.globalDaysDelta = c.globalDaysDelta ?? 0;
  st.scen.perLab = c.perLab ?? {};
  st.scen.view = c.scenView ?? 'weekly';
  const legacyGlobal = { ot: st.scen.globalOt, prodAdj: st.scen.globalProdAdj, daysDelta: st.scen.globalDaysDelta };
  st.scen.selectedLabs.forEach(labName => {
    const existing = createScenarioInputs(st.scen.perLab[labName]);
    const lab = st.labList.find(item => item.labName === labName);
    if (lab && existing.productivityPct == null && (existing.prodOverride != null || Number(legacyGlobal.prodAdj) !== 0)) {
      existing.productivityPct = getScenarioProductivityPct(lab, existing, legacyGlobal);
    }
    existing.prodOverride = null;
    st.scen.perLab[labName] = existing;
  });
  st.scen.globalProdAdj = 0;
  if (document.getElementById('scen-name')) document.getElementById('scen-name').value = st.scen.name;
  syncScenarioGlobalInputs();
  renderScenLabPicker();
  setScenView(st.scen.view);
  renderScenLabTags();
  renderScenarioResults();
}

function resetScenario() {
  st.scen = { view: 'weekly', id: null, name: '', selectedLabs: new Set(), globalOt: 0, globalProdAdj: 0, globalDaysDelta: 0, perLab: {} };
  if (document.getElementById('scen-name')) document.getElementById('scen-name').value = '';
  if (document.getElementById('scen-profile-select')) document.getElementById('scen-profile-select').value = '';
  scenLabPickerSearchTerm = '';
  const searchInput = document.getElementById('scen-lab-search');
  if (searchInput) searchInput.value = '';
  syncScenarioGlobalInputs();
  renderScenLabPicker();
  renderScenLabTags();
  renderScenarioResults();
}

