/**
 * Roteiro em linha do tempo (Dia 1, Dia 2, ...) — texto curto e amigável,
 * sem regras técnicas do operador. Dias livres em sequência viram um
 * intervalo só ("Do dia 2 ao dia 7 — dia livre ...").
 */
export type RoteiroInput = {
  destino?: string | null;
  noites?: number | null;
  temTransfer?: boolean;
  passeios?: string[];
  ingressos?: string[];
};

const curto = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/[.,;:–-]+$/, "")
    .trim();

export function gerarRoteiro({
  destino,
  noites,
  temTransfer = false,
  passeios = [],
  ingressos = [],
}: RoteiroInput): string {
  const dias = Math.max(1, (Number(noites) || 0) + 1);
  const cidade = (destino ?? "").trim();
  const atividades = [...passeios, ...ingressos]
    .map((p) => curto(String(p ?? "")))
    .filter(Boolean)
    .filter((p, i, arr) => arr.indexOf(p) === i);

  const linhas: string[] = [];
  linhas.push(
    `Dia 1 — Chegada${cidade ? ` em ${cidade}` : ""}${
      temTransfer ? ", transfer do aeroporto até o hotel e check-in" : " e check-in no hotel"
    }.`,
  );

  const miolo = Math.max(0, dias - 2);
  const livre = `Dia livre para aproveitar${cidade ? ` ${cidade}` : " o destino"}`;

  // Agrupa dias livres consecutivos em um único intervalo.
  let i = 0;
  while (i < miolo) {
    const atividade = atividades[i];
    if (atividade) {
      linhas.push(`Dia ${i + 2} — ${atividade}.`);
      i += 1;
      continue;
    }
    let fim = i;
    while (fim + 1 < miolo && !atividades[fim + 1]) fim += 1;
    if (fim === i) linhas.push(`Dia ${i + 2} — ${livre}.`);
    else linhas.push(`Do dia ${i + 2} ao dia ${fim + 2} — ${livre}.`);
    i = fim + 1;
  }

  const restantes = atividades.slice(miolo);
  if (restantes.length && linhas.length > 1) {
    linhas[linhas.length - 1] = `${linhas[linhas.length - 1]!.replace(/\.$/, "")} · ${restantes.join(" · ")}.`;
  }

  if (dias > 1) {
    linhas.push(
      `Dia ${dias} — Check-out${temTransfer ? " e transfer do hotel até o aeroporto" : ""} para o voo de volta.`,
    );
  }

  return linhas.join("\n");
}

/** Nome curto e apresentável de um serviço (sem textão do operador). */
export function nomeCurtoServico(v: unknown): string {
  let t = String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/leia\s+atentamente\s+a\s+descri[cç][aã]o\s+do\s+servi[cç]o/gi, " ")
    .replace(/servi[cç]o\s+de\s+traslado\s+regular/gi, " ")
    .replace(/frequ[eê]ncia:\s*di[aá]ria/gi, " ")
    .replace(/regular\s*—?$/gi, "")
    .replace(/^[\s•\-–—:*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  t = t.split(/\s+[—–]\s+|[.;]\s+|\s+\|\s+/)[0] ?? t;
  t = t.replace(/\([^)]{25,}\)/g, "").replace(/\s{2,}/g, " ").trim();
  if (t.length > 60) {
    const corte = t.slice(0, 60);
    const p = corte.lastIndexOf(" ");
    t = p > 25 ? corte.slice(0, p) : corte;
  }
  return t.replace(/[.,;:–-]+$/, "").trim();
}
