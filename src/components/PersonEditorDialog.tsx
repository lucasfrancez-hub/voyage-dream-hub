import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Save, Trash2, Loader2, Plus, CreditCard, Eye, EyeOff, User, Building2,
  ShoppingBag, Wallet, ExternalLink, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPerson, upsertPerson, deletePerson,
  addPersonCard, deletePersonCard, revealPersonCardNumber,
  getPersonSalesAndFinancials,
  type PersonRow, type PersonCardRow, type PersonKind,
  type PersonFinancialSummary,
} from "@/lib/people.functions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { confirm } from "@/lib/confirm";

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

type TabId = "detalhes" | "adicionais" | "vendas" | "financeiros" | "contato" | "endereco" | "documentos" | "obs";

export function PersonEditorDialog({
  personId,
  open,
  onOpenChange,
  onSaved,
}: {
  personId: string | null; // null | "novo" = create, otherwise edit
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (id: string) => void;
}) {
  const isNew = !personId || personId === "novo";
  const id = personId ?? "novo";
  const qc = useQueryClient();

  const getFn = useServerFn(getPerson);
  const saveFn = useServerFn(upsertPerson);
  const delFn = useServerFn(deletePerson);
  const addCardFn = useServerFn(addPersonCard);
  const delCardFn = useServerFn(deletePersonCard);
  const revealFn = useServerFn(revealPersonCardNumber);
  const salesFn = useServerFn(getPersonSalesAndFinancials);

  const q = useQuery({
    queryKey: ["admin-people", id],
    queryFn: () => getFn({ data: { id } }),
    enabled: !isNew && open,
  });

  const [tab, setTab] = useState<TabId>("detalhes");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [kindChosen, setKindChosen] = useState<boolean>(!isNew);

  const salesQ = useQuery({
    queryKey: ["admin-people", id, "sales"],
    queryFn: () => salesFn({ data: { id } }),
    enabled: !isNew && open && (tab === "vendas" || tab === "financeiros"),
  });

  // reset when dialog opens/changes person
  useEffect(() => {
    if (!open) return;
    setTab("detalhes");
    if (isNew) {
      setForm(emptyForm);
      setKindChosen(false);
    } else {
      setKindChosen(true);
    }
  }, [open, personId, isNew]);

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
      onSaved?.(res.id);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Cadastro removido");
      qc.invalidateQueries({ queryKey: ["admin-people"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  const person = q.data?.person;
  const cards = q.data?.cards ?? [];

  const tabs: Array<{ id: TabId; label: string }> = useMemo(() => ([
    { id: "detalhes", label: "Detalhes" },
    { id: "adicionais", label: "Dados Adicionais" },
    { id: "vendas", label: "Vendas" },
    { id: "financeiros", label: "Dados Financeiros" },
    { id: "contato", label: "Contatos" },
    { id: "endereco", label: "Endereço" },
    { id: "documentos", label: "Documentos" },
    { id: "obs", label: "Observações" },
  ]), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-5xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col bg-card border-border"
        showCloseButton={false}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-muted/30">
          <span className="h-9 w-9 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center">
            {form.kind === "PJ" ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-semibold truncate">
              {isNew ? (form.kind === "PJ" ? "Nova Pessoa Jurídica" : "Nova Pessoa Física") : (form.name || "—")}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {isNew
                ? "Preencha os dados abaixo."
                : person
                ? `#${person.code} · ${form.kind === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} · atualizado em ${new Date(person.updated_at).toLocaleDateString("pt-BR")}`
                : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        {!isNew && q.isLoading ? (
          <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : isNew && !kindChosen ? (
          <div className="px-8 py-10">
            <h2 className="font-display text-xl font-bold mb-1">Novo cadastro</h2>
            <p className="text-sm text-muted-foreground mb-6">Escolha o tipo de pessoa antes de continuar.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => { set("kind", "PF"); setKindChosen(true); }}
                className="rounded-xl border border-border p-6 text-left hover:border-brand-orange hover:bg-brand-orange/5 transition"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange mb-3">
                  <User className="h-5 w-5" />
                </span>
                <div className="font-semibold">Pessoa Física</div>
                <div className="text-xs text-muted-foreground mt-1">CPF, RG, nascimento, passaporte</div>
              </button>
              <button
                type="button"
                onClick={() => { set("kind", "PJ"); setKindChosen(true); }}
                className="rounded-xl border border-border p-6 text-left hover:border-brand-orange hover:bg-brand-orange/5 transition"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange mb-3">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="font-semibold">Pessoa Jurídica</div>
                <div className="text-xs text-muted-foreground mt-1">CNPJ, razão social, inscrições, fundação</div>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* tabs */}
            <div className="px-4 border-b border-border overflow-x-auto">
              <div className="flex items-center gap-1 whitespace-nowrap">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-3.5 py-2.5 text-[13px] border-b-2 -mb-px transition ${
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

            {/* content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 bg-background/40">
              {tab === "detalhes" && (
                <Section title="Dados pessoais">
                  <Row>
                    <Field label="Tipo">
                      <select value={form.kind} onChange={(e) => set("kind", e.target.value as PersonKind)} className={cls}>
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </Field>
                    <Field label={form.kind === "PJ" ? "Nome fantasia" : "Nome"} required full>
                      <input value={form.name} onChange={(e) => set("name", e.target.value)} className={cls} />
                    </Field>
                  </Row>
                  {form.kind === "PJ" ? (
                    <Row>
                      <Field label="Razão social" full>
                        <input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} className={cls} />
                      </Field>
                      <Field label="Data de fundação">
                        <input type="date" value={form.foundation_date ?? ""} onChange={(e) => set("foundation_date", e.target.value)} className={cls} />
                      </Field>
                    </Row>
                  ) : (
                    <>
                      <Row>
                        <Field label="Data de nascimento">
                          <input type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} className={cls} />
                        </Field>
                        <Field label="RG">
                          <input value={form.rg ?? ""} onChange={(e) => set("rg", e.target.value)} className={cls} />
                        </Field>
                        <Field label="Sexo">
                          <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)} className={cls}>
                            <option value="">—</option>
                            <option value="M">Masculino</option>
                            <option value="F">Feminino</option>
                            <option value="O">Outro</option>
                          </select>
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
                  )}
                </Section>
              )}

              {tab === "endereco" && (
                <Section title="Endereço">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                    <input type="checkbox" checked={form.is_foreign} onChange={(e) => set("is_foreign", e.target.checked)} />
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

              {tab === "contato" && (
                <Section title="Contato">
                  <Row>
                    <Field label="E-mail" full>
                      <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={cls} />
                    </Field>
                    <Field label="Website">
                      <input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} className={cls} />
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
                </Section>
              )}

              {tab === "adicionais" && (
                <Section title="Dados Adicionais">
                  <Row>
                    <Field label="Vendedor responsável">
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
                  <div className="text-xs text-muted-foreground">
                    Campos adicionais importados do Monde aparecerão aqui após a integração da API.
                  </div>
                </Section>
              )}

              {tab === "vendas" && !isNew && (
                <Section title="Vendas vinculadas">
                  {salesQ.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                    </div>
                  ) : (salesQ.data?.sales.length ?? 0) === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShoppingBag className="h-4 w-4" /> Nenhum pedido vinculado a esta pessoa.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Pedido</th>
                            <th className="px-3 py-2 text-left">Título</th>
                            <th className="px-3 py-2 text-left">Fornecedor</th>
                            <th className="px-3 py-2 text-left">Status</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="px-3 py-2 text-right">Pago</th>
                            <th className="px-3 py-2 text-right">Pendente</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesQ.data!.sales.map((s) => (
                            <tr key={s.id} className="border-t border-border">
                              <td className="px-3 py-2 font-mono text-xs">#{s.order_number ?? "—"}</td>
                              <td className="px-3 py-2">{s.trip_title ?? "—"}</td>
                              <td className="px-3 py-2">{s.supplier_name ?? "—"}</td>
                              <td className="px-3 py-2 text-xs">{s.status ?? "—"}</td>
                              <td className="px-3 py-2 text-right">{fmtBRL(s.total_price ?? 0)}</td>
                              <td className="px-3 py-2 text-right text-emerald-600">{fmtBRL(s.paid)}</td>
                              <td className="px-3 py-2 text-right text-amber-600">{fmtBRL(s.pending)}</td>
                              <td className="px-3 py-2 text-right">
                                <Link
                                  to="/admin/pedidos/$id"
                                  params={{ id: s.id }}
                                  onClick={() => onOpenChange(false)}
                                  className="inline-flex items-center gap-1 text-brand-orange hover:underline text-xs"
                                >
                                  Abrir <ExternalLink className="h-3 w-3" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              )}

              {tab === "financeiros" && (
                <div className="space-y-6">
                  {!isNew && (
                    <Section title="Resumo financeiro">
                      {salesQ.isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                        </div>
                      ) : (
                        <FinancialSummaryView summary={salesQ.data?.summary} />
                      )}
                    </Section>
                  )}
                  <Section title="Cartões de Crédito">
                    {isNew ? (
                      <p className="text-sm text-muted-foreground">
                        Salve o cadastro primeiro para adicionar cartões.
                      </p>
                    ) : (
                      <CardsSection
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
                </div>
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

            {/* footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/30">
              <div>
                {!isNew && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Remover pessoa?",
                        description: `Tem certeza que deseja remover "${form.name}"?`,
                        confirmText: "Remover",
                        destructive: true,
                      });
                      if (ok) delMut.mutate();
                    }}
                    disabled={delMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- helpers ---------- */

function CardsSection({
  cards,
  onAdd,
  onDelete,
  onReveal,
}: {
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
      setRevealed((r) => { const n = { ...r }; delete n[id]; return n; });
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
                  <span className="font-medium">{c.nickname || c.holder_name || c.brand || "Cartão"}</span>
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
                onClick={() => { if (confirm ? window.confirm("Remover este cartão?") : true) onDelete(c.id); }}
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
              <input value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} className={cls} placeholder="12/28" />
            </Field>
          </Row>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={form.is_travel_card} onChange={(e) => setForm({ ...form, is_travel_card: e.target.checked })} />
            Cartão passagem
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
            <button type="button" disabled={saving} onClick={submit} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar cartão
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange text-brand-orange px-4 py-1.5 text-xs hover:bg-brand-orange/10">
          <Plus className="h-3.5 w-3.5" /> Adicionar cartão
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Números completos ficam criptografados no banco (AES-256-GCM) e só são revelados sob demanda por usuários internos autenticados.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-sm">{title}</h2>
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

function fmtBRL(v: number) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FinancialSummaryView({ summary }: { summary?: PersonFinancialSummary }) {
  if (!summary) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Wallet className="h-4 w-4" /> Sem dados financeiros ainda.
      </div>
    );
  }
  const items = [
    { label: "Pedidos", value: String(summary.orders_count) },
    { label: "Total contratado", value: fmtBRL(summary.total_gross) },
    { label: "Pago", value: fmtBRL(summary.total_paid), tone: "text-emerald-600" },
    { label: "Pendente", value: fmtBRL(summary.total_pending), tone: "text-amber-600" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-border p-4">
          <div className="text-[11px] uppercase text-muted-foreground tracking-wide">{it.label}</div>
          <div className={`mt-1 text-lg font-semibold ${it.tone ?? ""}`}>{it.value}</div>
        </div>
      ))}
      {summary.last_order_at && (
        <div className="col-span-2 md:col-span-4 text-xs text-muted-foreground">
          Último pedido em {new Date(summary.last_order_at).toLocaleDateString("pt-BR")}.
        </div>
      )}
    </div>
  );
}
