/**
 * =========================================================================
 * MÓDULO 2: ENFOQUE (POMODORO CON VINCULACIÓN DE TAREA, WAKE LOCK Y CONTROL MANUAL)
 * =========================================================================
 */

// =========================================================================
// CONFIGURACIÓN DE LA CARGA (SETUP) Y VINCULACIÓN CON TAREA
// =========================================================================

function populateTaskLinkSelect() {
  const selects = [
    document.getElementById('cfg-linked-task'),
    document.getElementById('active-linked-task'),
  ].filter(Boolean);

  if (selects.length === 0) return;

  const todayTasks = getTodayTasks()
    .filter((t) => !t.completed)
    .sort((a, b) => (a.priority === 'top3' ? -1 : 1) - (b.priority === 'top3' ? -1 : 1));

  selects.forEach((select) => {
    let html = '<option value="">Sin tarea vinculada</option>';
    const top3 = todayTasks.filter((t) => t.priority === 'top3');
    const general = todayTasks.filter((t) => t.priority !== 'top3');

    if (top3.length > 0) {
      html += '<optgroup label="Top 3 de hoy">';
      top3.forEach((t) => {
        html += `<option value="${t.id}">★ ${escapeHtml(t.title)}</option>`;
      });
      html += '</optgroup>';
    }

    if (general.length > 0) {
      html += '<optgroup label="Checklist general">';
      general.forEach((t) => {
        html += `<option value="${t.id}">${escapeHtml(t.title)}</option>`;
      });
      html += '</optgroup>';
    }

    select.innerHTML = html;

    if (appState.config.linkedTaskId && todayTasks.some((t) => t.id === appState.config.linkedTaskId)) {
      select.value = appState.config.linkedTaskId;
    } else {
      select.value = '';
    }
  });
}

function onLinkedTaskChange(sourceSelectId) {
  const select = document.getElementById(sourceSelectId);
  if (!select) return;
  const taskId = select.value || null;
  const task = taskId ? tasksList.find((t) => t.id === taskId) : null;

  appState.config.linkedTaskId = task ? task.id : null;
  appState.config.linkedTaskTitle = task ? task.title : null;
  if (task && task.tag && appState.phase === PHASE.SETUP) {
    document.getElementById('cfg-tag').value = task.tag;
    highlightSelectedTagChip(task.tag);
  }
  saveState();
  populateTaskLinkSelect();
  renderLinkedTaskBadge();
}

function renderLinkedTaskBadge() {
  const badgeWrap = document.getElementById('active-task-banner');
  const titleEl = document.getElementById('active-task-title');
  if (!badgeWrap || !titleEl) return;

  if (appState.config.linkedTaskTitle) {
    badgeWrap.classList.remove('hidden');
    titleEl.textContent = appState.config.linkedTaskTitle;
  } else {
    badgeWrap.classList.add('hidden');
  }
}

function syncSetupInputsFromConfig() {
  const c = appState.config;
  document.getElementById('cfg-count').value = c.totalPomodoros;
  document.getElementById('cfg-pomo').value = c.pomodoroVal;
  document.getElementById('cfg-short').value = c.shortBreakVal;
  document.getElementById('cfg-long').value = c.longBreakVal;
  document.getElementById('cfg-long-every').value = c.longBreakInterval;
  document.getElementById('cfg-test-mode').checked = c.testMode;
  document.getElementById('cfg-tag').value = c.tag;

  const wakeEl = document.getElementById('cfg-wake-lock');
  if (wakeEl) wakeEl.checked = Boolean(userPrefs.wakeLockEnabled);
  const activeWakeEl = document.getElementById('active-wake-lock');
  if (activeWakeEl) activeWakeEl.checked = Boolean(userPrefs.wakeLockEnabled);

  updateUnitLabels();
  syncCountDisplay();
  highlightSelectedTagChip(c.tag);
  populateTaskLinkSelect();
}

