# Design Tokens — Sabi CMS

**Palette:** Light Blue · **Mode:** Light (dark mode tokens included) · **Source of truth:** Figma Variables → `tokens.json` → `design-tokens.css`

---

## 1. Figma Variables structure

Figma Variables are organized into **collections** (like `color`, `spacing`, `radius`) and each variable has a **mode** (Light / Dark). Naming uses slash-separated paths so they map cleanly to CSS custom properties and to the W3C Design Tokens format.

```
Collection: color
├── color/primary/50 … 900        (Sky ramp)
├── color/secondary/500 … 700     (Slate Blue)
├── color/tertiary/500 … 700      (Periwinkle)
├── color/accent/500 … 700        (Tangerine)
├── color/neutral/50 … 900        (Cool Ink)
├── color/surface/0 … 3           (Cloud surfaces)
├── color/semantic/success
├── color/semantic/warning
├── color/semantic/error
└── color/semantic/info

Collection: spacing
├── spacing/0 … 16                (4px base scale)

Collection: radius
├── radius/none, sm, md, lg, xl, full

Collection: typography
├── font/family/sans, mono
├── font/size/xs … 3xl
├── font/weight/regular, medium, semibold, bold
└── font/line/xs … 3xl

Collection: shadow
├── shadow/xs, sm, md, lg, xl

Collection: motion
├── motion/duration/fast, base, slow
└── motion/easing/standard, emphasized
```

---

## 2. `tokens.json` (W3C / Figma Variables import format)

