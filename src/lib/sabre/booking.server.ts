/**
 * Sabre — reserva (PNR). SERVER-ONLY.
 *
 * Regra de segurança: nada aqui roda sem confirmação explícita do operador
 * (`confirmar: true`) e sem ambiente definido. Em CERT a reserva é fictícia;
 * em PROD gera PNR de verdade no GDS.
 */
import { SabreError, sabreAmbiente, sabreRequest } from "./client.server";
import type { SabrePassageiro, SabrePnrResultado } from "./types";

type Any = Record<string, unknown>;
const obj = (v: unknown): Any => (v && typeof v === "object" ? (v as Any) : {});
const arr = (v: unknown): Any[] => (Array.isArray(v) ? (v as Any[]) : v ? [obj(v)] : []);

export type SabreSegmentoReserva = {
  companhia: string;
  voo: string;
  classe: string;
  origem: string;
  destino: string;
  /** yyyy-mm-dd */
  data: string;
  /** HH:mm local */
  partida: string;
  chegada: string;
  assentos: number;
};

export type SabreReservaInput = {
  segmentos: SabreSegmentoReserva[];
  passageiros: SabrePassageiro[];
  telefoneAgencia: string;
  emailContato?: string | null;
  /** Trava de segurança: precisa vir true. */
  confirmar: boolean;
  /** Emite o PNR (ER) ou só monta e devolve sem salvar. */
  salvar?: boolean;
};

function nomePax(p: SabrePassageiro, index: number) {
  return {
    NameNumber: `${index + 1}.1`,
    NameReference: p.tipo === "ADT" ? undefined : p.tipo,
    PassengerType: p.tipo,
    GivenName: p.nome.trim().toUpperCase(),
    Surname: p.sobrenome.trim().toUpperCase(),
  };
}

export async function sabreCriarPnr(input: SabreReservaInput): Promise<SabrePnrResultado> {
  if (!input.confirmar) throw new SabreError("Reserva não confirmada pelo operador", 400);
  if (!input.segmentos.length) throw new SabreError("Informe os segmentos da reserva", 400);
  if (!input.passageiros.length) throw new SabreError("Informe ao menos um passageiro", 400);

  const body = {
    CreatePassengerNameRecordRQ: {
      version: "2.5.0",
      targetCity: undefined,
      haltOnAirPriceError: true,
      TravelItineraryAddInfo: {
        AgencyInfo: {
          Address: {
            AddressLine: "VIA AIR VIAGENS",
            CityName: "PARANAVAI",
            CountryCode: "BR",
            PostalCode: "87701000",
            StateCountyProv: { StateCode: "PR" },
            StreetNmbr: "HOME OFFICE",
          },
          Ticketing: { TicketType: "7TAW" },
        },
        CustomerInfo: {
          ContactNumbers: {
            ContactNumber: [{ NumberType: "A", Phone: input.telefoneAgencia, PhoneUseType: "H" }],
          },
          ...(input.emailContato
            ? { Email: [{ Address: input.emailContato, Type: "CC" }] }
            : {}),
          PersonName: input.passageiros.map(nomePax),
        },
      },
      AirBook: {
        HaltOnStatus: [{ Code: "LL" }, { Code: "NN" }, { Code: "NO" }, { Code: "UC" }, { Code: "US" }],
        OriginDestinationInformation: {
          FlightSegment: input.segmentos.map((s, i) => ({
            ArrivalDateTime: `${s.data}T${s.chegada}:00`,
            DepartureDateTime: `${s.data}T${s.partida}:00`,
            FlightNumber: s.voo,
            NumberInParty: String(s.assentos),
            ResBookDesigCode: s.classe,
            Status: "NN",
            OriginLocation: { LocationCode: s.origem.toUpperCase() },
            DestinationLocation: { LocationCode: s.destino.toUpperCase() },
            MarketingAirline: { Code: s.companhia.toUpperCase(), FlightNumber: s.voo },
            SegmentNumber: String(i + 1),
          })),
        },
        RedisplayReservation: { NumAttempts: 5, WaitInterval: 1000 },
      },
      AirPrice: [
        {
          PriceRequestInformation: {
            Retain: true,
            OptionalQualifiers: {
              PricingQualifiers: {
                PassengerType: input.passageiros.map((p) => ({ Code: p.tipo, Quantity: "1" })),
              },
            },
          },
        },
      ],
      PostProcessing: {
        RedisplayReservation: { waitInterval: 1000 },
        ...(input.salvar === false ? {} : { EndTransaction: { Source: { ReceivedFrom: "VIAAIR" } } }),
      },
    },
  };

  const resposta = await sabreRequest<Any>("/v2.5.0/passenger/records?mode=create", { body });
  const rs = obj(resposta["CreatePassengerNameRecordRS"] ?? resposta);
  const localizador =
    String(
      obj(rs["ItineraryRef"])["ID"] ??
        obj(obj(rs["TravelItinerary"])["ItineraryRef"])["ID"] ??
        "",
    ) || "";

  if (!localizador) {
    const erro = arr(obj(rs["ApplicationResults"])["Error"]);
    throw new SabreError("Sabre não retornou localizador", 502, erro.length ? erro : rs);
  }

  return { localizador, criadoEm: new Date().toISOString(), bruto: sabreAmbiente() === "cert" ? JSON.stringify(rs).slice(0, 20000) : null };
}

export async function sabreConsultarPnr(localizador: string): Promise<string> {
  const codigo = localizador.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(codigo)) throw new SabreError("Localizador inválido", 400);
  const resposta = await sabreRequest<Any>(
    `/v1/trip/orders/getBooking`,
    { body: { confirmationId: codigo } },
  );
  return JSON.stringify(obj(resposta)).slice(0, 40000);
}

export async function sabreCancelarPnr(localizador: string, confirmar: boolean): Promise<{ ok: boolean }> {
  if (!confirmar) throw new SabreError("Cancelamento não confirmado", 400);
  const codigo = localizador.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(codigo)) throw new SabreError("Localizador inválido", 400);
  await sabreRequest<Any>("/v1/trip/orders/cancelBooking", {
    body: { confirmationId: codigo, cancelAll: true, retrieveBooking: false },
  });
  return { ok: true };
}
