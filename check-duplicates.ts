import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const since = "2026-08-15T00:00:00Z";
  
  console.log("Searching for conversations with multiple instability messages...");
  
  const { data: messages } = await supabaseAdmin
    .from("wa_messages")
    .select("conversation_id, content, created_at")
    .gte("created_at", since)
    .ilike("content", "%instabilidade durante essa pesquisa%");

  if (!messages) return;

  const counts: Record<string, number> = {};
  messages.forEach(m => {
    counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
  });

  const duplicates = Object.entries(counts).filter(([_, count]) => count > 1);
  
  if (duplicates.length === 0) {
    console.log("No duplicate instability messages found in any conversation since 00:00 UTC.");
  } else {
    console.log(`Found ${duplicates.length} conversations with duplicates:`);
    for (const [convId, count] of duplicates) {
      console.log(`Conversation ${convId}: ${count} messages`);
      const convMsgs = messages.filter(m => m.conversation_id === convId);
      convMsgs.forEach(m => console.log(`  - ${m.created_at}: ${m.content.slice(0, 50)}...`));
    }
  }

  console.log("\nChecking for transferencia_instabilidade events...");
  const { data: events } = await supabaseAdmin
    .from("wa_protocol_events")
    .select("conversation_id, created_at, payload")
    .gte("created_at", since)
    .eq("event", "transferencia_instabilidade");

  const eventCounts: Record<string, number> = {};
  events?.forEach(e => {
    eventCounts[e.conversation_id] = (eventCounts[e.conversation_id] || 0) + 1;
  });

  const duplicateEvents = Object.entries(eventCounts).filter(([_, count]) => count > 1);
  if (duplicateEvents.length > 0) {
     console.log(`Found ${duplicateEvents.length} conversations with duplicate events:`);
     for (const [convId, count] of duplicateEvents) {
       console.log(`Conversation ${convId}: ${count} events`);
     }
  } else {
    console.log("No duplicate transferencia_instabilidade events found.");
  }
}

run().catch(console.error);
