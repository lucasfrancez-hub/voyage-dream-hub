/**
 * Normaliza o texto de quarto vindo dos fornecedores (Infotravel etc.).
 *
 * Os fornecedores mandam tudo concatenado, por exemplo:
 *   "Double Room,1 Double Bed — Multa de cancelamento A partir de 16/09/2026 ..."
 *
 * Aqui separamos:
 *   - name  → apenas a categoria/tipo de cama ("Quarto Duplo — 1 cama de casal")
 *   - notes → políticas de cancelamento / observações
 */

type Rep = string | ((...args: string[]) => string);
const TRADUCOES: Array<[RegExp, Rep]> = [
  [/\bdouble room\b/gi, "Quarto Duplo"],
  [/\btwin room\b/gi, "Quarto Twin"],
  [/\bsingle room\b/gi, "Quarto Single"],
  [/\btriple room\b/gi, "Quarto Triplo"],
  [/\bfamily room\b/gi, "Quarto Família"],
  [/\bsuperior room\b/gi, "Quarto Superior"],
  [/\bdeluxe room\b/gi, "Quarto Deluxe"],
  [/\bstandard room\b/gi, "Quarto Standard"],
  [/\bcouple standard\b/gi, "Quarto Standard Casal"],
  [/\bstandard\b/gi, "Standard"],
  [/\bsuperior\b/gi, "Superior"],
  [/\bdeluxe\b/gi, "Deluxe"],
  [/\bexecutive\b/gi, "Executivo"],
  [/\bsuite\b/gi, "Suíte"],
  [/(\d+)\s*double bed(s)?/gi, (_m: string, n: string) => `${n} cama(s) de casal`],
  [/(\d+)\s*single bed(s)?/gi, (_m: string, n: string) => `${n} cama(s) de solteiro`],
  [/(\d+)\s*queen bed(s)?/gi, (_m: string, n: string) => `${n} cama(s) queen`],
  [/(\d+)\s*king bed(s)?/gi, (_m: string, n: string) => `${n} cama(s) king`],
  [/\bdouble bed\b/gi, "cama de casal"],
  [/\bsingle bed\b/gi, "cama de solteiro"],
  [/\bnon[- ]?refundable\b/gi, "Tarifa não reembolsável"],
];

const MARCADORES_NOTA =
  /(multa de cancelament|cancellation|penalidade|penaliza|não reembols|nao reembols|reembols|no[- ]?show|política|politica|taxa de|será cobrado|sera cobrado)/i;

function limparEspacos(s: string) {
  return s.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
}

function traduzir(s: string) {
  let out = s;
  for (const [re, rep] of TRADUCOES) out = out.replace(re, rep as never);
  return limparEspacos(out);
}

function bonito(s: string) {
  const t = traduzir(s);
  if (!t) return t;
  // evita textos 100% em CAIXA ALTA
  if (t === t.toUpperCase() && /[A-ZÀ-Ú]{4,}/.test(t)) {
    return t
      .toLowerCase()
      .split(" ")
      .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return t;
}

export type RoomLabel = { name: string | null; notes: string[] };

export function parseRoomLabel(raw?: string | null): RoomLabel {
  const texto = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return { name: null, notes: [] };

  // quebra em pedaços por travessão / bullet / ponto-e-vírgula
  const partes = texto
    .split(/\s+—\s+|\s+–\s+|\s+•\s+|\s*;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  const nomes: string[] = [];
  const notas: string[] = [];
  for (const p of partes) {
    if (MARCADORES_NOTA.test(p) || p.length > 90) notas.push(p);
    else nomes.push(p);
  }

  // se nada sobrou como nome, tenta o trecho antes do primeiro marcador
  let nome = nomes.length ? nomes.join(" — ") : null;
  if (!nome) {
    const idx = texto.search(MARCADORES_NOTA);
    nome = idx > 0 ? texto.slice(0, idx).replace(/[—–•,\s]+$/, "").trim() || null : null;
  }

  const nomeFinal = nome ? bonito(nome) : null;
  const notasFinais = Array.from(new Set(notas.map((n) => limparEspacos(n)).filter(Boolean)));

  return { name: nomeFinal, notes: notasFinais };
}

/** Nome + descrição prontos para exibição (descrição = políticas, nunca repete o nome). */
export function formatRoom(raw?: string | null): { name: string | null; description: string | null } {
  const { name, notes } = parseRoomLabel(raw);
  const description = notes.length ? notes.join(" • ") : null;
  return { name, description: description && description !== name ? description : null };
}
