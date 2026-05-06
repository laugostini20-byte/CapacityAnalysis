'use strict';

// ─── UPLOAD MODAL ───────────────────────────────────────────────────────────
// Upload modal: file submission for std-hours, schedules, and headcount.

function openUploadModal(defaultTab = 'std-hours') {
  document.getElementById('upload-modal').removeAttribute('hidden');
  switchUploadTab(defaultTab);
}

function closeUploadModal() {
  document.getElementById('upload-modal').setAttribute('hidden', '');
}

function onUploadBackdropClick(e) {
  if (e.target === document.getElementById('upload-modal')) closeUploadModal();
}

function switchUploadTab(tabName) {
  ['std-hours', 'schedule', 'headcount'].forEach(t => {
    document.getElementById(`utab-${t}`)?.classList.toggle('active', t === tabName);
    const pane = document.getElementById(`upload-pane-${t}`);
    if (pane) pane.hidden = t !== tabName;
  });
}

function truncateItems(items, max = 12) {
  if (!Array.isArray(items)) return [];
  if (items.length <= max) return items;
  return items.slice(0, max);
}

function formatScheduleItem(item) {
  const range = `${item.startDate} to ${item.endDate}`;
  const nowVal = `${item.techCount} tech${item.techCount === 1 ? '' : 's'}`;
  if (item.previousTechCount != null) {
    return `${item.labRaw} (${range}): ${item.previousTechCount} -> ${item.techCount} techs`;
  }
  return `${item.labRaw} (${range}): ${nowVal}`;
}

function formatStdHoursItem(item) {
  const range = item.effectiveTo ? `${item.effectiveFrom} to ${item.effectiveTo}` : `${item.effectiveFrom}+`;
  if (item.previousStdHours != null) {
    return `${item.labRaw} (${range}): ${item.previousStdHours} -> ${item.stdHours} std hrs`;
  }
  return `${item.labRaw} (${range}): ${item.stdHours} std hrs`;
}

function formatHeadcountItem(item) {
  if (item.previousHeadcount != null) {
    return `${item.labRaw}: ${item.previousHeadcount} -> ${item.headcount} techs`;
  }
  return `${item.labRaw}: ${item.headcount} techs`;
}

function formatSkippedReason(reason) {
  if (reason === 'missing_or_invalid_required_fields') return 'missing or invalid required fields';
  if (reason === 'unusable_lab') return 'lab value could not be interpreted';
  if (reason === 'inactive_lab') return 'mapped to inactive lab';
  return reason || 'skipped';
}

function renderUploadReport(type, data) {
  const lines = [];
  const s = data.summary ?? {};
  const details = s.details ?? {};
  const inserted = details.inserted ?? [];
  const updated = details.updated ?? [];
  const unchanged = details.unchanged ?? [];
  const issues = data.issues ?? [];
  const skipped = data.skipped ?? [];

  lines.push(`Upload complete.`);
  lines.push(`Rows parsed: ${data.parsedRows ?? '—'} | Valid rows: ${data.validRows ?? '—'} | Skipped rows: ${data.skippedRows ?? skipped.length ?? 0}`);
  lines.push(`Inserted: ${s.inserted ?? 0} | Updated: ${s.updated ?? 0} | Unchanged: ${s.unchanged ?? 0}`);
  if (type === 'std-hours') {
    const range = data.effectiveTo ? `${data.effectiveFrom} to ${data.effectiveTo}` : `${data.effectiveFrom} onward`;
    lines.push(`Effective range: ${range}`);
  } else if (type === 'headcount') {
    lines.push(`Effective month: ${data.effectiveMonth ?? '—'}`);
  }

  const fmtItem = type === 'std-hours'
    ? formatStdHoursItem
    : type === 'headcount'
      ? formatHeadcountItem
      : formatScheduleItem;

  if (inserted.length) {
    lines.push('');
    lines.push(`Inserted labs (${inserted.length}):`);
    truncateItems(inserted).forEach(item => lines.push(`- ${fmtItem(item)}`));
    if (inserted.length > 12) lines.push(`- ...and ${inserted.length - 12} more`);
  }

  if (updated.length) {
    lines.push('');
    lines.push(`Updated labs (${updated.length}):`);
    truncateItems(updated).forEach(item => lines.push(`- ${fmtItem(item)}`));
    if (updated.length > 12) lines.push(`- ...and ${updated.length - 12} more`);
  }

  if (unchanged.length) {
    lines.push('');
    lines.push(`Unchanged labs (${unchanged.length}):`);
    truncateItems(unchanged).forEach(item => lines.push(`- ${fmtItem(item)}`));
    if (unchanged.length > 12) lines.push(`- ...and ${unchanged.length - 12} more`);
  }

  if (skipped.length) {
    lines.push('');
    lines.push(`Skipped rows (${skipped.length}):`);
    truncateItems(skipped).forEach(item => {
      const labText = item.labRaw ? ` (${item.labRaw})` : '';
      lines.push(`- Row ${item.rowNumber}${labText}: ${formatSkippedReason(item.reason)}`);
    });
    if (skipped.length > 12) lines.push(`- ...and ${skipped.length - 12} more`);
  }

  if (issues.length) {
    lines.push('');
    lines.push(`Issues / warnings (${issues.length}):`);
    truncateItems(issues).forEach(msg => lines.push(`- ${msg}`));
    if (issues.length > 12) lines.push(`- ...and ${issues.length - 12} more`);
  }

  return lines.join('\n');
}

async function submitUpload(e, type) {
  e.preventDefault();
  const form = e.target;
  const resultEl = document.getElementById(`upload-result-${type}`);
  resultEl.className = 'upload-result';
  resultEl.textContent = 'Uploading…';

  const fd = new FormData(form);
  const url = type === 'std-hours'
    ? '/api/std-hours/sync'
    : type === 'headcount'
      ? '/api/headcount/sync'
      : '/api/schedules/sync';
  try {
    const res = await fetch(url, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      const errLines = [data.error || `HTTP ${res.status}`];
      if (Array.isArray(data.issues) && data.issues.length) {
        errLines.push('', `Issues / warnings (${data.issues.length}):`);
        truncateItems(data.issues).forEach(msg => errLines.push(`- ${msg}`));
        if (data.issues.length > 12) errLines.push(`- ...and ${data.issues.length - 12} more`);
      }
      throw new Error(errLines.join('\n'));
    }
    resultEl.className = 'upload-result ok';
    resultEl.textContent = renderUploadReport(type, data);
    form.reset();
    // Refresh data
    await loadData();
    buildLabList();
    renderStatusBoard();
    if (st.tab === 'scenario-planner') renderScenarioPlanner();
  } catch (err) {
    resultEl.className = 'upload-result err';
    resultEl.textContent = 'Error: ' + err.message;
  }
}

