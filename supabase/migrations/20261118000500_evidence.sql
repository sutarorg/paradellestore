begin;
alter table shop.assets add column renditions jsonb not null default '{}';
alter table shop.order_items add column variant_sku_snapshot text,add column colour_snapshot text,add column source_price_snapshot integer,add column discount_snapshot integer not null default 0 check(discount_snapshot>=0),add column tax_snapshot integer not null default 0 check(tax_snapshot>=0);
create function shop.review_evidence() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.verification_status='licensed' then
 perform 1 from shop.products where id=new.product_id for update;
 if (select count(*) from shop.product_reviews where product_id=new.product_id and verification_status='licensed')>=10 then raise exception using errcode='23514',message='Licensed review limit';end if;
 elsif not exists(select 1 from shop.orders o join shop.payments p on p.order_id=o.id join shop.order_items i on i.order_id=o.id where o.id=new.order_id and o.customer_id=new.customer_id and i.product_id=new.product_id and o.fulfilment_status='delivered') then raise exception using errcode='23514',message='Delivery evidence required';end if;
 return new;end$$;
revoke all on function shop.review_evidence() from public;create trigger review_evidence before insert on shop.product_reviews for each row execute function shop.review_evidence();
revoke update(email) on shop.profiles from paradelle_runtime;
commit;
