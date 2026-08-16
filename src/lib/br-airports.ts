/**
 * Aeroportos brasileiros (IATA) — usado para classificar promoções em
 * NACIONAL x INTERNACIONAL tanto no backend quanto na tela de curadoria.
 * Client-safe: nenhum import de servidor aqui.
 */
export const BR_IATA = new Set([
  // Sudeste
  "GRU","CGH","VCP","GIG","SDU","CNF","PLU","UDI","UBA","IPN","MOC","JDF","VIX","SBJ",
  "RAO","SJP","PPB","MII","BAU","SOD","AQA","VCP","SJK","QDC","JTC","ITU","ORX",
  // Sul
  "CWB","LDB","MGF","FLN","POA","NVT","JOI","XAP","CXJ","PET","URG","IJU","PFB","CCM","BNU","GEL","SQX","LOI","CAC","IGU","TOW","PGZ","APU",
  // Centro-Oeste
  "BSB","CGB","CGR","GYN","ROO","BPG","CMG","DOU","AAG","LDB",
  // Nordeste
  "SSA","REC","FOR","NAT","MCZ","AJU","THE","SLZ","JPA","BPS","IOS","PNZ","JDO","PHB","CPV","IMP","URC","VDC","LEC","STZ","TXF","BRA","GNM","MVF","JJD","PTO",
  // Norte
  "BEL","MAO","MCP","PVH","RBR","BVB","STM","PMW","MAB","ATM","AUX","TFF","CZS","TBT","OIA","JPR","VLP","IZA","GRP",
  // Outros usuais
  "PMG","CFB","SJZ","MEA","GVR","POO","VAG","PNZ","JPA","QSC",
  // Destinos turísticos que faltavam (evita virar "internacional")
  "BYO","CAW","MEU","LEC","CKS","DIQ","BVH","OPS","AFL","JTI","GUZ","ARU","FEC",
  "PET","CXJ","CCM","JJG","JOI","SBJ","ITB","RIA","BAT","CFC","QCR","TFL","JDR",
  // Códigos de cidade (multi-aeroporto) usados pelo motor
  "SAO","RIO","BHZ",
]);

export function isBrIata(iata?: string | null): boolean {
  return !!iata && BR_IATA.has(iata.trim().toUpperCase());
}

/**
 * nacional = DESTINO no Brasil (independente da origem).
 * Voo saindo de hub nacional para destino brasileiro nunca é internacional.
 */
export function scopeOfRoute(_origin: string, destination: string): "nacional" | "internacional" {
  return isBrIata(destination) ? "nacional" : "internacional";
}

