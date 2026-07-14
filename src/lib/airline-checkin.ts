// Monta a URL de check-in / "minhas viagens" das cias que já validamos.
// Usada pra pré-preencher o campo `airline_checkin_url` na importação (vira QR
// clicável no voucher do cliente).

export type BuildCheckinUrlInput = {
  airlineIata?: string | null;
  flightNumber?: string | null; // usado só pra inferir a cia se airlineIata vier vazio
  locator?: string | null;      // PNR da cia
  orderNumber?: string | null;  // "número de compra" (LATAM: LA...LVF)
  lastName?: string | null;     // sobrenome do titular (última palavra do nome)
  originIata?: string | null;   // IATA da origem do 1º trecho
};

function pickAirline(input: BuildCheckinUrlInput): "LA" | "G3" | "AD" | null {
  const iata = (input.airlineIata ?? "").trim().toUpperCase();
  if (iata === "LA" || iata === "G3" || iata === "AD") return iata;
  const fn = (input.flightNumber ?? "").trim().toUpperCase();
  const m = fn.match(/^([A-Z]{1,2}[0-9]?|[0-9][A-Z])/);
  const prefix = m?.[1];
  if (prefix === "LA" || prefix === "G3" || prefix === "AD") return prefix;
  return null;
}

function normLastName(s: string | null | undefined): string {
  if (!s) return "";
  const parts = s.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

export function buildAirlineCheckinUrl(input: BuildCheckinUrlInput): string | null {
  const airline = pickAirline(input);
  if (!airline) return null;
  const loc = (input.locator ?? "").trim().toUpperCase();
  const orderNum = (input.orderNumber ?? "").trim().toUpperCase();
  const last = normLastName(input.lastName);
  const origin = (input.originIata ?? "").trim().toUpperCase();

  if (airline === "LA") {
    // LATAM: número de compra (orderId) + sobrenome
    const id = orderNum || loc;
    if (!id || !last) return null;
    const q = new URLSearchParams({ orderId: id, lastname: last });
    return `https://www.latamairlines.com/br/pt/minhas-viagens/second-detail/?${q.toString()}`;
  }

  if (airline === "G3") {
    // GOL: localizador + origem + sobrenome
    if (!loc || !last || !origin) return null;
    const q = new URLSearchParams({ codigoReserva: loc, origem: origin, sobrenome: last });
    return `https://www.voegol.com.br/minhas-viagens?${q.toString()}`;
  }

  if (airline === "AD") {
    // Azul: localizador + origem
    if (!loc || !origin) return null;
    const q = new URLSearchParams({ pnr: loc, origin });
    return `https://www.voeazul.com.br/minhas-reservas?${q.toString()}`;
  }

  return null;
}
