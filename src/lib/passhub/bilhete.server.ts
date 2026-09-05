/**
 * Número do bilhete (e-ticket) das reservas da PassHub. SERVER-ONLY.
 *
 * A API da consolidadora não devolve o número do bilhete em nenhum campo — ele
 * só aparece dentro do PDF da reserva (GET {gerencia}/api/v1/reservas/{id}/pdf).
 * Aqui baixamos esse PDF, pedimos para a IA extrair os números por passageiro e
 * guardamos o resultado, para não reprocessar a cada abertura da tela.
 */
import { passhubToken, passhubInvalidarToken, PassHubError, passhubRequest } from "./client.server";

const GERENCIA = "https://emissor-gerencia.passhub.com.br";
const DOCS_BUCKET = "https://storage.googleapis.com/passabot-bucket/tickets";

export type BilheteNumero = { passageiro: string; numero: string };

export type BilheteInfo = {
  idPassagem: number;
  numeros: BilheteNumero[];
  encontrado: boolean;
  verificadoEm: string;
};

/**
 * PDF oficial do bilhete emitido. A consolidadora guarda esse documento no
 * bucket público (tickets/{id_agencia}/airplane/{confirmation_ticket_id}.pdf) e
 * só ele traz o número do e-ticket — o PDF do painel não tem esse bloco.
 */
