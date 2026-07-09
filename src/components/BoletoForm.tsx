import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { maskCPF } from "@/lib/format";
import { DateBRInput } from "@/components/DateBRInput";


export type BoletoData = {
  full_name: string;
  cpf: string;
  rg: string;
  rg_issuer: string;
  rg_issue_date: string;
  birth_date: string;
  zip: string;
  address: string;
  address_number: string;
  city: string;
  state: string;
  birth_city: string;
  marital_status: string;
  mother_name: string;
  profession: string;
  income: string;
  employed_since: string;
  employer_name: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_client_since: string;
  relationship: string;
  passenger_doc_path: string;
  passenger_doc_name: string;
  financier_doc_path: string;
  financier_doc_name: string;
};

export const emptyBoleto = (): BoletoData => ({
  full_name: "",
  cpf: "",
  rg: "",
  rg_issuer: "",
  rg_issue_date: "",
  birth_date: "",
  zip: "",
  address: "",
  address_number: "",
  city: "",
  state: "",
  birth_city: "",
  marital_status: "",
  mother_name: "",
  profession: "",
  income: "",
  employed_since: "",
  employer_name: "",
  bank_name: "",
  bank_agency: "",
  bank_account: "",
  bank_client_since: "",
  relationship: "",
  passenger_doc_path: "",
  passenger_doc_name: "",
  financier_doc_path: "",
  financier_doc_name: "",
});

const REQUIRED_BOLETO_FIELDS: Array<[keyof BoletoData, string]> = [
  ["relationship", "Vínculo com o viajante"],
  ["full_name", "Nome completo do financiador"],
  ["cpf", "CPF"],
  ["birth_date", "Data de nascimento"],
  ["rg", "RG"],
  ["rg_issuer", "Órgão emissor do RG"],
  ["rg_issue_date", "Data de emissão do RG"],
  ["birth_city", "Cidade de nascimento"],
  ["marital_status", "Estado civil"],
  ["mother_name", "Nome da mãe"],
  ["zip", "CEP"],
  ["address", "Endereço"],
  ["address_number", "Número"],
  ["city", "Cidade"],
  ["state", "Estado"],
  ["profession", "Profissão"],
  ["income", "Renda mensal"],
  ["employer_name", "Nome da empresa"],
  ["employed_since", "Empregado desde"],
  ["bank_name", "Banco"],
  ["bank_agency", "Agência"],
  ["bank_account", "Conta"],
  ["bank_client_since", "Cliente do banco desde"],
];