function toggleWakeLockPref(checkboxEl) {
  const enabled = Boolean(checkboxEl.checked);
  if (enabled && (typeof navigator === 'undefined' || !('wakeLock' in navigator))) {
    showToast('Tu navegador no soporta Wake Lock para mantener la pantalla activa.', 'warning');
  }
  userPrefs.wakeLockEnabled = enabled;
  savePrefs();

  ['cfg-wake-lock', 'active-wake-lock', 'setting-wake-lock'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = enabled;
  });

  syncWakeLock();
  triggerHaptic(10);
  showToast(enabled ? 'Pantalla activa activada durante el enfoque.' : 'Pantalla activa desactivada.', 'info');
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
  if (isTest) {
    document.getElementById('cfg-pomo').value = 5;
    document.getElementById('cfg-short').value = 3;
    document.getElementById('cfg-long').value = 6;
  } else {
    document.getElementById('cfg-pomo').value = userPrefs.defaultPomodoroMin || 25;
    document.getElementById('cfg-short').value = userPrefs.defaultShortBreakMin || 5;
    document.getElementById('cfg-long').value = userPrefs.defaultLongBreakMin || 15;
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
    `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'} de ${pomo} ${unit} · Descansos ${shortB} / ${longB} ${unit}`;
}

function selectTag(tag) {
  document.getElementById('cfg-tag').value = tag;
  highlightSelectedTagChip(tag);
}

function highlightSelectedTagChip(tag) {
  document.querySelectorAll('.tag-chip').forEach((btn) => {
    const isSelected = btn.textContent.trim().toLowerCase() === String(tag || '').trim().toLowerCase();
    btn.classList.toggle('is-selected', isSelected);
  });
}

/** Prepara la carga y pasa a READY_POMODORO sin arrancar el reloj */
function prepareBatch() {
  getAudioContext();

  const totalPomodoros = Math.min(12, Math.max(1, parseInt(document.getElementById('cfg-count').value, 10) || 4));
  const pomodoroVal = Math.min(180, Math.max(1, parseInt(document.getElementById('cfg-pomo').value, 10) || 25));
  const shortBreakVal = Math.min(60, Math.max(1, parseInt(document.getElementById('cfg-short').value, 10) || 5));
  const longBreakVal = Math.min(90, Math.max(1, parseInt(document.getElementById('cfg-long').value, 10) || 15));
  const longBreakInterval = Math.min(12, Math.max(2, parseInt(document.getElementById('cfg-long-every').value, 10) || 4));
  const testMode = document.getElementById('cfg-test-mode').checked;
  const rawTag = document.getElementById('cfg-tag').value.trim();
  const tag = rawTag || 'Sin etiqueta';

  const taskSelect = document.getElementById('cfg-linked-task');
  const linkedTaskId = taskSelect && taskSelect.value ? taskSelect.value : null;
  const linkedTask = linkedTaskId ? tasksList.find((t) => t.id === linkedTaskId) : null;

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
      linkedTaskId: linkedTask ? linkedTask.id : null,
      linkedTaskTitle: linkedTask ? linkedTask.title : null,
    },
    batchId: generateId('batch'),
    currentPomodoro: 1,
    completedPomodorosInBatch: 0,
    targetEndTime: null,
    remainingMsAtPause: null,
    activeBlock: null,
    lastPomodoroEndedAt: null,
    lastBreakCompletedType: null,
    pendingChallengeId: null,
  };

  if (typeof stopWaitingOverdueWatcher === 'function') stopWaitingOverdueWatcher();
  saveState();
  triggerHaptic(14);
  renderApp();
  showToast('Carga preparada. Presiona Iniciar cuando estés listo.', 'info');
}

// =========================================================================
// MÁQUINA DE ESTADOS — TRANSICIONES ESTRICTAMENTE MANUALES
// =========================================================================

function startPomodoro(bypassChallenge = false) {
  if (appState.phase !== PHASE.READY_POMODORO) return;

  if (!bypassChallenge && typeof checkChallengeBeforeStartPomodoro === 'function') {
    if (checkChallengeBeforeStartPomodoro()) return;
  }

  getAudioContext();
  if (typeof stopWaitingOverdueWatcher === 'function') stopWaitingOverdueWatcher();

  const durationSec = getPlannedDurationSec('pomodoro');
  const nowIso = new Date().toISOString();

  appState.lastPomodoroEndedAt = null;
  appState.lastBreakCompletedType = null;
  appState.pendingChallengeId = null;

  appState.activeBlock = {
    id: generateId('log'),
    batch_id: appState.batchId,
    type: 'pomodoro',
    tag: appState.config.tag,
    task_id: appState.config.linkedTaskId || null,
    task_title: appState.config.linkedTaskTitle || null,
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
  triggerHaptic(18);
  syncWakeLock();
  renderApp();
  startTicking();
}

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
    task_id: appState.config.linkedTaskId || null,
    task_title: appState.config.linkedTaskTitle || null,
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
  triggerHaptic(15);
  syncWakeLock();
  renderApp();
  startTicking();
}

