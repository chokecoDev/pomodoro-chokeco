/**
 * =========================================================================
 * MÓDULO 4: PROGRESO (MÉTRICAS 7/30D, MAPA DE CALOR DE HÁBITOS) Y AJUSTES
 * =========================================================================
 */

let progressRangeDays = 7; // 7 | 30
let pendingImportNormalized = null;

function setProgressRange(days) {
  progressRangeDays = days === 30 ? 30 : 7;
  document.getElementById('prog-range-7').classList.toggle('is-active', progressRangeDays === 7);
  document.getElementById('prog-range-30').classList.toggle('is-active', progressRangeDays === 30);
  renderProgressOverview();
}

function computeProgressMetrics(daysCount) {
  const today = getTodayKey();
  const startKey = shiftDateKey(today, -(daysCount - 1));

  // 1. Horas / bloques de enfoque completados en el rango
  let focusSec = 0;
  let pomosCompleted = 0;
  let activeFocusDays = new Set();

  historyLogs.forEach((log) => {
    if (!log || !log.started_at || !log.ended_at || log.type !== 'pomodoro') return;
    const dk = formatDateKeyLocal(log.started_at);
    if (dk < startKey || dk > today) return;
    const wall = Math.max(0, (new Date(log.ended_at) - new Date(log.started_at)) / 1000);
    const active = Math.max(0, wall - (log.total_paused_sec || 0));
    focusSec += active;
    if (log.status === 'completed') pomosCompleted += 1;
    activeFocusDays.add(dk);
  });

  // 2. Cumplimiento del Top 3 en el rango
  const top3TasksInRange = tasksList.filter(
    (t) => !t.discarded && t.priority === 'top3' && t.dateKey >= startKey && t.dateKey <= today
  );
  const top3Completed = top3TasksInRange.filter((t) => t.completed).length;
  const top3Pct = top3TasksInRange.length > 0 ? (top3Completed / top3TasksInRange.length) * 100 : 0;

  // 3. Cumplimiento promedio de hábitos en el rango
  let habitDoneSlots = 0;
  let habitTotalSlots = 0;
  const totalHabits = habitsList.length;

  for (let i = 0; i < daysCount; i++) {
    const dk = shiftDateKey(startKey, i);
    const logged = Array.isArray(habitLogs[dk]) ? habitLogs[dk] : [];
    const validDone = logged.filter((id) => habitsList.some((h) => h.id === id)).length;
    if (totalHabits > 0) {
      habitDoneSlots += validDone;
      habitTotalSlots += totalHabits;
    }
  }
  const habitPct = habitTotalSlots > 0 ? (habitDoneSlots / habitTotalSlots) * 100 : 0;

  // 4. Promedio de energía/ánimo en cierres del rango
  const shutdownsInRange = Object.values(shutdownsMap)
    .filter((s) => s && s.dateKey >= startKey && s.dateKey <= today)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const avgMood = shutdownsInRange.length > 0
    ? shutdownsInRange.reduce((acc, s) => acc + (s.mood || 3), 0) / shutdownsInRange.length
    : null;

  return {
    daysCount,
    startKey,
    today,
    focusSec,
    pomosCompleted,
    activeFocusDays: activeFocusDays.size,
    top3Total: top3TasksInRange.length,
    top3Completed,
    top3Pct,
    habitDoneSlots,
    habitTotalSlots,
    habitPct,
    shutdownsInRange,
    avgMood,
  };
}

