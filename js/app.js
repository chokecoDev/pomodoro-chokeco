/**
 * =========================================================================
 * ARRANQUE DE LA PWA, SERVICE WORKER, PERSISTENCIA Y SINCRONIZACIÓN
 * =========================================================================
 */

function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.warn('No se pudo registrar el Service Worker:', err);
    });
  });
}

function recoverTimerIfNeeded() {
  if (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK) {
    if (appState.targetEndTime && appState.targetEndTime <= Date.now()) {
      completeCurrentBlock(appState.targetEndTime);
    } else {
      renderApp();
      startTicking();
      syncWakeLock();
    }
  } else {
    renderApp();
  }
}

function initApp() {
  // 1. Carga síncrona instantánea (<1s) desde localStorage
  loadAllDataSync();
  applyTheme(userPrefs.theme);
  renderSoundIcon();
  syncSetupInputsFromConfig();

  // Listeners de configuración de Pomodoro en vivo
  ['cfg-pomo', 'cfg-short', 'cfg-long', 'cfg-long-every'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateSetupSummary);
  });
  const cfgTag = document.getElementById('cfg-tag');
  if (cfgTag) {
    cfgTag.addEventListener('input', (e) => highlightSelectedTagChip(e.target.value));
  }

  // Cerrar modales al tocar el backdrop oscuro
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (backdrop.id === 'modal-stop') closeStopModal();
        else closeModal(backdrop.id);
      }
    });
  });

  // 2. Recuperar temporizador si estaba corriendo
  recoverTimerIfNeeded();

  // 3. Renderizar vistas iniciales (por defecto: Hoy, o Enfoque si hay un timer corriendo)
  renderTodaySummary();
  populateTagFilter();
  renderTodayView();
  renderHabitsView();

  const timerIsLive =
    appState.phase === PHASE.RUNNING_POMODORO ||
    appState.phase === PHASE.PAUSED_POMODORO ||
    appState.phase === PHASE.RUNNING_BREAK ||
    appState.phase === PHASE.PAUSED_BREAK;
  switchTab(timerIsLive ? 'focus' : 'today');

  // 4. Hidratación asíncrona desde IndexedDB + solicitud de almacenamiento persistente
  hydrateFromIndexedDbIfNeeded().then((recovered) => {
    if (recovered) {
      applyTheme(userPrefs.theme);
      renderSoundIcon();
      syncSetupInputsFromConfig();
      recoverTimerIfNeeded();
      renderTodaySummary();
      populateTagFilter();
      renderTodayView();
      renderHabitsView();
      if (currentMainTab === 'progress') refreshActiveProgressView();
    }
  });

  requestPersistentStorage().then(() => {
    if (currentMainTab === 'progress' && currentProgressSubTab === 'settings') {
      syncSettingsUi();
    }
  });

  registerServiceWorker();
}

// Sincronización inmediata del reloj (Date.now) y Wake Lock al volver a la app
function onAppResumeSync() {
  if (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK) {
    onTick();
    syncWakeLock();
  } else if (typeof handleInterPomodoroOverdue === 'function') {
    handleInterPomodoroOverdue(false);
    renderOverdueBanner();
  }
  if (currentMainTab === 'today') renderTodayView();
  if (currentMainTab === 'habits') renderHabitsView();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) onAppResumeSync();
});

window.addEventListener('focus', onAppResumeSync);
window.addEventListener('pageshow', onAppResumeSync);
window.addEventListener('DOMContentLoaded', initApp);
