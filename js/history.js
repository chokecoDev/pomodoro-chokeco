/**
 * =========================================================================
 * RESUMEN DEL DÍA, LOG DE AUDITORÍA DETALLADO Y EXPORTACIÓN (JSON / CSV)
 * =========================================================================
 */

function renderTodaySummary() {
  const todayLogs = historyLogs.filter((l) => isToday(l.started_at));
  const todayPomosCompleted = todayLogs.filter((l) => l.type === 'pomodoro' && l.status === 'completed');
  const todayBreaks = todayLogs.filter((l) => l.type === 'short_break' || l.type === 'long_break');

  // Tiempo enfocado efectivo (duración real menos pausas) de todos los pomodoros de hoy
  let focusedSec = 0;
  for (const log of todayLogs) {
    if (log.type === 'pomodoro' && log.started_at && log.ended_at) {
      const wallSec = Math.max(0, (new Date(log.ended_at) - new Date(log.started_at)) / 1000);
      focusedSec += Math.max(0, wallSec - (log.total_paused_sec || 0));
    }
  }

  document.getElementById('today-pomos-count').textContent = todayPomosCompleted.length;
  document.getElementById('today-focus-time').textContent = formatDurationHuman(focusedSec);
  document.getElementById('today-breaks-count').textContent = todayBreaks.length;
  document.getElementById('history-badge').textContent = historyLogs.length;
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
  const typeFilter = document.getElementById('filter-type').value;
  const tagFilter = document.getElementById('filter-tag').value;

  const filtered = historyLogs.filter((log) => {
    if (typeFilter !== 'all' && log.type !== typeFilter) return false;
    if (tagFilter !== 'all' && log.tag !== tagFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-10 text-center">
        <p class="text-sm font-medium text-zinc-300">No hay registros para mostrar</p>
        <p class="text-xs text-zinc-500 mt-1">Completa un Pomodoro o un descanso para ver aquí su fecha, hora exacta y pausas.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map((log) => {
    const typeMeta = {
      pomodoro: {
        label: 'Pomodoro',
        badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        dot: 'bg-rose-400',
      },
      short_break: {
        label: 'Descanso corto',
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        dot: 'bg-emerald-400',
      },
      long_break: {
        label: 'Descanso largo',
        badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
        dot: 'bg-teal-400',
      },
    }[log.type] || { label: log.type, badge: 'bg-zinc-800 text-zinc-300 border-zinc-700', dot: 'bg-zinc-400' };

    const wallSec = Math.max(0, Math.round((new Date(log.ended_at) - new Date(log.started_at)) / 1000));
    const activeSec = Math.max(0, wallSec - (log.total_paused_sec || 0));
    const statusBadge = log.status === 'completed'
      ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-300">Completado</span>'
      : '<span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">Incompleto</span>';

    const hasPauses = Array.isArray(log.pauses) && log.pauses.length > 0;
    const pausesHtml = hasPauses
      ? `
        <details class="mt-3 pt-3 border-t border-zinc-800/80 group">
          <summary class="cursor-pointer text-xs font-medium text-amber-400 hover:text-amber-300 flex items-center justify-between select-none">
            <span>${log.pauses.length} ${log.pauses.length === 1 ? 'pausa' : 'pausas'} · Total pausado: ${formatDurationHuman(log.total_paused_sec || 0)}</span>
            <span class="text-zinc-500 text-[11px] group-open:hidden">Ver detalle ▾</span>
            <span class="text-zinc-500 text-[11px] hidden group-open:inline">Ocultar ▴</span>
          </summary>
          <div class="mt-2.5 space-y-1.5 pl-2 border-l-2 border-amber-500/30">
            ${log.pauses.map((p, i) => {
              const pDur = p.resumed_at
                ? Math.max(0, Math.round((new Date(p.resumed_at) - new Date(p.paused_at)) / 1000))
                : 0;
              return `
                <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 font-mono">
                  <span>Pausa #${i + 1}: ${formatTimeLocal(p.paused_at)} → ${p.resumed_at ? formatTimeLocal(p.resumed_at) : '--:--:--'}</span>
                  <span class="text-amber-300">${formatDurationHuman(pDur)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </details>
      `
      : '';

    return `
      <article class="bg-zinc-900/85 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 hover:border-zinc-700/80 transition-colors">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${typeMeta.badge}">
              <span class="w-1.5 h-1.5 rounded-full ${typeMeta.dot}"></span>
              ${typeMeta.label}
            </span>
            <span class="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800/90 text-zinc-300">
              ${escapeHtml(log.tag || 'Sin etiqueta')}
            </span>
            ${statusBadge}
          </div>
          <div class="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span>${formatDateLocal(log.started_at)}</span>
            <span class="text-zinc-600">•</span>
            <span class="text-zinc-200 font-semibold">${formatTimeLocal(log.started_at)} → ${formatTimeLocal(log.ended_at)}</span>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-400">
          <span>Efectivo: <strong class="text-zinc-200 font-mono">${formatDurationHuman(activeSec)}</strong></span>
          <span>Planificado: <strong class="text-zinc-300 font-mono">${formatDurationHuman(log.planned_duration_sec)}</strong></span>
          <span>Tiempo total: <strong class="text-zinc-300 font-mono">${formatDurationHuman(wallSec)}</strong></span>
        </div>

        ${pausesHtml}
      </article>
    `;
  }).join('');
}

// =========================================================================
// EXPORTACIÓN (JSON / CSV) Y LIMPIEZA DEL HISTÓRICO
// =========================================================================

function exportHistory(format) {
  if (historyLogs.length === 0) {
    showToast('No hay registros para exportar.', 'warning');
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  if (format === 'json') {
    const blob = new Blob([JSON.stringify(historyLogs, null, 2)], { type: 'application/json;charset=utf-8' });
    triggerDownload(blob, `pomodoro_historico_${timestamp}.json`);
    showToast('Histórico exportado en JSON.', 'success');
    return;
  }

  if (format === 'csv') {
    const headers = [
      'id',
      'batch_id',
      'type',
      'tag',
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
      l.status,
      l.planned_duration_sec,
      l.started_at,
      l.ended_at,
      l.total_paused_sec || 0,
      (l.pauses || []).length,
      JSON.stringify(l.pauses || []),
    ].map(escapeCsv).join(','));

    // BOM UTF-8 para compatibilidad directa con Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `pomodoro_historico_${timestamp}.csv`);
    showToast('Histórico exportado en CSV.', 'success');
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
    showToast('El histórico ya está vacío.', 'info');
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
  if (typeof renderReports === 'function') {
    renderReports();
  }
  showToast('Histórico eliminado correctamente.', 'info');
}
