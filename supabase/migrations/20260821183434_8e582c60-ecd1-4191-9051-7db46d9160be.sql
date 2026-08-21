create or replace function public._tmp_parcelas(_total numeric, _max int)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'number', n,
    'amount', round(_total / n, 2),
    'total', _total,
    'interestFree', true
  ) order by n), '[]'::jsonb)
  from generate_series(1, greatest(1, _max)) as n
$$;

create or replace function public._tmp_fix_frt_payment(p jsonb, _max int)
returns jsonb language sql immutable as $$
  select case when p is null or p = 'null'::jsonb then p else
    jsonb_set(
      jsonb_set(
        jsonb_set(p, '{card,installments}',
          public._tmp_parcelas(coalesce((p->'card'->'installments'->0->>'total')::numeric, 0), _max)),
        '{boleto,installments}',
        case when coalesce(p->'boleto'->>'enabled','false') = 'true'
             and jsonb_array_length(coalesce(p->'boleto'->'installments','[]'::jsonb)) > 0
          then public._tmp_parcelas(coalesce((p->'boleto'->'installments'->0->>'total')::numeric, 0), _max)
          else coalesce(p->'boleto'->'installments','[]'::jsonb) end),
      '{boleto,untilTravel}', 'null'::jsonb)
  end
$$;

with alvo as (
  select pq.id
  from public.public_quotes pq
  join public.quotes q on q.public_quote_id = pq.public_id
  where coalesce(q.normalized->>'source', q.source) ilike any (array['%infotravel%','%frt%'])
)
update public.public_quotes pq
set payment = public._tmp_fix_frt_payment(pq.payment, 15),
    extra = case
      when jsonb_typeof(coalesce(pq.extra->'options','null'::jsonb)) = 'array' then
        jsonb_set(pq.extra, '{options}', (
          select coalesce(jsonb_agg(
            case when o ? 'payment'
              then jsonb_set(o, '{payment}', public._tmp_fix_frt_payment(o->'payment', 15))
              else o end
            order by ord), '[]'::jsonb)
          from jsonb_array_elements(pq.extra->'options') with ordinality as t(o, ord)
        ))
      else pq.extra end,
    updated_at = now()
from alvo
where alvo.id = pq.id;

drop function public._tmp_fix_frt_payment(jsonb, int);
drop function public._tmp_parcelas(numeric, int);