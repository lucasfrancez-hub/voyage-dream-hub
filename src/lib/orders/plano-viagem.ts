/**
 * Converte um pedido (OrderDetail) no formato do comprovante aéreo VIA AIR
 * (mesmo componente usado no plano de viagem da PassHub).
 */
import type { OrderDetail, OrderItem, OrderPassenger } from "@/lib/orders.functions";
import { findAirline } from "@/lib/airlines";
import type {
  ComprovanteReservaDados,
  ComprovantePax,
  ComprovanteVoo,
} from "@/components/passhub/ComprovanteReserva";

type Det = Record<string, unknown>;
const det = (i: OrderItem): Det => (i.details ?? {}) as Det;
const s = (v: unknown): string => String(v ?? "").trim();

function boolOrNull(v: unknown): boolean | null {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return null;
}

export function flightGroupKeyOf(it: OrderItem): string {
  const d = det(it);
  const importGroup = s(d.import_group_id);
  if (importGroup) return `g:${importGroup}`;
  const carrier = s(d.carrier_locator).toUpperCase();
  if (carrier) return `c:${carrier}`;
  const sup = s(it.supplier_locator).toUpperCase();
  if (sup) return `s:${sup}`;
  return `i:${it.id}`;
}

function tituloGrupo(indice: number, total: number, temVolta: boolean): string {
  if (total <= 1) return "IDA";
  if (total === 2 && temVolta) return indice === 0 ? "IDA" : "VOLTA";
  return `TRECHO ${indice + 1}`;
}

/** Mesma resolução usada na tela do pedido: prefixo do voo, IATA e nome. */
function companhiaDe(d: Det): string {
  const numero = s(d.flight_number).toUpperCase();
  const prefixo = numero.match(/^([A-Z0-9]{2})\s*\d/)?.[1] ?? "";
  const iata = s(d.airline_iata).toUpperCase();
  const nome = s(d.airline) || s(d.carrier) || s(d.marketing_carrier);
  const hit = findAirline(prefixo) ?? findAirline(iata) ?? findAirline(nome);
  return hit?.name ?? nome ?? "";
}

function paraVoo(it: OrderItem, snap: Det | null): ComprovanteVoo {
  const d = det(it);
  // Padrão igual ao da tela de pedidos: mochila e bagagem de mão inclusas,
  // exceto quando desmarcadas; despachada é opt-in e pode vir do pacote.
  let despachada = boolOrNull(d.checked_bag) ?? false;
  let despachadaQtd = Number(d.checked_bag_qty ?? d.checked_bags ?? 0) || undefined;
  if (!despachada && snap) {
    const dir = s(d.direction) === "return" ? "return_flight" : "outbound_flight";
    const src = snap[dir];
    if (src && typeof src === "object") {
      const sd = src as Det;
      despachada = boolOrNull(sd.checked_bag) ?? false;
      despachadaQtd = despachadaQtd ?? (Number(sd.checked_bag_qty ?? sd.checked_bags ?? 0) || undefined);
    }
  }
  return {
    companhia: companhiaDe(d) || s(d.supplier_name),
    numeroVoo: s(d.flight_number),
    origem: (s(d.from_iata) || s(d.origin)).toUpperCase(),
    destino: (s(d.to_iata) || s(d.destination)).toUpperCase(),
    partida: s(d.depart_at) || s(d.departure),
    chegada: s(d.arrive_at) || s(d.arrival),
    duracao: s(d.duration),
    classe: s(d.cabin_class) || s(d.cabin),
    familiaTarifaria: s(d.fare_class) || s(d.fare_family),
    bagagem: {
      itemPessoal: boolOrNull(d.personal_item) ?? true,
      mao: boolOrNull(d.carry_on) ?? true,
      despachada,
      despachadaQtd,
    },
  };
}

function bilheteDe(p: OrderPassenger, locadores: string[]): string {
  const map = (p.tickets ?? {}) as Record<string, string>;
  for (const loc of locadores) {
    const t = s(map[loc]);
    if (t) return t;
  }
  const primeiro = Object.values(map).map(s).find(Boolean);
  return primeiro || s(p.ticket_number);
}

/** Só faz sentido quando o pedido tem trechos aéreos. */
export function pedidoTemAereo(detail: OrderDetail): boolean {
  return detail.items.some((i) => i.kind === "flight" && i.status !== "cancelled");
}

