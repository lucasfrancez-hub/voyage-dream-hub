import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const convId = "d231813f-021f-415e-bcb7-f31ee35dba76";
  const start = "2026-08-15T01:26:00Z";
  const end = "2026-08-15T02:00:00Z";

  console.log("Checking history of ai_paused and tags for conversation...");
  
  // Checking audit logs if they exist, but let's look at wa_protocol_events first
  const { data: events } = await supabaseAdmin
    .from("wa_protocol_events")
    .select("*")
    .eq("conversation_id", convId)
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: true });

  events?.forEach(e => {
    console.log(`[${e.created_at}] EVENT: ${e.event}`);
  });

  // Check if we can find any message or log that indicates unpausing
  // In this project, does human intervention unpause?
}
run();