/** Salta la fase actual en espera (Descanso o Pomodoro) manualmente */
function skipBreak() {
  if (appState.phase !== PHASE.READY_BREAK) return;
  triggerHaptic(12);
  advanceAfterBreak();
  showToast('Descanso saltado.', 'info');
}

function skipCurrentPhase() {
  if (appState.phase === PHASE.READY_BREAK) {
    skipBreak();
    return;
  }
  if (appState.phase === PHASE.READY_POMODORO) {
    triggerHaptic(12);
    appState.phase = PHASE.READY_BREAK;
    saveState();
    renderApp();
    showToast('Pomodoro saltado. Pasaste a descanso.', 'info');
  }
}

/** Reinicia el bloque actual (descarta el progreso parcial y lo deja listo en 100%) */
function resetCurrentBlock() {
  const isPomo = appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.PAUSED_POMODORO;
  const isBreak = appState.phase === PHASE.RUNNING_BREAK || appState.phase === PHASE.PAUSED_BREAK;
  if (!isPomo && !isBreak) return;

  stopTicking();
  releaseWakeLock();
  appState.activeBlock = null;
  appState.targetEndTime = null;
  appState.remainingMsAtPause = null;
  appState.phase = isPomo ? PHASE.READY_POMODORO : PHASE.READY_BREAK;

  saveState();
  triggerHaptic(14);
  renderApp();
  showToast('Bloque reiniciado.', 'info');
}

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
  releaseWakeLock();
  saveState();
  triggerHaptic(14);
  renderApp();
}

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
  triggerHaptic(16);
  syncWakeLock();
  renderApp();
  startTicking();
}

function completeCurrentBlock(exactEndTimeMs) {
  stopTicking();
  releaseWakeLock();

  const endMs = exactEndTimeMs || Date.now();
  const wasPomodoro = appState.phase === PHASE.RUNNING_POMODORO;
  const completedType = appState.activeBlock ? appState.activeBlock.type : null;

  if (appState.activeBlock) {
    const pausedSec = calculateTotalPausedSec(appState.activeBlock.pauses);
    const startMs = new Date(appState.activeBlock.started_at).getTime();
    const wallSec = Math.max(0, (endMs - startMs) / 1000);
    const activeSec = Math.max(0, wallSec - pausedSec);

    const record = {
      ...appState.activeBlock,
      ended_at: new Date(endMs).toISOString(),
      total_paused_sec: pausedSec,
      status: 'completed',
    };
    historyLogs.unshift(record);
    saveHistory();

    if (wasPomodoro && record.task_id) {
      addFocusedTimeToTask(record.task_id, activeSec, true);
    }
  }

  appState.activeBlock = null;
  appState.targetEndTime = null;
  appState.remainingMsAtPause = null;

  if (wasPomodoro) {
    appState.completedPomodorosInBatch += 1;
    appState.lastPomodoroEndedAt = endMs;
    appState.lastBreakCompletedType = null;
    appState.pendingChallengeId = null;
    playPomodoroCompleteSound();
    appState.phase = PHASE.READY_BREAK;
    saveState();
    renderApp();
    renderTodaySummary();
    if (currentMainTab === 'today' && typeof renderTodayView === 'function') renderTodayView();
    if (currentMainTab === 'progress') {
      populateTagFilter();
      refreshActiveProgressView();
    }
    showToast('¡Pomodoro completado! Listo para iniciar descanso.', 'success');
  } else {
    appState.lastBreakCompletedType = completedType || 'short_break';
    playBreakCompleteSound();
    advanceAfterBreak();
    renderTodaySummary();
    if (currentMainTab === 'progress') {
      populateTagFilter();
      refreshActiveProgressView();
    }
    showToast('¡Descanso completado! Listo para continuar.', 'success');
  }
}

