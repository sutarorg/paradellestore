-- Run read-only on a hosted staging database after migrations. Returns no customer or payment content.
select tablename,rowsecurity from pg_tables where schemaname='shop' order by tablename;
select rolname,rolsuper,rolbypassrls from pg_roles where rolname in('paradelle_runtime','paradelle_app');
select has_table_privilege('anon','shop.orders','select') anon_can_read_orders,
 has_table_privilege('authenticated','shop.profiles','update') client_can_assign_roles,
 has_column_privilege('paradelle_runtime','shop.orders','total_amount','update') app_can_edit_total,
 has_table_privilege('paradelle_runtime','shop.order_items','delete') app_can_delete_snapshots;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in('product-images','site-assets');
