import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const start = "2026-08-15T01:57:00Z";
  const end = "2026-08-15T02:01:00Z";

  console.log(`Checking wa_protocol_events from ${start} to ${end}...`);
  const { data: events, error: eventErr } = await supabaseAdmin
    .from("wa_protocol_events")
    .select("*")
    .gte("created_at", start)
    .lte("created_at", end)
    .eq("event", "transferencia_instabilidade");

  if (eventErr) {
    console.error("Error fetching events:", eventErr);
  } else {
    console.log(`Found ${events?.length || 0} transferencia_instabilidade events.`);
    events?.forEach(e => {
      console.log(`Event ID: ${e.id}, Conv: ${e.conversation_id}, Proto: ${e.protocolo_id}, At: ${e.created_at}, Payload: ${JSON.stringify(e.payload)}`);
    });
  }

  console.log(`\nChecking wa_messages for instability text...`);
  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("wa_messages")
    .select("id, conversation_id, content, created_at")
    .gte("created_at", start)
    .lte("created_at", end)
    .ilike("content", "%instabilidade%");

  if (msgErr) {
    console.error("Error fetching messages:", msgErr);
  } else {
    console.log(`Found ${messages?.length || 0} messages containing "instabilidade".`);
    messages?.forEach(m => {
      console.log(`Message ID: ${m.id}, Conv: ${m.conversation_id}, At: ${m.created_at}, Content: ${m.content}`);
    });
  }
}

run().catch(console.error);
