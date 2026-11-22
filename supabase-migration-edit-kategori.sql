-- Jalankan sekali melalui Supabase Dashboard > SQL Editor.
-- Migrasi ini menambahkan izin UPDATE kategori khusus administrator.

drop policy if exists "categories_admin_update" on public.transaction_categories;
create policy "categories_admin_update"
on public.transaction_categories for update to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

grant update on public.transaction_categories to authenticated;
