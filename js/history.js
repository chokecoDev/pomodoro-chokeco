/**
 * =========================================================================
 * RESUMEN DEL DÍA, LOG DE AUDITORÍA DETALLADO Y EXPORTACIÓN (JSON / CSV)
 * =========================================================================
 */

function renderTodaySummary() {
  const todayLogs = historyLogs.filter((l) => isToday(l.started_at));
  const todayPomosCompleted = todayLogs.filter((l) => l.type === 'pomodoro' && l.status === 'completed');
  const todayBreaks = todayLogs.filter((l) => l.type === 'short_break' || l.type === 'long_break');

  let focusedSec = 0;
  for (const log of todayLogs) {
    if (log.type === 'pomodoro' && log.started_at && log.ended_at) {
      const wallSec = Math.max(0, (new Date(log.ended_at) - new Date(log.started_at)) / 1000);
      focusedSec += Math.max(0, wallSec - (log.total_paused_sec || 0));
    }
  }

  const elPomos = document.getElementById('today-pomos-count');
  const elFocus = document.getElementById('today-focus-time');
  const elBreaks = document.getElementById('today-breaks-count');
  const elBadge = document.getElementById('history-badge');

  if (elPomos) elPomos.textContent = String(todayPomosCompleted.length);
  if (elFocus) elFocus.textContent = formatDurationHuman(focusedSec);
  if (elBreaks) elBreaks.textContent = String(todayBreaks.length);
  if (elBadge) elBadge.textContent = String(historyLogs.length);
}

