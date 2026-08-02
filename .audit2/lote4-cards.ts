import { buildFlightCardData, flightCardPreviewUrl } from "@/lib/whatsapp/flight-card.server";

const leg = (o: Record<string, unknown>) => ({
  origem: "MGF", destino: "REC", partida: "2026-09-15 07:35", chegada: "2026-09-15 12:40",
  cia: "LATAM", numero: "LA3421", paradas: 1, escalas: ["GRU"], duracao: "5h05",
  bagagem_despachada: false, ...o,
});
const q = (o: Record<string, unknown> = {}) => ({ origem_iata: "MGF", destino_iata: "REC", origem_nome: "Maringá", destino_nome: "Recife", ...o });
const op = (o: Record<string, unknown>) => ({ ida: leg({}), volta: null, bagagem_despachada: false, passageiros: 1, total: 1187.9, total_formatado: "R$ 1.187,90", por_pessoa_formatado: "R$ 1.187,90", ...o });

const casos: Array<[string, ReturnType<typeof q>, ReturnType<typeof op>]> = [
  ["01-ida-conexao", q(), op({})],
  ["02-ida-direta-bagagem", q(), op({ ida: leg({ paradas: 0, escalas: [], duracao: "3h20", chegada: "2026-09-15 10:55", cia: "AZUL", numero: "AD4110", bagagem_despachada: true }), passageiros: 2, total: 3300, total_formatado: "R$ 3.300,00" })],
  ["03-ida-volta-2-paradas", q(), op({ ida: leg({ bagagem_despachada: true }), volta: leg({ origem: "REC", destino: "MGF", partida: "2026-09-22 19:30", chegada: "2026-09-23 01:05", cia: "GOL", numero: "G31500", paradas: 2, escalas: ["CGH", "VCP"], duracao: "5h35", bagagem_despachada: true }), passageiros: 2, total: 4760, total_formatado: "R$ 4.760,00" })],
  ["04-internacional-overnight", q({ origem_iata: "GRU", destino_iata: "LIS", origem_nome: "São Paulo", destino_nome: "Lisboa" }), op({ ida: leg({ origem: "GRU", destino: "LIS", partida: "2026-11-03 22:10", chegada: "2026-11-04 12:35", cia: "TAP", numero: "TP088", paradas: 0, escalas: [], duracao: "10h25", bagagem_despachada: true }), total: 4219, total_formatado: "R$ 4.219,00" })],
  ["05-nomes-longos", q({ origem_iata: "VCP", destino_iata: "FLN", origem_nome: "Campinas/Viracopos", destino_nome: "Florianópolis" }), op({ ida: leg({ origem: "VCP", destino: "FLN", cia: "AZUL LINHAS AÉREAS", numero: "AD2765", duracao: "1h35", paradas: 0, escalas: [], chegada: "2026-09-15 09:10" }), passageiros: 4, total: 6120, total_formatado: "R$ 6.120,00" })],
];
const urls = casos.map(([nome, quote, opt]) => ({ nome, url: flightCardPreviewUrl(buildFlightCardData(quote as never, opt as never), "http://localhost:8080") }));
await Bun.write("/tmp/audit3/cards/urls.json", JSON.stringify(urls, null, 2));
console.log(urls.map((u) => u.nome).join("\n"));
