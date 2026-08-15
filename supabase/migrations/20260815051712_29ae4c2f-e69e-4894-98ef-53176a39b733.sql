update public.wa_flight_search_requests r
set status = 'cancelled', updated_at = now()
from public.wa_conversations c
where c.id = r.conversation_id
  and r.status in ('collecting','searching','delivering','awaiting_customer')
  and (r.protocol_id is null or r.protocol_id is distinct from c.protocolo_ativo_id);