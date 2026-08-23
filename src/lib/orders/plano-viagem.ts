/**
 * Converte um pedido (OrderDetail) no formato do comprovante aéreo VIA AIR
 * (mesmo componente usado no plano de viagem da PassHub).
 */
import type { OrderDetail, OrderItem, OrderPassenger } from "@/lib/orders.functions";
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

function paraVoo(it: OrderItem): ComprovanteVoo {
  const d = det(it);
  return {
    companhia: s(d.airline) || s(d.carrier) || s(d.supplier_name),
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
      mao: boolOrNull(d.carry_on),
      despachada: boolOrNull(d.checked_bag),
      despachadaQtd: Number(d.checked_bag_qty ?? d.checked_bags ?? 0) || undefined,
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

  const temVolta = voosItens.some((it) => s(det(it).direction) === "return");
  const grupos = ordem.map((chave, i) => ({
    titulo: tituloGrupo(i, ordem.length, temVolta),
    voos: (porSentido.get(chave) ?? []).map(paraVoo),
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
    companhia: primeiro ? s(det(primeiro).airline) : "",
    criadaEm: order.createdAt,
    consultor: order.sellerName ?? undefined,
    origem: primeiro ? (s(det(primeiro).from_iata) || s(det(primeiro).origin)).toUpperCase() : "",
    destino: ultimo ? (s(det(ultimo).to_iata) || s(det(ultimo).destination)).toUpperCase() : "",
    total: order.totalPrice ?? 0,
    ocultarValores: opts?.ocultarValores,
    passageiros,
    grupos,
  };
}
