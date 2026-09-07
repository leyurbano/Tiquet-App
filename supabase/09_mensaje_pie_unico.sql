-- =====================================================================
-- Unifica el pie del tiquete en un solo campo.
--
-- Tener mensaje_pie y mensaje_pie_2 obligaba a partir el texto en dos
-- líneas fijas, que además no se adaptaban al ancho del papel. Ahora es
-- un solo texto: los saltos de línea los pone el usuario si quiere, y lo
-- demás se acomoda solo según sean 55 u 80 mm.
--
-- Ejecutar DESPUÉS de multi_negocio.sql
-- =====================================================================

-- Se conserva lo que ya estaba escrito, uniendo ambas líneas
update public.negocios
set mensaje_pie = trim(
  coalesce(mensaje_pie, '') ||
  case
    when coalesce(mensaje_pie_2, '') <> '' then E'\n' || mensaje_pie_2
    else ''
  end
);

alter table public.negocios drop column if exists mensaje_pie_2;
