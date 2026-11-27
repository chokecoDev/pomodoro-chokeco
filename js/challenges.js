/**
 * =========================================================================
 * RETOS / CASTIGOS ALEATORIOS AL EXCEDER EL DESCANSO ENTRE POMODOROS
 * =========================================================================
 */

let lastPickedChallengeId = null;
let waitingOverdueInterval = null;
let activeChallengeModalState = {
  challenge: null,
  isPreview: false,
  breakAutoEnded: false,
  elapsedSec: 0,
  allowedSec: 0,
};

/** Selecciona un reto aleatorio evitando repetir el último si hay más de 1 */
function pickRandomChallenge(excludeId = lastPickedChallengeId) {
  if (!Array.isArray(challengesList) || challengesList.length === 0) return null;
  if (challengesList.length === 1) {
    lastPickedChallengeId = challengesList[0].id;
    return challengesList[0];
  }

  const pool = excludeId
    ? challengesList.filter((c) => c.id !== excludeId)
    : challengesList;
  const source = pool.length > 0 ? pool : challengesList;
  const chosen = source[Math.floor(Math.random() * source.length)];
  lastPickedChallengeId = chosen.id;
  return chosen;
}

/**
 * Calcula si el tiempo transcurrido desde el fin del último Pomodoro
 * excede la duración del descanso correspondiente.
 */
function getInterPomodoroStatus(nowMs = Date.now()) {
  if (!appState.lastPomodoroEndedAt) {
    return { active: false, elapsedSec: 0, baseAllowedSec: 0, allowedSec: 0, exceeded: false, overdueSec: 0 };
  }

  const inBreakWaitingOrPaused =
    appState.phase === PHASE.READY_BREAK || appState.phase === PHASE.PAUSED_BREAK;
  const inReadyPomo = appState.phase === PHASE.READY_POMODORO;

  // Solo aplica entre pomodoros (debe existir un siguiente Pomodoro en la carga)
  const hasNextPomodoro = inReadyPomo || (inBreakWaitingOrPaused && appState.currentPomodoro < appState.config.totalPomodoros);
  if (!hasNextPomodoro) {
    return { active: false, elapsedSec: 0, baseAllowedSec: 0, allowedSec: 0, exceeded: false, overdueSec: 0 };
  }

  const elapsedSec = Math.max(0, (nowMs - appState.lastPomodoroEndedAt) / 1000);
  const shortBreakSec = getPlannedDurationSec('short_break');

  let tookLongBreak = false;
  let baseAllowedSec = shortBreakSec;
  let clickGraceSec = 0;

  if (inBreakWaitingOrPaused) {
    const expectedType = getCurrentBreakType();
    tookLongBreak = expectedType === 'long_break';
    baseAllowedSec = getPlannedDurationSec(expectedType);
    clickGraceSec = 0;
  } else {
    tookLongBreak = appState.lastBreakCompletedType === 'long_break';
    baseAllowedSec = tookLongBreak ? getPlannedDurationSec('long_break') : shortBreakSec;
    // Pequeño margen de clic (15s en modo normal, 1s en prueba) solo si el usuario completó el descanso
    clickGraceSec = appState.lastBreakCompletedType ? (appState.config.testMode ? 1 : 15) : 0;
  }

  const allowedSec = baseAllowedSec + clickGraceSec;
  const exceeded = elapsedSec > allowedSec;
  const overdueSec = Math.max(0, elapsedSec - baseAllowedSec);

  return {
    active: true,
    elapsedSec,
    baseAllowedSec,
    allowedSec,
    exceeded,
    overdueSec,
    tookLongBreak,
  };
}

/**
 * Si el tiempo entre Pomodoros ya superó el descanso:
 * 1. Da por terminado el descanso automáticamente (pasando a READY_POMODORO del siguiente bloque).
 * 2. Muestra inmediatamente el modal con un reto aleatorio.
 * Devuelve true si se disparó la acción.
 */
