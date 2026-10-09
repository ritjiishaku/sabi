const view = document.getElementById('view');
let ME = null;
let META = null;
let ownerState = { editing: null, contentSite: null };

function contentSiteId() {
  return ownerState.contentSite?.id ?? ME.site?.id ?? null;
}

function updateWhoami() {
  document.getElementById('whoami').textContent = ME.role === 'owner'
    ? (ownerState.contentSite ? `Owner — editing ${ownerState.contentSite.slug}` : 'Owner')
    : `${ME.site?.name || ''} (${ME.site?.slug || ''})`;
}

/* ============================== boot ============================== */

async function init() {
  try {
    [ME, META] = await Promise.all([api.me(), api.meta()]);
  } catch (e) {
    location.href = 'login.html';
    return;
  }
  document.getElementById('brand').textContent = META.brand;
  updateWhoami();
  document.getElementById('logoutBtn').onclick = async () => {
    await api.logout();
    location.href = 'login.html';
  };
  document.getElementById('pwBtn').onclick = renderPasswordView;
  ME.role === 'owner' ? renderOwner() : renderContentHome();
}

/* ============================== owner ============================== */

function renderOwner() {
  view.innerHTML = `
    <h1>Clients</h1>
    <p class="sub">Create a site + login for each client. Pausing a site disables public reads only — content is never deleted.</p>
    <div class="msg" id="ownerMsg"></div>
    <div class="toolbar">
      <span></span>
      <button class="btn primary" id="newClientBtn">+ New client</button>
    </div>
    <div id="clientForm"></div>
    <div id="clientsTable">${loadingHtml()}</div>
    <div class="group" style="margin-top:34px">
      <h2>Integration (per client)</h2>
      <p class="sub">A subscriber site needs two constants, nothing else:
        <code class="inline">CMS_BASE</code> (this server's URL) and
        <code class="inline">SITE_SLUG</code> (the client's slug, e.g. <code class="inline">gifts-by-vf</code>).
        Then <code class="inline">GET {CMS_BASE}/api/v1/sites/{SITE_SLUG}/content/products</code>.</p>
    </div>`;
  document.getElementById('newClientBtn').onclick = () => showClientForm(null);
  loadClients();
}

async function loadClients() {
  const box = document.getElementById('clientsTable');
  try {
    const sites = await api.clients();
    if (!sites.length) {
      box.innerHTML = '<div class="empty">No clients yet — create your first one.</div>';
      return;
    }
    box.innerHTML = `<div class="table-wrap stacked"><table><thead><tr>
        <th>Slug</th><th>Name</th><th>Allowed origin</th><th>Status</th><th>Client login</th><th>Products</th><th></th>
      </tr></thead><tbody>
      ${sites.map((s) => `<tr>
        <td data-label="Slug"><code class="inline">${escapeHtml(s.slug)}</code></td>
        <td data-label="Name">${escapeHtml(s.name)}</td>
        <td data-label="Allowed origin">${escapeHtml(s.allowed_origin)}</td>
        <td data-label="Status"><span class="badge ${s.is_active === 'TRUE' ? 'on' : 'off'}">${s.is_active === 'TRUE' ? 'Active' : 'Paused'}</span></td>
        <td data-label="Client login">${escapeHtml(s.client_email)}</td>
        <td data-label="Products">${s.product_count}</td>
        <td class="actions-cell"><div class="actions">
          <button class="btn sm neutral" data-content="${s.id}">Content</button>
          <button class="btn sm" data-edit="${s.id}">Edit</button>
          <button class="btn sm ${s.is_active === 'TRUE' ? 'danger' : ''}" data-toggle="${s.id}" data-active="${s.is_active}">${s.is_active === 'TRUE' ? 'Pause' : 'Activate'}</button>
        </div></td>
      </tr>`).join('')}
      </tbody></table></div>`;

    box.querySelectorAll('[data-content]').forEach((b) => {
      b.onclick = () => {
        const s = sites.find((x) => String(x.id) === b.dataset.content);
        openContent({ id: s.id, slug: s.slug, name: s.name });
      };
    });
    box.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => showClientForm(sites.find((s) => String(s.id) === b.dataset.edit));
    });
    box.querySelectorAll('[data-toggle]').forEach((b) => {
      b.onclick = async () => {
        const pausing = b.dataset.active === 'TRUE';
        const site = sites.find((s) => String(s.id) === b.dataset.toggle);
        if (pausing) {
          const ok = await confirmDialog({
            title: 'Pause this site?',
            message: `“${site?.slug || 'This site'}” will return 403 to its website until reactivated. Content is never deleted.`,
            confirmLabel: 'Pause site',
            danger: true,
          });
          if (!ok) return;
        }
        await api.updateClient(b.dataset.toggle, { is_active: !pausing });
        loadClients();
      };
    });
  } catch (e) {
    box.innerHTML = `<div class="empty">Failed to load clients: ${escapeHtml(e.message)}</div>`;
  }
}

