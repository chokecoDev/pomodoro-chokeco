/**
 * =========================================================================
 * ESTADO EN MEMORIA Y PERSISTENCIA EN LOCALSTORAGE
 * =========================================================================
 */

// Estado global de la aplicación
let appState = createDefaultState();

// Historial de registros guardados
let historyLogs = [];

// Preferencias de UI (sonido)
let userPrefs = {
  soundEnabled: true,
};

// Control de intervalo, modal de detención y pestaña activa
let tickInterval = null;
let isStopModalOpen = false;
let currentMainTab = 'timer';
let currentHistorySubTab = 'audit';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(appState));
  } catch (e) {
    console.error('Error guardando estado:', e);
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyLogs));
  } catch (e) {
    console.error('Error guardando histórico:', e);
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(userPrefs));
  } catch (e) {
    console.error('Error guardando preferencias:', e);
  }
}

function loadAllData() {
  try {
    const rawPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
    if (rawPrefs) userPrefs = { ...userPrefs, ...JSON.parse(rawPrefs) };

    const rawHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (rawHistory) historyLogs = JSON.parse(rawHistory) || [];

    const rawState = localStorage.getItem(STORAGE_KEY_STATE);
    if (rawState) {
      const parsed = JSON.parse(rawState);
      if (parsed && parsed.phase) {
        appState = {
          ...createDefaultState(),
          ...parsed,
          config: { ...createDefaultState().config, ...(parsed.config || {}) },
        };
      }
    }
  } catch (e) {
    console.error('Error cargando datos de localStorage:', e);
  }
}
