/**
 * =========================================================================
 * CONSTANTES GLOBALES Y DEFINICIÓN DE ESTADOS
 * =========================================================================
 */

// Claves de almacenamiento en localStorage (compatibles con versiones previas)
const STORAGE_KEY_STATE = 'pomodoro_pro_state_v1';
const STORAGE_KEY_HISTORY = 'pomodoro_pro_history_v1';
const STORAGE_KEY_PREFS = 'pomodoro_pro_prefs_v1';

// Constante del perímetro del anillo SVG (2 * PI * 114)
const RING_CIRCUMFERENCE = 2 * Math.PI * 114;

// Estados posibles de la máquina de estados
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

// Paleta semántica compartida para gráficos y reportes
const REPORT_COLORS = {
  focus: '#f43f5e',      // rose-500: Trabajo efectivo
  break: '#10b981',      // emerald-500: Descansos planificados
  pause: '#f59e0b',      // amber-500: Pausas dentro de bloques
  idle: '#64748b',       // slate-500: Sin avanzar entre bloques
  deadTotal: '#f59e0b',  // amber-500
};

function createDefaultState() {
  return {
    phase: PHASE.SETUP,
    config: {
      totalPomodoros: 4,
      pomodoroVal: 25,
      shortBreakVal: 5,
      longBreakVal: 15,
      longBreakInterval: 4,
      testMode: false,
      tag: 'Trabajo',
    },
    batchId: null,
    currentPomodoro: 1, // 1..totalPomodoros
    completedPomodorosInBatch: 0,
    targetEndTime: null,       // Timestamp en ms (Date.now()) cuando termina el bloque en curso
    remainingMsAtPause: null,  // Ms restantes al momento de pausar
    activeBlock: null,         // Registro en construcción mientras el bloque está activo o pausado
  };
}
