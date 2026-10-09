async function apiReq(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.fields = data?.fields || {};
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  login: (email, password) => apiReq('/login', { method: 'POST', body: { email, password } }),
  logout: () => apiReq('/logout', { method: 'POST', body: {} }),
  changePassword: (data) => apiReq('/change-password', { method: 'POST', body: data }),
  me: () => apiReq('/me'),
  meta: () => apiReq('/meta'),
  clients: () => apiReq('/clients'),
  createClient: (data) => apiReq('/clients', { method: 'POST', body: data }),
  updateClient: (id, data) => apiReq(`/clients/${id}`, { method: 'PUT', body: data }),
  list: (collection, site) => apiReq(`/${collection}${site ? `?site=${site}` : ''}`),
  create: (collection, data, site) => apiReq(`/${collection}${site ? `?site=${site}` : ''}`, { method: 'POST', body: data }),
  update: (collection, id, data, site) => apiReq(`/${collection}/${id}${site ? `?site=${site}` : ''}`, { method: 'PUT', body: data }),
  remove: (collection, id, site) => apiReq(`/${collection}/${id}${site ? `?site=${site}` : ''}`, { method: 'DELETE' }),
};

/* Google Drive links → direct image (PRD §6.4) */
function driveToDirect(url) {
  const u = String(url || '').trim();
  let m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  m = u.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  m = u.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m && u.includes('drive.google.com')) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  return u;
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showMsg(el, type, text) {
  el.className = `msg ${type}`;
  el.textContent = text;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearMsg(el) {
  el.className = 'msg';
  el.textContent = '';
}
