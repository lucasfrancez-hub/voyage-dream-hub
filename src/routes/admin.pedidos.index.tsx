import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Search, ExternalLink, Loader2, Plus, Cloud, Trash2, RotateCcw, Sparkles } from "lucide-react";
import { MondePersonSearchDialog } from "@/components/monde/MondePersonSearchDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import { statusLabel } from "@/lib/order-labels";
import { createOrder, backfillAutoTitles } from "@/lib/orders.functions";
import { searchPeople, listPersonCards } from "@/lib/people.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { confirmThen } from "@/lib/confirm";


export const Route = createFileRoute("/admin/pedidos/")({
  validateSearch: (s: Record<string, unknown>) => ({
    status: (typeof s.status === "string" ? s.status : "all") as StatusFilter,
  }),
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Pedidos — Admin" }] }),
});

function RouteComponent() {
  const { status } = Route.useSearch();
  return <AdminOrders scope="mine" initialStatus={status} />;
}


const STATUS_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Finalizado" },
  { value: "rejected", label: "Rejeitado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "deleted", label: "Excluídos" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];


function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function AdminOrders({ scope, initialStatus }: { scope: "mine" | "third_party"; initialStatus?: StatusFilter }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus ?? "all");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const qc = useQueryClient();
  const showDeleted = statusFilter === "deleted";

  const { data: orders, isLoading } = useQuery({
    enabled: currentUserId !== null,
    queryKey: ["admin", "orders", "list", scope, currentUserId, showDeleted],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_number, created_at, status, full_name, email, phone, cpf, payment_method, total_price, package_snapshot, supplier_name, supplier_order_number, airline_locator, owner_user_id, deleted_at, deleted_reason")
        .order("created_at", { ascending: false })
        .limit(500);
      if (scope === "mine") q = q.eq("owner_user_id", currentUserId!);
      else q = q.neq("owner_user_id", currentUserId!);
      if (showDeleted) q = q.not("deleted_at", "is", null);
      else q = q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });




  const softDelete = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ deleted_at: new Date().toISOString(), deleted_reason: reason, deleted_by: currentUserId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido excluído");
      qc.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ deleted_at: null, deleted_reason: null, deleted_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido restaurado");
      qc.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao restaurar"),
  });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");


  // Nomes das agências parceiras (para "Pedidos de terceiro")
  const { data: agencyByUser } = useQuery({
    enabled: scope === "third_party" && (orders?.length ?? 0) > 0,
    queryKey: ["admin", "partner-agencies-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_agencies")
        .select("user_id, agency_name");
      if (error) throw error;
      const m: Record<string, string> = {};
      for (const r of data ?? []) m[r.user_id] = r.agency_name;
      return m;
    },
  });


  const q = search.trim().toLowerCase();
  const filtered = (orders ?? []).filter((o) => {
    if (statusFilter !== "all" && statusFilter !== "deleted") {
      const s = (o.status ?? "").toLowerCase();
      if (statusFilter === "paid" && s !== "paid" && s !== "approved") return false;
      if (statusFilter !== "paid" && s !== statusFilter) return false;
    }

    if (!q) return true;
    const snap = (o.package_snapshot ?? {}) as { order_number?: string; title?: string };
    const orderNumberCol = (o as { order_number?: string | null }).order_number ?? "";
    return (
      (o.full_name ?? "").toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (o.cpf ?? "").toLowerCase().includes(q) ||
      (o.phone ?? "").toLowerCase().includes(q) ||
      orderNumberCol.toLowerCase().includes(q) ||
      (snap.order_number ?? "").toString().toLowerCase().includes(q) ||
      (snap.title ?? "").toLowerCase().includes(q) ||
      (o.airline_locator ?? "").toLowerCase().includes(q) ||
      (o.supplier_order_number ?? "").toLowerCase().includes(q) ||
      shortId(o.id).toLowerCase().includes(q)
    );
  });

  const statusCounts = (orders ?? []).reduce<Record<string, number>>((acc, o) => {
    const s = (o.status ?? "").toLowerCase();
    const key = s === "approved" ? "paid" : s;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const [newOpen, setNewOpen] = useState(false);
  const [mondeOpen, setMondeOpen] = useState(false);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-display font-bold">
            {scope === "third_party" ? "Pedidos de terceiro" : "Pedidos"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {scope === "third_party"
              ? "Pedidos criados por agências parceiras"
              : null}
            {scope === "third_party" ? " · " : ""}
            {orders?.length ?? 0} pedido(s) · resultado: {filtered.length}
          </p>
        </div>
        {scope === "mine" && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 flex-1 sm:flex-none"
              onClick={async () => {
                const t = toast.loading("Recalculando títulos…");
                try {
                  const r = await backfillAutoTitles();
                  toast.success(`Títulos atualizados em ${r.updated}/${r.total} pedidos.`, { id: t });
                  qc.invalidateQueries({ queryKey: ["orders"] });
                } catch (e) {
                  toast.error("Falha ao recalcular títulos", { id: t, description: (e as Error).message });
                }
              }}
            >
              <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">Recalcular</span> títulos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMondeOpen(true)} className="gap-2 flex-1 sm:flex-none">
              <Cloud className="h-4 w-4" /> <span>Importar do Monde</span>
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)} className="gap-2 flex-1 sm:flex-none">
              <Plus className="h-4 w-4" /> Cadastrar<span className="hidden sm:inline"> pedido</span>
            </Button>
          </div>
        )}

      </div>

      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} />
      <MondePersonSearchDialog
        open={mondeOpen}
        onOpenChange={setMondeOpen}
        onPick={(p) => {
          toast.success(`Cliente "${p.name}" carregado do Monde. Abra um pedido e use o botão de importar dentro dele para vincular como passageiro.`);
        }}
      />


      {/* Search bar (FRT style) */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por Id, passageiro, e-mail, CPF, telefone…"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-brand-orange"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto -mx-1 px-1">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            const count = f.value === "all" ? orders?.length ?? 0 : statusCounts[f.value] ?? 0;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-brand-orange text-primary-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-white/20" : "bg-muted"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Result — table on desktop, cards on mobile */}
      <div className="mt-4 rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          Resultado: {filtered.length} registro(s)
        </div>

        {/* Mobile: card list */}
        <div className="md:hidden divide-y divide-border/50">
          {isLoading && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">Nenhum pedido encontrado.</div>
          )}
          {filtered.map((o) => {
            const snap = (o.package_snapshot ?? {}) as {
              order_number?: string; title?: string; destination?: string; reference?: string;
            };
            
            const st = statusLabel(o.status);
            const displayOrderNumber =
              ((o as { order_number?: string | null }).order_number ?? snap.order_number ?? shortId(o.id));
            return (
              <div key={o.id} className="relative">
                <Link
                  to="/admin/pedidos/$id"
                  params={{ id: o.id }}
                  className="block px-4 py-3 active:bg-muted/40 transition"
                >
                  <div className="flex items-start justify-between gap-3 pr-8">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold tabular-nums tracking-tight">{displayOrderNumber}</div>
                      <div className="mt-1 font-semibold text-sm truncate">{o.full_name}</div>
                      {scope === "third_party" && (
                        <div className="text-[10px] font-semibold text-brand-orange truncate">
                          {agencyByUser?.[o.owner_user_id ?? ""] ?? "Agência parceira"}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">{o.email}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{o.phone}</div>

                      {(snap.title || snap.reference) && (
                        <div className="mt-1 text-xs truncate">{snap.title ?? snap.reference}</div>
                      )}
                      {showDeleted && o.deleted_reason && (
                        <div className="mt-1 text-[11px] text-destructive truncate">Motivo: {o.deleted_reason}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-sm tabular-nums">{formatBRL(Number(o.total_price))}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.className}`}>{st.label}</span>
                  </div>
                </Link>
                {showDeleted ? (
                  <button
                    type="button"
                    aria-label="Restaurar pedido"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); confirmThen("Restaurar este pedido?", () => restore.mutate(o.id)); }}
                    className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Excluir pedido"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget({ id: o.id, label: displayOrderNumber }); setDeleteReason(""); }}
                    className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );

          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-widest">
              <tr>
                <th className="text-left py-3 px-4 font-bold">Id</th>
                <th className="text-left py-3 px-4 font-bold">Contato</th>
                <th className="text-left py-3 px-4 font-bold">Produto</th>
                <th className="text-left py-3 px-4 font-bold">Status</th>
                <th className="text-right py-3 px-4 font-bold">Total</th>
                <th className="text-left py-3 px-4 font-bold">Criação</th>
                <th className="text-right py-3 px-4 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                </td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhum pedido encontrado.
                </td></tr>
              )}
              {filtered.map((o) => {
                const snap = (o.package_snapshot ?? {}) as {
                  order_number?: string;
                  title?: string;
                  destination?: string;
                  reference?: string;
                };
                const st = statusLabel(o.status);
                const displayOrderNumber =
                  ((o as { order_number?: string | null }).order_number ?? snap.order_number ?? shortId(o.id));
                return (
                  <tr key={o.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="py-5 px-4 align-top">
                      <div className="text-sm font-bold tabular-nums tracking-tight">{displayOrderNumber}</div>
                    </td>
                    <td className="py-5 px-4 align-top">
                      <div className="text-sm font-semibold">{o.full_name}</div>
                      {scope === "third_party" && (
                        <div className="text-[10px] font-semibold text-brand-orange mt-0.5">
                          {agencyByUser?.[o.owner_user_id ?? ""] ?? "Agência parceira"}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-1">{o.email}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{o.phone}</div>
                    </td>

                    <td className="py-5 px-4 align-top max-w-[280px]">
                      <div className="text-sm font-medium leading-tight">{snap.title ?? snap.reference ?? "—"}</div>
                      {snap.destination && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">{snap.destination}</div>
                      )}
                    </td>
                    <td className="py-5 px-4 align-top">
                      <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="py-5 px-4 align-top text-right">
                      <div className="text-sm font-bold tabular-nums">{formatBRL(Number(o.total_price))}</div>
                    </td>
                    <td className="py-5 px-4 align-top">
                      <div className="text-[11px] tabular-nums">
                        <div className="text-foreground/70 font-medium">{new Date(o.created_at).toLocaleDateString("pt-BR")}</div>
                        <div className="text-muted-foreground/60">{new Date(o.created_at).toLocaleTimeString("pt-BR")}</div>
                      </div>
                    </td>
                    <td className="py-5 px-4 align-top text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          to="/admin/pedidos/$id"
                          params={{ id: o.id }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-brand-orange px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground hover:brightness-110 active:scale-95 transition-all"
                        >
                          <ExternalLink className="h-3 w-3" /> Abrir
                        </Link>
                        {showDeleted ? (
                          <button
                            type="button"
                            aria-label="Restaurar"
                            title={o.deleted_reason ? `Motivo: ${o.deleted_reason}` : "Restaurar"}
                            onClick={() => confirmThen("Restaurar este pedido?", () => restore.mutate(o.id))}
                            className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label="Excluir"
                            onClick={() => { setDeleteTarget({ id: o.id, label: displayOrderNumber }); setDeleteReason(""); }}
                            className="rounded-md p-2 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir pedido {deleteTarget?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-reason">Motivo da exclusão</Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ex.: pedido de teste, duplicado, cancelado pelo cliente…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!deleteReason.trim() || softDelete.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                softDelete.mutate(
                  { id: deleteTarget.id, reason: deleteReason.trim() },
                  { onSuccess: () => setDeleteTarget(null) },
                );
              }}
            >
              {softDelete.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function NewOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const create = useServerFn(createOrder);
  const search = useServerFn(searchPeople);
  const listCards = useServerFn(listPersonCards);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    cpf: "",
    cnpj: "",
    expected_total: 0,
    adults: 1,
    children: 0,
    person_id: "" as string,
    birth_date: "",
    rg: "",
    zip: "",
    address: "",
    number: "",
  });

  const [savedCardInfo, setSavedCardInfo] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(personQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [personQuery]);

  const { data: people, isFetching } = useQuery({
    enabled: open && debouncedQ.length >= 2,
    queryKey: ["admin", "new-order", "people-search", debouncedQ],
    queryFn: () => search({ data: { q: debouncedQ } }),
  });


  const mut = useMutation({
    mutationFn: async () => create({ data: {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      cpf: form.cpf,
      cnpj: form.cnpj,
      payment_method: "other",
      expected_total: form.expected_total,
      adults: form.adults,
      children: form.children,
      person_id: form.person_id || null,
      birth_date: form.birth_date || null,
      payer_full_name: form.full_name || null,
      payer_cpf: form.cpf || null,
      payer_cnpj: form.cnpj || null,
      payer_ie_rg: form.rg || null,
      payer_email: form.email || null,
      payer_phone: form.phone || null,
      payer_birth_date: form.birth_date || null,
      payer_zip: form.zip || null,
      payer_address: form.address || null,
      payer_number: form.number || null,
    } }),
    onSuccess: (r) => {
      toast.success(`Pedido ${r.order_number} criado`);
      onOpenChange(false);
      navigate({ to: "/admin/pedidos/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar pedido"),
  });

  const submit = () => {
    if (!form.full_name.trim()) {
      toast.error("Preencha o nome completo");
      return;
    }
    if (!form.cpf.trim() && !form.cnpj.trim()) {
      toast.error("Informe CPF ou CNPJ");
      return;
    }
    mut.mutate();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar pedido manual</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="relative">
            <Label>Buscar cliente salvo</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={personQuery}
                onChange={(e) => { setPersonQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                placeholder="Nome, e-mail ou CPF/CNPJ…"
                className="pl-9"
              />
            </div>
            {showResults && debouncedQ.length >= 2 && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
                {isFetching && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando…</div>}
                {!isFetching && (people?.length ?? 0) === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</div>
                )}
                {(people ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={async () => {
                      setForm((f) => ({
                        ...f,
                        person_id: p.id,
                        full_name: p.name ?? f.full_name,
                        email: p.email ?? f.email,
                        phone: p.mobile_phone ?? p.phone ?? f.phone,
                        cpf: p.cpf ?? f.cpf,
                        cnpj: p.cnpj ?? f.cnpj,
                        birth_date: p.birth_date ?? f.birth_date,
                        rg: p.rg ?? f.rg,
                        zip: p.zip ?? f.zip,
                        address: p.address ?? f.address,
                        number: p.number ?? f.number,
                      }));
                      setPersonQuery(p.name ?? "");
                      setShowResults(false);
                      toast.success(`Cliente "${p.name}" carregado`);
                      try {
                        const cards = await listCards({ data: { person_id: p.id } });
                        if (cards && cards.length > 0) {
                          const c = cards[0];
                          setSavedCardInfo(`${cards.length} cartão(ões) salvo(s) — ${c.brand ?? ""} •••• ${c.last4 ?? ""}`);
                        } else {
                          setSavedCardInfo(null);
                        }
                      } catch { setSavedCardInfo(null); }
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 border-b border-border/40 last:border-b-0"
                  >
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[p.cpf ?? p.cnpj, p.email, p.mobile_phone ?? p.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {savedCardInfo && (
              <p className="mt-1 text-[11px] text-primary">💳 {savedCardInfo} — será sugerido no pagamento</p>
            )}
          </div>

          <div><Label>Nome completo *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
            <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-2">Informe CPF ou CNPJ (obrigatório).</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Nascimento</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
            <div><Label>RG</Label><Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
            <div><Label>CEP</Label><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Número</Label><Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Adultos</Label><Input type="number" min={0} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} /></div>
            <div><Label>Crianças</Label><Input type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} /></div>
            <div><Label>Total previsto (R$)</Label><Input type="number" step="0.01" value={form.expected_total} onChange={(e) => setForm({ ...form, expected_total: Number(e.target.value) })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Depois de criar, você entra na tela do pedido para adicionar hospedagem, aéreo, passageiros e lançamentos financeiros.
          </p>

        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

