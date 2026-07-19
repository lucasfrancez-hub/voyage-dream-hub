import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Save, Trash2, Loader2, Plus, CreditCard, Eye, EyeOff, User, Building2, Pencil,
  ShoppingBag, Wallet, ExternalLink, Check, X as XIcon, Tag as TagIcon, Paperclip,
  Download, Upload, FileText, ClipboardList, Calculator,
} from "lucide-react";
import { toast } from "sonner";
import {
  getPerson, upsertPerson, deletePerson,
  addPersonCard, updatePersonCard, deletePersonCard, revealPersonCardNumber,
  getPersonSalesAndFinancials,
  savePersonPhone, deletePersonPhone,
  savePersonEmail, deletePersonEmail,
  savePersonTag, deletePersonTag,
  savePersonCustomField, deletePersonCustomField,
  addPersonAttachment, deletePersonAttachment, getPersonAttachmentUrl,
  listPersonNfse,
  type PersonRow, type PersonCardRow, type PersonKind,
  type PersonFinancialSummary, type PersonPhone, type PersonEmail,
  type PersonTag, type PersonAttachment, type PersonCustomField,
  type PersonNfseRow,
} from "@/lib/people.functions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { confirm } from "@/lib/confirm";
import { NfseDetailsDialog } from "@/components/nfse/NfseDetailsDialog";
import { supabase } from "@/integrations/supabase/client";

type FormState = Omit<PersonRow, "id" | "code" | "created_at" | "updated_at" | "created_by" | "created_by_name" | "monde_id">;

// ---- International phone formatting ----
// Country calling codes: 1-digit (NANP, Russia) + 3-digit set; everything else = 2-digit.
const CC_1 = new Set(["1", "7"]);
const CC_3 = new Set([
  "20","27","30","31","32","33","34","36","39","40","41","43","44","45","46","47","48","49",
  "51","52","53","54","55","56","57","58","60","61","62","63","64","65","66","81","82","84","86","90","91","92","93","94","95","98",
  "211","212","213","216","218","220","221","222","223","224","225","226","227","228","229","230","231","232","233","234","235","236","237","238","239",
  "240","241","242","243","244","245","246","247","248","249","250","251","252","253","254","255","256","257","258","260","261","262","263","264","265","266","267","268","269",
  "290","291","297","298","299","350","351","352","353","354","355","356","357","358","359","370","371","372","373","374","375","376","377","378","380","381","382","383","385","386","387","389",
  "420","421","423","500","501","502","503","504","505","506","507","508","509","590","591","592","593","594","595","596","597","598","599",
  "670","672","673","674","675","676","677","678","679","680","681","682","683","685","686","687","688","689","690","691","692",
  "800","808","850","852","853","855","856","870","878","880","881","882","883","886","888",
  "960","961","962","963","964","965","966","967","968","970","971","972","973","974","975","976","977","992","993","994","995","996","998",
]);
function formatIntlPhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  let cc = "";
  if (digits.length >= 3 && CC_3.has(digits.slice(0, 3))) cc = digits.slice(0, 3);
  else if (digits.length >= 2 && !CC_1.has(digits[0])) cc = digits.slice(0, 2);
  else if (CC_1.has(digits[0])) cc = digits.slice(0, 1);
  else cc = digits.slice(0, 2);
  const rest = digits.slice(cc.length);
  return rest ? `+${cc} ${rest}` : `+${cc}`;
}
function IntlPhoneInput({ value, onChange, foreign, className, placeholder }: { value: string; onChange: (v: string) => void; foreign: boolean; className?: string; placeholder?: string; }) {
  if (!foreign) {
    return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={className} placeholder={placeholder} />;
  }
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(formatIntlPhone(e.target.value))}
      className={className}
      placeholder={placeholder ?? "+1 5551234567"}
      inputMode="tel"
    />
  );
}

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
  marital_status: null,
  birth_place: null,
  rg_issuer: null,
  rg_issued_at: null,
  birth_certificate: null,
  mother_name: null,
};

type TabId =
  | "detalhes" | "adicionais" | "vendas" | "financeiros"
  | "notas_fiscais" | "contatos" | "anexos";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "detalhes", label: "Detalhes" },
  { id: "adicionais", label: "Dados Adicionais" },
  { id: "vendas", label: "Vendas" },
  { id: "financeiros", label: "Dados Financeiros" },
  { id: "notas_fiscais", label: "Notas Fiscais" },
  { id: "contatos", label: "Contatos" },
  { id: "anexos", label: "Anexos" },
];