function renderProgressOverview() {
  const m = computeProgressMetrics(progressRangeDays);

  document.getElementById('prog-focus-time').textContent = formatDurationHuman(m.focusSec);
  document.getElementById('prog-focus-sub').textContent =
    `${m.pomosCompleted} ${m.pomosCompleted === 1 ? 'bloque' : 'bloques'} · ${m.activeFocusDays}d activos`;

  document.getElementById('prog-top3-pct').textContent = `${m.top3Pct.toFixed(0)}%`;
  document.getElementById('prog-top3-sub').textContent =
    m.top3Total > 0 ? `${m.top3Completed}/${m.top3Total} tareas Top 3` : 'Sin tareas Top 3 en este periodo';
  document.getElementById('prog-top3-bar').style.width = `${m.top3Pct.toFixed(1)}%`;

  document.getElementById('prog-habits-pct').textContent = `${m.habitPct.toFixed(0)}%`;
  document.getElementById('prog-habits-sub').textContent =
    `${m.habitDoneSlots}/${m.habitTotalSlots} checks en ${m.daysCount} días`;

  document.getElementById('prog-mood-avg').textContent = m.avgMood !== null ? `${m.avgMood.toFixed(1)}/5` : '—';
  document.getElementById('prog-mood-sub').textContent =
    m.shutdownsInRange.length > 0 ? `${m.shutdownsInRange.length} cierres registrados` : 'Sin cierres en este periodo';

  renderHabitsHeatmap();
  renderRecentShutdowns(m.shutdownsInRange);
}

/** Mapa de calor visual (últimos 35 días alineados a Lunes-Domingo) */
function renderHabitsHeatmap() {
  const gridEl = document.getElementById('habits-heatmap-grid');
  const subtitleEl = document.getElementById('habits-heatmap-subtitle');
  if (!gridEl) return;

  const today = getTodayKey();
  const totalHabits = habitsList.length;

  // Mostrar últimos 28 días o 35 días alineados al calendario semanal (Lun..Dom)
  const spanDays = progressRangeDays === 30 ? 35 : 14;
  const startRaw = shiftDateKey(today, -(spanDays - 1));
  const [sy, sm, sd] = startRaw.split('-').map(Number);
  const startDateObj = new Date(sy, sm - 1, sd, 12, 0, 0);
  // Convertir getDay() (0=Dom..6=Sab) a 0=Lun..6=Dom
  const leadingPad = (startDateObj.getDay() + 6) % 7;

  if (subtitleEl) {
    subtitleEl.textContent = `Últimos ${spanDays} días (${formatDateKeyShort(startRaw)} → ${formatDateKeyShort(today)}) · Toca un día para ver detalle`;
  }

  let html = '';
  for (let p = 0; p < leadingPad; p++) {
    html += '<div class="heatmap-cell is-empty"></div>';
  }

  for (let i = 0; i < spanDays; i++) {
    const dk = shiftDateKey(startRaw, i);
    const dayNum = Number(dk.split('-')[2]);
    const logged = Array.isArray(habitLogs[dk]) ? habitLogs[dk] : [];
    const done = logged.filter((id) => habitsList.some((h) => h.id === id)).length;
    const ratio = totalHabits > 0 ? done / totalHabits : 0;

    let level = 0;
    if (ratio >= 0.99) level = 4;
    else if (ratio >= 0.66) level = 3;
    else if (ratio >= 0.34) level = 2;
    else if (ratio > 0) level = 1;

    const isTodayCell = dk === today ? 'is-today' : '';
    html += `
      <button
        type="button"
        class="heatmap-cell level-${level} ${isTodayCell}"
        data-heat-date="${dk}"
        data-heat-done="${done}"
        data-heat-total="${totalHabits}"
        aria-label="${formatDateKeyDisplay(dk)}: ${done} de ${totalHabits} hábitos"
      >
        <span>${dayNum}</span>
      </button>
    `;
  }

  gridEl.innerHTML = html;

  gridEl.querySelectorAll('[data-heat-date]').forEach((cell) => {
    const dk = cell.dataset.heatDate;
    const done = Number(cell.dataset.heatDone);
    const total = Number(cell.dataset.heatTotal);
    const shutdown = shutdownsMap[dk];
    const pomosDay = historyLogs.filter(
      (l) => l.type === 'pomodoro' && l.status === 'completed' && formatDateKeyLocal(l.started_at) === dk
    ).length;

    const buildTip = () => {
      const moodObj = shutdown ? MOOD_OPTIONS.find((m) => m.value === shutdown.mood) : null;
      return `
        <div>Hábitos: <strong class="font-mono">${done}/${total}</strong> (${formatPercent(done, total)})</div>
        <div>Pomodoros: <strong class="font-mono">${pomosDay}</strong></div>
        ${moodObj ? `<div>Energía: ${moodObj.emoji} ${shutdown.mood}/5</div>` : ''}
      `;
    };

    cell.addEventListener('mouseenter', (e) => {
      showReportTooltip(e, formatDateKeyDisplay(dk), buildTip());
    });
    cell.addEventListener('mousemove', moveReportTooltip);
    cell.addEventListener('mouseleave', hideReportTooltip);
    cell.addEventListener('click', () => {
      triggerHaptic(10);
      showToast(`${formatDateKeyDisplay(dk)}: ${done}/${total} hábitos · ${pomosDay} pomos`, 'info');
    });
  });
}