```json
{
  "color": {
    "primary": {
      "50":  { "$type": "color", "$value": "#F0F9FF" },
      "100": { "$type": "color", "$value": "#E0F2FE" },
      "200": { "$type": "color", "$value": "#BAE6FD" },
      "300": { "$type": "color", "$value": "#7DD3FC" },
      "400": { "$type": "color", "$value": "#38BDF8" },
      "500": { "$type": "color", "$value": "#0EA5E9" },
      "600": { "$type": "color", "$value": "#0284C7" },
      "700": { "$type": "color", "$value": "#0369A1" },
      "800": { "$type": "color", "$value": "#075985" },
      "900": { "$type": "color", "$value": "#0C4A6E" }
    },
    "secondary": {
      "500": { "$type": "color", "$value": "#475569" },
      "600": { "$type": "color", "$value": "#334155" },
      "700": { "$type": "color", "$value": "#1E293B" }
    },
    "tertiary": {
      "50":  { "$type": "color", "$value": "#F5F3FF" },
      "100": { "$type": "color", "$value": "#EDE9FE" },
      "500": { "$type": "color", "$value": "#7C6CF0" },
      "600": { "$type": "color", "$value": "#6D5BD0" },
      "700": { "$type": "color", "$value": "#5B4AB8" }
    },
    "accent": {
      "100": { "$type": "color", "$value": "#FFEDD5" },
      "500": { "$type": "color", "$value": "#F97316" },
      "600": { "$type": "color", "$value": "#EA580C" },
      "700": { "$type": "color", "$value": "#C2410C" }
    },
    "neutral": {
      "50":  { "$type": "color", "$value": "#F8FAFC" },
      "100": { "$type": "color", "$value": "#F1F5F9" },
      "200": { "$type": "color", "$value": "#E2E8F0" },
      "300": { "$type": "color", "$value": "#CBD5E1" },
      "500": { "$type": "color", "$value": "#64748B" },
      "700": { "$type": "color", "$value": "#334155" },
      "800": { "$type": "color", "$value": "#1E293B" },
      "900": { "$type": "color", "$value": "#0F172A" }
    },
    "surface": {
      "0": { "$type": "color", "$value": "#FFFFFF" },
      "1": { "$type": "color", "$value": "#F8FAFC" },
      "2": { "$type": "color", "$value": "#F1F5F9" },
      "3": { "$type": "color", "$value": "#E2E8F0" }
    },
    "semantic": {
      "success": { "$type": "color", "$value": "#15803D" },
      "warning": { "$type": "color", "$value": "#B45309" },
      "error":   { "$type": "color", "$value": "#DC2626" },
      "info":    { "$type": "color", "$value": "#0369A1" }
    }
  },
  "spacing": {
    "0":  { "$type": "dimension", "$value": "0px" },
    "1":  { "$type": "dimension", "$value": "4px" },
    "2":  { "$type": "dimension", "$value": "8px" },
    "3":  { "$type": "dimension", "$value": "12px" },
    "4":  { "$type": "dimension", "$value": "16px" },
    "5":  { "$type": "dimension", "$value": "20px" },
    "6":  { "$type": "dimension", "$value": "24px" },
    "8":  { "$type": "dimension", "$value": "32px" },
    "10": { "$type": "dimension", "$value": "40px" },
    "12": { "$type": "dimension", "$value": "48px" },
    "16": { "$type": "dimension", "$value": "64px" }
  },
  "radius": {
    "none": { "$type": "dimension", "$value": "0px" },
    "sm":   { "$type": "dimension", "$value": "4px" },
    "md":   { "$type": "dimension", "$value": "8px" },
    "lg":   { "$type": "dimension", "$value": "12px" },
    "xl":   { "$type": "dimension", "$value": "16px" },
    "full": { "$type": "dimension", "$value": "9999px" }
  },
  "font": {
    "family": {
      "sans": { "$type": "fontFamily", "$value": "Inter, ui-sans-serif, system-ui, sans-serif" },
      "mono": { "$type": "fontFamily", "$value": "JetBrains Mono, ui-monospace, monospace" }
    },
    "size": {
      "xs":  { "$type": "dimension", "$value": "12px" },
      "sm":  { "$type": "dimension", "$value": "13px" },
      "base":{ "$type": "dimension", "$value": "14px" },
      "md":  { "$type": "dimension", "$value": "16px" },
      "lg":  { "$type": "dimension", "$value": "18px" },
      "xl":  { "$type": "dimension", "$value": "20px" },
      "2xl": { "$type": "dimension", "$value": "24px" },
      "3xl": { "$type": "dimension", "$value": "32px" }
    },
    "weight": {
      "regular":  { "$type": "fontWeight", "$value": 400 },
      "medium":   { "$type": "fontWeight", "$value": 500 },
      "semibold": { "$type": "fontWeight", "$value": 600 },
      "bold":     { "$type": "fontWeight", "$value": 700 }
    },
    "line": {
      "xs":  { "$type": "dimension", "$value": "16px" },
      "sm":  { "$type": "dimension", "$value": "18px" },
      "base":{ "$type": "dimension", "$value": "20px" },
      "md":  { "$type": "dimension", "$value": "24px" },
      "lg":  { "$type": "dimension", "$value": "28px" },
      "xl":  { "$type": "dimension", "$value": "28px" },
      "2xl": { "$type": "dimension", "$value": "32px" },
      "3xl": { "$type": "dimension", "$value": "40px" }
    }
  },
  "shadow": {
    "xs": { "$type": "boxShadow", "$value": "0 1px 2px rgba(15,23,42,0.05)" },
    "sm": { "$type": "boxShadow", "$value": "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)" },
    "md": { "$type": "boxShadow", "$value": "0 4px 8px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)" },
    "lg": { "$type": "boxShadow", "$value": "0 12px 24px rgba(15,23,42,0.08), 0 4px 8px rgba(15,23,42,0.04)" },
    "xl": { "$type": "boxShadow", "$value": "0 24px 48px rgba(15,23,42,0.12)" }
  },
  "motion": {
    "duration": {
      "fast": { "$type": "duration", "$value": "120ms" },
      "base": { "$type": "duration", "$value": "200ms" },
      "slow": { "$type": "duration", "$value": "320ms" }
    },
    "easing": {
      "standard":   { "$type": "cubicBezier", "$value": [0.2, 0, 0, 1] },
      "emphasized": { "$type": "cubicBezier", "$value": [0.3, 0, 0, 1.2] }
    }
  }
}
```

---

## 3. `design-tokens.css`

Every token from Figma, flattened to CSS custom properties. This is the file the admin UI imports once.

