var state = {
  links: [],
  isAdmin: false,
  token: null
};

var loginModal = document.getElementById('loginModal');
var linkModal = document.getElementById('linkModal');
var deleteModal = document.getElementById('deleteModal');
var linksContainer = document.getElementById('linksContainer');
var emptyState = document.getElementById('emptyState');
var searchInput = document.getElementById('searchInput');
var categoryFilter = document.getElementById('categoryFilter');
var themeToggle = document.getElementById('themeToggle');
var loginBtn = document.getElementById('loginBtn');
var logoutBtn = document.getElementById('logoutBtn');
var addBtn = document.getElementById('addBtn');
var closeLoginBtn = document.getElementById('closeLoginBtn');
var closeLinkBtn = document.getElementById('closeLinkBtn');
var closeDeleteBtn = document.getElementById('closeDeleteBtn');
var loginForm = document.getElementById('loginForm');
var loginError = document.getElementById('loginError');

function init() {
  initTheme();
  var savedToken = localStorage.getItem('pbhub_token');
  if (savedToken) {
    state.token = savedToken;
    verifyToken();
  }
  loadLinks();
  loadCategories();
  bindEvents();
}

function bindEvents() {
  loginBtn.addEventListener('click', function () { openModal(loginModal); });
  closeLoginBtn.addEventListener('click', function () { closeModal(loginModal); });
  loginForm.addEventListener('submit', handleLogin);

  logoutBtn.addEventListener('click', handleLogout);
  addBtn.addEventListener('click', function () { openAddLink(); });
  closeLinkBtn.addEventListener('click', function () { closeModal(linkModal); });
  closeDeleteBtn.addEventListener('click', function () { closeModal(deleteModal); });

  searchInput.addEventListener('input', debounce(loadLinks, 250));
  categoryFilter.addEventListener('change', loadLinks);
  themeToggle.addEventListener('click', function () {
    var currentTheme = document.documentElement.getAttribute('data-theme');
    var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('pbhub_theme', newTheme);
  });
}

function API(path, opts) {
  var headers = opts && opts.headers || {};
  if (state.token) {
    headers['Authorization'] = 'Bearer ' + state.token;
  }
  var init = Object.assign({}, opts, { headers: headers });
  return fetch(path, init);
}

function loadLinks() {
  var params = new URLSearchParams();
  var search = searchInput.value.toLowerCase().trim();
  var category = categoryFilter.value;
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  var queryStr = params.toString();
  API('/api/links' + (queryStr ? '?' + queryStr : ''))
    .then(function (r) { return r.json(); })
    .then(function (links) {
      state.links = links;
      render();
    })
    .catch(function () {
      showToast('無法載入連結資料', 'error');
      state.links = [];
      render();
    });
}

function loadCategories() {
  API('/api/categories')
    .then(function (r) { return r.json(); })
    .then(function (cats) {
      categoryFilter.innerHTML = '<option value="">全部分類</option>';
      cats.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        categoryFilter.appendChild(opt);
      });
    })
    .catch(function () {});
}

function render() {
  linksContainer.innerHTML = '';

  if (state.links.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    state.links.forEach(function (link) {
      linksContainer.appendChild(createCard(link));
    });
  }
}

function createCard(link) {
  var card = document.createElement('div');
  card.className = 'card';

  var imageHtml = '';
  if (link.imageUrl) {
    imageHtml = '<img src="' + escapeHtml(link.imageUrl) + '" alt="' + escapeHtml(link.title) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;no-image&quot;><svg width=&quot;40&quot; height=&quot;40&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.5&quot;><rect x=&quot;3&quot; y=&quot;3&quot; width=&quot;18&quot; height=&quot;18&quot; rx=&quot;2&quot;/><circle cx=&quot;8.5&quot; cy=&quot;8.5&quot; r=&quot;1.5&quot;/><polyline points=&quot;21 15 16 10 5 21&quot;/></svg><span>圖片載入失敗</span></div>\'">';
  } else {
    imageHtml = '<div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>暫無截圖</span></div>';
  }

  var categoryHtml = link.category ? '<span class="card-category">' + escapeHtml(link.category) + '</span>' : '';

  var adminBtns = '';
  if (state.isAdmin) {
    adminBtns = '<div class="admin-card-actions"><button class="btn-icon" data-action="edit" data-id="' + escapeHtml(link.id) + '" title="編輯"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-icon danger" data-action="delete" data-id="' + escapeHtml(link.id) + '" title="刪除"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>';
  }

  card.innerHTML =
    '<div class="card-image">' + imageHtml + '</div>' +
    '<div class="card-body">' +
      categoryHtml +
      '<div class="card-title">' + escapeHtml(link.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(link.description || '暫無簡介') + '</div>' +
      '<div class="card-actions">' +
        '<a href="' + escapeHtml(link.url) + '" target="_blank" rel="noopener" class="btn btn-primary">開啟報表</a>' +
        adminBtns +
      '</div>' +
    '</div>';

  card.querySelectorAll('[data-action="edit"]').forEach(function (btn) {
    btn.addEventListener('click', function () { openEditLink(btn.dataset.id); });
  });
  card.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
    btn.addEventListener('click', function () { openDeleteConfirm(btn.dataset.id); });
  });

  return card;
}

function handleLogin(e) {
  e.preventDefault();
  loginError.style.display = 'none';
  var password = document.getElementById('loginPassword').value;

  API('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password })
  })
    .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
    .then(function (result) {
      if (result.status === 200) {
        state.token = result.data.token;
        state.isAdmin = true;
        localStorage.setItem('pbhub_token', result.data.token);
        closeModal(loginModal);
        updateAdminUI();
        showToast('登入成功', 'success');
      } else {
        loginError.style.display = 'block';
        loginError.textContent = result.data.error || '密碼錯誤';
      }
    })
    .catch(function () {
      loginError.style.display = 'block';
      loginError.textContent = '網絡錯誤，請稍後再試';
    });
}

function verifyToken() {
  API('/api/auth/verify', { method: 'POST' })
    .then(function (r) {
      if (r.status === 200) {
        state.isAdmin = true;
        updateAdminUI();
      } else {
        state.token = null;
        state.isAdmin = false;
        localStorage.removeItem('pbhub_token');
        updateAdminUI();
      }
    })
    .catch(function () {
      state.token = null;
      state.isAdmin = false;
      localStorage.removeItem('pbhub_token');
      updateAdminUI();
    });
}

function handleLogout() {
  state.token = null;
  state.isAdmin = false;
  localStorage.removeItem('pbhub_token');
  updateAdminUI();
  render();
  showToast('已登出', 'success');
}

function updateAdminUI() {
  if (state.isAdmin) {
    loginBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-flex';
    addBtn.style.display = 'inline-flex';
  } else {
    loginBtn.style.display = 'inline-flex';
    logoutBtn.style.display = 'none';
    addBtn.style.display = 'none';
  }
}

function openModal(modal) {
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(msg, type) {
  var toast = document.createElement('div');
  toast.className = 'alert alert-' + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 2800);
}

function debounce(fn, delay) {
  var timer;
  return function () {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

function initTheme() {
  var savedTheme = localStorage.getItem('pbhub_theme') || 'light';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️ 淺色模式' : '🌙 深色模式';
}

init();
