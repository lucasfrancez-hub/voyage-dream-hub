update public.airfare_promo_candidates
   set status = 'pending',
       claimed_at = null,
       heartbeat_at = null,
       lease_expires_at = null,
       worker_token = null,
       dead_workers = 0,
       last_error = null,
       last_error_step = null
 where run_id = '37dde05b-6aca-413b-95d4-11f31fe67373'
   and status = 'error';

update public.airfare_promo_runs
   set status = 'running', phase = 'validando', finished_at = null,
       worker_lease_until = null, updated_at = now()
 where id = '37dde05b-6aca-413b-95d4-11f31fe67373';