function showClientForm(site) {
  const box = document.getElementById('clientForm');
  const msg = document.getElementById('ownerMsg');
  clearMsg(msg);
  if (site && ownerState.editing === site.id) { ownerState.editing = null; box.innerHTML = ''; return; }
  ownerState.editing = site ? site.id : null;
  const v = (k, d = '') => escapeHtml(site?.[k] ?? d);
  box.innerHTML = `
    <form class="panel" id="clientFormEl">
      <h2>${site ? `Edit ${escapeHtml(site.slug)}` : 'New client'}</h2>
      <div class="fields">
        <div class="field"><label>Site slug (lowercase)</label><input name="slug" value="${v('slug')}" ${site ? 'disabled' : ''} required /><span class="err"></span></div>
        <div class="field"><label>Site name</label><input name="name" value="${v('name')}" required /><span class="err"></span></div>
        <div class="field full"><label>Allowed origin (scheme+host, no trailing slash)</label><input name="allowed_origin" value="${v('allowed_origin')}" placeholder="https://vf-gift-shop.vercel.app" required /><span class="err"></span></div>
        <div class="field"><label>Client email</label><input name="email" type="email" value="${v('client_email')}" ${site ? '' : 'required'} /><span class="err"></span></div>
        <div class="field"><label>Password ${site ? '(leave blank to keep)' : '(min 8 characters)'}</label><input name="password" type="password" ${site ? '' : 'required'} /><span class="err"></span></div>
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit">${site ? 'Save changes' : 'Create client'}</button>
        <button class="btn" type="button" id="cancelClient">Cancel</button>
      </div>
    </form>`;
  document.getElementById('cancelClient').onclick = () => { ownerState.editing = null; box.innerHTML = ''; clearMsg(msg); };
  document.getElementById('clientFormEl').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    Object.keys(e.target.elements).forEach((k) => {
      const el = e.target.elements[k];
      if (el.classList.contains('invalid')) el.classList.remove('invalid');
      const err = el.parentElement.querySelector('.err');
      if (err) err.textContent = '';
    });
    try {
      let created = null;
      if (site) {
        const payload = { name: data.name, allowed_origin: data.allowed_origin, email: data.email };
        if (data.password) payload.password = data.password;
        await api.updateClient(site.id, payload);
        showMsg(msg, 'ok', 'Client updated.');
      } else {
        const res = await api.createClient(data);
        created = { slug: res.site.slug, id: res.site.id, name: res.site.name, email: data.email, password: data.password };
      }
      ownerState.editing = null;
      box.innerHTML = '';
      loadClients();
      if (created) renderInviteCard(created);
    } catch (err) {
      showMsg(msg, 'error', 'Please fix the highlighted fields.');
      Object.entries(err.fields || {}).forEach(([name, text]) => {
        const el = e.target.elements[name];
        if (el) {
          el.classList.add('invalid');
          const span = el.parentElement.querySelector('.err');
          if (span) span.textContent = text;
        }
      });
    }
  };
}

/* ------------------------------ invite card ------------------------------ */

