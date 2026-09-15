-- =====================================================================
-- Verifica qué migraciones están aplicadas. No modifica nada.
-- Todas las filas deben decir OK.
-- =====================================================================

with esperado(migracion, objeto, tipo, nombre) as (values
  ('00_triggers_existentes',  'trigger descontar_inventario',   'trigger',  'descontar_inventario'),
  ('00_triggers_existentes',  'trigger trg_validar_pagos',      'trigger',  'trg_validar_pagos'),
  ('01_sesiones_caja',        'tabla sesiones_caja',            'tabla',    'sesiones_caja'),
  ('02_ventas_user_id',       'ventas.user_id',                 'columna',  'ventas.user_id'),
  ('03_detalle_arqueo',       'sesiones_caja.detalle_arqueo',   'columna',  'sesiones_caja.detalle_arqueo'),
  ('04_fecha_timestamptz',    'ventas.fecha con zona horaria',  'tipo',     'ventas.fecha'),
  ('05_ventas_anulacion',     'ventas.anulada_en',              'columna',  'ventas.anulada_en'),
  ('06_multi_negocio',        'tabla negocios',                 'tabla',    'negocios'),
  ('06_multi_negocio',        'productos.negocio_id',           'columna',  'productos.negocio_id'),
  ('06_multi_negocio',        'función mi_negocio()',           'funcion',  'mi_negocio'),
  ('07_super_admin_flag',     'perfiles.es_super_admin',        'columna',  'perfiles.es_super_admin'),
  ('08_storage_logos',        'bucket logos',                   'bucket',   'logos'),
  ('09_mensaje_pie_unico',    'mensaje_pie_2 eliminado',        'ausente',  'negocios.mensaje_pie_2'),
  ('10_usuarios_sin_perfil',  'función usuarios_sin_perfil()',  'funcion',  'usuarios_sin_perfil'),
  ('11_permisos_vendedor',    'función es_administrador()',     'funcion',  'es_administrador'),
  ('11_permisos_vendedor',    'trigger de columnas',            'trigger',  'proteger_campos_producto'),
  ('12_stock_minimo',         'negocios.stock_minimo_defecto',  'columna',  'negocios.stock_minimo_defecto'),
  ('12_stock_minimo',         'productos.stock_minimo',         'columna',  'productos.stock_minimo'),
  ('13_costo_en_venta',       'detalle_ventas.costo_unitario',  'columna',  'detalle_ventas.costo_unitario'),
  ('14_endurecimiento',       'trigger proteger_perfil',        'trigger',  'proteger_perfil'),
  ('14_endurecimiento',       'trigger proteger_sesion_caja',   'trigger',  'proteger_sesion_caja'),
  ('14_endurecimiento',       'ventas.creado_en',               'columna',  'ventas.creado_en'),
  ('14_endurecimiento',       'función estado_mi_cuenta()',     'funcion',  'estado_mi_cuenta'),
  ('15_ventas_atomicas',      'función registrar_venta()',      'funcion',  'registrar_venta'),
  ('15_ventas_atomicas',      'función anular_venta()',         'funcion',  'anular_venta'),
  ('17_proteger_clientes',    'trigger cliente con ventas',     'trigger',  'impedir_borrar_cliente_con_ventas'),
  ('17_proteger_clientes',    'trigger consumidor final',       'trigger',  'proteger_consumidor_final'),
  ('19_cambio_contrasena',    'perfiles.debe_cambiar_contrasena', 'columna', 'perfiles.debe_cambiar_contrasena'),
  ('19_cambio_contrasena',    'función marcar_contrasena_cambiada()', 'funcion', 'marcar_contrasena_cambiada'),
  ('20_documento_por_negocio', 'trigger consumidor final por negocio', 'trigger', 'crear_consumidor_final'),
  ('21_entradas_mercancia',   'tabla entradas',                  'tabla',    'entradas'),
  ('21_entradas_mercancia',   'función registrar_entrada()',     'funcion',  'registrar_entrada'),
  ('22_ajustes_inventario',   'tabla ajustes',                   'tabla',    'ajustes'),
  ('22_ajustes_inventario',   'función registrar_ajuste()',      'funcion',  'registrar_ajuste'),
  ('23_crear_productos',      'función crear_producto()',        'funcion',  'crear_producto'),
  ('24_importar_productos',   'registrar_entrada: agotados y tope 2.000', 'funcion_contiene', 'registrar_entrada|Máximo 2.000'),
  ('25_devoluciones',         'tabla devoluciones',              'tabla',    'devoluciones'),
  ('25_devoluciones',         'función registrar_devolucion()',  'funcion',  'registrar_devolucion'),
  ('25_devoluciones',         'negocios.devoluciones_vendedor',  'columna',  'negocios.devoluciones_vendedor'),
  ('26_fiado',                'tabla abonos',                    'tabla',    'abonos'),
  ('26_fiado',                'clientes.cupo_fiado',             'columna',  'clientes.cupo_fiado'),
  ('26_fiado',                'función registrar_abono()',       'funcion',  'registrar_abono'),
  ('26_fiado',                'registrar_venta controla el cupo', 'funcion_contiene', 'registrar_venta|cupo de fiado')
)
select
  migracion,
  objeto,
  case
    when tipo = 'tabla' then
      case when exists (select 1 from information_schema.tables
                        where table_schema='public' and table_name=nombre)
           then 'OK' else 'FALTA' end
    when tipo = 'columna' then
      case when exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name  = split_part(nombre,'.',1)
                          and column_name = split_part(nombre,'.',2))
           then 'OK' else 'FALTA' end
    when tipo = 'ausente' then
      case when exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name  = split_part(nombre,'.',1)
                          and column_name = split_part(nombre,'.',2))
           then 'FALTA (la columna sigue ahí)' else 'OK' end
    when tipo = 'tipo' then
      case when exists (select 1 from information_schema.columns
                        where table_schema='public'
                          and table_name  = split_part(nombre,'.',1)
                          and column_name = split_part(nombre,'.',2)
                          and data_type = 'timestamp with time zone')
           then 'OK' else 'FALTA' end
    when tipo = 'funcion' then
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public' and p.proname=nombre)
           then 'OK' else 'FALTA' end
    -- nombre = 'funcion|texto': la función existe y su código contiene el texto
    when tipo = 'funcion_contiene' then
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                        where n.nspname='public'
                          and p.proname = split_part(nombre,'|',1)
                          and p.prosrc like '%' || split_part(nombre,'|',2) || '%')
           then 'OK' else 'FALTA' end
    when tipo = 'trigger' then
      case when exists (select 1 from pg_trigger where tgname=nombre)
           then 'OK' else 'FALTA' end
    when tipo = 'bucket' then
      case when exists (select 1 from storage.buckets where id=nombre)
           then 'OK' else 'FALTA' end
  end as estado
from esperado
order by migracion, objeto;