function advanceAfterBreak() {
  if (appState.currentPomodoro >= appState.config.totalPomodoros) {
    appState.phase = PHASE.BATCH_COMPLETED;
    appState.lastPomodoroEndedAt = null;
    appState.lastBreakCompletedType = null;
    appState.pendingChallengeId = null;
    if (typeof stopWaitingOverdueWatcher === 'function') stopWaitingOverdueWatcher();
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
  if (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK) {
    onTick();
  }
}

function confirmStopBlock(action) {
  isStopModalOpen = false;
  closeModal('modal-stop');
  stopTicking();
  releaseWakeLock();

  const isPomodoro = appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.PAUSED_POMODORO;

  if (action === 'incomplete' && appState.activeBlock) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    if (appState.activeBlock.pauses.length > 0) {
      const lastPause = appState.activeBlock.pauses[appState.activeBlock.pauses.length - 1];
      if (lastPause && !lastPause.resumed_at) {
        lastPause.resumed_at = nowIso;
      }
    }
    const pausedSec = calculateTotalPausedSec(appState.activeBlock.pauses);
    const wallSec = Math.max(0, (nowMs - new Date(appState.activeBlock.started_at).getTime()) / 1000);
    const activeSec = Math.max(0, wallSec - pausedSec);

    const record = {
      ...appState.activeBlock,
      ended_at: nowIso,
      total_paused_sec: pausedSec,
      status: 'incomplete',
    };
    historyLogs.unshift(record);
    saveHistory();

    if (isPomodoro && record.task_id) {
      addFocusedTimeToTask(record.task_id, activeSec, false);
    }

    appState.activeBlock = null;
    appState.targetEndTime = null;
    appState.remainingMsAtPause = null;

    if (isPomodoro) {
      appState.lastPomodoroEndedAt = nowMs;
      appState.lastBreakCompletedType = null;
      appState.pendingChallengeId = null;
      appState.phase = PHASE.READY_BREAK;
      saveState();
      renderApp();
      renderTodaySummary();
      showToast('Bloque guardado como incompleto.', 'warning');
    } else {
      advanceAfterBreak();
      renderTodaySummary();
      showToast('Descanso guardado como incompleto.', 'warning');
    }

    if (currentMainTab === 'progress') {
      populateTagFilter();
      refreshActiveProgressView();
    }
  } else {
    appState.activeBlock = null;
    appState.targetEndTime = null;
    appState.remainingMsAtPause = null;
    appState.phase = isPomodoro ? PHASE.READY_POMODORO : PHASE.READY_BREAK;
    saveState();
    renderApp();
    showToast('Bloque descartado.', 'info');
  }
}

function openCancelBatchModal() {
  openModal('modal-cancel-batch');
}

function confirmCancelBatch() {
  closeModal('modal-cancel-batch');
  resetToSetup();
}

function resetToSetup() {
  stopTicking();
  releaseWakeLock();
  if (typeof stopWaitingOverdueWatcher === 'function') stopWaitingOverdueWatcher();
  appState.phase = PHASE.SETUP;
  appState.activeBlock = null;
  appState.targetEndTime = null;
  appState.remainingMsAtPause = null;
  appState.batchId = null;
  appState.currentPomodoro = 1;
  appState.completedPomodorosInBatch = 0;
  appState.lastPomodoroEndedAt = null;
  appState.lastBreakCompletedType = null;
  appState.pendingChallengeId = null;
  saveState();
  syncSetupInputsFromConfig();
  renderApp();
}

// =========================================================================
// MOTOR DE RELOJ BASADO EN DATE.NOW() (PRECISIÓN EXACTA EN SEGUNDO PLANO)
// =========================================================================

