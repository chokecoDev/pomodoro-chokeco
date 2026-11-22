/**
 * =========================================================================
 * UTILIDADES DE TIEMPO, FECHAS, HÁPTICA, WAKE LOCK Y FORMATO
 * =========================================================================
 */

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Devuelve clave local YYYY-MM-DD para una fecha dada o hoy */
function formatDateKeyLocal(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return formatDateKeyLocal(new Date());
}

/** Suma o resta días a una fecha clave YYYY-MM-DD (sin problemas de DST) */
function shiftDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  return formatDateKeyLocal(dt);
}

function getTomorrowKey() {
  return shiftDateKey(getTodayKey(), 1);
}

function formatDateKeyShort(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${day}/${month}`;
}

function formatDateKeyDisplay(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  return `${day}/${month}/${year}`;
}

function formatTodayHeaderDate() {
  const now = new Date();
  const str = now.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Convierte segundos en formato MM:SS o HH:MM:SS */
function formatTimer(totalSeconds) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

/** Formatea una duración en segundos de manera legible (ej. "25m", "1h 15m") */
function formatDurationHuman(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${secs}s`;
}

function formatDurationCompact(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) {
    const hrs = s / 3600;
    return hrs >= 10 ? `${Math.round(hrs)}h` : `${hrs.toFixed(1).replace(/\.0$/, '')}h`;
  }
  if (s >= 60) {
    return `${Math.round(s / 60)}m`;
  }
  return `${s}s`;
}

function formatPercent(part, total) {
  if (!total || total <= 0 || !part || part <= 0) return '0%';
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
}

function formatDateLocal(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTimeLocal(isoOrMs) {
  const d = new Date(isoOrMs);
  return d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatTimeShortLocal(isoOrMs) {
  const d = new Date(isoOrMs);
  return d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isToday(isoString) {
  if (!isoString) return false;
  return formatDateKeyLocal(isoString) === getTodayKey();
}

function getPlannedDurationSec(type) {
  const mult = appState.config.testMode ? 1 : 60;
  if (type === 'pomodoro') return appState.config.pomodoroVal * mult;
  if (type === 'long_break') return appState.config.longBreakVal * mult;
  return appState.config.shortBreakVal * mult;
}

function getCurrentBreakType() {
  const interval = Math.max(2, appState.config.longBreakInterval);
  return appState.currentPomodoro % interval === 0 ? 'long_break' : 'short_break';
}

function calculateTotalPausedSec(pauses) {
  if (!Array.isArray(pauses) || pauses.length === 0) return 0;
  let totalMs = 0;
  for (const p of pauses) {
    if (p.paused_at && p.resumed_at) {
      const diff = new Date(p.resumed_at).getTime() - new Date(p.paused_at).getTime();
      if (diff > 0) totalMs += diff;
    }
  }
  return Math.round(totalMs / 1000);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =========================================================================
// FEEDBACK HÁPTICO (navigator.vibrate)
// =========================================================================

function triggerHaptic(pattern = 15) {
  if (typeof userPrefs !== 'undefined' && !userPrefs.hapticsEnabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // Ignorar silenciosamente si el navegador bloquea vibración
  }
}

// =========================================================================
// SCREEN WAKE LOCK API (MANTENER PANTALLA ACTIVA)
// =========================================================================

let wakeLockSentinel = null;

async function syncWakeLock() {
  const shouldLock =
    Boolean(userPrefs.wakeLockEnabled) &&
    (appState.phase === PHASE.RUNNING_POMODORO || appState.phase === PHASE.RUNNING_BREAK);

  if (!shouldLock) {
    await releaseWakeLock();
    return;
  }

  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  if (wakeLockSentinel && !wakeLockSentinel.released) return;

  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
  } catch (e) {
    console.warn('Wake Lock no disponible en este momento:', e);
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch (e) {
      // Ignorar si ya estaba liberado
    }
    wakeLockSentinel = null;
  }
}
