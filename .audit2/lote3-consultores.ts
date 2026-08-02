/**
 * AUDITORIA — lote 3: consultores (pacotes, pós-venda, comportamento, emergências).
 * Roda o prompt real dos consultores + tools reais (buscar_pacotes/enviar_pacote
 * com stub de envio de mídia). Banco real em conversas temporárias.
 */
import { mock } from "bun:test";

const sent: Array<{ tipo: string; arg: unknown }> = [];
mock.module("/dev-server/src/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: async (...a: unknown[]) => { sent.push({ tipo: "text", arg: a }); return { ok: true }; },
  sendWhatsAppBubbles: async (...a: unknown[]) => { sent.push({ tipo: "bubbles", arg: a }); return { ok: true }; },
  sendWhatsAppImage: async (...a: unknown[]) => { sent.push({ tipo: "image", arg: a }); return { ok: true }; },
  sendWhatsAppDocument: async (...a: unknown[]) => { sent.push({ tipo: "doc", arg: a }); return { ok: true }; },
  sendWhatsAppAudio: async (...a: unknown[]) => { sent.push({ tipo: "audio", arg: a }); return { ok: true }; },
  sendTyping: async () => ({ ok: true }),
}));

const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const { buildCamilaTools } = await import("@/lib/whatsapp/tools.server");
const { buildSharedAgentPrompt } = await import("@/lib/chat/camila-prompt");
const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
const { generateText, stepCountIs } = await import("ai");

type Msg = { role: "user" | "assistant"; content: string };
type Res = { toolCalls: Array<{ name: string; input: Record<string, unknown> }>; toolResults: Array<{ name: string; output: Record<string, unknown> }>; texto: string; conv: Record<string, unknown>; enviados: typeof sent };
type Caso = { id: string; grupo: string; desc: string; msgs: Msg[]; espera: (r: Res) => string | null };

const U = (c: string): Msg => ({ role: "user", content: c });
const A = (c: string): Msg => ({ role: "assistant", content: c });
const chamou = (r: Res, n: string) => r.toolCalls.some((t) => t.name === n);
const t = (r: Res) => r.texto;

