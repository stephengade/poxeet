-- Naira packs (D-033): Nigerian visitors see and pay prices in naira, for exactly the credits the same dollars buy,
-- at our fixed rate of ₦1,500 to $1 (lib/billing/config.ts). One credit stays one US cent, so ₦3,000 = $2 = 200
-- credits. The dollar packs don't change. Added only when there are no naira packs, so an operator's own are kept.
-- Credits: price / 1,500 x 100 plus the bonus. The "any amount" pack's price is the minimum.
insert into public.credit_packs (name, credits, price_amount, currency, bonus_percent, custom_amount, sort)
select name, credits, price_amount, 'NGN', bonus_percent, custom_amount, sort
from (values
  ('200 credits', 200, 3000.00, 0, false, 1),
  ('500 credits', 500, 7500.00, 0, false, 2),
  ('1,000 credits', 1000, 15000.00, 0, false, 3),
  ('2,100 credits', 2100, 30000.00, 5, false, 4),
  ('5,500 credits', 5500, 75000.00, 10, false, 5),
  ('Any amount', 200, 3000.00, 0, true, 6)
) as defaults (name, credits, price_amount, bonus_percent, custom_amount, sort)
where not exists (select 1 from public.credit_packs where currency = 'NGN');
