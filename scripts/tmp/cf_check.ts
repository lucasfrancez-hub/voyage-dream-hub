import { cidadesOficiaisCF, semAcento } from "../../src/lib/comprefacil/localidades.server";
import { buscarDestinosCF } from "../../src/lib/comprefacil/destinos.server";

const termos = ["recife", "fortaleza", "maceio"];
const oficiais = await cidadesOficiaisCF();
console.log("total oficiais:", oficiais.length);
for (const t of termos) {
  const hits = oficiais.filter(c => semAcento(c.nome).includes(t) || semAcento(c.descricao).includes(t));
  console.log(t, "oficiais hits:", hits.length, JSON.stringify(hits.slice(0,5)));
}
for (const t of termos) {
  try {
    const d = await buscarDestinosCF(t, 8);
    console.log(t, "destino/autocomplete hits:", d.length, JSON.stringify(d.slice(0,5)));
  } catch (e) { console.log(t, "erro", e); }
}
