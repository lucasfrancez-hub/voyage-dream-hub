/**
 * AUDITORIA — lote 1: roteamento da primeira mensagem.
 * Não altera nenhum código de produção; apenas cria conversas temporárias,
 * roda triageFirstMessage e apaga tudo no final.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { triageFirstMessage } from "@/lib/whatsapp/triage.server";

type Caso = { id: string; grupo: string; msg: string; esperado: "central" | "consultor" };

const CASOS: Caso[] = [
  // 2. Central de Especialistas
  { id: "R01", grupo: "Central", msg: "Quero uma passagem", esperado: "central" },
  { id: "R02", grupo: "Central", msg: "Quero um voo", esperado: "central" },
  { id: "R03", grupo: "Central", msg: "Quero passagem para Recife", esperado: "central" },
  { id: "R04", grupo: "Central", msg: "Quero voo de Maringá para São Paulo", esperado: "central" },
  { id: "R05", grupo: "Central", msg: "Quero comprar só o aéreo", esperado: "central" },
  { id: "R06", grupo: "Central", msg: "Quanto custa uma passagem para Salvador?", esperado: "central" },
  { id: "R07", grupo: "Central", msg: "Quero ida e volta", esperado: "central" },
  { id: "R08", grupo: "Central", msg: "Quero só ida", esperado: "central" },
  { id: "R09", grupo: "Central", msg: "Tem voo para Lisboa?", esperado: "central" },
  // 2. Consultores
  { id: "R10", grupo: "Consultores", msg: "Oi", esperado: "consultor" },
  { id: "R11", grupo: "Consultores", msg: "Quero viajar", esperado: "consultor" },
  { id: "R12", grupo: "Consultores", msg: "Quero sugestões", esperado: "consultor" },
  { id: "R13", grupo: "Consultores", msg: "Quero um pacote", esperado: "consultor" },
  { id: "R14", grupo: "Consultores", msg: "Quero pacote para Maceió", esperado: "consultor" },
  { id: "R15", grupo: "Consultores", msg: "Quero conhecer Gramado", esperado: "consultor" },
  { id: "R16", grupo: "Consultores", msg: "Quero férias", esperado: "consultor" },
  { id: "R17", grupo: "Consultores", msg: "Quero viagem completa", esperado: "consultor" },
  { id: "R18", grupo: "Consultores", msg: "Quero aéreo e hotel", esperado: "consultor" },
  // 2. Comercial (na triagem tem que ficar com consultores; a transferência é por tool)
  { id: "R19", grupo: "Comercial", msg: "Quero roteiro personalizado", esperado: "consultor" },
  { id: "R20", grupo: "Comercial", msg: "Quero mudar hotel", esperado: "consultor" },
  { id: "R21", grupo: "Comercial", msg: "Quero ficar mais dias", esperado: "consultor" },
  { id: "R22", grupo: "Comercial", msg: "Quero montar viagem", esperado: "consultor" },
  { id: "R23", grupo: "Comercial", msg: "Quero cancelar", esperado: "consultor" },
  { id: "R24", grupo: "Comercial", msg: "Quero reembolso", esperado: "consultor" },
  { id: "R25", grupo: "Comercial", msg: "Problema de pagamento", esperado: "consultor" },
  // 7. Hotéis
  { id: "R26", grupo: "Hotéis", msg: "Hotel", esperado: "consultor" },
  { id: "R27", grupo: "Hotéis", msg: "Hotel em Natal", esperado: "consultor" },
  { id: "R28", grupo: "Hotéis", msg: "Hotel luxo", esperado: "consultor" },
  { id: "R29", grupo: "Hotéis", msg: "Hotel econômico", esperado: "consultor" },
  { id: "R30", grupo: "Hotéis", msg: "Hotel família", esperado: "consultor" },
  // 8. Outros produtos
  { id: "R31", grupo: "Outros produtos", msg: "Aluguel de carro", esperado: "consultor" },
  { id: "R32", grupo: "Outros produtos", msg: "Seguro", esperado: "consultor" },
  { id: "R33", grupo: "Outros produtos", msg: "Cruzeiro", esperado: "consultor" },
  { id: "R34", grupo: "Outros produtos", msg: "Ingressos", esperado: "consultor" },
  { id: "R35", grupo: "Outros produtos", msg: "Viagem completa", esperado: "consultor" },
  // 9. Pós-venda
  { id: "R36", grupo: "Pós-venda", msg: "Minha reserva", esperado: "consultor" },
  { id: "R37", grupo: "Pós-venda", msg: "Voucher", esperado: "consultor" },
  { id: "R38", grupo: "Pós-venda", msg: "Check-in", esperado: "consultor" },
  { id: "R39", grupo: "Pós-venda", msg: "Cartão de embarque", esperado: "consultor" },
  { id: "R40", grupo: "Pós-venda", msg: "Bagagem", esperado: "consultor" },
  { id: "R41", grupo: "Pós-venda", msg: "Remarcação", esperado: "consultor" },
  { id: "R42", grupo: "Pós-venda", msg: "Cancelamento", esperado: "consultor" },
  { id: "R43", grupo: "Pós-venda", msg: "Reembolso", esperado: "consultor" },
  { id: "R44", grupo: "Pós-venda", msg: "Pagamento", esperado: "consultor" },
  // 10. Emergências
  { id: "R45", grupo: "Emergências", msg: "Voo cancelado", esperado: "consultor" },
  { id: "R46", grupo: "Emergências", msg: "Transfer não apareceu", esperado: "consultor" },
  { id: "R47", grupo: "Emergências", msg: "Hotel indisponível", esperado: "consultor" },
  { id: "R48", grupo: "Emergências", msg: "Bagagem extraviada", esperado: "consultor" },
  { id: "R49", grupo: "Emergências", msg: "Estou só planejando uma viagem", esperado: "consultor" },
  // 12. Linguagem
  { id: "R50", grupo: "Linguagem", msg: "quero uma pasagem pra recif", esperado: "central" },
  { id: "R51", grupo: "Linguagem", msg: "quero um pacote 😍✈️", esperado: "consultor" },
  { id: "R52", grupo: "Linguagem", msg: "vocês são um robô?", esperado: "consultor" },
  { id: "R53", grupo: "Linguagem", msg: "PQP vocês não me responderam ainda!!!", esperado: "consultor" },
];

const linhas: string[] = [];
const resultados: Array<Caso & { obtido: string; ok: boolean; ms: number }> = [];

for (const caso of CASOS) {
  const phone = `55900${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 90 + 10)}`;
  let obtido = "erro";
  let ms = 0;
  try {
    const { data: conv, error } = await supabaseAdmin
      .from("wa_conversations")
      .insert({ wa_phone: phone, display_name: `AUD ${caso.id}`, mode: "ai" })
      .select("*")
      .single();
    if (error) throw error;
    await supabaseAdmin.from("wa_messages").insert({
      conversation_id: conv.id,
      direction: "inbound",
      sender: "customer",
      content: caso.msg,
    });
    const t0 = Date.now();
    const r = await triageFirstMessage(conv as never);
    ms = Date.now() - t0;
    obtido = r ? `central:${r.slug}` : "consultor";
    await supabaseAdmin.from("wa_messages").delete().eq("conversation_id", conv.id);
    await supabaseAdmin.from("wa_handoff_events").delete().eq("conversation_id", conv.id);
    await supabaseAdmin.from("wa_conversations").delete().eq("id", conv.id);
  } catch (e) {
    obtido = `ERRO: ${(e as Error).message}`;
  }
  const ok = caso.esperado === "central" ? obtido.startsWith("central") : obtido === "consultor";
  resultados.push({ ...caso, obtido, ok, ms });
  const linha = `${ok ? "PASS" : "FAIL"} | ${caso.id} | ${caso.grupo} | "${caso.msg}" | esperado=${caso.esperado} | obtido=${obtido} | ${ms}ms`;
  linhas.push(linha);
  console.log(linha);
}

const pass = resultados.filter((r) => r.ok).length;
console.log(`\nTOTAL ${resultados.length} | PASS ${pass} | FAIL ${resultados.length - pass}`);
await Bun.write(
  "/tmp/audit3/logs/lote1-roteamento.txt",
  `AUDITORIA — LOTE 1: ROTEAMENTO DA PRIMEIRA MENSAGEM\n\n${linhas.join("\n")}\n\nTOTAL ${resultados.length} | PASS ${pass} | FAIL ${resultados.length - pass}\n`,
);
await Bun.write("/tmp/audit3/logs/lote1-roteamento.json", JSON.stringify(resultados, null, 2));
