import { buscarPacotesCF } from "../../src/lib/comprefacil/busca.server";
const r = await buscarPacotesCF({ dataDe:"2026-10-10", dataAte:"2026-10-30", aoVivo:true });
console.log("total",r.total,"vivo",r.aoVivo, r.itens.map(i=>[i.nome.slice(0,40),i.cidade,i.valor_total]));
const r2 = await buscarPacotesCF({ termo:"caldas", aoVivo:true });
console.log("termo caldas",r2.total, r2.itens.slice(0,3).map(i=>i.nome.slice(0,40)));
