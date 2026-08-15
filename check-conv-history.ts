import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const convId = "d231813f-021f-415e-bcb7-f31ee35dba76";
  const since = "2026-08-15T01:00:00Z";
  
  console.log(`History for conversation ${convId} since 01:00...`);
  
  const { data: events } = await supabaseAdmin
    .from("wa_protocol_events")
    .select("*")
    .eq("conversation_id", convId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  events?.forEach(e => {
    console.log(`[${e.created_at}] EVENT: ${e.event} | Payload: ${JSON.stringify(e.payload)}`);
  });

  console.log("\nMessages:");
  const { data: messages } = await supabaseAdmin
    .from("wa_messages")
    .select("*")
    .eq("conversation_id", convId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
    
  messages?.forEach(m => {
    console.log(`[${m.created_at}] ${m.direction.toUpperCase()} (${m.sender}): ${m.content.slice(0, 100)}`);
  });

  console.log("\nHandoff Events:");
  const { data: handoffs } = await supabaseAdmin
    .from("wa_handoff_events")
    .select("*")
    .eq("conversation_id", convId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  handoffs?.forEach(h => {
    console.log(`[${h.created_at}] HANDOFF: ${h.from_mode} -> ${h.to_mode} | Reason: ${h.reason}`);
  });
}

run().catch(console.error);