function renderRecentShutdowns(shutdowns) {
  const container = document.getElementById('recent-shutdowns-list');
  if (!container) return;

  if (!shutdowns || shutdowns.length === 0) {
    container.innerHTML = '<p class="muted-text" style="margin:0;">Aún no hay cierres diarios registrados en este periodo.</p>';
    return;
  }

  container.innerHTML = shutdowns
    .slice(0, 8)
    .map((s) => {
      const moodObj = MOOD_OPTIONS.find((m) => m.value === s.mood) || MOOD_OPTIONS[2];
      return `
        <div class="list-row" style="align-items:flex-start;">
          <div style="min-width:0;flex:1;">
            <div class="row-wrap" style="gap:6px;">
              <span class="font-mono" style="font-size:12px;font-weight:700;">${formatDateKeyDisplay(s.dateKey)}</span>
              <span class="badge">${moodObj.emoji} ${s.mood}/5</span>
              ${s.summary ? `<span class="tiny-text">${s.summary.pomosDone || 0} pomos · ${s.summary.habitsDone || 0}/${s.summary.habitsTotal || 0} hábs</span>` : ''}
            </div>
            ${s.note ? `<p style="margin:5px 0 0;font-size:12px;color:var(--text-secondary);">"${escapeHtml(s.note)}"</p>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

// =========================================================================
// AJUSTES: TEMA, TIEMPOS POMODORO, GESTIÓN DE HÁBITOS Y RESPALDO JSON
// =========================================================================

function renderSettingsPanel() {
  syncSettingsUi();
  renderHabitsManagerList();
}

function syncSettingsUi() {
  const darkBtn = document.getElementById('setting-theme-dark');
  const lightBtn = document.getElementById('setting-theme-light');
  if (darkBtn) darkBtn.classList.toggle('is-active', userPrefs.theme !== 'light');
  if (lightBtn) lightBtn.classList.toggle('is-active', userPrefs.theme === 'light');

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  const setChk = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(val);
  };

  setVal('setting-pomo-min', userPrefs.defaultPomodoroMin);
  setVal('setting-short-min', userPrefs.defaultShortBreakMin);
  setVal('setting-long-min', userPrefs.defaultLongBreakMin);
  setVal('setting-long-every', userPrefs.defaultLongInterval);
  setVal('setting-batch-count', userPrefs.defaultBatchCount);

  setChk('setting-sound', userPrefs.soundEnabled);
  setChk('setting-haptics', userPrefs.hapticsEnabled);
  setChk('setting-wake-lock', userPrefs.wakeLockEnabled);
  setChk('setting-notifications', userPrefs.notificationsEnabled);

  const persistBadge = document.getElementById('storage-persist-badge');
  if (persistBadge) {
    if (storagePersistedState === true) {
      persistBadge.className = 'badge badge-emerald';
      persistBadge.textContent = 'Almacenamiento persistente activo';
    } else if (storagePersistedState === false) {
      persistBadge.className = 'badge';
      persistBadge.textContent = 'Almacenamiento estándar (IndexedDB + localStorage)';
    } else {
      persistBadge.className = 'badge';
      persistBadge.textContent = 'Verificando persistencia...';
    }
  }
}

function savePomodoroDefaultSettings() {
  userPrefs.defaultPomodoroMin = Math.min(180, Math.max(1, parseInt(document.getElementById('setting-pomo-min').value, 10) || 25));
  userPrefs.defaultShortBreakMin = Math.min(60, Math.max(1, parseInt(document.getElementById('setting-short-min').value, 10) || 5));
  userPrefs.defaultLongBreakMin = Math.min(90, Math.max(1, parseInt(document.getElementById('setting-long-min').value, 10) || 15));
  userPrefs.defaultLongInterval = Math.min(12, Math.max(2, parseInt(document.getElementById('setting-long-every').value, 10) || 4));
  userPrefs.defaultBatchCount = Math.min(12, Math.max(1, parseInt(document.getElementById('setting-batch-count').value, 10) || 4));
  savePrefs();

  if (appState.phase === PHASE.SETUP && !appState.config.testMode) {
    appState.config.pomodoroVal = userPrefs.defaultPomodoroMin;
    appState.config.shortBreakVal = userPrefs.defaultShortBreakMin;
    appState.config.longBreakVal = userPrefs.defaultLongBreakMin;
    appState.config.longBreakInterval = userPrefs.defaultLongInterval;
    appState.config.totalPomodoros = userPrefs.defaultBatchCount;
    saveState();
    syncSetupInputsFromConfig();
  }

  triggerHaptic(15);
  showToast('Tiempos predeterminados guardados.', 'success');
}

function onSettingToggle(key, checkboxEl) {
  const checked = Boolean(checkboxEl.checked);
  if (key === 'notificationsEnabled' && checked) {
    if (typeof Notification === 'undefined') {
      checkboxEl.checked = false;
      showToast('Este navegador no soporta notificaciones web.', 'warning');
      return;
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        userPrefs.notificationsEnabled = perm === 'granted';
        checkboxEl.checked = userPrefs.notificationsEnabled;
        savePrefs();
        showToast(
          userPrefs.notificationsEnabled ? 'Notificaciones activadas.' : 'Permiso de notificaciones denegado.',
          userPrefs.notificationsEnabled ? 'success' : 'warning'
        );
      });
      return;
    }
    if (Notification.permission !== 'granted') {
      checkboxEl.checked = false;
      showToast('Activa los permisos de notificación en los ajustes del navegador.', 'warning');
      return;
    }
  }

  userPrefs[key] = checked;
  savePrefs();
  if (key === 'soundEnabled') renderSoundIcon();
  if (key === 'wakeLockEnabled') {
    ['cfg-wake-lock', 'active-wake-lock'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.checked = checked;
    });
    syncWakeLock();
  }
  triggerHaptic(10);
}

