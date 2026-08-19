import { saveManualPromotion, buildManualCheckoutLink } from "../src/lib/airfare-promos.manual-entry.server";
const r = await saveManualPromotion({
  adults: 1, farePrice: 800, taxes: 120, cabinClass: null,
  legs: [
    { direction: "OUTBOUND", date: "2026-11-10", fromIata: "MGF", toIata: "GRU", airlineIata: "LA", departureTime: "08:00", arrivalTime: "09:20", stops: 0, checkedBaggage: true },
    { direction: "INBOUND", date: "2026-11-17", fromIata: "GRU", toIata: "MGF", airlineIata: "LA", departureTime: "20:00", arrivalTime: "21:20", stops: 0, checkedBaggage: true },
  ],
} as never);
console.log("saved", r);
const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
const { data } = await supabaseAdmin.from("airfare_promotions").select("*").eq("id", r.id).single();
console.log("installments", data.interest_free_installments, data.interest_free_installment_value, data.total_price);
const link = await buildManualCheckoutLink(data as never);
console.log(link);
await supabaseAdmin.from("airfare_promotions").delete().eq("id", r.id);
