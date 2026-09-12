# Migraciones de base de datos

Scripts SQL para Supabase (PostgreSQL), en el orden en que deben ejecutarse.
Cada uno se corre desde el **SQL Editor** del dashboard: New query → pegar el
archivo completo → Run.

> **Pega siempre el archivo entero.** Un pegado incompleto da el error
> `syntax error at end of input`.

| # | Archivo | Qué hace |
|---|---------|----------|
| 00 | `00_triggers_existentes.sql` | Triggers de inventario y pagos que ya existían en la base antes de versionar migraciones. Copia fiel, sin cambios. |
| 01 | `01_sesiones_caja.sql` | Turnos de caja: apertura con base y cierre con arqueo. |
| 02 | `02_ventas_user_id.sql` | `ventas.user_id`: quién registró cada venta. Sin esto el arqueo no puede separar por cajero. |
| 03 | `03_sesiones_caja_detalle_arqueo.sql` | `detalle_arqueo` (jsonb): validación de cada transacción del cierre. |
| 04 | `04_ventas_fecha_timestamptz.sql` | Convierte `ventas.fecha` a `timestamptz`. Corrige el desfase de 5 h que dejaba ventas fuera del arqueo y las de 00:00–05:00 en el día equivocado. |
| 05 | `05_ventas_anulacion.sql` | Anulación en vez de borrado: `anulada_en`, `anulada_por`, `motivo_anulacion`. |
| 06 | `06_multi_negocio.sql` | Multi-negocio: tabla `negocios`, `negocio_id` en todas las tablas, funciones de contexto y políticas de RLS por negocio. |
| 07 | `07_super_admin_flag.sql` | Separa el permiso de plataforma (`es_super_admin`) del rol dentro del negocio. |
| 08 | `08_storage_logos.sql` | Bucket `logos` para el logo de cada negocio. |
| 09 | `09_mensaje_pie_unico.sql` | Unifica el pie del tiquete en un solo campo. |
| 10 | `10_usuarios_sin_perfil.sql` | Lista usuarios de Auth sin perfil para el panel de plataforma. |
| 11 | `11_permisos_vendedor.sql` | Restringe al vendedor: no anula ventas ni cambia costos/precios. |
| 12 | `12_stock_minimo.sql` | Umbral de stock bajo por negocio y por producto. |
| 13 | `13_costo_en_venta.sql` | Congela el costo del producto en cada línea de venta, para el margen. |
| 14 | `14_endurecimiento_seguridad.sql` | Cierra la escalada a super admin, protege pagos/detalle y cierres de caja, y permite suspender negocios. |
| 15 | `15_ventas_atomicas.sql` | Venta y anulación en una sola transacción: sin ventas a medias ni stock devuelto dos veces. |
| 16 | `16_venta_requiere_caja.sql` | `registrar_venta` exige una caja abierta: ninguna venta queda fuera de un arqueo. |
| 17 | `17_proteger_clientes.sql` | Un cliente con ventas no se borra; solo administradores borran clientes; el Consumidor final queda protegido. |
| 18 | `18_stock_solo_por_ventas.sql` | El vendedor ya no puede fijar el stock a mano: solo cambia al registrar ventas. |

## Lo que todavía no está aquí

Las tablas originales (`productos`, `ventas`, `clientes`, `detalle_ventas`,
`pagos_venta`, `medios_pago`, `producto_historial`, `perfiles`) se crearon
antes de versionar y no tienen script. Estas migraciones las **modifican**,
pero no las **crean**: con solo este repositorio no se puede reconstruir la
base desde cero. Para eso hace falta un volcado del esquema (sin datos).

`supabase db dump` necesita Docker. Sin Docker se usa `pg_dump`, que viene
con PostgreSQL (en este equipo: `C:\Program Files\PostgreSQL\17\bin`, fuera
del PATH). Desde PowerShell, en la raíz del proyecto:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" `
  --schema-only --no-owner --no-privileges --schema=public `
  --dbname "PEGA_AQUI_LA_CADENA_DE_CONEXION" `
  -f supabase/schema_base.sql
```

La cadena de conexión se copia del dashboard: **Connect → Session pooler**
(puerto 5432), reemplazando `[YOUR-PASSWORD]` por la contraseña de la base.

- `--schema-only` vuelca la estructura (tablas, funciones, triggers,
  políticas) **sin datos**, así que `schema_base.sql` sí se puede versionar.
- El comando con la contraseña **no** se guarda en ningún archivo.

## El orden importa

No son independientes. Por ejemplo, `06` crea la función `resumen_negocios()`
que consulta `anulada_en`, columna que agrega `05`; corriendo `06` primero,
falla.

## Cómo verificar qué está aplicado

Corre `verificar_estado.sql` completo en el SQL Editor. No modifica nada:
devuelve una fila por cada objeto que deberían haber creado las migraciones,
con **OK** o **FALTA**.

## Sobre el aislamiento entre negocios

A partir de `06`, cada negocio solo ve sus propios datos, y el filtro vive en
la base de datos (políticas de RLS), no en la aplicación. El navegador nunca
envía a qué negocio pertenece: Postgres lo deduce del token de sesión con
`mi_negocio()`.

Al modificar políticas, ten presente que **se suman entre sí**: dejar una sola
política con condición `true` anula el aislamiento de esa tabla.

## Lo que NO va en este repositorio

Los volcados de la base (`backup_*.sql`) están en `.gitignore`. Contienen
hashes de contraseña, tokens de sesión activos y datos personales de clientes.
