/**
 * =========================================================================
 * WEB AUDIO API, VIBRACIÓN HÁPTICA Y NOTIFICACIONES DE FINALIZACIÓN
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

/** Alarma al finalizar un Pomodoro (acorde ascendente cálido + vibración) */
function playPomodoroCompleteSound() {
  triggerHaptic([180, 90, 180, 90, 260]);
  sendBlockNotification('¡Pomodoro completado!', 'Buen trabajo. Inicia tu descanso cuando estés listo.');

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

/** Alarma al finalizar un Descanso (doble campana nítida + vibración) */
function playBreakCompleteSound() {
  triggerHaptic([140, 80, 140]);
  sendBlockNotification('¡Descanso completado!', 'Listo para retomar tu siguiente bloque de enfoque.');

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

function sendBlockNotification(title, body) {
  if (!userPrefs.notificationsEnabled) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/favicon-32x32.png',
      tag: 'pomodoro-pro-timer',
    });
  } catch (e) {
    // Algunos navegadores móviles requieren ServiceWorkerRegistration.showNotification
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        if (reg && typeof reg.showNotification === 'function') {
          reg.showNotification(title, { body, icon: 'assets/icons/icon-192.png' });
        }
      }).catch(() => {});
    }
  }
}

function toggleSound() {
  userPrefs.soundEnabled = !userPrefs.soundEnabled;
  savePrefs();
  renderSoundIcon();
  triggerHaptic(12);
  if (userPrefs.soundEnabled) {
    const ctx = getAudioContext();
    if (ctx) playTone(ctx, 660, ctx.currentTime, 0.15, 'sine', 0.12);
    showToast('Alarmas sonoras activadas', 'info');
  } else {
    showToast('Alarmas sonoras silenciadas', 'info');
  }
  if (typeof syncSettingsUi === 'function') syncSettingsUi();
}

function renderSoundIcon() {
  const onEl = document.getElementById('icon-sound-on');
  const offEl = document.getElementById('icon-sound-off');
  if (onEl) onEl.classList.toggle('hidden', !userPrefs.soundEnabled);
  if (offEl) offEl.classList.toggle('hidden', userPrefs.soundEnabled);
}
