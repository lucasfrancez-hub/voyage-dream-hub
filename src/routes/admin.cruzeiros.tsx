import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Ship,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Radio,
  Loader2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/lib/confirm";
import {
  listCruises,
  createCruise,
  getCruise,
  activateImport,
  setImportStatus,
  reprocessSnapshots,
  deleteSnapshot,
} from "@/lib/cruises/admin.functions";

export const Route = createFileRoute("/admin/cruzeiros")({
  head: () => ({
    meta: [
      { title: "Cruzeiros — importação VIA AIR" },
      {
        name: "description",
        content:
          "Cadastro de cruzeiros e importação de capturas do portal da operadora pelo plugin Exportar Cruzeiro.",
      },
      { property: "og:title", content: "Cruzeiros — importação VIA AIR" },
      {
        property: "og:description",
        content: "Crie o cruzeiro, ative a importação e receba capturas ilimitadas do plugin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CruzeirosAdmin,
});

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function fmtBRL(v?: number | null) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CruzeirosAdmin() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [novo, setNovo] = useState({ name: "", departure_date: "", ship_name: "", operator: "FRT", nights: "" });

  const list = useServerFn(listCruises);
  const detail = useServerFn(getCruise);
  const create = useServerFn(createCruise);
  const activate = useServerFn(activateImport);
  const setStatus = useServerFn(setImportStatus);
  const reprocess = useServerFn(reprocessSnapshots);
  const delSnap = useServerFn(deleteSnapshot);

  const listQ = useQuery({ queryKey: ["cruises"], queryFn: () => list() });
  const detailQ = useQuery({
    queryKey: ["cruise", selected],
    queryFn: () => detail({ data: { id: selected! } }),
    enabled: !!selected,
    refetchInterval: 15000,
  });

  const criar = useMutation({
    mutationFn: () =>
      create({
        data: {
          name: novo.name,
          departure_date: novo.departure_date || undefined,
          ship_name: novo.ship_name,
          operator: novo.operator,
          nights: novo.nights ? Number(novo.nights) : null,
        },
      }),
    onSuccess: (row) => {
      toast.success(`Cruzeiro ${row.code} criado`);
      setNovo({ name: "", departure_date: "", ship_name: "", operator: "FRT", nights: "" });
      setSelected(row.id);
      qc.invalidateQueries({ queryKey: ["cruises"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativar = useMutation({
    mutationFn: async (cruiseId: string) => {
      const r = await activate({ data: { cruise_id: cruiseId } });
      if (r.conflict) {
        const ok = await confirm({
          title: "Já existe uma importação ativa",
          description: `Já existe uma importação ativa para "${r.activeCruiseName}". Deseja encerrar aquela importação e iniciar esta?`,
          confirmText: "Encerrar e ativar aqui",
        });
        if (!ok) return null;
        return activate({ data: { cruise_id: cruiseId, force: true } });
      }
      return r;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success("Importação ativa — o plugin já reconhece este cruzeiro.");
      qc.invalidateQueries({ queryKey: ["cruises"] });
      qc.invalidateQueries({ queryKey: ["cruise", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: (p: { session_id: string; status: "active" | "paused" | "finished" }) =>
      setStatus({ data: p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cruises"] });
      qc.invalidateQueries({ queryKey: ["cruise", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reprocessar = useMutation({
    mutationFn: (p: { snapshot_id?: string; cruise_id?: string }) => reprocess({ data: p }),
    onSuccess: (r) => {
      toast.success(`Reprocessadas ${r.ok}/${r.total} capturas${r.fail ? ` — ${r.fail} com falha` : ""}`);
      qc.invalidateQueries({ queryKey: ["cruise", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirCaptura = useMutation({
    mutationFn: (snapshot_id: string) => delSnap({ data: { snapshot_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cruise", selected] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detailQ.data;
  const session = d?.session ?? null;
  const importAtiva = session?.status === "active";

  const identificados = useMemo(() => {
    if (!d) return [] as { label: string; ok: boolean }[];
    const precosPorOcup = new Set((d.prices ?? []).map((p) => `${p.adults}a${p.children}c${p.young}j`));
    return [
      { label: "Informações principais", ok: Boolean(d.cruise.departure_date && d.cruise.ship_name) },
      { label: "Itinerário", ok: (d.itinerary ?? []).length > 0 },
      { label: "Navio", ok: Boolean(d.ship) },
      { label: "Atrações", ok: (d.shipCounts?.attractions ?? 0) > 0 },
      { label: "Cabines (ofertas)", ok: (d.offers ?? []).length > 0 },
      { label: "Cabines do navio", ok: (d.shipCounts?.cabins ?? 0) > 0 },
      { label: "Deck Plan", ok: (d.shipCounts?.decks ?? 0) > 0 },
      { label: "Fotos/Vídeos", ok: (d.media ?? []).length + (d.shipCounts?.media ?? 0) > 0 },
      { label: "Ficha técnica", ok: Object.keys(((d.ship ?? {}) as Record<string, unknown>).specs as object ?? {}).length > 0 },
      { label: "Adicionais", ok: (d.additionals ?? []).length > 0 },
      { label: "Seguro", ok: (d.insurances ?? []).length > 0 },
      ...[...precosPorOcup].map((k) => ({ label: `Preços ${k}`, ok: true })),
    ];
  }, [d]);

  const ofertasPorTipo = useMemo(() => {
    const map = new Map<string, NonNullable<typeof d>["offers"]>();
    for (const o of d?.offers ?? []) {
      const arr = map.get(o.cabin_type) ?? [];
      arr.push(o);
      map.set(o.cabin_type, arr);
    }
    return [...map.entries()];
  }, [d]);

  const precoVigente = (offerId: string) =>
    (d?.prices ?? []).filter((p) => p.offer_id === offerId && p.is_current);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Ship className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Cruzeiros</h1>
          <p className="text-sm text-muted-foreground">
            Crie o cruzeiro, ative a importação e envie quantas capturas quiser pelo plugin
            <b> Exportar Cruzeiro</b>.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Lista + novo */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="font-medium text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Novo cruzeiro
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input
                  value={novo.name}
                  onChange={(e) => setNovo({ ...novo, name: e.target.value })}
                  placeholder="Réveillon em Alto Mar 26/27"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Saída</Label>
                  <Input
                    type="date"
                    value={novo.departure_date}
                    onChange={(e) => setNovo({ ...novo, departure_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Noites</Label>
                  <Input
                    inputMode="numeric"
                    value={novo.nights}
                    onChange={(e) => setNovo({ ...novo, nights: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Navio</Label>
                <Input
                  value={novo.ship_name}
                  onChange={(e) => setNovo({ ...novo, ship_name: e.target.value })}
                  placeholder="MSC Divina"
                />
              </div>
              <div>
                <Label className="text-xs">Operadora / fonte</Label>
                <Input
                  value={novo.operator}
                  onChange={(e) => setNovo({ ...novo, operator: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                disabled={!novo.name || criar.isPending}
                onClick={() => criar.mutate()}
              >
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar cruzeiro"}
              </Button>
            </div>
          </Card>

          <Card className="p-2">
            {(listQ.data?.cruises ?? []).map((c) => {
              const ativo = listQ.data?.activeSession?.cruise_id === c.id;
              return (
                <div
                  key={c.id}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    selected === c.id ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <button onClick={() => setSelected(c.id)} className="w-full text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{c.name}</span>
                      {ativo && <Radio className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.code} • {fmtDate(c.departure_date)} • {c.ship_name || "navio a definir"}
                    </div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!ativo && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={ativar.isPending}
                        onClick={() => {
                          setSelected(c.id);
                          ativar.mutate(c.id);
                        }}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Ativar importação
                      </Button>
                    )}
                    <Link to="/admin/cruzeiros/previa/$id" params={{ id: c.id }}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        <Eye className="h-3.5 w-3.5 mr-1" /> Ver prévia
                      </Button>
                    </Link>
                  </div>

                </div>
              );
            })}
            {!listQ.isLoading && (listQ.data?.cruises ?? []).length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Nenhum cruzeiro cadastrado ainda.</div>
            )}
          </Card>
        </div>

        {/* Detalhe */}
        <div className="space-y-4">
          {!selected && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Selecione ou crie um cruzeiro para ativar a importação.
            </Card>
          )}

          {selected && detailQ.isLoading && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando cruzeiro…
            </Card>
          )}

          {selected && detailQ.isError && (
            <Card className="p-6 space-y-3">
              <div className="text-sm text-destructive">
                Não foi possível carregar este cruzeiro: {(detailQ.error as Error)?.message}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => detailQ.refetch()}>
                  Tentar novamente
                </Button>
                <Button size="sm" disabled={ativar.isPending} onClick={() => ativar.mutate(selected)}>
                  <Play className="h-4 w-4 mr-1" /> Ativar importação
                </Button>
              </div>
            </Card>
          )}


          {selected && d && (
            <>
              <Card className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{d.cruise.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {d.cruise.code} • {d.cruise.ship_name || "navio a definir"} •{" "}
                      {fmtDate(d.cruise.departure_date)}
                      {d.cruise.nights ? ` • ${d.cruise.nights} noites` : ""}
                    </div>
                  </div>
                  <Badge variant={importAtiva ? "default" : "secondary"}>
                    {importAtiva
                      ? "Importação ativa"
                      : session?.status === "paused"
                        ? "Importação pausada"
                        : session?.status === "finished"
                          ? "Importação finalizada"
                          : "Não iniciada"}
                  </Badge>
                </div>

                {importAtiva && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <div className="font-medium">Importação ativa para:</div>
                    <div>
                      {d.cruise.name} • {d.cruise.ship_name} • {fmtDate(d.cruise.departure_date)}
                    </div>
                    <div className="text-xs mt-1">
                      Token: <code>{session?.token}</code> • Capturas: {session?.snapshots_count ?? 0} •
                      Última: {fmtDateTime(session?.last_capture_at)}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {!importAtiva && (
                    <Button size="sm" onClick={() => ativar.mutate(d.cruise.id)}>
                      <Play className="h-4 w-4 mr-1" /> Ativar importação
                    </Button>
                  )}
                  {importAtiva && session && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mudarStatus.mutate({ session_id: session.id, status: "paused" })}
                      >
                        <Pause className="h-4 w-4 mr-1" /> Pausar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Finalizar importação",
                            description: `Deseja finalizar a importação de "${d.cruise.name}"? Os dados permanecem salvos e você pode reativar depois.`,
                            confirmText: "Finalizar",
                          });
                          if (ok) mudarStatus.mutate({ session_id: session.id, status: "finished" });
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar
                      </Button>
                    </>
                  )}
                  {session?.status === "paused" && (
                    <Button
                      size="sm"
                      onClick={() => mudarStatus.mutate({ session_id: session.id, status: "active" })}
                    >
                      <Play className="h-4 w-4 mr-1" /> Retomar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reprocessar.isPending}
                    onClick={() => reprocessar.mutate({ cruise_id: d.cruise.id })}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${reprocessar.isPending ? "animate-spin" : ""}`} />{" "}
                    Reprocessar todas
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {identificados.map((i) => (
                    <div key={i.label} className="text-sm flex items-center gap-2">
                      <span className={i.ok ? "text-emerald-600" : "text-muted-foreground"}>
                        {i.ok ? "✓" : "—"}
                      </span>
                      <span className={i.ok ? "" : "text-muted-foreground"}>{i.label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Cabines por tipo */}
              {ofertasPorTipo.length > 0 && (
                <Card className="p-5 space-y-4">
                  <div className="font-medium">Cabines e preços</div>
                  {ofertasPorTipo.map(([tipo, ofertas]) => (
                    <div key={tipo} className="space-y-2">
                      <div className="text-sm font-semibold capitalize">{tipo}</div>
                      <div className="grid gap-2">
                        {(ofertas ?? []).map((o) => (
                          <div key={o.id} className="rounded-lg border p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium">{o.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {(o.category_codes ?? []).join(", ") || "sem código"}
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                              {precoVigente(o.id).map((p) => (
                                <span key={p.id}>
                                  {p.adults}A{p.young ? `+${p.young}J` : ""}
                                  {p.children ? `+${p.children}C` : ""}: <b>{fmtBRL(p.total)}</b>
                                </span>
                              ))}
                              {precoVigente(o.id).length === 0 && <span>sem preço capturado</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {/* Capturas */}
              <Card className="p-5 space-y-3">
                <div className="font-medium">Capturas recebidas ({d.snapshots.length})</div>
                <div className="space-y-2">
                  {d.snapshots.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border p-3 text-sm flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium">
                          Captura #{String(s.seq).padStart(2, "0")}{" "}
                          <span className="font-normal text-muted-foreground">
                            {fmtDateTime(s.captured_at)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.summary || s.page_type}
                          {s.error ? ` — ${s.error}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            s.status === "processado"
                              ? "default"
                              : s.status === "falhou"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {s.status}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => reprocessar.mutate({ snapshot_id: s.id })}
                          title="Reprocessar"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await confirm({
                              title: "Excluir captura",
                              description: "A captura bruta será removida. Os dados já consolidados permanecem.",
                              confirmText: "Excluir",
                            });
                            if (ok) excluirCaptura.mutate(s.id);
                          }}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {d.snapshots.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      Nenhuma captura ainda. Ative a importação e clique em <b>Capturar e enviar</b> no plugin.
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
