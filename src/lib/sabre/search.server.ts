/**
 * Sabre — Bargain Finder Max (busca aérea). SERVER-ONLY.
 *
 * Um único fluxo cobre ida, ida e volta e multitrecho: o que muda é a
 * quantidade de OriginDestinationInformation enviada (1 a 6).
 */
import { SabreError, sabreAmbiente, sabrePcc, sabreRequest } from "./client.server";
import type {
  SabreBagagem,
  SabreBuscaInput,
  SabreBuscaResultado,
  SabreOferta,
  SabrePerna,
  SabreSegmento,
} from "./types";

const BFM_PATH = "/v4.3.0/shop/flights?mode=live";

type Any = Record<string, unknown>;
const obj = (v: unknown): Any => (v && typeof v === "object" ? (v as Any) : {});
const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v as Any[]) : v ? [obj(v)] : []);
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function minutosEntre(a: string, b: string): number {
  const ta = Date.parse(`${a}Z`);
  const tb = Date.parse(`${b}Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.max(0, Math.round((tb - ta) / 60000));
}

function montarPayload(input: SabreBuscaInput) {
  const adultos = Math.max(1, Math.min(9, input.adultos || 1));
  const criancas = Math.max(0, Math.min(8, input.criancas ?? 0));
  const bebes = Math.max(0, Math.min(8, input.bebes ?? 0));

  const passageiros: Any[] = [{ Code: "ADT", Quantity: adultos }];
  if (criancas > 0) passageiros.push({ Code: "CNN", Quantity: criancas });
  if (bebes > 0) passageiros.push({ Code: "INF", Quantity: bebes });

  const legs = input.trechos.map((t, i) => ({
    RPH: String(i + 1),
    DepartureDateTime: `${t.data}T00:00:00`,
    OriginLocation: { LocationCode: t.origem.toUpperCase() },
    DestinationLocation: { LocationCode: t.destino.toUpperCase() },
    ...(input.somenteDiretos ? { TPA_Extensions: { ConnectionCount: { Number: 0 } } } : {}),
  }));

  const vendorPrefs = input.companhia
    ? { VendorPref: [{ Code: input.companhia.toUpperCase(), PreferLevel: "Preferred" }] }
    : undefined;

  return {
    OTA_AirLowFareSearchRQ: {
      Version: "4.3.0",
      POS: {
        Source: [
          {
            PseudoCityCode: sabrePcc(),
            RequestorID: {
              Type: "1",
              ID: "1",
              CompanyName: { Code: "TN" },
            },
          },
        ],
      },
      OriginDestinationInformation: legs,
      TravelPreferences: {
        ...(input.cabine ? { CabinPref: [{ Cabin: input.cabine, PreferLevel: "Preferred" }] } : {}),
        ...(vendorPrefs ? { VendorPref: vendorPrefs.VendorPref } : {}),
        TPA_Extensions: {
          NumTrips: { Number: Math.max(1, Math.min(50, input.maxResultados ?? 20)) },
        },
      },
      TravelerInfoSummary: {
        SeatsRequested: [adultos + criancas],
        AirTravelerAvail: [{ PassengerTypeQuantity: passageiros }],
        PriceRequestInformation: {
          CurrencyCode: input.moeda ?? "BRL",
          TPA_Extensions: { BrandedFareIndicators: { MultipleBrandedFares: true } },
        },
      },
      TPA_Extensions: {
        IntelliSellTransaction: {
          RequestType: { Name: "50ITINS" },
        },
      },
    },
  };
}

function extrairBagagem(fare: Any): SabreBagagem | null {
  const bag = obj(obj(fare)["BaggageInformation"]);
  const lista = arr(bag["Allowance"] ?? fare["BaggageInformation"]);
  const primeira = obj(lista[0]);
  const alw = obj(primeira["Allowance"] ?? primeira);
  const pecas = num(alw["Pieces"]);
  const peso = num(alw["Weight"]);
  if (!pecas && !peso) return null;
  return {
    pecas: pecas || null,
    peso: peso || null,
    unidade: str(alw["Unit"]) || null,
    descricao: str(alw["Description"]) || null,
  };
}

function normalizarOferta(itin: Any, moeda: string, index: number): SabreOferta | null {
  const pricing = obj(arr(obj(itin["AirItineraryPricingInfo"]))[0] ?? itin["AirItineraryPricingInfo"]);
  const totalFare = obj(obj(pricing["ItinTotalFare"])["TotalFare"]);
  const baseFare = obj(obj(pricing["ItinTotalFare"])["BaseFare"]);
  const taxes = obj(obj(pricing["ItinTotalFare"])["Taxes"]);

  const total = num(totalFare["Amount"]);
  const tarifa = num(baseFare["Amount"]);
  const taxas = num(taxes["Amount"]) || Math.max(0, total - tarifa);

  const airItinerary = obj(itin["AirItinerary"]);
  const odos = arr(obj(airItinerary["OriginDestinationOptions"])["OriginDestinationOption"]);
  if (odos.length === 0) return null;

  const pernas: SabrePerna[] = odos.map((odo) => {
    const segs = arr(odo["FlightSegment"]);
    const segmentos: SabreSegmento[] = segs.map((s) => {
      const partida = str(s["DepartureDateTime"]);
      const chegada = str(s["ArrivalDateTime"]);
      return {
        companhia: str(obj(s["MarketingAirline"])["Code"]),
        companhiaOperadora: str(obj(s["OperatingAirline"])["Code"]) || null,
        voo: str(s["FlightNumber"]),
        origem: str(obj(s["DepartureAirport"])["LocationCode"]),
        destino: str(obj(s["ArrivalAirport"])["LocationCode"]),
        partida,
        chegada,
        duracaoMin: num(s["ElapsedTime"]) || minutosEntre(partida, chegada),
        cabine: str(obj(s["TPA_Extensions"])["Cabin"] ?? "") || null,
        classeTarifaria: str(s["ResBookDesigCode"]) || null,
        equipamento: str(obj(arr(s["Equipment"])[0])["AirEquipType"]) || null,
      };
    });
    const primeiro = segmentos[0];
    const ultimo = segmentos[segmentos.length - 1];
    return {
      origem: primeiro?.origem ?? "",
      destino: ultimo?.destino ?? "",
      partida: primeiro?.partida ?? "",
      chegada: ultimo?.chegada ?? "",
      duracaoMin: num(odo["ElapsedTime"]) || minutosEntre(primeiro?.partida ?? "", ultimo?.chegada ?? ""),
      paradas: Math.max(0, segmentos.length - 1),
      segmentos,
    };
  });

  const passageirosInfo = arr(obj(pricing["PTC_FareBreakdowns"])["PTC_FareBreakdown"]);
  const passageiros =
    passageirosInfo.reduce(
      (acc, p) => acc + num(obj(obj(p["PassengerTypeQuantity"]))["Quantity"]),
      0,
    ) || 1;

  const primeiraTarifa = obj(passageirosInfo[0]);
  const familia =
    str(obj(obj(primeiraTarifa["FareBasisCodes"])["FareBasisCode"])["BrandName"]) ||
    str(obj(obj(pricing["TPA_Extensions"])["BrandedFare"])["Name"]) ||
    null;

  return {
    chave: str(itin["SequenceNumber"]) || `sabre-${index + 1}`,
    companhia: pernas[0]?.segmentos[0]?.companhia ?? "",
    moeda: str(totalFare["CurrencyCode"]) || moeda,
    tarifa,
    taxas,
    total,
    totalPorPassageiro: passageiros > 0 ? Math.round((total / passageiros) * 100) / 100 : total,
    passageiros,
    reembolsavel: obj(pricing["TPA_Extensions"])["Refundable"] === true ? true : null,
    familiaTarifaria: familia,
    bagagem: extrairBagagem(primeiraTarifa),
    pernas,
  };
}

export async function sabreBuscarVoos(input: SabreBuscaInput): Promise<SabreBuscaResultado> {
  if (!input.trechos?.length) throw new SabreError("Informe ao menos um trecho", 400);
  if (input.trechos.length > 6) throw new SabreError("Máximo de 6 trechos por busca", 400);

  const moeda = input.moeda ?? "BRL";
  const resposta = await sabreRequest<Any>(BFM_PATH, { body: montarPayload(input) });

  const rs = obj(resposta["OTA_AirLowFareSearchRS"] ?? resposta["groupedItineraryResponse"] ?? resposta);
  const itinerarios = arr(obj(obj(rs["PricedItineraries"])["PricedItinerary"] ?? rs["PricedItineraries"]));

  const ofertas = itinerarios
    .map((itin, i) => normalizarOferta(itin, moeda, i))
    .filter((o): o is SabreOferta => !!o && o.total > 0)
    .sort((a, b) => a.total - b.total);

  const erros = obj(rs["Errors"]);
  const aviso = Object.keys(erros).length > 0 ? JSON.stringify(erros).slice(0, 400) : null;

  return {
    ambiente: sabreAmbiente(),
    moeda,
    totalOfertas: ofertas.length,
    ofertas,
    aviso: ofertas.length === 0 ? (aviso ?? "Nenhum itinerário retornado pelo Sabre") : aviso,
  };
}
