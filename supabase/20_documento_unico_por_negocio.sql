-- =====================================================================
-- El documento del cliente es único POR NEGOCIO, no en toda la base
--
-- EL PROBLEMA
-- clientes tenía `UNIQUE (documento)`: una restricción que venía de
-- antes de la multi-tenencia, cuando había un solo negocio. Con varios
-- negocios eso causaba tres fallas:
--
--  1. La venta rápida no funcionaba en ningún negocio nuevo. El Consumidor
--     final (222222222) solo podía existir una vez en toda la base, y ya
--     era de Fralu. El minimarket no lo veía (la RLS se lo oculta), y si
--     intentaba crearlo, la base lo rechazaba por duplicado. La venta
--     quedaba sin cliente.
--  2. Una persona no podía ser cliente de dos negocios distintos.
--  3. Se filtraba información: el error de "documento duplicado" le
--     revelaba a un negocio que esa cédula ya estaba registrada en otro.
--
-- LA SOLUCIÓN
--  - La unicidad pasa a ser (negocio_id, documento).
--  - Cada negocio que no tiene Consumidor final recibe el suyo.
--  - Todo negocio nuevo lo recibe automáticamente al crearse (trigger),
--    sin importar si se crea desde la app, la Edge Function o SQL.
--
-- Ejecutar DESPUÉS de 19_cambio_contrasena.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Unicidad por negocio
--    Hoy todos los clientes son de Fralu, así que no hay duplicados que
--    impidan crear la restricción nueva.
-- ---------------------------------------------------------------------
alter table public.clientes drop constraint if exists clientes_documento_key;

alter table public.clientes drop constraint if exists clientes_negocio_documento_key;
alter table public.clientes
  add constraint clientes_negocio_documento_key unique (negocio_id, documento);


-- ---------------------------------------------------------------------
-- 2. Consumidor final para los negocios que no lo tienen
-- ---------------------------------------------------------------------
insert into public.clientes (nombre, documento, telefono, negocio_id)
select 'Consumidor final', '222222222', '', n.id
from public.negocios n
where not exists (
  select 1 from public.clientes c
  where c.negocio_id = n.id and c.documento = '222222222'
);


-- ---------------------------------------------------------------------
-- 3. Todo negocio nuevo nace con su Consumidor final
--    SECURITY DEFINER: quien crea el negocio (el super admin) no
--    pertenece a ese negocio, y la RLS no lo dejaría insertar ahí.
-- ---------------------------------------------------------------------
create or replace function public.crear_consumidor_final()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.clientes (nombre, documento, telefono, negocio_id)
  values ('Consumidor final', '222222222', '', new.id)
  on conflict (negocio_id, documento) do nothing;
  return new;
end $$;

drop trigger if exists crear_consumidor_final on public.negocios;
create trigger crear_consumidor_final
  after insert on public.negocios
  for each row execute function public.crear_consumidor_final();


-- ---------------------------------------------------------------------
-- Verificación: cada negocio debe tener exactamente 1 Consumidor final
-- ---------------------------------------------------------------------
select n.nombre_comercial as negocio,
       count(c.id)        as consumidores_finales
from public.negocios n
left join public.clientes c
  on c.negocio_id = n.id and c.documento = '222222222'
group by n.nombre_comercial
order by n.nombre_comercial;
