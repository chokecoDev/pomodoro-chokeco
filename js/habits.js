/**
 * =========================================================================
 * MÓDULO 3: HÁBITOS DIARIOS (3-6 HÁBITOS, RACHAS) Y RITUAL DE CIERRE DEL DÍA
 * =========================================================================
 */

let selectedShutdownMood = 4;

function isHabitCompletedOnDate(habitId, dateKey) {
  const ids = habitLogs[dateKey];
  return Array.isArray(ids) && ids.includes(habitId);
}

/**
 * Calcula la racha actual de un hábito (en días consecutivos).
 * Si hoy aún no se ha marcado, continúa contando desde ayer para no romper la racha durante el día.
 */
function calculateHabitStreak(habitId) {
  const today = getTodayKey();
  let cursor = isHabitCompletedOnDate(habitId, today) ? today : shiftDateKey(today, -1);
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    if (isHabitCompletedOnDate(habitId, cursor)) {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    } else {
      break;
    }
  }
  return streak;
}

function toggleHabitToday(habitId) {
  const today = getTodayKey();
  if (!Array.isArray(habitLogs[today])) {
    habitLogs[today] = [];
  }

  const idx = habitLogs[today].indexOf(habitId);
  if (idx === -1) {
    habitLogs[today].push(habitId);
    const allDone = habitsList.length > 0 && habitsList.every((h) => habitLogs[today].includes(h.id));
    if (allDone) {
      triggerHaptic([25, 45, 35]);
      showToast('¡Todos tus hábitos de hoy completados!', 'success');
    } else {
      triggerHaptic(15);
    }
  } else {
    habitLogs[today].splice(idx, 1);
    triggerHaptic(10);
  }

  saveHabitLogs();
  renderHabitsView();
}

function renderHabitsView() {
  const today = getTodayKey();
  const listEl = document.getElementById('habits-list');
  const progressText = document.getElementById('habits-today-counter');
  const progressBar = document.getElementById('habits-today-bar');

  const doneCount = habitsList.filter((h) => isHabitCompletedOnDate(h.id, today)).length;
  const totalCount = habitsList.length;
  const pct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  if (progressText) progressText.textContent = `${doneCount}/${totalCount} hoy`;
  if (progressBar) progressBar.style.width = `${pct.toFixed(1)}%`;

  if (listEl) {
    if (habitsList.length === 0) {
      listEl.innerHTML = `
        <div class="empty-slot">
          No tienes hábitos configurados. Agrega de 3 a 6 hábitos diarios desde Ajustes.
        </div>
      `;
    } else {
      listEl.innerHTML = habitsList
        .map((h) => {
          const done = isHabitCompletedOnDate(h.id, today);
          const streak = calculateHabitStreak(h.id);
          return `
            <button type="button" class="habit-item ${done ? 'is-done' : ''}" onclick="toggleHabitToday('${h.id}')">
              <div class="row-wrap" style="gap:11px;min-width:0;flex:1;flex-wrap:nowrap;">
                <span class="habit-check">
                  ${done ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}
                </span>
                <div style="min-width:0;">
                  <div class="task-title" style="font-weight:600;">${escapeHtml(h.icon || '✓')} ${escapeHtml(h.name)}</div>
                  <div class="tiny-text" style="margin-top:2px;">${done ? 'Completado hoy' : 'Toca para marcar hoy'}</div>
                </div>
              </div>
              <span class="badge ${streak > 0 ? 'badge-amber' : ''} font-mono" style="flex-shrink:0;">
                ${streak > 0 ? `🔥 ${streak}d` : '0d'}
              </span>
            </button>
          `;
        })
        .join('');
    }
  }

  renderTodayShutdownCard();
}

// =========================================================================
// RITUAL DE CIERRE DEL DÍA (SHUTDOWN)
// =========================================================================

function computeTodayAutoSummary() {
  const today = getTodayKey();
  const todayTasks = getTodayTasks();
  const top3 = todayTasks.filter((t) => t.priority === 'top3');
  const top3Done = top3.filter((t) => t.completed).length;
  const tasksDone = todayTasks.filter((t) => t.completed).length;

  const todayLogs = historyLogs.filter((l) => isToday(l.started_at));
  const pomosDone = todayLogs.filter((l) => l.type === 'pomodoro' && l.status === 'completed').length;
  let focusSec = 0;
  todayLogs.forEach((l) => {
    if (l.type === 'pomodoro' && l.started_at && l.ended_at) {
      const wall = Math.max(0, (new Date(l.ended_at) - new Date(l.started_at)) / 1000);
      focusSec += Math.max(0, wall - (l.total_paused_sec || 0));
    }
  });

  const habitsDone = habitsList.filter((h) => isHabitCompletedOnDate(h.id, today)).length;

  return {
    top3Done,
    top3Total: top3.length,
    tasksDone,
    tasksTotal: todayTasks.length,
    pomosDone,
    focusSec: Math.round(focusSec),
    habitsDone,
    habitsTotal: habitsList.length,
  };
}

