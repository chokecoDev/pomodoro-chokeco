/**
 * =========================================================================
 * REPORTES GRÁFICOS DE ENFOQUE: TRABAJO EFECTIVO VS. DESCANSOS VS. TIEMPO MUERTO
 * =========================================================================
 */

const reportFilters = {
  period: 'all',     // 'today' | '7d' | '30d' | 'all'
  tag: 'all',        // 'all' | string
  idleScope: 'day',  // 'day' (jornada completa) | 'batch' (solo dentro de cada carga)
  selectedDay: null, // 'YYYY-MM-DD'
};

let lastReportData = null;

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
  ['today', '7d', '30d', 'all'].forEach((p) => {
    const btn = document.getElementById(`report-period-${p}`);
    if (btn) btn.classList.toggle('is-active', reportFilters.period === p);
  });

  ['day', 'batch'].forEach((s) => {
    const btn = document.getElementById(`report-scope-${s}`);
    if (btn) btn.classList.toggle('is-active', reportFilters.idleScope === s);
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

  const merged = [];
  for (const item of intervals) {
    if (merged.length === 0 || item.startMs >= merged[merged.length - 1].endMs) {
      merged.push({ ...item });
    } else {
      merged[merged.length - 1].endMs = Math.max(merged[merged.length - 1].endMs, item.endMs);
    }
  }

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
    if (!byDayMap.has(dateKey)) byDayMap.set(dateKey, []);
    byDayMap.get(dateKey).push(log);
  }

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

      if (dayStats.spanStartMs === null || startMs < dayStats.spanStartMs) dayStats.spanStartMs = startMs;
      if (dayStats.spanEndMs === null || endMs > dayStats.spanEndMs) dayStats.spanEndMs = endMs;

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
      const subLbl = log.task_title ? `${log.tag || 'Trabajo'} · ${log.task_title}` : (log.tag || 'Sin etiqueta');

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
            sublabel: subLbl,
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
            sublabel: subLbl,
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
          sublabel: subLbl,
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
    <div style="font-weight:700;margin-bottom:4px;color:var(--text-primary);">${title}</div>
    <div style="font-size:11px;color:var(--text-secondary);display:flex;flex-direction:column;gap:2px;">${linesHtml}</div>
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
  document.getElementById('kpi-efficiency-sub').textContent = 'Enfoque vs. tiempo muerto (sin descansos)';
}

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
      textColor: 'var(--rose-text)',
      dotCls: 'dot-rose',
    },
    {
      key: 'break',
      label: 'Descansos',
      desc: 'Descansos cortos y largos del método',
      sec: data.breakSec,
      color: REPORT_COLORS.break,
      textColor: 'var(--emerald-text)',
      dotCls: 'dot-emerald',
    },
    {
      key: 'pause',
      label: 'Pausas en bloque',
      desc: 'Tiempo muerto · interrupciones registradas',
      sec: data.pauseSec,
      color: REPORT_COLORS.pause,
      textColor: 'var(--amber-text)',
      dotCls: 'dot-amber',
    },
    {
      key: 'idle',
      label: 'Sin avanzar',
      desc: 'Tiempo muerto · espera sin iniciar bloque',
      sec: data.idleGapSec,
      color: REPORT_COLORS.idle,
      textColor: 'var(--slate-text)',
      dotCls: 'dot-slate',
    },
  ];

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
          cx="100" cy="100" r="${r}" fill="none"
          stroke="${seg.color}" stroke-width="20"
          stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
          class="report-donut-segment"
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
    <div style="position:relative;width:196px;height:196px;margin:6px auto;display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 200 200" style="width:100%;height:100%;transform:rotate(-90deg);">
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="20" />
        ${circlesHtml}
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;padding:0 18px;">
        <span id="donut-center-label" class="tiny-text">${defaultCenterSub}</span>
        <span id="donut-center-pct" class="font-mono" style="font-size:28px;font-weight:700;line-height:1.15;margin-top:2px;">${defaultCenterPct}</span>
        <span id="donut-center-dur" class="font-mono tiny-text" style="margin-top:2px;">${defaultCenterDur}</span>
      </div>
    </div>
  `;

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
        `<div>Tiempo: <strong class="font-mono">${circle.dataset.segDur}</strong> (${circle.dataset.segPct})</div>
         <div>${circle.dataset.segDesc}</div>`
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

  legendContainer.innerHTML = segments
    .map((seg) => `
      <div class="list-row" style="padding:8px 0;">
        <div class="row-wrap" style="gap:9px;min-width:0;flex:1;flex-wrap:nowrap;">
          <span class="dot ${seg.dotCls}"></span>
          <div style="min-width:0;">
            <div style="font-size:12px;font-weight:600;">${seg.label}</div>
            <div class="tiny-text">${seg.desc}</div>
          </div>
        </div>
        <div class="font-mono" style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;font-weight:700;color:${seg.textColor};">${formatPercent(seg.sec, total)}</div>
          <div class="tiny-text">${formatDurationHuman(seg.sec)}</div>
        </div>
      </div>
    `)
    .join('');

  const stackedBar = document.getElementById('report-stacked-bar');
  const pctFocus = total > 0 ? (data.focusSec / total) * 100 : 0;
  const pctBreak = total > 0 ? (data.breakSec / total) * 100 : 0;
  const pctPause = total > 0 ? (data.pauseSec / total) * 100 : 0;
  const pctIdle = total > 0 ? (data.idleGapSec / total) * 100 : 0;

  stackedBar.innerHTML = `
    <div style="width:${pctFocus.toFixed(2)}%;background:${REPORT_COLORS.focus};" title="Trabajo efectivo: ${formatPercent(data.focusSec, total)}"></div>
    <div style="width:${pctBreak.toFixed(2)}%;background:${REPORT_COLORS.break};" title="Descansos: ${formatPercent(data.breakSec, total)}"></div>
    <div style="width:${pctPause.toFixed(2)}%;background:${REPORT_COLORS.pause};" title="Pausas: ${formatPercent(data.pauseSec, total)}"></div>
    <div style="width:${pctIdle.toFixed(2)}%;background:${REPORT_COLORS.idle};" title="Sin avanzar: ${formatPercent(data.idleGapSec, total)}"></div>
  `;

  document.getElementById('compare-flow-pct').textContent = formatPercent(data.productiveFlowSec, total);
  document.getElementById('compare-flow-dur').textContent = formatDurationHuman(data.productiveFlowSec);
  document.getElementById('compare-dead-pct').textContent = formatPercent(data.deadTimeSec, total);
  document.getElementById('compare-dead-dur').textContent = formatDurationHuman(data.deadTimeSec);

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

function renderDailyBarChart(data) {
  const container = document.getElementById('report-daily-chart');
  const days = data.dailySeries.slice(-14);

  if (days.length === 0) {
    container.innerHTML = '<p class="muted-text" style="text-align:center;padding:18px 0;">Sin datos diarios para graficar.</p>';
    return;
  }

  const maxTotalSec = Math.max(...days.map((d) => d.totalTrackedSec), 1);
  const svgWidth = 640;
  const svgHeight = 215;
  const padLeft = 44;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 32;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const gridHtml = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padTop + chartH * (1 - ratio);
      const labelSec = maxTotalSec * ratio;
      return `
        <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${svgWidth - padRight}" y2="${y.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1" stroke-dasharray="${ratio === 0 ? '' : '3 3'}" />
        <text x="${padLeft - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="ui-monospace, monospace">${formatDurationCompact(labelSec)}</text>
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

      let yCursor = padTop + chartH;
      const rects = [];
      const pushStack = (sec, fill) => {
        const h = (sec / maxTotalSec) * chartH;
        if (h <= 0.3) return;
        yCursor -= h;
        rects.push(`<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" rx="2" />`);
      };

      pushStack(day.focusSec, REPORT_COLORS.focus);
      pushStack(day.breakSec, REPORT_COLORS.break);
      pushStack(day.pauseSec, REPORT_COLORS.pause);
      pushStack(day.idleGapSec, REPORT_COLORS.idle);

      const highlightBg = isSelected
        ? `<rect x="${(x - 4).toFixed(1)}" y="${padTop}" width="${(barW + 8).toFixed(1)}" height="${chartH}" fill="rgba(244,63,94,0.1)" stroke="rgba(244,63,94,0.4)" stroke-width="1" rx="6" />`
        : '';

      return `
        <g class="report-bar-col" data-day-key="${day.dateKey}">
          ${highlightBg}
          <rect x="${(centerX - slotW / 2).toFixed(1)}" y="${padTop}" width="${slotW.toFixed(1)}" height="${chartH}" fill="transparent" />
          ${rects.join('')}
          <text x="${centerX.toFixed(1)}" y="${svgHeight - 10}" text-anchor="middle" fill="${isSelected ? 'var(--text-primary)' : 'var(--text-muted)'}" font-size="10" font-weight="${isSelected ? '700' : '500'}" font-family="ui-monospace, monospace">${formatDateKeyShort(day.dateKey)}</text>
        </g>
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%;height:auto;overflow:visible;">
      ${gridHtml}
      ${barsHtml}
    </svg>
  `;

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
          <div class="row-between"><span style="color:var(--rose-text);">● Trabajo</span><span class="font-mono">${formatDurationHuman(day.focusSec)} (${formatPercent(day.focusSec, t)})</span></div>
          <div class="row-between"><span style="color:var(--emerald-text);">● Descansos</span><span class="font-mono">${formatDurationHuman(day.breakSec)} (${formatPercent(day.breakSec, t)})</span></div>
          <div class="row-between"><span style="color:var(--amber-text);">● Pausas</span><span class="font-mono">${formatDurationHuman(day.pauseSec)} (${formatPercent(day.pauseSec, t)})</span></div>
          <div class="row-between"><span style="color:var(--slate-text);">● Sin avanzar</span><span class="font-mono">${formatDurationHuman(day.idleGapSec)} (${formatPercent(day.idleGapSec, t)})</span></div>
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

function renderTimelineSection(data) {
  const selectEl = document.getElementById('report-timeline-day');
  const stripEl = document.getElementById('report-timeline-strip');
  const metaEl = document.getElementById('report-timeline-meta');
  const deadListEl = document.getElementById('report-timeline-dead-list');

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
    stripEl.innerHTML = '<div class="muted-text" style="text-align:center;padding:12px 0;">No hay segmentos para este día.</div>';
    metaEl.textContent = '';
    deadListEl.innerHTML = '';
    return;
  }

  const totalSpanMs = Math.max(1000, day.spanEndMs - day.spanStartMs);
  metaEl.innerHTML = `
    <span>Ventana: <strong class="font-mono" style="color:var(--text-primary);">${formatTimeShortLocal(day.spanStartMs)} → ${formatTimeShortLocal(day.spanEndMs)}</strong> (${formatDurationHuman(totalSpanMs / 1000)})</span>
    <span>Trabajo: <strong class="font-mono" style="color:var(--rose-text);">${formatPercent(day.focusSec, day.totalTrackedSec)}</strong></span>
    <span>Descansos: <strong class="font-mono" style="color:var(--emerald-text);">${formatPercent(day.breakSec, day.totalTrackedSec)}</strong></span>
    <span>Muerto: <strong class="font-mono" style="color:var(--amber-text);">${formatPercent(day.deadTimeSec, day.totalTrackedSec)}</strong></span>
  `;

  const segBg = {
    focus: `background:${REPORT_COLORS.focus};`,
    break: `background:${REPORT_COLORS.break};`,
    pause: `background:${REPORT_COLORS.pause};`,
    idle: '',
    neutral_gap: '',
  };

  const barsHtml = day.segments
    .map((seg, idx) => {
      const widthPct = ((seg.endMs - seg.startMs) / totalSpanMs) * 100;
      const extraCls = seg.kind === 'idle'
        ? 'timeline-idle-pattern'
        : seg.kind === 'neutral_gap'
          ? 'timeline-neutral-gap'
          : '';
      return `
        <div
          class="timeline-segment ${extraCls}"
          style="width:${Math.max(widthPct, 0.35).toFixed(3)}%;${segBg[seg.kind] || ''}"
          data-seg-idx="${idx}"
        ></div>
      `;
    })
    .join('');

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => formatTimeShortLocal(day.spanStartMs + totalSpanMs * r));

  stripEl.innerHTML = `
    <div class="timeline-strip">${barsHtml}</div>
    <div class="row-between font-mono tiny-text" style="margin-top:6px;">
      <span>${ticks[0]}</span>
      <span>${ticks[2]}</span>
      <span>${ticks[4]}</span>
    </div>
  `;

  stripEl.querySelectorAll('.timeline-segment').forEach((el) => {
    const seg = day.segments[Number(el.dataset.segIdx)];
    if (!seg) return;

    el.addEventListener('mouseenter', (e) => {
      showReportTooltip(
        e,
        escapeHtml(seg.label),
        `
          <div class="font-mono">${formatTimeLocal(seg.startMs)} → ${formatTimeLocal(seg.endMs)}</div>
          <div>Duración: <strong class="font-mono">${formatDurationHuman(seg.durationSec)}</strong></div>
          ${seg.sublabel ? `<div>${escapeHtml(seg.sublabel)}</div>` : ''}
        `
      );
    });
    el.addEventListener('mousemove', moveReportTooltip);
    el.addEventListener('mouseleave', hideReportTooltip);
  });

  if (day.deadEvents.length === 0) {
    deadListEl.innerHTML = `
      <div class="badge badge-emerald" style="display:block;padding:10px 12px;border-radius:12px;">
        Sin tiempos muertos registrados en ${formatDateKeyDisplay(day.dateKey)}. Flujo continuo de Pomodoro.
      </div>
    `;
  } else {
    const rowsHtml = day.deadEvents
      .map((ev) => {
        const isPause = ev.kind === 'pause';
        return `
          <div class="list-row" style="padding:8px 0;font-size:12px;">
            <div class="row-wrap" style="gap:7px;min-width:0;flex:1;">
              <span class="dot ${isPause ? 'dot-amber' : 'dot-slate'}"></span>
              <span style="font-weight:600;">${escapeHtml(ev.label)}</span>
              <span class="tiny-text">· ${escapeHtml(ev.detail)}</span>
            </div>
            <div class="font-mono" style="display:flex;gap:10px;flex-shrink:0;font-size:11px;">
              <span class="muted-text">${formatTimeLocal(ev.startMs)} → ${formatTimeLocal(ev.endMs)}</span>
              <strong style="color:${isPause ? 'var(--amber-text)' : 'var(--slate-text)'};">${formatDurationHuman(ev.durationSec)}</strong>
            </div>
          </div>
        `;
      })
      .join('');

    deadListEl.innerHTML = `
      <details class="card-inset">
        <summary class="row-between" style="font-size:12px;font-weight:600;">
          <span>Detalle de tiempos muertos (${day.deadEvents.length} ${day.deadEvents.length === 1 ? 'evento' : 'eventos'} · ${formatDurationHuman(day.deadTimeSec)})</span>
          <span class="tiny-text when-closed">Ver eventos ▾</span>
          <span class="tiny-text when-open">Ocultar ▴</span>
        </summary>
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border-subtle);">${rowsHtml}</div>
      </details>
    `;
  }
}

