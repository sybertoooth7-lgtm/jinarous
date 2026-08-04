/**
 * Admin Dashboard
 * Fix #1: ALL user data rendered via textContent — no innerHTML with user input.
 */

const API_BASE = '/api/admin';

let state = {
  token: null,
  user: null,
  submissions: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
  statusFilter: '',
  searchQuery: ''
};

/* ---------- Helpers ---------- */

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString();
}

function truncate(str, len = 80) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

/* ---------- Safe DOM Rendering (Fix #1: No innerHTML with user data) ---------- */

function createEl(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text; // SAFE: textContent escapes HTML
  if (className) el.className = className;
  return el;
}

function renderSubmissions() {
  const tbody = $('submissions-body');
  tbody.innerHTML = ''; // Safe: clearing own container, not injecting user data

  if (state.submissions.length === 0) {
    const tr = document.createElement('tr');
    const td = createEl('td', 'No submissions found.');
    td.colSpan = 7;
    td.style.textAlign = 'center';
    td.style.padding = '24px';
    td.style.color = '#666';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  state.submissions.forEach(sub => {
    const tr = document.createElement('tr');

    // Name
    tr.appendChild(createEl('td', sub.name));
    // Email
    tr.appendChild(createEl('td', sub.email));
    // Company
    tr.appendChild(createEl('td', sub.company || '-'));
    // Message (truncated)
    const msgTd = createEl('td', truncate(sub.message, 100));
    msgTd.title = sub.message || '';
    tr.appendChild(msgTd);
    // Status
    const statusTd = createEl('td', '');
    const statusBadge = createEl('span', sub.status || 'new', `badge badge-${sub.status || 'new'}`);
    statusTd.appendChild(statusBadge);
    tr.appendChild(statusTd);
    // Date
    tr.appendChild(createEl('td', formatDate(sub.created_at)));
    // Actions
    const actionsTd = createEl('td', '');
    actionsTd.className = 'actions-cell';

    // Status dropdown
    const statusSelect = document.createElement('select');
    ['new', 'read', 'replied', 'archived'].forEach(s => {
      const opt = createEl('option', s);
      opt.value = s;
      if (s === (sub.status || 'new')) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', () => updateStatus(sub.id, statusSelect.value));
    actionsTd.appendChild(statusSelect);

    // Delete button
    const delBtn = createEl('button', 'Delete', 'btn-danger');
    delBtn.addEventListener('click', () => deleteSubmission(sub.id));
    actionsTd.appendChild(delBtn);

    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

function renderPagination() {
  $('stat-total').textContent = state.total;
  $('stat-showing').textContent = state.submissions.length;
  $('page-info').textContent = `Page ${state.page} of ${state.totalPages}`;
  $('prev-page').disabled = state.page <= 1;
  $('next-page').disabled = state.page >= state.totalPages;
}

/* ---------- API Calls ---------- */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (res.status === 401) {
    state.token = null;
    showScreen('login-screen');
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchMe() {
  const data = await api(`${API_BASE}/me`);
  state.user = data.user;
  $('user-email').textContent = data.user?.email || '';
}

async function fetchSubmissions() {
  const params = new URLSearchParams();
  params.set('page', String(state.page));
  params.set('limit', String(state.limit));
  if (state.statusFilter) params.set('status', state.statusFilter);
  if (state.searchQuery) params.set('search', state.searchQuery);

  const data = await api(`${API_BASE}/submissions?${params}`);
  state.submissions = data.data || [];
  state.total = data.total || 0;
  state.totalPages = data.totalPages || 1;
  renderSubmissions();
  renderPagination();
}

async function updateStatus(id, status) {
  try {
    await api(`${API_BASE}/submissions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    // Refresh to show updated state
    await fetchSubmissions();
  } catch (err) {
    alert('Failed to update status: ' + err.message);
  }
}

async function deleteSubmission(id) {
  if (!confirm('Are you sure you want to delete this submission? This cannot be undone.')) return;
  try {
    await api(`${API_BASE}/submissions/${id}`, { method: 'DELETE' });
    await fetchSubmissions();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function login(email, password) {
  try {
    await api(`${API_BASE}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    showScreen('dashboard-screen');
    await fetchMe();
    await fetchSubmissions();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
}

async function logout() {
  try {
    await api(`${API_BASE}/logout`, { method: 'POST' });
  } catch {
    // Ignore logout errors
  }
  state.token = null;
  state.user = null;
  showScreen('login-screen');
}

/* ---------- Event Listeners ---------- */

$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  login(email, password);
});

$('logout-btn').addEventListener('click', logout);

$('apply-filters').addEventListener('click', () => {
  state.page = 1;
  state.statusFilter = $('status-filter').value;
  state.searchQuery = $('search-input').value.trim();
  fetchSubmissions();
});

$('clear-filters').addEventListener('click', () => {
  state.page = 1;
  state.statusFilter = '';
  state.searchQuery = '';
  $('status-filter').value = '';
  $('search-input').value = '';
  fetchSubmissions();
});

$('prev-page').addEventListener('click', () => {
  if (state.page > 1) {
    state.page--;
    fetchSubmissions();
  }
});

$('next-page').addEventListener('click', () => {
  if (state.page < state.totalPages) {
    state.page++;
    fetchSubmissions();
  }
});

/* ---------- Init ---------- */

(async function init() {
  try {
    await fetchMe();
    showScreen('dashboard-screen');
    await fetchSubmissions();
  } catch {
    showScreen('login-screen');
  }
})();
