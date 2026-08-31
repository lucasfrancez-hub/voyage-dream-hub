import { passhubToken, passhubBases } from "../../src/lib/passhub/client.server";
const t = await passhubToken();
const base = { adults:1, children:0, babies:0, class_service:1, rav_percentage:0, is_passabot:false, reajustar:true, page:1, page_size:8 };
const body = { ...base, routes:[{iata_from:"GRU",iata_to:"MIA",date:"2026-10-10"},{iata_from:"MIA",iata_to:"JFK",date:"2026-10-15"},{iata_from:"JFK",iata_to:"GRU",date:"2026-10-20"}] };
const r = await fetch(`${passhubBases.multi}/api/v1/search`, {method:"POST",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json",Accept:"application/json","X-Correlation-Id":crypto.randomUUID()},body:JSON.stringify(body)});
console.log(r.status, (await r.text()).slice(0,2000));
