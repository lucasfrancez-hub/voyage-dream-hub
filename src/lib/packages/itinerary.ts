/**
 * Roteiro em linha do tempo (Dia 1, Dia 2, ...) — texto curto e amigável,
 * sem regras técnicas do operador.
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
  for (let i = 0; i < miolo; i++) {
    const atividade = atividades[i];
    linhas.push(
      atividade
        ? `Dia ${i + 2} — ${atividade}.`
        : `Dia ${i + 2} — Dia livre para aproveitar${cidade ? ` ${cidade}` : " o destino"}.`,
    );
  }

  const restantes = atividades.slice(miolo);
  if (restantes.length && miolo > 0) {
    linhas[linhas.length - 1] = `${linhas[linhas.length - 1]!.replace(/\.$/, "")} · ${restantes.join(" · ")}.`;
  }

  if (dias > 1) {
    linhas.push(
      `Dia ${dias} — Check-out${temTransfer ? " e transfer do hotel até o aeroporto" : ""}${
        cidade ? "" : ""
      } para o voo de volta.`,
    );
  }

  return linhas.join("\n");
}

/** Nome curto e apresentável de um serviço (sem textão do operador). */
export function nomeCurtoServico(v: unknown): string {
  let t = String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/leia\s+atentamente\s+a\s+descri[cç][aã]o\s+do\s+servi[cç]o/gi, " ")
    .replace(/^[\s•\-–—:*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  t = t.split(/[.;]\s+|\s+\|\s+/)[0] ?? t;
  t = t.replace(/\([^)]{25,}\)/g, "").replace(/\s{2,}/g, " ").trim();
  if (t.length > 60) {
    const corte = t.slice(0, 60);
    const p = corte.lastIndexOf(" ");
    t = p > 25 ? corte.slice(0, p) : corte;
  }
  return t.replace(/[.,;:–-]+$/, "").trim();
}
