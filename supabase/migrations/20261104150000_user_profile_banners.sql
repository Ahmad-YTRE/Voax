alter table public.profiles add column if not exists banner_url text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('profile-banners','profile-banners',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Voax profile banner uploads to own folder" on storage.objects;
create policy "Voax profile banner uploads to own folder" on storage.objects for insert to authenticated
with check (bucket_id='profile-banners' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Voax profile banner deletes from own folder" on storage.objects;
create policy "Voax profile banner deletes from own folder" on storage.objects for delete to authenticated
using (bucket_id='profile-banners' and (storage.foldername(name))[1]=(select auth.uid())::text);
