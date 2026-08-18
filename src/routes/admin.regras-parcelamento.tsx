import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CreditCard,
  FileText,
  Info,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirm } from "@/lib/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CARD_BRANDS,
  DEFAULT_MAX_INSTALLMENTS,
  isRuleActiveToday,
  type InstallmentRule,
} from "@/lib/packages/installment-rules";

export const Route = createFileRoute("/admin/regras-parcelamento")({
  component: RegrasParcelamentoPage,
  head: () => ({
    meta: [
      { title: "Regras de parcelamento | VIA AIR" },
      {
        name: "description",
        content:
          "Defina o parcelamento sem juros de cada operadora no cartão e no boleto, com validade por período e limites por bandeira.",
      },
      { property: "og:title", content: "Regras de parcelamento | VIA AIR" },
      {
        property: "og:description",
        content:
          "Parcelamento sem juros por operadora no cartão e no boleto, com validade e limites por bandeira.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SELECT =
  "id,operator_label,match_pattern,max_installments,limited_brands,limited_brands_max,valid_from,valid_until,priority,is_active,notes,boleto_financiado_enabled,boleto_financiado_max,boleto_prepago_enabled";

type Draft = Omit<InstallmentRule, "id"> & { id?: string };

const EMPTY: Draft = {
  operator_label: "",
  match_pattern: "",
  max_installments: DEFAULT_MAX_INSTALLMENTS,
  limited_brands: [],
  limited_brands_max: null,
  valid_from: null,
  valid_until: null,
  priority: 0,
  is_active: true,
  notes: null,
  boleto_financiado_enabled: true,
  boleto_financiado_max: null,
  boleto_prepago_enabled: true,
};

function formatDateBR(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return d ? `${d}/${m}/${y}` : iso;
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background/60 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 24,
  suffix = "x",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
      <button
        type="button"
        className="h-8 w-8 rounded-full text-lg leading-none text-muted-foreground transition hover:bg-muted"
        onClick={() => onChange(clamp(value - 1))}
        aria-label="Diminuir"
      >
        −
      </button>
      <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        className="h-8 w-8 rounded-full text-lg leading-none text-muted-foreground transition hover:bg-muted"
        onClick={() => onChange(clamp(value + 1))}
        aria-label="Aumentar"
      >
        +
      </button>
    </div>
  );
}

function BrandChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (brand: string) => void;
}) {
  const isOn = (b: string) => selected.some((s) => s.trim().toLowerCase() === b.toLowerCase());
  return (
    <div className="flex flex-wrap gap-2">
      {CARD_BRANDS.map((b) => {
        const on = isOn(b);
        return (
          <button
            key={b}
            type="button"
            onClick={() => onToggle(b)}
            aria-pressed={on}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              on
                ? "border-brand-orange bg-brand-orange text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-brand-orange/50 hover:text-foreground"
            }`}
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function RegrasParcelamentoPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hasValidade, setHasValidade] = useState(false);

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

  const openDraft = (d: Draft) => {
    setDraft(d);
    setHasValidade(Boolean(d.valid_from || d.valid_until));
  };

  const saveMut = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        operator_label: d.operator_label.trim(),
        match_pattern: d.match_pattern.trim().toLowerCase(),
        max_installments: Number(d.max_installments) || 1,
        limited_brands: d.limited_brands,
        limited_brands_max: d.limited_brands.length ? d.limited_brands_max : null,
        valid_from: hasValidade ? d.valid_from || null : null,
        valid_until: hasValidade ? d.valid_until || null : null,
        priority: Number(d.priority) || 0,
        is_active: d.is_active,
        notes: d.notes,
        boleto_financiado_enabled: d.boleto_financiado_enabled,
        boleto_financiado_max: d.boleto_financiado_enabled ? d.boleto_financiado_max : null,
        boleto_prepago_enabled: d.boleto_prepago_enabled,
      };
      const q = d.id
        ? supabase.from("installment_rules").update(payload).eq("id", d.id)
        : supabase.from("installment_rules").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra salva — já vale nos pacotes");
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
    () =>
      [...rules].sort(
        (a, b) => b.priority - a.priority || a.operator_label.localeCompare(b.operator_label),
      ),
    [rules],
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CreditCard className="h-6 w-6 text-brand-orange" />
            Regras de parcelamento
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Defina, por operadora, quantas parcelas sem juros valem no cartão e no boleto. Tudo o
            que for configurado aqui aparece automaticamente nos pacotes e no checkout. Sem prazo de
            validade, a regra vale sempre; fora do período, volta para {DEFAULT_MAX_INSTALLMENTS}x.
          </p>
        </div>
        <Button onClick={() => openDraft({ ...EMPTY })} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova regra
        </Button>
      </header>

      {draft && (
        <form
          className="mb-10 space-y-4 rounded-3xl border border-brand-orange/30 bg-card p-4 shadow-sm sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.operator_label.trim() || !draft.match_pattern.trim()) {
              toast.error("Informe o nome e o termo de identificação da operadora");
              return;
            }
            if (draft.limited_brands.length && !draft.limited_brands_max) {
              toast.error("Informe em quantas vezes as bandeiras selecionadas podem parcelar");
              return;
            }
            saveMut.mutate(draft);
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {draft.id ? `Editando ${draft.operator_label || "regra"}` : "Nova regra"}
            </h2>
            <Button type="button" variant="ghost" size="icon" onClick={() => setDraft(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Section
            icon={Info}
            title="Operadora"
            hint="O termo de identificação casa com o fornecedor do pacote. Separe variações com |."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome exibido</Label>
                <Input
                  className="mt-1"
                  value={draft.operator_label}
                  onChange={(e) => setDraft({ ...draft, operator_label: e.target.value })}
                  placeholder="FRT"
                />
              </div>
              <div>
                <Label>Termos de identificação</Label>
                <Input
                  className="mt-1"
                  value={draft.match_pattern}
                  onChange={(e) => setDraft({ ...draft, match_pattern: e.target.value })}
                  placeholder="frt|frt operadora"
                />
              </div>
            </div>
          </Section>

          <Section
            icon={CreditCard}
            title="Cartão de crédito"
            hint="Parcelamento sem juros e bandeiras com limite menor."
          >
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-sm font-medium">Parcelas sem juros</span>
                <Stepper
                  value={draft.max_installments}
                  onChange={(v) => setDraft({ ...draft, max_installments: v })}
                />
              </div>

              <div>
                <Label className="mb-2 block">Bandeiras com limite menor</Label>
                <BrandChips
                  selected={draft.limited_brands}
                  onToggle={(brand) => {
                    const has = draft.limited_brands.some(
                      (b) => b.trim().toLowerCase() === brand.toLowerCase(),
                    );
                    const next = has
                      ? draft.limited_brands.filter(
                          (b) => b.trim().toLowerCase() !== brand.toLowerCase(),
                        )
                      : [...draft.limited_brands, brand];
                    setDraft({
                      ...draft,
                      limited_brands: next,
                      limited_brands_max: next.length ? (draft.limited_brands_max ?? 6) : null,
                    });
                  }}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Deixe nenhuma selecionada para que todas as bandeiras sigam o limite acima.
                </p>
              </div>

              {draft.limited_brands.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3">
                  <span className="text-sm font-medium">
                    {draft.limited_brands.join(", ")} parcelam em até
                  </span>
                  <Stepper
                    value={draft.limited_brands_max ?? 6}
                    max={draft.max_installments}
                    onChange={(v) => setDraft({ ...draft, limited_brands_max: v })}
                  />
                </div>
              )}
            </div>
          </Section>

          <Section
            icon={FileText}
            title="Boleto"
            hint="Vale para o boleto bancário financiado e para o boleto pré-pago."
          >
            <div className="space-y-3">
              <ToggleRow
                label="Boleto bancário (financiado)"
                hint="Parcelado sem juros, sujeito à análise. 1ª parcela em 30 dias."
                checked={draft.boleto_financiado_enabled}
                onChange={(v) => setDraft({ ...draft, boleto_financiado_enabled: v })}
              />
              {draft.boleto_financiado_enabled && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Parcelas no boleto financiado</p>
                    <p className="text-xs text-muted-foreground">
                      {draft.boleto_financiado_max == null
                        ? `Seguindo o cartão: ${draft.max_installments}x`
                        : "Limite próprio do boleto"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Stepper
                      value={draft.boleto_financiado_max ?? draft.max_installments}
                      onChange={(v) => setDraft({ ...draft, boleto_financiado_max: v })}
                    />
                    {draft.boleto_financiado_max != null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDraft({ ...draft, boleto_financiado_max: null })}
                      >
                        Igualar ao cartão
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <ToggleRow
                label="Boleto pré-pago"
                hint="Sem juros e sem análise, quitado até 30 dias antes do embarque."
                checked={draft.boleto_prepago_enabled}
                onChange={(v) => setDraft({ ...draft, boleto_prepago_enabled: v })}
              />
            </div>
          </Section>

          <Section
            icon={CalendarClock}
            title="Validade"
            hint="Sem validade, a regra vale por tempo indeterminado."
          >
            <div className="space-y-3">
              <ToggleRow
                label="Esta regra tem prazo de validade"
                checked={hasValidade}
                onChange={(v) => {
                  setHasValidade(v);
                  if (!v) setDraft({ ...draft, valid_from: null, valid_until: null });
                }}
              />
              {hasValidade && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Válida a partir de</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={draft.valid_from ?? ""}
                      onChange={(e) => setDraft({ ...draft, valid_from: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <Label>Válida até</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={draft.valid_until ?? ""}
                      onChange={(e) => setDraft({ ...draft, valid_until: e.target.value || null })}
                    />
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section icon={Info} title="Ajustes finais">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Prioridade (maior vence)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Observação interna</Label>
                <Input
                  className="mt-1"
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
                  placeholder="Campanha 15x sem juros até 31/08"
                />
              </div>
              <div className="sm:col-span-2">
                <ToggleRow
                  label="Regra ativa"
                  checked={draft.is_active}
                  onChange={(v) => setDraft({ ...draft, is_active: v })}
                />
              </div>
            </div>
          </Section>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" disabled={saveMut.isPending} className="gap-2">
              <Save className="h-4 w-4" />
              Salvar regra
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando regras…</p>}

      {!isLoading && sorted.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma regra cadastrada — todos os pacotes usam {DEFAULT_MAX_INSTALLMENTS}x sem juros.
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {sorted.map((r) => {
          const vigente = isRuleActiveToday(r);
          const boletoMax = r.boleto_financiado_max ?? r.max_installments;
          return (
            <li
              key={r.id}
              className={`rounded-2xl border bg-card p-5 shadow-sm transition ${
                vigente ? "border-border" : "border-dashed border-border opacity-75"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{r.operator_label}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.match_pattern}</p>
                </div>
                <Switch checked={r.is_active} onCheckedChange={() => toggleMut.mutate(r)} />
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="h-4 w-4" /> Cartão
                  </span>
                  <strong>{r.max_installments}x sem juros</strong>
                </div>
                {r.limited_brands.length > 0 && r.limited_brands_max != null && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.limited_brands.map((b) => (
                      <span
                        key={b}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {b} · {r.limited_brands_max}x
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" /> Boleto financiado
                  </span>
                  <strong>
                    {r.boleto_financiado_enabled ? `${boletoMax}x sem juros` : "Indisponível"}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" /> Boleto pré-pago
                  </span>
                  <strong>{r.boleto_prepago_enabled ? "Disponível" : "Indisponível"}</strong>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CalendarClock className="h-4 w-4" /> Validade
                  </span>
                  <strong className="text-right text-xs">
                    {r.valid_from || r.valid_until
                      ? `${formatDateBR(r.valid_from)} → ${formatDateBR(r.valid_until)}`
                      : "Sem prazo"}
                  </strong>
                </div>
                {!vigente && (
                  <p className="text-xs text-muted-foreground">
                    Fora do período ou desativada — vale {DEFAULT_MAX_INSTALLMENTS}x.
                  </p>
                )}
                {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
              </div>

              <div className="mt-4 flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openDraft({ ...r })}>
                  <Pencil className="h-3.5 w-3.5" />
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
