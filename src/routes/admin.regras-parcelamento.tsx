import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirm } from "@/lib/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { isRuleActiveToday, type InstallmentRule } from "@/lib/packages/installment-rules";

export const Route = createFileRoute("/admin/regras-parcelamento")({
  component: RegrasParcelamentoPage,
  head: () => ({
    meta: [
      { title: "Regras de parcelamento | VIA AIR" },
      {
        name: "description",
        content:
          "Defina o parcelamento sem juros de cada operadora, com validade por período e limites por bandeira.",
      },
      { property: "og:title", content: "Regras de parcelamento | VIA AIR" },
      {
        property: "og:description",
        content: "Parcelamento sem juros por operadora, com validade e limites por bandeira.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SELECT =
  "id,operator_label,match_pattern,max_installments,limited_brands,limited_brands_max,valid_from,valid_until,priority,is_active,notes";

type Draft = Omit<InstallmentRule, "id"> & { id?: string };

const EMPTY: Draft = {
  operator_label: "",
  match_pattern: "",
  max_installments: 10,
  limited_brands: [],
  limited_brands_max: null,
  valid_from: null,
  valid_until: null,
  priority: 0,
  is_active: true,
  notes: null,
};

function RegrasParcelamentoPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["installment-rules-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installment_rules")
        .select(SELECT)
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InstallmentRule[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["installment-rules-admin"] });
    qc.invalidateQueries({ queryKey: ["installment-rules"] });
  };

  const saveMut = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        operator_label: d.operator_label.trim(),
        match_pattern: d.match_pattern.trim().toLowerCase(),
        max_installments: Number(d.max_installments) || 1,
        limited_brands: d.limited_brands,
        limited_brands_max: d.limited_brands_max,
        valid_from: d.valid_from || null,
        valid_until: d.valid_until || null,
        priority: Number(d.priority) || 0,
        is_active: d.is_active,
        notes: d.notes,
      };
      const q = d.id
        ? supabase.from("installment_rules").update(payload).eq("id", d.id)
        : supabase.from("installment_rules").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra salva");
      setDraft(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("installment_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra removida");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (r: InstallmentRule) => {
      const { error } = await supabase
        .from("installment_rules")
        .update({ is_active: !r.is_active })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = useMemo(
    () => [...rules].sort((a, b) => b.priority - a.priority || a.operator_label.localeCompare(b.operator_label)),
    [rules],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCard className="h-6 w-6 text-brand-orange" />
            Regras de parcelamento
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define quantas parcelas sem juros cada operadora oferece no cartão e no boleto
            financiado. Fora do período de validade, volta automaticamente para 10x.
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY })} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova regra
        </Button>
      </header>

      {draft && (
        <form
          className="mb-8 space-y-4 rounded-xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.operator_label.trim() || !draft.match_pattern.trim()) {
              toast.error("Informe o nome e o termo de identificação da operadora");
              return;
            }
            saveMut.mutate(draft);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Operadora</Label>
              <Input
                value={draft.operator_label}
                onChange={(e) => setDraft({ ...draft, operator_label: e.target.value })}
                placeholder="FRT"
              />
            </div>
            <div>
              <Label>Termos de identificação (separe com |)</Label>
              <Input
                value={draft.match_pattern}
                onChange={(e) => setDraft({ ...draft, match_pattern: e.target.value })}
                placeholder="frt|frt operadora"
              />
            </div>
            <div>
              <Label>Parcelas sem juros</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={draft.max_installments}
                onChange={(e) => setDraft({ ...draft, max_installments: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Prioridade (maior vence)</Label>
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Válida a partir de</Label>
              <Input
                type="date"
                value={draft.valid_from ?? ""}
                onChange={(e) => setDraft({ ...draft, valid_from: e.target.value || null })}
              />
            </div>
            <div>
              <Label>Válida até</Label>
              <Input
                type="date"
                value={draft.valid_until ?? ""}
                onChange={(e) => setDraft({ ...draft, valid_until: e.target.value || null })}
              />
            </div>
            <div>
              <Label>Bandeiras com limite menor (separe com vírgula)</Label>
              <Input
                value={draft.limited_brands.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    limited_brands: e.target.value
                      .split(",")
                      .map((b) => b.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Hipercard, Diners, Elo, Amex"
              />
            </div>
            <div>
              <Label>Parcelas dessas bandeiras</Label>
              <Input
                type="number"
                min={1}
                max={24}
                value={draft.limited_brands_max ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    limited_brands_max: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="6"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observação interna</Label>
              <Input
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
                placeholder="Campanha 15x sem juros até 31/08"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={draft.is_active}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
            <span className="text-sm text-muted-foreground">Regra ativa</span>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={saveMut.isPending} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando regras…</p>}

      <ul className="space-y-3">
        {sorted.map((r) => {
          const vigente = isRuleActiveToday(r);
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.operator_label}</span>
                  <span className="rounded-full bg-brand-orange px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {r.max_installments}x sem juros
                  </span>
                  {!vigente && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      fora do período — vale 10x
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Identificação: {r.match_pattern}
                  {r.valid_from || r.valid_until
                    ? ` • Validade: ${r.valid_from ?? "—"} até ${r.valid_until ?? "—"}`
                    : " • Sem prazo"}
                  {r.limited_brands_max != null && r.limited_brands.length > 0
                    ? ` • ${r.limited_brands.join(", ")}: ${r.limited_brands_max}x`
                    : ""}
                </p>
                {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={r.is_active} onCheckedChange={() => toggleMut.mutate(r)} />
                <Button variant="ghost" size="sm" onClick={() => setDraft({ ...r })}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remover regra"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Remover regra?",
                      description: `A regra de ${r.operator_label} deixará de ser aplicada.`,
                      confirmText: "Remover",
                    });
                    if (ok) deleteMut.mutate(r.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