function renderTodayShutdownCard() {
  const today = getTodayKey();
  const existing = shutdownsMap[today];
  const statusBadge = document.getElementById('shutdown-status-badge');
  const previewEl = document.getElementById('shutdown-today-preview');
  const btnOpen = document.getElementById('btn-open-shutdown');

  if (!statusBadge || !previewEl || !btnOpen) return;

  if (existing) {
    const moodObj = MOOD_OPTIONS.find((m) => m.value === existing.mood) || MOOD_OPTIONS[2];
    statusBadge.className = 'badge badge-emerald';
    statusBadge.textContent = 'Cerrado hoy';
    btnOpen.textContent = 'Editar cierre de hoy';
    previewEl.innerHTML = `
      <div class="card-inset stack-sm">
        <div class="row-between">
          <span class="muted-text">Energía / Ánimo</span>
          <span class="badge badge-rose">${moodObj.emoji} ${existing.mood}/5 · ${moodObj.label}</span>
        </div>
        ${existing.note ? `<p style="margin:4px 0 0;font-size:13px;color:var(--text-primary);">"${escapeHtml(existing.note)}"</p>` : '<p class="tiny-text" style="margin:0;">Sin nota de reflexión.</p>'}
      </div>
    `;
  } else {
    const auto = computeTodayAutoSummary();
    statusBadge.className = 'badge';
    statusBadge.textContent = 'Pendiente';
    btnOpen.textContent = 'Cerrar día';
    previewEl.innerHTML = `
      <div class="grid-3">
        <div class="card-inset" style="text-align:center;padding:10px 8px;">
          <div class="font-mono" style="font-size:16px;font-weight:700;">${auto.tasksDone}/${auto.tasksTotal}</div>
          <div class="tiny-text">Tareas</div>
        </div>
        <div class="card-inset" style="text-align:center;padding:10px 8px;">
          <div class="font-mono" style="font-size:16px;font-weight:700;">${auto.pomosDone}</div>
          <div class="tiny-text">Pomodoros</div>
        </div>
        <div class="card-inset" style="text-align:center;padding:10px 8px;">
          <div class="font-mono" style="font-size:16px;font-weight:700;">${auto.habitsDone}/${auto.habitsTotal}</div>
          <div class="tiny-text">Hábitos</div>
        </div>
      </div>
    `;
  }
}

function openShutdownModal() {
  const today = getTodayKey();
  const auto = computeTodayAutoSummary();
  const existing = shutdownsMap[today];

  selectedShutdownMood = existing ? existing.mood : 4;
  document.getElementById('shutdown-note-input').value = existing ? (existing.note || '') : '';

  document.getElementById('shutdown-summary-grid').innerHTML = `
    <div class="card-inset" style="text-align:center;">
      <div class="font-mono" style="font-size:18px;font-weight:700;color:var(--rose);">${auto.top3Done}/${auto.top3Total || 3}</div>
      <div class="tiny-text">Top 3 hoy</div>
    </div>
    <div class="card-inset" style="text-align:center;">
      <div class="font-mono" style="font-size:18px;font-weight:700;">${auto.tasksDone}/${auto.tasksTotal}</div>
      <div class="tiny-text">Tareas totales</div>
    </div>
    <div class="card-inset" style="text-align:center;">
      <div class="font-mono" style="font-size:18px;font-weight:700;color:var(--emerald);">${auto.pomosDone} (${formatDurationCompact(auto.focusSec)})</div>
      <div class="tiny-text">Enfoque</div>
    </div>
    <div class="card-inset" style="text-align:center;">
      <div class="font-mono" style="font-size:18px;font-weight:700;color:var(--indigo-text);">${auto.habitsDone}/${auto.habitsTotal}</div>
      <div class="tiny-text">Hábitos</div>
    </div>
  `;

  renderMoodPicker();
  openModal('modal-shutdown');
}

function renderMoodPicker() {
  const container = document.getElementById('shutdown-mood-picker');
  if (!container) return;
  container.innerHTML = MOOD_OPTIONS.map((m) => `
    <button type="button" class="mood-btn ${selectedShutdownMood === m.value ? 'is-selected' : ''}" onclick="selectShutdownMood(${m.value})">
      <span class="mood-emoji">${m.emoji}</span>
      <span>${m.value}</span>
    </button>
  `).join('');
}

function selectShutdownMood(val) {
  selectedShutdownMood = val;
  triggerHaptic(10);
  renderMoodPicker();
}

function saveDailyShutdown(event) {
  if (event) event.preventDefault();
  const today = getTodayKey();
  const note = document.getElementById('shutdown-note-input').value.trim();
  const summary = computeTodayAutoSummary();

  shutdownsMap[today] = {
    dateKey: today,
    mood: selectedShutdownMood,
    note,
    summary,
    savedAt: new Date().toISOString(),
  };

  saveShutdowns();
  triggerHaptic([25, 45, 35]);
  closeModal('modal-shutdown');
  renderTodayShutdownCard();
  showToast('Cierre del día guardado. ¡Buen descanso!', 'success');
}
