# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Vite, port 5173)
npm run build    # Production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

No test suite is configured.

## Architecture

**Stack:** React + Vite frontend, Supabase (Postgres + Auth) backend. No backend server — all DB access is direct from the browser via the Supabase JS client.

**Env vars required:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.

### Routing

`App.jsx` uses `useState('sales')` and a `renderPage()` switch to navigate between pages — this is **state-based routing, not React Router**. React Router is imported in some auth pages but is not wired up in `App.jsx`.

### Layers

- `src/services/` — Supabase API calls, one file per domain (`productService.js`, `salesService.js`, `clientService.js`, `authService.js`). All DB access goes through these.
- `src/pages/` — Page-level containers that wire services to components.
- `src/components/` — Presentational components with local state.
- `src/contexts/AuthContext.jsx` — Auth state via React Context; use `useAuth()` hook anywhere auth is needed.
- `src/utils/dateFormatter.js` — All date handling uses **Colombia timezone (America/Bogota)** via dayjs. Use `getTodayColombia()` for the current date.

### Database tables

`productos`, `ventas`, `detalle_ventas`, `clientes` — all in Supabase Postgres.

Key behaviors:
- Deleting a sale restores product stock (handled in `salesService.js`).
- Sales filtering is date-range based, always using Colombia-local dates.
- Receipt printing targets a 55mm thermal printer.
