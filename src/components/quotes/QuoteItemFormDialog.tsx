/**
 * Formulário manual de item de orçamento (hospedagem, aéreo ou serviço).
 *
 * Usa EXATAMENTE o mesmo diálogo da tela de Pedidos (`@/components/orders/ItemDialog`).
 * Aqui só fazemos a tradução entre o modelo do pedido (title + details) e o
 * modelo normalizado do orçamento (NormalizedHotel / NormalizedFlight / NormalizedGenericItem).
 */
import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ItemDialog, type ItemDialogSavePayload } from "@/components/orders/ItemDialog";
import { salvarItemOrcamento } from "@/lib/quotes/items.functions";
import type {
  NormalizedFlight, NormalizedFlightSegment, NormalizedGenericItem, NormalizedHotel,
} from "@/lib/quotes/types";
import type { OrderItem } from "@/lib/orders.functions";
import type { Json } from "@/integrations/supabase/types";

export type QuoteItemKind = "hotel" | "flight" | "service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  optionNumber: number;
  kind: QuoteItemKind;
  /** Índice do item quando estiver editando; null = novo. */
  index?: number | null;
  hotel?: NormalizedHotel | null;
  flight?: NormalizedFlight | null;
  service?: NormalizedGenericItem | null;
  onSaved: () => void;
};

type Dict = Record<string, string | number | boolean>;

