/**
 * =========================================================================
 * INICIALIZACIÓN Y RECUPERACIÓN TRAS RECARGA DE PÁGINA
 * =========================================================================
 */

function initApp() {
  loadAllData();
  renderSoundIcon();
  syncSetupInputsFromConfig();

  // Eventos en inputs de configuración para actualizar resumen en vivo
  ['cfg-pomo', 'cfg-short', 'cfg-long', 'cfg-long-every'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateSetupSummary);
  });
  document.getElementById('cfg-tag').addEventListener('input', (e) => {
    highlightSelectedTagChip(e.target.value);
  });

  // Recuperar estado si el temporizador estaba corriendo antes de recargar
  if (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK) {
    if (appState.targetEndTime && appState.targetEndTime <= Date.now()) {
      // Terminó mientras la pestaña estaba cerrada: guardar con hora exacta de fin
      completeCurrentBlock(appState.targetEndTime);
    } else {
      renderApp();
      startTicking();
    }
  } else {
    renderApp();
  }

  renderTodaySummary();
  populateTagFilter();
}

// Sincronización inmediata al volver a la pestaña desde segundo plano
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK)) {
    onTick();
  }
});

// Arranque al cargar el DOM
window.addEventListener('DOMContentLoaded', initApp);
