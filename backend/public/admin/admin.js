const API_BASE = '/api/admin';
const TOKEN_KEY = 'alux_admin_token';

const state = {
  page: 1,
  pageSize: 25,
  total: 0,
  status: '',
  search: '',
};

const els = {
  loginView: document.getElementById('login-view'),
  dashboardView: document.getElementById('dashboard-view'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  adminEmail: document.getElementById('admin-email'),
  logoutBtn: document.getElementById('logout-btn'),
  stats: document.getElementById('stats'),
  searchInput: document.getElementById('search-input'),
  statusFilter: document.getElementById('status-filter'),
  refreshBtn: document.getElementById('refresh-btn'),
  tableBody: document.getElementById('submissions-body'),
  prevPage: document.getElementById('prev-page'),
  nextPage: document.getElementById('next-page'),
  pageInfo: document.getElementById('page-info'),
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    setToken(null);
    showLogin();
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showLogin() {
  els.loginView.hidden = false;
  els.dashboardView.hidden = true;
}

function showDashboard(email) {
  els.loginView.hidden = true;
  els.dashboardView.hidden = false;
  els.adminEmail.textContent = email || '';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(iso) {
  try {
    return new Date(iso + 'Z').toLocaleString();
  } catch {
    return iso;
  }
}

// --- Login ---------------------------------------------------------------

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    setToken(data.token);
    showDashboard(data.email);
    loadStats();
    loadSubmissions();
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.hidden = false;
  }
});

els.logoutBtn.addEventListener('click', () => {
  setToken(null);
  showLogin();
});

// --- Stats -----------------------------------------------------------------

async function loadStats() {
  try {
    const data = await apiFetch('/stats');
    const byStatus = Object.fromEntries(data.byStatus.map((s) => [s.status, s.c]));
    els.stats.innerHTML = `
      <div class="stat-card"><div class="num">${data.total}</div><div class="label">Total</div></div>
      <div class="stat-card"><div class="num">${byStatus.new || 0}</div><div class="label">New</div></div>
      <div class="stat-card"><div class="num">${byStatus.read || 0}</div><div class="label">Read</div></div>
      <div class="stat-card"><div class="num">${byStatus.archived || 0}</div><div class="label">Archived</div></div>
    `;
  } catch {
    els.stats.innerHTML = '';
  }
}

// --- Submissions table -----------------------------------------------------

async function loadSubmissions() {
  els.tableBody.innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;
  const params = new URLSearchParams({
    page: state.page,
    pageSize: state.pageSize,
  });
  if (state.status) params.set('status', state.status);
  if (state.search) params.set('search', state.search);

  try {
    const data = await apiFetch(`/submissions?${params.toString()}`);
    state.total = data.total;
    renderTable(data.submissions);
    renderPagination();
  } catch (err) {
    els.tableBody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(rows) {
  if (!rows.length) {
    els.tableBody.innerHTML = `<tr><td colspan="7" class="empty">No submissions found.</td></tr>`;
    return;
  }

  els.tableBody.innerHTML = rows
    .map(
      (r) => `
    <tr data-id="${r.id}">
      <td>${formatDate(r.created_at)}</td>
      <td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td>
      <td>${escapeHtml(r.email)}</td>
      <td>${escapeHtml(r.company)}</td>
      <td class="message-cell">${escapeHtml(r.message)}</td>
      <td><span class="badge badge-${r.status}">${r.status}</span></td>
      <td class="row-actions">
        ${r.status !== 'read' ? `<button class="btn-secondary" data-action="read">Mark read</button>` : ''}
        ${r.status !== 'archived' ? `<button class="btn-secondary" data-action="archive">Archive</button>` : ''}
        <button class="btn-secondary" data-action="delete">Delete</button>
      </td>
    </tr>
  `
    )
    .join('');
}

els.tableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const row = btn.closest('tr');
  const id = row.dataset.id;
  const action = btn.dataset.action;

  try {
    if (action === 'delete') {
      if (!confirm('Delete this submission permanently?')) return;
      await apiFetch(`/submissions/${id}`, { method: 'DELETE' });
    } else {
      const status = action === 'read' ? 'read' : 'archived';
      await apiFetch(`/submissions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    }
    loadStats();
    loadSubmissions();
  } catch (err) {
    alert(err.message);
  }
});

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  els.pageInfo.textContent = `Page ${state.page} of ${totalPages} (${state.total} total)`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
}

els.prevPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadSubmissions();
  }
});

els.nextPage.addEventListener('click', () => {
  state.page += 1;
  loadSubmissions();
});

els.refreshBtn.addEventListener('click', () => {
  loadStats();
  loadSubmissions();
});

let searchDebounce;
els.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadSubmissions();
  }, 300);
});

els.statusFilter.addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  loadSubmissions();
});

// --- Init --------------------------------------------------------------

async function init() {
  if (!getToken()) {
    showLogin();
    return;
  }
  try {
    const me = await apiFetch('/me');
    showDashboard(me.email);
    loadStats();
    loadSubmissions();
  } catch {
    showLogin();
  }
}

init();
