import { searchFlights } from "@/lib/onertravel.server";
const r:any = await searchFlights({departureIata:"GRU",arrivalIata:"GIG",departureDate:"2026-10-14",returnDate:null,adults:1,children:0,infants:0,pageSize:50,departureIsCity:false,arrivalIsCity:false,filters:{containsDispatchBaggage:true,maxStops:2,startPrice:null,endPrice:null,departureFrom:null,departureTo:null,airlineIatas:[],cabinClass:null}} as never,"normal");
const fl=r.outbound.flights;
console.log("itinerarios",fl.length);
const dist:Record<number,number>={};
for(const f of fl){const n=(f.fareOptions??[]).length;dist[n]=(dist[n]??0)+1;}
console.log("distribuicao de tarifas por itinerario",dist);
const ex=fl.find((f:any)=>(f.fareOptions??[]).length>1)??fl[0];
console.log(JSON.stringify({voo:ex.journey?.segments?.[0]?.flightNumber,total:ex.price.total,fares:(ex.fareOptions??[]).map((o:any)=>({fam:o.fareFamily,cab:o.cabinClass,total:o.total,allowed:o.allowedBaggage,bags:o.baggagesAllowance}))},null,1).slice(0,3000));
const comBag=fl.filter((f:any)=>(f.fareOptions??[]).some((o:any)=>o.allowedBaggage||(o.baggagesAllowance??[]).some((b:any)=>/despach|dispatch|checked/i.test(b.typeDescription??"")&&(b.quantity??0)>0)));
console.log("itinerarios com alguma tarifa despachada:",comBag.length);
