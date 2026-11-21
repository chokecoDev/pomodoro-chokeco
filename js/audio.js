/**
 * =========================================================================
 * WEB AUDIO API — ALARMAS SONORAS SIN DEPENDENCIAS EXTERNAS
 * =========================================================================
 */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Reproduce una nota suave con envolvente ADSR básica */
function playTone(ctx, freq, startTime, duration, type = 'sine', peakGain = 0.22) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/** Alarma al finalizar un Pomodoro (acorde ascendente cálido) */
function playPomodoroCompleteSound() {
  if (!userPrefs.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 523.25, now, 0.45, 'triangle', 0.22);       // C5
    playTone(ctx, 659.25, now + 0.16, 0.45, 'triangle', 0.22); // E5
    playTone(ctx, 783.99, now + 0.32, 0.75, 'sine', 0.25);     // G5
    playTone(ctx, 1046.5, now + 0.48, 0.85, 'sine', 0.18);     // C6
  } catch (e) {
    console.warn('No se pudo reproducir el sonido de Pomodoro:', e);
  }
}

/** Alarma al finalizar un Descanso (doble campana nítida distinta) */
function playBreakCompleteSound() {
  if (!userPrefs.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 880.0, now, 0.35, 'sine', 0.2);        // A5
    playTone(ctx, 659.25, now + 0.22, 0.45, 'sine', 0.2); // E5
    playTone(ctx, 880.0, now + 0.52, 0.6, 'sine', 0.22);  // A5
  } catch (e) {
    console.warn('No se pudo reproducir el sonido de Descanso:', e);
  }
}

function toggleSound() {
  userPrefs.soundEnabled = !userPrefs.soundEnabled;
  savePrefs();
  renderSoundIcon();
  if (userPrefs.soundEnabled) {
    // Desbloquea el contexto de audio y da un pequeño tono de confirmación
    const ctx = getAudioContext();
    if (ctx) playTone(ctx, 660, ctx.currentTime, 0.15, 'sine', 0.12);
    showToast('Alarmas sonoras activadas', 'info');
  } else {
    showToast('Alarmas sonoras silenciadas', 'info');
  }
}

function renderSoundIcon() {
  document.getElementById('icon-sound-on').classList.toggle('hidden', !userPrefs.soundEnabled);
  document.getElementById('icon-sound-off').classList.toggle('hidden', userPrefs.soundEnabled);
}
