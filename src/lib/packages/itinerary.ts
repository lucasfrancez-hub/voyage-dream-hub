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
