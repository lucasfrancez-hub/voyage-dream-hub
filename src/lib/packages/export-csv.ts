/** Exportação CSV dos pacotes / ingressos / passeios / cruzeiros do admin. */

export type ExportDatePrice = {
  package_id: string;
  date: string;
  modality: string | null;
  price_per_person: number | null;
  taxes: number | null;
  seats: number | null;
  is_available: boolean | null;
};

type AnyPkg = Record<string, any>;

const KIND_LABEL: Record<string, string> = {
  package: "Pacote",
  service: "Ingresso/Serviço",
  tour: "Passeio",
  cruise: "Cruzeiro",
};

function brl(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v.toFixed(2).replace(".", ",");
}

function dateBR(v: unknown): string {
  const s = String(v ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** Texto "o que está incluso" a partir de includes + services. */
export function buildIncludesText(p: AnyPkg): string {
  const parts: string[] = [];
  for (const i of (p.includes as string[] | null) ?? []) {
    if (i && String(i).trim()) parts.push(String(i).trim());
  }
  const s = (p.services ?? {}) as AnyPkg;
  if (s?.seguro?.enabled) {
    parts.push(
      `Seguro viagem${s.seguro.cobertura ? ` (cobertura ${s.seguro.moeda ?? ""} ${s.seguro.cobertura})`.replace(/\s+/g, " ") : ""}`,
    );
  }
  if (s?.cancelamento?.enabled) {
    parts.push(
      `Seguro cancelamento${s.cancelamento.cobertura ? ` (${s.cancelamento.moeda ?? ""} ${s.cancelamento.cobertura})`.replace(/\s+/g, " ") : ""}`,
    );
  }
  if (s?.transfer?.enabled) {
    const sentido =
      s.transfer.sentido === "in" ? "somente ida" : s.transfer.sentido === "out" ? "somente volta" : "ida e volta";
    parts.push(`Transfer (${sentido})`);
  }
  if (s?.city_tour?.enabled) parts.push(`City tour${s.city_tour.detalhe ? `: ${s.city_tour.detalhe}` : ""}`);
  if (Array.isArray(s?.passeios)) for (const t of s.passeios) if (t) parts.push(`Passeio: ${t}`);
  if (s?.tickets?.enabled && Array.isArray(s.tickets.parks)) {
    for (const t of s.tickets.parks) if (t) parts.push(`Ingresso: ${t}`);
  }
  if (s?.cruise?.ship || s?.cruise?.company) {
    parts.push(
      `Cruzeiro: ${[s.cruise.company, s.cruise.ship, s.cruise.cabin_type, s.cruise.board_regime]
        .filter(Boolean)
        .join(" — ")}`,
    );
  }
  if (Array.isArray(s?.outros)) for (const t of s.outros) if (t) parts.push(String(t));
  if (p.hotel_name) {
    parts.push(
      `Hospedagem: ${[p.hotel_name, p.hotel_stars ? `${p.hotel_stars}★` : null, p.meal_plan, p.room_type, p.bed_type]
        .filter(Boolean)
        .join(" — ")}`,
    );
  }
  return parts.join(" | ");
}

const HEADERS = [
  "Tipo",
  "Título",
  "Destino",
  "Origem",
  "Data ida",
  "Data volta",
  "Noites",
  "Modalidade",
  "Preço por pessoa (R$)",
  "Taxas (R$)",
  "Ocupação base",
  "Total base (R$)",
  "Vagas",
  "Disponível",
  "Fornecedor",
  "Hotel",
  "Regime",
  "Quarto",
  "Ponto de encontro",
  "Horários de saída",
  "Incluso",
  "Ativo",
  "Link",
];

export function buildPackagesCsv(
  packages: AnyPkg[],
  datePrices: ExportDatePrice[] = [],
  baseUrl = "",
): string {
  const byPkg = new Map<string, ExportDatePrice[]>();
  for (const d of datePrices) {
    const arr = byPkg.get(d.package_id) ?? [];
    arr.push(d);
    byPkg.set(d.package_id, arr);
  }

  const rows: string[][] = [HEADERS];

  for (const p of packages) {
    const incluso = buildIncludesText(p);
    const base = Number(p.base_occupancy ?? 1) || 1;
    const link = p.slug ? `${baseUrl}/pacotes/${p.slug}` : "";
    const common = {
      tipo: KIND_LABEL[String(p.kind ?? "package")] ?? "Pacote",
      titulo: p.title ?? "",
      destino: p.destination ?? "",
      origem: p.origin ?? "",
      fornecedor: p.supplier_name ?? "",
      hotel: p.hotel_name ?? "",
      regime: p.meal_plan ?? "",
      quarto: [p.room_type, p.room_category, p.bed_type].filter(Boolean).join(" / "),
      ponto: p.meeting_point ?? "",
      horarios: Array.isArray(p.tour_times) ? p.tour_times.join(", ") : "",
      ativo: p.is_active ? "Sim" : "Não",
    };

    const dps = (byPkg.get(String(p.id)) ?? []).sort((a, b) =>
      String(a.date).localeCompare(String(b.date)) || String(a.modality ?? "").localeCompare(String(b.modality ?? "")),
    );

    if (dps.length) {
      for (const d of dps) {
        const price = Number(d.price_per_person ?? p.price_per_person ?? 0);
        const taxes = Number(d.taxes ?? 0);
        rows.push([
          common.tipo,
          common.titulo,
          common.destino,
          common.origem,
          dateBR(d.date),
          "",
          String(p.nights ?? ""),
          d.modality ?? "",
          brl(price),
          brl(taxes),
          String(base),
          brl((price + taxes) * base),
          d.seats == null ? "" : String(d.seats),
          d.is_available === false ? "Não" : "Sim",
          common.fornecedor,
          common.hotel,
          common.regime,
          common.quarto,
          common.ponto,
          common.horarios,
          incluso,
          common.ativo,
          link,
        ]);
      }
    } else {
      const price = Number(p.price_per_person ?? 0);
      const taxes = Number(p.taxes ?? 0);
      rows.push([
        common.tipo,
        common.titulo,
        common.destino,
        common.origem,
        dateBR(p.going_date),
        dateBR(p.return_date),
        String(p.nights ?? ""),
        Array.isArray(p.tour_modalities) ? p.tour_modalities.join(", ") : "",
        brl(price),
        brl(taxes),
        String(base),
        brl((price + taxes) * base),
        "",
        "",
        common.fornecedor,
        common.hotel,
        common.regime,
        common.quarto,
        common.ponto,
        common.horarios,
        incluso,
        common.ativo,
        link,
      ]);
    }
  }

  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
