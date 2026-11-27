/**
 * =========================================================================
 * ALMACENAMIENTO LOCAL-FIRST (IndexedDB + localStorage + Persistencia)
 * =========================================================================
 */

let userPrefs = createDefaultPrefs();
let appState = createDefaultState(userPrefs);
let historyLogs = [];
let tasksList = [];
let habitsList = [];
let habitLogs = {}; // { 'YYYY-MM-DD': ['habit_id_1', ...] }
let shutdownsMap = {}; // { 'YYYY-MM-DD': { dateKey, mood, note, summary, savedAt } }
let challengesList = [];

// Estado volátil de UI y reloj
let tickInterval = null;
let isStopModalOpen = false;
let currentMainTab = 'today'; // 'today' | 'focus' | 'habits' | 'progress'
let currentProgressSubTab = 'overview'; // 'overview' | 'reports' | 'audit' | 'settings'
let storagePersistedState = null;

// =========================================================================
// CAPA INDEXEDDB (RESPALDO DURADERO LOCAL)
// =========================================================================

let idbPromise = null;

function openLocalDb() {
  if (idbPromise) return idbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return idbPromise;
}

function idbPut(key, value) {
  openLocalDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
    } catch (e) {
      // Silencioso si el almacenamiento está restringido
    }
  });
}

