begin;
-- The server assumes this restricted role for commerce transactions. It cannot create admins or change grants.
do $$declare t text;begin for t in select tablename from pg_tables where schemaname='shop' loop
 execute format('alter table shop.%I enable row level security',t);
 execute format('revoke all on shop.%I from public,anon,authenticated',t);
 execute format('create policy backend on shop.%I for all to paradelle_runtime using(true) with check(true)',t);
 execute format('grant select on shop.%I to paradelle_runtime',t);
end loop;end$$;
grant insert,update,delete on shop.products,shop.product_variants,shop.product_images,shop.reservations,shop.checkout_intents,shop.work_queue,shop.staff_sessions,shop.rate_windows,shop.product_reviews to paradelle_runtime;
grant insert,update on shop.customers,shop.refunds,shop.product_import_jobs,shop.order_fulfilment to paradelle_runtime;
grant insert on shop.order_items,shop.payments,shop.addresses,shop.stock_history,shop.admin_activity_logs,shop.command_receipts,shop.orders,shop.assets,shop.payment_events to paradelle_runtime;
grant update(payment_status,fulfilment_status,revision,updated_at,exception_reason) on shop.orders to paradelle_runtime;
grant update(usage_count) on shop.coupons to paradelle_runtime;grant update on shop.store_settings to paradelle_runtime;grant update(full_name,updated_at,email) on shop.profiles to paradelle_runtime;
-- No anon grants. Authenticated clients can inspect their own active profile, never assign roles.
grant select on shop.profiles to authenticated;
create policy own_active_profile on shop.profiles for select to authenticated using(id=(select auth.uid()) and is_active);
create function shop.can_read(scope text) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from shop.profiles where id=(select auth.uid()) and role='admin' and is_active and scope=any(permissions))$$;
revoke all on function shop.can_read(text) from public;grant execute on function shop.can_read(text) to authenticated;
grant select on shop.products,shop.product_variants,shop.customers,shop.orders,shop.addresses to authenticated;
create policy catalogue_staff on shop.products for select to authenticated using((select shop.can_read('catalogue')));
create policy size_staff on shop.product_variants for select to authenticated using((select shop.can_read('inventory')));
create policy customer_staff on shop.customers for select to authenticated using((select shop.can_read('customers')) and (select shop.can_read('pii')));
create policy order_staff on shop.orders for select to authenticated using((select shop.can_read('orders')) and (select shop.can_read('pii')));
create policy address_staff on shop.addresses for select to authenticated using((select shop.can_read('orders')) and (select shop.can_read('pii')));
-- Both buckets are private. Only a verified server writes after decoding. Public delivery checks publication by asset ID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('product-images','product-images',false,4194304,array['image/webp']),('site-assets','site-assets',false,4194304,array['image/webp']);
create policy paradelle_private_objects on storage.objects as restrictive for all to anon,authenticated using(bucket_id not in('product-images','site-assets')) with check(bucket_id not in('product-images','site-assets'));
commit;
