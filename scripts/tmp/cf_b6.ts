import { chamarCompreFacil, COMPREFACIL_BASES } from "../../src/lib/comprefacil/auth.server";
function body(over:any={}){return {
  AgenciaId:8408, Guid: crypto.randomUUID(), Nacionalidade:"BR",
  Checkin:"2026-10-10", Checkout:"2026-10-17",
  SomentePromocao:false, BuscaPacote:true, BuscaEvento:false, FiltrarEstrelasWebService:false,
  PacoteId:0, EventoId:0, EscreveLog:false,
  Cidade:{ Id:377, Nome:"São Paulo", Estado:{}, CidadeVinculada:{Nome:""} },
  CidadeOrigem:{ Nome:"", Estado:{}, CidadeVinculada:{Nome:""} },
  CidadeDestino:{ Nome:"", Estado:{}, CidadeVinculada:{Nome:""} },
  FiltroHotel:{ EstrelasMinimo:0, EstrelasMaximo:5, Fornecedores:[], Reembolsavel:-1, Pensao:[], Pensoes:[], Ordenacao:"" },
  Quartos:[{ NumeroPesquisa:1, Qtde:1, Adultos:2, Criancas:[] }],
  ...over }; }
for (const [rot,b] of [["completo",body()],["sem filtro",body({FiltroHotel:null})]] as any) {
  const r = await chamarCompreFacil("/api/pacote/busca/", { method:"POST", body:b, base: COMPREFACIL_BASES.hotel } as any);
  const d:any=r.dados;
  console.log("==",rot,r.ok, typeof d, Array.isArray(d)?d.length:JSON.stringify(d).slice(0,500));
  if(Array.isArray(d)&&d[0]) console.log("keys",Object.keys(d[0]).slice(0,30));
}
