/**
 * Apoio ao preenchimento de passageiros na reserva da consolidadora:
 * 1) leitura por IA (foto de documento / texto colado) devolvendo campos prontos;
 * 2) normalização dos passageiros já cadastrados em pedidos anteriores.
 */

export type PaxExtraido = {
  nome: string;
  sobrenome: string;
  nascimento: string; // aaaa-mm-dd
  genero: "M" | "F";
  documentoTipo: "cpf" | "passport";
  documento: string;
  emissao: string;
  validade: string;
  email: string;
  ddi: string;
  ddd: string;
  telefone: string;
};

const MODELO = "google/gemini-2.5-flash";

const SISTEMA =
  "Você lê documentos e textos de passageiros de uma agência de viagens brasileira e extrai os dados " +
  "para preencher uma reserva aérea. Nunca invente dados: o que não estiver claro fica string vazia. " +
  "Datas SEMPRE no formato aaaa-mm-dd. CPF somente dígitos (11). Passaporte em letras maiúsculas. " +
  "Nome e sobrenome separados (sobrenome = último(s) sobrenome(s), nome = restante), sem acentos, em MAIÚSCULAS. " +
  "genero: 'M' ou 'F'. documentoTipo: 'cpf' quando houver CPF, senão 'passport'. " +
  "Telefone brasileiro separado em ddi (55), ddd (2 dígitos) e telefone (só dígitos). " +
  'Responda SOMENTE com JSON: {"passageiros":[{"nome":"","sobrenome":"","nascimento":"","genero":"M",' +
  '"documentoTipo":"cpf","documento":"","emissao":"","validade":"","email":"","ddi":"55","ddd":"","telefone":""}]}';

function limparData(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function normalizar(bruto: any): PaxExtraido {
  const tipo = String(bruto?.documentoTipo ?? "").toLowerCase() === "passport" ? "passport" : "cpf";
  const doc = String(bruto?.documento ?? "").trim();
  return {
    nome: String(bruto?.nome ?? "").toUpperCase().trim().slice(0, 60),
    sobrenome: String(bruto?.sobrenome ?? "").toUpperCase().trim().slice(0, 60),
    nascimento: limparData(bruto?.nascimento),
    genero: String(bruto?.genero ?? "M").toUpperCase() === "F" ? "F" : "M",
    documentoTipo: tipo,
    documento: (tipo === "cpf" ? doc.replace(/\D/g, "") : doc.toUpperCase().replace(/\s/g, "")).slice(0, 20),
    emissao: limparData(bruto?.emissao),
    validade: limparData(bruto?.validade),
    email: String(bruto?.email ?? "").trim().toLowerCase().slice(0, 120),
    ddi: String(bruto?.ddi ?? "").replace(/\D/g, "").slice(0, 3),
    ddd: String(bruto?.ddd ?? "").replace(/\D/g, "").slice(0, 3),
    telefone: String(bruto?.telefone ?? "").replace(/\D/g, "").slice(0, 12),
  };
}

/** Lê texto colado e/ou imagens (data URL base64) e devolve passageiros prontos. */
export async function extrairPaxComIA(entrada: {
  texto?: string | null;
  imagens?: string[];
}): Promise<PaxExtraido[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA indisponível no momento.");

  const partes: Array<Record<string, unknown>> = [];
  const texto = (entrada.texto ?? "").trim();
  if (texto) partes.push({ type: "text", text: `Texto informado:\n${texto.slice(0, 8000)}` });
  for (const img of entrada.imagens ?? []) {
    partes.push({ type: "image_url", image_url: { url: img } });
  }
  if (!partes.length) throw new Error("Envie um texto ou uma imagem para a IA ler.");
  partes.push({ type: "text", text: "Extraia todos os passageiros encontrados." });

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      messages: [
        { role: "system", content: SISTEMA },
        { role: "user", content: partes },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Créditos da IA esgotados.");
    throw new Error(`Falha ao ler os dados (${res.status}).`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const conteudo = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(conteudo);
  } catch {
    const m = conteudo.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : {};
  }
  const lista = Array.isArray(parsed?.passageiros) ? parsed.passageiros : [];
  return lista.slice(0, 9).map(normalizar).filter((p: PaxExtraido) => p.nome || p.sobrenome || p.documento);
}

/** Quebra "MARIA DA SILVA SOUZA" em nome + sobrenome. */
export function separarNome(completo: string): { nome: string; sobrenome: string } {
  const partes = completo.toUpperCase().trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nome: partes[0] ?? "", sobrenome: "" };
  return { nome: partes.slice(0, -1).join(" "), sobrenome: partes[partes.length - 1]! };
}
