import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Save, Trash2, Loader2, Plus, CreditCard, Eye, EyeOff, User, Building2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPerson, upsertPerson, deletePerson,
  addPersonCard, deletePersonCard, revealPersonCardNumber,
  type PersonRow, type PersonCardRow, type PersonKind,
} from "@/lib/people.functions";

export const Route = createFileRoute("/admin/pessoas/$id")({
  component: PersonEditPage,
  head: () => ({ meta: [{ title: "Pessoa — Admin" }] }),
});

type FormState = Omit<PersonRow, "id" | "code" | "created_at" | "updated_at" | "created_by" | "created_by_name" | "monde_id">;

const emptyForm: FormState = {
  kind: "PF",
  name: "",
  legal_name: null,
  gender: null,
  birth_date: null,
  foundation_date: null,
  cpf: null,
  cnpj: null,
  rg: null,
  passport_number: null,
  passport_expiration: null,
  state_registration: null,
  municipal_registration: null,
  email: null,
  phone: null,
  mobile_phone: null,
  business_phone: null,
  website: null,
  zip: null,
  address: null,
  number: null,
  complement: null,
  district: null,
  city: null,
  state: null,
  country: null,
  is_foreign: false,
  notes: null,
  seller_name: null,
  charge_boleto_fee: false,
};

