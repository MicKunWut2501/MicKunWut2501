-- 0006 Private storage bucket for receipt images/PDFs. Object path: <vehicle_id or 'unassigned'>/<uuid>.<ext>

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_bucket_read on storage.objects for select
  using (bucket_id = 'receipts' and (public.is_staff() or owner = auth.uid()));

create policy receipts_bucket_insert on storage.objects for insert
  with check (bucket_id = 'receipts' and auth.uid() is not null);

create policy receipts_bucket_delete on storage.objects for delete
  using (bucket_id = 'receipts' and public.is_staff());
