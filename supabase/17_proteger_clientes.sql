-- =====================================================================
-- Protección de clientes (hallazgo 10 de la auditoría)
--
-- EL PROBLEMA
-- Eliminar un cliente con ventas fallaba y la pantalla no decía nada: el
-- usuario confirmaba y no pasaba nada. Además cualquier vendedor veía el
-- botón, y nada impedía borrar al "Consumidor final" (documento
-- 222222222), que es el cliente que usa la venta rápida.
--
-- LO QUE NO SE PUDO VERIFICAR
-- La acción de la llave foránea ventas.cliente_id no está en el
-- repositorio. Si fuera ON DELETE CASCADE, borrar un cliente borraría
-- TODAS sus ventas en silencio (las acciones de llave foránea no pasan
-- por la RLS). Para no depender de eso, un trigger impide borrar a
-- cualquier cliente con ventas, esté como esté definida la llave.
--
-- Ejecutar DESPUÉS de 16_venta_requiere_caja.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Un cliente con ventas no se borra: es parte del historial de
--    facturas. Cuenta también las ventas anuladas.
--
--    errcode 23503 (violación de llave foránea) a propósito: la app lo
--    traduce a un mensaje claro, igual que si lo hubiera frenado la llave.
-- ---------------------------------------------------------------------
create or replace function public.impedir_borrar_cliente_con_ventas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.ventas where cliente_id = old.id) then
    raise exception 'No se puede eliminar: el cliente tiene ventas registradas'
      using errcode = '23503';
  end if;
  return old;
end $$;

drop trigger if exists impedir_borrar_cliente_con_ventas on public.clientes;
create trigger impedir_borrar_cliente_con_ventas
  before delete on public.clientes
  for each row execute function public.impedir_borrar_cliente_con_ventas();


-- ---------------------------------------------------------------------
-- 2. Borrar clientes: solo administradores, y nunca al Consumidor final.
--    `is distinct from` en vez de `<>`: con documento nulo, `<>` daría
--    null y bloquearía también el borrado de esos clientes.
--
--    Crear y editar siguen abiertos a todo el negocio: la venta registra
--    clientes nuevos sobre la marcha.
-- ---------------------------------------------------------------------
drop policy if exists clientes_del on public.clientes;
create policy clientes_del on public.clientes
  for delete to authenticated
  using (
    negocio_id = public.mi_negocio()
    and public.es_administrador()
    and documento is distinct from '222222222'
  );


-- ---------------------------------------------------------------------
-- 3. El documento del Consumidor final no se cambia: la venta rápida lo
--    busca exactamente por ese número.
-- ---------------------------------------------------------------------
create or replace function public.proteger_consumidor_final()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.documento = '222222222' and new.documento is distinct from old.documento then
    raise exception 'El documento del "Consumidor final" no se puede cambiar: lo usa la venta rápida';
  end if;

  return new;
end $$;

drop trigger if exists proteger_consumidor_final on public.clientes;
create trigger proteger_consumidor_final
  before update on public.clientes
  for each row execute function public.proteger_consumidor_final();


-- ---------------------------------------------------------------------
-- Verificación: ambos deben decir 1
-- ---------------------------------------------------------------------
select 'trigger impedir_borrar_cliente_con_ventas' as chequeo,
       (select count(*)::text from pg_trigger where tgname = 'impedir_borrar_cliente_con_ventas') as resultado
union all
select 'trigger proteger_consumidor_final',
       (select count(*)::text from pg_trigger where tgname = 'proteger_consumidor_final');
