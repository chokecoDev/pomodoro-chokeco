/**
 * =========================================================================
 * REPORTES GRÁFICOS Y ANÁLISIS DE TIEMPO EFECTIVO VS. TIEMPOS MUERTOS
 * =========================================================================
 * Diferencia claramente:
 *  1. Trabajo efectivo (Enfoque real dentro de bloques Pomodoro)
 *  2. Descansos planificados (Descansos cortos y largos del flujo Pomodoro)
 *  3. Tiempo muerto (No se avanzó con el flujo de Pomodoro):
 *     - Pausas registradas dentro de bloques (pauses[])
 *     - Tiempos inactivos sin iniciar entre bloques (espera en READY_*)
 */

const reportFilters = {
  period: 'all',     // 'today' | '7d' | '30d' | 'all'
  tag: 'all',        // 'all' | string
  idleScope: 'day',  // 'day' (jornada completa) | 'batch' (solo dentro de cada carga)
  selectedDay: null, // 'YYYY-MM-DD' para la línea de tiempo visual
};

let lastReportData = null;

// =========================================================================
// CONTROLES DE FILTROS DEL REPORTE
// =========================================================================

function setReportPeriod(period) {
  reportFilters.period = period;
  updateReportFilterButtons();
  renderReports();
}

function setReportIdleScope(scope) {
  reportFilters.idleScope = scope;
  updateReportFilterButtons();
  renderReports();
}

function onReportTagChange() {
  const select = document.getElementById('report-filter-tag');
  reportFilters.tag = select ? select.value : 'all';
  renderReports();
}

function onTimelineDayChange(dateKey) {
  reportFilters.selectedDay = dateKey;
  if (lastReportData) {
    renderTimelineSection(lastReportData);
  }
}

function updateReportFilterButtons() {
  const activePill = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-100 shadow-sm transition-all';
  const idlePill = 'px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-all';

  ['today', '7d', '30d', 'all'].forEach((p) => {
    const btn = document.getElementById(`report-period-${p}`);
    if (btn) btn.className = reportFilters.period === p ? activePill : idlePill;
  });

  ['day', 'batch'].forEach((s) => {
    const btn = document.getElementById(`report-scope-${s}`);
    if (btn) btn.className = reportFilters.idleScope === s ? activePill : idlePill;
  });

  const hint = document.getElementById('report-scope-hint');
  if (hint) {
    hint.textContent = reportFilters.idleScope === 'day'
      ? 'Jornada del día: incluye pausas y tiempos sin iniciar entre cualquier bloque del mismo día.'
      : 'Solo por carga: contabiliza pausas y tiempos sin iniciar únicamente dentro de cada carga configurada.';
  }
}

// =========================================================================
// MOTOR DE CÁLCULO DE MÉTRICAS Y SEGMENTOS CRONOLÓGICOS
// =========================================================================

function getLogsInPeriod() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  let cutoffMs = null;
  if (reportFilters.period === 'today') {
    cutoffMs = startOfToday;
  } else if (reportFilters.period === '7d') {
    cutoffMs = startOfToday - 6 * msPerDay;
  } else if (reportFilters.period === '30d') {
    cutoffMs = startOfToday - 29 * msPerDay;
  }

  return historyLogs.filter((log) => {
    if (!log || !log.started_at || !log.ended_at) return false;
    const startMs = new Date(log.started_at).getTime();
    const endMs = new Date(log.ended_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;

    if (cutoffMs !== null && startMs < cutoffMs) return false;
    return true;
  });
}

function getFilteredLogsForReport() {
  const periodLogs = getLogsInPeriod();
  if (reportFilters.tag === 'all') return periodLogs;
  return periodLogs.filter((log) => log.tag === reportFilters.tag);
}

