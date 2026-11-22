/**
 * =========================================================================
 * TEMA OSCURO/CLARO, TOASTS, MODALES Y NAVEGACIÓN DE 4 PESTAÑAS
 * =========================================================================
 */

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', normalized === 'light' ? '#f4f4f7' : '#09090b');
  }
  const iconSun = document.getElementById('icon-theme-sun');
  const iconMoon = document.getElementById('icon-theme-moon');
  if (iconSun && iconMoon) {
    iconSun.classList.toggle('hidden', normalized !== 'dark');
    iconMoon.classList.toggle('hidden', normalized !== 'light');
  }
}

function toggleThemeQuick() {
  userPrefs.theme = userPrefs.theme === 'light' ? 'dark' : 'light';
  savePrefs();
  applyTheme(userPrefs.theme);
  triggerHaptic(10);
  if (typeof syncSettingsUi === 'function') syncSettingsUi();
}

function setTheme(theme) {
  userPrefs.theme = theme === 'light' ? 'light' : 'dark';
  savePrefs();
  applyTheme(userPrefs.theme);
  if (typeof syncSettingsUi === 'function') syncSettingsUi();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  const typeCls = type === 'success'
    ? 'toast-success'
    : type === 'warning'
      ? 'toast-warning'
      : type === 'error'
        ? 'toast-error'
        : '';

  el.className = `toast ${typeCls}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('is-visible');
  });

  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }, 2900);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function setBrandAccent(color) {
  const dot = document.getElementById('brand-dot');
  if (!dot) return;
  dot.classList.remove('accent-emerald', 'accent-amber');
  if (color === 'emerald') dot.classList.add('accent-emerald');
  else if (color === 'amber') dot.classList.add('accent-amber');
}

// =========================================================================
// NAVEGACIÓN PRINCIPAL (4 PESTAÑAS INFERIORES: HOY, ENFOQUE, HÁBITOS, PROGRESO)
// =========================================================================

function switchTab(tab) {
  const validTabs = ['today', 'focus', 'habits', 'progress'];
  const target = validTabs.includes(tab) ? tab : 'today';
  currentMainTab = target;

  validTabs.forEach((t) => {
    const view = document.getElementById(`view-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (view) view.classList.toggle('hidden', t !== target);
    if (navBtn) {
      navBtn.classList.toggle('is-active', t === target);
      navBtn.setAttribute('aria-current', t === target ? 'page' : 'false');
    }
  });

  // FAB visible únicamente en la pestaña "Hoy" para captura rápida en 1 toque
  const fab = document.getElementById('fab-quick-add');
  if (fab) fab.classList.toggle('hidden', target !== 'today');

  if (typeof hideReportTooltip === 'function') hideReportTooltip();

  if (target === 'today') {
    if (typeof renderTodayView === 'function') renderTodayView();
  } else if (target === 'focus') {
    if (typeof populateTaskLinkSelect === 'function') populateTaskLinkSelect();
    if (typeof renderApp === 'function') renderApp();
    if (typeof renderTodaySummary === 'function') renderTodaySummary();
  } else if (target === 'habits') {
    if (typeof renderHabitsView === 'function') renderHabitsView();
  } else if (target === 'progress') {
    if (typeof populateTagFilter === 'function') populateTagFilter();
    refreshActiveProgressView();
  }
}

function switchProgressSubTab(subTab) {
  const valid = ['overview', 'reports', 'audit', 'settings'];
  const target = valid.includes(subTab) ? subTab : 'overview';
  currentProgressSubTab = target;

  valid.forEach((s) => {
    const panel = document.getElementById(`progress-panel-${s}`);
    const btn = document.getElementById(`subtab-${s}`);
    if (panel) panel.classList.toggle('hidden', s !== target);
    if (btn) btn.classList.toggle('is-active', s === target);
  });

  if (typeof hideReportTooltip === 'function') hideReportTooltip();
  refreshActiveProgressView();
}

function refreshActiveProgressView() {
  if (currentProgressSubTab === 'overview') {
    if (typeof renderProgressOverview === 'function') renderProgressOverview();
  } else if (currentProgressSubTab === 'reports') {
    if (typeof renderReports === 'function') renderReports();
  } else if (currentProgressSubTab === 'audit') {
    if (typeof renderHistory === 'function') renderHistory();
  } else if (currentProgressSubTab === 'settings') {
    if (typeof renderSettingsPanel === 'function') renderSettingsPanel();
  }
}

function updateHeaderMiniTimer(text, phase) {
  const pill = document.getElementById('header-mini-timer');
  const label = document.getElementById('header-mini-timer-text');
  if (!pill || !label) return;

  const isActive =
    phase === PHASE.RUNNING_POMODORO ||
    phase === PHASE.PAUSED_POMODORO ||
    phase === PHASE.RUNNING_BREAK ||
    phase === PHASE.PAUSED_BREAK;

  if (!isActive || currentMainTab === 'focus') {
    pill.classList.add('hidden');
    return;
  }

  pill.classList.remove('hidden', 'is-break', 'is-paused');
  if (phase === PHASE.PAUSED_POMODORO || phase === PHASE.PAUSED_BREAK) {
    pill.classList.add('is-paused');
  } else if (phase === PHASE.RUNNING_BREAK) {
    pill.classList.add('is-break');
  }
  label.textContent = text;
}
