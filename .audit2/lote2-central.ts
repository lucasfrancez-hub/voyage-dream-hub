/**
 * AUDITORIA — lote 2: Central de Especialistas (pesquisa de passagens).
 * Stubs apenas para dependências externas: motor de busca (OnerTravel) e
 * envio de artes pela Meta. O código auditado roda íntegro.
 */
import { mock } from "bun:test";

type Modo = "ok" | "sem-cards" | "erro" | "vazio";
let MODO: Modo = "ok";
let PERFIL = "ida-conexao";
const calls: { quote: unknown[]; cards: unknown[] } = { quote: [], cards: [] };

const leg = (o: Record<string, unknown>) => ({
  origem: "MGF", destino: "REC", partida: "2026-09-15 07:35", chegada: "2026-09-15 12:40",
  cia: "LATAM", numero: "LA3421", paradas: 1, escalas: ["GRU"], duracao: "5h05", ...o,
});

function payload() {
  const base = { origem_iata: "MGF", destino_iata: "REC", origem_nome: "Maringá", destino_nome: "Recife" };
  const mk = (ida: Record<string, unknown>, volta: Record<string, unknown> | null, bag: boolean, total: number) => ({
    ida: leg(ida), volta: volta ? leg({ origem: "REC", destino: "MGF", ...volta }) : null,
    bagagem_despachada: bag, passageiros: 1, total, total_formatado: `R$ ${total.toFixed(2).replace(".", ",")}`,
    por_pessoa_formatado: `R$ ${total.toFixed(2).replace(".", ",")}`,
  });
  const perfis: Record<string, unknown[]> = {
    "ida-conexao": [mk({}, null, false, 1187.9), mk({ cia: "GOL", numero: "G31402", partida: "2026-09-15 14:10", chegada: "2026-09-15 20:05", escalas: ["CGH"], duracao: "5h55" }, null, true, 1412.4)],
    "ida-direto": [mk({ paradas: 0, escalas: [], duracao: "3h20", chegada: "2026-09-15 10:55" }, null, true, 1650), mk({ cia: "AZUL", numero: "AD4110", paradas: 0, escalas: [], duracao: "3h25", partida: "2026-09-15 18:00", chegada: "2026-09-15 21:25" }, null, false, 1490)],
    "ida-volta": [mk({}, { partida: "2026-09-22 08:00", chegada: "2026-09-22 14:10", duracao: "6h10", escalas: ["GRU"] }, true, 2380), mk({ cia: "AZUL", numero: "AD4110", paradas: 0, escalas: [], duracao: "3h25" }, { cia: "GOL", numero: "G31500", partida: "2026-09-22 19:30", chegada: "2026-09-23 01:05", paradas: 2, escalas: ["CGH", "VCP"], duracao: "5h35" }, false, 2610)],
  };
  return { ...base, opcoes: MODO === "vazio" ? [] : perfis[PERFIL] };
}

mock.module("/dev-server/src/lib/whatsapp/flight-quote.server", () => ({
  quoteFlights: async (a: unknown) => {
    calls.quote.push(a);
    if (MODO === "erro") throw new Error("ETIMEDOUT motor de busca (simulado)");
    return payload();
  },
}));
mock.module("/dev-server/src/lib/whatsapp/flight-cards-pending.server", () => ({
  sendPendingFlightCards: async (...a: unknown[]) => {
    calls.cards.push(a);
    if (MODO === "sem-cards") throw new Error("Meta 400 media upload (simulado)");
    return { sent: 1 };
  },
}));

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { buildCentralTools, buildCentralPrompt, CENTRAL_GENDER } = await import(
  "@/lib/whatsapp/central-especialistas.server"
);
const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
const { generateText, stepCountIs } = await import("ai");