function startTicking() {
  stopTicking();
  onTick();
  tickInterval = setInterval(onTick, 250);
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

function updateTimerVisuals(remainingMs) {
  const totalPlannedSec = appState.activeBlock
    ? appState.activeBlock.planned_duration_sec
    : getPlannedDurationSec(
        appState.phase === PHASE.READY_BREAK ? getCurrentBreakType() : 'pomodoro'
      );

  const remainingSec = Math.max(0, remainingMs / 1000);
  const formatted = formatTimer(remainingSec);

  const displayEl = document.getElementById('timer-display');
  if (displayEl) displayEl.textContent = formatted;

  const ringEl = document.getElementById('progress-ring');
  if (ringEl) {
    const ratio = totalPlannedSec > 0 ? Math.min(1, Math.max(0, remainingSec / totalPlannedSec)) : 0;
    ringEl.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - ratio);
  }

  updateDocumentTitle(formatted);
  updateHeaderMiniTimer(formatted, appState.phase);
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
      document.title = 'Pomodoro Pro — Productividad Diaria';
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
    updateHeaderMiniTimer('', appState.phase);
    setBrandAccent('rose');
    return;
  }

  if (appState.phase === PHASE.BATCH_COMPLETED) {
    completedPanel.classList.remove('hidden');
    document.getElementById('completed-summary').textContent =
      `Completaste tu carga de ${appState.config.totalPomodoros} ${appState.config.totalPomodoros === 1 ? 'bloque' : 'bloques'} en "${appState.config.tag}". Todos los registros están guardados localmente.`;
    updateDocumentTitle('');
    updateHeaderMiniTimer('', appState.phase);
    setBrandAccent('emerald');
    return;
  }

  activePanel.classList.remove('hidden');
  renderLinkedTaskBadge();

  const statusBadge = document.getElementById('status-badge');
  const statusPulse = document.getElementById('status-pulse');
  const statusText = document.getElementById('status-text');
  const phaseSubtitle = document.getElementById('phase-subtitle');
  const ring = document.getElementById('progress-ring');
  const pauseMeta = document.getElementById('pause-meta');
  const controls = document.getElementById('timer-controls');

  document.getElementById('active-tag-badge').textContent = appState.config.tag;
  document.getElementById('test-mode-indicator').classList.toggle('hidden', !appState.config.testMode);
  const activeWake = document.getElementById('active-wake-lock');
  if (activeWake) activeWake.checked = Boolean(userPrefs.wakeLockEnabled);

  const n = appState.currentPomodoro;
  const total = appState.config.totalPomodoros;
  const breakType = getCurrentBreakType();
  const breakLabel = breakType === 'long_break' ? 'Descanso Largo' : 'Descanso Corto';
  const pausesCount = appState.activeBlock ? appState.activeBlock.pauses.length : 0;
  pauseMeta.textContent = '';

  const taskSelectorWrap = document.getElementById('active-task-selector-wrap');
  const canEditTask = appState.phase === PHASE.READY_POMODORO || appState.phase === PHASE.READY_BREAK;
  if (taskSelectorWrap) taskSelectorWrap.classList.toggle('hidden', !canEditTask);
  if (canEditTask) populateTaskLinkSelect();

  if (appState.phase === PHASE.READY_POMODORO) {
    setBrandAccent('rose');
    ring.style.stroke = 'var(--rose)';
    statusBadge.className = 'badge badge-rose';
    statusPulse.className = 'dot dot-rose';
    statusText.textContent = `Listo · Pomodoro ${n}/${total}`;
    phaseSubtitle.textContent = 'EN ESPERA · ENFOQUE';

    updateTimerVisuals(getPlannedDurationSec('pomodoro') * 1000);

    controls.innerHTML = `
      <button type="button" onclick="startPomodoro()" class="btn btn-lg btn-primary" style="min-width:210px;">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Iniciar Pomodoro
      </button>
      <button type="button" onclick="skipCurrentPhase()" class="btn btn-lg btn-secondary">
        Saltar fase
      </button>
    `;
  } else if (appState.phase === PHASE.RUNNING_POMODORO) {
    setBrandAccent('rose');
    ring.style.stroke = 'var(--rose)';
    statusBadge.className = 'badge badge-rose';
    statusPulse.className = 'dot dot-rose animate-pulse-dot';
    statusText.textContent = `Pomodoro ${n}/${total} en curso`;
    phaseSubtitle.textContent = 'ENFOQUE ACTIVO';
    if (pausesCount > 0) {
      pauseMeta.textContent = `${pausesCount} ${pausesCount === 1 ? 'pausa registrada' : 'pausas registradas'}`;
    }

    updateTimerVisuals(Math.max(0, (appState.targetEndTime || Date.now()) - Date.now()));

    controls.innerHTML = `
      <button type="button" onclick="pauseBlock()" class="btn btn-lg btn-amber-soft">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        Pausar
      </button>
      <button type="button" onclick="resetCurrentBlock()" class="btn btn-lg btn-secondary">
        Reiniciar
      </button>
      <button type="button" onclick="openStopModal()" class="btn btn-lg btn-secondary">
        Detener
      </button>
    `;
  } else if (appState.phase === PHASE.PAUSED_POMODORO) {
    setBrandAccent('amber');
    ring.style.stroke = 'var(--amber)';
    statusBadge.className = 'badge badge-amber';
    statusPulse.className = 'dot dot-amber';
    statusText.textContent = `Pomodoro ${n}/${total} pausado`;
    phaseSubtitle.textContent = 'EN PAUSA';
    pauseMeta.textContent = `Pausa #${pausesCount} activa`;

    updateTimerVisuals(appState.remainingMsAtPause || 0);

    controls.innerHTML = `
      <button type="button" onclick="resumeBlock()" class="btn btn-lg btn-amber">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Reanudar
      </button>
      <button type="button" onclick="resetCurrentBlock()" class="btn btn-lg btn-secondary">
        Reiniciar
      </button>
      <button type="button" onclick="openStopModal()" class="btn btn-lg btn-secondary">
        Detener
      </button>
    `;
  } else if (appState.phase === PHASE.READY_BREAK) {
    setBrandAccent('emerald');
    ring.style.stroke = 'var(--emerald)';
    statusBadge.className = 'badge badge-emerald';
    statusPulse.className = 'dot dot-emerald';
    statusText.textContent = `Listo · ${breakLabel}`;
    phaseSubtitle.textContent = 'EN ESPERA · DESCANSO';

    updateTimerVisuals(getPlannedDurationSec(breakType) * 1000);

    const skipLabel = n >= total ? 'Saltar y finalizar' : 'Saltar descanso';
    controls.innerHTML = `
      <button type="button" onclick="startBreak()" class="btn btn-lg btn-emerald" style="min-width:210px;">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Iniciar ${breakLabel}
      </button>
      <button type="button" onclick="skipBreak()" class="btn btn-lg btn-secondary">
        ${skipLabel}
      </button>
    `;
  } else if (appState.phase === PHASE.RUNNING_BREAK) {
    setBrandAccent('emerald');
    ring.style.stroke = 'var(--emerald)';
    statusBadge.className = 'badge badge-emerald';
    statusPulse.className = 'dot dot-emerald animate-pulse-dot';
    statusText.textContent = `${breakLabel} en curso`;
    phaseSubtitle.textContent = 'DESCANSO ACTIVO';
    if (pausesCount > 0) {
      pauseMeta.textContent = `${pausesCount} ${pausesCount === 1 ? 'pausa registrada' : 'pausas registradas'}`;
    }

    updateTimerVisuals(Math.max(0, (appState.targetEndTime || Date.now()) - Date.now()));

    controls.innerHTML = `
      <button type="button" onclick="pauseBlock()" class="btn btn-lg btn-amber-soft">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        Pausar
      </button>
      <button type="button" onclick="resetCurrentBlock()" class="btn btn-lg btn-secondary">
        Reiniciar
      </button>
      <button type="button" onclick="openStopModal()" class="btn btn-lg btn-secondary">
        Detener
      </button>
    `;
  } else if (appState.phase === PHASE.PAUSED_BREAK) {
    setBrandAccent('amber');
    ring.style.stroke = 'var(--amber)';
    statusBadge.className = 'badge badge-amber';
    statusPulse.className = 'dot dot-amber';
    statusText.textContent = `${breakLabel} pausado`;
    phaseSubtitle.textContent = 'DESCANSO EN PAUSA';
    pauseMeta.textContent = `Pausa #${pausesCount} activa`;

    updateTimerVisuals(appState.remainingMsAtPause || 0);

    controls.innerHTML = `
      <button type="button" onclick="resumeBlock()" class="btn btn-lg btn-amber">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        Reanudar
      </button>
      <button type="button" onclick="resetCurrentBlock()" class="btn btn-lg btn-secondary">
        Reiniciar
      </button>
      <button type="button" onclick="openStopModal()" class="btn btn-lg btn-secondary">
        Detener
      </button>
    `;
  }

  renderBatchBlocksIndicator();
  if (typeof startWaitingOverdueWatcher === 'function') startWaitingOverdueWatcher();
}

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
    let cls = 'batch-dot ';
    if (i < current || (i === current && inBreakPhase)) {
      cls += 'is-done';
    } else if (i === current) {
      cls += appState.phase === PHASE.PAUSED_POMODORO ? 'is-paused' : 'is-current';
    }
    html += `<div class="${cls}" title="Pomodoro ${i} de ${total}"></div>`;
  }
  container.innerHTML = html;
  document.getElementById('batch-progress-label').textContent = `Bloque ${current} de ${total}`;
}
