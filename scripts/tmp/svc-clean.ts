const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { data } = await supabaseAdmin.from("api_clients").select("id,name,client_code,environment,scopes,active");
console.log(JSON.stringify(data, null, 1));
