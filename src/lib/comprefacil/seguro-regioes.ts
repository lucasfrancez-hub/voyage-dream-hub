/**
 * Regiões de destino do seguro viagem da operadora (campo `DestinoCodigo`).
 *
 * A operadora não expõe endpoint de listagem: os códigos abaixo foram
 * confirmados na própria API (a resposta devolve `DestinoCodigo`/`DestinoNome`).
 * Como o motor de pacotes pesquisa por cidade/IATA, casamos o destino com a
 * região correta antes de cotar.
 */

export const REGIOES_SEGURO: Record<number, string> = {
  1: "América do Norte",
  2: "Europa",
  3: "América Central e México",
  4: "América do Sul",
  5: "África",
  6: "Ásia",
  7: "Oriente Médio",
  8: "Oceania",
  9: "Estrangeiro vindo ao Brasil",
  11: "Cartão Anual",
  12: "Doméstico",
};

export const REGIAO_DOMESTICO = 12;

/** País (ISO-2) → região do seguro. */
const PAIS_REGIAO: Record<string, number> = {
  BR: 12,
  // América do Norte
  US: 1, CA: 1,
  // América Central, Caribe e México
  MX: 3, CU: 3, DO: 3, BS: 3, JM: 3, PR: 3, BB: 3, CW: 3, AW: 3, SX: 3, KY: 3,
  CR: 3, SV: 3, GT: 3, HN: 3, NI: 3, PA: 3, BZ: 3, TT: 3, AG: 3, LC: 3, VG: 3,
  // América do Sul
  AR: 4, UY: 4, PY: 4, CL: 4, BO: 4, PE: 4, EC: 4, CO: 4, VE: 4, GY: 4, SR: 4, GF: 4,
  // Europa
  PT: 2, ES: 2, FR: 2, IT: 2, DE: 2, GB: 2, IE: 2, NL: 2, BE: 2, CH: 2, AT: 2,
  DK: 2, NO: 2, SE: 2, FI: 2, IS: 2, PL: 2, CZ: 2, HU: 2, RO: 2, GR: 2, TR: 2,
  RU: 2, HR: 2, SI: 2, SK: 2, BG: 2, RS: 2, UA: 2, MT: 2, CY: 2, LU: 2, MC: 2,
  // África
  ZA: 5, ET: 5, MA: 5, EG: 5, NG: 5, KE: 5, AO: 5, TN: 5, DZ: 5, TZ: 5, GH: 5,
  SN: 5, MZ: 5, NA: 5, BW: 5, CV: 5, MU: 5, SC: 5,
  // Ásia
  JP: 6, KR: 6, CN: 6, HK: 6, TW: 6, SG: 6, TH: 6, IN: 6, MY: 6, ID: 6, PH: 6,
  VN: 6, KH: 6, LA: 6, NP: 6, LK: 6, MV: 6, KZ: 6,
  // Oriente Médio
  AE: 7, QA: 7, IL: 7, SA: 7, JO: 7, BH: 7, KW: 7, OM: 7, LB: 7,
  // Oceania
  AU: 8, NZ: 8, FJ: 8, PF: 8,
};