function renderInviteCard(c) {
  const box = document.getElementById('clientForm');
  const url = `${location.origin}/admin/login.html`;
  const message = `Your Sabi CMS login:\nURL:   ${url}\nEmail: ${c.email}\nPassword: ${c.password}`;
  box.innerHTML = `
    <div class="invite-card">
      <div class="invite-head">
        <b>Invite created — ${escapeHtml(c.slug)}</b>
        <span class="invite-once">Copy this now: the password is stored hashed and can only be reset (Edit → password), not viewed again.</span>
      </div>
      <pre class="invite-body" id="inviteBody">${escapeHtml(message)}</pre>
      <div class="invite-actions">
        <button class="btn neutral" id="copyInvite">Copy message</button>
        <button class="btn" id="inviteOpen">Open content →</button>
        <button class="btn" id="inviteDismiss">Done</button>
      </div>
      <div class="msg" id="inviteMsg"></div>
    </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const inviteMsg = document.getElementById('inviteMsg');
  document.getElementById('copyInvite').onclick = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(message); ok = true; }
    } catch { /* fallback below */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = message;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    showMsg(inviteMsg, ok ? 'ok' : 'warn', ok
      ? 'Copied — paste it into WhatsApp or SMS.'
      : 'Copy blocked by the browser — select the text above and copy manually.');
  };
  document.getElementById('inviteOpen').onclick = () => openContent({ id: c.id, slug: c.slug, name: c.name });
  document.getElementById('inviteDismiss').onclick = () => { box.innerHTML = ''; };
}

/* ============================== content home (owner + client) ============================== */

function openContent(site) {
  ownerState.contentSite = site;
  renderContentHome();
}

function backToClients() {
  ownerState.contentSite = null;
  renderOwner();
}

function goBackFromPassword() {
  if (ME.role === 'owner' && !ownerState.contentSite) renderOwner();
  else renderContentHome();
}

function renderPasswordView() {
  view.innerHTML = `
    <div class="toolbar">
      <h1>Change password</h1>
      <button class="btn" id="pwBack">← Back</button>
    </div>
    <div class="msg" id="pwMsg"></div>
    <form class="panel" id="pwForm">
      <div class="fields">
        <div class="field"><label>Current password</label>
          <input type="password" name="current_password" autocomplete="current-password" required /><span class="err"></span></div>
        <div class="field"><label>New password (min 8 characters)</label>
          <input type="password" name="new_password" autocomplete="new-password" required /><span class="err"></span></div>
        <div class="field"><label>Confirm new password</label>
          <input type="password" name="confirm_password" autocomplete="new-password" required /><span class="err"></span></div>
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit">Change password</button>
      </div>
    </form>`;

  document.getElementById('pwBack').onclick = goBackFromPassword;
  document.getElementById('pwForm').onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('pwMsg');
    clearMsg(msg);
    const form = e.target;
    const cur = form.elements.current_password.value;
    const next = form.elements.new_password.value;
    const conf = form.elements.confirm_password.value;

    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('.err').forEach((el) => { el.textContent = ''; });
    const fail = (name, text) => {
      const el = form.elements[name];
      el.classList.add('invalid');
      el.closest('.field').querySelector('.err').textContent = text;
    };

    if (!cur || !next || !conf) return fail('current_password', 'All fields are required.');
    if (next.length < 8) return fail('new_password', 'Password must be at least 8 characters.');
    if (next !== conf) return fail('confirm_password', 'Passwords do not match.');

    try {
      await api.changePassword({ current_password: cur, new_password: next });
      showMsg(msg, 'ok', 'Password changed — use it the next time you sign in.');
      form.reset();
    } catch (err) {
      if (err.data?.error === 'invalid_password') fail('current_password', 'Current password is incorrect.');
      else if (err.data?.error === 'password_too_short') fail('new_password', 'Password must be at least 8 characters.');
      else showMsg(msg, 'error', err.message);
    }
  };
}

function renderContentHome() {
  const isOwnerActing = ME.role === 'owner' && ownerState.contentSite;
  const title = isOwnerActing ? ownerState.contentSite.name : (ME.site?.name || 'Content');
  view.innerHTML = `
    ${isOwnerActing ? `
      <div class="acting-banner">
        <span>Editing <b>${escapeHtml(title)}</b> (<code class="inline">${escapeHtml(ownerState.contentSite.slug)}</code>) — admin view</span>
        <button class="btn sm" id="clientsBackBtn">← Back to clients</button>
      </div>` : ''}
    <h1>${escapeHtml(title)}</h1>
    <p class="sub">${isOwnerActing
      ? 'You are editing this site on behalf of the client. Changes go live within 60 seconds.'
      : 'Manage every section of your site. Changes go live on your website within 60 seconds.'}</p>
    <div class="grid-cards">
      ${META.collections.map((c) => `
        <div class="card" data-collection="${c.name}">
          <h3>${escapeHtml(c.label)}</h3>
          <p>${c.kind === 'kv' ? 'Site-wide text, contact details & images' : `${c.fields.length} fields`}</p>
        </div>`).join('')}
    </div>`;
  updateWhoami();
  if (isOwnerActing) document.getElementById('clientsBackBtn').onclick = backToClients;
  view.querySelectorAll('[data-collection]').forEach((el) => {
    el.onclick = () => renderSection(el.dataset.collection);
  });
}

function renderSection(name) {
  const col = META.collections.find((c) => c.name === name);
  view.innerHTML = `
    <div class="toolbar">
      <h1>${escapeHtml(col.label)}</h1>
      <button class="btn" id="backBtn">← All sections</button>
    </div>
    <div class="msg" id="sectionMsg"></div>
    <div id="formBox"></div>
    <div id="listBox">${loadingHtml()}</div>`;
  document.getElementById('backBtn').onclick = renderContentHome;
  if (col.kind === 'kv') renderSettings(col);
  else renderRowsList(col);
}

/* ------------------------------ settings ------------------------------ */

async function renderSettings(col) {
  const box = document.getElementById('listBox');
  const msg = document.getElementById('sectionMsg');
  let existing = {};
  try {
    (await api.list('settings', contentSiteId())).forEach((r) => { existing[r.key] = r.value; });
  } catch (e) {
    box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    return;
  }

  box.innerHTML = `
    <form id="settingsForm">
      ${META.settingsGroups.map((g) => `
        <div class="group">
          <h2>${escapeHtml(g.label)}</h2>
          <div class="fields">
            ${g.fields.map((f) => settingFieldHtml(f, existing[f.name] || '')).join('')}
          </div>
        </div>`).join('')}
      <button class="btn primary" type="submit">Save settings</button>
    </form>`;

  box.querySelectorAll('input[data-image]').forEach((input) => {
    const preview = input.parentElement.querySelector('.img-preview');
    const sync = () => {
      const direct = driveToDirect(input.value);
      if (input.value && direct) { preview.src = direct; preview.style.display = 'block'; }
      else preview.style.display = 'none';
    };
    input.addEventListener('input', sync);
    sync();
  });

  document.getElementById('settingsForm').onsubmit = async (e) => {
    e.preventDefault();
    clearMsg(msg);
    const changed = [];
    META.settingsGroups.forEach((g) => g.fields.forEach((f) => {
      const el = e.target.elements[f.name];
      if (!el) return;
      let value = el.value.trim();
      if (f.type === 'image') value = driveToDirect(value);
      if (value !== (existing[f.name] || '')) changed.push({ key: f.name, value });
    }));
    if (!changed.length) { showMsg(msg, 'ok', 'Nothing to save — no changes.'); return; }
    try {
      let warned = 0;
      for (const item of changed) {
        const res = await api.create('settings', item, contentSiteId());
        if (res.warnings?.length) warned++;
      }
      showMsg(msg, warned ? 'warn' : 'ok', warned
        ? `Saved ${changed.length} key(s). Some have empty values — the site keeps its defaults until a value is set.`
        : `Saved ${changed.length} key(s). Live within 60 seconds.`);
    } catch (err) {
      const first = Object.values(err.fields || {})[0] || err.message;
      showMsg(msg, 'error', first);
    }
  };
}

function settingFieldHtml(f, value) {
  const v = escapeHtml(value);
  if (f.type === 'image') {
    return `<div class="field full">
      <label>${escapeHtml(f.label)} <span style="opacity:.6">(key: ${escapeHtml(f.name)})</span></label>
      <input name="${f.name}" data-image value="${v}" placeholder="https://…" />
      <img class="img-preview" alt="" style="display:${value ? 'block' : 'none'}" />
      <span class="err"></span>
    </div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="field full"><label>${escapeHtml(f.label)}</label><textarea name="${f.name}">${v}</textarea><span class="err"></span></div>`;
  }
  const type = f.type === 'tel' ? 'tel' : 'text';
  return `<div class="field"><label>${escapeHtml(f.label)}</label><input name="${f.name}" type="${type}" value="${v}" /><span class="err"></span></div>`;
}

/* ------------------------------ row collections ------------------------------ */

async function renderRowsList(col) {
  const box = document.getElementById('listBox');
  const msg = document.getElementById('sectionMsg');
  let rows = [];
  try {
    rows = await api.list(col.name, contentSiteId());
  } catch (e) {
    box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    return;
  }

  const toggleFields = col.fields.filter((f) => f.type === 'toggle');
  const orderField = col.fields.find((f) => f.name === 'display_order');
  const valueFields = col.fields.filter((f) => f.type !== 'toggle' && f.name !== 'display_order');
  const primary = valueFields[0];
  const secondary = valueFields.slice(1, 3);

  const empty = `<div class="empty">No content yet.</div>`;

  box.innerHTML = `
    <div class="toolbar">
      <span class="sub" style="margin:0">${rows.length} row${rows.length === 1 ? '' : 's'}</span>
      <button class="btn primary" id="addBtn">+ Add ${escapeHtml(col.label.replace(/s$/, ''))}</button>
    </div>
    ${rows.length === 0 ? empty : `<div class="table-wrap stacked"><table><thead><tr>
      <th>${escapeHtml(primary.label)}</th>
      ${secondary.map((f) => `<th>${escapeHtml(f.label)}</th>`).join('')}
      ${orderField ? '<th>Order</th>' : ''}
      ${toggleFields.map((f) => `<th>${escapeHtml(f.label)}</th>`).join('')}
      <th></th>
    </tr></thead><tbody id="rowsBody">
      ${rows.map((r, i) => `<tr data-id="${r.id}">
        <td data-label="${escapeHtml(primary.label)}">${escapeHtml(r[primary.name]) || '<span style="opacity:.5">(blank)</span>'}</td>
        ${secondary.map((f) => `<td data-label="${escapeHtml(f.label)}">${escapeHtml(truncate(r[f.name], 70))}</td>`).join('')}
        ${orderField ? `<td class="orderCell" data-label="Order">
            ${i > 0 ? `<button class="btn sm" data-move="up" data-id="${r.id}" title="Move up">↑</button>` : ''}
            ${i < rows.length - 1 ? `<button class="btn sm" data-move="down" data-id="${r.id}" title="Move down">↓</button>` : ''}
            <span style="margin-left:6px;opacity:.7">${escapeHtml(r.display_order ?? '')}</span>
          </td>` : ''}
        ${toggleFields.map((f) => `<td data-label="${escapeHtml(f.label)}"><span class="badge ${isTruthy(r[f.name]) ? 'on' : 'off'}" data-toggle-field="${f.name}" data-id="${r.id}">${isTruthy(r[f.name]) ? 'Yes' : 'No'}</span></td>`).join('')}
        <td class="actions-cell"><div class="actions">
          <button class="btn sm" data-edit="${r.id}">Edit</button>
          <button class="btn sm danger" data-del="${r.id}">Delete</button>
        </div></td>
      </tr>`).join('')}
    </tbody></table></div>`}`;

  document.getElementById('addBtn').onclick = () => showRowForm(col, null, rows);

  box.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => showRowForm(col, rows.find((r) => String(r.id) === b.dataset.edit), rows);
  });

  box.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      const row = rows.find((r) => String(r.id) === b.dataset.del);
      const label = row?.[primary.name] || row?.[valueFields[0]?.name] || 'This row';
      const ok = await confirmDialog({
        title: 'Delete this row?',
        message: `“${truncate(label, 80)}” will be removed. This cannot be undone.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      await api.remove(col.name, b.dataset.del, contentSiteId());
      renderRowsList(col);
    };
  });

  box.querySelectorAll('[data-toggle-field]').forEach((el) => {
    el.onclick = async () => {
      const row = rows.find((r) => String(r.id) === el.dataset.id);
      const field = el.dataset.toggleField;
      await api.update(col.name, row.id, { [field]: isTruthy(row[field]) ? 'FALSE' : 'TRUE' }, contentSiteId());
      renderRowsList(col);
    };
  });

  box.querySelectorAll('[data-move]').forEach((b) => {
    b.onclick = async () => {
      const idx = rows.findIndex((r) => String(r.id) === b.dataset.id);
      const swapIdx = b.dataset.move === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= rows.length) return;
      const a = rows[idx];
      const bRow = rows[swapIdx];
      const aOrder = parseInt(a.display_order, 10) || 0;
      const bOrder = parseInt(bRow.display_order, 10) || 0;
      await Promise.all([
        api.update(col.name, a.id, { display_order: String(bOrder) }, contentSiteId()),
        api.update(col.name, bRow.id, { display_order: String(aOrder) }, contentSiteId()),
      ]);
      renderRowsList(col);
    };
  });
}

