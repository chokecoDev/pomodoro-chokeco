/**
 * =========================================================================
 * RETOS / CASTIGOS ALEATORIOS AL EXCEDER EL DESCANSO CORTO ENTRE POMODOROS
 * =========================================================================
 */

let lastPickedChallengeId = null;
let waitingOverdueInterval = null;
let activeChallengeModalState = {
  challenge: null,
  isPreview: false,
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
 * excede el descanso permitido (descanso corto, o descanso largo si se completó uno).
 */
function getInterPomodoroStatus(nowMs = Date.now()) {
  if (!appState.lastPomodoroEndedAt) {
    return { active: false, elapsedSec: 0, allowedSec: 0, exceeded: false, overdueSec: 0 };
  }

  const elapsedSec = Math.max(0, (nowMs - appState.lastPomodoroEndedAt) / 1000);
  const shortBreakSec = getPlannedDurationSec('short_break');
  const tookLongBreak = appState.lastBreakCompletedType === 'long_break';
  const tookAnyBreak = Boolean(appState.lastBreakCompletedType);

  const baseAllowedSec = tookLongBreak ? getPlannedDurationSec('long_break') : shortBreakSec;
  // Pequeño margen de clic (15s en modo normal, 1s en prueba) solo si el usuario realmente completó el descanso
  const clickGraceSec = tookAnyBreak ? (appState.config.testMode ? 1 : 15) : 0;
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
 * Se invoca justo antes de iniciar un Pomodoro.
 * Si se excedió el tiempo de descanso corto y hay retos activos, abre el modal con un reto aleatorio.
 * Devuelve true si interceptó el inicio para mostrar el reto.
 */
function checkChallengeBeforeStartPomodoro() {
  if (!userPrefs.challengesEnabled) return false;
  if (!Array.isArray(challengesList) || challengesList.length === 0) return false;

  const status = getInterPomodoroStatus();
  if (!status.exceeded) return false;

  // Reutilizar reto ya sorteado para esta demora si existe, o sortear uno nuevo aleatorio
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

  openChallengeModal(chosen, status, false);
  return true;
}

function openChallengeModal(challenge, statusInfo, isPreview = false) {
  if (!challenge) return;
  activeChallengeModalState = {
    challenge,
    isPreview,
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
    reasonEl.textContent = 'Así aparecerá un reto aleatorio cuando excedas el tiempo de descanso corto entre Pomodoros.';
    completeBtn.textContent = '¡Listo!';
    skipBtn.classList.add('hidden');
  } else {
    const breakName = statusInfo && statusInfo.tookLongBreak ? 'descanso largo' : 'descanso corto';
    badgeEl.textContent = 'Descanso excedido';
    reasonEl.innerHTML =
      `Pasaron <strong class="font-mono">${formatDurationHuman(statusInfo.elapsedSec)}</strong> desde tu último Pomodoro ` +
      `(límite de ${breakName}: <strong class="font-mono">${formatDurationHuman(statusInfo.baseAllowedSec)}</strong>). ¡Cumple este reto para retomar el ritmo!`;
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
  saveState();
  showToast(`¡Reto cumplido (${title})! Arrancando Pomodoro.`, 'success');
  startPomodoro(true);
}

function skipChallengeAndStart() {
  closeModal('modal-challenge');
  if (activeChallengeModalState.isPreview) return;

  appState.pendingChallengeId = null;
  saveState();
  triggerHaptic(10);
  showToast('Reto omitido. Iniciando Pomodoro.', 'info');
  startPomodoro(true);
}

function previewRandomChallenge() {
  if (!Array.isArray(challengesList) || challengesList.length === 0) {
    showToast('Agrega al menos un reto primero.', 'warning');
    return;
  }
  const chosen = pickRandomChallenge();
  openChallengeModal(chosen, null, true);
}

// =========================================================================
// INDICADOR EN VIVO EN PANTALLA DE ESPERA (READY_BREAK / READY_POMODORO)
// =========================================================================

function startWaitingOverdueWatcher() {
  stopWaitingOverdueWatcher();
  const isWaiting =
    (appState.phase === PHASE.READY_BREAK || appState.phase === PHASE.READY_POMODORO) &&
    Boolean(appState.lastPomodoroEndedAt);

  renderOverdueBanner();
  if (!isWaiting) return;

  waitingOverdueInterval = setInterval(() => {
    const stillWaiting =
      (appState.phase === PHASE.READY_BREAK || appState.phase === PHASE.READY_POMODORO) &&
      Boolean(appState.lastPomodoroEndedAt);
    if (!stillWaiting) {
      stopWaitingOverdueWatcher();
      renderOverdueBanner();
      return;
    }
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

  const isWaiting = appState.phase === PHASE.READY_BREAK || appState.phase === PHASE.READY_POMODORO;
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
    `Tiempo entre Pomodoros: ${formatDurationHuman(status.elapsedSec)} (+${formatDurationHuman(status.overdueSec)}). Se activará un reto aleatorio al iniciar.`;
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
