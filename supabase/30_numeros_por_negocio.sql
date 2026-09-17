-- =====================================================================
-- Numeración propia de cada negocio para todos los documentos
--
-- EL PROBLEMA
-- Ventas, devoluciones, entradas, ajustes y abonos se mostraban con el id
-- interno, que es único para toda la plataforma. El primer tiquete de un
-- negocio nuevo salía como "Venta #846", y el consecutivo de un negocio
-- avanzaba cuando vendía otro.
--
-- LA SOLUCIÓN
-- Una columna `numero` en cada uno de esos documentos, consecutiva DENTRO
-- de cada negocio, y una sola tabla de contadores (`consecutivos`) por
-- negocio y tipo de documento. El id interno se queda igual: sigue
-- sosteniendo todas las relaciones y deja de mostrarse.
--
-- El contador está en una tabla y no se calcula con max(numero):
--   - dos personas registrando a la vez no pueden tomar el mismo número
--   - un documento borrado no libera su número
--
-- OJO: esto renumera lo que ya existe. Un tiquete impreso con el número
-- viejo puede no coincidir con el del sistema. Se hace ahora, que es
-- cuando menos historial hay.
--
-- Ejecutar DESPUÉS de 29_codigo_por_negocio.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La tabla de contadores y la función que entrega el siguiente número
-- ---------------------------------------------------------------------
create table if not exists public.consecutivos (
  negocio_id bigint  not null references public.negocios (id),
  documento  text    not null check (documento in
              ('producto', 'venta', 'devolucion', 'entrada', 'ajuste', 'abono')),
  ultimo     integer not null default 0,
  primary key (negocio_id, documento)
);

-- Sin políticas a propósito: nadie la toca directo, solo la función
alter table public.consecutivos enable row level security;

/**
 * Entrega el siguiente número de ese documento para ese negocio.
 * El `on conflict do update` bloquea la fila hasta el fin de la
 * transacción: dos inserciones simultáneas se hacen fila.
 */
