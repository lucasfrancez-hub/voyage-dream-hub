ALTER TABLE public.instagram_accounts ALTER COLUMN page_id DROP NOT NULL;

INSERT INTO public.instagram_accounts (ig_user_id, username, display_name, access_token, token_expires_at, is_default, active, metadata)
VALUES ('27551534044489283', 'viaairs', 'VIA AIR', 'IGAAO8ss9w2XZABZAGFlRkV2OGRPbDF6T0tXaTYyVnZA0azVvaEZAmWEt2MDd3MHBYT2xrM3d1MnpYbC1ETWxCeHV6RGZA3dGthSldxM1BSQm85cFZAtUWNPUDBSblJkUTdHSUVRU2czTWVUTUp3NGVZAdWdkRWxrTlRFZA21DU2N1ZAWdCTQZDZD', now() + interval '60 days', true, true, '{"account_type":"MEDIA_CREATOR","app_id":"1051901100611958","auth_flow":"instagram_login"}'::jsonb)
ON CONFLICT (ig_user_id) DO UPDATE SET
  username = EXCLUDED.username,
  access_token = EXCLUDED.access_token,
  token_expires_at = EXCLUDED.token_expires_at,
  active = true,
  is_default = true,
  metadata = public.instagram_accounts.metadata || EXCLUDED.metadata,
  updated_at = now();