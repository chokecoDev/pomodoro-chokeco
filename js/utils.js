/**
 * =========================================================================
 * UTILIDADES DE TIEMPO, FORMATO, IDs Y SANITIZACIÓN
 * =========================================================================
 */

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

/** Formatea una duración en segundos de manera legible (ej. "25m 0s", "1h 15m") */
function formatDurationHuman(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  return `${secs}s`;
}

/** Formatea una duración compacta para etiquetas de gráficos (ej. "1.5h", "25m", "45s") */
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

/** Formatea un porcentaje con un decimal (o 0% si es cero) */
function formatPercent(part, total) {
  if (!total || total <= 0 || !part || part <= 0) return '0%';
  const pct = (part / total) * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
}

/** Formatea fecha ISO a DD/MM/YYYY */
function formatDateLocal(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Devuelve clave local YYYY-MM-DD para agrupar por día calendario */
function formatDateKeyLocal(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convierte una clave YYYY-MM-DD a etiqueta corta DD/MM */
function formatDateKeyShort(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${day}/${month}`;
}

/** Convierte una clave YYYY-MM-DD a etiqueta legible DD/MM/YYYY */
function formatDateKeyDisplay(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  return `${day}/${month}/${year}`;
}

/** Formatea fecha ISO o ms a HH:MM:SS exacto */
function formatTimeLocal(isoOrMs) {
  const d = new Date(isoOrMs);
  return d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Formatea fecha ISO o ms a HH:MM */
function formatTimeShortLocal(isoOrMs) {
  const d = new Date(isoOrMs);
  return d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Verifica si un timestamp ISO corresponde al día de hoy (hora local) */
function isToday(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Calcula la duración en segundos de un tipo de bloque según configuración */
function getPlannedDurationSec(type) {
  const mult = appState.config.testMode ? 1 : 60;
  if (type === 'pomodoro') return appState.config.pomodoroVal * mult;
  if (type === 'long_break') return appState.config.longBreakVal * mult;
  return appState.config.shortBreakVal * mult;
}

/** Determina si el descanso actual corresponde a descanso largo o corto */
function getCurrentBreakType() {
  const interval = Math.max(2, appState.config.longBreakInterval);
  return appState.currentPomodoro % interval === 0 ? 'long_break' : 'short_break';
}

/** Calcula el total de segundos pausados a partir del arreglo pauses */
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
