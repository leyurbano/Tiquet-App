-- =====================================================================
-- Almacenamiento de logos de los negocios
--
-- El bucket es PÚBLICO a propósito. El tiquete se imprime en una ventana
-- abierta con window.open, que no lleva la sesión de Supabase: si el
-- bucket fuera privado, la imagen no cargaría al imprimir. La consecuencia
-- es que un logo es visible para quien tenga su URL — aceptable, ya que
-- un logo comercial es público por naturaleza.
--
-- La escritura sí está restringida: cada negocio solo puede tocar su
-- propia carpeta, que lleva su negocio_id como nombre.
--
-- Ejecutar DESPUÉS de multi_negocio.sql
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Cualquiera puede ver los logos (necesario para la impresión)
drop policy if exists "logos_lectura_publica" on storage.objects;
create policy "logos_lectura_publica"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Solo se puede escribir dentro de la carpeta del propio negocio.
-- La ruta es <negocio_id>/archivo.png, así que foldername[1] es el negocio.
drop policy if exists "logos_insert_propio" on storage.objects;
create policy "logos_insert_propio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_negocio()::text
  );

drop policy if exists "logos_update_propio" on storage.objects;
create policy "logos_update_propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_negocio()::text
  );

drop policy if exists "logos_delete_propio" on storage.objects;
create policy "logos_delete_propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.mi_negocio()::text
  );