/** IATA → país (ISO-2) dos aeroportos internacionais mais usados. */
const IATA_PAIS: Record<string, string> = {
  // América do Norte
  MIA: "US", MCO: "US", JFK: "US", EWR: "US", LAX: "US", SFO: "US", ORD: "US",
  ATL: "US", DFW: "US", IAH: "US", BOS: "US", LAS: "US", DEN: "US", SEA: "US",
  PHL: "US", FLL: "US", IAD: "US", TPA: "US", SAN: "US", PHX: "US", HNL: "US",
  YYZ: "CA", YVR: "CA", YUL: "CA", YYC: "CA", YOW: "CA",
  // México / Central / Caribe
  CUN: "MX", MEX: "MX", SJD: "MX", PVR: "MX", GDL: "MX", MTY: "MX",
  PUJ: "DO", SDQ: "DO", HAV: "CU", VRA: "CU", NAS: "BS", MBJ: "JM", KIN: "JM",
  SJU: "PR", AUA: "AW", CUR: "CW", SXM: "SX", BGI: "BB", GCM: "KY",
  SJO: "CR", LIR: "CR", PTY: "PA", GUA: "GT", SAL: "SV", SAP: "HN", RTB: "HN",
  BZE: "BZ", POS: "TT",
  // América do Sul
  EZE: "AR", AEP: "AR", COR: "AR", MDZ: "AR", BRC: "AR", USH: "AR", IGR: "AR",
  MVD: "UY", PDP: "UY", ASU: "PY", SCL: "CL", CJC: "CL", VVI: "BO", LPB: "BO",
  LIM: "PE", CUZ: "PE", UIO: "EC", GYE: "EC", GPS: "EC", BOG: "CO", CTG: "CO",
  MDE: "CO", CLO: "CO", SMR: "CO", CCS: "VE", GEO: "GY", PBM: "SR", CAY: "GF",
  // Europa
  LIS: "PT", OPO: "PT", FNC: "PT", MAD: "ES", BCN: "ES", AGP: "ES", PMI: "ES",
  TFS: "ES", LPA: "ES", SVQ: "ES", VLC: "ES", CDG: "FR", ORY: "FR", NCE: "FR",
  MRS: "FR", LYS: "FR", FCO: "IT", MXP: "IT", LIN: "IT", VCE: "IT", NAP: "IT",
  BLQ: "IT", FLR: "IT", CTA: "IT", FRA: "DE", MUC: "DE", BER: "DE", DUS: "DE",
  HAM: "DE", LHR: "GB", LGW: "GB", STN: "GB", MAN: "GB", EDI: "GB", DUB: "IE",
  AMS: "NL", BRU: "BE", ZRH: "CH", GVA: "CH", VIE: "AT", CPH: "DK", OSL: "NO",
  ARN: "SE", HEL: "FI", KEF: "IS", WAW: "PL", KRK: "PL", PRG: "CZ", BUD: "HU",
  OTP: "RO", ATH: "GR", JTR: "GR", JMK: "GR", IST: "TR", SAW: "TR", AYT: "TR",
  SVO: "RU", DME: "RU", LED: "RU", ZAG: "HR", DBV: "HR", SPU: "HR", LJU: "SI",
  SOF: "BG", BEG: "RS", KBP: "UA", MLA: "MT", LCA: "CY", LUX: "LU",
  // África
  JNB: "ZA", CPT: "ZA", DUR: "ZA", ADD: "ET", CMN: "MA", RAK: "MA", CAI: "EG",
  HRG: "EG", LOS: "NG", ABV: "NG", NBO: "KE", LAD: "AO", TUN: "TN", ALG: "DZ",
  DAR: "TZ", JRO: "TZ", ZNZ: "TZ", ACC: "GH", DKR: "SN", MPM: "MZ", WDH: "NA",
  GBE: "BW", SID: "CV", RAI: "CV", MRU: "MU", SEZ: "SC",
  // Ásia
  NRT: "JP", HND: "JP", KIX: "JP", CTS: "JP", FUK: "JP", ICN: "KR", GMP: "KR",
  PEK: "CN", PKX: "CN", PVG: "CN", CAN: "CN", SHA: "CN", HKG: "HK", TPE: "TW",
  SIN: "SG", BKK: "TH", HKT: "TH", CNX: "TH", DEL: "IN", BOM: "IN", BLR: "IN",
  MAA: "IN", CCU: "IN", KUL: "MY", CGK: "ID", DPS: "ID", MNL: "PH", CEB: "PH",
  SGN: "VN", HAN: "VN", PNH: "KH", REP: "KH", VTE: "LA", KTM: "NP", CMB: "LK",
  MLE: "MV", ALA: "KZ",
  // Oriente Médio
  DXB: "AE", AUH: "AE", DOH: "QA", TLV: "IL", RUH: "SA", JED: "SA", AMM: "JO",
  BAH: "BH", KWI: "KW", MCT: "OM", BEY: "LB",
  // Oceania
  SYD: "AU", MEL: "AU", BNE: "AU", PER: "AU", ADL: "AU", OOL: "AU", CNS: "AU",
  AKL: "NZ", CHC: "NZ", WLG: "NZ", ZQN: "NZ", NAN: "FJ", PPT: "PF",
};

