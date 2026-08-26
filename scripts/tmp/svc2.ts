import { chamarCompreFacil, COMPREFACIL_BASES, sessaoCompreFacil } from "@/lib/comprefacil/auth.server";
const ses = await sessaoCompreFacil();
const base = COMPREFACIL_BASES.servico;
const corpo = (guid: any) => ({ AgenciaId: Number(ses.agenciaId ?? 0), Guid: guid, PacoteId: 0, Adt: 2, IdadesChd: [], De: "2027-01-13", Ate: "2027-01-24", Cidade: { Id: 173 }, TipoServico: 0, ServicoExclusivo: false, BuscaEsim: false, EscreveLog: false, FiltroServico: { Ativo: null, Categoria: -1, TipoServico: "", Ordenacao: "", Tipo: "", Fornecedores: [] } });
const rota = "/api/Servico/busca?Pagina=1&ItensPorPagina=300";
const ini = await chamarCompreFacil(rota, { base, method: "POST", body: corpo(null) });
const guid = (ini.dados as any)?.MetaData?.Guid;
let dados: any = ini.dados;
for (let i = 0; i < 12; i++) { await new Promise((r)=>setTimeout(r,2500)); const r = await chamarCompreFacil(rota,{base,method:"POST",body:corpo(guid)}).catch(()=>null); const lote=(r?.dados as any)?.Items??[]; if(lote.length>=(dados?.Items??[]).length) dados=r?.dados; if(lote.length) break; }
const itens: any[] = dados?.Items ?? [];
const chaves = new Set<string>(); itens.forEach(i=>Object.keys(i).forEach(k=>chaves.add(k)));
console.log("chaves:", [...chaves].join(", "));
for (const s of itens.slice(0, 20)) console.log(String(s.Titulo).slice(0,45), "| VV", s.ValorVenda, "| Taxa", s.Taxa, "| Mult", s.Multiplica, "| Adt", s.Adt, "| Fornec", s.Fornecedor);
const taxas = new Map(); itens.forEach(s=>taxas.set(`${s.Fornecedor}:${s.Taxa}:${s.Multiplica}`,(taxas.get(`${s.Fornecedor}:${s.Taxa}:${s.Multiplica}`)??0)+1));
console.log([...taxas.entries()]);
