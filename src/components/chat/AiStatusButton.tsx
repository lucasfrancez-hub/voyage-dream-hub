import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Loader2, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAiModelStatus, pingAiModels, setAiModelChain } from "@/lib/chat/ai-status.functions";

export function AiStatusButton() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[] | null>(null);
  const qc = useQueryClient();

  const statusFn = useServerFn(getAiModelStatus);
  const pingFn = useServerFn(pingAiModels);
  const saveFn = useServerFn(setAiModelChain);

  const { data: status } = useQuery({
    queryKey: ["ai-model-status"],
    queryFn: () => statusFn(),
    staleTime: 60_000,
  });

  const { data: health, isFetching: pinging, refetch } = useQuery({
    queryKey: ["ai-model-health"],
    queryFn: () => pingFn({ data: undefined as never }),
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const save = useMutation({
    mutationFn: (chain: string[]) => saveFn({ data: { chain } }),
    onSuccess: () => {
      toast.success("Cadeia de modelos atualizada");
      qc.invalidateQueries({ queryKey: ["ai-model-status"] });
      setDraft(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chain = draft ?? status?.chain ?? [];
  const catalog = status?.catalog ?? [];
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const healthById = useMemo(
    () => new Map((health?.results ?? []).map((r) => [r.id, r])),
    [health],
  );

  const active = chain[0];
  const activeHealth = active ? healthById.get(active) : undefined;
  const anyDown = (health?.results ?? []).some((r) => !r.ok);

  const move = (i: number, dir: -1 | 1) => {
    const next = [...chain];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setDraft(next);
  };
  const remove = (i: number) => setDraft(chain.filter((_, k) => k !== i));
  const add = (id: string) => setDraft([...chain, id]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`IA em uso: ${active ? byId.get(active)?.label ?? active : "—"}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 hover:bg-slate-100"
      >
        <span className="relative flex h-2 w-2">
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              activeHealth ? (activeHealth.ok ? "bg-emerald-500" : "bg-red-500") : anyDown ? "bg-amber-500" : "bg-slate-400"
            }`}
          />
        </span>
        <Activity className="h-3.5 w-3.5" />
        <span className="hidden lg:inline text-xs font-medium">
          {active ? byId.get(active)?.label ?? active : "IA"}
        </span>
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Status dos modelos de IA</DialogTitle>
            <DialogDescription>
              Modelo principal em uso agora: <strong>{active ? byId.get(active)?.label ?? active : "—"}</strong>.
              Os demais entram em ordem, como reserva, quando o anterior falha.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Ordem de uso (fallback)</h3>
                <Button size="sm" variant="outline" onClick={() => refetch()} disabled={pinging}>
                  {pinging ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Activity className="mr-1.5 h-3.5 w-3.5" />}
                  Testar agora
                </Button>
              </div>
              <ul className="space-y-1.5">
                {chain.map((id, i) => {
                  const h = healthById.get(id);
                  return (
                    <li key={`${id}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                      <span className="w-5 text-xs text-muted-foreground">{i + 1}º</span>
                      <span className="flex-1 truncate text-sm">{byId.get(id)?.label ?? id}</span>
                      <HealthPill h={h} pinging={pinging} />
                      <button className="rounded p-1 hover:bg-muted" onClick={() => move(i, -1)} title="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button className="rounded p-1 hover:bg-muted" onClick={() => move(i, 1)} title="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button className="rounded p-1 text-destructive hover:bg-muted" onClick={() => remove(i)} title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Todos os modelos disponíveis</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {catalog.map((c) => {
                  const h = healthById.get(c.id);
                  return (
                    <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
                      <span className="flex-1 truncate text-sm">
                        {c.label} <span className="text-[11px] text-muted-foreground">· {c.vendor}</span>
                      </span>
                      <HealthPill h={h} pinging={pinging} />
                      <button className="rounded p-1 hover:bg-muted" onClick={() => add(c.id)} title="Adicionar à cadeia">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {health?.checkedAt && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Última verificação: {new Date(health.checkedAt).toLocaleTimeString("pt-BR")}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={!draft}>Desfazer</Button>
            <Button onClick={() => save.mutate(chain)} disabled={!draft || save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HealthPill({ h, pinging }: { h?: { ok: boolean; ms: number; status: number | null; error: string | null }; pinging: boolean }) {
  if (!h) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {pinging ? <Loader2 className="h-3 w-3 animate-spin" /> : "—"}
      </span>
    );
  }
  if (h.ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {h.ms} ms
      </span>
    );
  }
  return (
    <span
      title={h.error ?? ""}
      className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600"
    >
      <AlertTriangle className="h-3 w-3" /> {h.status ?? "erro"}
    </span>
  );
}
