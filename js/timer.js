/**
 * =========================================================================
 * CONFIGURACIÓN DE CARGA, MÁQUINA DE ESTADOS MANUAL Y MOTOR DE RELOJ
 * =========================================================================
 */

// =========================================================================
// CONFIGURACIÓN DE LA CARGA (SETUP)
// =========================================================================

function syncSetupInputsFromConfig() {
  const c = appState.config;
  document.getElementById('cfg-count').value = c.totalPomodoros;
  document.getElementById('cfg-pomo').value = c.pomodoroVal;
  document.getElementById('cfg-short').value = c.shortBreakVal;
  document.getElementById('cfg-long').value = c.longBreakVal;
  document.getElementById('cfg-long-every').value = c.longBreakInterval;
  document.getElementById('cfg-test-mode').checked = c.testMode;
  document.getElementById('cfg-tag').value = c.tag;
  updateUnitLabels();
  syncCountDisplay();
  highlightSelectedTagChip(c.tag);
}

function adjustCount(delta) {
  const input = document.getElementById('cfg-count');
  const next = Math.min(12, Math.max(1, parseInt(input.value, 10) + delta));
  input.value = next;
  syncCountDisplay();
}

function syncCountDisplay() {
  const count = parseInt(document.getElementById('cfg-count').value, 10) || 4;
  document.getElementById('cfg-count-display').textContent = `${count} ${count === 1 ? 'bloque' : 'bloques'}`;
  updateSetupSummary();
}

function onTestModeChange() {
  const isTest = document.getElementById('cfg-test-mode').checked;
  // Valores cómodos por defecto al activar/desactivar modo prueba
  if (isTest) {
    document.getElementById('cfg-pomo').value = 5;
    document.getElementById('cfg-short').value = 3;
    document.getElementById('cfg-long').value = 6;
  } else {
    document.getElementById('cfg-pomo').value = 25;
    document.getElementById('cfg-short').value = 5;
    document.getElementById('cfg-long').value = 15;
  }
  updateUnitLabels();
  updateSetupSummary();
}

function updateUnitLabels() {
  const isTest = document.getElementById('cfg-test-mode').checked;
  const label = isTest ? 'seg' : 'min';
  document.querySelectorAll('.unit-label').forEach((el) => {
    el.textContent = label;
  });
}

function updateSetupSummary() {
  const count = parseInt(document.getElementById('cfg-count').value, 10) || 4;
  const pomo = parseInt(document.getElementById('cfg-pomo').value, 10) || 25;
  const shortB = parseInt(document.getElementById('cfg-short').value, 10) || 5;
  const longB = parseInt(document.getElementById('cfg-long').value, 10) || 15;
  const unit = document.getElementById('cfg-test-mode').checked ? 'seg' : 'min';
  document.getElementById('setup-summary').textContent =
    `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'} de ${pomo} ${unit} · Descansos de ${shortB} / ${longB} ${unit}`;
}

function selectTag(tag) {
  document.getElementById('cfg-tag').value = tag;
  highlightSelectedTagChip(tag);
}

function highlightSelectedTagChip(tag) {
  document.querySelectorAll('.tag-chip').forEach((btn) => {
    const isSelected = btn.textContent.trim().toLowerCase() === tag.trim().toLowerCase();
    if (isSelected) {
      btn.className = 'tag-chip px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/50 transition-colors';
    } else {
      btn.className = 'tag-chip px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/80 hover:border-rose-500/60 transition-colors';
    }
  });
}