export function PersonEditorDialog({
  personId,
  open,
  onOpenChange,
  onSaved,
}: {
  personId: string | null;
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
    enabled: !isNew && open && (tab === "vendas" || tab === "financeiros" || tab === "adicionais"),
  });

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
        marital_status: p.marital_status,
        birth_place: p.birth_place,
        rg_issuer: p.rg_issuer,
        rg_issued_at: p.rg_issued_at,
        birth_certificate: p.birth_certificate,
        mother_name: p.mother_name,
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

  async function fetchCep(cep: string) {
    const d = cep.replace(/\D+/g, "");
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await r.json();
      if (j.erro) return;
      setForm((s) => ({
        ...s,
        address: j.logradouro || s.address,
        district: j.bairro || s.district,
        city: j.localidade || s.city,
        state: j.uf || s.state,
      }));
    } catch { /* ignore */ }
  }

  async function fetchCnpj(cnpj: string) {
    const d = cnpj.replace(/\D+/g, "");
    if (d.length !== 14) return;
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
      if (!r.ok) return;
      const j = await r.json();
      setForm((s) => ({
        ...s,
        name: s.name?.trim() ? s.name : (j.nome_fantasia || j.razao_social || s.name),
        legal_name: j.razao_social || s.legal_name,

        foundation_date: j.data_inicio_atividade || s.foundation_date,
        zip: j.cep ? String(j.cep).replace(/\D+/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : s.zip,
        address: j.logradouro || s.address,
        number: j.numero || s.number,
        complement: j.complemento || s.complement,
        district: j.bairro || s.district,
        city: j.municipio || s.city,
        state: j.uf || s.state,
      }));
    } catch { /* ignore */ }
  }


  const person = q.data?.person;
  const cards = q.data?.cards ?? [];
  const phones = q.data?.phones ?? [];
  const emails = q.data?.emails ?? [];
  const tags = q.data?.tags ?? [];
  const attachments = q.data?.attachments ?? [];
  const customFields = q.data?.custom_fields ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-6xl w-[96vw] h-[90vh] overflow-hidden flex flex-col bg-card/70 backdrop-blur-2xl border-border rounded-2xl">
        {/* Header rico — Industrial premium */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-14 w-14 rounded-2xl bg-brand-orange/10 border border-brand-orange/30 flex items-center justify-center text-brand-orange text-lg font-bold shrink-0 shadow-[0_0_20px_rgba(242,107,31,0.15)]">
              {getInitials(form.name) || (form.kind === "PJ" ? <Building2 className="h-6 w-6" /> : <User className="h-6 w-6" />)}
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-lg font-semibold truncate max-w-[36ch]">
                  {form.name || (isNew ? "Novo cadastro" : "Sem nome")}
                </h2>
                {person?.code && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border tabular-nums">
                    #{person.code}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-orange text-primary-foreground uppercase tracking-wider">
                  {form.kind === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
                </span>
                {!isNew && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wider">
                    Ativo
                  </span>
                )}
              </div>
            </div>
          </div>

          {person && (
            <div className="hidden md:flex gap-6 text-[11px] text-muted-foreground">
              <div className="space-y-0.5">
                <p className="uppercase tracking-widest font-bold text-muted-foreground/70">Criado em</p>
                <p className="text-foreground tabular-nums">{new Date(person.created_at).toLocaleString("pt-BR")}</p>
              </div>
              {person.updated_at && (
                <div className="space-y-0.5">
                  <p className="uppercase tracking-widest font-bold text-muted-foreground/70">Atualizado</p>
                  <p className="text-foreground tabular-nums">{new Date(person.updated_at).toLocaleString("pt-BR")}</p>
                </div>
              )}
            </div>
          )}
        </div>

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
            {/* Abas — underline laranja estilo industrial */}
            <div className="px-4 border-b border-border overflow-x-auto bg-muted/20 shrink-0">
              <div className="flex gap-1 whitespace-nowrap">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                      tab === t.id
                        ? "border-brand-orange text-brand-orange"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>


            <div className="flex-1 overflow-y-auto px-5 py-5 bg-background/40">
              {tab === "detalhes" && (
                <DetalhesTab form={form} set={set} person={person} onCepBlur={fetchCep} onCnpjBlur={fetchCnpj} />
              )}
              {tab === "adicionais" && (
                <AdicionaisTab form={form} set={set} summary={salesQ.data?.summary} isPF={form.kind === "PF"} />
              )}
              {tab === "vendas" && (
                <VendasTab loading={salesQ.isLoading} sales={salesQ.data?.sales ?? []} onOpen={() => onOpenChange(false)} />
              )}
              {tab === "financeiros" && (
                <FinanceirosTab personId={id} isNew={isNew} cards={cards} qc={qc} summary={salesQ.data?.summary} loading={salesQ.isLoading} />
              )}
              {tab === "contatos" && (
                <ContatosTab personId={id} isNew={isNew} phones={phones} emails={emails} qc={qc} />
              )}
              {tab === "notas_fiscais" && (
                <NotasFiscaisTab personId={id} isNew={isNew} onClose={() => onOpenChange(false)} />
              )}
              {tab === "anexos" && (
                <AnexosTab personId={id} isNew={isNew} attachments={attachments} qc={qc} />
              )}
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/30 shrink-0">
              <div className="text-[11px] text-muted-foreground truncate">
                {person && (
                  <>Código <span className="font-mono text-foreground">{person.code}</span>
                    {person.created_by_name && (
                      <> · Cadastrado por <span className="text-foreground">{person.created_by_name}</span></>
                    )}
                    <> em <span className="text-foreground">{new Date(person.created_at).toLocaleString("pt-BR")}</span></>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
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
                  OK
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ==================== TABS ==================== */

function DetalhesTab({
  form, set, person, onCepBlur, onCnpjBlur,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  person?: PersonRow;
  onCepBlur: (cep: string) => void;
  onCnpjBlur: (cnpj: string) => void;
}) {

  const isPJ = form.kind === "PJ";
  const age = form.birth_date ? calcAge(form.birth_date) : null;

  return (
    <div className="space-y-6">
      {/* ============ DADOS PESSOAIS ============ */}
      <Section title="Dados pessoais">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-6">
          <div className="space-y-3">
            <FieldRow label="Código:">
              <div className="text-sm font-mono">{person?.code ?? "—"}</div>
            </FieldRow>
            <FieldRow label="Nome:" required>
              <div className="flex items-center gap-2">
                <input value={form.name} onChange={(e) => set("name", e.target.value)} className={cls} />
                {!isPJ && (
                  <button
                    type="button"
                    onClick={() => set("is_foreign", !form.is_foreign)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs whitespace-nowrap transition ${
                      form.is_foreign
                        ? "bg-brand-orange/15 border-brand-orange/40 text-brand-orange"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                    title="Marcar como estrangeiro (oculta CPF/RG)"
                  >
                    🌐 Estrangeiro
                  </button>
                )}
              </div>
            </FieldRow>
            {isPJ && (
              <FieldRow label="Razão Social:">
                <input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} className={cls} />
              </FieldRow>
            )}

            {isPJ ? (
              <>
                <FieldRow label="Fundação:">
                  <input type="date" value={form.foundation_date ?? ""} onChange={(e) => set("foundation_date", e.target.value)} className={cls + " max-w-[200px]"} />
                </FieldRow>
                <div className="grid grid-cols-2 gap-3">
                  <MiniField label="CNPJ:">
                    <input value={form.cnpj ?? ""} onChange={(e) => set("cnpj", e.target.value)} onBlur={(e) => onCnpjBlur(e.target.value)} placeholder="00.000.000/0000-00" className={cls} />
                  </MiniField>
                  <MiniField label="Inscrição Estadual:">
                    <input value={form.state_registration ?? ""} onChange={(e) => set("state_registration", e.target.value)} className={cls} />
                  </MiniField>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <MiniField label="Nascimento:">
                    <input type="date" value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} className={cls} />
                  </MiniField>
                  <div className="text-sm text-muted-foreground pb-2.5">{age != null ? `${age} anos` : ""}</div>
                  <MiniField label="Sexo:">
                    <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value || null)} className={cls}>
                      <option value="">—</option>
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                      <option value="O">Outro</option>
                    </select>
                  </MiniField>
                </div>
                {!form.is_foreign && (
                  <div className="grid grid-cols-2 gap-3">
                    <MiniField label="CPF:">
                      <input value={form.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)} className={cls} />
                    </MiniField>
                    <MiniField label="RG:">
                      <input value={form.rg ?? ""} onChange={(e) => set("rg", e.target.value)} className={cls} />
                    </MiniField>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <MiniField label="Passaporte Nº:">
                    <input value={form.passport_number ?? ""} onChange={(e) => set("passport_number", e.target.value)} className={cls} />
                  </MiniField>
                  <MiniField label="Validade Passaporte:">
                    <input type="date" value={form.passport_expiration ?? ""} onChange={(e) => set("passport_expiration", e.target.value)} className={cls} />
                  </MiniField>
                </div>
              </>
            )}
          </div>

          {/* Foto/Logotipo placeholder */}
          <div className="hidden lg:block">
            <div className="rounded-xl border border-dashed border-border h-[180px] flex items-center justify-center text-sm text-muted-foreground bg-muted/20">
              {isPJ ? "Logotipo" : "Foto"}
            </div>
          </div>
        </div>
      </Section>

      {/* ============ ENDEREÇO ============ */}
      <Section title="Endereço">
        <div className="grid grid-cols-[140px_1fr_120px] gap-3">
          <MiniField label={form.is_foreign ? "ZIP code:" : "CEP:"}>
            <input
              value={form.zip ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                set("zip", v);
                if (!form.is_foreign && v.replace(/\D+/g, "").length === 8) {
                  onCepBlur(v);
                }
              }}
              onBlur={(e) => { if (!form.is_foreign) onCepBlur(e.target.value); }}
              className={cls}
              placeholder={form.is_foreign ? "ZIP / Postal code" : "00000-000"}
            />
          </MiniField>
          <MiniField label={form.is_foreign ? "Address:" : "Endereço:"}>
            <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={cls} />
          </MiniField>
          <MiniField label={form.is_foreign ? "Number:" : "Número:"}>
            <input value={form.number ?? ""} onChange={(e) => set("number", e.target.value)} className={cls} />
          </MiniField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniField label={form.is_foreign ? "Complement:" : "Complemento:"}>
            <input value={form.complement ?? ""} onChange={(e) => set("complement", e.target.value)} className={cls} />
          </MiniField>
          <MiniField label={form.is_foreign ? "District:" : "Bairro:"}>
            <input value={form.district ?? ""} onChange={(e) => set("district", e.target.value)} className={cls} />
          </MiniField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MiniField label={form.is_foreign ? "City:" : "Cidade:"}>
            <input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} className={cls} />
          </MiniField>
          <MiniField label={form.is_foreign ? "State / Province:" : "Estado (UF):"}>
            <input
              value={form.state ?? ""}
              onChange={(e) => set("state", e.target.value)}
              className={cls}
              placeholder={form.is_foreign ? "State / Province" : "Ex.: SP"}
            />
          </MiniField>
          {form.is_foreign && (
            <MiniField label="Country:">
              <input
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
                className={cls}
                placeholder="Country"
              />
            </MiniField>
          )}
        </div>

      </Section>

      {/* ============ CONTATO ============ */}
      <Section title="Dados de contato">
        <div className={`grid ${isPJ ? "grid-cols-2" : "grid-cols-3"} gap-3`}>
          <MiniField label="Telefone:">
            <IntlPhoneInput value={form.phone ?? ""} onChange={(v) => set("phone", v)} foreign={!!form.is_foreign} className={cls} />
          </MiniField>
          <MiniField label="Celular:">
            <IntlPhoneInput value={form.mobile_phone ?? ""} onChange={(v) => set("mobile_phone", v)} foreign={!!form.is_foreign} className={cls} />
          </MiniField>
          {!isPJ && (
            <MiniField label="Telefone Comercial:">
              <IntlPhoneInput value={form.business_phone ?? ""} onChange={(v) => set("business_phone", v)} foreign={!!form.is_foreign} className={cls} />
            </MiniField>
          )}
        </div>
        <FieldRow label="E-mail:">
          <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={cls} />
        </FieldRow>
        {isPJ && (
          <FieldRow label="Website:">
            <input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} className={cls} />
          </FieldRow>
        )}
      </Section>
    </div>
  );
}


