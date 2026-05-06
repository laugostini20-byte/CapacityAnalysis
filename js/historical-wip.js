'use strict';

// ─── HISTORICAL WIP TAB ──────────────────────────────────────────────────────
// Read-only review of the historical_wip table. Coverage card + per-lab data
// table. Loaded after js/api.js, alongside the other tab modules.

async function renderHistoricalWipTab() {
  const panel = document.getElementById('view-historical-wip');
  if (!panel) return;

  panel.innerHTML = '<div style="padding:20px;color:#71717a">Loading…</div>';

  try {
    const [coverage, fullData] = await Promise.all([
      apiFetch('/api/historical-wip/coverage'),
      apiFetch('/api/historical-wip')
    ]);
    historicalWipState.coverage = coverage;

    // Default range = last 60 days through lastDate
    if (!historicalWipState.rangeEnd && coverage.lastDate) {
      historicalWipState.rangeEnd = coverage.lastDate;
      const endMs = Date.parse(coverage.lastDate);
      historicalWipState.rangeStart = new Date(endMs - 60 * 86400000).toISOString().slice(0, 10);
    }

    panel.innerHTML = `
      <div class="hwip-layout">
        ${renderHistoricalWipCoverage(coverage)}
        ${renderHistoricalWipControls()}
        ${renderHistoricalWipTable(fullData, historicalWipState.rangeStart, historicalWipState.rangeEnd)}
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div style="padding:20px;color:#b91c1c">Failed to load historical WIP: ${esc(err.message)}</div>`;
  }
}

function renderHistoricalWipCoverage(coverage) {
  if (!coverage || !coverage.lastDate) {
    return `
      <div class="hwip-coverage">
        <div class="hwip-coverage-title">Historical WIP Coverage</div>
        <div class="hwip-coverage-empty">No data yet. Upload a file via the Upload data button.</div>
      </div>
    `;
  }

  const daysBehind = coverage.daysBehind ?? 0;
  let staleClass = 'hwip-stale-ok';
  let staleLabel = 'current';
  if (daysBehind > 14) {
    staleClass = 'hwip-stale-bad';
    staleLabel = `${daysBehind} days behind — update soon`;
  } else if (daysBehind > 7) {
    staleClass = 'hwip-stale-warn';
    staleLabel = `${daysBehind} days behind`;
  }

  const lastUploadLine = coverage.lastUpload
    ? `Last upload: ${formatDateLabel(coverage.lastUpload.uploadedAt)} — ${esc(coverage.lastUpload.filename)}`
    : 'Last upload: —';

  return `
    <div class="hwip-coverage">
      <div class="hwip-coverage-title">Historical WIP Coverage</div>
      <div class="hwip-coverage-grid">
        <div><span class="hwip-coverage-k">Earliest date</span><span class="hwip-coverage-v">${formatDateLabel(coverage.firstDate)}</span></div>
        <div><span class="hwip-coverage-k">Latest date</span><span class="hwip-coverage-v">${formatDateLabel(coverage.lastDate)}</span></div>
        <div><span class="hwip-coverage-k">Today</span><span class="hwip-coverage-v">${formatDateLabel(coverage.today)}</span></div>
        <div><span class="hwip-coverage-k">Total entries</span><span class="hwip-coverage-v">${fmtInt(coverage.totalEntries)} across ${coverage.labCount} labs</span></div>
      </div>
      <div class="hwip-stale ${staleClass}">${staleLabel}</div>
      <div class="hwip-last-upload">${lastUploadLine}</div>
    </div>
  `;
}

function renderHistoricalWipControls() {
  return `
    <div class="hwip-controls">
      <label>From <input type="date" id="hwip-range-start" value="${historicalWipState.rangeStart || ''}" onchange="onHistoricalWipRangeChange()"></label>
      <label>To <input type="date" id="hwip-range-end" value="${historicalWipState.rangeEnd || ''}" onchange="onHistoricalWipRangeChange()"></label>
      <input type="search" id="hwip-search" placeholder="Search labs…" oninput="onHistoricalWipSearch(this.value)" style="margin-left:auto;min-width:200px">
    </div>
  `;
}

function renderHistoricalWipTable(fullData, rangeStart, rangeEnd) {
  if (!fullData || !fullData.dailyByDate) {
    return '<div style="padding:20px;color:#a1a1aa">No data.</div>';
  }

  // Build sorted list of dates within range, most recent first
  const allDates = Object.keys(fullData.dailyByDate).sort();
  const dates = allDates.filter(d => (!rangeStart || d >= rangeStart) && (!rangeEnd || d <= rangeEnd)).reverse();

  // Build sorted list of labs (filtered by search term)
  const term = (historicalWipState.searchTerm || '').toLowerCase();
  const labs = (fullData.labs || []).filter(l => !term || l.toLowerCase().includes(term));

  if (!dates.length) {
    return '<div style="padding:20px;color:#a1a1aa">No dates in selected range.</div>';
  }

  const headerCells = dates.map(d => `<th class="hwip-date-col">${formatShortDate(d)}</th>`).join('');
  const bodyRows = labs.map(labRaw => {
    const key = labKey(labRaw);
    const cells = dates.map(d => {
      const val = fullData.dailyByDate[d]?.[key];
      if (val == null || !Number.isFinite(val)) {
        return '<td class="hwip-cell hwip-empty"><span class="hwip-dot"></span></td>';
      }
      return `<td class="hwip-cell">${fmt(val, 1)}</td>`;
    }).join('');
    return `<tr><td class="hwip-lab">${esc(labRaw)}</td>${cells}</tr>`;
  }).join('');

  return `
    <div class="hwip-table-wrap">
      <table class="hwip-table">
        <thead>
          <tr>
            <th class="hwip-lab-col">Lab</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function onHistoricalWipRangeChange() {
  const startEl = document.getElementById('hwip-range-start');
  const endEl = document.getElementById('hwip-range-end');
  historicalWipState.rangeStart = startEl?.value || null;
  historicalWipState.rangeEnd = endEl?.value || null;
  renderHistoricalWipTab();
}

function onHistoricalWipSearch(term) {
  historicalWipState.searchTerm = term || '';
  // Re-render only the table (cheaper than full reload).
  apiFetch('/api/historical-wip').then(fullData => {
    const wrap = document.querySelector('#view-historical-wip .hwip-table-wrap');
    if (!wrap) return;
    const newTable = document.createElement('div');
    newTable.innerHTML = renderHistoricalWipTable(fullData, historicalWipState.rangeStart, historicalWipState.rangeEnd);
    wrap.replaceWith(newTable.firstElementChild);
  }).catch(() => {});
}

function formatDateLabel(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

function formatShortDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}