/** Prepara la carga y pasa a READY_POMODORO sin arrancar el reloj */
function prepareBatch() {
  // Desbloquea audio en interacción del usuario
  getAudioContext();

  const totalPomodoros = Math.min(12, Math.max(1, parseInt(document.getElementById('cfg-count').value, 10) || 4));
  const pomodoroVal = Math.min(180, Math.max(1, parseInt(document.getElementById('cfg-pomo').value, 10) || 25));
  const shortBreakVal = Math.min(60, Math.max(1, parseInt(document.getElementById('cfg-short').value, 10) || 5));
  const longBreakVal = Math.min(90, Math.max(1, parseInt(document.getElementById('cfg-long').value, 10) || 15));
  const longBreakInterval = Math.min(12, Math.max(2, parseInt(document.getElementById('cfg-long-every').value, 10) || 4));
  const testMode = document.getElementById('cfg-test-mode').checked;
  const rawTag = document.getElementById('cfg-tag').value.trim();
  const tag = rawTag || 'Sin etiqueta';

  appState = {
    phase: PHASE.READY_POMODORO,
    config: {
      totalPomodoros,
      pomodoroVal,
      shortBreakVal,
      longBreakVal,
      longBreakInterval,
      testMode,
      tag,
    },
    batchId: generateId('batch'),
    currentPomodoro: 1,
    completedPomodorosInBatch: 0,
    targetEndTime: null,
    remainingMsAtPause: null,
    activeBlock: null,
  };

  saveState();
  renderApp();
  showToast('Carga preparada. Presiona Iniciar cuando estés listo.', 'info');
}

// =========================================================================
// MÁQUINA DE ESTADOS — TRANSICIONES ESTRICTAMENTE MANUALES
// =========================================================================

/** Inicia manualmente el Pomodoro actual */
function startPomodoro() {
  if (appState.phase !== PHASE.READY_POMODORO) return;
  getAudioContext();

  const durationSec = getPlannedDurationSec('pomodoro');
  const nowIso = new Date().toISOString();

  appState.activeBlock = {
    id: generateId('log'),
    batch_id: appState.batchId,
    type: 'pomodoro',
    tag: appState.config.tag,
    planned_duration_sec: durationSec,
    started_at: nowIso,
    ended_at: null,
    pauses: [],
    total_paused_sec: 0,
    status: 'in_progress',
  };

  appState.targetEndTime = Date.now() + durationSec * 1000;
  appState.remainingMsAtPause = null;
  appState.phase = PHASE.RUNNING_POMODORO;

  saveState();
  renderApp();
  startTicking();
}

/** Inicia manualmente el Descanso actual (corto o largo) */
function startBreak() {
  if (appState.phase !== PHASE.READY_BREAK) return;
  getAudioContext();

  const breakType = getCurrentBreakType();
  const durationSec = getPlannedDurationSec(breakType);
  const nowIso = new Date().toISOString();

  appState.activeBlock = {
    id: generateId('log'),
    batch_id: appState.batchId,
    type: breakType,
    tag: appState.config.tag,
    planned_duration_sec: durationSec,
    started_at: nowIso,
    ended_at: null,
    pauses: [],
    total_paused_sec: 0,
    status: 'in_progress',
  };

  appState.targetEndTime = Date.now() + durationSec * 1000;
  appState.remainingMsAtPause = null;
  appState.phase = PHASE.RUNNING_BREAK;

  saveState();
  renderApp();
  startTicking();
}

/** Salta el descanso en estado READY_BREAK y avanza manualmente */
function skipBreak() {
  if (appState.phase !== PHASE.READY_BREAK) return;
  advanceAfterBreak();
  showToast('Descanso saltado', 'info');
}

/** Pausa el bloque en curso (Pomodoro o Descanso) registrando paused_at exacto */
function pauseBlock() {
  if (appState.phase !== PHASE.RUNNING_POMODORO && appState.phase !== PHASE.RUNNING_BREAK) return;

  const nowMs = Date.now();
  appState.remainingMsAtPause = Math.max(0, appState.targetEndTime - nowMs);
  appState.targetEndTime = null;

  if (appState.activeBlock) {
    appState.activeBlock.pauses.push({
      paused_at: new Date(nowMs).toISOString(),
      resumed_at: null,
    });
  }

  appState.phase = appState.phase === PHASE.RUNNING_POMODORO
    ? PHASE.PAUSED_POMODORO
    : PHASE.PAUSED_BREAK;

  stopTicking();
  saveState();
  renderApp();
}

/** Reanuda un bloque pausado cerrando la pausa con resumed_at y recalculando targetEndTime */
function resumeBlock() {
  if (appState.phase !== PHASE.PAUSED_POMODORO && appState.phase !== PHASE.PAUSED_BREAK) return;
  getAudioContext();

  const nowMs = Date.now();
  if (appState.activeBlock && appState.activeBlock.pauses.length > 0) {
    const lastPause = appState.activeBlock.pauses[appState.activeBlock.pauses.length - 1];
    if (lastPause && !lastPause.resumed_at) {
      lastPause.resumed_at = new Date(nowMs).toISOString();
    }
  }

  appState.targetEndTime = nowMs + (appState.remainingMsAtPause || 0);
  appState.remainingMsAtPause = null;
  appState.phase = appState.phase === PHASE.PAUSED_POMODORO
    ? PHASE.RUNNING_POMODORO
    : PHASE.RUNNING_BREAK;

  saveState();
  renderApp();
  startTicking();
}