function showRowForm(col, row, rows) {
  const msg = document.getElementById('sectionMsg');
  clearMsg(msg);
  const formBox = document.getElementById('formBox');

  formBox.innerHTML = `
    <form class="panel" id="rowForm">
      <h2>${row ? 'Edit' : 'Add'} ${escapeHtml(col.label.replace(/s$/, ''))}</h2>
      <div class="fields">
        ${col.fields.map((f) => rowFieldHtml(f, row?.[f.name] ?? '')).join('')}
      </div>
      <div class="form-actions">
        <button class="btn primary" type="submit">${row ? 'Save changes' : 'Add row'}</button>
        <button class="btn" type="button" id="cancelRow">Cancel</button>
      </div>
    </form>`;
  formBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const form = document.getElementById('rowForm');
  form.querySelectorAll('input[data-image]').forEach((input) => {
    const preview = input.parentElement.querySelector('.img-preview');
    const sync = () => {
      const direct = driveToDirect(input.value);
      if (input.value && direct) { preview.src = direct; preview.style.display = 'block'; }
      else preview.style.display = 'none';
    };
    input.addEventListener('input', sync);
    sync();
  });

  document.getElementById('cancelRow').onclick = () => { formBox.innerHTML = ''; };

  form.onsubmit = async (e) => {
    e.preventDefault();
    clearMsg(msg);
    const data = {};
    col.fields.forEach((f) => {
      const el = form.elements[f.name];
      if (!el) return;
      if (f.type === 'toggle') data[f.name] = el.checked ? 'TRUE' : 'FALSE';
      else {
        let v = el.value.trim();
        if (f.type === 'image') v = driveToDirect(v);
        data[f.name] = v;
      }
    });

    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    form.querySelectorAll('.err').forEach((el) => { el.textContent = ''; });

    try {
      const res = row
        ? await api.update(col.name, row.id, data, contentSiteId())
        : await api.create(col.name, data, contentSiteId());
      formBox.innerHTML = '';
      showMsg(msg, res.warnings?.length ? 'warn' : 'ok',
        res.warnings?.length ? res.warnings.join(' — ') : 'Saved.');
      renderRowsList(col);
    } catch (err) {
      const fieldMap = Object.entries(err.fields || {});
      if (fieldMap.length) {
        showMsg(msg, 'error', 'Please fix the highlighted fields.');
        fieldMap.forEach(([name, text]) => {
          const el = form.elements[name];
          if (el) {
            el.classList.add('invalid');
            const span = el.closest('.field')?.querySelector('.err');
            if (span) span.textContent = text;
          }
        });
      } else {
        showMsg(msg, 'error', err.message);
      }
    }
  };
}