function populateTagFilter() {
  const tags = [...new Set(historyLogs.map((l) => l.tag).filter(Boolean))].sort();
  const selectIds = ['filter-tag', 'report-filter-tag'];

  selectIds.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;

    select.innerHTML = '<option value="all">Todas las etiquetas</option>';
    tags.forEach((tag) => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    });

    if (tags.includes(currentVal)) {
      select.value = currentVal;
    } else if (id === 'report-filter-tag' && typeof reportFilters !== 'undefined') {
      reportFilters.tag = 'all';
    }
  });
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  const typeFilter = document.getElementById('filter-type').value;
  const tagFilter = document.getElementById('filter-tag').value;

  const filtered = historyLogs.filter((log) => {
    if (typeFilter !== 'all' && log.type !== typeFilter) return false;
    if (tagFilter !== 'all' && log.tag !== tagFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="card" style="text-align:center;padding:34px 20px;">
        <p style="margin:0;font-size:14px;font-weight:600;">No hay registros para mostrar</p>
        <p class="muted-text" style="margin:6px 0 0;">Completa un Pomodoro o descanso para ver aquí su fecha, hora exacta y pausas.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map((log) => {
    const typeMeta = {
      pomodoro: { label: 'Pomodoro', badge: 'badge-rose', dot: 'dot-rose' },
      short_break: { label: 'Descanso corto', badge: 'badge-emerald', dot: 'dot-emerald' },
      long_break: { label: 'Descanso largo', badge: 'badge-teal', dot: 'dot-teal' },
    }[log.type] || { label: log.type, badge: '', dot: 'dot-slate' };

    const wallSec = Math.max(0, Math.round((new Date(log.ended_at) - new Date(log.started_at)) / 1000));
    const activeSec = Math.max(0, wallSec - (log.total_paused_sec || 0));
    const statusBadge = log.status === 'completed'
      ? '<span class="badge">Completado</span>'
      : '<span class="badge badge-amber">Incompleto</span>';

    const taskLine = log.task_title
      ? `<div class="tiny-text" style="margin-top:6px;">Tarea: <strong style="color:var(--text-primary);">${escapeHtml(log.task_title)}</strong></div>`
      : '';

    const hasPauses = Array.isArray(log.pauses) && log.pauses.length > 0;
    const pausesHtml = hasPauses
      ? `
        <details style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border-subtle);">
          <summary class="row-between" style="font-size:12px;font-weight:600;color:var(--amber-text);">
            <span>${log.pauses.length} ${log.pauses.length === 1 ? 'pausa' : 'pausas'} · Pausado: ${formatDurationHuman(log.total_paused_sec || 0)}</span>
            <span class="tiny-text when-closed">Ver detalle ▾</span>
            <span class="tiny-text when-open">Ocultar ▴</span>
          </summary>
          <div class="stack-sm" style="margin-top:8px;padding-left:10px;border-left:2px solid var(--amber-border);">
            ${log.pauses.map((p, i) => {
              const pDur = p.resumed_at
                ? Math.max(0, Math.round((new Date(p.resumed_at) - new Date(p.paused_at)) / 1000))
                : 0;
              return `
                <div class="row-between font-mono" style="font-size:11px;color:var(--text-secondary);">
                  <span>Pausa #${i + 1}: ${formatTimeLocal(p.paused_at)} → ${p.resumed_at ? formatTimeLocal(p.resumed_at) : '--:--:--'}</span>
                  <span style="color:var(--amber-text);font-weight:700;">${formatDurationHuman(pDur)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </details>
      `
      : '';

    return `
      <article class="card" style="padding:14px 16px;">
        <div class="row-between">
          <div class="row-wrap" style="gap:6px;">
            <span class="badge ${typeMeta.badge}">
              <span class="dot ${typeMeta.dot}"></span>
              ${typeMeta.label}
            </span>
            <span class="badge">${escapeHtml(log.tag || 'Sin etiqueta')}</span>
            ${statusBadge}
          </div>
          <div class="font-mono" style="font-size:11px;color:var(--text-secondary);">
            <span>${formatDateLocal(log.started_at)}</span>
            <span> · </span>
            <strong style="color:var(--text-primary);">${formatTimeLocal(log.started_at)} → ${formatTimeLocal(log.ended_at)}</strong>
          </div>
        </div>

        ${taskLine}

        <div class="row-wrap" style="margin-top:10px;gap:14px;font-size:12px;color:var(--text-secondary);">
          <span>Efectivo: <strong class="font-mono" style="color:var(--text-primary);">${formatDurationHuman(activeSec)}</strong></span>
          <span>Planificado: <strong class="font-mono">${formatDurationHuman(log.planned_duration_sec)}</strong></span>
          <span>Total: <strong class="font-mono">${formatDurationHuman(wallSec)}</strong></span>
        </div>

        ${pausesHtml}
      </article>
    `;
  }).join('');
}

// =========================================================================
// EXPORTACIÓN DE HISTÓRICO POMODORO (JSON / CSV) Y LIMPIEZA
// =========================================================================

function exportHistory(format) {
  if (historyLogs.length === 0) {
    showToast('No hay registros de Pomodoro para exportar.', 'warning');
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  if (format === 'json') {
    const blob = new Blob([JSON.stringify(historyLogs, null, 2)], { type: 'application/json;charset=utf-8' });
    triggerDownload(blob, `pomodoro_historico_${timestamp}.json`);
    showToast('Histórico Pomodoro exportado en JSON.', 'success');
    return;
  }

  if (format === 'csv') {
    const headers = [
      'id',
      'batch_id',
      'type',
      'tag',
      'task_title',
      'status',
      'planned_duration_sec',
      'started_at',
      'ended_at',
      'total_paused_sec',
      'pauses_count',
      'pauses_json',
    ];
    const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = historyLogs.map((l) => [
      l.id,
      l.batch_id,
      l.type,
      l.tag,
      l.task_title || '',
      l.status,
      l.planned_duration_sec,
      l.started_at,
      l.ended_at,
      l.total_paused_sec || 0,
      (l.pauses || []).length,
      JSON.stringify(l.pauses || []),
    ].map(escapeCsv).join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `pomodoro_historico_${timestamp}.csv`);
    showToast('Histórico Pomodoro exportado en CSV.', 'success');
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openClearHistoryModal() {
  if (historyLogs.length === 0) {
    showToast('El histórico de Pomodoro ya está vacío.', 'info');
    return;
  }
  openModal('modal-clear-history');
}

function confirmClearHistory() {
  closeModal('modal-clear-history');
  historyLogs = [];
  saveHistory();
  renderTodaySummary();
  populateTagFilter();
  renderHistory();
  if (typeof renderReports === 'function') renderReports();
  if (typeof renderProgressOverview === 'function') renderProgressOverview();
  showToast('Histórico de Pomodoro eliminado.', 'info');
}