async function passhubPdfDocumentoBilhete(id: number): Promise<Buffer | null> {
  try {
    const bruto = (await passhubRequest<any>(`${GERENCIA}/api/v1/reservas/${id}`, {
      method: "GET",
    })) as any;
    const dados = bruto?.data ?? bruto;
    const ct = dados?.confirmation_ticket_id;
    const agencia = dados?.id_agencia;
    if (!ct || !agencia) return null;
    const res = await fetch(`${DOCS_BUCKET}/${agencia}/airplane/${ct}.pdf`, {
      headers: { Accept: "application/pdf" },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("[passhub] documento do bilhete indisponível:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Baixa o PDF da reserva na consolidadora (fallback do painel). */
export async function passhubPdfReserva(id: number): Promise<Buffer> {
  const documento = await passhubPdfDocumentoBilhete(id);
  if (documento) return documento;

  const buscar = async (token: string) =>
    fetch(`${GERENCIA}/api/v1/reservas/${id}/pdf`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
    });

  let res = await buscar(await passhubToken());
  if (res.status === 401 || res.status === 403) {
    await passhubInvalidarToken();
    res = await buscar(await passhubToken());
  }
  if (!res.ok) {
    throw new PassHubError(`PassHub não devolveu o PDF (${res.status})`, res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Números de bilhete: 13 dígitos, normalmente exibidos como 957-1234567890. */
function normaliza(numero: unknown): string {
  const so = String(numero ?? "").replace(/\D/g, "");
  if (so.length < 10 || so.length > 16) return "";
  return so.length === 13 ? `${so.slice(0, 3)}-${so.slice(3)}` : so;
}

async function extrairComIA(pdf: Buffer): Promise<BilheteNumero[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return [];

  const dataUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            'Você lê comprovantes aéreos brasileiros e extrai apenas o número do bilhete (e-ticket) de cada passageiro. Responda SOMENTE JSON válido: {"bilhetes":[{"passageiro":"NOME","numero":"9571234567890"}]}. O número do bilhete tem 13 dígitos (podendo vir com hífen). NÃO confunda com localizador (6 letras), CPF, CNPJ, telefone, número do voo ou valores. Se o documento não trouxer número de bilhete, responda {"bilhetes":[]}.',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia os números de bilhete deste comprovante." },
            { type: "file", file: { filename: "reserva.pdf", file_data: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error("[passhub] IA do bilhete falhou", res.status, (await res.text()).slice(0, 200));
    return [];
  }

  const json = (await res.json()) as any;
  const bruto = json?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(String(bruto).replace(/```json|```/g, "").trim());
  } catch {
    parsed = {};
  }

  const lista = Array.isArray(parsed?.bilhetes) ? parsed.bilhetes : [];
  const vistos = new Set<string>();
  const saida: BilheteNumero[] = [];
  for (const item of lista) {
    const numero = normaliza(item?.numero);
    if (!numero || vistos.has(numero)) continue;
    vistos.add(numero);
    saida.push({ passageiro: String(item?.passageiro ?? "").trim().toUpperCase(), numero });
  }
  return saida;
}

/**
 * Devolve o número do bilhete da reserva. Enquanto a consolidadora não imprimir
 * o número no PDF (emissão ainda em processamento), continuamos reconsultando —
 * por isso o cache só vira definitivo quando algum número é encontrado.
 */
export async function passhubNumerosBilhete(
  id: number,
  opcoes: { localizador?: string | null; forcar?: boolean } = {},
): Promise<BilheteInfo> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cache } = await supabaseAdmin
    .from("passhub_reserva_bilhete")
    .select("numeros, encontrado, verificado_em")
    .eq("id_passagem", id)
    .maybeSingle();

  const recente =
    cache?.verificado_em && Date.now() - new Date(cache.verificado_em).getTime() < 3 * 60_000;

  if (cache && !opcoes.forcar && (cache.encontrado || recente)) {
    return {
      idPassagem: id,
      numeros: (cache.numeros as BilheteNumero[]) ?? [],
      encontrado: Boolean(cache.encontrado),
      verificadoEm: cache.verificado_em,
    };
  }

  let numeros: BilheteNumero[] = [];
  try {
    numeros = await extrairComIA(await passhubPdfReserva(id));
  } catch (e) {
    console.error("[passhub] leitura do bilhete falhou:", e instanceof Error ? e.message : e);
    return {
      idPassagem: id,
      numeros: (cache?.numeros as BilheteNumero[]) ?? [],
      encontrado: Boolean(cache?.encontrado),
      verificadoEm: cache?.verificado_em ?? new Date().toISOString(),
    };
  }

  const verificadoEm = new Date().toISOString();
  await supabaseAdmin.from("passhub_reserva_bilhete").upsert(
    {
      id_passagem: id,
      localizador: opcoes.localizador ?? null,
      numeros,
      encontrado: numeros.length > 0,
      verificado_em: verificadoEm,
    },
    { onConflict: "id_passagem" },
  );

  return { idPassagem: id, numeros, encontrado: numeros.length > 0, verificadoEm };
}

/**
 * Busca automática: recebe as reservas emitidas e garante que cada uma tenha o
 * número do bilhete lido (do cache ou do PDF). Processa poucas por chamada para
 * não estourar o tempo da requisição; a tela reconsulta até todas saírem.
 */
export async function passhubBilhetesEmLote(
  ids: number[],
  limiteLeituras = 4,
): Promise<Record<number, BilheteNumero[]>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cache } = await supabaseAdmin
    .from("passhub_reserva_bilhete")
    .select("id_passagem, numeros, encontrado, verificado_em")
    .in("id_passagem", ids);

  const mapa: Record<number, BilheteNumero[]> = {};
  const pendentes: number[] = [];

  for (const id of ids) {
    const linha = cache?.find((c) => c.id_passagem === id);
    if (linha?.encontrado) {
      mapa[id] = (linha.numeros as BilheteNumero[]) ?? [];
      continue;
    }
    const recente =
      linha?.verificado_em && Date.now() - new Date(linha.verificado_em).getTime() < 3 * 60_000;
    if (!recente) pendentes.push(id);
  }

  for (const id of pendentes.slice(0, limiteLeituras)) {
    try {
      const info = await passhubNumerosBilhete(id);
      if (info.encontrado) mapa[id] = info.numeros;
    } catch {
      // segue para a próxima; a tela tenta de novo no próximo ciclo
    }
  }

  return mapa;
}