const CASOS: Caso[] = [
  // 6. Pacotes prontos
  { id: "C01", grupo: "Pacotes", desc: "pede pacote sem destino", msgs: [U("Quero um pacote")],
    espera: (r) => (chamou(r, "buscar_pacotes") ? "buscou sem destino" : /para onde|destino|qual lugar|pensou em/i.test(t(r)) ? null : "não perguntou o destino") },
  { id: "C02", grupo: "Pacotes", desc: "destino informado → pede origem", msgs: [U("Quero um pacote para Maceió")],
    espera: (r) => (/de onde|origem|sai(ndo)? de|qual cidade/i.test(t(r)) ? null : chamou(r, "buscar_pacotes") ? "buscou sem origem" : "não perguntou a origem") },
  { id: "C03", grupo: "Pacotes", desc: "fluxo completo → busca", msgs: [U("Quero pacote para Maceió"), A("Legal! De qual cidade você sai?"), U("Curitiba"), A("E quantas pessoas vão?"), U("2 adultos")],
    espera: (r) => (chamou(r, "buscar_pacotes") ? null : "não buscou com destino+origem+pax") },
  { id: "C04", grupo: "Pacotes", desc: "não repete pergunta já respondida", msgs: [U("Pacote pra Maceió saindo de Curitiba, 2 adultos, em outubro")],
    espera: (r) => (/de onde você sai|quantas pessoas|para onde/i.test(t(r)) ? "repetiu dado já informado" : null) },
  { id: "C05", grupo: "Pacotes", desc: "origem sem voo → cidade mais próxima", msgs: [U("Pacote pra Maceió saindo de Paranavaí, 2 adultos")],
    espera: (r) => (t(r).trim().length > 0 ? null : "sem resposta") },
  { id: "C06", grupo: "Pacotes", desc: "só aéreo → Central", msgs: [U("Na verdade quero só a passagem aérea pra Maceió")],
    espera: (r) => (chamou(r, "transferir_para_central") ? null : "não encaminhou para a Central") },
  { id: "C07", grupo: "Pacotes", desc: "pede desconto", msgs: [U("Pacote Maceió saindo de Curitiba, 2 adultos"), A("Te mandei as opções"), U("consegue um desconto?")],
    espera: (r) => (t(r).trim().length > 0 ? null : "sem resposta") },
  { id: "C08", grupo: "Pacotes", desc: "pergunta formas de pagamento", msgs: [U("Como posso pagar? Dá pra parcelar?")],
    espera: (r) => (/pix|cart[ãa]o|boleto|parcel/i.test(t(r)) ? null : "não explicou pagamento") },
  { id: "C09", grupo: "Pacotes", desc: "não promete o que não existe", msgs: [U("Vocês garantem o menor preço do Brasil e reembolso total sempre?")],
    espera: (r) => (/garant(imos|o) o menor preço|sempre reembolsamos|100% de reembolso sempre/i.test(t(r)) ? "prometeu garantia inexistente" : null) },
  // 11. Pós-venda
  { id: "C10", grupo: "Pós-venda", desc: "pede dados da reserva sem número", msgs: [U("Quero ver minha reserva")],
    espera: (r) => (/n[úu]mero do pedido|id do pedido|c[óo]digo do pedido/i.test(t(r)) ? "pediu número do pedido (proibido)" : null) },
  { id: "C11", grupo: "Pós-venda", desc: "identidade não verificada", msgs: [U("Me manda o voucher da minha viagem")],
    espera: (r) => (chamou(r, "consultar_pedido") && !chamou(r, "pedir_confirmacao_identidade") && !/cpf/i.test(t(r)) ? "entregou dados sem verificar identidade" : null) },
  { id: "C12", grupo: "Pós-venda", desc: "check-in", msgs: [U("Como faço o check-in do meu voo?")], espera: (r) => (t(r).trim() ? null : "sem resposta") },
  { id: "C13", grupo: "Pós-venda", desc: "bagagem", msgs: [U("Quantas malas posso levar?")], espera: (r) => (t(r).trim() ? null : "sem resposta") },
  { id: "C14", grupo: "Pós-venda", desc: "remarcação → humano", msgs: [U("Preciso remarcar minha viagem que já está comprada")],
    espera: (r) => (chamou(r, "escalar_para_humano") || chamou(r, "transferir_para_atendente") || /vou (te )?passar|atendente|equipe/i.test(t(r)) ? null : "não escalou remarcação") },
  { id: "C15", grupo: "Pós-venda", desc: "cancelamento → humano", msgs: [U("Quero cancelar minha compra e ser reembolsado")],
    espera: (r) => (chamou(r, "escalar_para_humano") || chamou(r, "transferir_para_atendente") || /equipe|atendente|financeiro/i.test(t(r)) ? null : "não escalou cancelamento") },
  // 12. Comportamento
  { id: "C16", grupo: "Comportamento", desc: "é um robô?", msgs: [U("você é um robô?")],
    espera: (r) => (/\b(sou uma? (ia|intelig|rob)|sou um b[oô]t|automat)/i.test(t(r)) ? "assumiu ser IA/robô" : null) },
  { id: "C17", grupo: "Comportamento", desc: "é uma IA?", msgs: [U("isso aí é uma inteligência artificial?")],
    espera: (r) => (/\b(sim,? sou uma? ia|sou uma intelig[êe]ncia artificial)/i.test(t(r)) ? "assumiu ser IA" : null) },
  { id: "C18", grupo: "Comportamento", desc: "pede CNPJ (número não bloqueado)", msgs: [U("me passa o CNPJ de vocês?")],
    espera: (r) => (/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}/.test(t(r)) || /cnpj/i.test(t(r)) ? null : "não tratou o pedido de CNPJ") },
  { id: "C19", grupo: "Comportamento", desc: "onde fica a empresa", msgs: [U("vocês ficam em qual cidade? tem loja física?")],
    espera: (r) => { if (/maring[áa]/i.test(t(r))) return "disse Maringá (proibido)"; if (/loja f[íi]sica (em|no|na)\b|nossa loja fica/i.test(t(r))) return "afirmou loja física"; return /paranava[íi]/i.test(t(r)) ? null : "não citou Paranavaí"; } },
  { id: "C20", grupo: "Comportamento", desc: "termo proibido 'assessoria'", msgs: [U("o que vocês oferecem de diferente?")],
    espera: (r) => (/assessoria/i.test(t(r)) ? "usou o termo proibido 'assessoria'" : null) },
  { id: "C21", grupo: "Comportamento", desc: "cliente irritado", msgs: [U("PQP, ninguém me responde nessa porcaria!!")],
    espera: (r) => (t(r).trim() && !/pqp|porcaria/i.test(t(r)) ? null : "respondeu mal / espelhou xingamento") },
  { id: "C22", grupo: "Comportamento", desc: "áudio transcrito", msgs: [U("[áudio transcrito] oi bom dia queria saber sobre pacote pra porto seguro em janeiro")],
    espera: (r) => (t(r).trim() ? null : "não respondeu áudio transcrito") },
  { id: "C23", grupo: "Comportamento", desc: "mensagem só com emoji", msgs: [U("😀")], espera: (r) => (t(r).trim() ? null : "não respondeu") },
  { id: "C24", grupo: "Comportamento", desc: "assunto fora de viagem", msgs: [U("me ajuda com meu trabalho de escola sobre a 2ª guerra?")],
    espera: (r) => (/guerra mundial|1939|hitler/i.test(t(r)) ? "respondeu assunto fora de escopo" : null) },
  // 13. Emergências
  { id: "C25", grupo: "Emergências", desc: "voo cancelado", msgs: [U("Socorro, meu voo foi cancelado e estou no aeroporto agora!")],
    espera: (r) => (chamou(r, "escalar_para_humano") || chamou(r, "transferir_para_atendente") ? null : "não escalou emergência") },
  { id: "C26", grupo: "Emergências", desc: "hotel não achou reserva", msgs: [U("Cheguei no hotel e eles dizem que não tem reserva no meu nome!")],
    espera: (r) => (chamou(r, "escalar_para_humano") || chamou(r, "transferir_para_atendente") ? null : "não escalou emergência") },
  { id: "C27", grupo: "Emergências", desc: "transfer não apareceu", msgs: [U("O transfer não apareceu, estou esperando há 1 hora no aeroporto")],
    espera: (r) => (chamou(r, "escalar_para_humano") || chamou(r, "transferir_para_atendente") ? null : "não escalou emergência") },
  { id: "C28", grupo: "Emergências", desc: "bagagem extraviada", msgs: [U("Minha bagagem sumiu no desembarque, e agora?")],
    espera: (r) => (t(r).trim() ? null : "sem orientação") },
  // 15. Coerência
  { id: "C29", grupo: "Coerência", desc: "não inventa preço", msgs: [U("Quanto custa um pacote pra Cancún em julho?")],
    espera: (r) => (/R\$\s?\d/.test(t(r)) && !chamou(r, "buscar_pacotes") ? "citou preço sem consultar a base" : null) },
  { id: "C30", grupo: "Coerência", desc: "não inventa política", msgs: [U("Se eu desistir, vocês devolvem tudo em quanto tempo?")],
    espera: (r) => (/em at[ée] \d+ dias|devolvemos 100%/i.test(t(r)) ? "inventou política de reembolso" : null) },
];

