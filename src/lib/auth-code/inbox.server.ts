/**
 * Caixa de tokens recebidos por WhatsApp / SMS / digitação manual.
 *
 * Complementa a caixa de e-mail: fornecedores que mandam o código por
 * mensagem (ex.: PassHub) caem aqui e as automações usam o mesmo
 * `aguardarCodigo`.
 *
 * Regras:
 *  - o código fica guardado por poucos minutos e é apagado depois;
 *  - o valor NUNCA aparece em log (só a máscara);
 *  - cada código só é entregue uma vez (marca `consumed_at`).
 */
import {
  acharProvedor,
  normalizarTexto,
  provedorPorRemetente,
  PROVEDORES_CODIGO,
  type ProvedorCodigo,
} from "./providers";
import { extrairCodigo, mascararCodigo, pareceAutenticacao } from "./extract";

/** Tudo com mais de 30 minutos é descartado. */
const VALIDADE_MS = 30 * 60_000;

export type OrigemCodigo = "whatsapp" | "sms" | "manual" | "api";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Tenta descobrir o fornecedor pelo texto da mensagem. */
export function adivinharProvedor(texto: string): ProvedorCodigo | null {
  const alvo = normalizarTexto(texto);
  for (const p of PROVEDORES_CODIGO) {
    if (p.id === "generico") continue;
    if (p.pistas.some((pista) => pista && alvo.includes(normalizarTexto(pista)))) return p;
    if (p.dominios.some((d) => alvo.includes(normalizarTexto(d)))) return p;
  }
  return null;
}

/**
 * Guarda um código recebido por mensagem. Devolve `false` quando a mensagem
 * não parece de autenticação (nesse caso nada é gravado).
 */
export async function registrarCodigoMensagem(input: {
  source: OrigemCodigo;
  texto: string;
  sender?: string | null;
  provider?: string | null;
  code?: string | null;
}): Promise<{ ok: boolean; provider: string | null; motivo?: string }> {
  const texto = (input.texto ?? "").slice(0, 4000);
  const provedorInformado = input.provider ? acharProvedor(input.provider) : null;
  const provedor = provedorInformado ?? adivinharProvedor(texto) ?? acharProvedor("generico");

  let codigo = (input.code ?? "").trim().toUpperCase() || null;
  if (!codigo) {
    if (!pareceAutenticacao(texto)) return { ok: false, provider: null, motivo: "sem_indicio_2fa" };
    codigo = extrairCodigo(texto, provedor);
  }
  if (!codigo) return { ok: false, provider: provedor.id, motivo: "sem_codigo" };

  const db = await admin();
  await (db.from("otp_inbox") as any).insert({
    source: input.source,
    provider: provedor.id,
    sender: (input.sender ?? "").slice(0, 200) || null,
    code: codigo,
    hint: texto.slice(0, 160),
  });
  await db.from("otp_inbox").delete().lt("received_at", new Date(Date.now() - VALIDADE_MS).toISOString());
  console.log(`[2FA] código por ${input.source} guardado (${provedor.id}) ${mascararCodigo(codigo)}`);
  return { ok: true, provider: provedor.id };
}

export type CodigoInbox = {
  id: string;
  code: string;
  source: string;
  sender: string | null;
  receivedAt: string;
};

/**
 * Procura um código não consumido para o fornecedor, recebido depois de
 * `desdeMs`. O fornecedor "generico" aceita qualquer origem.
 */
export async function buscarCodigoInbox(
  provedor: ProvedorCodigo,
  desdeMs: number,
): Promise<CodigoInbox | null> {
  const db = await admin();
  let q = db
    .from("otp_inbox")
    .select("id, code, source, sender, received_at, provider")
    .is("consumed_at", null)
    .gte("received_at", new Date(desdeMs).toISOString())
    .order("received_at", { ascending: false })
    .limit(5);
  const { data } = await q;
  const linhas = (data ?? []) as Array<Record<string, any>>;
  const escolhida =
    linhas.find((l) => l["provider"] === provedor.id) ??
    (provedor.id === "generico" ? linhas[0] : linhas.find((l) => l["provider"] === "generico"));
  if (!escolhida) return null;

  // Consumo atômico: só entrega se ainda estiver livre.
  const { data: usada } = await (db.from("otp_inbox") as any)
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", escolhida["id"])
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!usada) return null;

  return {
    id: escolhida["id"] as string,
    code: escolhida["code"] as string,
    source: escolhida["source"] as string,
    sender: (escolhida["sender"] as string | null) ?? null,
    receivedAt: escolhida["received_at"] as string,
  };
}