function PersonEditPage() {
  const { id } = Route.useParams();
  const isNew = id === "novo";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getFn = useServerFn(getPerson);
  const saveFn = useServerFn(upsertPerson);
  const delFn = useServerFn(deletePerson);
  const addCardFn = useServerFn(addPersonCard);
  const delCardFn = useServerFn(deletePersonCard);
  const revealFn = useServerFn(revealPersonCardNumber);

  const q = useQuery({
    queryKey: ["admin-people", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: !isNew,
  });

  const [tab, setTab] = useState<"detalhes" | "endereco" | "documentos" | "financeiros" | "obs">("detalhes");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [kindChosen, setKindChosen] = useState<boolean>(!isNew);

  useEffect(() => {
    if (!isNew && q.data?.person) {
      const p = q.data.person;
      setForm({
        kind: p.kind,
        name: p.name,
        legal_name: p.legal_name,
        gender: p.gender,
        birth_date: p.birth_date,
        foundation_date: p.foundation_date,
        cpf: p.cpf,
        cnpj: p.cnpj,
        rg: p.rg,
        passport_number: p.passport_number,
        passport_expiration: p.passport_expiration,
        state_registration: p.state_registration,
        municipal_registration: p.municipal_registration,
        email: p.email,
        phone: p.phone,
        mobile_phone: p.mobile_phone,
        business_phone: p.business_phone,
        website: p.website,
        zip: p.zip,
        address: p.address,
        number: p.number,
        complement: p.complement,
        district: p.district,
        city: p.city,
        state: p.state,
        country: p.country,
        is_foreign: p.is_foreign,
        notes: p.notes,
        seller_name: p.seller_name,
        charge_boleto_fee: p.charge_boleto_fee,
      });
    }
  }, [isNew, q.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!isNew) payload.id = id;
      return saveFn({ data: payload });
    },
    onSuccess: (res) => {
      toast.success("Cadastro salvo");
      qc.invalidateQueries({ queryKey: ["admin-people"] });
      if (isNew) navigate({ to: "/admin/pessoas/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cadastro removido");
      qc.invalidateQueries({ queryKey: ["admin-people"] });
      navigate({ to: "/admin/pessoas" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  const person = q.data?.person;
  const cards = q.data?.cards ?? [];

  const tabs: Array<{ id: typeof tab; label: string }> = useMemo(() => {
    const base = [
      { id: "detalhes" as const, label: "Detalhes" },
      { id: "endereco" as const, label: "Endereço" },
      { id: "documentos" as const, label: "Documentos" },
      { id: "financeiros" as const, label: "Dados Financeiros" },
      { id: "obs" as const, label: "Observações" },
    ];
    return base;
  }, []);

  if (!isNew && q.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 py-6">
      <button
        type="button"
        onClick={() => navigate({ to: "/admin/pessoas" })}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-orange"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      <div className="mt-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-10 w-10 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center">
              {form.kind === "PJ" ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold">
                {isNew ? "Novo cadastro" : form.name || "—"}
              </h1>
              <div className="text-xs text-muted-foreground">
                {isNew
                  ? "Preencha os dados abaixo. Você pode adicionar cartões após salvar."
                  : person
                  ? `#${person.code} · Criado por ${person.created_by_name ?? "—"} em ${new Date(person.created_at).toLocaleDateString("pt-BR")}`
                  : ""}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remover ${form.name}?`)) delMut.mutate();
              }}
              disabled={delMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          )}
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="mt-6 border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1 whitespace-nowrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
                tab === t.id
                  ? "border-brand-orange text-brand-orange font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === "detalhes" && (
          <Section title="Identificação">
            <Row>
              <Field label="Tipo">
                <select
                  value={form.kind}
                  onChange={(e) => set("kind", e.target.value as PersonKind)}
                  className={cls}
                >
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </Field>
              <Field label="Nome" required>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} className={cls} />
              </Field>
            </Row>
            {form.kind === "PJ" && (
              <Row>
                <Field label="Razão Social" full>
                  <input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} className={cls} />
                </Field>
              </Row>
            )}
            <Row>
              {form.kind === "PF" ? (
                <>
                  <Field label="Nascimento">
                    <input type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} className={cls} />
                  </Field>
                  <Field label="Sexo">
                    <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)} className={cls}>
                      <option value="">—</option>
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                      <option value="O">Outro</option>
                    </select>
                  </Field>
                </>
              ) : (
                <Field label="Fundação">
                  <input type="date" value={form.foundation_date ?? ""} onChange={(e) => set("foundation_date", e.target.value)} className={cls} />
                </Field>
              )}
            </Row>
            <Row>
              <Field label="E-mail" full>
                <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={cls} />
              </Field>
            </Row>
            <Row>
              <Field label="Telefone">
                <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={cls} />
              </Field>
              <Field label="Celular">
                <input value={form.mobile_phone ?? ""} onChange={(e) => set("mobile_phone", e.target.value)} className={cls} />
              </Field>
              <Field label="Telefone comercial">
                <input value={form.business_phone ?? ""} onChange={(e) => set("business_phone", e.target.value)} className={cls} />
              </Field>
            </Row>
            {form.kind === "PJ" && (
              <Row>
                <Field label="Website" full>
                  <input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} className={cls} />
                </Field>
              </Row>
            )}
            <Row>
              <Field label="Vendedor">
                <input value={form.seller_name ?? ""} onChange={(e) => set("seller_name", e.target.value)} className={cls} />
              </Field>
              <label className="flex items-end gap-2 text-sm text-muted-foreground pb-2">
                <input
                  type="checkbox"
                  checked={form.charge_boleto_fee}
                  onChange={(e) => set("charge_boleto_fee", e.target.checked)}
                />
                Cobrar taxa de boleto
              </label>
            </Row>
          </Section>
        )}

        {tab === "endereco" && (
          <Section title="Endereço">
            <label className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <input
                type="checkbox"
                checked={form.is_foreign}
                onChange={(e) => set("is_foreign", e.target.checked)}
              />
              Endereço no exterior
            </label>
            <Row>
              <Field label="CEP">
                <input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} className={cls} />
              </Field>
              <Field label="Endereço" full>
                <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={cls} />
              </Field>
              <Field label="Número">
                <input value={form.number ?? ""} onChange={(e) => set("number", e.target.value)} className={cls} />
              </Field>
            </Row>
            <Row>
              <Field label="Complemento">
                <input value={form.complement ?? ""} onChange={(e) => set("complement", e.target.value)} className={cls} />
              </Field>
              <Field label="Bairro">
                <input value={form.district ?? ""} onChange={(e) => set("district", e.target.value)} className={cls} />
              </Field>
            </Row>
            <Row>
              <Field label="Cidade">
                <input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} className={cls} />
              </Field>
              <Field label="UF">
                <input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} className={cls} />
              </Field>
              <Field label="País">
                <input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} className={cls} />
              </Field>
            </Row>
          </Section>
        )}

        {tab === "documentos" && (
          <Section title="Documentos">
            {form.kind === "PF" ? (
              <>
                <Row>
                  <Field label="CPF">
                    <input value={form.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)} className={cls} />
                  </Field>
                  <Field label="RG">
                    <input value={form.rg ?? ""} onChange={(e) => set("rg", e.target.value)} className={cls} />
                  </Field>
                  <Field label="Inscrição Municipal">
                    <input value={form.municipal_registration ?? ""} onChange={(e) => set("municipal_registration", e.target.value)} className={cls} />
                  </Field>
                </Row>
                <Row>
                  <Field label="Passaporte">
                    <input value={form.passport_number ?? ""} onChange={(e) => set("passport_number", e.target.value)} className={cls} />
                  </Field>
                  <Field label="Validade do passaporte">
                    <input type="date" value={form.passport_expiration ?? ""} onChange={(e) => set("passport_expiration", e.target.value)} className={cls} />
                  </Field>
                </Row>
              </>
            ) : (
              <Row>
                <Field label="CNPJ">
                  <input value={form.cnpj ?? ""} onChange={(e) => set("cnpj", e.target.value)} className={cls} />
                </Field>
                <Field label="Inscrição Estadual">
                  <input value={form.state_registration ?? ""} onChange={(e) => set("state_registration", e.target.value)} className={cls} />
                </Field>
                <Field label="Inscrição Municipal">
                  <input value={form.municipal_registration ?? ""} onChange={(e) => set("municipal_registration", e.target.value)} className={cls} />
                </Field>
              </Row>
            )}
          </Section>
        )}

        {tab === "financeiros" && (
          <Section title="Cartões de Crédito">
            {isNew ? (
              <p className="text-sm text-muted-foreground">
                Salve o cadastro primeiro para adicionar cartões.
              </p>
            ) : (
              <CardsSection
                personId={id}
                cards={cards}
                onAdd={async (payload) => {
                  await addCardFn({ data: { ...payload, person_id: id } });
                  qc.invalidateQueries({ queryKey: ["admin-people", id] });
                }}
                onDelete={async (cardId) => {
                  await delCardFn({ data: { id: cardId } });
                  qc.invalidateQueries({ queryKey: ["admin-people", id] });
                }}
                onReveal={async (cardId) => (await revealFn({ data: { id: cardId } })).number}
              />
            )}
          </Section>
        )}

        {tab === "obs" && (
          <Section title="Observações">
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={10}
              className={cls}
              placeholder="Notas internas sobre a pessoa…"
            />
          </Section>
        )}
      </div>
    </div>
  );
}

function CardsSection({
  personId: _personId,
  cards,
  onAdd,
  onDelete,
  onReveal,
}: {
  personId: string;
  cards: PersonCardRow[];
  onAdd: (p: { nickname?: string; holder_name?: string; number: string; expiry?: string; is_travel_card: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReveal: (id: string) => Promise<string>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nickname: "",
    holder_name: "",
    number: "",
    expiry: "",
    is_travel_card: false,
  });
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  async function submit() {
    if (!form.number.replace(/\D+/g, "")) {
      toast.error("Informe o número do cartão");
      return;
    }
    setSaving(true);
    try {
      await onAdd({
        nickname: form.nickname || undefined,
        holder_name: form.holder_name || undefined,
        number: form.number,
        expiry: form.expiry || undefined,
        is_travel_card: form.is_travel_card,
      });
      setForm({ nickname: "", holder_name: "", number: "", expiry: "", is_travel_card: false });
      setShowForm(false);
      toast.success("Cartão adicionado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((r) => {
        const n = { ...r };
        delete n[id];
        return n;
      });
      return;
    }
    try {
      const n = await onReveal(id);
      setRevealed((r) => ({ ...r, [id]: n }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-4">
      {cards.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">Nenhum cartão salvo.</p>
      )}
      {cards.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {cards.map((c) => (
            <li key={c.id} className="p-4 flex items-center gap-4">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {c.nickname || c.holder_name || c.brand || "Cartão"}
                  </span>
                  {c.brand && <span className="text-[10px] uppercase rounded-full bg-muted px-2 py-0.5">{c.brand}</span>}
                  {c.is_travel_card && (
                    <span className="text-[10px] uppercase rounded-full bg-brand-orange/10 text-brand-orange px-2 py-0.5">
                      Cartão passagem
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {revealed[c.id]
                    ? revealed[c.id].replace(/(.{4})/g, "$1 ").trim()
                    : `**** **** **** ${c.last4 ?? "----"}`}
                  {c.expiry && <span className="ml-3">Val. {c.expiry}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleReveal(c.id)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:border-brand-orange hover:text-brand-orange"
              >
                {revealed[c.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {revealed[c.id] ? "Ocultar" : "Revelar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Remover este cartão?")) onDelete(c.id);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" /> Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <Row>
            <Field label="Apelido">
              <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} className={cls} />
            </Field>
            <Field label="Titular">
              <input value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} className={cls} />
            </Field>
          </Row>
          <Row>
            <Field label="Número" full>
              <input
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
                className={cls + " font-mono"}
                placeholder="0000 0000 0000 0000"
              />
            </Field>
            <Field label="Validade (MM/AA)">
              <input
                value={form.expiry}
                onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                className={cls}
                placeholder="12/28"
              />
            </Field>
          </Row>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.is_travel_card}
              onChange={(e) => setForm({ ...form, is_travel_card: e.target.checked })}
            />
            Cartão passagem
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar cartão
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange text-brand-orange px-4 py-1.5 text-xs hover:bg-brand-orange/10"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar cartão
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Números completos ficam criptografados no banco (AES-256-GCM) e só são
        revelados sob demanda por usuários internos autenticados.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-3">{children}</div>;
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="block text-xs text-muted-foreground mb-1.5">
        {label} {required && <span className="text-brand-orange">*</span>}
      </span>
      {children}
    </label>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";