// Gestión de lista de hábitos (3 a 6 hábitos diarios configurables)
function renderHabitsManagerList() {
  const container = document.getElementById('settings-habits-list');
  const countBadge = document.getElementById('settings-habits-count');
  const addBtn = document.getElementById('btn-add-habit');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${habitsList.length}/${MAX_HABITS}`;
  if (addBtn) addBtn.disabled = habitsList.length >= MAX_HABITS;

  if (habitsList.length === 0) {
    container.innerHTML = '<p class="muted-text">No hay hábitos. Agrega entre 3 y 6 hábitos diarios.</p>';
    return;
  }

  container.innerHTML = habitsList
    .map((h) => `
      <div class="list-row">
        <div class="row-wrap" style="min-width:0;flex:1;">
          <span style="font-size:16px;">${escapeHtml(h.icon || '✓')}</span>
          <span style="font-size:13px;font-weight:600;word-break:break-word;">${escapeHtml(h.name)}</span>
        </div>
        <button type="button" class="btn btn-sm btn-danger-soft" onclick="deleteHabit('${h.id}')" aria-label="Eliminar hábito">Eliminar</button>
      </div>
    `)
    .join('');
}

function addNewHabit(event) {
  if (event) event.preventDefault();
  if (habitsList.length >= MAX_HABITS) {
    showToast(`Puedes tener un máximo de ${MAX_HABITS} hábitos diarios.`, 'warning');
    return;
  }

  const nameInput = document.getElementById('new-habit-name');
  const iconInput = document.getElementById('new-habit-icon');
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Escribe el nombre del hábito.', 'warning');
    nameInput.focus();
    return;
  }

  const icon = (iconInput.value.trim() || '✨').slice(0, 4);
  habitsList.push({
    id: generateId('hab'),
    name,
    icon,
    createdAt: getTodayKey(),
  });

  saveHabits();
  nameInput.value = '';
  triggerHaptic(15);
  renderHabitsManagerList();
  renderHabitsView();
  showToast('Hábito agregado.', 'success');
}

function deleteHabit(habitId) {
  if (habitsList.length <= MIN_HABITS) {
    showToast('Mantén al menos 1 hábito activo.', 'warning');
    return;
  }
  habitsList = habitsList.filter((h) => h.id !== habitId);
  saveHabits();
  triggerHaptic(14);
  renderHabitsManagerList();
  renderHabitsView();
  showToast('Hábito eliminado.', 'info');
}

// =========================================================================
// PORTABILIDAD DE DATOS: EXPORTAR (Web Share API / Descarga) E IMPORTAR JSON
// =========================================================================

async function exportFullBackupJson(preferShare = false) {
  const payload = buildFullBackupPayload();
  const jsonText = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `pomodoro_pro_respaldo_${stamp}.json`;
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });

  if (preferShare && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Respaldo Pomodoro Pro',
          text: 'Respaldo completo de tareas, hábitos, cierres e historial de enfoque.',
          files: [file],
        });
        showToast('Respaldo compartido correctamente.', 'success');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  triggerDownload(blob, filename);
  triggerHaptic(15);
  showToast('Respaldo completo exportado (.json).', 'success');
}

function triggerImportBackupPicker() {
  const input = document.getElementById('backup-file-input');
  if (input) {
    input.value = '';
    input.click();
  }
}

function onBackupFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      const check = validateBackupPayload(parsed);
      if (!check.ok) {
        showToast(check.error, 'error');
        return;
      }

      pendingImportNormalized = check.normalized;
      const s = check.summary;
      document.getElementById('import-preview-text').innerHTML = check.mode === 'legacy_history'
        ? `Se detectó un archivo clásico con <strong>${s.historyLogs}</strong> registros de Pomodoro. Se conservarán tus tareas y hábitos actuales.`
        : `
          El archivo es válido y restaurará:
          <ul style="margin:8px 0 0;padding-left:18px;line-height:1.6;">
            <li><strong>${s.tasks}</strong> tareas (Top 3 y checklist)</li>
            <li><strong>${s.habits}</strong> hábitos (${s.habitDays || 0} días con registro)</li>
            <li><strong>${s.historyLogs}</strong> bloques de historial Pomodoro</li>
            <li><strong>${s.shutdowns}</strong> cierres diarios y reflexiones</li>
          </ul>
        `;
      openModal('modal-import-backup');
    } catch (e) {
      showToast('No se pudo leer el archivo JSON. Verifica que no esté corrupto.', 'error');
    }
  };
  reader.readAsText(file);
}

function confirmImportBackup() {
  if (!pendingImportNormalized) return;
  applyValidatedBackup(pendingImportNormalized);
  pendingImportNormalized = null;
  closeModal('modal-import-backup');

  applyTheme(userPrefs.theme);
  renderSoundIcon();
  syncSetupInputsFromConfig();
  renderApp();
  renderTodaySummary();
  renderTodayView();
  renderHabitsView();
  populateTagFilter();
  refreshActiveProgressView();

  triggerHaptic([20, 40, 25]);
  showToast('Respaldo restaurado al 100%.', 'success');
}

function openResetAllModal() {
  openModal('modal-reset-all');
}

function confirmResetAllData() {
  closeModal('modal-reset-all');
  clearAllAppData();
  applyTheme(userPrefs.theme);
  renderSoundIcon();
  syncSetupInputsFromConfig();
  renderApp();
  renderTodaySummary();
  renderTodayView();
  renderHabitsView();
  populateTagFilter();
  refreshActiveProgressView();
  showToast('Todos los datos locales fueron eliminados.', 'info');
}
