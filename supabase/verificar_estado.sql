-- =====================================================================
-- Verifica qué migraciones están aplicadas. No modifica nada.
-- Todas las filas deben decir OK.
-- =====================================================================

with esperado(migracion, objeto, tipo, nombre) as (values
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
  ('12_stock_minimo',         'productos.stock_minimo',         'columna',  'productos.stock_minimo')
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
    when tipo = 'trigger' then
      case when exists (select 1 from pg_trigger where tgname=nombre)
           then 'OK' else 'FALTA' end
    when tipo = 'bucket' then
      case when exists (select 1 from storage.buckets where id=nombre)
           then 'OK' else 'FALTA' end
  end as estado
from esperado
order by migracion, objeto;