function extractClampedPauses(log, startMs, endMs) {
  const wallSec = Math.max(0, (endMs - startMs) / 1000);
  const rawPauses = Array.isArray(log.pauses) ? log.pauses : [];

  const intervals = rawPauses
    .filter((p) => p && p.paused_at && p.resumed_at)
    .map((p) => ({
      startMs: Math.max(startMs, new Date(p.paused_at).getTime()),
      endMs: Math.min(endMs, new Date(p.resumed_at).getTime()),
    }))
    .filter((p) => !Number.isNaN(p.startMs) && !Number.isNaN(p.endMs) && p.endMs > p.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  // Fusionar pausas solapadas si las hubiera
  const merged = [];
  for (const item of intervals) {
    if (merged.length === 0 || item.startMs >= merged[merged.length - 1].endMs) {
      merged.push({ ...item });
    } else {
      merged[merged.length - 1].endMs = Math.max(merged[merged.length - 1].endMs, item.endMs);
    }
  }

  // Fallback si el log registra total_paused_sec pero sin detalle en pauses[]
  if (merged.length === 0 && (log.total_paused_sec || 0) > 0 && wallSec > 0) {
    const fallbackPauseMs = Math.min(endMs - startMs, (log.total_paused_sec || 0) * 1000);
    if (fallbackPauseMs > 0) {
      merged.push({ startMs: endMs - fallbackPauseMs, endMs });
    }
  }

  return merged;
}

function analyzeLogsForReport(logs, idleScope, allReferenceLogs = null) {
  const byDayMap = new Map();

  for (const log of logs) {
    const dateKey = formatDateKeyLocal(log.started_at);
    if (!byDayMap.has(dateKey)) {
      byDayMap.set(dateKey, []);
    }
    byDayMap.get(dateKey).push(log);
  }

  // Referencia de todos los bloques del periodo (para no marcar actividad de otra etiqueta como tiempo muerto)
  const refByDayMap = new Map();
  if (Array.isArray(allReferenceLogs) && allReferenceLogs.length > logs.length) {
    for (const ref of allReferenceLogs) {
      if (!ref || !ref.started_at || !ref.ended_at) continue;
      const dk = formatDateKeyLocal(ref.started_at);
      if (!refByDayMap.has(dk)) refByDayMap.set(dk, []);
      refByDayMap.get(dk).push({
        startMs: new Date(ref.started_at).getTime(),
        endMs: new Date(ref.ended_at).getTime(),
      });
    }
  }

  const sortedDateKeys = [...byDayMap.keys()].sort();

  const summary = {
    focusSec: 0,
    breakSec: 0,
    shortBreakSec: 0,
    longBreakSec: 0,
    pauseSec: 0,
    pauseDuringFocusSec: 0,
    pauseDuringBreakSec: 0,
    idleGapSec: 0,
    deadTimeSec: 0,
    productiveFlowSec: 0,
    totalTrackedSec: 0,
    pomosCompleted: 0,
    pomosIncomplete: 0,
    shortBreaksCount: 0,
    longBreaksCount: 0,
    pauseCount: 0,
    idleGapCount: 0,
    longestPauseSec: 0,
    longestIdleGapSec: 0,
    avgPauseSec: 0,
    avgIdleGapSec: 0,
    flowEfficiencyPct: 0,
    blocksCount: logs.length,
    daysCount: sortedDateKeys.length,
    dailySeries: [],
    dayDetails: new Map(),
    tagBreakdown: [],
  };

  const tagMap = new Map();

  const getTagStats = (tagName) => {
    const key = tagName || 'Sin etiqueta';
    if (!tagMap.has(key)) {
      tagMap.set(key, {
        tag: key,
        focusSec: 0,
        breakSec: 0,
        pauseSec: 0,
        pomosCompleted: 0,
        pomosIncomplete: 0,
        blocksCount: 0,
      });
    }
    return tagMap.get(key);
  };

  for (const dateKey of sortedDateKeys) {
    const dayLogs = byDayMap
      .get(dateKey)
      .slice()
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

    const dayStats = {
      dateKey,
      focusSec: 0,
      breakSec: 0,
      pauseSec: 0,
      idleGapSec: 0,
      deadTimeSec: 0,
      totalTrackedSec: 0,
      spanStartMs: null,
      spanEndMs: null,
      segments: [],
      deadEvents: [],
      blocksCount: dayLogs.length,
      pomosCompleted: 0,
    };

    let maxEndMs = null;
    let prevBatchId = null;
    let prevType = null;

    for (const log of dayLogs) {
      const startMs = new Date(log.started_at).getTime();
      const endMs = Math.max(startMs, new Date(log.ended_at).getTime());
      const isPomodoro = log.type === 'pomodoro';
      const isLongBreak = log.type === 'long_break';
      const isBreak = log.type === 'short_break' || isLongBreak;

      if (dayStats.spanStartMs === null || startMs < dayStats.spanStartMs) {
        dayStats.spanStartMs = startMs;
      }
      if (dayStats.spanEndMs === null || endMs > dayStats.spanEndMs) {
        dayStats.spanEndMs = endMs;
      }

      // 1. Hueco de inactividad entre el bloque anterior y el actual
      if (maxEndMs !== null && startMs > maxEndMs) {
        const gapSec = (startMs - maxEndMs) / 1000;
        const sameBatch = Boolean(prevBatchId && log.batch_id && prevBatchId === log.batch_id);
        const refDayBlocks = refByDayMap.get(dateKey) || [];
        const occupiedByOtherTag = refDayBlocks.some((b) => b.endMs > maxEndMs && b.startMs < startMs);
        const countAsDead = !occupiedByOtherTag && (idleScope === 'day' ? true : sameBatch);

        if (countAsDead && gapSec >= 1) {
          summary.idleGapSec += gapSec;
          summary.idleGapCount += 1;
          if (gapSec > summary.longestIdleGapSec) summary.longestIdleGapSec = gapSec;
          dayStats.idleGapSec += gapSec;

          const gapLabel = sameBatch
            ? 'Sin avanzar (espera en la carga)'
            : 'Sin avanzar (entre cargas del día)';

          dayStats.segments.push({
            kind: 'idle',
            startMs: maxEndMs,
            endMs: startMs,
            durationSec: gapSec,
            label: gapLabel,
            sublabel: `Después de ${formatBlockTypeShort(prevType)} · antes de ${formatBlockTypeShort(log.type)}`,
            sameBatch,
          });

          dayStats.deadEvents.push({
            kind: 'idle',
            startMs: maxEndMs,
            endMs: startMs,
            durationSec: gapSec,
            label: gapLabel,
            detail: `${formatBlockTypeShort(prevType)} → ${formatBlockTypeShort(log.type)}`,
          });
        } else if (!countAsDead && gapSec >= 1) {
          dayStats.segments.push({
            kind: 'neutral_gap',
            startMs: maxEndMs,
            endMs: startMs,
            durationSec: gapSec,
            label: occupiedByOtherTag ? 'Actividad en otra etiqueta' : 'Intervalo entre cargas',
            sublabel: occupiedByOtherTag
              ? 'No contabilizado como tiempo muerto al filtrar por etiqueta'
              : 'Excluido en modo "Solo por carga"',
          });
        }
      }

      // 2. Descomposición del bloque actual en tramos activos y pausas exactas
      const pauses = extractClampedPauses(log, startMs, endMs);
      const tagStats = getTagStats(log.tag);
      tagStats.blocksCount += 1;

      if (isPomodoro) {
        if (log.status === 'completed') {
          summary.pomosCompleted += 1;
          dayStats.pomosCompleted += 1;
          tagStats.pomosCompleted += 1;
        } else {
          summary.pomosIncomplete += 1;
          tagStats.pomosIncomplete += 1;
        }
      } else if (isLongBreak) {
        summary.longBreaksCount += 1;
      } else if (isBreak) {
        summary.shortBreaksCount += 1;
      }

      let cursor = startMs;
      let blockActiveSec = 0;
      let blockPauseSec = 0;

      const blockKind = isPomodoro ? 'focus' : 'break';
      const blockLabel = isPomodoro
        ? `Pomodoro (${log.status === 'completed' ? 'Completado' : 'Incompleto'})`
        : isLongBreak
          ? 'Descanso largo'
          : 'Descanso corto';

      for (const p of pauses) {
        if (p.startMs > cursor) {
          const segSec = (p.startMs - cursor) / 1000;
          blockActiveSec += segSec;
          dayStats.segments.push({
            kind: blockKind,
            startMs: cursor,
            endMs: p.startMs,
            durationSec: segSec,
            label: blockLabel,
            sublabel: log.tag || 'Sin etiqueta',
          });
        }

        const pauseSegStart = Math.max(cursor, p.startMs);
        const pauseSegSec = Math.max(0, (p.endMs - pauseSegStart) / 1000);
        if (pauseSegSec > 0) {
          blockPauseSec += pauseSegSec;
          summary.pauseCount += 1;
          if (pauseSegSec > summary.longestPauseSec) summary.longestPauseSec = pauseSegSec;

          const pauseLabel = isPomodoro ? 'Pausa durante Pomodoro' : 'Pausa durante Descanso';
          dayStats.segments.push({
            kind: 'pause',
            startMs: pauseSegStart,
            endMs: p.endMs,
            durationSec: pauseSegSec,
            label: pauseLabel,
            sublabel: log.tag || 'Sin etiqueta',
          });

          dayStats.deadEvents.push({
            kind: 'pause',
            startMs: pauseSegStart,
            endMs: p.endMs,
            durationSec: pauseSegSec,
            label: pauseLabel,
            detail: log.tag || 'Sin etiqueta',
          });
        }

        cursor = Math.max(cursor, p.endMs);
      }

      if (cursor < endMs) {
        const tailSec = (endMs - cursor) / 1000;
        blockActiveSec += tailSec;
        dayStats.segments.push({
          kind: blockKind,
          startMs: cursor,
          endMs: endMs,
          durationSec: tailSec,
          label: blockLabel,
          sublabel: log.tag || 'Sin etiqueta',
        });
      }

      if (isPomodoro) {
        summary.focusSec += blockActiveSec;
        summary.pauseDuringFocusSec += blockPauseSec;
        dayStats.focusSec += blockActiveSec;
        tagStats.focusSec += blockActiveSec;
      } else if (isBreak) {
        summary.breakSec += blockActiveSec;
        if (isLongBreak) summary.longBreakSec += blockActiveSec;
        else summary.shortBreakSec += blockActiveSec;
        summary.pauseDuringBreakSec += blockPauseSec;
        dayStats.breakSec += blockActiveSec;
        tagStats.breakSec += blockActiveSec;
      }

      summary.pauseSec += blockPauseSec;
      dayStats.pauseSec += blockPauseSec;
      tagStats.pauseSec += blockPauseSec;

      maxEndMs = maxEndMs === null ? endMs : Math.max(maxEndMs, endMs);
      prevBatchId = log.batch_id || null;
      prevType = log.type;
    }

    dayStats.deadTimeSec = dayStats.pauseSec + dayStats.idleGapSec;
    dayStats.totalTrackedSec = dayStats.focusSec + dayStats.breakSec + dayStats.deadTimeSec;
    summary.dailySeries.push(dayStats);
    summary.dayDetails.set(dateKey, dayStats);
  }

  summary.deadTimeSec = summary.pauseSec + summary.idleGapSec;
  summary.productiveFlowSec = summary.focusSec + summary.breakSec;
  summary.totalTrackedSec = summary.focusSec + summary.breakSec + summary.deadTimeSec;
  summary.avgPauseSec = summary.pauseCount > 0 ? summary.pauseSec / summary.pauseCount : 0;
  summary.avgIdleGapSec = summary.idleGapCount > 0 ? summary.idleGapSec / summary.idleGapCount : 0;

  const flowDenom = summary.focusSec + summary.deadTimeSec;
  summary.flowEfficiencyPct = flowDenom > 0 ? (summary.focusSec / flowDenom) * 100 : 0;

  summary.tagBreakdown = [...tagMap.values()].sort((a, b) => b.focusSec - a.focusSec);

  return summary;
}

function formatBlockTypeShort(type) {
  if (type === 'pomodoro') return 'Pomodoro';
  if (type === 'long_break') return 'Descanso largo';
  if (type === 'short_break') return 'Descanso corto';
  return 'Bloque';
}

// =========================================================================
// TOOLTIP FLOTANTE INTERACTIVO
// =========================================================================

function showReportTooltip(event, title, linesHtml) {
  const el = document.getElementById('report-tooltip');
  if (!el) return;

  el.innerHTML = `
    <div class="font-semibold text-zinc-100 text-xs mb-1">${title}</div>
    <div class="text-[11px] text-zinc-300 space-y-0.5">${linesHtml}</div>
  `;
  el.classList.remove('hidden');
  moveReportTooltip(event);
}

function moveReportTooltip(event) {
  const el = document.getElementById('report-tooltip');
  if (!el || el.classList.contains('hidden')) return;

  const pad = 14;
  const rect = el.getBoundingClientRect();
  let left = event.clientX + pad;
  let top = event.clientY + pad;

  if (left + rect.width > window.innerWidth - 12) {
    left = Math.max(12, event.clientX - rect.width - pad);
  }
  if (top + rect.height > window.innerHeight - 12) {
    top = Math.max(12, event.clientY - rect.height - pad);
  }

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function hideReportTooltip() {
  const el = document.getElementById('report-tooltip');
  if (el) el.classList.add('hidden');
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', hideReportTooltip, true);
}

// =========================================================================
// RENDERIZADO PRINCIPAL DE LA SECCIÓN DE REPORTES
// =========================================================================

function renderReports() {
  updateReportFilterButtons();
  hideReportTooltip();

  const contentEl = document.getElementById('reports-content');
  const emptyEl = document.getElementById('reports-empty');
  if (!contentEl || !emptyEl) return;

  const periodLogs = getLogsInPeriod();
  const filteredLogs = reportFilters.tag === 'all'
    ? periodLogs
    : periodLogs.filter((log) => log.tag === reportFilters.tag);

  if (filteredLogs.length === 0) {
    lastReportData = null;
    contentEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const data = analyzeLogsForReport(filteredLogs, reportFilters.idleScope, periodLogs);
  lastReportData = data;

  // Asegurar que el día seleccionado en la línea de tiempo exista en el rango actual
  const availableDays = data.dailySeries.map((d) => d.dateKey);
  if (!reportFilters.selectedDay || !availableDays.includes(reportFilters.selectedDay)) {
    reportFilters.selectedDay = availableDays[availableDays.length - 1] || null;
  }

  renderReportKpis(data);
  renderDonutAndBreakdown(data);
  renderDailyBarChart(data);
  renderTimelineSection(data);
  renderTagBreakdown(data);
}

// -------------------------------------------------------------------------
// 1. TARJETAS KPI PRINCIPALES
// -------------------------------------------------------------------------

function renderReportKpis(data) {
  const total = data.totalTrackedSec;

  document.getElementById('kpi-focus-time').textContent = formatDurationHuman(data.focusSec);
  document.getElementById('kpi-focus-pct').textContent = formatPercent(data.focusSec, total);
  document.getElementById('kpi-focus-sub').textContent =
    `${data.pomosCompleted} completados · ${data.pomosIncomplete} incompletos`;

  document.getElementById('kpi-break-time').textContent = formatDurationHuman(data.breakSec);
  document.getElementById('kpi-break-pct').textContent = formatPercent(data.breakSec, total);
  document.getElementById('kpi-break-sub').textContent =
    `${data.shortBreaksCount} cortos · ${data.longBreaksCount} largos`;

  document.getElementById('kpi-dead-time').textContent = formatDurationHuman(data.deadTimeSec);
  document.getElementById('kpi-dead-pct').textContent = formatPercent(data.deadTimeSec, total);
  document.getElementById('kpi-dead-sub').textContent =
    `Pausas: ${formatDurationHuman(data.pauseSec)} · Sin avanzar: ${formatDurationHuman(data.idleGapSec)}`;

  const effStr = data.focusSec + data.deadTimeSec > 0
    ? `${data.flowEfficiencyPct.toFixed(1).replace(/\.0$/, '')}%`
    : '0%';
  document.getElementById('kpi-efficiency-pct').textContent = effStr;
  document.getElementById('kpi-efficiency-sub').textContent =
    `Enfoque vs. tiempo muerto (sin descansos)`;
}

// -------------------------------------------------------------------------
// 2. GRÁFICO DE DONA SVG + BARRA PROPORCIONAL + DESGLOSE DE TIEMPO MUERTO
// -------------------------------------------------------------------------

function renderDonutAndBreakdown(data) {
  const total = data.totalTrackedSec;
  const donutContainer = document.getElementById('report-donut-svg-wrap');
  const legendContainer = document.getElementById('report-donut-legend');

  const segments = [
    {
      key: 'focus',
      label: 'Trabajo efectivo',
      desc: 'Enfoque real en Pomodoros',
      sec: data.focusSec,
      color: REPORT_COLORS.focus,
      badgeCls: 'text-rose-400',
      dotCls: 'bg-rose-500',
    },
    {
      key: 'break',
      label: 'Descansos',
      desc: 'Descansos cortos y largos del método',
      sec: data.breakSec,
      color: REPORT_COLORS.break,
      badgeCls: 'text-emerald-400',
      dotCls: 'bg-emerald-500',
    },
    {
      key: 'pause',
      label: 'Pausas en bloque',
      desc: 'Tiempo muerto · interrupciones registradas',
      sec: data.pauseSec,
      color: REPORT_COLORS.pause,
      badgeCls: 'text-amber-400',
      dotCls: 'bg-amber-500',
    },
    {
      key: 'idle',
      label: 'Sin avanzar',
      desc: 'Tiempo muerto · espera sin iniciar siguiente bloque',
      sec: data.idleGapSec,
      color: REPORT_COLORS.idle,
      badgeCls: 'text-slate-300',
      dotCls: 'bg-slate-500',
    },
  ];

  // Construcción de la dona SVG (radio = 78, circunferencia = 2 * PI * 78)
  const r = 78;
  const c = 2 * Math.PI * r;
  let offsetAccum = 0;

  const circlesHtml = segments
    .filter((s) => s.sec > 0 && total > 0)
    .map((seg) => {
      const len = (seg.sec / total) * c;
      const dashArray = `${len.toFixed(2)} ${(c - len).toFixed(2)}`;
      const dashOffset = (-offsetAccum).toFixed(2);
      offsetAccum += len;
      const pct = formatPercent(seg.sec, total);

      return `
        <circle
          cx="100"
          cy="100"
          r="${r}"
          fill="none"
          stroke="${seg.color}"
          stroke-width="20"
          stroke-dasharray="${dashArray}"
          stroke-dashoffset="${dashOffset}"
          class="report-donut-segment"
          data-seg-key="${seg.key}"
          data-seg-label="${escapeHtml(seg.label)}"
          data-seg-pct="${pct}"
          data-seg-dur="${escapeHtml(formatDurationHuman(seg.sec))}"
          data-seg-desc="${escapeHtml(seg.desc)}"
        />
      `;
    })
    .join('');

  const defaultCenterPct = formatPercent(data.focusSec, total);
  const defaultCenterSub = 'Trabajo efectivo';
  const defaultCenterDur = formatDurationHuman(data.focusSec);

  donutContainer.innerHTML = `
    <div class="relative w-52 h-52 mx-auto flex items-center justify-center">
      <svg viewBox="0 0 200 200" class="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="#27272a" stroke-width="20" />
        ${circlesHtml}
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-5">
        <span id="donut-center-label" class="text-[11px] font-medium text-zinc-400 leading-tight">${defaultCenterSub}</span>
        <span id="donut-center-pct" class="text-3xl font-mono font-bold text-zinc-100 mt-0.5">${defaultCenterPct}</span>
        <span id="donut-center-dur" class="text-xs font-mono text-zinc-400 mt-0.5">${defaultCenterDur}</span>
      </div>
    </div>
  `;

  // Interactividad hover en la dona
  const centerLabel = document.getElementById('donut-center-label');
  const centerPct = document.getElementById('donut-center-pct');
  const centerDur = document.getElementById('donut-center-dur');

  donutContainer.querySelectorAll('.report-donut-segment').forEach((circle) => {
    circle.addEventListener('mouseenter', (e) => {
      centerLabel.textContent = circle.dataset.segLabel;
      centerPct.textContent = circle.dataset.segPct;
      centerDur.textContent = circle.dataset.segDur;
      showReportTooltip(
        e,
        circle.dataset.segLabel,
        `<div>Tiempo: <strong class="font-mono text-zinc-100">${circle.dataset.segDur}</strong> (${circle.dataset.segPct})</div>
         <div class="text-zinc-400">${circle.dataset.segDesc}</div>`
      );
    });
    circle.addEventListener('mousemove', moveReportTooltip);
    circle.addEventListener('mouseleave', () => {
      centerLabel.textContent = defaultCenterSub;
      centerPct.textContent = defaultCenterPct;
      centerDur.textContent = defaultCenterDur;
      hideReportTooltip();
    });
  });

  // Leyenda detallada
  legendContainer.innerHTML = segments
    .map((seg) => {
      const pct = formatPercent(seg.sec, total);
      return `
        <div class="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/70 last:border-b-0">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full shrink-0 ${seg.dotCls}"></span>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-zinc-200 truncate">${seg.label}</p>
              <p class="text-[11px] text-zinc-500 truncate">${seg.desc}</p>
            </div>
          </div>
          <div class="text-right shrink-0 font-mono">
            <span class="text-xs font-bold ${seg.badgeCls}">${pct}</span>
            <p class="text-[11px] text-zinc-400">${formatDurationHuman(seg.sec)}</p>
          </div>
        </div>
      `;
    })
    .join('');

  // Barra 100% apilada: Flujo Pomodoro (Trabajo + Descansos) vs Tiempo Muerto (Pausas + Sin avanzar)
  const stackedBar = document.getElementById('report-stacked-bar');
  const pctFocus = total > 0 ? (data.focusSec / total) * 100 : 0;
  const pctBreak = total > 0 ? (data.breakSec / total) * 100 : 0;
  const pctPause = total > 0 ? (data.pauseSec / total) * 100 : 0;
  const pctIdle = total > 0 ? (data.idleGapSec / total) * 100 : 0;

  stackedBar.innerHTML = `
    <div style="width:${pctFocus.toFixed(2)}%" class="h-full bg-rose-500 transition-all" title="Trabajo efectivo: ${formatPercent(data.focusSec, total)}"></div>
    <div style="width:${pctBreak.toFixed(2)}%" class="h-full bg-emerald-500 transition-all" title="Descansos: ${formatPercent(data.breakSec, total)}"></div>
    <div style="width:${pctPause.toFixed(2)}%" class="h-full bg-amber-500 transition-all" title="Pausas en bloque: ${formatPercent(data.pauseSec, total)}"></div>
    <div style="width:${pctIdle.toFixed(2)}%" class="h-full bg-slate-500 transition-all" title="Sin avanzar entre bloques: ${formatPercent(data.idleGapSec, total)}"></div>
  `;

  // Resumen comparativo Flujo activo vs Tiempo muerto
  document.getElementById('compare-flow-pct').textContent = formatPercent(data.productiveFlowSec, total);
  document.getElementById('compare-flow-dur').textContent = formatDurationHuman(data.productiveFlowSec);
  document.getElementById('compare-dead-pct').textContent = formatPercent(data.deadTimeSec, total);
  document.getElementById('compare-dead-dur').textContent = formatDurationHuman(data.deadTimeSec);

  // Desglose de Tiempo Muerto y Tasa de finalización
  document.getElementById('dead-pauses-total').textContent = formatDurationHuman(data.pauseSec);
  document.getElementById('dead-pauses-meta').textContent = data.pauseCount > 0
    ? `${data.pauseCount} ${data.pauseCount === 1 ? 'pausa' : 'pausas'} · prom. ${formatDurationHuman(data.avgPauseSec)} · máx. ${formatDurationHuman(data.longestPauseSec)}`
    : 'Sin pausas registradas en este periodo';

  document.getElementById('dead-idle-total').textContent = formatDurationHuman(data.idleGapSec);
  document.getElementById('dead-idle-meta').textContent = data.idleGapCount > 0
    ? `${data.idleGapCount} ${data.idleGapCount === 1 ? 'espera' : 'esperas'} · prom. ${formatDurationHuman(data.avgIdleGapSec)} · máx. ${formatDurationHuman(data.longestIdleGapSec)}`
    : 'Sin huecos inactivos registrados entre bloques';

  const totalPomos = data.pomosCompleted + data.pomosIncomplete;
  const completionPct = totalPomos > 0 ? (data.pomosCompleted / totalPomos) * 100 : 0;
  document.getElementById('completion-rate-text').textContent = totalPomos > 0
    ? `${completionPct.toFixed(0)}% (${data.pomosCompleted}/${totalPomos})`
    : '0% (0/0)';
  document.getElementById('completion-rate-bar').style.width = `${completionPct.toFixed(1)}%`;
}

// -------------------------------------------------------------------------
// 3. GRÁFICO DE EVOLUCIÓN POR DÍA (BARRAS APILADAS SVG)
// -------------------------------------------------------------------------

function renderDailyBarChart(data) {
  const container = document.getElementById('report-daily-chart');
  const days = data.dailySeries.slice(-14); // Últimos 14 días activos del rango

  if (days.length === 0) {
    container.innerHTML = '<p class="text-xs text-zinc-500 text-center py-6">Sin datos diarios para graficar.</p>';
    return;
  }

  const maxTotalSec = Math.max(...days.map((d) => d.totalTrackedSec), 1);

  const svgWidth = 640;
  const svgHeight = 220;
  const padLeft = 44;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 34;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  // Líneas de referencia horizontales (0%, 25%, 50%, 75%, 100%)
  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const gridHtml = gridSteps
    .map((ratio) => {
      const y = padTop + chartH * (1 - ratio);
      const labelSec = maxTotalSec * ratio;
      return `
        <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${svgWidth - padRight}" y2="${y.toFixed(1)}" stroke="#27272a" stroke-width="1" stroke-dasharray="${ratio === 0 ? '' : '3 3'}" />
        <text x="${padLeft - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#71717a" font-size="10" font-family="JetBrains Mono, monospace">${formatDurationCompact(labelSec)}</text>
      `;
    })
    .join('');

  const slotW = chartW / days.length;
  const barW = Math.min(34, Math.max(12, slotW * 0.58));

  const barsHtml = days
    .map((day, idx) => {
      const centerX = padLeft + slotW * idx + slotW / 2;
      const x = centerX - barW / 2;
      const isSelected = day.dateKey === reportFilters.selectedDay;

      const hFocus = (day.focusSec / maxTotalSec) * chartH;
      const hBreak = (day.breakSec / maxTotalSec) * chartH;
      const hPause = (day.pauseSec / maxTotalSec) * chartH;
      const hIdle = (day.idleGapSec / maxTotalSec) * chartH;

      let yCursor = padTop + chartH;
      const rects = [];

      const pushStack = (h, fill) => {
        if (h <= 0.3) return;
        yCursor -= h;
        rects.push(`<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="2" />`);
      };

      pushStack(hFocus, REPORT_COLORS.focus);
      pushStack(hBreak, REPORT_COLORS.break);
      pushStack(hPause, REPORT_COLORS.pause);
      pushStack(hIdle, REPORT_COLORS.idle);

      const labelFill = isSelected ? '#f4f4f5' : '#a1a1aa';
      const highlightBg = isSelected
        ? `<rect x="${(x - 4).toFixed(1)}" y="${padTop}" width="${(barW + 8).toFixed(1)}" height="${chartH}" fill="rgba(244,63,94,0.08)" stroke="rgba(244,63,94,0.35)" stroke-width="1" rx="6" />`
        : '';

      return `
        <g class="report-bar-col cursor-pointer" data-day-key="${day.dateKey}">
          ${highlightBg}
          <rect x="${(centerX - slotW / 2).toFixed(1)}" y="${padTop}" width="${slotW.toFixed(1)}" height="${chartH}" fill="transparent" />
          ${rects.join('')}
          <text x="${centerX.toFixed(1)}" y="${svgHeight - 12}" text-anchor="middle" fill="${labelFill}" font-size="10" font-weight="${isSelected ? '700' : '500'}" font-family="JetBrains Mono, monospace">${formatDateKeyShort(day.dateKey)}</text>
        </g>
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="w-full h-auto overflow-visible select-none">
      ${gridHtml}
      ${barsHtml}
    </svg>
  `;

  // Eventos hover y click para seleccionar día en la línea de tiempo
  container.querySelectorAll('.report-bar-col').forEach((col) => {
    const dayKey = col.dataset.dayKey;
    const day = data.dayDetails.get(dayKey);
    if (!day) return;

    col.addEventListener('mouseenter', (e) => {
      const t = day.totalTrackedSec;
      showReportTooltip(
        e,
        `${formatDateKeyDisplay(dayKey)} · Total ${formatDurationHuman(t)}`,
        `
          <div class="flex items-center justify-between gap-4"><span class="text-rose-400">● Trabajo efectivo</span><span class="font-mono">${formatDurationHuman(day.focusSec)} (${formatPercent(day.focusSec, t)})</span></div>
          <div class="flex items-center justify-between gap-4"><span class="text-emerald-400">● Descansos</span><span class="font-mono">${formatDurationHuman(day.breakSec)} (${formatPercent(day.breakSec, t)})</span></div>
          <div class="flex items-center justify-between gap-4"><span class="text-amber-400">● Pausas en bloque</span><span class="font-mono">${formatDurationHuman(day.pauseSec)} (${formatPercent(day.pauseSec, t)})</span></div>
          <div class="flex items-center justify-between gap-4"><span class="text-slate-300">● Sin avanzar</span><span class="font-mono">${formatDurationHuman(day.idleGapSec)} (${formatPercent(day.idleGapSec, t)})</span></div>
          <div class="pt-1 mt-1 border-t border-zinc-800 text-[10px] text-zinc-400">Clic para inspeccionar línea de tiempo</div>
        `
      );
    });
    col.addEventListener('mousemove', moveReportTooltip);
    col.addEventListener('mouseleave', hideReportTooltip);
    col.addEventListener('click', () => {
      reportFilters.selectedDay = dayKey;
      renderDailyBarChart(data);
      renderTimelineSection(data);
    });
  });
}

// -------------------------------------------------------------------------
// 4. LÍNEA DE TIEMPO VISUAL DE LA JORNADA (GANTT PROPORCIONAL)
// -------------------------------------------------------------------------

function renderTimelineSection(data) {
  const selectEl = document.getElementById('report-timeline-day');
  const stripEl = document.getElementById('report-timeline-strip');
  const metaEl = document.getElementById('report-timeline-meta');
  const deadListEl = document.getElementById('report-timeline-dead-list');

  // Poblar selector de días disponibles (más reciente primero)
  const descDays = [...data.dailySeries].reverse();
  selectEl.innerHTML = descDays
    .map((d) => `<option value="${d.dateKey}">${formatDateKeyDisplay(d.dateKey)} (${d.pomosCompleted} pomos)</option>`)
    .join('');

  if (reportFilters.selectedDay && data.dayDetails.has(reportFilters.selectedDay)) {
    selectEl.value = reportFilters.selectedDay;
  } else if (descDays.length > 0) {
    reportFilters.selectedDay = descDays[0].dateKey;
    selectEl.value = reportFilters.selectedDay;
  }

  const day = data.dayDetails.get(reportFilters.selectedDay);
  if (!day || day.segments.length === 0) {
    stripEl.innerHTML = '<div class="text-xs text-zinc-500 text-center py-4">No hay segmentos para este día.</div>';
    metaEl.textContent = '';
    deadListEl.innerHTML = '';
    return;
  }

  const totalSpanMs = Math.max(1000, day.spanEndMs - day.spanStartMs);
  const startLabel = formatTimeShortLocal(day.spanStartMs);
  const endLabel = formatTimeShortLocal(day.spanEndMs);
  const spanHuman = formatDurationHuman(totalSpanMs / 1000);

  metaEl.innerHTML = `
    <span>Ventana del día: <strong class="text-zinc-200 font-mono">${startLabel} → ${endLabel}</strong> (${spanHuman})</span>
    <span class="hidden sm:inline text-zinc-600">•</span>
    <span>Trabajo: <strong class="text-rose-400 font-mono">${formatPercent(day.focusSec, day.totalTrackedSec)}</strong></span>
    <span>Descansos: <strong class="text-emerald-400 font-mono">${formatPercent(day.breakSec, day.totalTrackedSec)}</strong></span>
    <span>Tiempo muerto: <strong class="text-amber-400 font-mono">${formatPercent(day.deadTimeSec, day.totalTrackedSec)}</strong></span>
  `;

  // Construir barra proporcional exacta
  const segStyleMap = {
    focus: 'bg-rose-500',
    break: 'bg-emerald-500',
    pause: 'bg-amber-500',
    idle: 'timeline-idle-pattern border-x border-slate-500/40',
    neutral_gap: 'timeline-neutral-gap',
  };

  const barsHtml = day.segments
    .map((seg, idx) => {
      const widthPct = ((seg.endMs - seg.startMs) / totalSpanMs) * 100;
      const cls = segStyleMap[seg.kind] || 'bg-zinc-700';
      return `
        <div
          class="timeline-segment h-full ${cls} cursor-pointer"
          style="width: ${Math.max(widthPct, 0.35).toFixed(3)}%;"
          data-seg-idx="${idx}"
        ></div>
      `;
    })
    .join('');

  // Marcas horarias (inicio, 25%, 50%, 75%, fin)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => formatTimeShortLocal(day.spanStartMs + totalSpanMs * r));

  stripEl.innerHTML = `
    <div class="w-full h-11 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 flex items-stretch">
      ${barsHtml}
    </div>
    <div class="mt-2 flex items-center justify-between text-[11px] font-mono text-zinc-500">
      <span>${ticks[0]}</span>
      <span class="hidden sm:inline">${ticks[1]}</span>
      <span>${ticks[2]}</span>
      <span class="hidden sm:inline">${ticks[3]}</span>
      <span>${ticks[4]}</span>
    </div>
  `;

  // Tooltips por segmento
  stripEl.querySelectorAll('.timeline-segment').forEach((el) => {
    const seg = day.segments[Number(el.dataset.segIdx)];
    if (!seg) return;

    el.addEventListener('mouseenter', (e) => {
      showReportTooltip(
        e,
        escapeHtml(seg.label),
        `
          <div class="font-mono text-zinc-100">${formatTimeLocal(seg.startMs)} → ${formatTimeLocal(seg.endMs)}</div>
          <div>Duración: <strong class="font-mono text-zinc-100">${formatDurationHuman(seg.durationSec)}</strong></div>
          ${seg.sublabel ? `<div class="text-zinc-400">${escapeHtml(seg.sublabel)}</div>` : ''}
        `
      );
    });
    el.addEventListener('mousemove', moveReportTooltip);
    el.addEventListener('mouseleave', hideReportTooltip);
  });

  // Auditoría desplegable de eventos de tiempo muerto del día seleccionado
  if (day.deadEvents.length === 0) {
    deadListEl.innerHTML = `
      <div class="text-xs text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3.5 py-2.5">
        Sin tiempos muertos registrados en ${formatDateKeyDisplay(day.dateKey)}. Flujo continuo de Pomodoro.
      </div>
    `;
  } else {
    const rowsHtml = day.deadEvents
      .map((ev) => {
        const isPause = ev.kind === 'pause';
        const dotCls = isPause ? 'bg-amber-400' : 'bg-slate-400';
        const durCls = isPause ? 'text-amber-300' : 'text-slate-300';
        return `
          <div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-zinc-800/70 last:border-b-0 text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2 h-2 rounded-full shrink-0 ${dotCls}"></span>
              <span class="text-zinc-200 font-medium">${escapeHtml(ev.label)}</span>
              <span class="text-zinc-500 hidden sm:inline">· ${escapeHtml(ev.detail)}</span>
            </div>
            <div class="flex items-center gap-3 font-mono shrink-0">
              <span class="text-zinc-400">${formatTimeLocal(ev.startMs)} → ${formatTimeLocal(ev.endMs)}</span>
              <span class="font-semibold ${durCls}">${formatDurationHuman(ev.durationSec)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    deadListEl.innerHTML = `
      <details class="bg-zinc-950/60 border border-zinc-800/90 rounded-xl px-4 py-3 group">
        <summary class="cursor-pointer text-xs font-medium text-zinc-300 hover:text-zinc-100 flex items-center justify-between select-none">
          <span>Detalle de tiempos muertos del día (${day.deadEvents.length} ${day.deadEvents.length === 1 ? 'evento' : 'eventos'} · ${formatDurationHuman(day.deadTimeSec)})</span>
          <span class="text-zinc-500 text-[11px] group-open:hidden">Ver eventos ▾</span>
          <span class="text-zinc-500 text-[11px] hidden group-open:inline">Ocultar ▴</span>
        </summary>
        <div class="mt-2.5 pt-1 border-t border-zinc-800/80">
          ${rowsHtml}
        </div>
      </details>
    `;
  }
}

// -------------------------------------------------------------------------
// 5. DISTRIBUCIÓN DE ENFOQUE POR ETIQUETA / CATEGORÍA
// -------------------------------------------------------------------------

function renderTagBreakdown(data) {
  const container = document.getElementById('report-tags-list');
  const tags = data.tagBreakdown;

  if (tags.length === 0) {
    container.innerHTML = '<p class="text-xs text-zinc-500">Sin etiquetas registradas en este periodo.</p>';
    return;
  }

  const totalFocus = Math.max(data.focusSec, 1);

  container.innerHTML = tags
    .map((item) => {
      const pct = data.focusSec > 0 ? (item.focusSec / totalFocus) * 100 : 0;
      return `
        <div class="space-y-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-zinc-200 truncate">${escapeHtml(item.tag)}</span>
              <span class="text-[11px] text-zinc-500">${item.pomosCompleted} completados${item.pomosIncomplete > 0 ? ` · ${item.pomosIncomplete} inc.` : ''}</span>
            </div>
            <div class="flex items-center gap-3 font-mono shrink-0">
              ${item.pauseSec > 0 ? `<span class="text-[11px] text-amber-400/90" title="Pausas en bloques de esta etiqueta">Pausas: ${formatDurationHuman(item.pauseSec)}</span>` : ''}
              <span class="text-zinc-200 font-semibold">${formatDurationHuman(item.focusSec)}</span>
              <span class="text-rose-400 w-11 text-right">${formatPercent(item.focusSec, data.focusSec)}</span>
            </div>
          </div>
          <div class="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div class="h-full rounded-full bg-rose-500/90 transition-all" style="width:${pct.toFixed(1)}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}
