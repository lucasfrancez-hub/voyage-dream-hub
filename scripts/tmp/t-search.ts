import { searchFlights } from "../../src/lib/onertravel.server";
async function go(label: string, args: any) {
  const t0 = Date.now();
  try {
    const r = await searchFlights(args as never);
    console.log(label, "searchKey", (r.searchKey||"").slice(0,8), "total", r.outbound.totalFlightsCount, `${Date.now()-t0}ms`);
  } catch (e) { console.log(label, "ERRO", e instanceof Error ? e.message : e); }
}
await go("GRU-GIG", { departureIata:"GRU", arrivalIata:"GIG", departureDate:"2026-10-14", returnDate:null, adults:1, children:0, infants:0, pageSize:50, departureIsCity:false, arrivalIsCity:false, filters:{containsDispatchBaggage:false,maxStops:null,startPrice:null,endPrice:null,departureFrom:null,departureTo:null,airlineIatas:[],cabinClass:null} });
await go("SAO-RIO", { departureIata:"SAO", arrivalIata:"RIO", departureDate:"2026-10-14", returnDate:"2026-10-21", adults:1, children:0, infants:0, pageSize:50, departureIsCity:true, arrivalIsCity:true, filters:{containsDispatchBaggage:false,maxStops:null,startPrice:null,endPrice:null,departureFrom:null,departureTo:null,airlineIatas:[],cabinClass:null} });