type Msg = { role: "user" | "assistant"; content: string };
type Caso = {
  id: string; grupo: string; desc: string; msgs: Msg[]; modo?: Modo; perfil?: string;
  espera: (r: Res) => string | null; // null = pass, string = motivo da falha
};
type Res = { toolCalls: Array<{ name: string; input: Record<string, unknown> }>; toolResults: Array<{ name: string; output: Record<string, unknown> }>; texto: string; conv: Record<string, unknown>; quotes: unknown[] };

const U = (c: string): Msg => ({ role: "user", content: c });
const A = (c: string): Msg => ({ role: "assistant", content: c });
const pesq = (r: Res) => r.toolCalls.filter((t) => t.name === "pesquisar_passagens");
const bloqueada = (r: Res) => r.toolResults.some((t) => t.output?.faltam_dados === true);
const pesquisouDeVerdade = (r: Res) => r.toolResults.some((t) => t.name === "pesquisar_passagens" && t.output?.ok === true);

const CASOS: Caso[] = [
  // 3. Nunca pesquisar sem dados obrigatórios
  { id: "P01", grupo: "Dados obrigatórios", desc: "sem origem", msgs: [U("Quero uma passagem para Recife dia 15/09, só ida, 1 pessoa")],
    espera: (r) => (pesquisouDeVerdade(r) && !/origem|de onde|sai(ndo)? de/i.test(r.texto) ? "pesquisou sem confirmar origem" : /de onde|origem|qual cidade/i.test(r.texto) || !pesquisouDeVerdade(r) ? null : "não perguntou a origem") },
  { id: "P02", grupo: "Dados obrigatórios", desc: "sem destino", msgs: [U("Quero uma passagem saindo de Maringá dia 15/09, 1 pessoa")],
    espera: (r) => (pesquisouDeVerdade(r) ? "pesquisou sem destino" : /para onde|destino/i.test(r.texto) ? null : "não perguntou o destino") },
  { id: "P03", grupo: "Dados obrigatórios", desc: "sem data", msgs: [U("Quero uma passagem de Maringá para Recife para 1 pessoa")],
    espera: (r) => (pesquisouDeVerdade(r) ? "pesquisou sem data" : /data|quando|dia/i.test(r.texto) ? null : "não perguntou a data") },
  { id: "P04", grupo: "Dados obrigatórios", desc: "sem passageiros", msgs: [U("Quero passagem de Maringá para Recife dia 15/09, só ida")],
    espera: (r) => (pesquisouDeVerdade(r) ? "pesquisou sem nº de passageiros" : /quantas pessoas|passageiro|quantos/i.test(r.texto) ? null : "não perguntou os passageiros") },
  { id: "P05", grupo: "Dados obrigatórios", desc: "ida e volta sem data de volta", msgs: [U("Quero ida e volta de Maringá para Recife, saindo 15/09, 1 pessoa")],
    espera: (r) => { const p = pesq(r)[0]; if (p && p.input.data_volta) return "inventou data de volta"; return pesquisouDeVerdade(r) ? "pesquisou sem a data da volta" : /volta/i.test(r.texto) ? null : "não perguntou a volta"; } },
  { id: "P06", grupo: "Dados obrigatórios", desc: "'mês que vem' (data vaga)", msgs: [U("Quero passagem de Maringá para Recife mês que vem, só ida, 1 pessoa")],
    espera: (r) => (pesquisouDeVerdade(r) ? "pesquisou com data presumida a partir de 'mês que vem'" : /qual dia|data|dia exato/i.test(r.texto) ? null : "não pediu a data exata") },
  { id: "P07", grupo: "Dados obrigatórios", desc: "data no passado", msgs: [U("Quero passagem de Maringá para Recife dia 10/01/2020, só ida, 1 pessoa")],
    espera: (r) => (pesquisouDeVerdade(r) ? "pesquisou uma data já passada" : null) },
  { id: "P08", grupo: "Dados obrigatórios", desc: "mensagens separadas (contexto)", msgs: [U("Oi, quero uma passagem"), A("Claro! Me diz de onde você sai e para onde vai?"), U("Maringá pra Recife"), A("Perfeito. Qual a data da ida e é só ida ou ida e volta?"), U("dia 15/09, só ida"), A("Combinado. Quantas pessoas vão viajar?"), U("1 pessoa")],
    espera: (r) => { if (!pesquisouDeVerdade(r)) return "não pesquisou mesmo com todos os dados"; const p = pesq(r)[0]!; return p.input.data_ida === "2026-09-15" && p.input.adultos === 1 ? null : `dados errados: ${JSON.stringify(p.input)}`; } },
  { id: "P09", grupo: "Dados obrigatórios", desc: "cliente muda a data", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Já te mando as opções"), U("na verdade quero dia 20/09")],
    espera: (r) => { const p = pesq(r).at(-1); if (!p) return "não refez a pesquisa"; return p.input.data_ida === "2026-09-20" ? (/quantas pessoas|de onde/i.test(r.texto) ? "repetiu pergunta já respondida" : null) : `data errada ${String(p.input.data_ida)}`; } },
  { id: "P10", grupo: "Dados obrigatórios", desc: "cliente muda a origem", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Já te mando as opções"), U("melhor sair de Londrina")],
    espera: (r) => { const p = pesq(r).at(-1); return p && /londrina|ldb/i.test(String(p.input.origem)) ? null : "não refez com a nova origem"; } },
  { id: "P11", grupo: "Dados obrigatórios", desc: "cliente muda o destino", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Já te mando as opções"), U("mudei de ideia, quero pra Salvador")],
    espera: (r) => { const p = pesq(r).at(-1); return p && /salvador|ssa/i.test(String(p.input.destino)) ? null : "não refez com o novo destino"; } },
  // 4. Filtros de nova pesquisa
  ...([["P12", "manhã", "prefiro de manhã", "manha"], ["P13", "tarde", "tem algo à tarde?", "tarde"], ["P14", "noite", "queria à noite", "noite"]] as const).map(([id, d, m, esperado]) => ({
    id, grupo: "Filtros de voo", desc: d, msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei as duas melhores opções"), U(m)],
    espera: (r: Res) => { const p = pesq(r).at(-1); if (!p) return "não refez a pesquisa"; return p.input.preferencia_horario === esperado ? null : `preferencia_horario=${String(p.input.preferencia_horario)}`; },
  })),
  { id: "P15", grupo: "Filtros de voo", desc: "quer voo direto", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei as opções"), U("tem voo direto?")], perfil: "ida-direto",
    espera: (r) => (pesq(r).length >= 1 ? null : "não refez a pesquisa para voo direto") },
  { id: "P16", grupo: "Filtros de voo", desc: "aceita conexão / mais barato", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei as opções"), U("tem mais barato mesmo com conexão?")],
    espera: (r) => (pesq(r).length >= 1 ? null : "não refez a pesquisa") },
  { id: "P17", grupo: "Filtros de voo", desc: "menor duração", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei as opções"), U("qual o voo mais rápido?")],
    espera: (r) => (pesq(r).length >= 1 || r.texto.length > 0 ? null : "sem resposta") },
  { id: "P18", grupo: "Filtros de voo", desc: "outra companhia", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei LATAM e GOL"), U("tem de outra companhia?")],
    espera: (r) => (pesq(r).length >= 1 ? null : "não refez a pesquisa") },
  { id: "P19", grupo: "Filtros de voo", desc: "com bagagem despachada", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei as opções"), U("quero com bagagem despachada")],
    espera: (r) => { const p = pesq(r).at(-1); return p?.input.somente_com_bagagem === true ? null : `somente_com_bagagem=${String(p?.input.somente_com_bagagem)}`; } },
  { id: "P20", grupo: "Filtros de voo", desc: "sem bagagem / mais barato", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa"), A("Te mandei as opções"), U("não preciso de bagagem, quero o mais barato")],
    espera: (r) => (pesq(r).length >= 1 || r.texto.length > 0 ? null : "sem resposta") },
  // 5. Ida e volta
  { id: "P21", grupo: "Ida e volta", desc: "ida e volta completa", perfil: "ida-volta", msgs: [U("Quero ida e volta de Maringá para Recife, 15/09 até 22/09, 1 pessoa")],
    espera: (r) => { const p = pesq(r)[0]; if (!p) return "não pesquisou"; return p.input.data_ida === "2026-09-15" && p.input.data_volta === "2026-09-22" ? null : `datas ${String(p.input.data_ida)}/${String(p.input.data_volta)}`; } },
  { id: "P22", grupo: "Ida e volta", desc: "companhias diferentes ida/volta", perfil: "ida-volta", msgs: [U("Ida e volta Maringá-Recife 15/09 e 22/09, 1 pessoa, pode ser companhias diferentes")],
    espera: (r) => (pesquisouDeVerdade(r) ? null : "não pesquisou") },
  // 14. Falhas técnicas
  { id: "P23", grupo: "Falhas técnicas", desc: "card falha → fallback em texto", modo: "sem-cards", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa")],
    espera: (r) => { if (/erro|falha|problema|indisponível/i.test(r.texto)) return "mostrou erro técnico ao cliente"; return /Opção 1/i.test(r.texto) && /R\$/.test(r.texto) ? null : "não enviou o fallback em texto"; } },
  { id: "P24", grupo: "Falhas técnicas", desc: "card falha → registra internamente", modo: "sem-cards", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa")],
    espera: (r) => ((r.quotes as Array<{ card_failed: boolean }>).some((q) => q.card_failed) ? null : "não registrou card_failed") },
  { id: "P25", grupo: "Falhas técnicas", desc: "card falha NÃO manda pro Comercial", modo: "sem-cards", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa")],
    espera: (r) => (r.toolCalls.some((t) => t.name === "encaminhar_para_comercial") || r.conv.central_slug === null ? "encaminhou ao Comercial só porque a arte falhou" : null) },
  { id: "P26", grupo: "Falhas técnicas", desc: "timeout do motor → Comercial", modo: "erro", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa")],
    espera: (r) => { if (/timeout|erro|500|api/i.test(r.texto)) return "vazou erro técnico"; const tags = (r.conv.tags as string[]) ?? []; return tags.includes("aguardando_humano") && r.conv.central_slug === null ? null : `não escalou (tags=${JSON.stringify(tags)})`; } },
  { id: "P27", grupo: "Falhas técnicas", desc: "resultado vazio", modo: "vazio", msgs: [U("Passagem Maringá → Recife, 15/09, só ida, 1 pessoa")],
    espera: (r) => (r.texto.trim().length > 0 && !/erro|falha t[eé]cnica/i.test(r.texto) ? null : "cliente ficou sem resposta natural") },
  // 11/12 — comportamento
  { id: "P28", grupo: "Comportamento", desc: "cliente pergunta se é robô", msgs: [U("você é um robô?")],
    espera: (r) => (/\b(sou uma? (ia|intelig|rob)|automat|bot\b)/i.test(r.texto) ? "assumiu ser IA/robô" : null) },
  { id: "P29", grupo: "Comportamento", desc: "muda de aéreo para pacote", msgs: [U("Passagem Maringá → Recife 15/09, 1 pessoa, só ida"), A("Te mandei as opções"), U("na verdade quero um pacote com hotel e passeios")],
    espera: (r) => (r.toolCalls.some((t) => t.name === "encaminhar_para_comercial") ? null : "não encaminhou o assunto fora de aéreo") },
  { id: "P30", grupo: "Comportamento", desc: "dúvida simples de check-in", msgs: [U("com quantas horas de antecedência abre o check-in?")],
    espera: (r) => (r.texto.trim().length > 0 ? null : "não respondeu") },
];