/** Finaliza un bloque al llegar a 00:00 (con hora exacta de fin) */
function completeCurrentBlock(exactEndTimeMs) {
  stopTicking();

  const endMs = exactEndTimeMs || Date.now();
  const wasPomodoro = appState.phase === PHASE.RUNNING_POMODORO;

  if (appState.activeBlock) {
    const record = {
      ...appState.activeBlock,
      ended_at: new Date(endMs).toISOString(),
      total_paused_sec: calculateTotalPausedSec(appState.activeBlock.pauses),
      status: 'completed',
    };
    historyLogs.unshift(record);
    saveHistory();
  }

  appState.activeBlock = null;
  appState.targetEndTime = null;
  appState.remainingMsAtPause = null;

  if (wasPomodoro) {
    appState.completedPomodorosInBatch += 1;
    playPomodoroCompleteSound();
    appState.phase = PHASE.READY_BREAK;
    saveState();
    renderApp();
    renderTodaySummary();
    if (currentMainTab === 'history') {
      populateTagFilter();
      refreshActiveHistoryView();
    }
    showToast('¡Pomodoro completado! Listo para iniciar descanso.', 'success');
  } else {
    playBreakCompleteSound();
    advanceAfterBreak();
    renderTodaySummary();
    if (currentMainTab === 'history') {
      populateTagFilter();
      refreshActiveHistoryView();
    }
    showToast('¡Descanso completado! Listo para continuar.', 'success');
  }
}

/** Transición después de terminar o saltar un descanso */
function advanceAfterBreak() {
  if (appState.currentPomodoro >= appState.config.totalPomodoros) {
    appState.phase = PHASE.BATCH_COMPLETED;
  } else {
    appState.currentPomodoro += 1;
    appState.phase = PHASE.READY_POMODORO;
  }
  saveState();
  renderApp();
}

// =========================================================================
// DETENER BLOQUE (MODAL: GUARDAR COMO INCOMPLETO O DESCARTAR)
// =========================================================================

function openStopModal() {
  isStopModalOpen = true;
  openModal('modal-stop');
}

function closeStopModal() {
  isStopModalOpen = false;
  closeModal('modal-stop');
  // Si el reloj siguió corriendo y ya venció mientras el modal estaba abierto, procesar tick
  if (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK) {
    onTick();
  }
}

function confirmStopBlock(action) {
  isStopModalOpen = false;
  closeModal('modal-stop');
  stopTicking();

  const isPomodoro = appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.PAUSED_POMODORO;

  if (action === 'incomplete' && appState.activeBlock) {
    const nowIso = new Date().toISOString();
    // Si estaba en pausa, cerramos esa última pausa con la hora de detención
    if (appState.activeBlock.pauses.length > 0) {
      const lastPause = appState.activeBlock.pauses[appState.activeBlock.pauses.length - 1];
      if (lastPause && !lastPause.resumed_at) {
        lastPause.resumed_at = nowIso;
      }
    }
    const record = {
      ...appState.activeBlock,
      ended_at: nowIso,
      total_paused_sec: calculateTotalPausedSec(appState.activeBlock.pauses),
      status: 'incomplete',
    };
    historyLogs.unshift(record);
    saveHistory();

    appState.activeBlock = null;
    appState.targetEndTime = null;
    appState.remainingMsAtPause = null;

    if (isPomodoro) {
      appState.phase = PHASE.READY_BREAK;
    } else {
      advanceAfterBreak();
      renderTodaySummary();
      if (currentMainTab === 'history') {
        populateTagFilter();
        refreshActiveHistoryView();
      }
      showToast('Descanso guardado como incompleto.', 'warning');
      return;
    }

    saveState();
    renderApp();
    renderTodaySummary();
    if (currentMainTab === 'history') {
      populateTagFilter();
      refreshActiveHistoryView();
    }
    showToast('Bloque guardado como incompleto en el histórico.', 'warning');
  } else {
    // Descartar bloque: no se guarda nada y se vuelve al estado de espera del mismo bloque
    appState.activeBlock = null;
    appState.targetEndTime = null;
    appState.remainingMsAtPause = null;
    appState.phase = isPomodoro ? PHASE.READY_POMODORO : PHASE.READY_BREAK;
    saveState();
    renderApp();
    showToast('Bloque descartado.', 'info');
  }
}