function AdicionaisTab({
  form, set, summary, isPF,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  summary?: PersonFinancialSummary;
  isPF: boolean;
}) {
  return (
    <div className="space-y-6">
      {isPF && (
        <>
          <Section title="Estado civil & nascimento">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniField label="Estado civil">
                <select value={form.marital_status ?? ""} onChange={(e) => set("marital_status", e.target.value || null)} className={cls}>
                  <option value="">—</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                  <option value="uniao_estavel">União estável</option>
                  <option value="separado">Separado(a)</option>
                </select>
              </MiniField>
              <MiniField label="Local de nascimento">
                <input value={form.birth_place ?? ""} onChange={(e) => set("birth_place", e.target.value)} className={cls} placeholder="Cidade / UF" />
              </MiniField>
            </div>
          </Section>

          <Section title="Documentos">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniField label="Órgão emissor do RG">
                <input value={form.rg_issuer ?? ""} onChange={(e) => set("rg_issuer", e.target.value)} className={cls} placeholder="Ex.: SSP/SP" />
              </MiniField>
              <MiniField label="Data de emissão do RG">
                <input type="date" value={form.rg_issued_at ?? ""} onChange={(e) => set("rg_issued_at", e.target.value)} className={cls} />
              </MiniField>
              <MiniField label="Certidão de nascimento">
                <input value={form.birth_certificate ?? ""} onChange={(e) => set("birth_certificate", e.target.value)} className={cls} />
              </MiniField>
            </div>
          </Section>

          <Section title="Filiação">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniField label="Nome da mãe">
                <input value={form.mother_name ?? ""} onChange={(e) => set("mother_name", e.target.value)} className={cls} />
              </MiniField>
            </div>
          </Section>
        </>
      )}

      <Section title="Últimos contatos">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ReadStat label="Primeira Venda" value={fmtDateISO(summary?.first_sale_at)} />
          <ReadStat label="Última Venda" value={fmtDateISO(summary?.last_sale_at)} />
          <ReadStat label="Último Embarque" value={summary?.last_departure_at ? fmtDateISO(summary.last_departure_at) : "—"} />
          <ReadStat label="Último Retorno" value={summary?.last_return_at ? fmtDateISO(summary.last_return_at) : "—"} />
        </div>
      </Section>
    </div>
  );
}

