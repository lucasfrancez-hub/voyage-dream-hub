import { buscarHotelDinamicoCF } from "../../src/lib/comprefacil/dinamico.server";
const h = await buscarHotelDinamicoCF({ cidadeId: 365, checkin: "2026-10-10", checkout: "2026-10-14", adultos: 2 });
console.log(h.slice(0,12).map(x=>`${x.total} | ${x.quartos.length} | ${x.nome.slice(0,40)}`).join("\n"));
const set = new Set(h.map(x=>x.total)); console.log("totais distintos", set.size, "de", h.length);
