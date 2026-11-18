begin;
create table shop.fulfilment_revisions(id uuid primary key default gen_random_uuid(),order_id uuid not null references shop.orders,revision int not null,manual jsonb not null,updated_by uuid not null references shop.profiles,created_at timestamptz not null default now(),unique(order_id,revision));
alter table shop.fulfilment_revisions enable row level security;
create policy backend on shop.fulfilment_revisions to paradelle_runtime using(true) with check(true);
grant select,insert on shop.fulfilment_revisions to paradelle_runtime;
create unique index import_source_once on shop.product_import_jobs(source_product_id) where product_id is not null;
create unique index refund_one_inflight on shop.work_queue(refund_id) where refund_id is not null and stage in ('queued','leased','waiting');
commit;
