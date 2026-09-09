const { supabaseAdmin: db } = await import("../../src/integrations/supabase/client.server");
const { data } = await db.from("integration_events").select("created_at,event_type,message").order("created_at",{ascending:false}).limit(15);
console.log(data);
const { data: o } = await db.from("oner_otp_requests").select("id,status,requested_at,received_at,source,message_id").order("requested_at",{ascending:false}).limit(5);
console.log(o);
