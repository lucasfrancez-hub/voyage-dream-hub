/**
 * Catálogo extensível de fornecedores que enviam código de autenticação
 * (2FA/OTP) por e-mail para a caixa encaminhamentoviaair@gmail.com.
 *
 * Para adicionar um fornecedor novo basta incluir uma entrada aqui — nenhuma
 * outra parte da lógica precisa mudar.
 */

export type ProvedorCodigo = {
  /** Chave usada nas chamadas (`provider`). */
  id: string;
  /** Nome exibido nas telas internas. */
  nome: string;
  /** Domínios do remetente ORIGINAL aceitos (o encaminhamento reescreve o From). */
  dominios: string[];
  /** Palavras que costumam aparecer no assunto/corpo do e-mail do fornecedor. */
  pistas: string[];
  /** Assuntos esperados (comparação por trecho, sem acento e sem caixa). */
  assuntos?: string[];
  /** Tamanhos prováveis do código. */
  tamanhos: number[];
  /** Aceita código alfanumérico além de numérico. */
  alfanumerico?: boolean;
};

export const PROVEDORES_CODIGO: ProvedorCodigo[] = [
  {
    id: "frt",
    nome: "FRT / Infotravel",
    dominios: ["infotera.com.br", "infotravel.com.br", "frt.com.br"],
    pistas: ["frt", "infotera", "infotravel"],
    assuntos: ["codigo de verificacao", "codigo de acesso", "verificacao"],
    tamanhos: [6],
  },
  {
    id: "comprefacil",
    nome: "CompreFácil (FRT Operadora)",
    // remetente original: nao-responda@frt.tur.br
    dominios: ["frt.tur.br", "comprefacil.tur.br"],
    pistas: ["comprefacil", "compre facil", "frt operadora", "nao-responda@frt.tur.br"],
    assuntos: [
      "codigo de acesso ao sistema frt operadora",
      "codigo de acesso ao sistema frt",
      "codigo de acesso",
    ],
    tamanhos: [6],
  },
  {
    id: "cativa",
    nome: "Cativa Turismo",
    dominios: ["cativa.tur.br", "cativaturismo.com.br"],
    pistas: ["cativa"],
    assuntos: ["codigo", "verificacao", "acesso"],
    tamanhos: [4, 6],
  },
  {
    id: "passhub",
    nome: "PassHub",
    dominios: ["passhub.com.br", "emissor-gerencia.passhub.com.br"],
    pistas: ["passhub"],
    assuntos: ["codigo", "verificacao", "seguranca"],
    tamanhos: [6],
  },
  {
    id: "expedia",
    nome: "Expedia TAAP",
    dominios: ["expedia.com", "expediamail.com", "expediapartnercentral.com"],
    pistas: ["expedia", "taap"],
    assuntos: ["verification code", "security code", "one-time"],
    tamanhos: [6],
  },
  {
    id: "sabre",
    nome: "Sabre",
    dominios: ["sabre.com"],
    pistas: ["sabre"],
    assuntos: ["verification code", "authentication code", "one-time passcode"],
    tamanhos: [6, 8],
    alfanumerico: true,
  },
  {
    id: "omio",
    nome: "Omio",
    dominios: ["omio.com", "goeuro.com"],
    pistas: ["omio"],
    assuntos: ["verification code", "login code"],
    tamanhos: [6],
  },
  {
    id: "asaas",
    nome: "ASAAS",
    dominios: ["asaas.com", "asaas.com.br"],
    pistas: ["asaas"],
    assuntos: ["codigo", "token", "verificacao"],
    tamanhos: [6],
  },
  {
    id: "generico",
    nome: "Genérico (qualquer fornecedor)",
    dominios: [],
    pistas: [],
    tamanhos: [4, 6, 8],
    alfanumerico: true,
  },
];

export function normalizarTexto(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function acharProvedor(id: string | null | undefined): ProvedorCodigo {
  const alvo = normalizarTexto(id ?? "generico").trim();
  return (
    PROVEDORES_CODIGO.find((p) => p.id === alvo) ??
    PROVEDORES_CODIGO.find((p) => normalizarTexto(p.nome).includes(alvo) && alvo.length > 2) ??
    PROVEDORES_CODIGO[PROVEDORES_CODIGO.length - 1]!
  );
}