export function validateBoleto(
  boleto: BoletoData,
  isThirdParty: boolean,
): string | null {
  const missing = REQUIRED_BOLETO_FIELDS.find(([k]) => !boleto[k].trim());
  if (missing) return `Preencha o campo: ${missing[1]}.`;
  if (isThirdParty) {
    if (!boleto.passenger_doc_path) return "Envie a foto do documento do viajante.";
    if (!boleto.financier_doc_path) return "Envie a foto do documento do financiador.";
  }
  return null;
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function maskCEP(input: string): string {
  const d = (input ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function formatIncomeBRL(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const number = Number(digits) / 100;
  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function BoletoForm({
  data,
  onChange,
  isThirdParty,
}: {
  data: BoletoData;
  onChange: (patch: Partial<BoletoData>) => void;
  isThirdParty: boolean;
}) {
  const set =
    <K extends keyof BoletoData>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [k]: e.target.value } as Partial<BoletoData>);

  return (
    <div className="space-y-6">
      <BoletoSection title="Dados pessoais do financiador">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nome completo *">
            <input value={data.full_name} onChange={set("full_name")} className={inputCls} maxLength={120} />
          </Field>
          <Field label="Vínculo com o viajante *">
            <select value={data.relationship} onChange={set("relationship")} className={inputCls}>
              <option value="">Selecione…</option>
              <option value="proprio_viajante">O próprio viajante</option>
              <option value="conjuge">Cônjuge</option>
              <option value="pai">Pai</option>
              <option value="mae">Mãe</option>
              <option value="irmao">Irmão(ã)</option>
              <option value="avo">Avó / Avô</option>
            </select>
          </Field>
          <Field label="CPF *">
            <input
              value={data.cpf}
              onChange={(e) => onChange({ cpf: maskCPF(e.target.value) })}
              className={inputCls}
              placeholder="000.000.000-00"
              inputMode="numeric"
              maxLength={14}
            />
          </Field>
          <Field label="Data de nascimento *">
            <DateBRInput value={data.birth_date} onChange={(iso) => setField("birth_date", iso)} className={inputCls} />
          </Field>
          <Field label="RG *">
            <input value={data.rg} onChange={set("rg")} className={inputCls} maxLength={30} />
          </Field>
          <Field label="Órgão emissor *">
            <input value={data.rg_issuer} onChange={set("rg_issuer")} className={inputCls} placeholder="SSP/UF" maxLength={20} />
          </Field>
          <Field label="Data de emissão do RG *">
            <DateBRInput value={data.rg_issue_date} onChange={(iso) => setField("rg_issue_date", iso)} className={inputCls} />
          </Field>

          <Field label="Cidade de nascimento *">
            <input value={data.birth_city} onChange={set("birth_city")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Estado civil *">
            <select value={data.marital_status} onChange={set("marital_status")} className={inputCls}>
              <option value="">Selecione…</option>
              <option value="solteiro">Solteiro(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="uniao_estavel">União estável</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viuvo">Viúvo(a)</option>
            </select>
          </Field>
          <Field label="Nome da mãe *">
            <input value={data.mother_name} onChange={set("mother_name")} className={inputCls} maxLength={120} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Endereço residencial">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="CEP *">
            <input
              value={data.zip}
              onChange={(e) => {
                const masked = maskCEP(e.target.value);
                onChange({ zip: masked });
                const digits = masked.replace(/\D/g, "");
                if (digits.length === 8) {
                  fetch(`https://viacep.com.br/ws/${digits}/json/`)
                    .then((r) => r.json())
                    .then((j: { erro?: boolean; logradouro?: string; localidade?: string; uf?: string }) => {
                      if (j?.erro) return;
                      onChange({
                        address: j.logradouro || "",
                        city: j.localidade || "",
                        state: j.uf || "",
                      });
                    })
                    .catch(() => {});
                }
              }}
              className={inputCls}
              placeholder="00000-000"
              inputMode="numeric"
              maxLength={9}
            />
          </Field>
          <Field label="Endereço *">
            <input value={data.address} onChange={set("address")} className={inputCls} placeholder="Rua, avenida…" maxLength={160} />
          </Field>
          <Field label="Número *">
            <input value={data.address_number} onChange={set("address_number")} className={inputCls} maxLength={20} />
          </Field>
          <Field label="Cidade *">
            <input value={data.city} onChange={set("city")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Estado *">
            <input value={data.state} onChange={set("state")} className={inputCls} placeholder="UF" maxLength={30} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Dados profissionais e renda">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Profissão *">
            <input value={data.profession} onChange={set("profession")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Renda mensal *">
            <input
              value={data.income}
              onChange={(e) => onChange({ income: formatIncomeBRL(e.target.value) })}
              className={inputCls}
              placeholder="R$ 0,00"
              inputMode="numeric"
              maxLength={30}
            />
          </Field>
          <Field label="Nome da empresa *">
            <input value={data.employer_name} onChange={set("employer_name")} className={inputCls} maxLength={120} />
          </Field>
          <Field label="Empregado desde *">
            <input type="month" value={data.employed_since} onChange={set("employed_since")} className={inputCls} />
          </Field>
        </div>
      </BoletoSection>

      <BoletoSection title="Referência bancária">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Banco *">
            <input value={data.bank_name} onChange={set("bank_name")} className={inputCls} maxLength={80} />
          </Field>
          <Field label="Cliente desde *">
            <input type="month" value={data.bank_client_since} onChange={set("bank_client_since")} className={inputCls} />
          </Field>
          <Field label="Agência *">
            <input value={data.bank_agency} onChange={set("bank_agency")} className={inputCls} maxLength={20} />
          </Field>
          <Field label="Conta *">
            <input value={data.bank_account} onChange={set("bank_account")} className={inputCls} maxLength={30} />
          </Field>
        </div>
      </BoletoSection>

      {isThirdParty && (
        <BoletoSection title="Comprovação de vínculo (documentos com foto)">
          <p className="text-xs text-muted-foreground mb-3">
            O CPF/nome do financiador é diferente dos passageiros informados. Envie a foto do documento (RG ou CNH) do viajante e do financiador para comprovar o vínculo familiar. Aceitamos JPG, PNG ou PDF (até 10 MB cada).
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <BoletoUpload
              label="Documento do viajante *"
              fileName={data.passenger_doc_name}
              onUpload={(path, name) =>
                onChange({ passenger_doc_path: path, passenger_doc_name: name })
              }
              onClear={() => onChange({ passenger_doc_path: "", passenger_doc_name: "" })}
            />
            <BoletoUpload
              label="Documento do financiador *"
              fileName={data.financier_doc_name}
              onUpload={(path, name) =>
                onChange({ financier_doc_path: path, financier_doc_name: name })
              }
              onClear={() => onChange({ financier_doc_path: "", financier_doc_name: "" })}
            />
          </div>
        </BoletoSection>
      )}
    </div>
  );
}

function BoletoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-brand-orange font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}

function BoletoUpload({
  label,
  fileName,
  onUpload,
  onClear,
}: {
  label: string;
  fileName: string;
  onUpload: (path: string, name: string) => void;
  onClear: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("boleto-documents")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      onUpload(path, file.name);
      toast.success("Documento enviado.");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {fileName ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-orange/40 bg-brand-orange/5 px-3 py-2.5 text-sm">
          <span className="truncate text-foreground">{fileName}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-destructive shrink-0"
          >
            remover
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm cursor-pointer hover:border-brand-orange/60 transition ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFile}
            className="hidden"
            disabled={uploading}
          />
          <span className="text-muted-foreground">
            {uploading ? "Enviando…" : "Escolher arquivo (JPG, PNG ou PDF)"}
          </span>
        </label>
      )}
    </div>
  );
}