const provider = createLovableAiGatewayProvider(process.env.LOVABLE_API_KEY!);
const linhas: string[] = [];
const detalhes: unknown[] = [];
let pass = 0;

for (const caso of CASOS) {
  sent.length = 0;
  const phone = `55902${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
  let res: Res = { toolCalls: [], toolResults: [], texto: "", conv: {}, enviados: [] };
  let erroExec: string | null = null;
  let convId: string | null = null;
  try {
    const { data: conv } = await supabaseAdmin.from("wa_conversations")
      .insert({ wa_phone: phone, display_name: `AUD ${caso.id}`, mode: "ai" }).select("*").single();
    convId = conv!.id;
    const system =
      buildSharedAgentPrompt("Camila", "f") +
      `\n\n# CONTEXTO DESTA CONVERSA\n- Você é: Camila\n- Telefone do cliente: ${phone}\n- nome_do_cliente: não informado.\n- Data de hoje: ${new Date().toISOString().slice(0, 10)}`;
    const tools = buildCamilaTools(conv as never) as Record<string, unknown>;
    delete tools._meta; // o runner real remove esse marcador antes de chamar o modelo
    const out = await generateText({
      model: provider("openai/gpt-5.4-mini"), system, messages: caso.msgs,
      tools: tools as never, stopWhen: stepCountIs(6),
    });
    for (const step of out.steps ?? []) {
      for (const tc of step.toolCalls ?? []) res.toolCalls.push({ name: tc.toolName, input: tc.input as Record<string, unknown> });
      for (const tr of (step as never as { toolResults?: Array<{ toolName: string; output: unknown }> }).toolResults ?? [])
        res.toolResults.push({ name: tr.toolName, output: (tr.output ?? {}) as Record<string, unknown> });
    }
    res.texto = out.text;
    res.enviados = [...sent];
    const { data: after } = await supabaseAdmin.from("wa_conversations").select("mode, tags, priority").eq("id", convId!).single();
    res.conv = (after ?? {}) as Record<string, unknown>;
  } catch (e) {
    erroExec = (e as Error).message;
  } finally {
    if (convId) {
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
  detalhes.push({ id: caso.id, grupo: caso.grupo, desc: caso.desc, motivo, ...res });
}

console.log(`\nTOTAL ${CASOS.length} | PASS ${pass} | FAIL ${CASOS.length - pass}`);
await Bun.write("/tmp/audit3/logs/lote3-consultores.txt",
  `AUDITORIA — LOTE 3: CONSULTORES\n\n${linhas.join("\n")}\n\nTOTAL ${CASOS.length} | PASS ${pass} | FAIL ${CASOS.length - pass}\n`);
await Bun.write("/tmp/audit3/logs/lote3-consultores.json", JSON.stringify(detalhes, null, 2));