function handleInterPomodoroOverdue(forceOpenModal = false, nowMs = Date.now()) {
  if (!userPrefs.challengesEnabled) return false;
  if (!Array.isArray(challengesList) || challengesList.length === 0) return false;

  const status = getInterPomodoroStatus(nowMs);
  if (!status.active || !status.exceeded) return false;

  let breakAutoEnded = false;

  // Si aún estaba esperando iniciar el descanso o con el descanso pausado, darlo por terminado
  if (appState.phase === PHASE.READY_BREAK || appState.phase === PHASE.PAUSED_BREAK) {
    breakAutoEnded = true;

    // Si el descanso estaba pausado con bloque activo, cerrarlo como incompleto para conservar auditoría
    if (appState.phase === PHASE.PAUSED_BREAK && appState.activeBlock) {
      const nowIso = new Date(nowMs).toISOString();
      if (appState.activeBlock.pauses.length > 0) {
        const lastPause = appState.activeBlock.pauses[appState.activeBlock.pauses.length - 1];
        if (lastPause && !lastPause.resumed_at) lastPause.resumed_at = nowIso;
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
    }

    appState.lastBreakCompletedType = null;
    appState.currentPomodoro += 1;
    appState.phase = PHASE.READY_POMODORO;
    saveState();
    if (typeof renderApp === 'function') renderApp();
    if (typeof renderTodaySummary === 'function') renderTodaySummary();
  }

  // Sortear o recuperar reto pendiente
  let chosen = null;
  if (appState.pendingChallengeId) {
    chosen = challengesList.find((c) => c.id === appState.pendingChallengeId) || null;
  }
  if (!chosen) {
    chosen = pickRandomChallenge();
    if (!chosen) return false;
    appState.pendingChallengeId = chosen.id;
    saveState();
  }

  const modalEl = document.getElementById('modal-challenge');
  const isModalAlreadyOpen = modalEl && !modalEl.classList.contains('hidden');

  if (forceOpenModal || (!appState.challengeAutoShown && !isModalAlreadyOpen)) {
    appState.challengeAutoShown = true;
    saveState();
    openChallengeModal(chosen, status, false, breakAutoEnded);
    return true;
  }

  return breakAutoEnded;
}

/**
 * Se invoca justo antes de iniciar un Pomodoro manualmente.
 * Si se excedió el descanso y hay retos activos, abre el modal con el reto aleatorio.
 */
function checkChallengeBeforeStartPomodoro() {
  if (!userPrefs.challengesEnabled) return false;
  if (!Array.isArray(challengesList) || challengesList.length === 0) return false;

  const status = getInterPomodoroStatus();
  if (!status.active || !status.exceeded) return false;

  return handleInterPomodoroOverdue(true);
}

function openChallengeModal(challenge, statusInfo, isPreview = false, breakAutoEnded = false) {
  if (!challenge) return;
  activeChallengeModalState = {
    challenge,
    isPreview,
    breakAutoEnded,
    elapsedSec: statusInfo ? statusInfo.elapsedSec : 0,
    allowedSec: statusInfo ? statusInfo.baseAllowedSec : 0,
  };

  const badgeEl = document.getElementById('challenge-modal-badge');
  const reasonEl = document.getElementById('challenge-modal-reason');
  const iconEl = document.getElementById('challenge-modal-icon');
  const titleEl = document.getElementById('challenge-modal-title');
  const descEl = document.getElementById('challenge-modal-desc');
  const completeBtn = document.getElementById('challenge-complete-btn');
  const skipBtn = document.getElementById('challenge-skip-btn');

  if (isPreview) {
    badgeEl.textContent = 'Vista previa aleatoria';
    reasonEl.textContent = 'Así aparecerá un reto aleatorio cuando el tiempo entre Pomodoros exceda el descanso.';
    completeBtn.textContent = '¡Listo!';
    skipBtn.classList.add('hidden');
  } else {
    const breakName = statusInfo && statusInfo.tookLongBreak ? 'descanso largo' : 'descanso corto';
    badgeEl.textContent = breakAutoEnded ? 'Descanso terminado · Reto' : 'Descanso excedido';
    const prefix = breakAutoEnded
      ? `El ${breakName} se dio por terminado porque pasaron `
      : 'Pasaron ';
    reasonEl.innerHTML =
      `${prefix}<strong class="font-mono">${formatDurationHuman(statusInfo.elapsedSec)}</strong> desde tu último Pomodoro ` +
      `(límite: <strong class="font-mono">${formatDurationHuman(statusInfo.baseAllowedSec)}</strong>). ¡Cumple este reto para iniciar el Pomodoro ${appState.currentPomodoro}/${appState.config.totalPomodoros}!`;
    completeBtn.textContent = '¡Reto cumplido! Iniciar Pomodoro';
    skipBtn.classList.remove('hidden');
  }

  iconEl.textContent = challenge.icon || '🔥';
  titleEl.textContent = challenge.title;
  descEl.textContent = challenge.description || 'Completa este reto rápido para reactivar tu enfoque.';

  const rerollBtn = document.getElementById('challenge-reroll-btn');
  if (rerollBtn) rerollBtn.classList.toggle('hidden', challengesList.length <= 1);

  triggerHaptic([35, 50, 35]);
  openModal('modal-challenge');
}

function rerollChallenge() {
  if (challengesList.length <= 1) return;
  const currentId = activeChallengeModalState.challenge ? activeChallengeModalState.challenge.id : null;
  const next = pickRandomChallenge(currentId);
  if (!next) return;

  activeChallengeModalState.challenge = next;
  if (!activeChallengeModalState.isPreview) {
    appState.pendingChallengeId = next.id;
    saveState();
  }

  document.getElementById('challenge-modal-icon').textContent = next.icon || '🔥';
  document.getElementById('challenge-modal-title').textContent = next.title;
  document.getElementById('challenge-modal-desc').textContent =
    next.description || 'Completa este reto rápido para reactivar tu enfoque.';

  triggerHaptic(14);
}

function completeChallengeAndStart() {
  const wasPreview = activeChallengeModalState.isPreview;
  const title = activeChallengeModalState.challenge ? activeChallengeModalState.challenge.title : 'Reto';
  closeModal('modal-challenge');
  triggerHaptic([25, 45, 35]);

  if (wasPreview) {
    showToast(`¡Reto completado: ${title}!`, 'success');
    return;
  }

  appState.pendingChallengeId = null;
  appState.challengeAutoShown = false;
  saveState();
  if (currentMainTab !== 'focus') switchTab('focus');
  showToast(`¡Reto cumplido (${title})! Arrancando Pomodoro.`, 'success');
  startPomodoro(true);
}

function skipChallengeAndStart() {
  closeModal('modal-challenge');
  if (activeChallengeModalState.isPreview) return;

  appState.pendingChallengeId = null;
  appState.challengeAutoShown = false;
  saveState();
  triggerHaptic(10);
  if (currentMainTab !== 'focus') switchTab('focus');
  showToast('Reto omitido. Iniciando Pomodoro.', 'info');
  startPomodoro(true);
}

function previewRandomChallenge() {
  if (!Array.isArray(challengesList) || challengesList.length === 0) {
    showToast('Agrega al menos un reto primero.', 'warning');
    return;
  }
  const chosen = pickRandomChallenge();
  openChallengeModal(chosen, null, true, false);
}

// =========================================================================
// VIGILANCIA EN VIVO (CIERRA EL DESCANSO Y MUESTRA EL RETO AUTOMÁTICAMENTE)
// =========================================================================

function startWaitingOverdueWatcher() {
  stopWaitingOverdueWatcher();
  const isWaiting =
    (appState.phase === PHASE.READY_BREAK ||
      appState.phase === PHASE.PAUSED_BREAK ||
      appState.phase === PHASE.READY_POMODORO) &&
    Boolean(appState.lastPomodoroEndedAt);

  if (!isWaiting) {
    renderOverdueBanner();
    return;
  }

  // Verificar inmediatamente (ej. al volver a la pestaña tras varios minutos)
  handleInterPomodoroOverdue(false);
  renderOverdueBanner();

  waitingOverdueInterval = setInterval(() => {
    const stillWaiting =
      (appState.phase === PHASE.READY_BREAK ||
        appState.phase === PHASE.PAUSED_BREAK ||
        appState.phase === PHASE.READY_POMODORO) &&
      Boolean(appState.lastPomodoroEndedAt);
    if (!stillWaiting) {
      stopWaitingOverdueWatcher();
      renderOverdueBanner();
      return;
    }
    handleInterPomodoroOverdue(false);
    renderOverdueBanner();
  }, 1000);
}

function stopWaitingOverdueWatcher() {
  if (waitingOverdueInterval) {
    clearInterval(waitingOverdueInterval);
    waitingOverdueInterval = null;
  }
}

function renderOverdueBanner() {
  const banner = document.getElementById('overdue-challenge-banner');
  const textEl = document.getElementById('overdue-challenge-text');
  if (!banner || !textEl) return;

  const isWaiting =
    appState.phase === PHASE.READY_BREAK ||
    appState.phase === PHASE.PAUSED_BREAK ||
    appState.phase === PHASE.READY_POMODORO;
  if (!isWaiting || !userPrefs.challengesEnabled || challengesList.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  const status = getInterPomodoroStatus();
  if (!status.active || !status.exceeded) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  textEl.textContent =
    `Tiempo entre Pomodoros: ${formatDurationHuman(status.elapsedSec)} (+${formatDurationHuman(status.overdueSec)}). Toca "Iniciar Pomodoro" para ver tu reto.`;
}

// =========================================================================
// GESTIÓN DE RETOS EN AJUSTES (AGREGAR, QUITAR, RESTAURAR)
// =========================================================================

function renderChallengesManagerList() {
  const container = document.getElementById('settings-challenges-list');
  const countBadge = document.getElementById('settings-challenges-count');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${challengesList.length} ${challengesList.length === 1 ? 'reto' : 'retos'}`;

  if (challengesList.length === 0) {
    container.innerHTML = `
      <div class="empty-slot" style="margin-top:6px;">
        No tienes retos configurados. Agrega uno nuevo o restaura los 5 retos iniciales.
      </div>
    `;
    return;
  }

  container.innerHTML = challengesList
    .map((c) => `
      <div class="list-row">
        <div class="row-wrap" style="min-width:0;flex:1;flex-wrap:nowrap;align-items:flex-start;">
          <span style="font-size:17px;line-height:1.2;">${escapeHtml(c.icon || '🔥')}</span>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:600;word-break:break-word;">${escapeHtml(c.title)}</div>
            ${c.description ? `<div class="tiny-text" style="margin-top:1px;">${escapeHtml(c.description)}</div>` : ''}
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-danger-soft" onclick="deleteChallenge('${c.id}')" aria-label="Eliminar reto">Quitar</button>
      </div>
    `)
    .join('');
}

function addNewChallenge(event) {
  if (event) event.preventDefault();
  const iconInput = document.getElementById('new-challenge-icon');
  const titleInput = document.getElementById('new-challenge-title');
  const descInput = document.getElementById('new-challenge-desc');

  const title = titleInput.value.trim();
  if (!title) {
    showToast('Escribe el nombre del reto (ej. 10 burpees).', 'warning');
    titleInput.focus();
    return;
  }

  const icon = (iconInput.value.trim() || '🔥').slice(0, 4);
  const description = descInput ? descInput.value.trim() : '';

  challengesList.push({
    id: generateId('chal'),
    icon,
    title,
    description,
  });

  saveChallenges();
  titleInput.value = '';
  if (descInput) descInput.value = '';
  triggerHaptic(15);
  renderChallengesManagerList();
  renderOverdueBanner();
  showToast(`Reto agregado: "${title}".`, 'success');
}

function deleteChallenge(challengeId) {
  challengesList = challengesList.filter((c) => c.id !== challengeId);
  if (appState.pendingChallengeId === challengeId) {
    appState.pendingChallengeId = null;
    saveState();
  }
  saveChallenges();
  triggerHaptic(14);
  renderChallengesManagerList();
  renderOverdueBanner();
  showToast('Reto eliminado.', 'info');
}

function restoreDefaultChallenges() {
  challengesList = DEFAULT_CHALLENGES.map((c) => ({ ...c }));
  saveChallenges();
  triggerHaptic(15);
  renderChallengesManagerList();
  renderOverdueBanner();
  showToast('Se restauraron los 5 retos iniciales.', 'success');
}
