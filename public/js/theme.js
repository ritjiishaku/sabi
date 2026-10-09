/* Theme (light / dark) — persisted in localStorage, applied before paint by an
   inline snippet in each page <head>; this wires the toggle buttons. */
(function () {
  const KEY = 'sabi-theme';
  const root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function updateButton(btn) {
    const dark = current() === 'dark';
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.title = dark ? 'Light mode' : 'Dark mode';
    const sun = btn.querySelector('.icon-sun');
    const moon = btn.querySelector('.icon-moon');
    if (sun) sun.style.display = dark ? 'block' : 'none';
    if (moon) moon.style.display = dark ? 'none' : 'block';
  }

  function reflect() {
    document.querySelectorAll('[data-theme-toggle]').forEach(updateButton);
  }

  function set(theme) {
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
    reflect();
  }

  function toggle() {
    set(current() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      updateButton(btn);
      btn.addEventListener('click', toggle);
    });
  }

  window.SabiTheme = { set, toggle, init, current };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
