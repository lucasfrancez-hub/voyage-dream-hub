/**
 * Identificação de e-mails de autenticação e extração do código (OTP/2FA).
 *
 * Duas etapas, nesta ordem:
 *  1. confirmar que a mensagem é MESMO de autenticação (rótulos conhecidos);
 *  2. escolher o código mais provável perto desses rótulos.
 *
 * O valor do código nunca é registrado em log por estas funções.
 */
import { normalizarTexto, type ProvedorCodigo } from "./providers";

/** Rótulos que indicam mensagem de autenticação (pt-BR e inglês). */
const ROTULOS = [
  "codigo de verificacao",
  "codigo de acesso",
  "codigo de seguranca",
  "codigo de autenticacao",
  "codigo de confirmacao",
  "seu codigo",
  "codigo temporario",
  "verification code",
  "authentication code",
  "security code",
  "confirmation code",
  "login code",
  "access code",
  "one-time password",
  "one time password",
  "one-time passcode",
  "otp",
  "token de acesso",
  "autenticacao de dois fatores",
  "two-factor",
  "2fa",
];

/** Converte HTML em texto simples legível. */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/[ \t\u00a0]+/g, " ");
}

/** A mensagem parece ser de autenticação? */
export function pareceAutenticacao(texto: string): boolean {
  const t = normalizarTexto(texto);
  return ROTULOS.some((r) => t.includes(r));
}

/**
 * Confere se a mensagem pertence ao fornecedor esperado, olhando remetente
 * visível, remetente original (encaminhamento), assunto e corpo.
 */
export function combinaComProvedor(
  provedor: ProvedorCodigo,
  campos: { remetente: string; remetenteOriginal: string; assunto: string; corpo: string },
): boolean {
  if (provedor.dominios.length === 0 && provedor.pistas.length === 0) return true;
  const alvo = normalizarTexto(
    `${campos.remetente}\n${campos.remetenteOriginal}\n${campos.assunto}\n${campos.corpo.slice(0, 6000)}`,
  );
  if (provedor.dominios.some((d) => alvo.includes(normalizarTexto(d)))) return true;
  if (provedor.pistas.some((p) => p && alvo.includes(normalizarTexto(p)))) return true;
  return false;
}

function limparCandidato(bruto: string): string {
  return bruto.replace(/[\s.\-–—]/g, "");
}

function tamanhoOk(codigo: string, tamanhos: number[]): boolean {
  return tamanhos.length === 0 || tamanhos.includes(codigo.length);
}

/**
 * Extrai o código mais provável. Primeiro procura logo depois de um rótulo
 * conhecido; só depois tenta um número isolado com o tamanho esperado.
 */
export function extrairCodigo(texto: string, provedor: ProvedorCodigo): string | null {
  const limpo = texto.replace(/\r/g, "");
  const normal = normalizarTexto(limpo);
  const tamanhos = provedor.tamanhos.length ? provedor.tamanhos : [4, 6, 8];
  const maiorTam = Math.max(...tamanhos);
  const menorTam = Math.min(...tamanhos);

  const digitos = `\\d(?:[\\s.\\-–—]?\\d){${menorTam - 1},${maiorTam - 1}}`;
  const alnum = `[A-Za-z0-9](?:[\\s.\\-–—]?[A-Za-z0-9]){${menorTam - 1},${maiorTam - 1}}`;

  // 1) código imediatamente após um rótulo conhecido
  for (const rotulo of ROTULOS) {
    let i = normal.indexOf(rotulo);
    while (i !== -1) {
      const trecho = limpo.slice(i, i + rotulo.length + 120);
      const m =
        new RegExp(`(?:^|[^\\d])(${digitos})(?![\\d])`).exec(trecho) ??
        (provedor.alfanumerico
          ? new RegExp(`(?:^|[^A-Za-z0-9])(${alnum})(?![A-Za-z0-9])`).exec(trecho)
          : null);
      const cand = m?.[1] ? limparCandidato(m[1]) : null;
      if (cand && tamanhoOk(cand, tamanhos)) return cand.toUpperCase();
      i = normal.indexOf(rotulo, i + rotulo.length);
    }
  }

  // 2) número isolado com um dos tamanhos esperados (o mais raro primeiro)
  for (const tam of [...tamanhos].sort((a, b) => b - a)) {
    const re = new RegExp(`(?:^|[^\\d])(\\d(?:[\\s.\\-–—]?\\d){${tam - 1}})(?![\\d])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(limpo))) {
      const cand = limparCandidato(m[1]!);
      if (cand.length === tam && !/^(\d)\1+$/.test(cand)) return cand;
    }
  }
  return null;
}

/** Mostra apenas os últimos 2 dígitos: `••••31`. */
export function mascararCodigo(codigo: string): string {
  const fim = codigo.slice(-2);
  return `${"•".repeat(Math.max(2, codigo.length - 2))}${fim}`;
}
