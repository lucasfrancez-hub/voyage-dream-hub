/**
 * Leitura da caixa encaminhamentoviaair@gmail.com via API oficial do Gmail,
 * pelo conector OAuth do projeto (nenhuma senha ou token no código).
 *
 * Só é usada no servidor. O conteúdo da caixa nunca é exposto ao navegador —
 * apenas metadados mínimos (remetente, assunto, horário) dos e-mails de
 * autenticação identificados.
 */
import { htmlParaTexto } from "./extract";

const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export type MensagemGmail = {
  id: string;
  threadId: string;
  recebidoEm: number;
  remetente: string;
  /** Remetente ORIGINAL, recuperado dos headers/corpo do encaminhamento. */
  remetenteOriginal: string;
  destinatario: string;
  assunto: string;
  corpo: string;
};

function chaves(): { lovable: string; conexao: string } {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conexao = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovable || !conexao) {
    throw new Error("A caixa de autenticação (Gmail) ainda não está conectada neste projeto.");
  }
  return { lovable, conexao };
}

async function gmail(path: string): Promise<unknown> {
  const { lovable, conexao } = chaves();
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": conexao,
    },
  });
  const texto = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Gmail ${res.status}: ${texto.slice(0, 300)}`);
  }
  return texto ? JSON.parse(texto) : null;
}

/** Endereço da caixa conectada (usado no diagnóstico). */
export async function contaConectada(): Promise<string> {
  const perfil = (await gmail("/users/me/profile")) as { emailAddress?: string };
  return perfil.emailAddress ?? "";
}

function decodificar(b64: string): string {
  try {
    const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

type Parte = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Parte[];
};

function juntarCorpo(parte: Parte | undefined): { texto: string; html: string } {
  if (!parte) return { texto: "", html: "" };
  let texto = "";
  let html = "";
  const visitar = (p: Parte) => {
    const dado = p.body?.data ? decodificar(p.body.data) : "";
    if (dado) {
      if ((p.mimeType ?? "").includes("html")) html += `\n${dado}`;
      else texto += `\n${dado}`;
    }
    for (const f of p.parts ?? []) visitar(f);
  };
  visitar(parte);
  return { texto, html };
}

/** Recupera o remetente original mesmo quando a mensagem chegou encaminhada. */
function remetenteOriginal(headers: Record<string, string>, corpo: string): string {
  const doCorpo =
    /(?:^|\n)\s*(?:de|from)\s*:\s*(.{3,160})/i.exec(corpo)?.[1]?.trim() ??
    /reply-to\s*:\s*(.{3,160})/i.exec(corpo)?.[1]?.trim() ??
    "";
  return (
    headers["x-forwarded-for"] ||
    headers["reply-to"] ||
    headers["x-original-from"] ||
    doCorpo ||
    headers["from"] ||
    ""
  );
}

/** Lista mensagens recebidas depois de `desdeMs` (janela curta e limitada). */
export async function mensagensRecentes(desdeMs: number, limite = 12): Promise<MensagemGmail[]> {
  const after = Math.floor(desdeMs / 1000);
  const lista = (await gmail(
    `/users/me/messages?maxResults=${limite}&q=${encodeURIComponent(`after:${after}`)}`,
  )) as { messages?: Array<{ id: string }> };
  const ids = (lista.messages ?? []).map((m) => m.id).slice(0, limite);

  const detalhes = await Promise.all(
    ids.map(async (id) => {
      try {
        const msg = (await gmail(`/users/me/messages/${id}?format=full`)) as {
          id: string;
          threadId: string;
          internalDate?: string;
          payload?: Parte & { headers?: Array<{ name: string; value: string }> };
        };
        const headers: Record<string, string> = {};
        for (const h of msg.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
        const { texto, html } = juntarCorpo(msg.payload);
        const corpo = `${texto}\n${htmlParaTexto(html)}`.trim();
        const recebidoEm = Number(msg.internalDate ?? 0) || Date.now();
        return {
          id: msg.id,
          threadId: msg.threadId,
          recebidoEm,
          remetente: headers["from"] ?? "",
          remetenteOriginal: remetenteOriginal(headers, corpo),
          destinatario: headers["delivered-to"] ?? headers["to"] ?? "",
          assunto: headers["subject"] ?? "",
          corpo,
        } satisfies MensagemGmail;
      } catch {
        return null;
      }
    }),
  );

  return detalhes
    .filter((m): m is MensagemGmail => !!m && m.recebidoEm >= desdeMs)
    .sort((a, b) => b.recebidoEm - a.recebidoEm);
}