function idbGetAll() {
  return openLocalDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const result = {};
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (cursor) {
            result[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        cursorReq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function persistKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error guardando ${key} en localStorage:`, e);
  }
  idbPut(key, value);
}

// =========================================================================
// GUARDADO POR ENTIDAD
// =========================================================================

function saveState() {
  persistKey(STORAGE_KEY_STATE, appState);
}

function saveHistory() {
  persistKey(STORAGE_KEY_HISTORY, historyLogs);
}

function savePrefs() {
  persistKey(STORAGE_KEY_PREFS, userPrefs);
}

function saveTasks() {
  persistKey(STORAGE_KEY_TASKS, tasksList);
}

function saveHabits() {
  persistKey(STORAGE_KEY_HABITS, habitsList);
}

function saveHabitLogs() {
  persistKey(STORAGE_KEY_HABIT_LOGS, habitLogs);
}

function saveShutdowns() {
  persistKey(STORAGE_KEY_SHUTDOWNS, shutdownsMap);
}

function saveChallenges() {
  persistKey(STORAGE_KEY_CHALLENGES, challengesList);
}

function saveAllStores() {
  savePrefs();
  saveState();
  saveHistory();
  saveTasks();
  saveHabits();
  saveHabitLogs();
  saveShutdowns();
  saveChallenges();
}

// =========================================================================
// CARGA INICIAL SÍNCRONA (localStorage) + HIDRATACIÓN DESDE IndexedDB
// =========================================================================

function readJsonLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function loadAllDataSync() {
  const savedPrefs = readJsonLocal(STORAGE_KEY_PREFS, null);
  userPrefs = { ...createDefaultPrefs(), ...(savedPrefs || {}) };

  const savedHistory = readJsonLocal(STORAGE_KEY_HISTORY, null);
  historyLogs = Array.isArray(savedHistory) ? savedHistory : [];

  const savedTasks = readJsonLocal(STORAGE_KEY_TASKS, null);
  tasksList = Array.isArray(savedTasks) ? savedTasks : [];

  const savedHabits = readJsonLocal(STORAGE_KEY_HABITS, null);
  if (Array.isArray(savedHabits)) {
    habitsList = savedHabits;
  } else {
    habitsList = DEFAULT_HABITS.map((h) => ({ ...h, createdAt: getTodayKey() }));
    saveHabits();
  }

  const savedHabitLogs = readJsonLocal(STORAGE_KEY_HABIT_LOGS, null);
  habitLogs = savedHabitLogs && typeof savedHabitLogs === 'object' ? savedHabitLogs : {};

  const savedShutdowns = readJsonLocal(STORAGE_KEY_SHUTDOWNS, null);
  shutdownsMap = savedShutdowns && typeof savedShutdowns === 'object' ? savedShutdowns : {};

  const savedChallenges = readJsonLocal(STORAGE_KEY_CHALLENGES, null);
  if (Array.isArray(savedChallenges)) {
    challengesList = savedChallenges;
  } else {
    challengesList = DEFAULT_CHALLENGES.map((c) => ({ ...c }));
    saveChallenges();
  }

  const savedState = readJsonLocal(STORAGE_KEY_STATE, null);
  const baseState = createDefaultState(userPrefs);
  if (savedState && savedState.phase) {
    appState = {
      ...baseState,
      ...savedState,
      config: { ...baseState.config, ...(savedState.config || {}) },
    };
  } else {
    appState = baseState;
  }
}

/** Si localStorage fue limpiado pero IndexedDB conserva datos, los recupera */
async function hydrateFromIndexedDbIfNeeded() {
  const idbData = await idbGetAll();
  if (!idbData || Object.keys(idbData).length === 0) {
    // Sembrar IndexedDB con el estado actual para máxima durabilidad
    saveAllStores();
    return false;
  }

  let recovered = false;
  const hasLocalData =
    localStorage.getItem(STORAGE_KEY_HISTORY) ||
    localStorage.getItem(STORAGE_KEY_TASKS) ||
    localStorage.getItem(STORAGE_KEY_HABIT_LOGS);

  if (!hasLocalData) {
    if (idbData[STORAGE_KEY_PREFS]) {
      userPrefs = { ...createDefaultPrefs(), ...idbData[STORAGE_KEY_PREFS] };
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(userPrefs));
      recovered = true;
    }
    if (Array.isArray(idbData[STORAGE_KEY_HISTORY])) {
      historyLogs = idbData[STORAGE_KEY_HISTORY];
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyLogs));
      recovered = true;
    }
    if (Array.isArray(idbData[STORAGE_KEY_TASKS])) {
      tasksList = idbData[STORAGE_KEY_TASKS];
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasksList));
      recovered = true;
    }
    if (Array.isArray(idbData[STORAGE_KEY_HABITS])) {
      habitsList = idbData[STORAGE_KEY_HABITS];
      localStorage.setItem(STORAGE_KEY_HABITS, JSON.stringify(habitsList));
      recovered = true;
    }
    if (idbData[STORAGE_KEY_HABIT_LOGS]) {
      habitLogs = idbData[STORAGE_KEY_HABIT_LOGS];
      localStorage.setItem(STORAGE_KEY_HABIT_LOGS, JSON.stringify(habitLogs));
      recovered = true;
    }
    if (idbData[STORAGE_KEY_SHUTDOWNS]) {
      shutdownsMap = idbData[STORAGE_KEY_SHUTDOWNS];
      localStorage.setItem(STORAGE_KEY_SHUTDOWNS, JSON.stringify(shutdownsMap));
      recovered = true;
    }
    if (Array.isArray(idbData[STORAGE_KEY_CHALLENGES])) {
      challengesList = idbData[STORAGE_KEY_CHALLENGES];
      localStorage.setItem(STORAGE_KEY_CHALLENGES, JSON.stringify(challengesList));
      recovered = true;
    }
    if (idbData[STORAGE_KEY_STATE] && idbData[STORAGE_KEY_STATE].phase) {
      const baseState = createDefaultState(userPrefs);
      appState = {
        ...baseState,
        ...idbData[STORAGE_KEY_STATE],
        config: { ...baseState.config, ...(idbData[STORAGE_KEY_STATE].config || {}) },
      };
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(appState));
      recovered = true;
    }
  } else {
    // Sincronizar snapshot a IndexedDB
    saveAllStores();
  }

  return recovered;
}

/** Solicita almacenamiento persistente en Android/Chrome para evitar purgas automáticas */
async function requestPersistentStorage() {
  try {
    if (navigator.storage && typeof navigator.storage.persisted === 'function') {
      let persisted = await navigator.storage.persisted();
      if (!persisted && typeof navigator.storage.persist === 'function') {
        persisted = await navigator.storage.persist();
      }
      storagePersistedState = persisted;
      return persisted;
    }
  } catch (e) {
    storagePersistedState = false;
  }
  return false;
}

// =========================================================================
// PORTABILIDAD DE DATOS: RESPALDO COMPLETO JSON (EXPORTAR / IMPORTAR)
// =========================================================================

function buildFullBackupPayload() {
  return {
    app: 'PomodoroProPWA',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      prefs: userPrefs,
      state: appState,
      tasks: tasksList,
      habits: habitsList,
      habitLogs: habitLogs,
      shutdowns: shutdownsMap,
      challenges: challengesList,
      historyLogs: historyLogs,
    },
  };
}

/** Valida estrictamente un JSON de respaldo (soporta v2 completo y v1 array de histórico) */
function validateBackupPayload(rawObj) {
  // Soporte legacy: si el usuario importa un JSON antiguo que era solo el array historyLogs
  if (Array.isArray(rawObj)) {
    const validItems = rawObj.every((item) => item && typeof item === 'object' && item.started_at && item.type);
    if (!validItems) {
      return { ok: false, error: 'El archivo JSON no tiene un formato válido de Pomodoro Pro.' };
    }
    return {
      ok: true,
      mode: 'legacy_history',
      summary: {
        tasks: tasksList.length,
        habits: habitsList.length,
        historyLogs: rawObj.length,
        shutdowns: Object.keys(shutdownsMap).length,
      },
      normalized: {
        prefs: userPrefs,
        state: appState,
        tasks: tasksList,
        habits: habitsList,
        habitLogs: habitLogs,
        shutdowns: shutdownsMap,
        challenges: challengesList,
        historyLogs: rawObj,
      },
    };
  }

  if (!rawObj || typeof rawObj !== 'object' || !rawObj.data || typeof rawObj.data !== 'object') {
    return { ok: false, error: 'Estructura inválida: falta el bloque "data" del respaldo.' };
  }

  const d = rawObj.data;
  if (!Array.isArray(d.tasks) || !Array.isArray(d.habits) || !Array.isArray(d.historyLogs)) {
    return { ok: false, error: 'El respaldo está incompleto (faltan tareas, hábitos o historial).' };
  }
  if (d.habitLogs && typeof d.habitLogs !== 'object') {
    return { ok: false, error: 'El registro de hábitos en el archivo es inválido.' };
  }
  if (d.shutdowns && typeof d.shutdowns !== 'object') {
    return { ok: false, error: 'El registro de cierres diarios en el archivo es inválido.' };
  }

  const mergedPrefs = { ...createDefaultPrefs(), ...(d.prefs || {}) };
  const baseState = createDefaultState(mergedPrefs);
  const mergedState = d.state && d.state.phase
    ? { ...baseState, ...d.state, config: { ...baseState.config, ...(d.state.config || {}) } }
    : baseState;

  return {
    ok: true,
    mode: 'full_backup',
    exportedAt: rawObj.exportedAt || null,
    summary: {
      tasks: d.tasks.length,
      habits: d.habits.length,
      historyLogs: d.historyLogs.length,
      shutdowns: Object.keys(d.shutdowns || {}).length,
      habitDays: Object.keys(d.habitLogs || {}).length,
    },
    normalized: {
      prefs: mergedPrefs,
      state: mergedState,
      tasks: d.tasks,
      habits: d.habits,
      habitLogs: d.habitLogs || {},
      shutdowns: d.shutdowns || {},
      challenges: Array.isArray(d.challenges) ? d.challenges : challengesList,
      historyLogs: d.historyLogs,
    },
  };
}

function applyValidatedBackup(normalized) {
  stopTicking();
  userPrefs = normalized.prefs;
  appState = normalized.state;
  tasksList = normalized.tasks;
  habitsList = normalized.habits;
  habitLogs = normalized.habitLogs;
  shutdownsMap = normalized.shutdowns;
  challengesList = Array.isArray(normalized.challenges) ? normalized.challenges : DEFAULT_CHALLENGES.map((c) => ({ ...c }));
  historyLogs = normalized.historyLogs;
  saveAllStores();
}

function clearAllAppData() {
  stopTicking();
  releaseWakeLock();
  userPrefs = createDefaultPrefs();
  appState = createDefaultState(userPrefs);
  historyLogs = [];
  tasksList = [];
  habitsList = DEFAULT_HABITS.map((h) => ({ ...h, createdAt: getTodayKey() }));
  habitLogs = {};
  shutdownsMap = {};
  challengesList = DEFAULT_CHALLENGES.map((c) => ({ ...c }));
  saveAllStores();
}
