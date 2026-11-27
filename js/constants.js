/**
 * =========================================================================
 * CONSTANTES GLOBALES, ESQUEMAS Y VALORES POR DEFECTO (MVP v1 PWA)
 * =========================================================================
 */

// Claves de almacenamiento en localStorage (100% compatibles con versiones previas)
const STORAGE_KEY_STATE = 'pomodoro_pro_state_v1';
const STORAGE_KEY_HISTORY = 'pomodoro_pro_history_v1';
const STORAGE_KEY_PREFS = 'pomodoro_pro_prefs_v1';
const STORAGE_KEY_TASKS = 'pomodoro_pro_tasks_v1';
const STORAGE_KEY_HABITS = 'pomodoro_pro_habits_v1';
const STORAGE_KEY_HABIT_LOGS = 'pomodoro_pro_habit_logs_v1';
const STORAGE_KEY_SHUTDOWNS = 'pomodoro_pro_shutdowns_v1';
const STORAGE_KEY_CHALLENGES = 'pomodoro_pro_challenges_v1';

// IndexedDB local-first
const IDB_NAME = 'PomodoroProDB';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';

// Versión del esquema de respaldo JSON
const BACKUP_SCHEMA_VERSION = 2;

// Límite estricto del Top 3 diario y límites recomendados de hábitos
const TOP3_LIMIT = 3;
const MAX_HABITS = 6;
const MIN_HABITS = 1;

// Perímetro del anillo SVG (2 * PI * 114)
const RING_CIRCUMFERENCE = 2 * Math.PI * 114;

// Estados posibles de la máquina de estados del Pomodoro
const PHASE = {
  SETUP: 'SETUP',
  READY_POMODORO: 'READY_POMODORO',
  RUNNING_POMODORO: 'RUNNING_POMODORO',
  PAUSED_POMODORO: 'PAUSED_POMODORO',
  READY_BREAK: 'READY_BREAK',
  RUNNING_BREAK: 'RUNNING_BREAK',
  PAUSED_BREAK: 'PAUSED_BREAK',
  BATCH_COMPLETED: 'BATCH_COMPLETED',
};

// Paleta semántica compartida para reportes gráficos
const REPORT_COLORS = {
  focus: '#f43f5e',
  break: '#10b981',
  pause: '#f59e0b',
  idle: '#64748b',
  deadTotal: '#f59e0b',
};

const MOOD_OPTIONS = [
  { value: 1, emoji: '😫', label: 'Agotado' },
  { value: 2, emoji: '😕', label: 'Bajo' },
  { value: 3, emoji: '🙂', label: 'Normal' },
  { value: 4, emoji: '😊', label: 'Bien' },
  { value: 5, emoji: '🔥', label: 'Excelente' },
];

const DEFAULT_HABITS = [
  { id: 'hab_move', name: 'Movimiento o ejercicio (20 min)', icon: '🏃', createdAt: '2026-01-01' },
  { id: 'hab_read', name: 'Lectura o aprendizaje (15 min)', icon: '📖', createdAt: '2026-01-01' },
  { id: 'hab_water', name: 'Hidratación consciente', icon: '💧', createdAt: '2026-01-01' },
  { id: 'hab_plan', name: 'Revisar Top 3 del día', icon: '🎯', createdAt: '2026-01-01' },
];

const DEFAULT_CHALLENGES = [
  { id: 'chal_burpees', icon: '🔥', title: '10 burpees', description: 'Activa el cuerpo y recupera el ritmo al instante.' },
  { id: 'chal_squats', icon: '🦵', title: '20 sentadillas', description: 'Activa piernas y circulación para despejar la mente.' },
  { id: 'chal_pushups', icon: '💪', title: '15 flexiones (lagartijas)', description: 'Clásicas o apoyando rodillas, manteniendo buena postura.' },
  { id: 'chal_plank', icon: '⏱️', title: '45 segundos de plancha', description: 'Abdomen firme y respiración profunda antes de volver.' },
  { id: 'chal_jacks', icon: '⚡', title: '30 jumping jacks', description: 'Saltos de tijera rápidos para subir energía y enfoque.' },
];

function createDefaultPrefs() {
  return {
    soundEnabled: true,
    hapticsEnabled: true,
    wakeLockEnabled: false,
    notificationsEnabled: false,
    challengesEnabled: true,
    theme: 'dark', // 'dark' | 'light'
    defaultPomodoroMin: 25,
    defaultShortBreakMin: 5,
    defaultLongBreakMin: 15,
    defaultLongInterval: 4,
    defaultBatchCount: 4,
  };
}

function createDefaultState(prefs = createDefaultPrefs()) {
  return {
    phase: PHASE.SETUP,
    config: {
      totalPomodoros: prefs.defaultBatchCount || 4,
      pomodoroVal: prefs.defaultPomodoroMin || 25,
      shortBreakVal: prefs.defaultShortBreakMin || 5,
      longBreakVal: prefs.defaultLongBreakMin || 15,
      longBreakInterval: prefs.defaultLongInterval || 4,
      testMode: false,
      tag: 'Trabajo',
      linkedTaskId: null,
      linkedTaskTitle: null,
    },
    batchId: null,
    currentPomodoro: 1,
    completedPomodorosInBatch: 0,
    targetEndTime: null,
    remainingMsAtPause: null,
    activeBlock: null,
    lastPomodoroEndedAt: null,
    lastBreakCompletedType: null,
    pendingChallengeId: null,
    challengeAutoShown: false,
  };
}
