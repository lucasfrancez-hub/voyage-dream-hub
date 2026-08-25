import { removerItemFRT, consultarReservaFRT } from "../../src/lib/comprefacil/cancelamento.server";
const ORC = 5771972;
console.log("antes", (await consultarReservaFRT(ORC)).itens);
const hotel = (await consultarReservaFRT(ORC)).itens.find((i) => i.tipo === "hotel");
if (hotel) console.log(await removerItemFRT({ orcamentoId: ORC, item: { tipo: "hotel", id: hotel.id } }));
