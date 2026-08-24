import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";
const body:any={
  Checkin:"2026-10-10", Checkout:"2026-10-17",
  SomentePromocao:false, BuscaPacote:true, BuscaEvento:false, FiltrarEstrelasWebService:false,
  PacoteId:0, EventoId:0, EscreveLog:false,
  Cidade:{ Id:377, Nome:"São Paulo", Estado:{}, CidadeVinculada:{Nome:""} },
  CidadeOrigem:{ Nome:"", Estado:{}, CidadeVinculada:{Nome:""} },
  CidadeDestino:{ Nome:"", Estado:{}, CidadeVinculada:{Nome:""} },
  FiltroHotel:{ EstrelasMinimo:0, EstrelasMaximo:5, Fornecedores:[], Reembolsavel:-1, Pensao:[], Pensoes:[], Ordenacao:"" },
  Quartos:[{ qtdeAdultos:2, qtdeCriancas:0, qtdeIdosos:0, idadesAdultos:[18,18], idadesCriancas:[] }],
};
for (const base of [COMPREFACIL_BASES.hotel, COMPREFACIL_BASES.principal]) {
  const r = await chamarCompreFacil("/api/pacote/busca/", { method:"POST", body, base } as any);
  const d:any=r.dados;
  console.log("==",base,r.ok, JSON.stringify(d).slice(0,600));
}
