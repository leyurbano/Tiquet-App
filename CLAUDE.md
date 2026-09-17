# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

POS / inventory system for Colombian retail businesses ("Tiquet-App"), sold to multiple businesses. The first business is Fralu. UI text and code comments are in **Spanish**.

## Commands

```bash
npm run dev      # Dev server (Vite, port 5173)
npm run build    # Production build
npm run lint     # ESLint (flat config in eslint.config.js)
npm run preview  # Preview production build
npm run iconos   # Regenerate the PWA icons from public/icono.svg (pwa-assets.config.js)
```

**Installable app (PWA):** `vite-plugin-pwa` in `vite.config.js`. The service worker caches only the app shell (HTML, JS, CSS, icons); never cache Supabase responses, since sales, stock and cash must always be live. `registerType: 'prompt'` is on purpose: `components/EstadoApp.jsx` asks before updating (an automatic reload mid-sale would lose the cart) and shows an offline banner. There is no offline selling.

There is no test suite. Verify changes with `npm run lint` and `npm run build`.

`react-hooks/exhaustive-deps` is on purpose: it catches stale closures (a missing dependency once made Escape skip the "unsaved changes" confirmation). Only disable it on a single line, with a comment saying why (e.g. a mount-only data load).

## Architecture

**Stack:** React 19 + Vite, React Router v6. Supabase provides Postgres, Auth, Storage (bucket `logos`) and Edge Functions.

**There is no application server.** The browser talks to Supabase directly with the anon key, so **all authorization lives in the database** (RLS policies, triggers, `SECURITY DEFINER` functions). Hiding a button in the UI is never a security control; always enforce the rule in SQL too.

**Env vars:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (gitignored). Optional: `VITE_PRINTER_SERVER_URL` (thermal printer cut/drawer server, default `http://localhost:3001`).

### Routes (`src/App.jsx`)

`/` login (`InicioPage`), `/sales`, `/products`, `/clients`, `/cierre` (reports), `/configuracion` (business settings, administrators), `/plataforma` (platform panel, super admin). Before rendering routes, `App` shows `CuentaBloqueada` if the account can't operate, and `CambiarContrasenaModal` if a password change is pending.

### Layers

- `src/services/` — all Supabase access, one file per domain: `productService`, `salesService`, `clientService`, `cashSessionService`, `negocioService`, `perfilService`, `inventarioService`, `devolucionService`, `fiadoService`, `supabaseClient`.
- `src/pages/` — page containers that wire services to components.
- `src/components/` — UI components and modals.
- `src/contexts/AuthContext.jsx` — `useAuth()`: `user`, `perfil`, `estadoCuenta`, `esAdministrador`, `esSuperAdmin`, `debeCambiarContrasena`, `recargarPerfil`, `login`, `logout`.
- `src/contexts/CashSessionContext.jsx` — `useCashSession()`: the user's open cash session.
- `src/utils/` — `importarProductos` (Excel/CSV import parsing), `dateFormatter` (Colombia time), `currencyFormatter`, `receipt` (receipt HTML), `cashSummary` (cash close math), `reportSummary` (margins), `stock` (low-stock rules), `motivosAnulacion`, `motivosDevolucion`, `clientes`, `toast`.

## Multi-tenancy and roles

- Table `negocios` holds each business and its receipt settings. Every business table (`productos`, `clientes`, `ventas`, `detalle_ventas`, `pagos_venta`, `producto_historial`, `sesiones_caja`) has `negocio_id` with `DEFAULT mi_negocio()`, so inserts don't send it. RLS policies filter on `negocio_id = mi_negocio()`.
- The browser never sends the business id: `mi_negocio()` derives it from the session token. It returns null for inactive users or suspended businesses.
- `perfiles.rol` is the role **inside** a business (`vendedor` | `administrador`). `perfiles.es_super_admin` is a **platform** permission, orthogonal to the role.
- The super admin sees only aggregates (`resumen_negocios()`), never individual sales or clients of other businesses.
- `estado_mi_cuenta()` explains why a user can't operate: `sin_perfil`, `usuario_inactivo`, `negocio_suspendido`, and so on.
- RLS policies are **additive**. A single leftover policy with `true` removes isolation for that table.

## Sales, stock and cash

