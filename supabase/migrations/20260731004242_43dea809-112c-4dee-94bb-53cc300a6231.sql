DO $$
DECLARE cmd text;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE jobname = 'ai-debounce-dispatch';
  IF cmd IS NOT NULL THEN
    PERFORM cron.unschedule('ai-debounce-dispatch');
    PERFORM cron.schedule('ai-debounce-dispatch', '15 seconds', cmd);
  END IF;
END $$;