/**
 * =========================================================================
 * NOTIFICACIONES TOAST, MODALES Y NAVEGACIÓN ENTRE VISTAS
 * =========================================================================
 */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  const colors = {
    info: 'bg-zinc-900 border-zinc-700 text-zinc-100',
    success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200',
    warning: 'bg-amber-950/95 border-amber-500/40 text-amber-200',
    error: 'bg-rose-950/95 border-rose-500/40 text-rose-200',
  };
  el.className = `pointer-events-auto px-4 py-3 rounded-xl border text-xs sm:text-sm font-medium shadow-xl transition-all duration-300 translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  el.textContent = message;
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function setBrandAccent(color) {
  const dot = document.getElementById('brand-dot');
  if (color === 'emerald') {
    dot.className = 'w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 transition-colors';
  } else if (color === 'amber') {
    dot.className = 'w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 transition-colors';
  } else {
    dot.className = 'w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 transition-colors';
  }
}

function switchTab(tab) {
  currentMainTab = tab;
  const timerView = document.getElementById('view-timer');
  const historyView = document.getElementById('view-history');
  const tabTimer = document.getElementById('tab-timer');
  const tabHistory = document.getElementById('tab-history');

  if (tab === 'timer') {
    timerView.classList.remove('hidden');
    historyView.classList.add('hidden');
    tabTimer.className = 'px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all bg-zinc-800 text-zinc-100 shadow-sm';
    tabHistory.className = 'px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5';
  } else {
    timerView.classList.add('hidden');
    historyView.classList.remove('hidden');
    tabHistory.className = 'px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all bg-zinc-800 text-zinc-100 shadow-sm flex items-center gap-1.5';
    tabTimer.className = 'px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all text-zinc-400 hover:text-zinc-200';
    populateTagFilter();
    refreshActiveHistoryView();
  }
}

function switchHistorySubTab(subTab) {
  currentHistorySubTab = subTab;
  const auditPanel = document.getElementById('history-panel-audit');
  const reportsPanel = document.getElementById('history-panel-reports');
  const btnAudit = document.getElementById('subtab-audit');
  const btnReports = document.getElementById('subtab-reports');

  const activeCls = 'flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all bg-zinc-800 text-zinc-100 shadow-sm flex items-center justify-center gap-2';
  const idleCls = 'flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-2';

  if (subTab === 'reports') {
    auditPanel.classList.add('hidden');
    reportsPanel.classList.remove('hidden');
    btnAudit.className = idleCls;
    btnReports.className = activeCls;
    if (typeof renderReports === 'function') {
      renderReports();
    }
  } else {
    reportsPanel.classList.add('hidden');
    auditPanel.classList.remove('hidden');
    btnAudit.className = activeCls;
    btnReports.className = idleCls;
    if (typeof renderHistory === 'function') {
      renderHistory();
    }
  }
}

function refreshActiveHistoryView() {
  if (currentHistorySubTab === 'reports') {
    if (typeof renderReports === 'function') renderReports();
  } else {
    if (typeof renderHistory === 'function') renderHistory();
  }
}