- **Register sales only through the RPC `registrar_venta`.** It is atomic, computes the total, requires payments to equal the total, locks stock rows (`FOR UPDATE`), freezes `costo_unitario`, and requires an open cash session. Never insert into `ventas`, `detalle_ventas` or `pagos_venta` from the client.
- **Void sales with the RPC `anular_venta`** (administrators only). Sales are never deleted; voided ones keep `anulada_en` and `motivo_anulacion`.
- Stock is decremented by the trigger `descontar_inventario` on `detalle_ventas`. The trigger `proteger_campos_producto` uses `pg_trigger_depth()`: sellers can only change stock through a sale, and can't change description, cost, price or `stock_minimo`.
- **Stock goes up only through the RPC `registrar_entrada`** (Inventario page, administrators). It adds the units, recomputes `costo` as a weighted average, snapshots before/after in `detalle_entradas`, and logs an `entrada` event. Entries are never updated or deleted. An entry line may create a product that isn't in the catalog yet (`nuevo`), inside the same transaction.
- **Create products through the RPC `crear_producto`** (the Productos form uses it). Initial stock is registered as a "Stock inicial" entry, so every unit of stock has an entry behind it. Duplicate names (case- and space-insensitive) are rejected.
- **Excel/CSV import** (Inventario → Importar, `components/ImportarProductos.jsx` + `utils/importarProductos.js`) previews every row, then sends the whole file as one `registrar_entrada` call (max 2,000 lines). New products may come with quantity 0; existing ones only add stock, their price is never changed. `.xlsx` is read with `read-excel-file/browser`, loaded on demand.
- **Partial returns go through the RPC `registrar_devolucion`** (Ventas → ↩️). The original sale is never modified. The function is `SECURITY DEFINER` and the return tables have no insert policy, so its limits can't be bypassed from the browser. Stock comes back through the trigger on `detalle_devoluciones` (trigger depth 2, the same path sales use). Sellers can return only if `negocios.devoluciones_vendedor`, up to `devolucion_max_vendedor` and `devolucion_dias_vendedor`, always back to stock, and with an open cash session. Cash returns are subtracted from that shift's expected cash; reports subtract returns on the day they happen. A sale with returns can't be voided.
- **Credit sales (fiado)** use the payment method flagged `medios_pago.es_fiado`. `registrar_venta` requires an identified client (not consumidor final) and keeps them within `clientes.cupo_fiado`; only admins change the limit (trigger `proteger_cupo_fiado`), and new clients start at 0. Sellers may sell on credit only if `negocios.fiado_vendedor`. The balance is never stored: `saldo_fiado()` / `saldos_fiado()` compute credit in non-voided sales − returns refunded as fiado − `abonos`. Payments go through `registrar_abono` (`SECURITY DEFINER`, open cash session required). In the cash close, fiado is neither expected cash nor a transaction to verify; cash payments add to expected cash.
- **Costs are business-sensitive.** Sellers must not read them, and hiding them in the UI is not enough: with their own session they can query Supabase directly. `entradas`/`ajustes`/`detalle_devoluciones` are admin-only, `devoluciones` has no cost column, and `producto_historial` text never includes prices (migration 27). Sellers get returned quantities through `devuelto_por_linea()`. Product cost lives in **`productos_costos`** (1-1 with `productos`, admin-only, migration 28), so `productos` itself carries no cost at all; read it with `productService` (it flattens the join and gives sellers `null`). Because of that, **`registrar_venta` and the `actualizar_inventario` trigger are `SECURITY DEFINER`**: RLS no longer filters for them, so they check `negocio_id` explicitly on every query — keep that filter in any edit. The cost frozen on each sale line lives in **`detalle_ventas_costos`** (1-1 with `detalle_ventas`, admin-only, migration 32), so `detalle_ventas` carries no cost either; `salesService.getSalesForReport` flattens the join back to `costo_unitario`. That table has **no insert or update policy on purpose**: only `registrar_venta` (`SECURITY DEFINER`) writes it, so a frozen cost can never be edited after the fact.
- **Never show a database id to the user.** Sales, returns, stock entries, adjustments and credit payments carry `numero`, consecutive per business (migration 30, counters in `consecutivos`); render it with `numeroDoc()` (`utils/documento.js`), which falls back to the id. Any query whose result is displayed must select `numero`.
- **Barcodes:** `productos.codigo_barras` (migration 34) is optional, unique per business only when present (partial index, so many products can have none), normalized to `null` when blank by a trigger, and admin-only like description and price. Don't confuse it with `productos.codigo`, the per-business consecutive number. A scanner types the code and sends Enter, so `SalesForm` adds the product to the cart on Enter when the text is an exact barcode; `agregarProducto` uses a functional `setItems` and counts what is already in the cart, because scans arrive faster than React re-renders.
- **Never show `productos.id` to the user.** The number on screen is `productos.codigo`, consecutive per business (migration 29), so every business starts at 1; the internal id stays out of sight and keeps the relations. Always render it through `numeroProducto()` / `coincideNumero()` (`utils/producto.js`), which fall back to the id when the migration isn't applied yet.
- **Low-stock alerts need rotation, not just a threshold.** `utils/stock.js` flags a product only if it is at or below its `stock_minimo` **and** it sold something in the last 30 days (`rotacion_productos()`, migration 33; `productService.getRotacion()`). A flat threshold alone marked 352 of 633 products in Fralu — more than half the catalog — and lowering it did not help (at 1 it still marked 92); of those 352 only 12 had sold in a month. Pass `rotacion` to `estadoStock`/`contarBajos`; when it is `null` (not loaded yet, or migration 33 missing) they fall back to threshold-only. Aggregate rotation in the database: 30 days of `detalle_ventas` exceeds the 1,000-row cap, so summing it in the browser undercounts silently.
- Supabase returns at most 1,000 rows per query. Use `productService.getTodosLosProductos()` when the whole catalog is needed (search, import matching).
- **Physical counts and stock/cost corrections go through the RPC `registrar_ajuste`** (Inventario → Ajustes, administrators). Every line needs a reason, and the line is rejected if stock changed since the screen loaded. In Productos, stock and cost are read-only when editing, and `updateProduct` never sends them (sending the form's stored stock used to undo sales made while the form was open).
- Cash sessions (`sesiones_caja`) are opened on the Sales page, not at login. Administrators may skip opening one. The closing count happens in the logout modal and covers the shift (since `abierta_en`, for that user), not the calendar day. Closed sessions are immutable.

## Database migrations

- Numbered files `supabase/NN_*.sql`, run **in order** in the Supabase SQL Editor. Paste the whole file each time; a partial paste gives `syntax error at end of input`.
- `supabase/verificar_estado.sql` checks what is applied. `supabase/README.md` lists each migration.
- `00_triggers_existentes.sql` copies triggers that pre-date versioning. The original base tables are **not** in the repo; `supabase/README.md` explains how to dump the schema with `pg_dump`.
- When adding a migration: use the next number, make it idempotent, and add it to the README table and to `verificar_estado.sql`.
- In the SQL Editor `auth.uid()` is null. The security triggers let those changes through on purpose, and the context functions (`mi_negocio()`, etc.) return null there, so RLS can't be tested from the editor unless you simulate a user with `set_config('request.jwt.claims', …)` + `set local role authenticated` inside a transaction that ends in `rollback`.

## Edge Functions

`supabase/functions/crear-usuario` and `supabase/functions/restablecer-contrasena` need the service-role key, so they must never run in the browser. Deploy them with:

```bash
supabase functions deploy <nombre> --use-api   # no Docker on this machine
```

Run any migration that adds columns a function writes **before** deploying that function. The files are `.ts` because that is the CLI's entrypoint, but the code is plain JavaScript.

## Conventions and gotchas

- **CSS specificity trap:** `src/styles.css` (imported by `index.css`) styles `input[type="text"|"password"|…]` with specificity (0,1,1), which beats a single class. Nest input styles under a parent class, e.g. `.caja-money .caja-input`.
- **Dates:** always Colombia time (`America/Bogota`) through `dateFormatter.js`. `ventas.fecha` is `timestamptz` set by the server with `now()`.
- **Notifications:** use `toast.exito / toast.aviso / toast.error` from `utils/toast`. No `alert()`. Keep `window.confirm` only for destructive actions.
- **Modals** use `useDialogo` (`src/hooks/useDialogo.js`) on the dialog box, with `ref`, `role="dialog" aria-modal="true" tabIndex={-1}` and an `aria-label`. It traps Tab, closes on Escape (pass `onCerrar: null` when it must not close, e.g. while saving or for mandatory dialogs), restores focus to the opener, locks page scroll, and only the topmost dialog reacts. Use `activo` for dialogs rendered conditionally inside a page. Don't add per-modal Escape or `body.style.overflow` effects.
- **Deletes under RLS** return no error when nothing was deleted; add `.select()` and check the returned row count.
- **Money inputs** keep the raw digits in state and only format for display (`parseCOP` / `formatCOPInput`).
- **Receipts** are built with `buildReceiptHTML` from the business settings (55 or 80 mm). `SalesPage` prints through a pop-up window and falls back to a hidden iframe when the browser blocks it.
- **Consumidor final:** document `222222222`, one per business, auto-created by a trigger. The quick sale depends on it, so it can't be deleted or have its document changed.

## Git workflow

One branch per feature (`feature/T-NN`), merged through a pull request. Never commit `.env`, `backup_*.sql` or `supabase/config.toml`.
