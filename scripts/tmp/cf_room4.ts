import { buscarHotelDinamicoCF } from "../../src/lib/comprefacil/dinamico.server";
const t = Date.now();
const h = await buscarHotelDinamicoCF({ cidadeId: 365, checkin: "2026-10-10", checkout: "2026-10-14", adultos: 2 });
console.log("hoteis", h.length, "em", ((Date.now()-t)/1000).toFixed(1)+"s");
for (const x of h.slice(0,4)) console.log(x.nome, "| quartos:", x.quartos.length, "|", x.quartos.slice(0,3).map(q=>`${q.nome} (${q.regime})`).join(" ; "));