/** Nome de país (ou trecho do rótulo do destino) → ISO-2. */
const NOME_PAIS: Array<[RegExp, string]> = [
  [/\bbrasil\b|\bbrazil\b/i, "BR"],
  [/estados unidos|\busa\b|united states/i, "US"],
  [/canad[áa]/i, "CA"],
  [/m[ée]xico/i, "MX"],
  [/argentina/i, "AR"], [/uruguai|uruguay/i, "UY"], [/paraguai|paraguay/i, "PY"],
  [/chile/i, "CL"], [/bol[íi]via/i, "BO"], [/peru|per[úu]/i, "PE"],
  [/equador|ecuador/i, "EC"], [/col[ôo]mbia/i, "CO"], [/venezuela/i, "VE"],
  [/portugal/i, "PT"], [/espanha|spain/i, "ES"], [/fran[çc]a|france/i, "FR"],
  [/it[áa]lia|italy/i, "IT"], [/alemanha|germany/i, "DE"],
  [/inglaterra|reino unido|united kingdom/i, "GB"], [/irlanda/i, "IE"],
  [/holanda|pa[íi]ses baixos/i, "NL"], [/b[ée]lgica/i, "BE"], [/su[íi][çc]a/i, "CH"],
  [/[áa]ustria/i, "AT"], [/dinamarca/i, "DK"], [/noruega/i, "NO"], [/su[ée]cia/i, "SE"],
  [/finl[âa]ndia/i, "FI"], [/isl[âa]ndia/i, "IS"], [/pol[ôo]nia/i, "PL"],
  [/rep[úu]blica tcheca|tchequia/i, "CZ"], [/hungria/i, "HU"], [/rom[êe]nia/i, "RO"],
  [/gr[ée]cia/i, "GR"], [/turquia/i, "TR"], [/r[úu]ssia/i, "RU"], [/cro[áa]cia/i, "HR"],
  [/[áa]frica do sul/i, "ZA"], [/marrocos/i, "MA"], [/egito/i, "EG"], [/qu[êe]nia/i, "KE"],
  [/tanz[âa]nia/i, "TZ"], [/cabo verde/i, "CV"], [/maur[íi]cio/i, "MU"],
  [/jap[ãa]o/i, "JP"], [/coreia/i, "KR"], [/china/i, "CN"], [/hong kong/i, "HK"],
  [/tailandia|tail[âa]ndia/i, "TH"], [/singapura/i, "SG"], [/[íi]ndia/i, "IN"],
  [/indon[ée]sia|bali/i, "ID"], [/vietn[ãa]/i, "VN"], [/filipinas/i, "PH"],
  [/maldivas/i, "MV"], [/nepal/i, "NP"],
  [/emirados|dubai|abu dhabi/i, "AE"], [/catar|qatar/i, "QA"], [/israel/i, "IL"],
  [/ar[áa]bia saudita/i, "SA"], [/jord[âa]nia/i, "JO"],
  [/austr[áa]lia/i, "AU"], [/nova zel[âa]ndia/i, "NZ"], [/fiji/i, "FJ"], [/taiti|tahiti/i, "PF"],
  [/rep[úu]blica dominicana|punta cana/i, "DO"], [/cuba/i, "CU"], [/bahamas/i, "BS"],
  [/jamaica/i, "JM"], [/porto rico/i, "PR"], [/aruba/i, "AW"], [/cura[çc]ao/i, "CW"],
  [/costa rica/i, "CR"], [/panam[áa]/i, "PA"], [/guatemala/i, "GT"],
];

/** Descobre o país (ISO-2) a partir do IATA e/ou do rótulo do destino. */
export function paisDoDestino(p: { iata?: string | null; destino?: string | null }): string | null {
  const iata = (p.iata ?? "").trim().toUpperCase();
  if (iata && IATA_PAIS[iata]) return IATA_PAIS[iata]!;
  const texto = p.destino ?? "";
  if (texto) {
    for (const [re, iso] of NOME_PAIS) if (re.test(texto)) return iso;
  }
  // IATA brasileiro conhecido pelo motor não entra no mapa acima (só internacionais)
  if (iata && iata.length === 3) return null;
  return null;
}

/**
 * Região do seguro para o destino pesquisado.
 * Sem informação suficiente, mantém Doméstico (nunca cota fora do Brasil por engano).
 */
export function regiaoSeguroDoDestino(p: {
  iata?: string | null;
  destino?: string | null;
  internacional?: boolean;
}): number {
  const pais = paisDoDestino(p);
  if (pais) return PAIS_REGIAO[pais] ?? (pais === "BR" ? REGIAO_DOMESTICO : 4);
  return p.internacional ? 4 : REGIAO_DOMESTICO;
}