function VendasTab({
  loading, sales, onOpen,
}: {
  loading: boolean;
  sales: Array<{ id: string; order_number: string | null; created_at: string; going_date: string | null; trip_title: string | null; supplier_name: string | null }>;
  onOpen: () => void;
}) {
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }
  if (!sales.length) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><ShoppingBag className="h-4 w-4" /> Nenhuma venda vinculada.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Número da Venda</th>
            <th className="px-3 py-2 text-left">Data da Venda</th>
            <th className="px-3 py-2 text-left">Data de Embarque</th>
            <th className="px-3 py-2 text-left">Produto</th>
            <th className="px-3 py-2 text-center">Pagante</th>
            <th className="px-3 py-2 text-center">Passageiro</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs">{s.order_number ?? "—"}</td>
              <td className="px-3 py-2">{fmtDateISO(s.created_at)}</td>
              <td className="px-3 py-2">{s.going_date ? fmtDateISO(s.going_date) : "—"}</td>
              <td className="px-3 py-2">{s.trip_title ?? s.supplier_name ?? "—"}</td>
              <td className="px-3 py-2 text-center"><CheckBadge on /></td>
              <td className="px-3 py-2 text-center"><CheckBadge on /></td>
              <td className="px-3 py-2 text-right">
                <Link to="/admin/pedidos/$id" params={{ id: s.id }} onClick={onOpen}
                  className="inline-flex items-center gap-1 text-brand-orange hover:underline text-xs">
                  Abrir <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarcadoresTab({ personId, isNew, tags, qc }: { personId: string; isNew: boolean; tags: PersonTag[]; qc: any }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#F26B1F");
  const saveFn = useServerFn(savePersonTag);
  const delFn = useServerFn(deletePersonTag);

  if (isNew) return <p className="text-sm text-muted-foreground">Salve o cadastro primeiro para adicionar marcadores.</p>;

  async function add() {
    if (!label.trim()) return;
    try {
      await saveFn({ data: { person_id: personId, label: label.trim(), color } });
      setLabel("");
      qc.invalidateQueries({ queryKey: ["admin-people", personId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function remove(id: string) {
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["admin-people", personId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <Section title="Marcadores">
      <div className="flex items-center gap-2 flex-wrap">
        {tags.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border"
            style={{ borderColor: t.color ?? "hsl(var(--border))", background: t.color ? `${t.color}20` : undefined, color: t.color ?? undefined }}>
            <TagIcon className="h-3 w-3" /> {t.label}
            <button type="button" onClick={() => remove(t.id)} className="ml-1 hover:opacity-70"><XIcon className="h-3 w-3" /></button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-sm text-muted-foreground">Nenhum marcador ainda.</span>}
      </div>
      <div className="flex items-end gap-2 pt-3 border-t border-border">
        <MiniField label="Rótulo">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={cls} placeholder="Ex.: VIP, aniversário…" />
        </MiniField>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Cor</div>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 rounded-xl border border-border bg-background cursor-pointer" />
        </div>
        <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange text-primary-foreground px-4 py-2 text-xs hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>
    </Section>
  );
}

function FinanceirosTab({
  personId, isNew, cards, qc, summary, loading,
}: {
  personId: string; isNew: boolean; cards: PersonCardRow[]; qc: any;
  summary?: PersonFinancialSummary; loading: boolean;
}) {
  return (
    <div className="space-y-6">
      {!isNew && (
        <Section title="Resumo financeiro">
          {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            : <FinancialSummaryView summary={summary} />}
        </Section>
      )}
      <Section title="Cartões de Crédito">
        {isNew ? (
          <p className="text-sm text-muted-foreground">Salve o cadastro primeiro para adicionar cartões.</p>
        ) : (
          <CardsSection personId={personId} cards={cards} qc={qc} />
        )}
      </Section>
    </div>
  );
}

function ContatosTab({
  personId, isNew, phones, emails, qc,
}: {
  personId: string; isNew: boolean; phones: PersonPhone[]; emails: PersonEmail[]; qc: any;
}) {
  const savePh = useServerFn(savePersonPhone);
  const delPh = useServerFn(deletePersonPhone);
  const saveEm = useServerFn(savePersonEmail);
  const delEm = useServerFn(deletePersonEmail);

  if (isNew) return <p className="text-sm text-muted-foreground">Salve o cadastro primeiro para adicionar contatos.</p>;

  const [phone, setPhone] = useState({ kind: "personal", number: "", is_primary: false });
  const [email, setEmail] = useState({ kind: "personal", address: "", is_primary: false });

  async function addPhone() {
    if (!phone.number.trim()) return;
    try { await savePh({ data: { person_id: personId, ...phone } }); setPhone({ kind: "personal", number: "", is_primary: false }); qc.invalidateQueries({ queryKey: ["admin-people", personId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function addEmail() {
    if (!email.address.trim()) return;
    try { await saveEm({ data: { person_id: personId, ...email } }); setEmail({ kind: "personal", address: "", is_primary: false }); qc.invalidateQueries({ queryKey: ["admin-people", personId] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function removePhone(id: string) { await delPh({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-people", personId] }); }
  async function removeEmail(id: string) { await delEm({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-people", personId] }); }

  return (
    <div className="space-y-6">
      <Section title="Telefones">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {phones.map((p) => (
            <li key={p.id} className="p-3 flex items-center gap-3 text-sm">
              <span className="text-[10px] uppercase rounded-full bg-muted px-2 py-0.5">{kindLabel(p.kind)}</span>
              <span className="font-mono flex-1">{p.number}</span>
              {p.is_primary && <span className="text-[10px] uppercase rounded-full bg-brand-orange/10 text-brand-orange px-2 py-0.5">Principal</span>}
              <button type="button" onClick={() => removePhone(p.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          {phones.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum telefone cadastrado.</li>}
        </ul>
        <div className="grid grid-cols-[140px_1fr_auto_auto] gap-2 items-end pt-3 border-t border-border">
          <MiniField label="Tipo">
            <select value={phone.kind} onChange={(e) => setPhone({ ...phone, kind: e.target.value })} className={cls}>
              <option value="personal">Pessoal</option>
              <option value="mobile">Celular</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="business">Comercial</option>
              <option value="home">Residencial</option>
              <option value="other">Outro</option>
            </select>
          </MiniField>
          <MiniField label="Número">
            <input value={phone.number} onChange={(e) => setPhone({ ...phone, number: e.target.value })} className={cls} placeholder="(11) 99999-9999" />
          </MiniField>
          <label className="flex items-center gap-2 text-xs whitespace-nowrap pb-2.5">
            <input type="checkbox" checked={phone.is_primary} onChange={(e) => setPhone({ ...phone, is_primary: e.target.checked })} /> Principal
          </label>
          <button type="button" onClick={addPhone} className="rounded-full bg-brand-orange text-primary-foreground px-4 py-2 text-xs hover:opacity-90 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar</button>
        </div>
      </Section>

      <Section title="E-mails">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {emails.map((e) => (
            <li key={e.id} className="p-3 flex items-center gap-3 text-sm">
              <span className="text-[10px] uppercase rounded-full bg-muted px-2 py-0.5">{kindLabel(e.kind)}</span>
              <span className="flex-1 truncate">{e.address}</span>
              {e.is_primary && <span className="text-[10px] uppercase rounded-full bg-brand-orange/10 text-brand-orange px-2 py-0.5">Principal</span>}
              <button type="button" onClick={() => removeEmail(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          {emails.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum e-mail cadastrado.</li>}
        </ul>
        <div className="grid grid-cols-[140px_1fr_auto_auto] gap-2 items-end pt-3 border-t border-border">
          <MiniField label="Tipo">
            <select value={email.kind} onChange={(ev) => setEmail({ ...email, kind: ev.target.value })} className={cls}>
              <option value="personal">Pessoal</option>
              <option value="business">Comercial</option>
              <option value="billing">Financeiro</option>
              <option value="other">Outro</option>
            </select>
          </MiniField>
          <MiniField label="E-mail">
            <input type="email" value={email.address} onChange={(ev) => setEmail({ ...email, address: ev.target.value })} className={cls} placeholder="cliente@exemplo.com" />
          </MiniField>
          <label className="flex items-center gap-2 text-xs whitespace-nowrap pb-2.5">
            <input type="checkbox" checked={email.is_primary} onChange={(ev) => setEmail({ ...email, is_primary: ev.target.checked })} /> Principal
          </label>
          <button type="button" onClick={addEmail} className="rounded-full bg-brand-orange text-primary-foreground px-4 py-2 text-xs hover:opacity-90 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar</button>
        </div>
      </Section>
    </div>
  );
}

function UsuarioTab({ form, set, person }: { form: FormState; set: any; person?: PersonRow }) {
  return (
    <Section title="Usuário / vendedor">
      <FieldRow label="Vendedor responsável:">
        <input value={form.seller_name ?? ""} onChange={(e) => set("seller_name", e.target.value)} className={cls} />
      </FieldRow>
      <FieldRow label="Cadastrado por:">
        <div className="text-sm">{person?.created_by_name ?? "—"}</div>
      </FieldRow>
      <FieldRow label="Cadastrado em:">
        <div className="text-sm">{person?.created_at ? new Date(person.created_at).toLocaleString("pt-BR") : "—"}</div>
      </FieldRow>
      <FieldRow label="Última atualização:">
        <div className="text-sm">{person?.updated_at ? new Date(person.updated_at).toLocaleString("pt-BR") : "—"}</div>
      </FieldRow>
    </Section>
  );
}

function AnexosTab({ personId, isNew, attachments, qc }: { personId: string; isNew: boolean; attachments: PersonAttachment[]; qc: any }) {
  const addFn = useServerFn(addPersonAttachment);
  const delFn = useServerFn(deletePersonAttachment);
  const urlFn = useServerFn(getPersonAttachmentUrl);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");

  if (isNew) return <p className="text-sm text-muted-foreground">Salve o cadastro primeiro para anexar arquivos.</p>;

  async function upload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      await addFn({ data: {
        person_id: personId,
        description: desc.trim() || file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        data_base64: b64,
        filename: file.name,
      }});
      setDesc("");
      qc.invalidateQueries({ queryKey: ["admin-people", personId] });
      toast.success("Anexo enviado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setUploading(false); }
  }
  async function remove(id: string) {
    const ok = await confirm({ title: "Remover anexo?", confirmText: "Remover", destructive: true });
    if (!ok) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-people", personId] });
  }
  async function open(id: string) {
    try {
      const { url } = await urlFn({ data: { id } });
      window.open(url, "_blank", "noopener");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <Section title="Anexos">
      <div className="flex items-end gap-2 border-b border-border pb-3">
        <MiniField label="Descrição">
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className={cls} placeholder="Ex.: Cartão João, RG, comprovante…" />
        </MiniField>
        <label className={`inline-flex items-center gap-1.5 rounded-full bg-brand-orange text-primary-foreground px-4 py-2 text-xs cursor-pointer hover:opacity-90 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Anexar
          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-left">Descrição</th>
            <th className="px-2 py-2 text-left">Tipo</th>
            <th className="px-2 py-2 text-right">Tamanho</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((a) => (
            <tr key={a.id} className="border-t border-border">
              <td className="px-2 py-2 flex items-center gap-2"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" /> {a.description}</td>
              <td className="px-2 py-2 text-xs text-muted-foreground">{a.mime_type ?? "—"}</td>
              <td className="px-2 py-2 text-right text-xs text-muted-foreground">{a.size_bytes ? fmtBytes(a.size_bytes) : "—"}</td>
              <td className="px-2 py-2 text-right flex items-center gap-1 justify-end">
                <button type="button" onClick={() => open(a.id)} className="text-brand-orange hover:underline text-xs inline-flex items-center gap-1"><Download className="h-3 w-3" /> Abrir</button>
                <button type="button" onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
          {attachments.length === 0 && (
            <tr><td colSpan={4} className="px-2 py-4 text-sm text-muted-foreground text-center">Nenhum anexo.</td></tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

function CustomFieldsTab({ personId, isNew, items, qc }: { personId: string; isNew: boolean; items: PersonCustomField[]; qc: any }) {
  const saveFn = useServerFn(savePersonCustomField);
  const delFn = useServerFn(deletePersonCustomField);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  if (isNew) return <p className="text-sm text-muted-foreground">Salve o cadastro primeiro para adicionar campos personalizados.</p>;

  async function add() {
    if (!key.trim()) return;
    await saveFn({ data: { person_id: personId, field_key: key.trim(), field_value: value.trim() || null, sort_order: items.length } });
    setKey(""); setValue("");
    qc.invalidateQueries({ queryKey: ["admin-people", personId] });
  }
  async function remove(id: string) { await delFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-people", personId] }); }

  return (
    <Section title="Campos Personalizados">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {items.map((f) => (
          <li key={f.id} className="p-3 grid grid-cols-[180px_1fr_auto] gap-3 items-center text-sm">
            <span className="font-medium">{f.field_key}</span>
            <span className="text-muted-foreground truncate">{f.field_value ?? "—"}</span>
            <button type="button" onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
        {items.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum campo cadastrado.</li>}
      </ul>
      <div className="grid grid-cols-[180px_1fr_auto] gap-2 items-end pt-3 border-t border-border">
        <MiniField label="Nome do campo"><input value={key} onChange={(e) => setKey(e.target.value)} className={cls} /></MiniField>
        <MiniField label="Valor"><input value={value} onChange={(e) => setValue(e.target.value)} className={cls} /></MiniField>
        <button type="button" onClick={add} className="rounded-full bg-brand-orange text-primary-foreground px-4 py-2 text-xs hover:opacity-90 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Adicionar</button>
      </div>
    </Section>
  );
}

function PlaceholderTab({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">{icon}</div>
      <div className="font-semibold text-foreground mb-1">{title}</div>
      <div className="text-sm">{hint}</div>
    </div>
  );
}

/* ==================== CARDS SECTION ==================== */

function CardsSection({ personId, cards, qc }: { personId: string; cards: PersonCardRow[]; qc: any }) {
  const addFn = useServerFn(addPersonCard);
  const updFn = useServerFn(updatePersonCard);
  const delFn = useServerFn(deletePersonCard);
  const revealFn = useServerFn(revealPersonCardNumber);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    number: "", security_code_hint: "", exp_month: "", exp_year: "",
    holder_name: "", operator: "MasterCard", nickname: "",
  });
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  function resetForm() {
    setForm({ number: "", security_code_hint: "", exp_month: "", exp_year: "", holder_name: "", operator: "MasterCard", nickname: "" });
    setEditingId(null);
  }

  async function openEdit(c: PersonCardRow) {
    const [mm, yy] = (c.expiry ?? "").split("/");
    let fullNumber = revealed[c.id] ?? "";
    if (!fullNumber) {
      try { fullNumber = (await revealFn({ data: { id: c.id } })).number; }
      catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao carregar cartão"); return; }
    }
    setForm({
      number: fullNumber,
      security_code_hint: c.security_code_hint ?? "",
      exp_month: mm ?? "",
      exp_year: yy ? (yy.length === 2 ? `20${yy}` : yy) : "",
      holder_name: c.holder_name ?? "",
      operator: c.operator ?? c.brand ?? "MasterCard",
      nickname: c.nickname ?? "",
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  async function submit() {
    if (!editingId && !form.number.replace(/\D+/g, "")) { toast.error("Informe o número do cartão"); return; }
    setSaving(true);
    try {
      const expiry = form.exp_month && form.exp_year ? `${form.exp_month.padStart(2, "0")}/${form.exp_year.slice(-4)}` : undefined;
      if (editingId) {
        await updFn({ data: {
          id: editingId,
          number: form.number || undefined,
          expiry,
          security_code_hint: form.security_code_hint || undefined,
          holder_name: form.holder_name || undefined,
          operator: form.operator || undefined,
          nickname: form.nickname || undefined,
        }});
        toast.success("Cartão atualizado");
      } else {
        await addFn({ data: {
          person_id: personId,
          number: form.number,
          expiry,
          security_code_hint: form.security_code_hint || undefined,
          holder_name: form.holder_name || undefined,
          operator: form.operator || undefined,
          nickname: form.nickname || undefined,
        }});
        toast.success("Cartão adicionado");
      }
      qc.invalidateQueries({ queryKey: ["admin-people", personId] });
      resetForm();
      setShowForm(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  }
  async function toggleReveal(id: string) {
    if (revealed[id]) { setRevealed((r) => { const n = { ...r }; delete n[id]; return n; }); return; }
    try { const n = (await revealFn({ data: { id } })).number; setRevealed((r) => ({ ...r, [id]: n })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function remove(id: string) {
    const ok = await confirm({ title: "Remover cartão?", confirmText: "Remover", destructive: true });
    if (!ok) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-people", personId] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 text-xs hover:bg-emerald-500/20">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">Número</th>
              <th className="px-3 py-2 text-left">Validade</th>
              <th className="px-3 py-2 text-left">CVV</th>
              <th className="px-3 py-2 text-left">Operadora</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2">{c.holder_name || c.nickname || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {revealed[c.id]
                    ? revealed[c.id].replace(/(.{4})/g, "$1 ").trim()
                    : `${c.last4 ? c.last4.slice(0, 4) : "----"}.XXXX.XXXX.${c.last4 ?? "----"}`}
                </td>
                <td className="px-3 py-2">{c.expiry ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{c.security_code_hint ?? "—"}</td>
                <td className="px-3 py-2">{c.operator ?? c.brand ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.nickname ?? "—"}</td>
                <td className="px-3 py-2 text-right flex items-center gap-1 justify-end">
                  <button type="button" onClick={() => toggleReveal(c.id)} title="Mostrar/ocultar número" className="text-muted-foreground hover:text-foreground">
                    {revealed[c.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => openEdit(c)} title="Editar cartão" className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => remove(c.id)} title="Remover" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-sm text-muted-foreground text-center">Nenhum cartão salvo.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <div className="text-center font-semibold text-sm border-b border-border pb-3">{editingId ? "Editar cartão" : "Cartão de Crédito"}</div>
            <div className="space-y-3 pt-3">
              <MiniField label="Número:">
                <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className={cls + " font-mono"} placeholder="0000 0000 0000 0000" />
              </MiniField>
              <div className="grid grid-cols-[1fr_120px_120px] gap-3">
                <MiniField label="Código de Segurança (opcional):">
                  <input value={form.security_code_hint} onChange={(e) => setForm({ ...form, security_code_hint: e.target.value })} className={cls} maxLength={4} />
                </MiniField>
                <MiniField label="Mês">
                  <select value={form.exp_month} onChange={(e) => setForm({ ...form, exp_month: e.target.value })} className={cls}>
                    <option value="">—</option>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </MiniField>
                <MiniField label="Ano">
                  <select value={form.exp_year} onChange={(e) => setForm({ ...form, exp_year: e.target.value })} className={cls}>
                    <option value="">—</option>
                    {Array.from({ length: 15 }, (_, i) => new Date().getFullYear() + i).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </MiniField>
              </div>
              <MiniField label="Nome:">
                <input value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })} className={cls} />
              </MiniField>
              <div className="grid grid-cols-2 gap-3">
                <MiniField label="Operadora:">
                  <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} className={cls}>
                    {["Visa", "MasterCard", "Amex", "Elo", "Hipercard", "Diners", "Discover"].map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </MiniField>
                <MiniField label="Descrição / uso do cartão:">
                  <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} className={cls} placeholder="Ex.: Corporativo — Cliente X" />
                </MiniField>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200">
                ⚠ Por questões de segurança, o número completo é criptografado (AES-256-GCM) e só pode ser revelado sob demanda.
              </div>
              <div className="flex items-center gap-2 justify-end pt-3 border-t border-border">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="rounded-full border border-border px-4 py-1.5 text-xs">Cancelar</button>
                <button type="button" disabled={saving} onClick={submit} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-brand px-5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} OK
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ==================== HELPERS ==================== */

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
      <div className="text-sm text-muted-foreground pt-2.5">
        {label} {required && <span className="text-brand-orange">*</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-border p-5 space-y-3 bg-card">
      <legend className="px-2 text-xs font-medium text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function ReadStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3 bg-muted/10">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function CheckBadge({ on }: { on: boolean }) {
  return on
    ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>
    : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"><XIcon className="h-3 w-3" /></span>;
}

const cls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function fmtBRL(v: number) { return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDateISO(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function calcAge(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
function kindLabel(k: string) {
  return ({
    personal: "Pessoal", mobile: "Celular", whatsapp: "WhatsApp",
    business: "Comercial", home: "Residencial", billing: "Financeiro", other: "Outro",
  } as Record<string, string>)[k] ?? k;
}
function arrayBufferToBase64(buf: ArrayBuffer) {
  let s = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(s);
}

function FinancialSummaryView({ summary }: { summary?: PersonFinancialSummary }) {
  if (!summary) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Sem dados ainda.</div>;
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
    </div>
  );
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


// ============ NOTAS FISCAIS TAB ============
function NotasFiscaisTab({ personId, isNew, onClose }: { personId: string | null; isNew: boolean; onClose: () => void }) {
  const list = useServerFn(listPersonNfse);
  const q = useQuery({
    queryKey: ["person-nfse", personId],
    queryFn: () => list({ data: { id: personId! } }),
    enabled: !isNew && !!personId,
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState<Record<string, unknown> | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openDetails = async (id: string) => {
    setLoadingId(id);
    try {
      const { data, error } = await supabase
        .from("nfse_emissoes")
        .select("*, orders(order_number)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Nota não encontrada");
      setDetailsRow(data as Record<string, unknown>);
      setDetailsOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir");
    } finally {
      setLoadingId(null);
    }
  };

  if (isNew) {
    return <div className="text-sm text-muted-foreground">Salve o cadastro para ver as notas fiscais vinculadas.</div>;
  }
  if (q.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando notas fiscais…</div>;
  }
  const rows = q.data ?? [];
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <div className="text-sm font-medium">Nenhuma NFS-e vinculada</div>
        <div className="text-xs text-muted-foreground mt-1">
          As notas fiscais aparecem aqui automaticamente quando emitidas com o CPF/CNPJ deste cadastro.
        </div>
      </div>
    );
  }

  const brl = (n: unknown) =>
    Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDT = (s: unknown) =>
    s ? new Date(String(s)).toLocaleDateString("pt-BR") : "—";
  const statusPill = (s: string) => {
    const st = s.toLowerCase();
    if (st === "autorizado" || st === "emitida")
      return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    if (st === "cancelado") return "bg-rose-500/15 text-rose-500 border-rose-500/30";
    if (st === "erro" || st === "rejeitada") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    return "bg-sky-500/15 text-sky-500 border-sky-500/30";
  };

  const total = rows.reduce((acc, r) => acc + (r.status === "cancelado" ? 0 : Number(r.valor_servicos || 0)), 0);
  const autorizadas = rows.filter((r) => r.status === "autorizado" || r.status === "emitida").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total emitidas</div>
          <div className="text-2xl font-bold mt-1">{rows.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Autorizadas</div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">{autorizadas}</div>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Valor total</div>
          <div className="text-2xl font-bold mt-1 text-brand-orange">{brl(total)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-card/40">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Nº / RPS</th>
              <th className="text-left px-3 py-2 font-semibold">Emissão</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Pedido</th>
              <th className="text-right px-3 py-2 font-semibold">Valor</th>
              <th className="text-right px-3 py-2 font-semibold">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr
                key={r.id}
                className="hover:bg-muted/20 cursor-pointer"
                onClick={() => openDetails(r.id)}
                title="Ver detalhes da NFS-e"
              >
                <td className="px-3 py-2 font-mono">
                  {loadingId === r.id ? (
                    <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  {r.numero_nfse ? `#${r.numero_nfse}` : `RPS ${r.numero_rps ?? "—"}`}
                  <span className="text-muted-foreground text-xs ml-1">/ {r.serie ?? "1"}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDT(r.data_emissao)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusPill(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {r.order_id ? (
                    <Link
                      to="/admin/pedidos/$id"
                      params={{ id: r.order_id }}
                      onClick={onClose}
                      className="text-brand-orange hover:underline"
                    >
                      {r.order_number ? `#${r.order_number}` : "abrir"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(r.valor_servicos)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-500">{brl(r.valor_liquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-muted-foreground text-center">
        Vínculo automático pelo CPF / CNPJ deste cadastro.
      </div>
    </div>
  );
}
