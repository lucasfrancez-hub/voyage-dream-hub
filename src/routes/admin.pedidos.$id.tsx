import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import {
  ArrowLeft, Hotel, Plane, XCircle, FileText, DollarSign, Users, Plus,
  Pencil, Trash2, Ban, RotateCcw, Loader2, Copy, Download, Hash,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/format";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";
import {
  getOrderDetail, upsertPassenger, deletePassenger,
  upsertOrderItem, deleteOrderItem, setOrderItemStatus,
  upsertItemFinancial, deleteItemFinancial,
  type OrderDetail, type OrderPassenger, type OrderItem, type OrderItemFinancial,
} from "@/lib/orders.functions";
import { generateAuthorizationPDF, type AuthorizationData, type LivenessData } from "@/lib/authorization-pdf";

export const Route = createFileRoute("/admin/pedidos/$id")({
  component: OrderDetailPage,
  head: () => ({ meta: [{ title: "Detalhe do pedido — Admin" }] }),
});

function orderDetailQO(id: string) {
  const fetchDetail = getOrderDetail;
  return queryOptions({
    queryKey: ["admin", "orderDetail", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function OrderDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery(orderDetailQO(id));

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando pedido…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          Erro ao carregar pedido: {error instanceof Error ? error.message : "desconhecido"}
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => navigate({ to: "/admin/pedidos" })}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const detail = data as OrderDetail;
  const { order } = detail;
  const pm = paymentMethodLabel(order.paymentMethod);
  const st = statusLabel(order.status);

  const hotelItems = detail.items.filter((i) => i.kind === "hotel" && i.status !== "cancelled");
  const flightItems = detail.items.filter((i) => i.kind === "flight" && i.status !== "cancelled");
  const cancelledItems = detail.items.filter((i) => i.status === "cancelled");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "orderDetail", id] });

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/pedidos">
            <ArrowLeft className="h-4 w-4 mr-1" /> Pedidos
          </Link>
        </Button>
        <div className="text-xs text-muted-foreground">/ Detalhe</div>
      </div>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Hash className="h-3 w-3" /> {shortId(order.id)}
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.className}`}>
                {st.label}
              </span>
            </div>
            <div className="mt-1 text-2xl font-display font-bold">{order.fullName}</div>
            <div className="text-sm text-muted-foreground">{order.email} · {order.phone}</div>
            {order.cpf && <div className="text-xs text-muted-foreground mt-0.5">CPF {order.cpf}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-display font-bold text-brand-orange">{formatBRL(order.totalPrice)}</div>
            <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${pm.className}`}>
              {pm.label}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Criado em {new Date(order.createdAt).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>
      </div>

      {/* Passageiros */}
      <PassengersSection
        orderId={order.id}
        passengers={detail.passengers}
        onChange={invalidate}
      />

      {/* Tabs */}
      <div className="mt-6">
        <Tabs defaultValue="hotel">
          <TabsList>
            <TabsTrigger value="hotel"><Hotel className="h-3.5 w-3.5 mr-1.5" /> Hospedagem ({hotelItems.length})</TabsTrigger>
            <TabsTrigger value="flight"><Plane className="h-3.5 w-3.5 mr-1.5" /> Aéreo ({flightItems.length})</TabsTrigger>
            <TabsTrigger value="cancelled"><XCircle className="h-3.5 w-3.5 mr-1.5" /> Cancelados ({cancelledItems.length})</TabsTrigger>
            <TabsTrigger value="contract"><FileText className="h-3.5 w-3.5 mr-1.5" /> Contrato</TabsTrigger>
            <TabsTrigger value="finance"><DollarSign className="h-3.5 w-3.5 mr-1.5" /> Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="hotel" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={hotelItems}
              kind="hotel"
              onChange={invalidate}
            />
          </TabsContent>
          <TabsContent value="flight" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={flightItems}
              kind="flight"
              onChange={invalidate}
            />
          </TabsContent>
          <TabsContent value="cancelled" className="mt-4">
            <ItemsTab
              orderId={order.id}
              items={cancelledItems}
              kind="cancelled"
              onChange={invalidate}
            />
          </TabsContent>
          <TabsContent value="contract" className="mt-4">
            <ContractTab detail={detail} />
          </TabsContent>
          <TabsContent value="finance" className="mt-4">
            <FinanceTab
              items={detail.items}
              financials={detail.financials}
              onChange={invalidate}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// =========== Passengers ===========
function PassengersSection({
  orderId, passengers, onChange,
}: { orderId: string; passengers: OrderPassenger[]; onChange: () => void }) {
  const upsert = useServerFn(upsertPassenger);
  const del = useServerFn(deletePassenger);
  const [editing, setEditing] = useState<OrderPassenger | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (p: Partial<OrderPassenger> & { order_id: string; full_name: string }) =>
      upsert({ data: p }),
    onSuccess: () => { toast.success("Passageiro salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (pid: string) => del({ data: { id: pid } }),
    onSuccess: () => { toast.success("Passageiro removido"); onChange(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(p: OrderPassenger) { setEditing(p); setOpen(true); }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Passageiros ({passengers.length})
        </h2>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
      </div>
      {passengers.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Nenhum passageiro cadastrado.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Nome</th>
                <th className="text-left py-2 px-2">Tipo</th>
                <th className="text-left py-2 px-2">Nascimento</th>
                <th className="text-left py-2 px-2">CPF</th>
                <th className="text-left py-2 px-2">Bilhete</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {passengers.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2 px-2 font-medium">{p.full_name}</td>
                  <td className="py-2 px-2 text-xs">{p.passenger_type}</td>
                  <td className="py-2 px-2 text-xs">{p.birth_date ? new Date(p.birth_date + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="py-2 px-2 text-xs font-mono">{p.cpf ?? "—"}</td>
                  <td className="py-2 px-2 text-xs font-mono">{p.ticket_number ?? "—"}</td>
                  <td className="py-2 px-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Remover passageiro?") && remove.mutate(p.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PassengerDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSave={(payload) => save.mutate({ ...payload, order_id: orderId, id: editing?.id })}
      />
    </div>
  );
}

function PassengerDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderPassenger | null;
  onSave: (p: Partial<OrderPassenger> & { full_name: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: initial?.full_name ?? "",
    passenger_type: (initial?.passenger_type ?? "ADT") as "ADT" | "CHD" | "INF",
    birth_date: initial?.birth_date ?? "",
    cpf: initial?.cpf ?? "",
    ticket_number: initial?.ticket_number ?? "",
    document: initial?.document ?? "",
  });
  // reset when initial changes
  useMemo(() => {
    setForm({
      full_name: initial?.full_name ?? "",
      passenger_type: (initial?.passenger_type ?? "ADT") as "ADT" | "CHD" | "INF",
      birth_date: initial?.birth_date ?? "",
      cpf: initial?.cpf ?? "",
      ticket_number: initial?.ticket_number ?? "",
      document: initial?.document ?? "",
    });
  }, [initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar passageiro" : "Adicionar passageiro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nome completo</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.passenger_type} onValueChange={(v) => setForm({ ...form, passenger_type: v as "ADT" | "CHD" | "INF" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADT">Adulto (ADT)</SelectItem>
                  <SelectItem value="CHD">Criança (CHD)</SelectItem>
                  <SelectItem value="INF">Bebê (INF)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nascimento</Label>
              <Input type="date" value={form.birth_date ?? ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div>
              <Label>Documento (RG/Passaporte)</Label>
              <Input value={form.document ?? ""} onChange={(e) => setForm({ ...form, document: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Nº bilhete aéreo</Label>
            <Input value={form.ticket_number ?? ""} onChange={(e) => setForm({ ...form, ticket_number: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.full_name.trim()) { toast.error("Nome é obrigatório"); return; }
              onSave(form);
            }}
          >Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Items (hotel/flight/cancelled) ===========
function ItemsTab({
  orderId, items, kind, onChange,
}: {
  orderId: string;
  items: OrderItem[];
  kind: "hotel" | "flight" | "cancelled";
  onChange: () => void;
}) {
  const upsert = useServerFn(upsertOrderItem);
  const del = useServerFn(deleteOrderItem);
  const setStatus = useServerFn(setOrderItemStatus);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (payload: Parameters<typeof upsert>[0]["data"]) => upsert({ data: payload }),
    onSuccess: () => { toast.success("Item salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (iid: string) => del({ data: { id: iid } }),
    onSuccess: () => { toast.success("Item removido"); onChange(); },
  });
  const cancel = useMutation({
    mutationFn: async (iid: string) => setStatus({ data: { id: iid, status: "cancelled" } }),
    onSuccess: () => { toast.success("Item cancelado"); onChange(); },
  });
  const reactivate = useMutation({
    mutationFn: async (iid: string) => setStatus({ data: { id: iid, status: "confirmed" } }),
    onSuccess: () => { toast.success("Item reativado"); onChange(); },
  });

  const isCancelledTab = kind === "cancelled";
  const dialogKind: "hotel" | "flight" = isCancelledTab ? (editing?.kind === "flight" ? "flight" : "hotel") : kind;

  return (
    <div>
      {!isCancelledTab && (
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar {kind === "hotel" ? "hospedagem" : "aéreo"}
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {isCancelledTab ? "Nenhum item cancelado." : "Nenhum item cadastrado. Clique em Adicionar para começar."}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onEdit={() => { setEditing(it); setOpen(true); }}
              onDelete={() => confirm("Excluir item?") && remove.mutate(it.id)}
              onCancel={() => confirm("Marcar como cancelado?") && cancel.mutate(it.id)}
              onReactivate={() => reactivate.mutate(it.id)}
            />
          ))}
        </div>
      )}

      <ItemDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        kind={dialogKind}
        onSave={(payload) => save.mutate({ ...payload, order_id: orderId, id: editing?.id })}
      />
    </div>
  );
}

function ItemCard({
  item, onEdit, onDelete, onCancel, onReactivate,
}: {
  item: OrderItem;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onReactivate: () => void;
}) {
  const d = (item.details ?? {}) as Record<string, unknown>;
  const isFlight = item.kind === "flight";
  const isCancelled = item.status === "cancelled";
  return (
    <div className={`rounded-xl border p-4 ${isCancelled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isFlight ? <Plane className="h-3.5 w-3.5" /> : <Hotel className="h-3.5 w-3.5" />}
            {item.supplier_locator && <span className="font-mono">{item.supplier_locator}</span>}
            {isCancelled && <span className="text-destructive font-semibold uppercase text-[10px]">Cancelado</span>}
          </div>
          <div className="mt-1 font-semibold">{item.title}</div>
          <div className="mt-1 text-sm text-muted-foreground grid gap-0.5">
            {isFlight ? (
              <>
                {typeof d.origin === "string" && typeof d.destination === "string" && (
                  <div>{d.origin as string} → {d.destination as string}</div>
                )}
                {typeof d.airline === "string" && <div>Cia: {d.airline as string}</div>}
                {typeof d.flight_number === "string" && <div>Voo: {d.flight_number as string}</div>}
                {typeof d.departure === "string" && <div>Partida: {d.departure as string}</div>}
                {typeof d.arrival === "string" && <div>Chegada: {d.arrival as string}</div>}
                {typeof d.cabin === "string" && <div>Cabine: {d.cabin as string}</div>}
              </>
            ) : (
              <>
                {typeof d.address === "string" && <div>{d.address as string}</div>}
                {typeof d.room === "string" && <div>Quarto: {d.room as string}</div>}
                {typeof d.board === "string" && <div>Regime: {d.board as string}</div>}
                {typeof d.checkin === "string" && typeof d.checkout === "string" && (
                  <div>Check-in {d.checkin as string} · Check-out {d.checkout as string}</div>
                )}
                {typeof d.nights === "number" && <div>{d.nights as number} noite(s)</div>}
                {typeof d.guests === "string" && <div>Hóspedes: {d.guests as string}</div>}
              </>
            )}
            {typeof d.notes === "string" && (d.notes as string).trim() && (
              <div className="mt-1 whitespace-pre-line text-xs">{d.notes as string}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          {isCancelled ? (
            <Button size="sm" variant="ghost" onClick={onReactivate} title="Reativar">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onCancel} title="Cancelar item">
              <Ban className="h-3.5 w-3.5 text-amber-500" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </div>
    </div>
  );
}

function ItemDialog({
  open, onOpenChange, initial, kind, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: OrderItem | null;
  kind: "hotel" | "flight";
  onSave: (p: { kind: "hotel" | "flight"; title: string; supplier_locator: string | null; details: Json; status: "confirmed" | "cancelled" | "pending" }) => void;
}) {
  const initialDetails = (initial?.details ?? {}) as Record<string, unknown>;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [locator, setLocator] = useState(initial?.supplier_locator ?? "");
  const [status, setStatusVal] = useState<"confirmed" | "cancelled" | "pending">((initial?.status ?? "confirmed") as "confirmed" | "cancelled" | "pending");
  const [details, setDetails] = useState<Record<string, string | number>>(() => {
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(initialDetails)) {
      if (typeof v === "string" || typeof v === "number") clean[k] = v;
    }
    return clean;
  });

  useMemo(() => {
    setTitle(initial?.title ?? "");
    setLocator(initial?.supplier_locator ?? "");
    setStatusVal((initial?.status ?? "confirmed") as "confirmed" | "cancelled" | "pending");
    const clean: Record<string, string | number> = {};
    for (const [k, v] of Object.entries((initial?.details ?? {}) as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") clean[k] = v;
    }
    setDetails(clean);
  }, [initial]);

  const setField = (k: string, v: string) => setDetails((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar" : "Adicionar"} {kind === "hotel" ? "hospedagem" : "aéreo"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{kind === "hotel" ? "Nome do hotel" : "Trecho / rota"}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "hotel" ? "Ex: Trupial Hotel & Casino" : "Ex: GRU → CUR"} />
            </div>
            <div>
              <Label>Localizador do fornecedor</Label>
              <Input value={locator} onChange={(e) => setLocator(e.target.value)} placeholder="Ex: JXJDZZ" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatusVal(v as "confirmed" | "cancelled" | "pending")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "hotel" ? (
            <>
              <div><Label>Endereço</Label><Input value={String(details.address ?? "")} onChange={(e) => setField("address", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quarto</Label><Input value={String(details.room ?? "")} onChange={(e) => setField("room", e.target.value)} /></div>
                <div><Label>Regime</Label><Input value={String(details.board ?? "")} onChange={(e) => setField("board", e.target.value)} placeholder="Café da manhã, All inclusive..." /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Check-in</Label><Input type="date" value={String(details.checkin ?? "")} onChange={(e) => setField("checkin", e.target.value)} /></div>
                <div><Label>Check-out</Label><Input type="date" value={String(details.checkout ?? "")} onChange={(e) => setField("checkout", e.target.value)} /></div>
                <div><Label>Noites</Label><Input type="number" value={String(details.nights ?? "")} onChange={(e) => setField("nights", e.target.value)} /></div>
              </div>
              <div><Label>Hóspedes</Label><Input value={String(details.guests ?? "")} onChange={(e) => setField("guests", e.target.value)} placeholder="2 adultos, 1 criança..." /></div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Origem</Label><Input value={String(details.origin ?? "")} onChange={(e) => setField("origin", e.target.value)} placeholder="GRU" /></div>
                <div><Label>Destino</Label><Input value={String(details.destination ?? "")} onChange={(e) => setField("destination", e.target.value)} placeholder="CUR" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cia aérea</Label><Input value={String(details.airline ?? "")} onChange={(e) => setField("airline", e.target.value)} placeholder="LATAM" /></div>
                <div><Label>Nº do voo</Label><Input value={String(details.flight_number ?? "")} onChange={(e) => setField("flight_number", e.target.value)} placeholder="LA 3331" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Partida</Label><Input type="datetime-local" value={String(details.departure ?? "")} onChange={(e) => setField("departure", e.target.value)} /></div>
                <div><Label>Chegada</Label><Input type="datetime-local" value={String(details.arrival ?? "")} onChange={(e) => setField("arrival", e.target.value)} /></div>
              </div>
              <div><Label>Classe / Cabine</Label><Input value={String(details.cabin ?? "")} onChange={(e) => setField("cabin", e.target.value)} placeholder="Econômica Light" /></div>
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
            if (!title.trim()) { toast.error("Título é obrigatório"); return; }
            const cleanDetails: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(details)) {
              if (v === "" || v === undefined || v === null) continue;
              cleanDetails[k] = k === "nights" ? Number(v) : v;
            }
            onSave({
              kind,
              title: title.trim(),
              supplier_locator: locator.trim() || null,
              details: cleanDetails,
              status,
            });
          }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========== Contract ===========
function ContractTab({ detail }: { detail: OrderDetail }) {
  const { order, passengers } = detail;
  const snap = order.packageSnapshot as {
    card_capture?: { authorization?: AuthorizationData; liveness?: LivenessData | null };
    order_number?: string;
    locator?: string;
    route?: string;
    travel_date?: string;
    hotel?: string;
    flights?: string;
    checkin?: string;
    checkout?: string;
    days?: string;
    nights?: string;
  } | null;
  const authorization = snap?.card_capture?.authorization;
  const liveness = snap?.card_capture?.liveness ?? null;
  const hasAuthorization = !!authorization?.signature_data_url;

  async function downloadAuthorization() {
    if (!authorization) { toast.error("Sem dados de autorização de débito para este pedido."); return; }
    try {
      const passengersString = passengers.length > 0
        ? passengers.map((p) => p.full_name).join(", ")
        : undefined;
      const enriched: AuthorizationData = {
        ...authorization,
        order_number: authorization.order_number ?? snap?.order_number,
        trip_locator: authorization.trip_locator ?? snap?.locator ?? null,
        trip_route: authorization.trip_route ?? snap?.route ?? null,
        trip_date: authorization.trip_date ?? snap?.travel_date ?? null,
        trip_passengers: authorization.trip_passengers ?? passengersString ?? null,
        trip_hotel: authorization.trip_hotel ?? snap?.hotel ?? null,
        trip_flights: authorization.trip_flights ?? snap?.flights ?? null,
        trip_checkin: authorization.trip_checkin ?? snap?.checkin ?? null,
        trip_checkout: authorization.trip_checkout ?? snap?.checkout ?? null,
        trip_days: authorization.trip_days ?? snap?.days ?? null,
        trip_nights: authorization.trip_nights ?? snap?.nights ?? null,
      };
      await generateAuthorizationPDF({ orderId: order.id, createdAt: order.createdAt, authorization: enriched, liveness });
      toast.success("PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <FileText className="h-4 w-4" /> Documentos do pedido
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <div className="font-medium text-sm">Autorização de débito</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {hasAuthorization ? "Gerada com assinatura digital do cliente" : "Sem autorização registrada (pedido sem checkout de cartão)"}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!hasAuthorization} onClick={downloadAuthorization}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar PDF
          </Button>
        </div>
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
          Outros contratos e vouchers podem ser anexados via aba de Documentos do pedido (em breve).
        </div>
      </div>
    </div>
  );
}

// =========== Finance ===========
function FinanceTab({
  items, financials, onChange,
}: { items: OrderItem[]; financials: OrderItemFinancial[]; onChange: () => void }) {
  const upsert = useServerFn(upsertItemFinancial);
  const del = useServerFn(deleteItemFinancial);
  const [editing, setEditing] = useState<OrderItemFinancial | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (payload: Parameters<typeof upsert>[0]["data"]) => upsert({ data: payload }),
    onSuccess: () => { toast.success("Lançamento salvo"); onChange(); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const remove = useMutation({
    mutationFn: async (fid: string) => del({ data: { id: fid } }),
    onSuccess: () => { toast.success("Lançamento removido"); onChange(); },
  });

  const itemsById = useMemo(() => {
    const m: Record<string, OrderItem> = {};
    for (const i of items) m[i.id] = i;
    return m;
  }, [items]);

  const totalCommission = financials.reduce((a, f) => a + Number(f.commission_value || 0), 0);
  const totalSale = financials.reduce((a, f) => a + Number(f.total || f.sale_value || 0), 0);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Adicione uma hospedagem ou aéreo antes de lançar o financeiro.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Financeiro por item
        </h3>
        <Button size="sm" onClick={() => { setEditing(null); setSelectedItem(items[0]?.id ?? null); setOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Novo lançamento
        </Button>
      </div>
      {financials.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Nenhum lançamento financeiro ainda.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Item</th>
                <th className="text-left py-2 px-2">Fornecedor</th>
                <th className="text-right py-2 px-2">Venda</th>
                <th className="text-right py-2 px-2">Desc.</th>
                <th className="text-right py-2 px-2">Comis. pagar</th>
                <th className="text-right py-2 px-2">Câmbio</th>
                <th className="text-left py-2 px-2">Vencto</th>
                <th className="text-right py-2 px-2">Total</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {financials.map((f) => {
                const it = itemsById[f.order_item_id];
                return (
                  <tr key={f.id} className="border-b border-border/50">
                    <td className="py-2 px-2 text-xs">{it?.title ?? "—"}</td>
                    <td className="py-2 px-2 text-xs">{f.supplier_name ?? "—"}</td>
                    <td className="py-2 px-2 text-right text-xs">{formatBRL(f.sale_value)}</td>
                    <td className="py-2 px-2 text-right text-xs">{formatBRL(f.discount_value)}</td>
                    <td className="py-2 px-2 text-right text-xs">
                      {formatBRL(f.commission_value)}
                      <div className="text-[10px] text-muted-foreground">{f.commission_pct}%</div>
                    </td>
                    <td className="py-2 px-2 text-right text-xs">{f.exchange_rate}</td>
                    <td className="py-2 px-2 text-xs">{f.due_date ? new Date(f.due_date + "T00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="py-2 px-2 text-right text-xs font-semibold">{formatBRL(f.total)}</td>
                    <td className="py-2 px-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(f); setSelectedItem(f.order_item_id); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm("Remover lançamento?") && remove.mutate(f.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-xs">
              <tr>
                <td colSpan={4} className="py-2 px-2 text-right text-muted-foreground">Comissão total</td>
                <td colSpan={4} className="py-2 px-2 text-right font-semibold text-brand-orange">{formatBRL(totalCommission)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={4} className="py-2 px-2 text-right text-muted-foreground">Total (venda)</td>
                <td colSpan={4} className="py-2 px-2 text-right font-semibold">{formatBRL(totalSale)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <FinanceDialog
        open={open}
        onOpenChange={setOpen}
        items={items}
        initial={editing}
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        onSave={(payload) => {
          if (!selectedItem) { toast.error("Selecione um item"); return; }
          save.mutate({ ...payload, order_item_id: selectedItem, id: editing?.id });
        }}
      />
    </div>
  );
}

function FinanceDialog({
  open, onOpenChange, items, initial, selectedItem, setSelectedItem, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: OrderItem[];
  initial: OrderItemFinancial | null;
  selectedItem: string | null;
  setSelectedItem: (v: string) => void;
  onSave: (p: Partial<OrderItemFinancial>) => void;
}) {
  const [form, setForm] = useState({
    supplier_name: initial?.supplier_name ?? "",
    sale_value: initial?.sale_value ?? 0,
    discount_value: initial?.discount_value ?? 0,
    commission_value: initial?.commission_value ?? 0,
    commission_pct: initial?.commission_pct ?? 0,
    exchange_rate: initial?.exchange_rate ?? 1,
    due_date: initial?.due_date ?? "",
    total: initial?.total ?? 0,
    notes: initial?.notes ?? "",
  });

  useMemo(() => {
    setForm({
      supplier_name: initial?.supplier_name ?? "",
      sale_value: initial?.sale_value ?? 0,
      discount_value: initial?.discount_value ?? 0,
      commission_value: initial?.commission_value ?? 0,
      commission_pct: initial?.commission_pct ?? 0,
      exchange_rate: initial?.exchange_rate ?? 1,
      due_date: initial?.due_date ?? "",
      total: initial?.total ?? 0,
      notes: initial?.notes ?? "",
    });
  }, [initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lançamento" : "Novo lançamento financeiro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Item</Label>
            <Select value={selectedItem ?? ""} onValueChange={setSelectedItem}>
              <SelectTrigger><SelectValue placeholder="Escolha um item" /></SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    [{it.kind === "flight" ? "Aéreo" : it.kind === "hotel" ? "Hotel" : "Outro"}] {it.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fornecedor</Label>
            <Input value={form.supplier_name ?? ""} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Venda</Label><Input type="number" step="0.01" value={form.sale_value} onChange={(e) => setForm({ ...form, sale_value: Number(e.target.value) })} /></div>
            <div><Label>Desconto</Label><Input type="number" step="0.01" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} /></div>
            <div><Label>Câmbio</Label><Input type="number" step="0.0001" value={form.exchange_rate} onChange={(e) => setForm({ ...form, exchange_rate: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Comissão R$</Label><Input type="number" step="0.01" value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: Number(e.target.value) })} /></div>
            <div><Label>Comissão %</Label><Input type="number" step="0.01" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: Number(e.target.value) })} /></div>
            <div><Label>Vencimento</Label><Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          </div>
          <div>
            <Label>Total</Label>
            <Input type="number" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// keep unused imports satisfied
void Copy;
void DialogTrigger;