```css
:root {
  /* ── color / primary (Sky) ─────────────────────────── */
  --color-primary-50:  #F0F9FF;
  --color-primary-100: #E0F2FE;
  --color-primary-200: #BAE6FD;
  --color-primary-300: #7DD3FC;
  --color-primary-400: #38BDF8;   /* brand — UI/large only */
  --color-primary-500: #0EA5E9;
  --color-primary-600: #0284C7;
  --color-primary-700: #0369A1;   /* accessible text/buttons */
  --color-primary-800: #075985;
  --color-primary-900: #0C4A6E;

  /* ── color / secondary (Slate Blue) ────────────────── */
  --color-secondary-500: #475569;
  --color-secondary-600: #334155;
  --color-secondary-700: #1E293B;

  /* ── color / tertiary (Periwinkle) ─────────────────── */
  --color-tertiary-50:  #F5F3FF;
  --color-tertiary-100: #EDE9FE;
  --color-tertiary-500: #7C6CF0;
  --color-tertiary-600: #6D5BD0;
  --color-tertiary-700: #5B4AB8;

  /* ── color / accent (Tangerine) ────────────────────── */
  --color-accent-100: #FFEDD5;
  --color-accent-500: #F97316;
  --color-accent-600: #EA580C;
  --color-accent-700: #C2410C;

  /* ── color / neutral (Cool Ink) ────────────────────── */
  --color-neutral-50:  #F8FAFC;
  --color-neutral-100: #F1F5F9;
  --color-neutral-200: #E2E8F0;
  --color-neutral-300: #CBD5E1;
  --color-neutral-500: #64748B;
  --color-neutral-700: #334155;
  --color-neutral-800: #1E293B;
  --color-neutral-900: #0F172A;

  /* ── color / surface (Cloud) ───────────────────────── */
  --color-surface-0: #FFFFFF;
  --color-surface-1: #F8FAFC;
  --color-surface-2: #F1F5F9;
  --color-surface-3: #E2E8F0;

  /* ── color / semantic ──────────────────────────────── */
  --color-success: #15803D;
  --color-warning: #B45309;
  --color-error:   #DC2626;
  --color-info:    #0369A1;

  /* ── spacing (4px base) ────────────────────────────── */
  --spacing-0:  0;
  --spacing-1:  4px;
  --spacing-2:  8px;
  --spacing-3:  12px;
  --spacing-4:  16px;
  --spacing-5:  20px;
  --spacing-6:  24px;
  --spacing-8:  32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
  --spacing-16: 64px;

  /* ── radius ────────────────────────────────────────── */
  --radius-none: 0;
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-full: 9999px;

  /* ── font family ───────────────────────────────────── */
  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* ── font size ─────────────────────────────────────── */
  --font-size-xs:   12px;
  --font-size-sm:   13px;
  --font-size-base: 14px;
  --font-size-md:   16px;
  --font-size-lg:   18px;
  --font-size-xl:   20px;
  --font-size-2xl:  24px;
  --font-size-3xl:  32px;

  /* ── font weight ───────────────────────────────────── */
  --font-weight-regular:  400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
  --font-weight-bold:     700;

  /* ── line height ───────────────────────────────────── */
  --line-xs:   16px;
  --line-sm:   18px;
  --line-base: 20px;
  --line-md:   24px;
  --line-lg:   28px;
  --line-xl:   28px;
  --line-2xl:  32px;
  --line-3xl:  40px;

  /* ── shadow ────────────────────────────────────────── */
  --shadow-xs: 0 1px 2px rgba(15,23,42,0.05);
  --shadow-sm: 0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04);
  --shadow-md: 0 4px 8px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04);
  --shadow-lg: 0 12px 24px rgba(15,23,42,0.08), 0 4px 8px rgba(15,23,42,0.04);
  --shadow-xl: 0 24px 48px rgba(15,23,42,0.12);

  /* ── motion ────────────────────────────────────────── */
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --motion-slow: 320ms;
  --ease-standard:   cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.3, 0, 0, 1.2);

  /* ── semantic aliases (component-facing) ───────────── */
  --bg-page:        var(--color-surface-1);
  --bg-surface:     var(--color-surface-0);
  --bg-subtle:      var(--color-surface-2);
  --bg-inset:       var(--color-surface-3);

  --text-primary:   var(--color-neutral-900);
  --text-secondary: var(--color-neutral-700);
  --text-muted:     var(--color-neutral-500);
  --text-inverse:   #FFFFFF;
  --text-link:      var(--color-primary-700);

  --border-subtle:  var(--color-neutral-200);
  --border-default: var(--color-neutral-300);
  --border-strong:  var(--color-neutral-500);

  --focus-ring:     var(--color-primary-400);
  --focus-ring-offset: var(--color-surface-0);
}

/* ── Dark mode ───────────────────────────────────────── */
[data-theme="dark"] {
  --bg-page:        #0F172A;
  --bg-surface:     #1E293B;
  --bg-subtle:      #1E293B;
  --bg-inset:       #334155;

  --text-primary:   #F1F5F9;
  --text-secondary: #CBD5E1;
  --text-muted:     #94A3B8;
  --text-link:      #38BDF8;

  --border-subtle:  #334155;
  --border-default: #475569;
  --border-strong:  #64748B;

  --focus-ring:     #38BDF8;
  --focus-ring-offset: #1E293B;
}
```

