/**
 * Diálogo de item (hospedagem / aéreo / serviço) compartilhado entre
 * a tela de Pedidos e a de Orçamentos — o formulário é exatamente o mesmo.
 */
import { useState, useMemo, useRef } from "react";
import { Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AirlineCombobox } from "@/components/AirlineCombobox";
import { FlightNumberInput } from "@/components/FlightNumberInput";
import { ClassSelect } from "@/components/ClassSelect";
import { FlightLookupButton } from "@/components/FlightLookupButton";
import { HotelAutocomplete, type HotelSelection } from "@/components/HotelAutocomplete";
import { iataCity } from "@/lib/iata-lookup";
import { CABIN_CLASSES, fareClassesFor } from "@/lib/airline-fares";
import { findAirline } from "@/lib/airlines";
import type { Json } from "@/integrations/supabase/types";
import type { OrderItem, OrderPassenger } from "@/lib/orders.functions";

export type ItemDialogSavePayload = {
  kind: "hotel" | "flight" | "other";
  title: string;
  supplier_locator: string | null;
  details: Json;
  status: "confirmed" | "reserved" | "cancelled" | "pending";
  siblings?: { id?: string; title: string; details: Json; sort_order: number }[];
  removedSiblingIds?: string[];
};

const HOSP_REGIMES: string[] = [
  "Sem refeição",
  "Café da manhã",
  "Meia pensão",
  "Pensão completa",
  "All inclusive",
];
const HOSP_CATEGORIAS: string[] = [
  "Standard", "Superior", "Luxo", "Suíte", "Suíte Master", "Suíte Presidencial", "Bangalô", "Chalé",
];
const HOSP_CAMAS: string[] = [
  "1 cama de casal", "1 cama king", "1 cama queen", "2 camas de solteiro", "2 camas queen",
  "2 camas de casal", "1 casal + 1 solteiro", "1 casal + 2 solteiros", "3 camas de solteiro",
  "Cama de casal + sofá-cama",
];
const HOSP_VISTAS: string[] = [
  "Vista interna", "Vista cidade", "Vista jardim", "Vista piscina", "Vista parcial mar",
  "Vista mar", "Frente mar", "Vista montanha",
];

function StarsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {

  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, v - i));
          return (
            <div key={i} className="relative h-6 w-6">
              <Star className="absolute inset-0 h-6 w-6 text-brand-orange/30" />
              <span className="absolute inset-0 overflow-hidden pointer-events-none" style={{ width: `${fill * 100}%` }}>
                <Star className="h-6 w-6 text-brand-orange fill-brand-orange" />
              </span>
              <button
                type="button"
                aria-label={`${i + 0.5} estrelas`}
                className="absolute left-0 top-0 h-6 w-3 cursor-pointer"
                onClick={() => onChange(i + 0.5)}
              />
              <button
                type="button"
                aria-label={`${i + 1} estrelas`}
                className="absolute right-0 top-0 h-6 w-3 cursor-pointer"
                onClick={() => onChange(i + 1)}
              />
            </div>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{v ? v.toFixed(1) : "—"}</span>
      {v > 0 && (
        <button type="button" onClick={() => onChange(0)} className="text-[10px] text-muted-foreground hover:text-foreground underline">
          limpar
        </button>
      )}
    </div>
  );
}


