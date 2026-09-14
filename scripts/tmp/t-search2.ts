import { searchFlights, searchAirports } from "../../src/lib/onertravel.server";
for (const c of ["SAO","RIO","GRU","GIG"]) {
  const l = await searchAirports({ query: c, isDeparture: true });
  console.log(c, "isCity=", l.find(a=>a.iata===c)?.isCity);
}
const r = await searchFlights({ departureIata:"SAO", arrivalIata:"RIO", departureDate:"2026-10-14", returnDate:"2026-10-21", adults:1, children:0, infants:0, pageSize:50, departureIsCity:false, arrivalIsCity:false, filters:{containsDispatchBaggage:false,maxStops:null,startPrice:null,endPrice:null,departureFrom:null,departureTo:null,airlineIatas:[],cabinClass:null} } as never).catch(e=>({err:String(e)} as any));
console.log("SAO-RIO como aeroporto:", (r as any).err ?? (r as any).outbound.totalFlightsCount);
