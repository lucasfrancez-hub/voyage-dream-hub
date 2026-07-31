/**
 * Gera a arte (PNG) do cartão de voo e envia no WhatsApp.
 * Fotografa a rota /api/public/flight-card no Browserless, guarda o PNG no
 * storage e manda o link pro cliente. SERVER-ONLY.
 */
import type { FlightQuoteOption, FlightQuoteResult, FlightQuoteLeg } from "./flight-quote.server";
import type { FlightCardData, FlightCardLeg } from "@/lib/flight-card/card-html";
import { bestInstallments } from "@/lib/airline-installments";


const PUBLIC_BASE = "https://pedidos.viaair.tur.br";
const BROWSERLESS_BASE = "https://production-sfo.browserless.io";
const BUCKET = "broadcast-media";

// Parcelamento agora vem da tabela oficial por cia (teto + parcela mínima).


function money(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseStamp(s: string): { dia: string; hora: string; date: Date } {
  const [d, t] = s.split(" ");
  const [y, m, day] = (d ?? "").split("-").map(Number);
  const [hh, mm] = (t ?? "").split(":").map(Number);
  return {
    dia: `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}`,
    hora: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    date: new Date(Date.UTC(y, (m || 1) - 1, day || 1, hh || 0, mm || 0)),
  };
}

function toCardLeg(
  leg: FlightQuoteLeg,
  rotulo: string,
  cidades: Record<string, string>,
): FlightCardLeg {
  const dep = parseStamp(leg.partida);
  const arr = parseStamp(leg.chegada);
  const diff = Math.floor(
    (Date.UTC(arr.date.getUTCFullYear(), arr.date.getUTCMonth(), arr.date.getUTCDate()) -
      Date.UTC(dep.date.getUTCFullYear(), dep.date.getUTCMonth(), dep.date.getUTCDate())) /
      86400000,
  );
  return {
    rotulo,
    data: dep.dia,
    cia: leg.cia,
    cia_iata: leg.cia,
    voo: leg.voo,
    duracao: leg.duracao,
    paradas: leg.paradas,
    familia: leg.escalas.length ? leg.escalas.join(" • ") : null,
    bagagem: leg.bagagem_despachada ? "Bagagem despachada inclusa" : "Somente bagagem de mão",
    bagagem_mao: true,
    bagagem_despachada: leg.bagagem_despachada,
    partida: { hora: dep.hora, iata: leg.origem, cidade: cidades[leg.origem] ?? "", aeroporto: "" },
    chegada: {
      hora: arr.hora,
      iata: leg.destino,
      cidade: cidades[leg.destino] ?? "",
      aeroporto: "",
      mais_dias: diff > 0 ? diff : undefined,
    },
  };
}

export function buildFlightCardData(
  quote: Pick<
    FlightQuoteResult,
    "origem_iata" | "destino_iata" | "origem_nome" | "destino_nome"
  >,
  op: FlightQuoteOption,
): FlightCardData {
  const cidades: Record<string, string> = {
    [quote.origem_iata]: quote.origem_nome,
    [quote.destino_iata]: quote.destino_nome,
  };
  const legs: FlightCardLeg[] = [toCardLeg(op.ida, "IDA", cidades)];
  if (op.volta) legs.push(toCardLeg(op.volta, "VOLTA", cidades));

  const { parcelas, valor } = bestInstallments(op.total, op.ida.cia);
  return {
    origem_iata: quote.origem_iata,
    origem_cidade: quote.origem_nome,
    destino_iata: quote.destino_iata,
    destino_cidade: quote.destino_nome,
    data_ida: parseStamp(op.ida.partida).dia,
    data_volta: op.volta ? parseStamp(op.volta.partida).dia : null,
    total_formatado: op.total_formatado,
    pax_label: `${op.passageiros} PAX`,
    parcelas: parcelas > 1 ? parcelas : null,
    parcela_formatada: parcelas > 1 ? money(valor) : null,

    legs,
  };
}

function encodeData(data: FlightCardData): string {
  const json = JSON.stringify(data);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

export function flightCardPreviewUrl(data: FlightCardData, base = PUBLIC_BASE): string {
  return `${base}/api/public/flight-card?d=${encodeData(data)}`;
}

/** Fotografa o cartão e devolve os bytes do PNG. */
async function shot(url: string, selector: string, omitBackground: boolean): Promise<Uint8Array> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) throw new Error("BROWSERLESS_TOKEN não configurado");
  const res = await fetch(`${BROWSERLESS_BASE}/screenshot?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "load", timeout: 15000 },
      viewport: { width: 900, height: 600, deviceScaleFactor: 2 },
      selector,
      options: { type: "png", omitBackground },
    }),
  });
  if (!res.ok) throw new Error(`Browserless ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Tenta a captura com a margem transparente ao redor do cartão. Se o
 * Browserless não encontrar o wrapper ou falhar por qualquer motivo, cai
 * para a captura simples do cartão — entregar a arte é mais importante
 * do que ter o fundo transparente.
 */
async function screenshotCard(url: string): Promise<Uint8Array> {
  try {
    const bytes = await shot(url, ".capture", true);
    if (bytes.byteLength > 1000) return bytes;
    throw new Error("captura vazia");
  } catch (e) {
    console.warn("[flight-card] captura transparente falhou, usando fallback:", e);
    return shot(url, ".card", false);
  }
}


/** Gera a arte da opção e devolve os bytes e a URL pública do PNG. */
export async function renderFlightCardAsset(
  data: FlightCardData,
): Promise<{ bytes: Uint8Array; url: string; filename: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bytes = await screenshotCard(flightCardPreviewUrl(data));
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const path = `flight-cards/${filename}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Falha ao salvar a arte: ${error.message}`);
  return { bytes, url: `${PUBLIC_BASE}/api/public/broadcast-media/${path}`, filename };
}

/** Mantém a API usada pelos previews e diagnósticos. */
export async function renderFlightCardImage(data: FlightCardData): Promise<string> {
  return (await renderFlightCardAsset(data)).url;
}