export function ItemDialog({
  open, onOpenChange, initial, kind, onSave, siblings, passengers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderItem | null;
  kind: "hotel" | "flight" | "other";
  siblings?: OrderItem[];
  passengers?: OrderPassenger[];
  onSave: (p: {
    kind: "hotel" | "flight" | "other";
    title: string;
    supplier_locator: string | null;
    details: Json;
    status: "confirmed" | "reserved" | "cancelled" | "pending";
    siblings?: { id?: string; title: string; details: Json; sort_order: number }[];
    removedSiblingIds?: string[];
  }) => void;
}) {
  const guestsFromPax = (() => {
    const list = passengers ?? [];
    const adt = list.filter((p) => (p.passenger_type ?? "ADT") === "ADT").length;
    const chd = list.filter((p) => p.passenger_type === "CHD").length;
    const inf = list.filter((p) => p.passenger_type === "INF").length;
    const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
    const parts: string[] = [];
    if (adt > 0) parts.push(plural(adt, "adulto", "adultos"));
    if (chd > 0) parts.push(plural(chd, "criança", "crianças"));
    if (inf > 0) parts.push(plural(inf, "bebê", "bebês"));
    return parts.join(", ");
  })();

  const initialDetails = (initial?.details ?? {}) as Record<string, unknown>;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [locator, setLocator] = useState(initial?.supplier_locator ?? "");
  const [status, setStatusVal] = useState<"confirmed" | "reserved" | "cancelled" | "pending">((initial?.status ?? "confirmed") as "confirmed" | "reserved" | "cancelled" | "pending");

  // Extrai apenas escalares para o form; guarda o resto (arrays/objetos como
  // `observations`, `tripadvisor_photos`, etc.) num ref para merge no save.
  // Sem isso, importações do voucher com observations[] eram apagadas ao editar.
  const extractExtras = (raw: unknown): Record<string, unknown> => {
    const extras: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") continue;
      extras[k] = v;
    }
    return extras;
  };
  const preservedExtrasRef = useRef<Record<string, unknown>>(extractExtras(initialDetails));
  const preservedSiblingExtrasRef = useRef<Record<string, Record<string, unknown>>>(
    kind === "flight"
      ? Object.fromEntries((siblings ?? []).filter((s) => s.id).map((s) => [s.id!, extractExtras(s.details)]))
      : {}
  );

  const [details, setDetails] = useState<Record<string, string | number | boolean>>(() => {
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(initialDetails)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k] = v;
    }
    if (kind === "flight" && !initial && !clean.direction) clean.direction = "outbound";
    if (kind === "hotel" && !clean.guests && guestsFromPax) clean.guests = guestsFromPax;
    return clean;
  });

  const cleanDetails = (raw: unknown): Record<string, string | number | boolean> => {
    const clean: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") clean[k] = v;
    }
    return clean;
  };

  // Segmentos adicionais do mesmo aéreo (ex.: volta / conexões).
  // Segmento 0 = "main" (initial); segmentos 1+ = irmãos (podem ter id existente ou serem novos).
  type Segment = { id?: string; details: Record<string, string | number | boolean> };
  const [extraSegments, setExtraSegments] = useState<Segment[]>(
    kind === "flight" ? (siblings ?? []).map((s) => ({ id: s.id, details: cleanDetails(s.details) })) : []
  );
  const originalSiblingIds = useMemo(
    () => (kind === "flight" ? (siblings ?? []).map((s) => s.id) : []),
    [siblings, kind]
  );

  useMemo(() => {
    setTitle(initial?.title ?? "");
    setLocator(initial?.supplier_locator ?? "");
    setStatusVal((initial?.status ?? "confirmed") as "confirmed" | "reserved" | "cancelled" | "pending");
    const d0 = cleanDetails(initial?.details);
    if (kind === "hotel" && !d0.guests && guestsFromPax) d0.guests = guestsFromPax;
    setDetails(d0);
    setMoneyRaw({});

    preservedExtrasRef.current = extractExtras(initial?.details);
    preservedSiblingExtrasRef.current = kind === "flight"
      ? Object.fromEntries((siblings ?? []).filter((s) => s.id).map((s) => [s.id!, extractExtras(s.details)]))
      : {};
    setExtraSegments(
      kind === "flight"
        ? (siblings ?? []).map((s) => ({ id: s.id, details: cleanDetails(s.details) }))
        : []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, siblings, kind]);

  // Auto-status:
  // Hotel: sem localizador = Solicitado; com localizador = Confirmado.
  // Aéreo: sem localizador e sem bilhete = Solicitado; só localizador = Reservado; com bilhete = Confirmado.
  const ticketNumber = String(details.ticket_number ?? "").trim();
  useMemo(() => {
    if (kind === "hotel") {
      setStatusVal(locator.trim() ? "confirmed" : "pending");
    } else if (kind === "flight") {
      if (ticketNumber) setStatusVal("confirmed");
      else if (locator.trim()) setStatusVal("reserved");
      else setStatusVal("pending");
    }
  }, [locator, kind, ticketNumber]);


  // Normaliza entrada monetária BRL. Aceita "11.585,85" (ponto milhar + vírgula decimal),
  // "11585,85", "11585.85" e devolve string com ponto decimal parsável por Number().
  const parseMoneyInput = (raw: string): string => {
    if (raw == null) return "";
    const s = String(raw).trim();
    if (!s) return "";
    const hasComma = s.includes(",");
    const hasDot = s.includes(".");
    if (hasComma && hasDot) return s.replace(/\./g, "").replace(",", ".");
    if (hasComma) return s.replace(",", ".");
    return s;
  };
  const setField = (k: string, v: string | boolean) => setDetails((p) => ({ ...p, [k]: v }));
  // Enquanto o usuário digita, preservamos exatamente o que ele escreveu (com vírgula/ponto).
  // O valor normalizado só é gravado em `details`, e o texto cru some ao fechar/salvar.
  const [moneyRaw, setMoneyRaw] = useState<Record<string, string>>({});
  const setMoneyField = (k: string, v: string) => {
    const limpo = v.replace(/[^\d.,]/g, "");
    setMoneyRaw((p) => ({ ...p, [k]: limpo }));
    setDetails((p) => ({ ...p, [k]: parseMoneyInput(limpo) }));
  };
  const moneyValue = (k: string): string => {
    const raw = moneyRaw[k];
    if (raw !== undefined) return raw;
    const v = String(details[k] ?? "");
    return v ? v.replace(".", ",") : "";
  };
  const moneyProps = (k: string) => ({
    inputMode: "decimal" as const,
    value: moneyValue(k),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMoneyField(k, e.target.value),
  });

  const setSegField = (idx: number, k: string, v: string | boolean) =>
    setExtraSegments((arr) => arr.map((s, i) => (i === idx ? { ...s, details: { ...s.details, [k]: v } } : s)));
  const addSegment = (direction: "outbound" | "return") =>
    setExtraSegments((arr) => [...arr, { details: { direction } }]);
  const removeSegment = (idx: number) => setExtraSegments((arr) => arr.filter((_, i) => i !== idx));
  const hasReturn = () => {
    if (String(details.direction ?? "") === "return") return true;
    return extraSegments.some((s) => String(s.details.direction ?? "") === "return");
  };


  const segmentTitle = (d: Record<string, string | number | boolean>): string => {
    const airline = String(d.airline ?? "").trim();
    const flightNo = String(d.flight_number ?? "").trim();
    const from = String(d.from_iata ?? d.origin ?? "").trim();
    const to = String(d.to_iata ?? d.destination ?? "").trim();
    const route = from && to ? `${from} → ${to}` : (from || to || "");
    const prefix = [airline, flightNo].filter(Boolean).join(" ");
    if (prefix && route) return `${prefix} — ${route}`;
    return prefix || route || "Voo";
  };

  const renderFlightSegment = (
    d: Record<string, string | number | boolean>,
    label: string,
    onChangeField: (k: string, v: string | boolean) => void,
    onRemove?: () => void,
  ) => (
    <div className="rounded-lg border border-border/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <FlightLookupButton
            airline={String(d.airline ?? "")}
            flightNumber={String(d.flight_number ?? "")}
            departAt={String(d.depart_at ?? d.departure ?? "")}
            onApply={(r) => {
              if (r.airline) onChangeField("airline", r.airline);
              if (r.flightNumber) onChangeField("flight_number", r.flightNumber);
              if (r.fromIata) onChangeField("from_iata", r.fromIata);
              if (r.fromCity) onChangeField("from_city", r.fromCity);
              if (r.toIata) onChangeField("to_iata", r.toIata);
              if (r.toCity) onChangeField("to_city", r.toCity);
              if (r.departAtLocal) onChangeField("depart_at", r.departAtLocal);
              if (r.arriveAtLocal) onChangeField("arrive_at", r.arriveAtLocal);
            }}
          />
          {onRemove && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onRemove}>
              Remover trecho
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Origem (IATA)</Label><Input value={String(d.from_iata ?? d.origin ?? "")} onChange={(e) => {
          const code = e.target.value.toUpperCase();
          onChangeField("from_iata", code);
          const city = iataCity(code);
          if (city) onChangeField("from_city", city);
        }} placeholder="GRU" maxLength={4} /></div>
        <div><Label>Destino (IATA)</Label><Input value={String(d.to_iata ?? d.destination ?? "")} onChange={(e) => {
          const code = e.target.value.toUpperCase();
          onChangeField("to_iata", code);
          const city = iataCity(code);
          if (city) onChangeField("to_city", city);
        }} placeholder="GIG" maxLength={4} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Cidade origem</Label><Input value={String(d.from_city ?? "")} onChange={(e) => onChangeField("from_city", e.target.value)} placeholder="São Paulo" /></div>
        <div><Label>Cidade destino</Label><Input value={String(d.to_city ?? "")} onChange={(e) => onChangeField("to_city", e.target.value)} placeholder="Rio de Janeiro" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cia aérea</Label>
          <AirlineCombobox
            value={String(d.airline ?? "")}
            onChange={(name) => {
              const a = findAirline(name);
              onChangeField("airline", name);
              // Se está no registro, limpa URL manual (o voucher resolve sozinho).
              if (a || !name) onChangeField("airline_logo_url", "");
              // Re-normaliza o nº do voo com o novo prefixo IATA.
              const curr = String(d.flight_number ?? "").trim();
              if (curr) {
                const m = curr.toUpperCase().match(/^[A-Z0-9]{2,3}\s*(.+)$/);
                const suffix = m && /\d/.test(m[1]) ? m[1].trim() : curr.toUpperCase();
                onChangeField("flight_number", a ? `${a.iata} ${suffix}` : suffix);
              }
            }}
          />
        </div>
        <div><Label>Nº do voo</Label><FlightNumberInput airline={String(d.airline ?? "")} value={String(d.flight_number ?? "")} onChange={(v) => onChangeField("flight_number", v)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Partida</Label><Input type="datetime-local" value={String(d.depart_at ?? d.departure ?? "")} onChange={(e) => onChangeField("depart_at", e.target.value)} /></div>
        <div><Label>Chegada</Label><Input type="datetime-local" value={String(d.arrive_at ?? d.arrival ?? "")} onChange={(e) => onChangeField("arrive_at", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Classe (cabine)</Label>
          <ClassSelect
            value={String(d.cabin_class ?? d.cabin ?? "")}
            onChange={(v) => onChangeField("cabin_class", v)}
            options={CABIN_CLASSES}
          />
        </div>
        <div>
          <Label>Classe tarifária</Label>
          <ClassSelect
            value={String(d.fare_class ?? "")}
            onChange={(v) => onChangeField("fare_class", v)}
            options={fareClassesFor(findAirline(String(d.airline ?? ""))?.iata)}
          />
        </div>
      </div>
      {d.airline && !findAirline(String(d.airline)) ? (
        <div>
          <Label>URL da logo da cia</Label>
          <Input value={String(d.airline_logo_url ?? "")} onChange={(e) => onChangeField("airline_logo_url", e.target.value)} placeholder="https://…/logo.png" />
        </div>
      ) : null}
      <div className="rounded-md border border-border p-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Bagagem inclusa</div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={d.personal_item !== false} onChange={(e) => onChangeField("personal_item", e.target.checked)} />
            Bolsa/mochila
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={d.carry_on !== false} onChange={(e) => onChangeField("carry_on", e.target.checked)} />
            Bagagem de mão

          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={!!d.checked_bag} onChange={(e) => onChangeField("checked_bag", e.target.checked)} />
            Bagagem despachada
          </label>
        </div>
      </div>

    </div>
  );

  const legLabel = (isReturn: boolean, indexInLeg: number): string => {
    if (indexInLeg === 0) return isReturn ? "Volta" : "Ida";
    return `Conexão ${indexInLeg}`;
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar" : "Adicionar"} {kind === "hotel" ? "hospedagem" : kind === "flight" ? "aéreo" : "serviço"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {kind !== "flight" && (
              <div className="col-span-2">
                <Label>{kind === "hotel" ? "Nome do hotel" : "Serviço"}</Label>
                {kind === "hotel" ? (
                  <HotelAutocomplete
                    value={title}
                    onChangeText={setTitle}
                    onSelect={(h: HotelSelection) => {
                      setDetails((p) => {
                        const next = { ...p };
                        next.hotel_name = h.name;
                        if (h.address) next.address = h.address;
                        if (h.rating != null) next.hotel_stars = String(Math.round(h.rating));
                        if (h.latitude != null) next.latitude = String(h.latitude);
                        if (h.longitude != null) next.longitude = String(h.longitude);
                        next.tripadvisor_location_id = String(h.location_id);
                        if (h.tripadvisor_url) next.tripadvisor_url = h.tripadvisor_url;
                        if (h.phone) next.phone = h.phone;
                        if (h.website) next.website = h.website;
                        if (h.photos && h.photos.length > 0) next.tripadvisor_photos_json = JSON.stringify(h.photos);
                        if (h.description) next.description = h.description;
                        return next;
                      });
                    }}
                    placeholder="Ex: Copacabana Palace (busca no TripAdvisor)"
                  />
                ) : (
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Traslado, Passeio, Seguro viagem…" />
                )}
              </div>
            )}
            <div className={kind === "other" ? "" : "col-span-2"}>
              <Label>Localizador do fornecedor</Label>
              <Input
                value={locator}
                onChange={(e) => {
                  const raw = e.target.value.toUpperCase();
                  // Aéreo: apenas letras/números (PNR). Hotel/outros: mantém traço e espaço, sempre em maiúsculas.
                  const cleaned = kind === "flight"
                    ? raw.replace(/[^A-Z0-9]/g, "")
                    : raw.replace(/[^A-Z0-9\-\s/]/g, "");
                  setLocator(cleaned);
                }}
                placeholder="Ex: JXJDZZ"
                maxLength={kind === "flight" ? 12 : 32}
              />
              {kind === "flight" && (
                <p className="mt-1 text-[11px] text-muted-foreground">Opcional · se preencher, use no mínimo 6 caracteres (letras e/ou números).</p>
              )}
            </div>

            {kind === "flight" && (() => {
              // Detecta LATAM só pela cia atualmente selecionada / nº do voo.
              // (Ignora airline_iata bruto porque pode ter ficado "LA" de uma
              // importação anterior mesmo depois de trocar a cia no combo.)
              const airlineName = String(details.airline ?? "");
              const iataFromName = findAirline(airlineName)?.iata?.toUpperCase() ?? "";
              const fn = String(details.flight_number ?? "").toUpperCase();
              const prefix = fn.match(/^([A-Z]{2})\s*\d/)?.[1] ?? "";
              const isLatam = iataFromName === "LA" || prefix === "LA";
              if (!isLatam) return null;
              return (
                <div className="col-span-2">
                  <Label>Localizador PNR (6 letras)</Label>
                  <Input
                    value={String(details.carrier_locator ?? "")}
                    onChange={(e) => setField("carrier_locator", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    placeholder="Ex: JXJDZZ"
                    maxLength={8}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">LATAM · aparece junto do número de compra na reserva.</p>
                </div>
              );
            })()}

            {kind === "other" && (
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatusVal(v as "confirmed" | "reserved" | "cancelled" | "pending")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Solicitado</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

          </div>


          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fornecedor (interno)</Label>
              <Input
                value={String(details.supplier_name ?? "")}
                onChange={(e) => setField("supplier_name", e.target.value)}
                placeholder={kind === "hotel" ? "Ex: CVC, Bancorbrás, Direto…" : "Ex: Latam Trade, Sabre, GDS…"}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Visível só pra você. Não aparece no voucher do cliente.</p>
            </div>

          </div>

          {kind === "flight" && (
            <div>
              <Label>Link da companhia aérea (check-in / consulta)</Label>
              <Input
                value={String(details.airline_checkin_url ?? "")}
                onChange={(e) => setField("airline_checkin_url", e.target.value)}
                placeholder="https://www.latam.com/pt_br/apps/personas/checkin"
                type="url"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Vira um QR clicável no voucher — o passageiro escaneia e abre direto na companhia aérea.</p>
            </div>
          )}

          {kind !== "other" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor total (R$)</Label>
                <Input inputMode="decimal" value={String(details.value ?? "")} onChange={(e) => setMoneyField("value", e.target.value)} placeholder="11.406,30" />
              </div>
              <div>
                <Label>Taxas inclusas (R$)</Label>
                <Input inputMode="decimal" value={String(details.tax_value ?? "")} onChange={(e) => setMoneyField("tax_value", e.target.value)} placeholder="0,00" />
                <p className="mt-1 text-[10px] text-muted-foreground">As taxas já fazem parte do valor total.</p>
              </div>
            </div>
          )}

          {kind === "hotel" ? (
            <>
              <div>
                <Label>Categoria (estrelas)</Label>
                <StarsInput
                  value={Number(details.hotel_stars ?? 0) || 0}
                  onChange={(v) => setField("hotel_stars", v === 0 ? "" : String(v))}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Clique na metade esquerda para meia estrela.</p>
              </div>
              <div><Label>Endereço</Label><Input value={String(details.address ?? "")} onChange={(e) => setField("address", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <Input
                    list="hosp-categorias"
                    value={String(details.room ?? "")}
                    onChange={(e) => setField("room", e.target.value)}
                    placeholder="Standard, Superior, Luxo…"
                  />
                  <datalist id="hosp-categorias">
                    {HOSP_CATEGORIAS.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Regime</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={String(details.board ?? "")}
                    onChange={(e) => setField("board", e.target.value)}
                  >
                    <option value="">—</option>
                    {HOSP_REGIMES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de cama</Label>
                  <Input
                    list="hosp-camas"
                    value={String(details.bed_type ?? "")}
                    onChange={(e) => setField("bed_type", e.target.value)}
                    placeholder="1 cama de casal, 2 camas de solteiro…"
                  />
                  <datalist id="hosp-camas">
                    {HOSP_CAMAS.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Categoria / vista</Label>
                  <Input
                    list="hosp-vistas"
                    value={String(details.room_view ?? "")}
                    onChange={(e) => setField("room_view", e.target.value)}
                    placeholder="Vista mar, Vista cidade…"
                  />
                  <datalist id="hosp-vistas">
                    {HOSP_VISTAS.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>Check-in</Label><Input type="date" value={String(details.check_in ?? details.checkin ?? "")} onChange={(e) => setField("check_in", e.target.value)} /></div>
                <div><Label>Check-out</Label><Input type="date" value={String(details.check_out ?? details.checkout ?? "")} onChange={(e) => setField("check_out", e.target.value)} /></div>
                <div><Label>Noites</Label><Input type="number" value={String(details.nights ?? "")} onChange={(e) => setField("nights", e.target.value)} /></div>
              </div>
              <div><Label>Hóspedes</Label><Input value={String(details.guests ?? "")} onChange={(e) => setField("guests", e.target.value)} placeholder="2 adultos, 1 criança..." /></div>
              <div>
                <Label>URL da foto do hotel (opcional)</Label>
                <Input
                  value={String(details.photo_url ?? "")}
                  onChange={(e) => setField("photo_url", e.target.value)}
                  placeholder="https://…/foto-do-hotel.jpg"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Usada no voucher quando o hotel não tem foto no TripAdvisor.</p>
              </div>
              <div>
                <Label>Políticas do hotel</Label>
                <Textarea
                  rows={3}
                  value={String(details.policies ?? "")}
                  onChange={(e) => setField("policies", e.target.value)}
                  placeholder="Ex: Reserva não reembolsável. Cancelamento até 48h antes sem custo. Taxa de resort de US$ 15/noite paga no hotel."
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Aparece no voucher — reembolso, taxas, fees etc.</p>
              </div>
            </>


          ) : kind === "flight" ? (
            (() => {
              // Direção do bloco principal: normalmente Ida, mas pode ser Volta
              // (ex.: volta emitida com outra companhia, em reserva separada).
              const mainDir = String(details.direction ?? "outbound") === "return" ? "return" : "outbound";
              const isMainReturn = mainDir === "return";
              const outboundExtras: { seg: Segment; idx: number }[] = [];
              const returnExtras: { seg: Segment; idx: number }[] = [];
              extraSegments.forEach((seg, idx) => {
                const dir = String(seg.details.direction ?? "");
                if (dir === "return") returnExtras.push({ seg, idx });
                else outboundExtras.push({ seg, idx });
              });
              const mainExtras = isMainReturn ? returnExtras : outboundExtras;
              const hasRet = !isMainReturn && returnExtras.length > 0;
              const setMainDirection = (v: "outbound" | "return") => {
                setField("direction", v);
                // conexões do bloco principal seguem a mesma direção
                setExtraSegments((arr) => arr.map((s) => ({ ...s, details: { ...s.details, direction: v } })));
              };
              return (
                <>
                  {/* BLOCO PRINCIPAL (Ida ou Volta) */}
                  <div className={`rounded-xl border p-3 space-y-3 ${isMainReturn ? "border-brand-blue/40 bg-brand-blue/5" : "border-brand-orange/40 bg-brand-orange/5"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-xs font-semibold uppercase tracking-wide ${isMainReturn ? "text-brand-blue" : "text-brand-orange"}`}>
                        {isMainReturn ? "Volta" : "Ida"}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground">Trecho</Label>
                        <select
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          value={mainDir}
                          onChange={(e) => setMainDirection(e.target.value === "return" ? "return" : "outbound")}
                        >
                          <option value="outbound">Ida</option>
                          <option value="return">Volta</option>
                        </select>
                      </div>
                    </div>
                    {renderFlightSegment(details, legLabel(isMainReturn, 0), setField)}
                    {mainExtras.map(({ seg, idx }, i) => (
                      <div key={seg.id ?? `main-${idx}`}>
                        {renderFlightSegment(
                          seg.details,
                          legLabel(isMainReturn, i + 1),
                          (k, v) => setSegField(idx, k, v),
                          () => removeSegment(idx),
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addSegment(mainDir)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar trecho (conexão)
                    </Button>
                  </div>

                  {/* VOLTA (só quando o bloco principal é a ida) */}
                  {isMainReturn ? null : hasRet ? (
                    <div className="rounded-xl border border-brand-blue/40 bg-brand-blue/5 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Volta</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => returnExtras.forEach(({ idx }) => removeSegment(idx))}
                        >
                          Remover volta
                        </Button>
                      </div>
                      {returnExtras.map(({ seg, idx }, i) => (
                        <div key={seg.id ?? `ret-${idx}`}>
                          {renderFlightSegment(
                            seg.details,
                            legLabel(true, i),
                            (k, v) => setSegField(idx, k, v),
                            i === 0 ? undefined : () => removeSegment(idx),
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => addSegment("return")}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar trecho (conexão)
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => addSegment("return")}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar volta
                    </Button>
                  )}
                </>
              );
            })()

          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valor total (R$)</Label>
                  <Input inputMode="decimal" value={String(details.value ?? "")} onChange={(e) => setMoneyField("value", e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <Label>Taxa inclusa (R$)</Label>
                  <Input inputMode="decimal" value={String(details.tax_value ?? "")} onChange={(e) => setMoneyField("tax_value", e.target.value)} placeholder="0,00" />
                  <p className="mt-1 text-[10px] text-muted-foreground">Parte não comissionável.</p>
                </div>
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" value={String(details.quantity ?? "")} onChange={(e) => setField("quantity", e.target.value)} placeholder="1" />
                </div>
              </div>
              <div><Label>Categoria</Label><Input value={String(details.category ?? "")} onChange={(e) => setField("category", e.target.value)} placeholder="Traslado, Passeio, Ingresso, Seguro…" /></div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <Label>Data de partida <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="date" value={String(details.date_from ?? "")} onChange={(e) => setField("date_from", e.target.value)} />
                </div>
                <div>
                  <Label>Horário de saída <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="time" value={String(details.time_from ?? "")} onChange={(e) => setField("time_from", e.target.value)} />
                </div>
                <div>
                  <Label>Data de chegada <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="date" value={String(details.date_to ?? "")} onChange={(e) => setField("date_to", e.target.value)} />
                </div>
                <div>
                  <Label>Horário de chegada <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="time" value={String(details.time_to ?? "")} onChange={(e) => setField("time_to", e.target.value)} />
                </div>
              </div>
            </>
          )}



          <div>
            <Label>Observações</Label>
            <Textarea rows={3} value={String(details.notes ?? "")} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => {
            const numFields = new Set(["nights", "value", "quantity", "hotel_stars", "tax_value"]);
            const buildClean = (raw: Record<string, string | number | boolean>): Record<string, unknown> => {
              const cd: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(raw)) {
                if (v === "" || v === undefined || v === null) continue;
                if (numFields.has(k)) {
                  const raw = String(v).trim().replace(/\s/g, "").replace(/^R\$/i, "");
                  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
                  const parsed = Number(normalized);
                  if (Number.isFinite(parsed)) cd[k] = parsed;
                } else {
                  cd[k] = v;
                }
              }
              return cd;
            };

            // Merge extras preservados (arrays/objetos como `observations`, `tripadvisor_photos`)
            // ANTES dos escalares editados — assim edições no form ganham, mas o resto sobrevive.
            const cleanMain = { ...preservedExtrasRef.current, ...buildClean(details) };
            let tripGroup = "";
            let effectiveTitle = title.trim();
            if (kind === "flight") {
              // Localizador opcional: se vier, precisa ter ao menos 6 alfanuméricos
              const loc = locator.trim().toUpperCase();
              if (loc && !/^[A-Z0-9]{6,}$/.test(loc)) {
                toast.error("Localizador inválido: mínimo 6 caracteres (letras e/ou números)");
                return;
              }
              // Bilhete opcional; se preenchido, exige 13 dígitos no formato 000-0000000000
              const ticket = String(details.ticket_number ?? "").trim();
              if (ticket && !/^\d{3}-\d{10}$/.test(ticket)) {
                toast.error("Número de bilhete inválido: use o formato 000-0000000000 (13 dígitos)");
                return;
              }
              // Ida é obrigatória: exige origem+destino no trecho principal
              const from = String(details.from_iata ?? details.origin ?? "").trim();
              const to = String(details.to_iata ?? details.destination ?? "").trim();
              if (!from || !to) {
                toast.error("Preencha ao menos a origem e o destino da ida");
                return;
              }

              // Ida e volta lançadas juntas continuam num único card mesmo sem
              // localizador: marcamos todos os trechos com o mesmo trip_group.
              tripGroup = String(cleanMain.trip_group ?? "").trim()
                || `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
              cleanMain.trip_group = tripGroup;

              // Volta é opcional: descarta trechos de volta vazios (sem origem/destino)
              effectiveTitle = segmentTitle(details);
            }
            if (!effectiveTitle) {
              if (kind === "hotel") {
                effectiveTitle = String(details.hotel_name ?? details.city ?? "Hospedagem").trim() || "Hospedagem";
              } else if (kind !== "flight") {
                effectiveTitle = String(details.description ?? kind).trim() || "Item";
              } else {
                toast.error("Preencha os dados do trecho"); return;
              }
            }


            // Deriva status final (não deixa o usuário salvar um status incoerente)
            let finalStatus = status;
            if (status !== "cancelled") {
              const loc = locator.trim();
              const tkt = String(cleanMain.ticket_number ?? "").trim();
              if (kind === "hotel") finalStatus = loc ? "confirmed" : "pending";
              else if (kind === "flight") finalStatus = tkt ? "confirmed" : loc ? "reserved" : "pending";
              else finalStatus = loc ? "confirmed" : "pending";
            }

            const siblingsPayload = kind === "flight"
              ? extraSegments
                  .filter((seg) => {
                    const from = String(seg.details.from_iata ?? seg.details.origin ?? "").trim();
                    const to = String(seg.details.to_iata ?? seg.details.destination ?? "").trim();
                    // mantém trechos com id (edição) mesmo vazios; descarta novos vazios
                    return seg.id || from || to;
                  })
                  .map((seg, idx) => {
                    const preserved = seg.id ? (preservedSiblingExtrasRef.current[seg.id] ?? {}) : {};
                    const cd = { ...preserved, ...buildClean(seg.details), trip_group: tripGroup };
                    return {
                      id: seg.id,
                      title: segmentTitle(seg.details),
                      details: cd as Json,
                      sort_order: idx + 1,
                    };
                  })
              : undefined;


            const currentIds = new Set(extraSegments.map((s) => s.id).filter((x): x is string => !!x));
            const removedSiblingIds = originalSiblingIds.filter((id) => !currentIds.has(id));

            onSave({
              kind,
              title: effectiveTitle,
              supplier_locator: locator.trim() || null,
              details: cleanMain as Json,
              status: finalStatus,
              siblings: siblingsPayload,
              removedSiblingIds,
            });
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