function renderTagBreakdown(data) {
  const container = document.getElementById('report-tags-list');
  const tags = data.tagBreakdown;

  if (tags.length === 0) {
    container.innerHTML = '<p class="muted-text">Sin etiquetas registradas en este periodo.</p>';
    return;
  }

  const totalFocus = Math.max(data.focusSec, 1);
  container.innerHTML = tags
    .map((item) => {
      const pct = data.focusSec > 0 ? (item.focusSec / totalFocus) * 100 : 0;
      return `
        <div class="stack-sm" style="gap:5px;">
          <div class="row-between" style="font-size:12px;">
            <div class="row-wrap" style="gap:6px;">
              <strong>${escapeHtml(item.tag)}</strong>
              <span class="tiny-text">${item.pomosCompleted} comp.${item.pomosIncomplete > 0 ? ` · ${item.pomosIncomplete} inc.` : ''}</span>
            </div>
            <div class="font-mono row-wrap" style="gap:10px;">
              ${item.pauseSec > 0 ? `<span style="font-size:11px;color:var(--amber-text);">Pausas: ${formatDurationHuman(item.pauseSec)}</span>` : ''}
              <strong>${formatDurationHuman(item.focusSec)}</strong>
              <span style="color:var(--rose-text);min-width:38px;text-align:right;">${formatPercent(item.focusSec, data.focusSec)}</span>
            </div>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct.toFixed(1)}%;"></div>
          </div>
        </div>
      `;
    })
    .join('');
}
