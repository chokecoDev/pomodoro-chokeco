/**
 * =========================================================================
 * MÓDULO 1: HOY (TOP 3 DIARIO, CHECKLIST GENERAL, CAPTURA RÁPIDA, SWIPE, ROLLOVER)
 * =========================================================================
 */

let editingTaskId = null;

function getTodayTasks() {
  const today = getTodayKey();
  return tasksList.filter((t) => t.dateKey === today && !t.discarded);
}

function getTomorrowTasks() {
  const tomorrow = getTomorrowKey();
  return tasksList.filter((t) => t.dateKey === tomorrow && !t.discarded);
}

/** Tareas incompletas de días anteriores pendientes de revisión (rollover) */
function getCarryoverTasks() {
  const today = getTodayKey();
  return tasksList.filter((t) => t.dateKey < today && !t.completed && !t.discarded);
}

function getTodayTop3Tasks() {
  return getTodayTasks().filter((t) => t.priority === 'top3');
}

function getTodayGeneralTasks() {
  return getTodayTasks().filter((t) => t.priority !== 'top3');
}

function updateTodayNavBadge() {
  const badge = document.getElementById('nav-today-badge');
  if (!badge) return;
  const remaining = getTodayTasks().filter((t) => !t.completed).length;
  if (remaining > 0) {
    badge.textContent = remaining > 99 ? '99+' : String(remaining);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// =========================================================================
// CAPTURA RÁPIDA (FAB) Y EDICIÓN DE TAREAS
// =========================================================================

function openTaskModal(presetPriority = 'general', taskId = null) {
  editingTaskId = taskId;
  const titleEl = document.getElementById('modal-task-heading');
  const inputTitle = document.getElementById('task-input-title');
  const inputTag = document.getElementById('task-input-tag');
  const checkTop3 = document.getElementById('task-input-top3');
  const top3Hint = document.getElementById('task-top3-limit-hint');
  const submitBtn = document.getElementById('task-submit-btn');

  const top3Count = getTodayTop3Tasks().length;

  if (taskId) {
    const task = tasksList.find((t) => t.id === taskId);
    if (!task) return;
    titleEl.textContent = 'Editar tarea';
    submitBtn.textContent = 'Guardar cambios';
    inputTitle.value = task.title;
    inputTag.value = task.tag || 'Trabajo';
    checkTop3.checked = task.priority === 'top3';
    const fullAndNotThis = top3Count >= TOP3_LIMIT && task.priority !== 'top3';
    checkTop3.disabled = fullAndNotThis;
    top3Hint.textContent = fullAndNotThis
      ? `Tu Top 3 diario ya está completo (${TOP3_LIMIT}/${TOP3_LIMIT}).`
      : `Prioridad crítica del día (${top3Count}/${TOP3_LIMIT} ocupados).`;
  } else {
    titleEl.textContent = 'Nueva tarea para hoy';
    submitBtn.textContent = 'Agregar tarea';
    inputTitle.value = '';
    inputTag.value = 'Trabajo';
    const canBeTop3 = top3Count < TOP3_LIMIT;
    checkTop3.disabled = !canBeTop3;
    checkTop3.checked = presetPriority === 'top3' && canBeTop3;
    top3Hint.textContent = canBeTop3
      ? `Prioridad crítica del día (${top3Count}/${TOP3_LIMIT} ocupados).`
      : `Tu Top 3 diario ya está lleno (${TOP3_LIMIT}/${TOP3_LIMIT}). Se agregará al checklist general.`;
  }

  openModal('modal-task');
  setTimeout(() => {
    inputTitle.focus();
  }, 60);
}

function submitTaskForm(event) {
  if (event) event.preventDefault();
  const inputTitle = document.getElementById('task-input-title');
  const inputTag = document.getElementById('task-input-tag');
  const checkTop3 = document.getElementById('task-input-top3');

  const title = inputTitle.value.trim();
  if (!title) {
    showToast('Escribe un título para la tarea.', 'warning');
    inputTitle.focus();
    return;
  }

  const tag = inputTag.value.trim() || 'Trabajo';
  const wantsTop3 = checkTop3.checked;
  const today = getTodayKey();
  const currentTop3Count = getTodayTop3Tasks().length;

  if (editingTaskId) {
    const task = tasksList.find((t) => t.id === editingTaskId);
    if (task) {
      if (wantsTop3 && task.priority !== 'top3' && currentTop3Count >= TOP3_LIMIT) {
        showToast(`Límite estricto de ${TOP3_LIMIT} tareas en Top 3 diario.`, 'warning');
        return;
      }
      task.title = title;
      task.tag = tag;
      task.priority = wantsTop3 ? 'top3' : 'general';
      saveTasks();
      showToast('Tarea actualizada.', 'success');
    }
  } else {
    const finalPriority = wantsTop3 && currentTop3Count < TOP3_LIMIT ? 'top3' : 'general';
    if (wantsTop3 && finalPriority !== 'top3') {
      showToast(`Top 3 completo (${TOP3_LIMIT}/${TOP3_LIMIT}). Guardada en checklist general.`, 'warning');
    }

    const newTask = {
      id: generateId('task'),
      title,
      tag,
      priority: finalPriority,
      dateKey: today,
      completed: false,
      completedAt: null,
      focusedSec: 0,
      pomodorosCount: 0,
      createdAt: new Date().toISOString(),
    };
    tasksList.unshift(newTask);
    saveTasks();
    triggerHaptic(15);
    showToast(finalPriority === 'top3' ? 'Agregada a tu Top 3 diario.' : 'Tarea agregada a Hoy.', 'success');
  }

  editingTaskId = null;
  closeModal('modal-task');
  renderTodayView();
  if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
}

// =========================================================================
// ACCIONES SOBRE TAREAS (COMPLETAR, PROMOVER, POSPONER, ELIMINAR, ENFOCAR)
// =========================================================================

function toggleTaskComplete(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
  saveTasks();

  if (task.completed) {
    const top3 = getTodayTop3Tasks();
    const allTop3Done = top3.length > 0 && top3.every((t) => t.completed);
    if (task.priority === 'top3' && allTop3Done) {
      triggerHaptic([25, 45, 35]);
      showToast('¡Excelente! Completaste tu Top 3 de hoy.', 'success');
    } else {
      triggerHaptic(16);
    }
  } else {
    triggerHaptic(10);
  }

  renderTodayView();
  if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
}

function toggleTaskTop3(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;

  if (task.priority === 'top3') {
    task.priority = 'general';
    saveTasks();
    triggerHaptic(10);
    showToast('Movida al checklist general.', 'info');
  } else {
    const top3Count = getTodayTop3Tasks().length;
    if (top3Count >= TOP3_LIMIT) {
      triggerHaptic([20, 30, 20]);
      showToast(`Tu Top 3 tiene un límite estricto de ${TOP3_LIMIT} tareas.`, 'warning');
      return;
    }
    task.priority = 'top3';
    saveTasks();
    triggerHaptic(16);
    showToast('Promovida a tu Top 3 diario.', 'success');
  }

  renderTodayView();
}

function postponeTaskToTomorrow(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;

  task.dateKey = getTomorrowKey();
  task.completed = false;
  task.completedAt = null;
  // Si mañana ya tuviera 3 en Top 3, bajar a general
  const tomorrowTop3 = tasksList.filter((t) => t.dateKey === task.dateKey && t.priority === 'top3' && t.id !== task.id);
  if (task.priority === 'top3' && tomorrowTop3.length >= TOP3_LIMIT) {
    task.priority = 'general';
  }

  saveTasks();
  triggerHaptic(15);
  showToast('Tarea pospuesta para mañana.', 'info');
  renderTodayView();
  if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
}

function bringTomorrowTaskToToday(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;
  const top3Count = getTodayTop3Tasks().length;
  task.dateKey = getTodayKey();
  if (task.priority === 'top3' && top3Count >= TOP3_LIMIT) {
    task.priority = 'general';
  }
  saveTasks();
  triggerHaptic(12);
  showToast('Tarea traída a Hoy.', 'success');
  renderTodayView();
  if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
}

function deleteTask(taskId) {
  const idx = tasksList.findIndex((t) => t.id === taskId);
  if (idx === -1) return;
  tasksList.splice(idx, 1);

  if (appState.config.linkedTaskId === taskId) {
    appState.config.linkedTaskId = null;
    appState.config.linkedTaskTitle = null;
    saveState();
  }

  saveTasks();
  triggerHaptic(18);
  showToast('Tarea eliminada.', 'info');
  renderTodayView();
  if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
}

/** Vincula la tarea directamente al Pomodoro y cambia a la pestaña Enfoque */
function focusOnTask(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;

  appState.config.linkedTaskId = task.id;
  appState.config.linkedTaskTitle = task.title;
  if (task.tag) {
    appState.config.tag = task.tag;
  }
  saveState();
  triggerHaptic(16);
  switchTab('focus');

  if (appState.phase === PHASE.SETUP) {
    syncSetupInputsFromConfig();
  }
  showToast(`Enfoque vinculado: "${task.title}"`, 'info');
}

/** Registra tiempo efectivo trabajado sobre una tarea al completar/detener Pomodoro */
function addFocusedTimeToTask(taskId, focusedSec, wasCompleted) {
  if (!taskId || focusedSec <= 0) return;
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;
  task.focusedSec = (task.focusedSec || 0) + Math.round(focusedSec);
  if (wasCompleted) {
    task.pomodorosCount = (task.pomodorosCount || 0) + 1;
  }
  saveTasks();
}

// =========================================================================
// GESTIÓN DE PENDIENTES DE DÍAS ANTERIORES (ROLLOVER)
// =========================================================================

function moveAllCarryoverToToday() {
  const carryover = getCarryoverTasks();
  if (carryover.length === 0) return;

  const today = getTodayKey();
  let top3Count = getTodayTop3Tasks().length;

  carryover.forEach((task) => {
    task.dateKey = today;
    if (task.priority === 'top3') {
      if (top3Count < TOP3_LIMIT) {
        top3Count += 1;
      } else {
        task.priority = 'general';
      }
    }
  });

  saveTasks();
  triggerHaptic(18);
  closeModal('modal-rollover');
  showToast(`${carryover.length} ${carryover.length === 1 ? 'pendiente movido' : 'pendientes movidos'} a Hoy.`, 'success');
  renderTodayView();
  if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
}

function discardAllCarryover() {
  const carryover = getCarryoverTasks();
  if (carryover.length === 0) return;

  carryover.forEach((task) => {
    task.discarded = true;
  });

  saveTasks();
  triggerHaptic(15);
  closeModal('modal-rollover');
  showToast('Pendientes anteriores descartados.', 'info');
  renderTodayView();
}

function moveSingleCarryoverToToday(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;
  const top3Count = getTodayTop3Tasks().length;
  task.dateKey = getTodayKey();
  if (task.priority === 'top3' && top3Count >= TOP3_LIMIT) {
    task.priority = 'general';
  }
  saveTasks();
  triggerHaptic(12);
  renderRolloverModalList();
  renderTodayView();
  if (getCarryoverTasks().length === 0) {
    closeModal('modal-rollover');
  }
}

function discardSingleCarryover(taskId) {
  const task = tasksList.find((t) => t.id === taskId);
  if (!task) return;
  task.discarded = true;
  saveTasks();
  triggerHaptic(12);
  renderRolloverModalList();
  renderTodayView();
  if (getCarryoverTasks().length === 0) {
    closeModal('modal-rollover');
  }
}

function openRolloverModal() {
  renderRolloverModalList();
  openModal('modal-rollover');
}

function renderRolloverModalList() {
  const container = document.getElementById('rollover-modal-list');
  if (!container) return;
  const items = getCarryoverTasks();

  if (items.length === 0) {
    container.innerHTML = '<p class="muted-text" style="text-align:center;padding:12px 0;">No quedan pendientes anteriores.</p>';
    return;
  }

  container.innerHTML = items
    .map((t) => `
      <div class="card-inset row-between">
        <div style="min-width:0;flex:1;">
          <div class="task-title">${escapeHtml(t.title)}</div>
          <div class="tiny-text" style="margin-top:2px;">Del ${formatDateKeyDisplay(t.dateKey)} · ${escapeHtml(t.tag || 'Trabajo')}</div>
        </div>
        <div class="row-wrap" style="flex-shrink:0;">
          <button type="button" class="btn btn-sm btn-emerald" onclick="moveSingleCarryoverToToday('${t.id}')">A hoy</button>
          <button type="button" class="btn btn-sm btn-danger-soft" onclick="discardSingleCarryover('${t.id}')">Descartar</button>
        </div>
      </div>
    `)
    .join('');
}

// =========================================================================
// RENDERIZADO DE LA VISTA "HOY" Y GESTOS SWIPE TÁCTILES
// =========================================================================

function renderTaskCardHtml(task) {
  const isTop3 = task.priority === 'top3';
  const focusBadge = (task.focusedSec || 0) > 0
    ? `<span class="badge badge-rose font-mono">⏱ ${formatDurationHuman(task.focusedSec)}</span>`
    : '';
  const tagBadge = task.tag
    ? `<span class="badge">${escapeHtml(task.tag)}</span>`
    : '';

  return `
    <div class="task-swipe-shell" data-task-id="${task.id}">
      <div class="task-swipe-bg">
        <span class="task-swipe-bg-left">✓ ${task.completed ? 'Reabrir' : 'Completar'}</span>
        <span class="task-swipe-bg-right">→ Mañana</span>
      </div>
      <div class="task-item ${task.completed ? 'is-completed' : ''}" data-swipe-task="${task.id}">
        <button type="button" class="task-check ${isTop3 ? 'is-top3' : ''} ${task.completed ? 'is-checked' : ''}" onclick="toggleTaskComplete('${task.id}')" aria-label="Marcar tarea como completada">
          ${task.completed ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' : ''}
        </button>

        <div class="task-body">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${tagBadge}
            ${focusBadge}
          </div>
        </div>

        <div class="task-actions">
          ${!task.completed ? `
            <button type="button" class="task-action-btn is-focus" onclick="focusOnTask('${task.id}')" title="Iniciar Pomodoro en esta tarea" aria-label="Enfocar tarea">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="13" r="8"/><path stroke-linecap="round" d="M12 9v4l2.5 1.5M9.5 3h5"/></svg>
            </button>
          ` : ''}
          <button type="button" class="task-action-btn" onclick="toggleTaskTop3('${task.id}')" title="${isTop3 ? 'Mover a checklist general' : 'Subir a Top 3'}" aria-label="${isTop3 ? 'Bajar de Top 3' : 'Subir a Top 3'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isTop3 ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
          </button>
          <button type="button" class="task-action-btn" onclick="openTaskModal('${task.priority}', '${task.id}')" title="Editar tarea" aria-label="Editar tarea">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          ${!task.completed ? `
            <button type="button" class="task-action-btn" onclick="postponeTaskToTomorrow('${task.id}')" title="Posponer para mañana" aria-label="Posponer para mañana">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
            </button>
          ` : ''}
          <button type="button" class="task-action-btn is-danger" onclick="deleteTask('${task.id}')" title="Eliminar tarea" aria-label="Eliminar tarea">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachSwipeHandlers(container) {
  if (!container) return;
  container.querySelectorAll('[data-swipe-task]').forEach((item) => {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let tracking = false;
    let lockedHorizontal = false;

    const shell = item.closest('.task-swipe-shell');
    const bgLeft = shell ? shell.querySelector('.task-swipe-bg-left') : null;
    const bgRight = shell ? shell.querySelector('.task-swipe-bg-right') : null;

    item.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      tracking = true;
      lockedHorizontal = false;
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const diffX = curX - startX;
      const diffY = curY - startY;

      if (!lockedHorizontal) {
        if (Math.abs(diffY) > 14 && Math.abs(diffY) > Math.abs(diffX)) {
          tracking = false;
          return;
        }
        if (Math.abs(diffX) > 12) {
          lockedHorizontal = true;
          item.classList.add('is-swiping');
        }
      }

      if (lockedHorizontal) {
        dx = Math.max(-110, Math.min(110, diffX));
        item.style.transform = `translateX(${dx}px)`;
        if (bgLeft) bgLeft.style.opacity = dx > 20 ? String(Math.min(1, dx / 75)) : '0';
        if (bgRight) bgRight.style.opacity = dx < -20 ? String(Math.min(1, -dx / 75)) : '0';
      }
    }, { passive: true });

    const finishSwipe = () => {
      if (!tracking) return;
      tracking = false;
      item.classList.remove('is-swiping');
      item.style.transform = '';
      if (bgLeft) bgLeft.style.opacity = '0';
      if (bgRight) bgRight.style.opacity = '0';

      const taskId = item.dataset.swipeTask;
      if (dx > 72) {
        toggleTaskComplete(taskId);
      } else if (dx < -72) {
        postponeTaskToTomorrow(taskId);
      }
    };

    item.addEventListener('touchend', finishSwipe);
    item.addEventListener('touchcancel', finishSwipe);
  });
}

function renderTodayView() {
  const dateLabel = document.getElementById('today-date-label');
  if (dateLabel) dateLabel.textContent = formatTodayHeaderDate();

  // 1. Banner de rollover (pendientes de días anteriores)
  const rolloverBanner = document.getElementById('rollover-banner');
  const carryover = getCarryoverTasks();
  if (rolloverBanner) {
    if (carryover.length > 0) {
      rolloverBanner.classList.remove('hidden');
      document.getElementById('rollover-count-text').textContent =
        `Tienes ${carryover.length} ${carryover.length === 1 ? 'tarea pendiente' : 'tareas pendientes'} de días anteriores.`;
    } else {
      rolloverBanner.classList.add('hidden');
    }
  }

  // 2. Top 3 Diario
  const top3 = getTodayTop3Tasks().sort((a, b) => Number(a.completed) - Number(b.completed));
  const top3Done = top3.filter((t) => t.completed).length;
  const top3ListEl = document.getElementById('top3-list');
  const top3CounterEl = document.getElementById('top3-counter');
  const top3ProgressEl = document.getElementById('top3-progress-bar');
  const btnAddTop3 = document.getElementById('btn-add-top3');

  if (top3CounterEl) top3CounterEl.textContent = `${top3Done}/${TOP3_LIMIT} completadas`;
  if (top3ProgressEl) top3ProgressEl.style.width = `${(top3Done / TOP3_LIMIT) * 100}%`;
  if (btnAddTop3) btnAddTop3.disabled = top3.length >= TOP3_LIMIT;

  if (top3ListEl) {
    let html = top3.map(renderTaskCardHtml).join('');
    const remainingSlots = Math.max(0, TOP3_LIMIT - top3.length);
    if (top3.length === 0) {
      html = `
        <button type="button" class="empty-slot btn-block" onclick="openTaskModal('top3')">
          + Define hasta ${TOP3_LIMIT} prioridades críticas para hoy
        </button>
      `;
    } else if (remainingSlots > 0) {
      html += `
        <button type="button" class="empty-slot btn-block" onclick="openTaskModal('top3')">
          + Agregar prioridad (${top3.length}/${TOP3_LIMIT} ocupadas)
        </button>
      `;
    }
    top3ListEl.innerHTML = html;
    attachSwipeHandlers(top3ListEl);
  }

  // 3. Checklist General
  const general = getTodayGeneralTasks().sort((a, b) => Number(a.completed) - Number(b.completed));
  const generalListEl = document.getElementById('general-list');
  const generalCountEl = document.getElementById('general-counter');
  if (generalCountEl) {
    const doneGen = general.filter((t) => t.completed).length;
    generalCountEl.textContent = `${doneGen}/${general.length}`;
  }

  if (generalListEl) {
    if (general.length === 0) {
      generalListEl.innerHTML = `
        <div class="empty-slot">
          Sin tareas operativas por ahora. Usa el botón <strong>+</strong> para capturar una idea al vuelo.
        </div>
      `;
    } else {
      generalListEl.innerHTML = general.map(renderTaskCardHtml).join('');
      attachSwipeHandlers(generalListEl);
    }
  }

  // 4. Tareas programadas para mañana (si existen)
  const tomorrowWrap = document.getElementById('tomorrow-tasks-wrap');
  const tomorrowList = document.getElementById('tomorrow-tasks-list');
  const tomorrowCount = document.getElementById('tomorrow-tasks-count');
  const tomorrowTasks = getTomorrowTasks();

  if (tomorrowWrap && tomorrowList && tomorrowCount) {
    if (tomorrowTasks.length > 0) {
      tomorrowWrap.classList.remove('hidden');
      tomorrowCount.textContent = String(tomorrowTasks.length);
      tomorrowList.innerHTML = tomorrowTasks
        .map((t) => `
          <div class="list-row">
            <div style="min-width:0;flex:1;">
              <div class="task-title" style="font-size:13px;">${escapeHtml(t.title)}</div>
              <div class="tiny-text">${escapeHtml(t.tag || 'Trabajo')}</div>
            </div>
            <div class="row-wrap">
              <button type="button" class="btn btn-sm btn-secondary" onclick="bringTomorrowTaskToToday('${t.id}')">Traer a hoy</button>
              <button type="button" class="btn btn-sm btn-danger-soft" onclick="deleteTask('${t.id}')">×</button>
            </div>
          </div>
        `)
        .join('');
    } else {
      tomorrowWrap.classList.add('hidden');
    }
  }

  updateTodayNavBadge();
}
