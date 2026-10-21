-- Credit packs no longer need a Bachs product (D-022): checkout sends the pack's amount and currency directly,
-- so prices live only in credit_packs. A pack may still name a product, which checkout then uses instead.
alter table public.credit_packs alter column bachs_product_id drop not null;

-- The default packs (D-022), added only when there are none, so an operator's own packs are never touched.
-- Credits: price x 100 plus the bonus. The "any amount" pack's price is the minimum.
insert into public.credit_packs (name, credits, price_amount, currency, bonus_percent, custom_amount, sort)
select name, credits, price_amount, 'USD', bonus_percent, custom_amount, sort
from (values
  ('500 credits', 500, 5.00, 0, false, 1),
  ('1,000 credits', 1000, 10.00, 0, false, 2),
  ('2,100 credits', 2100, 20.00, 5, false, 3),
  ('5,500 credits', 5500, 50.00, 10, false, 4),
  ('Any amount', 500, 5.00, 0, true, 5)
) as defaults (name, credits, price_amount, bonus_percent, custom_amount, sort)
where not exists (select 1 from public.credit_packs);