function dataCurta(v: unknown): string {
  const t = s(v);
  if (!t) return "";
  const d = new Date(t.length <= 10 ? `${t}T00:00:00` : t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleDateString("pt-BR");
}

/** Hospedagens, transfers, passeios e demais serviços do pedido. */
function outrasReservasDo(detail: OrderDetail) {
  return detail.items
    .filter((i) => i.kind !== "flight" && i.status !== "cancelled")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((it) => {
      const d = det(it);
      const hotel = it.kind === "hotel";
      const inicio = dataCurta(d.check_in ?? d.checkin ?? d.date_from);
      const fim = dataCurta(d.check_out ?? d.checkout ?? d.date_to);
      const detalhes: string[] = [];
      if (hotel) {
        if (s(d.city) || s(d.address)) detalhes.push([s(d.city), s(d.address)].filter(Boolean).join(" • "));
        if (s(d.room)) detalhes.push(`Acomodação: ${s(d.room)}`);
        if (s(d.board)) detalhes.push(`Regime: ${s(d.board)}`);
        if (s(d.nights)) detalhes.push(`${s(d.nights)} noite(s)`);
        if (s(d.guests)) detalhes.push(`${s(d.guests)} hóspede(s)`);
      } else {
        if (s(d.category)) detalhes.push(s(d.category));
        if (s(d.quantity)) detalhes.push(`Quantidade: ${s(d.quantity)}`);
        if (s(d.time_from)) detalhes.push(`Início: ${s(d.time_from)}`);
        if (s(d.description)) detalhes.push(s(d.description));
      }
      if (s(d.supplier_name)) detalhes.push(`Fornecedor: ${s(d.supplier_name)}`);
      if (s(d.notes)) detalhes.push(s(d.notes));

      return {
        tipo: hotel ? "HOSPEDAGEM" : "SERVIÇO",
        titulo: it.title || (hotel ? s(d.hotel_name) : "Serviço"),
        localizador: s(it.supplier_locator) || undefined,
        periodo: [inicio, fim].filter(Boolean).join(" – "),
        detalhes: detalhes.filter(Boolean),
      };
    });
}


export function pedidoParaComprovante(
  detail: OrderDetail,
  opts?: { ocultarValores?: boolean },
): ComprovanteReservaDados {
  const voosItens = detail.items
    .filter((i) => i.kind === "flight" && i.status !== "cancelled")
    .sort((a, b) => {
      const da = s(det(a).depart_at) || s(det(a).departure);
      const db = s(det(b).depart_at) || s(det(b).departure);
      if (da && db && da !== db) return da < db ? -1 : 1;
      return a.sort_order - b.sort_order;
    });

  // Agrupa por sentido (ida / volta / trechos), preservando a ordem cronológica.
  const ordem: string[] = [];
  const porSentido = new Map<string, OrderItem[]>();
  for (const it of voosItens) {
    const d = det(it);
    const chave = `${flightGroupKeyOf(it)}|${s(d.direction) || "outbound"}`;
    if (!porSentido.has(chave)) {
      porSentido.set(chave, []);
      ordem.push(chave);
    }
    porSentido.get(chave)!.push(it);
  }

  const snapPacote =
    detail.order.packageSnapshot && typeof detail.order.packageSnapshot === "object"
      ? (detail.order.packageSnapshot as Det)
      : null;

  const temVolta = voosItens.some((it) => s(det(it).direction) === "return");
  const grupos = ordem.map((chave, i) => ({
    titulo: tituloGrupo(i, ordem.length, temVolta),
    voos: (porSentido.get(chave) ?? []).map((it) => paraVoo(it, snapPacote)),
  }));

  const locadores = Array.from(
    new Set(
      voosItens
        .flatMap((it) => [s(det(it).carrier_locator), s(it.supplier_locator)])
        .filter(Boolean),
    ),
  );

  const emitido = detail.passengers.some((p) => bilheteDe(p, locadores));

  const passageiros: ComprovantePax[] = detail.passengers.map((p) => ({
    nome: p.full_name,
    tipo: p.passenger_type || "ADT",
    documento: p.doc_type === "passport" ? p.passport_number ?? undefined : p.cpf ?? p.document ?? undefined,
    documentoTipo: p.doc_type === "passport" ? "Passaporte" : "CPF",
    nascimento: p.birth_date ?? undefined,
    bilhete: bilheteDe(p, locadores) || undefined,
  }));

  const primeiro = voosItens[0];
  const ultimo = voosItens[voosItens.length - 1];
  const order = detail.order;

  return {
    emitido,
    localizador: s(order.airlineLocator) || locadores[0] || order.orderNumber,
    localizadorCompanhia: s(det(primeiro ?? ({} as OrderItem)).carrier_locator) || undefined,
    companhia: primeiro ? companhiaDe(det(primeiro)) : "",
    criadaEm: order.createdAt,
    consultor: order.sellerName ?? undefined,
    origem: primeiro ? (s(det(primeiro).from_iata) || s(det(primeiro).origin)).toUpperCase() : "",
    destino: ultimo ? (s(det(ultimo).to_iata) || s(det(ultimo).destination)).toUpperCase() : "",
    total: order.totalPrice ?? 0,
    ocultarValores: opts?.ocultarValores,
    passageiros,
    grupos,
    outrasReservas: outrasReservasDo(detail),

  };
}