---

## 4. Figma-ready variable map (for reference)

If you're rebuilding this in Figma, create these collections and paste the hexes directly. The `/` paths are the variable names.

| Figma Variable | Value | Notes |
|---|---|---|
| `color/primary/400` | `#38BDF8` | Brand fill, UI/large only |
| `color/primary/700` | `#0369A1` | Accessible text/buttons |
| `color/secondary/600` | `#334155` | Structure, headers |
| `color/tertiary/600` | `#6D5BD0` | Categories, tags |
| `color/accent/600` | `#EA580C` | CTAs, warnings |
| `color/neutral/900` | `#0F172A` | Primary text |
| `color/surface/1` | `#F8FAFC` | App background |
| `color/semantic/success` | `#15803D` | Saved state |
| `color/semantic/warning` | `#B45309` | Unsaved changes |
| `color/semantic/error` | `#DC2626` | Destructive |
| `color/semantic/info` | `#0369A1` | Hints |

Add two **modes** per color collection: `Light` and `Dark`. Only the *semantic aliases* (`bg/*`, `text/*`, `border/*`) need different values per mode — the raw ramps stay constant. That's the whole point of the alias layer.

---

## 5. Login page

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sabi · Sign in</title>
  <link rel="stylesheet" href="/css/design-tokens.css" />
  <link rel="stylesheet" href="/css/login.css" />
</head>
<body class="login">
  <main class="login__card" role="main">
    <div class="login__brand">
      <div class="login__mark" aria-hidden="true">
        <!-- sky-blue logomark -->
        <svg viewBox="0 0 32 32" width="32" height="32">
          <rect width="32" height="32" rx="8" fill="var(--color-primary-400)"/>
          <path d="M9 20c2.5 0 4-1.5 4-3.5S11.5 13 9 13H8v-3h1c3.5 0 6 2.5 6 6.5S12.5 24 9 24H8v-4z" fill="#fff"/>
          <circle cx="22" cy="12" r="3" fill="#fff"/>
        </svg>
      </div>
      <h1 class="login__title">Welcome back to Sabi</h1>
      <p class="login__subtitle">Sign in to manage your site's content.</p>
    </div>

    <form class="login__form" method="post" action="/api/admin/login">
      <label class="field">
        <span class="field__label">Email</span>
        <input class="field__input" type="email" name="email"
               autocomplete="email" required />
      </label>

      <label class="field">
        <span class="field__label">Password</span>
        <input class="field__input" type="password" name="password"
               autocomplete="current-password" required />
      </label>

      <button class="btn btn--primary btn--block" type="submit">
        Sign in
      </button>

      <p class="login__error" hidden role="alert"></p>
    </form>

    <footer class="login__footer">
      Invite-only. Contact the operator if you need access.
    </footer>
  </main>
</body>
</html>
```

```css
/* login.css — assumes design-tokens.css is loaded */
* { box-sizing: border-box; }

body.login {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-base);
  padding: var(--spacing-6);
}

.login__card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-8);
}

.login__brand { text-align: center; margin-bottom: var(--spacing-8); }
.login__mark { display: inline-flex; margin-bottom: var(--spacing-4); }
.login__title {
  font-size: var(--font-size-2xl);
  line-height: var(--line-2xl);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--spacing-2);
  color: var(--text-primary);
}
.login__subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-base);
}