create or replace function public.siguiente_numero(p_negocio_id bigint, p_documento text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
begin
  if p_negocio_id is null then
    raise exception 'El documento no tiene negocio asignado';
  end if;

  insert into public.consecutivos (negocio_id, documento, ultimo)
  values (p_negocio_id, p_documento, 1)
  on conflict (negocio_id, documento)
    do update set ultimo = public.consecutivos.ultimo + 1
  returning ultimo into v_numero;

  return v_numero;
end $$;


-- ---------------------------------------------------------------------
-- 2. La columna `numero` en cada documento, y la renumeración de lo que
--    ya existe respetando el orden actual (por id)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ventas', 'devoluciones', 'entradas', 'ajustes', 'abonos']
  loop
    execute format('alter table public.%I add column if not exists numero integer', t);

    execute format($q$
      with numerados as (
        select id, row_number() over (partition by negocio_id order by id) as n
        from public.%I
      )
      update public.%I d
         set numero = numerados.n
        from numerados
       where numerados.id = d.id and d.numero is null
    $q$, t, t);

    execute format($q$
      create unique index if not exists %I on public.%I (negocio_id, numero)
    $q$, t || '_numero_negocio_idx', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. Los contadores arrancan donde quedó cada negocio
--    (incluye el de productos, que hasta ahora vivía en `negocios`)
-- ---------------------------------------------------------------------
insert into public.consecutivos (negocio_id, documento, ultimo)
select n.id, 'producto',
       greatest(
         coalesce((select max(p.codigo) from public.productos p where p.negocio_id = n.id), 0),
         coalesce(n.ultimo_codigo_producto, 0)
       )
from public.negocios n
on conflict (negocio_id, documento) do nothing;

do $$
declare t text; doc text;
begin
  foreach t in array array['ventas', 'devoluciones', 'entradas', 'ajustes', 'abonos']
  loop
    doc := case t
             when 'ventas' then 'venta'
             when 'devoluciones' then 'devolucion'
             when 'entradas' then 'entrada'
             when 'ajustes' then 'ajuste'
             else 'abono'
           end;

    execute format($q$
      insert into public.consecutivos (negocio_id, documento, ultimo)
      select n.id, %L,
             coalesce((select max(d.numero) from public.%I d where d.negocio_id = n.id), 0)
      from public.negocios n
      on conflict (negocio_id, documento) do nothing
    $q$, doc, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 4. Un solo trigger para todos: el tipo de documento va como argumento
-- ---------------------------------------------------------------------
create or replace function public.asignar_numero_documento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null then
    new.numero := public.siguiente_numero(new.negocio_id, tg_argv[0]);
  end if;
  return new;
end $$;

drop trigger if exists asignar_numero_venta on public.ventas;
create trigger asignar_numero_venta
  before insert on public.ventas
  for each row execute function public.asignar_numero_documento('venta');

drop trigger if exists asignar_numero_devolucion on public.devoluciones;
create trigger asignar_numero_devolucion
  before insert on public.devoluciones
  for each row execute function public.asignar_numero_documento('devolucion');

drop trigger if exists asignar_numero_entrada on public.entradas;
create trigger asignar_numero_entrada
  before insert on public.entradas
  for each row execute function public.asignar_numero_documento('entrada');

drop trigger if exists asignar_numero_ajuste on public.ajustes;
create trigger asignar_numero_ajuste
  before insert on public.ajustes
  for each row execute function public.asignar_numero_documento('ajuste');

drop trigger if exists asignar_numero_abono on public.abonos;
create trigger asignar_numero_abono
  before insert on public.abonos
  for each row execute function public.asignar_numero_documento('abono');


-- ---------------------------------------------------------------------
-- 5. Productos: el mismo contador que los demás documentos
--    (la columna de `negocios` queda sin uso y se retira)
-- ---------------------------------------------------------------------
create or replace function public.asignar_codigo_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.codigo is null then
    new.codigo := public.siguiente_numero(new.negocio_id, 'producto');
  end if;
  return new;
end $$;

alter table public.negocios drop column if exists ultimo_codigo_producto;


-- ---------------------------------------------------------------------
-- 6. Los textos del historial ya escritos, con el número del negocio
--    ("Venta #846 — 1 unidad(es)" → "Venta #12 — 1 unidad(es)")
-- ---------------------------------------------------------------------
update public.producto_historial h
   set descripcion = replace(descripcion, 'Venta #' || v.id, 'Venta #' || v.numero)
  from public.ventas v
 where h.venta_id = v.id
   and h.descripcion like '%Venta #' || v.id || '%';

update public.producto_historial h
   set descripcion = replace(descripcion, 'Entrada #' || e.id, 'Entrada #' || e.numero)
  from public.entradas e
 where h.entrada_id = e.id
   and h.descripcion like '%Entrada #' || e.id || '%';

update public.producto_historial h
   set descripcion = replace(descripcion, 'Ajuste #' || a.id, 'Ajuste #' || a.numero)
  from public.ajustes a
 where h.ajuste_id = a.id
   and h.descripcion like '%Ajuste #' || a.id || '%';

update public.producto_historial h
   set descripcion = replace(
         replace(descripcion, 'Devolución #' || d.id, 'Devolución #' || d.numero),
         'venta #' || v.id, 'venta #' || v.numero)
  from public.devoluciones d
  join public.ventas v on v.id = d.venta_id
 where h.devolucion_id = d.id;


-- ---------------------------------------------------------------------
-- 7. Las funciones que escriben esos textos, con el número del negocio
-- ---------------------------------------------------------------------

-- 7.1 Venta (trigger de detalle_ventas)
create or replace function public.actualizar_inventario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stock_actual numeric;
  v_numero     integer;
begin
  select cantidad into stock_actual
    from public.productos
   where id = new.producto_id
     for update;

  if stock_actual is null then
    raise exception 'Producto con id % no existe', new.producto_id;
  end if;

  if stock_actual < new.cantidad then
    raise exception 'Stock insuficiente para el producto id %: disponible %, solicitado %',
      new.producto_id, stock_actual, new.cantidad;
  end if;

  update public.productos
     set cantidad = cantidad - new.cantidad
   where id = new.producto_id;

  update public.productos_costos
     set costo_total = (stock_actual - new.cantidad) * costo
   where producto_id = new.producto_id;

  select numero into v_numero from public.ventas where id = new.venta_id;

  insert into public.producto_historial
    (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, venta_id)
  values
    (new.producto_id, 'venta', stock_actual, stock_actual - new.cantidad,
     'Venta #' || coalesce(v_numero, new.venta_id) || ' — ' || new.cantidad || ' unidad(es)',
     new.venta_id);

  return new;
end $$;


-- 7.2 Anulación
create or replace function public.anular_venta(p_venta_id bigint, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta    public.ventas;
  v_despues  numeric;
  v_lineas   integer := 0;
  r          record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede anular ventas';
  end if;

  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Indica el motivo de la anulación';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;
  if v_venta.anulada_en is not null then
    raise exception 'Esta venta ya estaba anulada';
  end if;

  if exists (select 1 from public.devoluciones where venta_id = p_venta_id) then
    raise exception 'La venta #% tiene devoluciones registradas y no se puede anular. Si el cliente devuelve el resto, regístralo como otra devolución',
      coalesce(v_venta.numero, v_venta.id);
  end if;

  for r in
    select producto_id, cantidad
    from public.detalle_ventas
    where venta_id = p_venta_id
    order by producto_id
  loop
    update public.productos
       set cantidad = coalesce(cantidad, 0) + r.cantidad
     where id = r.producto_id
    returning cantidad into v_despues;

    -- Producto borrado del catálogo: no hay stock que devolver
    continue when not found;

    update public.productos_costos
       set costo_total = v_despues * costo
     where producto_id = r.producto_id;

    insert into public.producto_historial
      (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, venta_id)
    values
      (r.producto_id, 'reversion', v_despues - r.cantidad, v_despues,
       format('Anulación Venta #%s — se devolvieron %s unidad(es)',
              coalesce(v_venta.numero, v_venta.id), r.cantidad),
       p_venta_id);

    v_lineas := v_lineas + 1;
  end loop;

  update public.ventas
     set anulada_en       = now(),
         anulada_por      = auth.uid(),
         motivo_anulacion = p_motivo
   where id = p_venta_id;

  return jsonb_build_object('itemsRestored', v_lineas);
end $$;

revoke all on function public.anular_venta(bigint, text) from public;
grant execute on function public.anular_venta(bigint, text) to authenticated;


-- 7.3 Devolución (trigger de detalle_devoluciones)
create or replace function public.reintegrar_stock_devolucion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_despues    numeric;
  v_num_dev    integer;
  v_num_venta  integer;
begin
  if not new.reintegra then
    return new;
  end if;

  update public.productos
     set cantidad = coalesce(cantidad, 0) + new.cantidad
   where id = new.producto_id
  returning cantidad into v_despues;

  if not found then
    return new;
  end if;

  update public.productos_costos
     set costo_total = v_despues * costo
   where producto_id = new.producto_id;

  select d.numero, v.numero into v_num_dev, v_num_venta
    from public.devoluciones d
    join public.ventas v on v.id = d.venta_id
   where d.id = new.devolucion_id;

  insert into public.producto_historial
    (negocio_id, producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, devolucion_id)
  values
    (new.negocio_id, new.producto_id, 'devolucion', v_despues - new.cantidad, v_despues,
     format('Devolución #%s de la venta #%s — +%s unidad(es)',
            coalesce(v_num_dev, new.devolucion_id),
            coalesce(v_num_venta, new.venta_id),
            new.cantidad),
     new.devolucion_id);

  return new;
end $$;


-- 7.4 Entrada de mercancía: solo cambia el texto del historial
--     (el resto es idéntico a la migración 28)
create or replace function public.registrar_entrada(
  p_proveedor text,
  p_factura   text,
  p_nota      text,
  p_items     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entrada      public.entradas;
  v_total        numeric(14, 2);
  v_prod         record;
  v_producto_id  bigint;
  v_stock_nuevo  numeric;
  v_costo_nuevo  numeric(12, 2);
  v_lineas       integer := 0;
  v_creados      bigint[] := '{}';
  v_repetido     text;
  r              record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede registrar entradas de mercancía';
  end if;

  if public.mi_negocio() is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La entrada no tiene productos';
  end if;

  if jsonb_array_length(p_items) > 2000 then
    raise exception 'Máximo 2.000 productos por entrada: divide el archivo en partes';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, nuevo jsonb, cantidad numeric, costo_unitario numeric)
    where (x.producto_id is null) = (x.nuevo is null)
       or x.cantidad is null or x.cantidad < 0 or x.cantidad <> trunc(x.cantidad)
       or (x.producto_id is not null and x.cantidad = 0)
       or x.costo_unitario is null or x.costo_unitario < 0
       or (x.nuevo is not null and (
            coalesce(trim(x.nuevo->>'descripcion'), '') = ''
            or (x.nuevo->>'precio_venta') is null
            or (x.nuevo->>'precio_venta')::numeric < 0
            or ((x.nuevo->>'stock_minimo') is not null
                and (x.nuevo->>'stock_minimo')::numeric < 0)))
  ) then
    raise exception 'Hay líneas con datos inválidos: la cantidad debe ser un número entero (mayor que cero si el producto ya existe), y un producto nuevo necesita nombre y precio de venta';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(producto_id bigint)
    where x.producto_id is not null
    group by x.producto_id having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en la entrada';
  end if;

  select max(trim(x.nuevo->>'descripcion')) into v_repetido
  from jsonb_to_recordset(p_items) as x(nuevo jsonb)
  where x.nuevo is not null
  group by lower(trim(x.nuevo->>'descripcion'))
  having count(*) > 1
  limit 1;

  if v_repetido is not null then
    raise exception 'El producto nuevo "%" está repetido en la entrada', v_repetido;
  end if;

  select p.descripcion into v_repetido
  from jsonb_to_recordset(p_items) as x(nuevo jsonb)
  join public.productos p
    on lower(trim(p.descripcion)) = lower(trim(x.nuevo->>'descripcion'))
  where x.nuevo is not null
  limit 1;

  if v_repetido is not null then
    raise exception 'Ya existe un producto llamado "%": búscalo y agrégalo en vez de crearlo de nuevo', v_repetido;
  end if;

  select sum(x.cantidad * x.costo_unitario) into v_total
  from jsonb_to_recordset(p_items) as x(cantidad numeric, costo_unitario numeric);

  insert into public.entradas (user_id, proveedor, factura, nota, total)
  values (
    auth.uid(),
    nullif(trim(p_proveedor), ''),
    nullif(trim(p_factura), ''),
    nullif(trim(p_nota), ''),
    v_total
  )
  returning * into v_entrada;

  for r in
    select x.producto_id, x.nuevo, x.cantidad::integer as cantidad, x.costo_unitario
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, nuevo jsonb, cantidad numeric, costo_unitario numeric)
    order by x.producto_id nulls last
  loop
    if r.nuevo is not null then
      insert into public.productos (descripcion, cantidad, precio_venta, stock_minimo)
      values (
        trim(r.nuevo->>'descripcion'),
        0,
        (r.nuevo->>'precio_venta')::numeric,
        nullif(r.nuevo->>'stock_minimo', '')::integer
      )
      returning id into v_producto_id;

      v_creados := v_creados || v_producto_id;

      if r.cantidad = 0 then
        update public.productos_costos
           set costo = r.costo_unitario
         where producto_id = v_producto_id;
        v_lineas := v_lineas + 1;
        continue;
      end if;
    else
      v_producto_id := r.producto_id;
    end if;

    select p.id, coalesce(p.cantidad, 0) as stock, coalesce(pc.costo, 0) as costo
      into v_prod
      from public.productos p
      left join public.productos_costos pc on pc.producto_id = p.id
     where p.id = v_producto_id
       for update of p;

    if not found then
      raise exception 'El producto % no existe en este negocio', v_producto_id;
    end if;

    v_stock_nuevo := v_prod.stock + r.cantidad;
    v_costo_nuevo := case
      when v_prod.stock <= 0 then r.costo_unitario
      else round((v_prod.stock * v_prod.costo + r.cantidad * r.costo_unitario) / v_stock_nuevo, 2)
    end;

    update public.productos
       set cantidad = v_stock_nuevo
     where id = v_producto_id;

    update public.productos_costos
       set costo = v_costo_nuevo,
           costo_total = v_stock_nuevo * v_costo_nuevo
     where producto_id = v_producto_id;

    insert into public.detalle_entradas
      (entrada_id, producto_id, cantidad, costo_unitario,
       stock_anterior, stock_nuevo, costo_anterior, costo_nuevo)
    values
      (v_entrada.id, v_producto_id, r.cantidad, r.costo_unitario,
       v_prod.stock, v_stock_nuevo, v_prod.costo, v_costo_nuevo);

    insert into public.producto_historial
      (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, entrada_id)
    values
      (v_producto_id, 'entrada', v_prod.stock, v_stock_nuevo,
       format('Entrada #%s — +%s unidad(es)',
              coalesce(v_entrada.numero, v_entrada.id), r.cantidad),
       v_entrada.id);

    v_lineas := v_lineas + 1;
  end loop;

  return to_jsonb(v_entrada)
      || jsonb_build_object('lineas', v_lineas, 'productos_creados', to_jsonb(v_creados));
end $$;

revoke all on function public.registrar_entrada(text, text, text, jsonb) from public;
grant execute on function public.registrar_entrada(text, text, text, jsonb) to authenticated;


-- 7.5 Ajuste por conteo: solo cambia el texto del historial
create or replace function public.registrar_ajuste(p_nota text, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ajuste      public.ajustes;
  v_prod        record;
  v_diferencia  numeric;
  v_costo_nuevo numeric(12, 2);
  v_lineas      integer := 0;
  v_cambios     integer := 0;
  r             record;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede registrar ajustes de inventario';
  end if;

  if public.mi_negocio() is null then
    raise exception 'Tu usuario no pertenece a un negocio activo';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El ajuste no tiene productos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, stock_sistema numeric, stock_contado numeric,
           costo_unitario numeric, motivo text)
    where x.producto_id is null
       or x.stock_sistema is null
       or x.stock_contado is null or x.stock_contado < 0 or x.stock_contado <> trunc(x.stock_contado)
       or (x.costo_unitario is not null and x.costo_unitario < 0)
       or x.motivo is null
       or x.motivo not in ('conteo', 'dano', 'perdida', 'vencimiento', 'correccion', 'otro')
  ) then
    raise exception 'Hay productos con cantidad, costo o motivo inválidos (lo contado debe ser un número entero, cero o más)';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(producto_id bigint)
    group by x.producto_id having count(*) > 1
  ) then
    raise exception 'Hay productos repetidos en el ajuste';
  end if;

  insert into public.ajustes (user_id, nota)
  values (auth.uid(), nullif(trim(p_nota), ''))
  returning * into v_ajuste;

  for r in
    select x.producto_id, x.stock_sistema, x.stock_contado, x.costo_unitario, x.motivo
    from jsonb_to_recordset(p_items)
      as x(producto_id bigint, stock_sistema numeric, stock_contado numeric,
           costo_unitario numeric, motivo text)
    order by x.producto_id
  loop
    select p.id, p.descripcion, coalesce(p.cantidad, 0) as stock, coalesce(pc.costo, 0) as costo
      into v_prod
      from public.productos p
      left join public.productos_costos pc on pc.producto_id = p.id
     where p.id = r.producto_id
       for update of p;

    if not found then
      raise exception 'El producto % no existe en este negocio', r.producto_id;
    end if;

    if v_prod.stock <> r.stock_sistema then
      raise exception 'El stock de "%" cambió mientras hacías el ajuste (el sistema tiene %, la pantalla mostraba %). Quítalo, vuelve a agregarlo y cuéntalo de nuevo.',
        v_prod.descripcion, v_prod.stock, r.stock_sistema;
    end if;

    v_diferencia  := r.stock_contado - v_prod.stock;
    v_costo_nuevo := coalesce(r.costo_unitario, v_prod.costo);

    insert into public.detalle_ajustes
      (ajuste_id, producto_id, motivo, stock_anterior, stock_contado, diferencia,
       costo_anterior, costo_nuevo, valor_diferencia)
    values
      (v_ajuste.id, r.producto_id, r.motivo, v_prod.stock, r.stock_contado, v_diferencia,
       v_prod.costo, v_costo_nuevo, round(v_diferencia * v_costo_nuevo, 2));

    if v_diferencia <> 0 or v_costo_nuevo <> v_prod.costo then
      update public.productos
         set cantidad = r.stock_contado
       where id = r.producto_id;

      update public.productos_costos
         set costo = v_costo_nuevo,
             costo_total = r.stock_contado * v_costo_nuevo
       where producto_id = r.producto_id;

      v_cambios := v_cambios + 1;
    end if;

    if v_diferencia <> 0 then
      insert into public.producto_historial
        (producto_id, tipo_evento, cantidad_anterior, cantidad_nueva, descripcion, ajuste_id)
      values
        (r.producto_id, 'ajuste', v_prod.stock, r.stock_contado,
         format('Ajuste #%s (%s): %s%s unidad(es)',
                coalesce(v_ajuste.numero, v_ajuste.id), r.motivo,
                case when v_diferencia > 0 then '+' else '' end, v_diferencia),
         v_ajuste.id);
    end if;

    v_lineas := v_lineas + 1;
  end loop;

  return to_jsonb(v_ajuste) || jsonb_build_object('lineas', v_lineas, 'cambios', v_cambios);
end $$;

revoke all on function public.registrar_ajuste(text, jsonb) from public;
grant execute on function public.registrar_ajuste(text, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Verificación: las tres primeras en 0, y luego el resumen por negocio
-- ---------------------------------------------------------------------
select 'ventas sin número (debe ser 0)' as chequeo,
       (select count(*)::text from public.ventas where numero is null) as resultado
union all
select 'documentos sin número (debe ser 0)',
       ((select count(*) from public.devoluciones where numero is null)
      + (select count(*) from public.entradas where numero is null)
      + (select count(*) from public.ajustes where numero is null)
      + (select count(*) from public.abonos where numero is null))::text
union all
select 'contadores atrasados (debe ser 0)',
       (select count(*)::text
        from public.consecutivos c
        where c.documento = 'venta'
          and c.ultimo < coalesce(
            (select max(v.numero) from public.ventas v where v.negocio_id = c.negocio_id), 0))
union all
select 'textos del historial con el número viejo',
       (select count(*)::text
        from public.producto_historial h
        join public.ventas v on v.id = h.venta_id
        where h.descripcion like '%Venta #' || v.id || '%' and v.id <> v.numero);
