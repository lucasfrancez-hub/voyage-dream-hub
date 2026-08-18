import type { CativaFonte } from "./types";

const SHEET_ID = "1N-0NvPdhMQDmBoycPeCxggc8EtHBza9XbcNJpG1dKek";

export const CATIVA_GIDS: Record<CativaFonte, string> = {
  tradicionais: "282897979",
  eventos: "1508636932",
  internacionais: "666013111",
};

export type CativaLinha = Record<string, string>;

/** Parser CSV tolerante a aspas e quebras de linha dentro do campo. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Normaliza cabeçalho: sem acento, minúsculo, sem espaços duplicados. */
export function chaveCabecalho(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/·/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function baixarPlanilha(fonte: CativaFonte): Promise<CativaLinha[]> {
  const gid = CATIVA_GIDS[fonte];
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}&_=${Date.now()}`;
  const resp = await fetch(url, { headers: { "cache-control": "no-store" } });
  if (!resp.ok) throw new Error(`Planilha ${fonte}: HTTP ${resp.status}`);
  const rows = parseCSV(await resp.text());
  if (!rows.length) return [];
  const header = rows[0]!.map(chaveCabecalho);
  return rows.slice(1).map((r) => {
    const obj: CativaLinha = {};
    header.forEach((h, i) => {
      if (!h) return;
      const v = (r[i] ?? "").trim();
      if (v) obj[h] = v;
    });
    return obj;
  });
}