// =========================================================================
// CAMBIAR CARGA / REINICIAR A SETUP
// =========================================================================

function openCancelBatchModal() {
  openModal('modal-cancel-batch');
}

function confirmCancelBatch() {
  closeModal('modal-cancel-batch');
  resetToSetup();
}

function resetToSetup() {
  stopTicking();
  appState.phase = PHASE.SETUP;
  appState.activeBlock = null;
  appState.targetEndTime = null;
  appState.remainingMsAtPause = null;
  appState.batchId = null;
  appState.currentPomodoro = 1;
  appState.completedPomodorosInBatch = 0;
  saveState();
  syncSetupInputsFromConfig();
  renderApp();
}

// =========================================================================
// MOTOR DE RELOJ BASADO EN DATE.NOW() (SIN DESFASES EN SEGUNDO PLANO)
// =========================================================================

function startTicking() {
  stopTicking();
  onTick();
  tickInterval = setInterval(onTick, 200);
}

function stopTicking() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function onTick() {
  if (isStopModalOpen) return;
  if (appState.phase !== PHASE.RUNNING_POMODORO && appState.phase !== PHASE.RUNNING_BREAK) {
    stopTicking();
    return;
  }
  if (!appState.targetEndTime) return;

  const now = Date.now();
  const remainingMs = appState.targetEndTime - now;

  if (remainingMs <= 0) {
    completeCurrentBlock(appState.targetEndTime);
    return;
  }

  updateTimerVisuals(remainingMs);
}

/** Actualiza el texto del reloj, anillo SVG y document.title */
function updateTimerVisuals(remainingMs) {
  const totalPlannedSec = appState.activeBlock
    ? appState.activeBlock.planned_duration_sec
    : getPlannedDurationSec(
        appState.phase === PHASE.READY_BREAK ? getCurrentBreakType() : 'pomodoro'
      );

  const remainingSec = Math.max(0, remainingMs / 1000);
  const formatted = formatTimer(remainingSec);

  document.getElementById('timer-display').textContent = formatted;

  // Progreso del anillo (0 = lleno al inicio, RING_CIRCUMFERENCE = vacío al final)
  const ratio = totalPlannedSec > 0 ? Math.min(1, Math.max(0, remainingSec / totalPlannedSec)) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  document.getElementById('progress-ring').style.strokeDashoffset = offset;

  // Actualizar título de la pestaña
  updateDocumentTitle(formatted);
}

function updateDocumentTitle(formattedTime) {
  switch (appState.phase) {
    case PHASE.RUNNING_POMODORO:
      document.title = `[${formattedTime}] Enfoque (${appState.currentPomodoro}/${appState.config.totalPomodoros}) · Pomodoro Pro`;
      break;
    case PHASE.PAUSED_POMODORO:
      document.title = `[PAUSA ${formattedTime}] Enfoque · Pomodoro Pro`;
      break;
    case PHASE.RUNNING_BREAK:
      document.title = `[${formattedTime}] Descanso · Pomodoro Pro`;
      break;
    case PHASE.PAUSED_BREAK:
      document.title = `[PAUSA ${formattedTime}] Descanso · Pomodoro Pro`;
      break;
    case PHASE.READY_POMODORO:
      document.title = `Listo: Pomodoro ${appState.currentPomodoro}/${appState.config.totalPomodoros} · Pomodoro Pro`;
      break;
    case PHASE.READY_BREAK:
      document.title = `Listo: Descanso · Pomodoro Pro`;
      break;
    default:
      document.title = 'Pomodoro Pro — Enfoque con Control Manual';
  }
}

// =========================================================================
// RENDERIZADO DE LA INTERFAZ DEL TEMPORIZADOR
// =========================================================================