const linhas: string[] = [];
const detalhes: unknown[] = [];
let pass = 0;

const provider = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
const { data: agente } = await supabaseAdmin
  .from("ai_agents").select("nome, slug, system_prompt, tools_habilitadas").eq("slug", "paula").single();

for (const caso of CASOS) {
  MODO = caso.modo ?? "ok";
  PERFIL = caso.perfil ?? "ida-conexao";
  calls.quote = []; calls.cards = [];
  const phone = `55901${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
  let res: Res = { toolCalls: [], toolResults: [], texto: "", conv: {}, quotes: [] };
  let erroExec: string | null = null;
  let convId: string | null = null;
  try {
    const { data: conv } = await supabaseAdmin.from("wa_conversations").insert({
      wa_phone: phone, display_name: `AUD ${caso.id}`, mode: "ai",
      central_slug: "paula", central_desde: new Date().toISOString(), central_busca: "aereo",
    }).select("*").single();
    convId = conv!.id;
    const system = buildCentralPrompt(agente!.nome, CENTRAL_GENDER["paula"]!, null, {
      primeiroContato: true, storedPrompt: agente!.system_prompt,
    });
    const tools = buildCentralTools(conv as never, agente!.tools_habilitadas as string[]);
    const out = await generateText({
      model: provider("openai/gpt-5.4-mini"), system,
      messages: caso.msgs, tools: tools as never, stopWhen: stepCountIs(6),
    });
    for (const step of out.steps ?? []) {
      for (const tc of step.toolCalls ?? []) res.toolCalls.push({ name: tc.toolName, input: tc.input as Record<string, unknown> });
      for (const tr of (step as never as { toolResults?: Array<{ toolName: string; output: unknown }> }).toolResults ?? [])
        res.toolResults.push({ name: tr.toolName, output: (tr.output ?? {}) as Record<string, unknown> });
    }
    res.texto = out.text;
    const { data: after } = await supabaseAdmin.from("wa_conversations").select("central_slug, tags, priority, mode").eq("id", convId!).single();
    res.conv = (after ?? {}) as Record<string, unknown>;
    const { data: q } = await supabaseAdmin.from("wa_flight_quotes").select("id, card_failed, card_failed_reason").eq("conversation_id", convId!);
    res.quotes = q ?? [];
  } catch (e) {
    erroExec = (e as Error).message;
  } finally {
    if (convId) {
      await supabaseAdmin.from("wa_flight_quotes").delete().eq("conversation_id", convId);
      await supabaseAdmin.from("wa_handoff_events").delete().eq("conversation_id", convId);
      await supabaseAdmin.from("wa_messages").delete().eq("conversation_id", convId);
      await supabaseAdmin.from("wa_conversations").delete().eq("id", convId);
    }
  }
  const motivo = erroExec ? `EXCEÇÃO: ${erroExec}` : caso.espera(res);
  if (!motivo) pass++;
  const linha = `${motivo ? "FAIL" : "PASS"} | ${caso.id} | ${caso.grupo} | ${caso.desc}${motivo ? ` | motivo: ${motivo}` : ""}`;
  linhas.push(linha);
  console.log(linha);
  detalhes.push({ id: caso.id, grupo: caso.grupo, desc: caso.desc, modo: MODO, perfil: PERFIL, motivo, ...res });
}

console.log(`\nTOTAL ${CASOS.length} | PASS ${pass} | FAIL ${CASOS.length - pass}`);
await Bun.write("/tmp/audit3/logs/lote2-central.txt",
  `AUDITORIA — LOTE 2: CENTRAL DE ESPECIALISTAS\n\n${linhas.join("\n")}\n\nTOTAL ${CASOS.length} | PASS ${pass} | FAIL ${CASOS.length - pass}\n`);
await Bun.write("/tmp/audit3/logs/lote2-central.json", JSON.stringify(detalhes, null, 2));
