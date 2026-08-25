import { chamarCompreFacil } from "@/lib/comprefacil/auth.server";
const id = 5771972;
const r = await chamarCompreFacil(`/api/Reserva/${id}/false`);
const o: any = r.dados ?? {};
const resumo = {
  status: r.status,
  Id: o?.Id, Status: o?.Status, StatusDesc: o?.StatusDesc,
  Pessoas: (o?.Pessoas ?? []).map((p: any) => ({ Id: p.Id, Nome: p.Nome, Sobrenome: p.Sobrenome, Nascimento: p.Nascimento, CPF: p.CPF, Documento: p.Documento, Tipo: p.Tipo, Sexo: p.Sexo, Quarto: p.Quarto, Erros: p.Erros })),
  Aereos: (o?.Aereos ?? []).map((a: any) => ({ Id: a.Id, Status: a.Status, StatusDesc: a.StatusDesc, Localizador: a.Localizador ?? a.LocalizadorAereo, DataLimiteEmissao: a.DataLimiteEmissao, keys: Object.keys(a).slice(0,60) })),
  Hoteis: (o?.Hoteis ?? []).map((h: any) => ({ Id: h.Id, Status: h.Status, StatusDesc: h.StatusDesc, Localizador: h.Localizador ?? h.LocalizadorHotel, keys: Object.keys(h).slice(0,60) })),
};
console.log(JSON.stringify(resumo, null, 2));
await Bun.write("/tmp/frt-5771972.json", JSON.stringify(o, null, 2));
