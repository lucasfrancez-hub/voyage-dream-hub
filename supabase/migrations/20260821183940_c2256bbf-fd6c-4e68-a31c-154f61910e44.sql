
DO $$
DECLARE
  r RECORD;
  v_payment jsonb;
  v_opts jsonb;
  v_opt jsonb;
  v_new_opts jsonb;
  v_total numeric;
  v_ins jsonb;
  i int;
BEGIN
  FOR r IN
    SELECT pq.public_id, pq.payment, pq.extra, pq.totals
    FROM public_quotes pq
    JOIN quotes q ON q.public_quote_id = pq.public_id
    WHERE q.source IN ('INFOTRAVEL','FRT')
      AND (
        (pq.payment->'boleto'->'untilTravel') IS NOT NULL
        AND pq.payment->'boleto'->'untilTravel' <> 'null'::jsonb
        OR jsonb_array_length(COALESCE(pq.payment->'card'->'installments','[]'::jsonb)) < 15
      )
  LOOP
    v_payment := r.payment;
    v_total := COALESCE((r.totals->>'total')::numeric, (v_payment->'card'->'installments'->0->>'total')::numeric, 0);

    IF v_total > 0 THEN
      v_ins := '[]'::jsonb;
      FOR i IN 1..15 LOOP
        v_ins := v_ins || jsonb_build_object(
          'number', i,
          'amount', round(v_total / i, 2),
          'total', v_total,
          'interestFree', true
        );
      END LOOP;
      v_payment := jsonb_set(v_payment, '{card,installments}', v_ins);
      IF COALESCE((v_payment->'boleto'->>'enabled')::boolean, false)
         AND jsonb_array_length(COALESCE(v_payment->'boleto'->'installments','[]'::jsonb)) > 0 THEN
        v_payment := jsonb_set(v_payment, '{boleto,installments}', v_ins);
      END IF;
    END IF;

    v_payment := jsonb_set(v_payment, '{boleto,untilTravel}', 'null'::jsonb);
    IF jsonb_array_length(COALESCE(v_payment->'boleto'->'installments','[]'::jsonb)) = 0 THEN
      v_payment := jsonb_set(v_payment, '{boleto,enabled}', 'false'::jsonb);
      v_payment := jsonb_set(v_payment, '{methods}', '["CARD","PIX"]'::jsonb);
    ELSE
      v_payment := jsonb_set(v_payment, '{boleto,enabled}', 'true'::jsonb);
      v_payment := jsonb_set(v_payment, '{methods}', '["CARD","BOLETO","PIX"]'::jsonb);
    END IF;

    v_opts := r.extra->'options';
    IF v_opts IS NOT NULL AND jsonb_typeof(v_opts) = 'array' THEN
      v_new_opts := '[]'::jsonb;
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_opts) LOOP
        IF v_opt ? 'payment' THEN
          v_total := COALESCE((v_opt->'totals'->>'total')::numeric, 0);
          IF v_total > 0 THEN
            v_ins := '[]'::jsonb;
            FOR i IN 1..15 LOOP
              v_ins := v_ins || jsonb_build_object(
                'number', i,
                'amount', round(v_total / i, 2),
                'total', v_total,
                'interestFree', true
              );
            END LOOP;
            v_opt := jsonb_set(v_opt, '{payment,card,installments}', v_ins);
            IF jsonb_array_length(COALESCE(v_opt->'payment'->'boleto'->'installments','[]'::jsonb)) > 0 THEN
              v_opt := jsonb_set(v_opt, '{payment,boleto,installments}', v_ins);
            END IF;
          END IF;
          v_opt := jsonb_set(v_opt, '{payment,boleto,untilTravel}', 'null'::jsonb);
          IF jsonb_array_length(COALESCE(v_opt->'payment'->'boleto'->'installments','[]'::jsonb)) = 0 THEN
            v_opt := jsonb_set(v_opt, '{payment,boleto,enabled}', 'false'::jsonb);
            v_opt := jsonb_set(v_opt, '{payment,methods}', '["CARD","PIX"]'::jsonb);
          ELSE
            v_opt := jsonb_set(v_opt, '{payment,boleto,enabled}', 'true'::jsonb);
            v_opt := jsonb_set(v_opt, '{payment,methods}', '["CARD","BOLETO","PIX"]'::jsonb);
          END IF;
        END IF;
        v_new_opts := v_new_opts || jsonb_build_array(v_opt);
      END LOOP;
      UPDATE public_quotes SET extra = jsonb_set(extra, '{options}', v_new_opts), payment = v_payment, updated_at = now()
      WHERE public_id = r.public_id;
    ELSE
      UPDATE public_quotes SET payment = v_payment, updated_at = now() WHERE public_id = r.public_id;
    END IF;
  END LOOP;
END $$;