function rowFieldHtml(f, value) {
  const v = escapeHtml(value);
  if (f.type === 'toggle') {
    return `<div class="field toggle-field">
      <input type="checkbox" name="${f.name}" id="fld_${f.name}" ${isTruthy(value) ? 'checked' : ''} />
      <label for="fld_${f.name}">${escapeHtml(f.label)}</label>
    </div>`;
  }
  if (f.type === 'textarea') {
    return `<div class="field full"><label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label><textarea name="${f.name}">${v}</textarea><span class="err"></span></div>`;
  }
  if (f.type === 'image') {
    return `<div class="field full"><label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
      <input name="${f.name}" value="${v}" placeholder="https://…" />
      <img class="img-preview" alt="" style="display:${value ? 'block' : 'none'}" />
      <span class="err"></span></div>`;
  }
  const type = f.type === 'order' ? 'number' : 'text';
  return `<div class="field"><label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
    <input name="${f.name}" type="${type}" value="${v}" ${f.type === 'order' ? 'step="1"' : ''} />
    <span class="err"></span></div>`;
}

/* ============================== utils ============================== */

function loadingHtml(text = 'Loading…') {
  return `<div class="loading"><span class="spinner" aria-hidden="true"></span> ${escapeHtml(text)}</div>`;
}

function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h2 id="modalTitle">${escapeHtml(title)}</h2>
        ${message ? `<p class="modal-body">${escapeHtml(message)}</p>` : ''}
        <div class="modal-actions">
          <button class="btn" type="button" data-modal-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-modal-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const done = (val) => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('open');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      setTimeout(() => overlay.remove(), 250);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };

    overlay.querySelector('[data-modal-confirm]').onclick = () => done(true);
    overlay.querySelector('[data-modal-cancel]').onclick = () => done(false);
    overlay.onclick = (e) => { if (e.target === overlay) done(false); };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => overlay.classList.add('open'));
    overlay.querySelector('[data-modal-confirm]').focus();
  });
}

function isTruthy(v) {
  return ['true', '1', 'yes'].includes(String(v ?? '').trim().toLowerCase());
}

function truncate(v, n) {
  const s = String(v ?? '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

init();