function txt(v: unknown): string {
  return v == null ? "" : String(v);
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  let normalizado = s;
  if (temVirgula && temPonto) {
    // "11.585,85" → milhar com ponto e decimal com vírgula
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    normalizado = s.replace(",", ".");
  } else if (temPonto) {
    // Já normalizado ("11585.85"); só é milhar se houver grupos exatos de 3 dígitos
    const soMilhar = /^-?\d{1,3}(\.\d{3})+$/.test(s);
    normalizado = soMilhar ? s.replace(/\./g, "") : s;
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}
/** Corta pra caber no input datetime-local. */
function paraInputDateTime(v?: string | null): string {
  if (!v) return "";
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}`;
  const d = v.match(/^(\d{4}-\d{2}-\d{2})$/);
  return d ? `${d[1]}T00:00` : "";
}
function soData(v?: string | null): string {
  if (!v) return "";
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}
const d = (o: Json | undefined): Dict => (o ?? {}) as Dict;

/** Aéreo do orçamento → item principal (trecho 1) + irmãos (demais trechos). */
function flightParaItem(f: NormalizedFlight | null | undefined): { main: OrderItem | null; siblings: OrderItem[] } {
  if (!f) return { main: null, siblings: [] };
  const direction = f.direction === "INBOUND" ? "return" : "outbound";
  const segs: NormalizedFlightSegment[] = f.segments?.length
    ? f.segments
    : [{
        airline: f.airline ?? null,
        fromIata: f.fromIata ?? null,
        toIata: f.toIata ?? null,
        departure: f.departure ?? null,
        arrival: f.arrival ?? null,
      }];
  const paraDetails = (s: NormalizedFlightSegment, primeiro: boolean): Dict => ({
    direction,
    airline: txt(s.airline ?? f.airline),
    flight_number: txt(s.flightNumber),
    from_iata: txt(s.fromIata).toUpperCase(),
    to_iata: txt(s.toIata).toUpperCase(),
    depart_at: paraInputDateTime(s.departure),
    arrive_at: paraInputDateTime(s.arrival),
    cabin_class: txt(s.cabin),
    ...(primeiro && f.total != null ? { value: String(f.total) } : {}),
  });
  const item = (details: Dict, i: number): OrderItem => ({
    id: `seg-${i}`,
    order_id: "",
    kind: "flight",
    status: "confirmed",
    title: "",
    supplier_locator: null,
    details: details as unknown as Json,
    sort_order: i,
  });
  return {
    main: item(paraDetails(segs[0]!, true), 0),
    siblings: segs.slice(1).map((s, i) => item(paraDetails(s, false), i + 1)),
  };
}

function hotelParaItem(h: NormalizedHotel | null | undefined): OrderItem | null {
  if (!h) return null;
  const details: Dict = {
    hotel_name: txt(h.name),
    city: txt(h.city),
    address: txt(h.address),
    check_in: soData(h.checkin),
    check_out: soData(h.checkout),
    nights: txt(h.nights),
    room: txt(h.roomDescription),
    board: txt(h.board),
  };
  if (h.total != null) details.value = String(h.total);
  if (h.photos?.length) details.tripadvisor_photos_json = JSON.stringify(h.photos);
  return {
    id: "hotel", order_id: "", kind: "hotel", status: "confirmed",
    title: txt(h.name), supplier_locator: null,
    details: details as unknown as Json, sort_order: 0,
  };
}

function servicoParaItem(s: NormalizedGenericItem | null | undefined): OrderItem | null {
  if (!s) return null;
  const dataHora = txt(s.date);
  const details: Dict = {
    description: txt(s.description),
    date_from: soData(dataHora),
    time_from: dataHora.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] ?? "",
    quantity: txt(s.quantity),
  };
  if (s.total != null) details.value = String(s.total);
  return {
    id: "svc", order_id: "", kind: "other", status: "confirmed",
    title: txt(s.name), supplier_locator: null,
    details: details as unknown as Json, sort_order: 0,
  };
}

export function QuoteItemFormDialog(props: Props) {
  const { open, onOpenChange, quoteId, optionNumber, kind, index = null, onSaved } = props;
  const salvar = useServerFn(salvarItemOrcamento);

  const flightItens = useMemo(() => flightParaItem(props.flight), [props.flight]);
  const initial: OrderItem | null =
    kind === "hotel" ? hotelParaItem(props.hotel)
      : kind === "flight" ? flightItens.main
        : servicoParaItem(props.service);

  const mutation = useMutation({
    mutationFn: async (p: ItemDialogSavePayload) => {
      const main = d(p.details);
      const total = num(main.value);

      if (kind === "hotel") {
        const nome = (p.title || txt(main.hotel_name)).trim();
        if (!nome) throw new Error("Informe o nome do hotel");
        let photos = props.hotel?.photos ?? undefined;
        const raw = txt(main.tripadvisor_photos_json);
        if (raw) {
          try {
            const arr = JSON.parse(raw) as unknown;
            if (Array.isArray(arr)) photos = arr.map((x) => String(x));
          } catch { /* mantém as fotos atuais */ }
        }
        const foto = txt(main.photo_url).trim();
        if (foto) photos = [foto, ...(photos ?? []).filter((u) => u !== foto)];
        return salvar({
          data: {
            quoteId, optionNumber, kind, index,
            hotel: {
              name: nome,
              city: txt(main.city).trim() || null,
              address: txt(main.address).trim() || null,
              checkin: soData(txt(main.check_in)) || null,
              checkout: soData(txt(main.check_out)) || null,
              nights: num(main.nights),
              roomDescription: txt(main.room).trim() || null,
              board: txt(main.board).trim() || null,
              photos,
              total,
            },
          },
        });
      }

      if (kind === "flight") {
        const todos: Dict[] = [main, ...((p.siblings ?? []).map((s) => d(s.details)))];
        const segs = todos
          .filter((s) => txt(s.from_iata) || txt(s.to_iata) || txt(s.flight_number))
          .map((s) => ({
            airline: txt(s.airline).trim() || null,
            flightNumber: txt(s.flight_number).trim() || null,
            fromIata: txt(s.from_iata).trim().toUpperCase() || null,
            toIata: txt(s.to_iata).trim().toUpperCase() || null,
            departure: txt(s.depart_at).trim() || null,
            arrival: txt(s.arrive_at).trim() || null,
            duration: null,
            cabin: txt(s.cabin_class).trim() || null,
            baggage: null,
          }));
        if (segs.length === 0) throw new Error("Informe ao menos um trecho (origem e destino)");
        return salvar({
          data: {
            quoteId, optionNumber, kind, index,
            flight: {
              direction: txt(main.direction) === "return" ? "INBOUND" : "OUTBOUND",
              airline: txt(main.airline).trim() || segs[0]?.airline || null,
              fromIata: segs[0]?.fromIata ?? null,
              toIata: segs[segs.length - 1]?.toIata ?? null,
              departure: segs[0]?.departure ?? null,
              arrival: segs[segs.length - 1]?.arrival ?? null,
              duration: null,
              stops: segs.length > 1 ? segs.length - 1 : 0,
              segments: segs,
              total,
            },
          },
        });
      }

      const nome = p.title.trim();
      if (!nome) throw new Error("Informe o nome do serviço");
      const dataServico = soData(txt(main.date_from));
      const horaServico = txt(main.time_from).trim();
      return salvar({
        data: {
          quoteId, optionNumber, kind, index,
          service: {
            name: nome,
            description: txt(main.description).trim() || null,
            date: dataServico ? `${dataServico}${horaServico ? `T${horaServico}` : ""}` : null,
            quantity: num(main.quantity),
            total,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success(index == null ? "Item adicionado" : "Item atualizado");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  if (!open) return null;

  return (
    <ItemDialog
      open={open}
      onOpenChange={onOpenChange}
      initial={initial}
      kind={kind === "service" ? "other" : kind}
      siblings={kind === "flight" ? flightItens.siblings : undefined}
      onSave={(payload) => mutation.mutate(payload)}
    />
  );
}
