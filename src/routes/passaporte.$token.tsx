import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Copy,
  CreditCard,
  FileText,
  Loader2,
  QrCode,
  ShieldCheck,
  User,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import {
  getPassportRequest,
  savePassportStep,
  submitPassportPayment,
} from "@/lib/passaporte.functions";
import type { PassportPublic } from "@/lib/passaporte.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRECO_PIX = 285;
const PRECO_CARTAO = 320;
const MAX_PARCELAS = 10;

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR",
  "RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const SITUACOES_PASSAPORTE = [
  "NUNCA TEVE PASSAPORTE COMUM, DE EMERGÊNCIA, PARA ESTRANGEIRO OU LAISSEZ-PASSER BRASILEIRO",
  "PASSAPORTE ANTERIOR VÁLIDO (OBRIGATÓRIA A APRESENTAÇÃO)",
  "EXTRAVIADO",
  "ESTÁ RETIDO/APREENDIDO PELA POLÍCIA FEDERAL",
  "ESTÁ RETIDO PELO MRE",
  "ROUBADO OU FURTADO",
  "PASSAPORTE ANTERIOR VENCIDO (RECOMENDA-SE APRESENTAÇÃO PARA CANCELAMENTO FÍSICO DO DOCUMENTO)",
];

const ETAPAS = [
  { key: "pessoais", label: "Dados pessoais", icon: User },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "complementares", label: "Dados complementares", icon: BadgeCheck },
  { key: "revisao", label: "Revisar dados", icon: ShieldCheck },
  { key: "pagamento", label: "Pagamento", icon: CreditCard },
] as const;