function renderApp() {
  const setupPanel = document.getElementById('setup-panel');
  const activePanel = document.getElementById('active-panel');
  const completedPanel = document.getElementById('completed-panel');

  setupPanel.classList.add('hidden');
  activePanel.classList.add('hidden');
  completedPanel.classList.add('hidden');

  if (appState.phase === PHASE.SETUP) {
    setupPanel.classList.remove('hidden');
    updateDocumentTitle('');
    setBrandAccent('rose');
    return;
  }

  if (appState.phase === PHASE.BATCH_COMPLETED) {
    completedPanel.classList.remove('hidden');
    document.getElementById('completed-summary').textContent =
      `Completaste tu carga de ${appState.config.totalPomodoros} ${appState.config.totalPomodoros === 1 ? 'bloque' : 'bloques'} en "${appState.config.tag}". Todos los registros están guardados con hora exacta.`;
    updateDocumentTitle('');
    setBrandAccent('emerald');
    return;
  }

  // Estados activos o en espera
  activePanel.classList.remove('hidden');

  const statusBadge = document.getElementById('status-badge');
  const statusPulse = document.getElementById('status-pulse');
  const statusText = document.getElementById('status-text');
  const phaseSubtitle = document.getElementById('phase-subtitle');
  const ring = document.getElementById('progress-ring');
  const pauseMeta = document.getElementById('pause-meta');
  const controls = document.getElementById('timer-controls');

  document.getElementById('active-tag-badge').textContent = appState.config.tag;
  document.getElementById('test-mode-indicator').classList.toggle('hidden', !appState.config.testMode);

  const n = appState.currentPomodoro;
  const total = appState.config.totalPomodoros;
  const breakType = getCurrentBreakType();
  const breakLabel = breakType === 'long_break' ? 'Descanso Largo' : 'Descanso Corto';

  // Cantidad de pausas del bloque activo
  const pausesCount = appState.activeBlock ? appState.activeBlock.pauses.length : 0;
  pauseMeta.textContent = '';

  if (appState.phase === PHASE.READY_POMODORO) {
    setBrandAccent('rose');
    ring.style.stroke = '#f43f5e';
    statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/10 text-rose-400 border-rose-500/30';
    statusPulse.className = 'w-2 h-2 rounded-full bg-rose-400';
    statusText.textContent = `Listo para Pomodoro ${n} / ${total}`;
    phaseSubtitle.textContent = 'En espera · Enfoque';

    const plannedMs = getPlannedDurationSec('pomodoro') * 1000;
    updateTimerVisuals(plannedMs);

    controls.innerHTML = `
      <button type="button" onclick="startPomodoro()" class="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 active:scale-[0.99] text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-500/25 transition-all flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Iniciar Pomodoro
      </button>
    `;
  } else if (appState.phase === PHASE.RUNNING_POMODORO) {
    setBrandAccent('rose');
    ring.style.stroke = '#f43f5e';
    statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-rose-500/15 text-rose-300 border-rose-500/40';
    statusPulse.className = 'w-2 h-2 rounded-full bg-rose-400 animate-pulse';
    statusText.textContent = `Pomodoro ${n} / ${total} en curso`;
    phaseSubtitle.textContent = 'Enfoque activo';
    if (pausesCount > 0) {
      pauseMeta.textContent = `${pausesCount} ${pausesCount === 1 ? 'pausa registrada' : 'pausas registradas'}`;
    }

    const remMs = Math.max(0, (appState.targetEndTime || Date.now()) - Date.now());
    updateTimerVisuals(remMs);

    controls.innerHTML = `
      <button type="button" onclick="pauseBlock()" class="px-6 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-sm transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        Pausar
      </button>
      <button type="button" onclick="openStopModal()" class="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-colors flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
        Detener
      </button>
    `;
  } else if (appState.phase === PHASE.PAUSED_POMODORO) {
    setBrandAccent('amber');
    ring.style.stroke = '#f59e0b';
    statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-amber-500/15 text-amber-300 border-amber-500/40';
    statusPulse.className = 'w-2 h-2 rounded-full bg-amber-400';
    statusText.textContent = `Pomodoro ${n} / ${total} pausado`;
    phaseSubtitle.textContent = 'En pausa';
    pauseMeta.textContent = `Pausa #${pausesCount} activa`;

    updateTimerVisuals(appState.remainingMsAtPause || 0);

    controls.innerHTML = `
      <button type="button" onclick="resumeBlock()" class="px-7 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Reanudar
      </button>
      <button type="button" onclick="openStopModal()" class="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-colors flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
        Detener
      </button>
    `;
  } else if (appState.phase === PHASE.READY_BREAK) {
    setBrandAccent('emerald');
    ring.style.stroke = '#10b981';
    statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    statusPulse.className = 'w-2 h-2 rounded-full bg-emerald-400';
    statusText.textContent = `Listo para ${breakLabel}`;
    phaseSubtitle.textContent = 'En espera · Descanso';

    const plannedMs = getPlannedDurationSec(breakType) * 1000;
    updateTimerVisuals(plannedMs);

    const skipLabel = n >= total ? 'Saltar y finalizar carga' : 'Saltar descanso';
    controls.innerHTML = `
      <button type="button" onclick="startBreak()" class="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-zinc-950 font-semibold text-sm sm:text-base shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Iniciar ${breakLabel}
      </button>
      <button type="button" onclick="skipBreak()" class="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors">
        ${skipLabel}
      </button>
    `;
  } else if (appState.phase === PHASE.RUNNING_BREAK) {
    setBrandAccent('emerald');
    ring.style.stroke = '#10b981';
    statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    statusPulse.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    statusText.textContent = `${breakLabel} en curso`;
    phaseSubtitle.textContent = 'Descanso activo';
    if (pausesCount > 0) {
      pauseMeta.textContent = `${pausesCount} ${pausesCount === 1 ? 'pausa registrada' : 'pausas registradas'}`;
    }

    const remMs = Math.max(0, (appState.targetEndTime || Date.now()) - Date.now());
    updateTimerVisuals(remMs);

    controls.innerHTML = `
      <button type="button" onclick="pauseBlock()" class="px-6 py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold text-sm transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        Pausar
      </button>
      <button type="button" onclick="openStopModal()" class="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-colors flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
        Detener
      </button>
    `;
  } else if (appState.phase === PHASE.PAUSED_BREAK) {
    setBrandAccent('amber');
    ring.style.stroke = '#f59e0b';
    statusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-amber-500/15 text-amber-300 border-amber-500/40';
    statusPulse.className = 'w-2 h-2 rounded-full bg-amber-400';
    statusText.textContent = `${breakLabel} pausado`;
    phaseSubtitle.textContent = 'Descanso en pausa';
    pauseMeta.textContent = `Pausa #${pausesCount} activa`;

    updateTimerVisuals(appState.remainingMsAtPause || 0);

    controls.innerHTML = `
      <button type="button" onclick="resumeBlock()" class="px-7 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Reanudar
      </button>
      <button type="button" onclick="openStopModal()" class="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-colors flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
        Detener
      </button>
    `;
  }

  renderBatchBlocksIndicator();
}

/** Dibuja los indicadores de progreso de cada bloque de la carga */
function renderBatchBlocksIndicator() {
  const container = document.getElementById('batch-blocks-indicator');
  const total = appState.config.totalPomodoros;
  const current = appState.currentPomodoro;
  const inBreakPhase =
    appState.phase === PHASE.READY_BREAK ||
    appState.phase === PHASE.RUNNING_BREAK ||
    appState.phase === PHASE.PAUSED_BREAK;

  let html = '';
  for (let i = 1; i <= total; i++) {
    let cls = 'h-2.5 w-8 sm:w-10 rounded-full transition-all ';
    if (i < current || (i === current && inBreakPhase)) {
      cls += 'bg-rose-500'; // Completado
    } else if (i === current) {
      cls += appState.phase === PHASE.PAUSED_POMODORO
        ? 'bg-amber-400 ring-2 ring-amber-400/30'
        : 'bg-rose-400/80 ring-2 ring-rose-500/40';
    } else {
      cls += 'bg-zinc-800';
    }
    html += `<div class="${cls}" title="Pomodoro ${i} de ${total}"></div>`;
  }
  container.innerHTML = html;
  document.getElementById('batch-progress-label').textContent = `Bloque ${current} de ${total}`;
}
