import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@tanstack/react-router";
import {
  FileText,
  Download,
  FileCode2,
  User,
  Calculator,
  ScrollText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  Ban,
  Building2,
} from "lucide-react";
import { downloadNfsePdf, downloadNfseXml } from "@/lib/nfse-document";
import { cancelarNfse } from "@/lib/nfse.functions";
import { CancelNfseDialog } from "@/components/nfse/CancelNfseDialog";
import { toast } from "sonner";


type AnyRec = Record<string, unknown>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: AnyRec | null;
};

const brl = (n: unknown) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: unknown) =>
  `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} %`;
const fmtDT = (s: unknown) => (s ? new Date(String(s)).toLocaleString("pt-BR") : "—");
const fmtDoc = (v: unknown) => {
  const n = String(v ?? "").replace(/\D/g, "");
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(v ?? "—");
};
const fmtCep = (v: unknown) => {
  const n = String(v ?? "").replace(/\D/g, "");
  return n.length === 8 ? n.replace(/(\d{5})(\d{3})/, "$1-$2") : String(v ?? "—");
};

function Field({
  label,
  value,
  mono,
  span,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
  span?: 1 | 2 | 3;
}) {
  const spanCls = span === 3 ? "md:col-span-3" : span === 2 ? "md:col-span-2" : "";
  const rendered: React.ReactNode =
    value == null || value === "" ? (
      <span className="text-muted-foreground">—</span>
    ) : typeof value === "string" || typeof value === "number" ? (
      String(value)
    ) : (
      (value as React.ReactNode)
    );
  return (
    <div className={`flex flex-col gap-1 py-2 ${spanCls}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <span className={`text-sm text-foreground break-words ${mono ? "font-mono" : ""}`}>
        {rendered}
      </span>
    </div>
  );
}

function Card({
  title,
  children,
  cols = 3,
}: {
  title?: string;
  children: React.ReactNode;
  cols?: 2 | 3;
}) {
  const gridCls = cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  return (
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
      {title && (
        <div className="px-4 py-2 border-b border-border bg-card/60 flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">{title}</h3>
        </div>
      )}
      <div className={`px-4 pb-3 pt-1 grid grid-cols-2 ${gridCls} gap-x-4`}>{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cfg =
    s === "autorizado" || s === "emitida"
      ? { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", label: "Autorizada" }
      : s === "cancelado"
      ? { icon: XCircle, cls: "bg-rose-500/15 text-rose-500 border-rose-500/30", label: "Cancelada" }
      : s === "erro" || s === "rejeitada"
      ? { icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-500 border-amber-500/30", label: "Erro" }
      : { icon: Clock, cls: "bg-sky-500/15 text-sky-500 border-sky-500/30", label: status || "Processando" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {cfg.label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        toast.success("Copiado");
      }}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand-orange"
      title="Copiar"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export function NfseDetailsDialog({ open, onOpenChange, row }: Props) {
  if (!row) return null;
  const tomador = (row.tomador as AnyRec | null) ?? {};
  const end = (tomador.endereco as AnyRec | null) ?? {};
  const prestador = (row.prestador as AnyRec | null) ?? {};
  const prestadorNome =
    (prestador.nome_fantasia as string | null) ||
    (prestador.razao_social as string | null) ||
    "—";
  const order = (row.orders as AnyRec | null) ?? null;
  const status = String(row.status ?? "");
  const isAutorizada = status === "autorizado" || status === "emitida";

  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelarNfse);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelMut = useMutation({
    mutationFn: (justificativa: string) =>
      cancelFn({ data: { id: String(row.id), justificativa } }),
    onSuccess: () => {
      toast.success("NFS-e cancelada");
      qc.invalidateQueries();
      setCancelOpen(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cancelar"),
  });

  const valor = Number(row.valor_servicos ?? 0);
  const ded = Number(row.valor_deducoes ?? 0);
  const base = Number(row.base_calculo ?? valor - ded);
  const iss = Number(row.valor_iss ?? 0);

  const issRet = Number(row.valor_iss_retido ?? 0);
  const liquido = Number(row.valor_liquido ?? valor - issRet);
  const desc = String(row.discriminacao ?? "");
  const codVer = String(row.codigo_verificacao ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0 gap-0">
        {/* Hero */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-border bg-gradient-to-br from-brand-orange/10 via-transparent to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-brand-orange/15 border border-brand-orange/30 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-brand-orange" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-3">
                  NFS-e{" "}
                  {row.numero_nfse ? (
                    <span className="text-brand-orange">Nº {String(row.numero_nfse)}</span>
                  ) : (
                    <span className="text-muted-foreground">RPS {String(row.numero_rps ?? "—")}</span>
                  )}
                  <StatusPill status={status} />
                </DialogTitle>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Emissão: {fmtDT(row.data_emissao ?? row.created_at)}</span>
                  <span>Série {String(row.serie ?? "1")}</span>
                  <span>RPS {String(row.numero_rps ?? "—")}</span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {prestadorNome}
                  </span>
                  {!!order?.order_number && (
                    <Link
                      to="/admin/pedidos/$id"
                      params={{ id: String(row.order_id) }}
                      className="text-brand-orange hover:underline"
                      onClick={() => onOpenChange(false)}
                    >
                      Pedido #{String(order.order_number)}
                    </Link>
                  )}
                </div>
              </div>
            </div>
            {isAutorizada && (
              <div className="hidden md:flex flex-col items-end shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Valor líquido
                </span>
                <span className="text-2xl font-bold text-emerald-500">{brl(liquido)}</span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs defaultValue="resumo" className="flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 grid w-auto grid-cols-5 self-start">
            <TabsTrigger value="resumo" className="gap-2">
              <FileText className="h-3.5 w-3.5" /> Resumo
            </TabsTrigger>
            <TabsTrigger value="prestador" className="gap-2">
              <Building2 className="h-3.5 w-3.5" /> Prestador
            </TabsTrigger>
            <TabsTrigger value="tomador" className="gap-2">
              <User className="h-3.5 w-3.5" /> Tomador
            </TabsTrigger>
            <TabsTrigger value="valores" className="gap-2">
              <Calculator className="h-3.5 w-3.5" /> Valores
            </TabsTrigger>
            <TabsTrigger value="servico" className="gap-2">
              <ScrollText className="h-3.5 w-3.5" /> Serviço
            </TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto px-6 py-4 space-y-4 h-[60vh]">
            <TabsContent value="resumo" className="mt-0 space-y-4">
              <Card title="Identificação">
                <Field label="Número NFS-e" value={row.numero_nfse ?? "—"} mono />
                <Field label="Série" value={row.serie ?? "1"} />
                <Field label="RPS" value={row.numero_rps ?? "—"} mono />
                <Field label="Emissão" value={fmtDT(row.data_emissao ?? row.created_at)} />
                <Field label="Status" value={<StatusPill status={status} />} />
                <Field
                  label="Pedido"
                  value={
                    order?.order_number ? (
                      <Link
                        to="/admin/pedidos/$id"
                        params={{ id: String(row.order_id) }}
                        className="text-brand-orange hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        #{String(order.order_number)}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <Field
                  span={3}
                  label="Código de verificação"
                  value={
                    codVer ? (
                      <span className="inline-flex items-center gap-2 font-mono text-xs">
                        {codVer} <CopyBtn text={codVer} />
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </Card>

              {/* Quick summary grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-card/40 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Serviços
                  </div>
                  <div className="text-lg font-bold mt-1">{brl(valor)}</div>
                </div>
                <div className="rounded-xl border border-border bg-card/40 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Base cálculo
                  </div>
                  <div className="text-lg font-bold mt-1">{brl(base)}</div>
                </div>
                <div className="rounded-xl border border-border bg-card/40 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    ISS ({pct(row.aliquota_iss)})
                  </div>
                  <div className="text-lg font-bold mt-1">{brl(iss)}</div>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-500/80 font-semibold">
                    Líquido
                  </div>
                  <div className="text-lg font-bold mt-1 text-emerald-500">{brl(liquido)}</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="prestador" className="mt-0 space-y-4">
              <Card title="Prestador de Serviço">
                <Field span={2} label="Razão social" value={prestador.razao_social ?? "—"} />
                <Field label="Nome fantasia" value={prestador.nome_fantasia ?? "—"} />
                <Field label="CNPJ" value={fmtDoc(prestador.cnpj)} mono />
                <Field label="Inscrição municipal" value={prestador.inscricao_municipal ?? "—"} />
                <Field label="CNAE" value={prestador.cnae_principal ?? "—"} />
                <Field label="Item lista serviço" value={prestador.item_lista_servico ?? "—"} />
                <Field label="Alíquota ISS" value={prestador.aliquota_iss != null ? pct(prestador.aliquota_iss) : "—"} />
                <Field label="Regime especial" value={prestador.regime_especial ?? "—"} />
                <Field
                  label="Optante Simples"
                  value={prestador.optante_simples == null ? "—" : prestador.optante_simples ? "Sim" : "Não"}
                />
                <Field label="E-mail" value={prestador.email ?? "—"} />
                <Field label="Telefone" value={prestador.telefone ?? "—"} />
              </Card>
              <Card title="Endereço do Prestador">
                <Field label="CEP" value={fmtCep(prestador.cep)} mono />
                <Field
                  span={2}
                  label="Logradouro"
                  value={
                    [prestador.logradouro, prestador.numero ? `nº ${prestador.numero}` : null, prestador.complemento]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
                <Field label="Bairro" value={prestador.bairro ?? "—"} />
                <Field
                  span={2}
                  label="Município / UF"
                  value={[prestador.municipio, prestador.uf].filter(Boolean).join(" / ") || "—"}
                />
              </Card>
            </TabsContent>


            <TabsContent value="tomador" className="mt-0 space-y-4">
              <Card title="Dados do Tomador">
                <Field
                  span={2}
                  label="Razão social / Nome"
                  value={String(tomador.razaoSocial ?? order?.full_name ?? "—")}
                />
                <Field label="CPF / CNPJ" value={fmtDoc(tomador.cpfCnpj)} mono />
                <Field label="Inscrição municipal" value={tomador.inscricaoMunicipal ?? "—"} />
                <Field label="E-mail" value={tomador.email ?? order?.email ?? "—"} />
                <Field label="Telefone" value={tomador.telefone ?? order?.phone ?? "—"} />
              </Card>
              <Card title="Endereço">
                <Field label="CEP" value={fmtCep(end.cep)} mono />
                <Field
                  span={2}
                  label="Logradouro"
                  value={
                    [end.logradouro, end.numero ? `nº ${end.numero}` : null, end.complemento]
                      .filter(Boolean)
                      .join(", ") || "—"
                  }
                />
                <Field label="Bairro" value={end.bairro ?? "—"} />
                <Field
                  span={2}
                  label="Município / UF"
                  value={[end.cidade, end.uf].filter(Boolean).join(" / ") || "—"}
                />
              </Card>
            </TabsContent>

            <TabsContent value="valores" className="mt-0 space-y-4">
              <Card title="Base e ISS">
                <Field label="Valor dos serviços" value={brl(valor)} />
                <Field label="Deduções" value={brl(ded)} />
                <Field label="Base de cálculo" value={brl(base)} />
                <Field label="Alíquota ISS" value={pct(row.aliquota_iss)} />
                <Field label="Valor do ISS" value={brl(iss)} />
                <Field label="ISS retido" value={brl(issRet)} />
              </Card>
              <Card title="Retenções federais">
                <Field label="IR" value={brl(row.valor_ir)} />
                <Field label="INSS" value={brl(row.valor_inss)} />
                <Field label="CSLL" value={brl(row.valor_csll)} />
                <Field label="COFINS" value={brl(row.valor_cofins)} />
                <Field label="PIS" value={brl(row.valor_pis)} />
                <Field label="Outras retenções" value={brl(row.outras_retencoes)} />
              </Card>
              <Card title="Tributos e descontos">
                <Field label="Trib. federais" value={brl(row.tributos_federais)} />
                <Field label="Trib. estaduais" value={brl(row.tributos_estaduais)} />
                <Field label="Trib. municipais" value={brl(row.tributos_municipais)} />
                <Field label="Desc. incondicional" value={brl(row.desconto_incondicional)} />
                <Field label="Desc. condicional" value={brl(row.desconto_condicional)} />
                <Field
                  label="Valor líquido"
                  value={<span className="font-bold text-emerald-500">{brl(liquido)}</span>}
                />
              </Card>
            </TabsContent>

            <TabsContent value="servico" className="mt-0">
              <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
                <div className="px-4 py-2 border-b border-border bg-card/60">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                    Discriminação do Serviço
                  </h3>
                </div>
                <pre className="p-4 text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[50vh] overflow-y-auto">
                  {desc || "—"}
                </pre>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer actions */}
        {isAutorizada && (
          <div className="flex gap-2 justify-end px-6 py-4 border-t border-border bg-card/40">
            <button
              onClick={() => setCancelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-rose-500/40 text-rose-500 rounded-lg text-sm font-medium hover:bg-rose-500/10 transition"
            >
              <Ban className="h-4 w-4" /> Cancelar NFS-e
            </button>
            <button
              onClick={() => {
                try {
                  downloadNfseXml(row as never);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "XML indisponível");
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-accent transition"
            >
              <FileCode2 className="h-4 w-4" /> Baixar XML
            </button>
            <button
              onClick={() => downloadNfsePdf(row as never)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:opacity-90 transition shadow-lg shadow-brand-orange/20"
            >
              <Download className="h-4 w-4" /> Baixar PDF
            </button>
          </div>
        )}
      </DialogContent>
      <CancelNfseDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        numero={(row.numero_nfse as string | number | null) ?? (row.numero_rps as string | number | null) ?? null}
        loading={cancelMut.isPending}
        onConfirm={(j) => cancelMut.mutate(j)}
      />
    </Dialog>
  );
}