export const Route = createFileRoute("/passaporte/$token")({
  head: () => ({
    meta: [
      { title: "Renovação de Passaporte | VIA AIR" },
      {
        name: "description",
        content:
          "Solicite a renovação do seu passaporte com a VIA AIR: formulário guiado, protocolo próprio e pagamento no Pix ou cartão em até 10x.",
      },
      { property: "og:title", content: "Renovação de Passaporte | VIA AIR" },
      {
        property: "og:description",
        content:
          "Formulário passo a passo para renovação de passaporte com acompanhamento e protocolo VIA AIR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PassaportePage,
});

type Campos = Record<string, string>;

function PassaportePage() {
  const { token } = Route.useParams();
  const getFn = useServerFn(getPassportRequest);
  const saveFn = useServerFn(savePassportStep);
  const payFn = useServerFn(submitPassportPayment);

  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState<PassportPublic | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [pessoais, setPessoais] = useState<Campos>({});
  const [documentos, setDocumentos] = useState<Campos>({});
  const [complementares, setComplementares] = useState<Campos>({});

  const [metodo, setMetodo] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [parcelas, setParcelas] = useState(1);
  const [cartao, setCartao] = useState<Campos>({});
  const [declarou, setDeclarou] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = (await getFn({ data: { token } })) as PassportPublic | null;
        if (!alive) return;
        setReq(r);
        if (r) {
          setPessoais((r.dadosPessoais ?? {}) as Campos);
          setDocumentos((r.documentos ?? {}) as Campos);
          setComplementares((r.complementares ?? {}) as Campos);
          if (r.paymentStatus !== "pending" || r.pixPayload) setStep(4);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getFn, token]);

  const total = metodo === "PIX" ? PRECO_PIX : PRECO_CARTAO;
  const valorParcela = total / Math.max(parcelas, 1);
  const concluido = !!req?.pixPayload || req?.paymentStatus === "paid" || req?.status === "enviado";

  async function salvar(next: number) {
    if (!req) return;
    setSaving(true);
    try {
      const updated = (await saveFn({
        data: {
          token,
          dadosPessoais: pessoais,
          documentos,
          complementares,
        },
      })) as PassportPublic;
      setReq(updated);
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function finalizar() {
    if (!req) return;
    setSaving(true);
    try {
      const updated = (await payFn({
        data: {
          token,
          metodo,
          parcelas: metodo === "CREDIT_CARD" ? parcelas : 1,
          nome: (pessoais.nomeCompleto || "").trim(),
          cpf: (documentos.cpf || "").replace(/\D/g, ""),
          email: (complementares.email || "").trim(),
          telefone: `${complementares.ddd ?? ""}${complementares.telefone ?? ""}`.replace(/\D/g, "") || null,
          cep: (complementares.cep || "").replace(/\D/g, ""),
          endereco: complementares.logradouro || null,
          numero: complementares.numero || "S/N",
          complemento: complementares.complemento || null,
          bairro: complementares.bairro || null,
          cidade: complementares.cidade || null,
          estado: (complementares.uf || "").slice(0, 2) || null,
          cartaoTitular: cartao.titular || null,
          cartaoNumero: cartao.numero || null,
          cartaoMes: cartao.mes || null,
          cartaoAno: cartao.ano || null,
          cartaoCvv: cartao.cvv || null,
        },
      })) as PassportPublic;
      setReq(updated);
      toast.success("Solicitação enviada!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a cobrança.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Link inválido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta solicitação não existe ou foi removida. Fale com a VIA AIR.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-background to-background">
      <header className="border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-1 px-5 py-6">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            VIA AIR
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Solicitação de renovação de passaporte
          </h1>
          <p className="text-sm text-muted-foreground">
            Protocolo VIA AIR{" "}
            <strong className="font-semibold text-foreground">{req.protocolo}</strong>
            {req.pfProtocolo ? (
              <>
                {" · "}Protocolo Polícia Federal{" "}
                <strong className="font-semibold text-foreground">{req.pfProtocolo}</strong>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-8">
        <Stepper step={step} onStep={(i) => !concluido && i < step && setStep(i)} />

        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          {concluido && step === 4 ? (
            <Confirmacao req={req} />
          ) : (
            <>
              {step === 0 && <EtapaPessoais v={pessoais} set={setPessoais} />}
              {step === 1 && <EtapaDocumentos v={documentos} set={setDocumentos} />}
              {step === 2 && <EtapaComplementares v={complementares} set={setComplementares} />}
              {step === 3 && (
                <EtapaRevisao
                  pessoais={pessoais}
                  documentos={documentos}
                  complementares={complementares}
                  declarou={declarou}
                  setDeclarou={setDeclarou}
                />
              )}
              {step === 4 && (
                <EtapaPagamento
                  metodo={metodo}
                  setMetodo={setMetodo}
                  parcelas={parcelas}
                  setParcelas={setParcelas}
                  cartao={cartao}
                  setCartao={setCartao}
                  total={total}
                  valorParcela={valorParcela}
                />
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-between">
                <Button
                  variant="outline"
                  disabled={step === 0 || saving}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Anterior
                </Button>
                {step < 4 ? (
                  <Button
                    disabled={saving || (step === 3 && !declarou)}
                    onClick={() => void salvar(step + 1)}
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {step === 3 ? "Ir para o pagamento" : "Próximo"}
                  </Button>
                ) : (
                  <Button disabled={saving} onClick={() => void finalizar()}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {metodo === "PIX" ? "Gerar Pix" : "Pagar no cartão"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          VIA AIR Agência e Representações · Paranavaí/PR · atendimento 100% digital
        </p>
      </div>
    </div>
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (i: number) => void }) {
  return (
    <ol className="flex snap-x gap-2 overflow-x-auto pb-1">
      {ETAPAS.map((e, i) => {
        const done = i < step;
        const active = i === step;
        const Icon = e.icon;
        return (
          <li key={e.key} className="min-w-[9.5rem] flex-1 snap-start">
            <button
              type="button"
              onClick={() => onStep(i)}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow"
                  : done
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/25">
                {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="leading-tight">{e.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Secao({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Campo({
  label,
  value,
  onChange,
  required,
  placeholder,
  type = "text",
  wide,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  wide?: boolean;
  options?: string[];
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {options ? (
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecione…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <Input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

const upd = (set: (f: (v: Campos) => Campos) => void, key: string) => (v: string) =>
  set((prev) => ({ ...prev, [key]: v }));

function EtapaPessoais({ v, set }: { v: Campos; set: React.Dispatch<React.SetStateAction<Campos>> }) {
  return (
    <>
      <Secao title="Dados pessoais">
        <Campo label="Nome completo" required wide value={v.nomeCompleto ?? ""} onChange={upd(set, "nomeCompleto")} />
        <Campo label="Data de nascimento" type="date" required value={v.nascimento ?? ""} onChange={upd(set, "nascimento")} />
        <Campo label="Sexo" required value={v.sexo ?? ""} onChange={upd(set, "sexo")} options={["FEMININO", "MASCULINO"]} />
        <Campo label="Nacionalidade" value={v.nacionalidade ?? "BRASIL"} onChange={upd(set, "nacionalidade")} />
        <Campo label="Estado civil" value={v.estadoCivil ?? ""} onChange={upd(set, "estadoCivil")} options={["SOLTEIRO(A)", "CASADO(A)", "DIVORCIADO(A)", "VIÚVO(A)", "SEPARADO(A)"]} />
      </Secao>
      <Secao title="Naturalidade">
        <Campo label="UF de nascimento" value={v.naturalidadeUf ?? ""} onChange={upd(set, "naturalidadeUf")} options={UFS} />
        <Campo label="Cidade de nascimento" value={v.naturalidadeCidade ?? ""} onChange={upd(set, "naturalidadeCidade")} />
      </Secao>
      <Secao title="Filiação">
        <Campo label="Nome da mãe" required wide value={v.mae ?? ""} onChange={upd(set, "mae")} />
        <Campo label="Nome do pai" wide value={v.pai ?? ""} onChange={upd(set, "pai")} />
      </Secao>
    </>
  );
}

function EtapaDocumentos({ v, set }: { v: Campos; set: React.Dispatch<React.SetStateAction<Campos>> }) {
  return (
    <>
      <Secao title="Documento de identificação">
        <Campo label="Número" required value={v.docNumero ?? ""} onChange={upd(set, "docNumero")} />
        <Campo label="Data de emissão" type="date" value={v.docEmissao ?? ""} onChange={upd(set, "docEmissao")} />
        <Campo label="Órgão emissor" value={v.docOrgao ?? ""} onChange={upd(set, "docOrgao")} placeholder="Ex.: SSP" />
        <Campo label="UF de expedição" value={v.docUf ?? ""} onChange={upd(set, "docUf")} options={UFS} />
      </Secao>
      <Secao title="CPF">
        <Campo label="CPF" required value={v.cpf ?? ""} onChange={upd(set, "cpf")} placeholder="000.000.000-00" />
        <Campo label="CPF do responsável (menores)" value={v.cpfResponsavel ?? ""} onChange={upd(set, "cpfResponsavel")} />
      </Secao>
      <Secao title="Certidão">
        <Campo label="Matrícula (certidão modelo novo)" wide value={v.certidaoMatricula ?? ""} onChange={upd(set, "certidaoMatricula")} />
        <Campo label="Tipo" value={v.certidaoTipo ?? ""} onChange={upd(set, "certidaoTipo")} options={["NASCIMENTO", "CASAMENTO", "AVERBAÇÃO"]} />
        <Campo label="Número" value={v.certidaoNumero ?? ""} onChange={upd(set, "certidaoNumero")} />
        <Campo label="Livro" value={v.certidaoLivro ?? ""} onChange={upd(set, "certidaoLivro")} />
        <Campo label="Folha" value={v.certidaoFolha ?? ""} onChange={upd(set, "certidaoFolha")} />
        <Campo label="Cartório" value={v.certidaoCartorio ?? ""} onChange={upd(set, "certidaoCartorio")} />
        <Campo label="UF de expedição" value={v.certidaoUf ?? ""} onChange={upd(set, "certidaoUf")} options={UFS} />
        <Campo label="Cidade de expedição" value={v.certidaoCidade ?? ""} onChange={upd(set, "certidaoCidade")} />
      </Secao>
      <Secao title="Passaporte anterior">
        <Campo label="Situação" required wide value={v.passaporteSituacao ?? ""} onChange={upd(set, "passaporteSituacao")} options={SITUACOES_PASSAPORTE} />
        <Campo label="Série" value={v.passaporteSerie ?? ""} onChange={upd(set, "passaporteSerie")} placeholder="Ex.: CP" />
        <Campo label="Número" value={v.passaporteNumero ?? ""} onChange={upd(set, "passaporteNumero")} placeholder="Ex.: 999999" />
      </Secao>
    </>
  );
}

function EtapaComplementares({ v, set }: { v: Campos; set: React.Dispatch<React.SetStateAction<Campos>> }) {
  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const j = (await r.json()) as Record<string, string>;
      if (j.erro) return;
      set((prev) => ({
        ...prev,
        logradouro: j.logradouro ?? prev.logradouro ?? "",
        bairro: j.bairro ?? prev.bairro ?? "",
        cidade: j.localidade ?? prev.cidade ?? "",
        uf: j.uf ?? prev.uf ?? "",
      }));
    } catch {
      /* silencioso */
    }
  }

  return (
    <>
      <Secao title="Dados complementares">
        <Campo label="Profissão" required value={v.profissao ?? ""} onChange={upd(set, "profissao")} />
        <Campo label="E-mail" required type="email" value={v.email ?? ""} onChange={upd(set, "email")} />
      </Secao>
      <Secao title="Endereço do requerente">
        <Campo label="País" value={v.pais ?? "BRASIL"} onChange={upd(set, "pais")} />
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            CEP<span className="text-destructive"> *</span>
          </Label>
          <Input
            value={v.cep ?? ""}
            placeholder="00000-000"
            onChange={(e) => {
              const val = e.target.value;
              set((prev) => ({ ...prev, cep: val }));
              void buscarCep(val);
            }}
          />
        </div>
        <Campo label="UF" required value={v.uf ?? ""} onChange={upd(set, "uf")} options={UFS} />
        <Campo label="Cidade" required value={v.cidade ?? ""} onChange={upd(set, "cidade")} />
        <Campo label="Logradouro" required wide value={v.logradouro ?? ""} onChange={upd(set, "logradouro")} />
        <Campo label="Número" required value={v.numero ?? ""} onChange={upd(set, "numero")} />
        <Campo label="Complemento" value={v.complemento ?? ""} onChange={upd(set, "complemento")} />
        <Campo label="Distrito/Bairro" value={v.bairro ?? ""} onChange={upd(set, "bairro")} />
        <Campo label="DDD" value={v.ddd ?? ""} onChange={upd(set, "ddd")} />
        <Campo label="Telefone" value={v.telefone ?? ""} onChange={upd(set, "telefone")} />
      </Secao>
    </>
  );
}

function Linha({ label, value }: { label: string; value?: string }) {
  return (
    <div className="border-b border-dashed py-2 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value?.trim() ? value : "—"}</div>
    </div>
  );
}

function EtapaRevisao({
  pessoais,
  documentos,
  complementares,
  declarou,
  setDeclarou,
}: {
  pessoais: Campos;
  documentos: Campos;
  complementares: Campos;
  declarou: boolean;
  setDeclarou: (v: boolean) => void;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold">Confira atentamente as informações abaixo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Erros nos dados implicam atraso na emissão do documento de viagem.
      </p>
      <div className="mt-5 grid gap-x-8 sm:grid-cols-2">
        <Linha label="Nome completo" value={pessoais.nomeCompleto} />
        <Linha label="Nacionalidade" value={pessoais.nacionalidade ?? "BRASIL"} />
        <Linha label="Data de nascimento" value={pessoais.nascimento} />
        <Linha label="Sexo" value={pessoais.sexo} />
        <Linha
          label="Naturalidade"
          value={[pessoais.naturalidadeCidade, pessoais.naturalidadeUf].filter(Boolean).join(" / ")}
        />
        <Linha label="Filiação" value={[pessoais.mae, pessoais.pai].filter(Boolean).join(" · ")} />
        <Linha label="CPF" value={documentos.cpf} />
        <Linha
          label="Documento de identificação"
          value={[documentos.docNumero, documentos.docOrgao, documentos.docUf].filter(Boolean).join(" · ")}
        />
        <Linha label="Passaporte anterior" value={documentos.passaporteSituacao} />
        <Linha label="Profissão" value={complementares.profissao} />
        <Linha label="E-mail" value={complementares.email} />
        <Linha
          label="Endereço"
          value={[
            complementares.logradouro,
            complementares.numero,
            complementares.bairro,
            complementares.cidade,
            complementares.uf,
            complementares.cep,
          ]
            .filter(Boolean)
            .join(", ")}
        />
      </div>
      <label className="mt-6 flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={declarou}
          onChange={(e) => setDeclarou(e.target.checked)}
        />
        <span>
          Declaro que as informações acima estão corretas e estou ciente de que qualquer erro nos
          dados implicará atraso na emissão do meu documento de viagem.
        </span>
      </label>
    </div>
  );
}

function EtapaPagamento({
  metodo,
  setMetodo,
  parcelas,
  setParcelas,
  cartao,
  setCartao,
  total,
  valorParcela,
}: {
  metodo: "PIX" | "CREDIT_CARD";
  setMetodo: (m: "PIX" | "CREDIT_CARD") => void;
  parcelas: number;
  setParcelas: (p: number) => void;
  cartao: Campos;
  setCartao: React.Dispatch<React.SetStateAction<Campos>>;
  total: number;
  valorParcela: number;
}) {
  const opcoes = useMemo(() => Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1), []);
  return (
    <div>
      <h2 className="text-base font-semibold">Pagamento da solicitação</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Serviço VIA AIR de apoio completo à renovação do seu passaporte.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMetodo("PIX")}
          className={`rounded-xl border p-4 text-left transition ${
            metodo === "PIX" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4 text-primary" /> Pix
          </div>
          <div className="mt-1 text-2xl font-bold">{formatBRL(PRECO_PIX)}</div>
          <div className="text-xs text-muted-foreground">Confirmação imediata</div>
        </button>
        <button
          type="button"
          onClick={() => setMetodo("CREDIT_CARD")}
          className={`rounded-xl border p-4 text-left transition ${
            metodo === "CREDIT_CARD" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4 text-primary" /> Cartão de crédito
          </div>
          <div className="mt-1 text-2xl font-bold">{formatBRL(PRECO_CARTAO)}</div>
          <div className="text-xs text-muted-foreground">Em até {MAX_PARCELAS}x</div>
        </button>
      </div>

      {metodo === "CREDIT_CARD" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Parcelas</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={parcelas}
              onChange={(e) => setParcelas(Number(e.target.value))}
            >
              {opcoes.map((n) => (
                <option key={n} value={n}>
                  {n}x de {formatBRL(total / n)}
                </option>
              ))}
            </select>
          </div>
          <Campo label="Nome impresso no cartão" required wide value={cartao.titular ?? ""} onChange={upd(setCartao, "titular")} />
          <Campo label="Número do cartão" required wide value={cartao.numero ?? ""} onChange={upd(setCartao, "numero")} />
          <Campo label="Mês (MM)" required value={cartao.mes ?? ""} onChange={upd(setCartao, "mes")} />
          <Campo label="Ano (AAAA)" required value={cartao.ano ?? ""} onChange={upd(setCartao, "ano")} />
          <Campo label="CVV" required value={cartao.cvv ?? ""} onChange={upd(setCartao, "cvv")} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-semibold">
          {formatBRL(total)}
          {metodo === "CREDIT_CARD" && parcelas > 1 ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {parcelas}x de {formatBRL(valorParcela)}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function Confirmacao({ req }: { req: PassportPublic }) {
  const pago = req.paymentStatus === "paid";
  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Check className="h-7 w-7 text-primary" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">Solicitação enviada</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Guarde seu protocolo VIA AIR <strong className="text-foreground">{req.protocolo}</strong>.
        Assim que a Polícia Federal gerar o protocolo oficial, ele aparecerá aqui.
      </p>

      {req.pixPayload && !pago ? (
        <div className="mx-auto mt-6 max-w-sm rounded-xl border p-5">
          {req.pixQrBase64 ? (
            <img
              src={`data:image/png;base64,${req.pixQrBase64}`}
              alt="QR Code do Pix da solicitação de passaporte"
              className="mx-auto h-52 w-52 rounded-lg"
            />
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">Pix copia e cola</p>
          <div className="mt-1 break-all rounded-md bg-muted p-2 text-[11px]">{req.pixPayload}</div>
          <Button
            className="mt-3 w-full"
            onClick={() => {
              void navigator.clipboard.writeText(req.pixPayload ?? "");
              toast.success("Código Pix copiado!");
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> Copiar código Pix
          </Button>
        </div>
      ) : null}

      {req.paymentMethod === "CREDIT_CARD" ? (
        <p className="mt-6 text-sm">
          Pagamento no cartão {pago ? "aprovado" : "em processamento"}
          {req.installments && req.installments > 1 ? ` — ${req.installments}x` : ""}.
        </p>
      ) : null}

      {req.invoiceUrl ? (
        <a
          href={req.invoiceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm font-medium text-primary underline"
        >
          Ver comprovante da cobrança
        </a>
      ) : null}
    </div>
  );
}