.login__form { display: grid; gap: var(--spacing-5); }

.field { display: grid; gap: var(--spacing-2); }
.field__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}
.field__input {
  height: 40px;
  padding: 0 var(--spacing-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  font: inherit;
  transition: border-color var(--motion-fast) var(--ease-standard),
              box-shadow var(--motion-fast) var(--ease-standard);
}
.field__input::placeholder { color: var(--text-muted); }
.field__input:hover { border-color: var(--border-strong); }
.field__input:focus {
  outline: none;
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 35%, transparent);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  height: 40px;
  padding: 0 var(--spacing-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font: inherit;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard),
              border-color var(--motion-fast) var(--ease-standard),
              transform var(--motion-fast) var(--ease-standard);
}
.btn:active { transform: translateY(1px); }

.btn--primary {
  background: var(--color-primary-700);
  color: var(--text-inverse);
}
.btn--primary:hover { background: var(--color-primary-800); }
.btn--primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 45%, transparent);
}

.btn--block { width: 100%; }

.login__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-sm);
}

.login__footer {
  margin-top: var(--spacing-6);
  padding-top: var(--spacing-5);
  border-top: 1px solid var(--border-subtle);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
```

Note how the **brand sky** (`--color-primary-400`) only shows up in the logo mark and the focus ring, while **usable blue** (`--color-primary-700`) drives the button. That's the two-step primary in practice.

---

## 6. Owner dashboard

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sabi · Clients</title>
  <link rel="stylesheet" href="/css/design-tokens.css" />
  <link rel="stylesheet" href="/css/dashboard.css" />
</head>
<body class="app">
  <aside class="sidebar">
    <div class="sidebar__brand">
      <div class="sidebar__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="24" height="24">
          <rect width="32" height="32" rx="8" fill="var(--color-primary-400)"/>
          <path d="M9 20c2.5 0 4-1.5 4-3.5S11.5 13 9 13H8v-3h1c3.5 0 6 2.5 6 6.5S12.5 24 9 24H8v-4z" fill="#fff"/>
          <circle cx="22" cy="12" r="3" fill="#fff"/>
        </svg>
      </div>
      <span class="sidebar__name">Sabi</span>
      <span class="badge badge--owner">Owner</span>
    </div>

    <nav class="sidebar__nav" aria-label="Primary">
      <a class="nav-item is-active" href="/admin/clients">Clients</a>
      <a class="nav-item" href="/admin/sites">Sites</a>
      <a class="nav-item" href="/admin/activity">Activity</a>
    </nav>

    <div class="sidebar__footer">
      <a class="nav-item" href="/api/admin/logout">Sign out</a>
    </div>
  </aside>

  <main class="main">
    <header class="page-header">
      <div>
        <h1 class="page-title">Clients</h1>
        <p class="page-subtitle">Create, pause, and manage every site on Sabi.</p>
      </div>
      <button class="btn btn--accent" type="button" data-action="new-client">
        + New client
      </button>
    </header>

    <section class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Site</th>
            <th>Slug</th>
            <th>Origin</th>
            <th>Status</th>
            <th class="table__actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="cell-title">Gift by VF</div>
              <div class="cell-sub">owner@giftbyvf.com</div>
            </td>
            <td><code class="code">gifts-by-vf</code></td>
            <td><code class="code">https://vf-gift-shop.vercel.app</code></td>
            <td><span class="badge badge--active">Active</span></td>
            <td class="table__actions">
              <button class="btn btn--ghost">Edit</button>
              <button class="btn btn--ghost btn--danger">Pause</button>
            </td>
          </tr>
          <tr>
            <td>
              <div class="cell-title">Acme Signs</div>
              <div class="cell-sub">hello@acmesigns.ng</div>
            </td>
            <td><code class="code">acme-signs</code></td>
            <td><code class="code">https://acmesigns.ng</code></td>
            <td><span class="badge badge--paused">Paused</span></td>
            <td class="table__actions">
              <button class="btn btn--ghost">Edit</button>
              <button class="btn btn--ghost btn--success">Activate</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
```

```css
/* dashboard.css — assumes design-tokens.css is loaded */
* { box-sizing: border-box; }

body.app {
  margin: 0;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px 1fr;
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-base);
}

/* ── Sidebar ─────────────────────────────────────────── */
.sidebar {
  background: var(--bg-subtle);
  border-right: 1px solid var(--border-subtle);
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}
.sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
}
.sidebar__name {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
.sidebar__nav { display: grid; gap: var(--spacing-1); }
.sidebar__footer { margin-top: auto; }

.nav-item {
  display: block;
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  transition: background var(--motion-fast) var(--ease-standard),
              color var(--motion-fast) var(--ease-standard);
}
.nav-item:hover { background: var(--bg-inset); color: var(--text-primary); }
.nav-item.is-active {
  background: var(--color-primary-100);
  color: var(--color-primary-800);
}

/* ── Main ────────────────────────────────────────────── */
.main {
  padding: var(--spacing-8);
  display: grid;
  gap: var(--spacing-6);
  align-content: start;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-4);
}
.page-title {
  margin: 0 0 var(--spacing-1);
  font-size: var(--font-size-3xl);
  line-height: var(--line-3xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}
.page-subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-base);
}

/* ── Card ────────────────────────────────────────────── */
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* ── Table ───────────────────────────────────────────── */
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-base);
}
.table th {
  text-align: left;
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.table td {
  padding: var(--spacing-4);
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
  color: var(--text-primary);
}
.table tr:last-child td { border-bottom: none; }
.table tr:hover td { background: var(--bg-page); }

.cell-title { font-weight: var(--font-weight-medium); }
.cell-sub { color: var(--text-muted); font-size: var(--font-size-sm); margin-top: 2px; }

.code {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  color: var(--text-secondary);
}

/* ── Badges ──────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-xs);
}
.badge--active {
  background: var(--color-primary-100);
  color: var(--color-primary-800);
}
.badge--paused {
  background: #FEF3C7;
  color: #854D0E;
}
.badge--owner {
  background: var(--color-tertiary-100);
  color: var(--color-tertiary-700);
}

/* ── Buttons ─────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  height: 36px;
  padding: 0 var(--spacing-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font: inherit;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-standard),
              border-color var(--motion-fast) var(--ease-standard),
              color var(--motion-fast) var(--ease-standard),
              transform var(--motion-fast) var(--ease-standard);
}
.btn:active { transform: translateY(1px); }
.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 45%, transparent);
}

.btn--accent {
  background: var(--color-accent-600);
  color: var(--text-inverse);
}
.btn--accent:hover { background: var(--color-accent-700); }

.btn--ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-default);
}
.btn--ghost:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.btn--ghost.btn--danger:hover {
  color: var(--color-error);
  border-color: var(--color-error);
}
.btn--ghost.btn--success:hover {
  color: var(--color-success);
  border-color: var(--color-success);
}

.table__actions { text-align: right; white-space: nowrap; }
.table__actions .btn + .btn { margin-left: var(--spacing-2); }
```

---

## 7. How the two-step primary shows up

| Surface | Token | Why |
|---|---|---|
| Logo mark, illustration | `--color-primary-400` (`#38BDF8`) | Brand expression; large/fill only |
| Focus ring | `--color-primary-400` at 35–45% alpha | Visual, not textual |
| Active nav background | `--color-primary-100` | Tinted surface |
| Active nav text | `--color-primary-800` | Must pass contrast on the tinted bg |
| Primary button bg | `--color-primary-700` | Must pass contrast with white text |
| Links | `--color-primary-700` | Must pass contrast on white |
| CTA button (rare) | `--color-accent-600` | The one warm color per screen |

That's the entire discipline: **400 for brand, 700 for text, 100/200 for tints.** Once that rule is in the token layer, developers can't accidentally use the brand blue for a button label.

---

## 8. Adding tokens to the spec

If you want this in the main `SPEC.md`, drop it in as a new **Part III — Design System**, with:

- §17 Token structure (Figma collections + modes)
- §18 `tokens.json`
- §19 `design-tokens.css`
- §20 Component recipes (buttons, fields, badges, tables, cards)
- §21 Accessibility rules (the 400/700 split, focus ring spec, minimum contrast)
