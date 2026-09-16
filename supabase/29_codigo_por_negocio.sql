-- =====================================================================
-- Un número de producto propio para cada negocio
--
-- EL PROBLEMA
-- La app mostraba el id interno de la base de datos, que es único para
-- toda la plataforma. Un negocio nuevo veía su primer producto como
-- "#634" y parecía que le faltaran 633.
--
-- LA SOLUCIÓN
-- Una columna `codigo`, consecutiva DENTRO de cada negocio: todos empiezan
-- en 1. El id interno se queda igual, sosteniendo ventas, entradas,
-- devoluciones e historial; simplemente deja de mostrarse.
--
-- El contador vive en `negocios.ultimo_codigo_producto`, no se calcula con
-- max(codigo):
--   - dos personas creando productos al mismo tiempo no pueden tomar el
--     mismo número (el UPDATE bloquea la fila del negocio)
--   - un número borrado no se reutiliza, así el historial nunca queda
--     apuntando a "otro" producto con el mismo número
--
-- Ejecutar DESPUÉS de 28_costos_solo_admin.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La columna y la renumeración de lo que ya existe
--    row_number() por negocio ordenando por id: se respeta el orden
--    actual, así que quien se sabe un número de memoria casi no lo ve
--    cambiar (en un negocio con 632 productos, el 634 pasa a ser 633).
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists codigo integer;

with numerados as (
  select id, row_number() over (partition by negocio_id order by id) as n
  from public.productos
)
update public.productos p
   set codigo = numerados.n
  from numerados
 where numerados.id = p.id
   and p.codigo is null;

-- Dentro de un negocio el número es único; entre negocios se repite y está bien
create unique index if not exists productos_codigo_negocio_idx
  on public.productos (negocio_id, codigo);


-- ---------------------------------------------------------------------
-- 2. El contador de cada negocio, arrancado en lo que ya se usó
-- ---------------------------------------------------------------------
alter table public.negocios
  add column if not exists ultimo_codigo_producto integer not null default 0;

update public.negocios n
   set ultimo_codigo_producto = coalesce(
     (select max(p.codigo) from public.productos p where p.negocio_id = n.id), 0
   )
 where n.ultimo_codigo_producto = 0;


-- ---------------------------------------------------------------------
-- 3. Cada producto nuevo toma el siguiente número de su negocio
-- ---------------------------------------------------------------------
create or replace function public.asignar_codigo_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.codigo is not null then
    return new;
  end if;

  if new.negocio_id is null then
    raise exception 'El producto no tiene negocio asignado';
  end if;

  -- El UPDATE bloquea la fila del negocio hasta el fin de la transacción:
  -- dos creaciones simultáneas se hacen fila y nunca repiten número
  update public.negocios
     set ultimo_codigo_producto = ultimo_codigo_producto + 1
   where id = new.negocio_id
  returning ultimo_codigo_producto into new.codigo;

  return new;
end $$;

drop trigger if exists asignar_codigo_producto on public.productos;
create trigger asignar_codigo_producto
  before insert on public.productos
  for each row execute function public.asignar_codigo_producto();


-- ---------------------------------------------------------------------
-- Verificación: 1, 0 y el número más alto de cada negocio
-- ---------------------------------------------------------------------
select 'trigger asignar_codigo_producto' as chequeo,
       (select count(*)::text from pg_trigger where tgname = 'asignar_codigo_producto') as resultado
union all
select 'productos sin número (debe ser 0)',
       (select count(*)::text from public.productos where codigo is null)
union all
select 'negocios con el contador atrasado (debe ser 0)',
       (select count(*)::text
        from public.negocios n
        where n.ultimo_codigo_producto <
              coalesce((select max(p.codigo) from public.productos p where p.negocio_id = n.id), 0));
