import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { FileText, Download, FileCode2 } from "lucide-react";
import { downloadNfsePdf, downloadNfseXml } from "@/lib/nfse-document";
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

function Row({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
  const isNode =
    value != null && (typeof value === "string" || typeof value === "number" ||
      (typeof value === "object" && "$$typeof" in (value as object)));
  const rendered = value == null || value === ""
    ? "—"
    : isNode ? (value as React.ReactNode) : String(value);
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""} break-words`}>
        {rendered}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-card/60">
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">{title}</h3>
      </div>
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-x-4">{children}</div>
    </div>
  );
}

export function NfseDetailsDialog({ open, onOpenChange, row }: Props) {
  if (!row) return null;
  const tomador = (row.tomador as AnyRec | null) ?? {};
  const end = (tomador.endereco as AnyRec | null) ?? {};
  const order = (row.orders as AnyRec | null) ?? null;
  const status = String(row.status ?? "");
  const isAutorizada = status === "autorizado" || status === "emitida";

  const valor = Number(row.valor_servicos ?? 0);
  const ded = Number(row.valor_deducoes ?? 0);
  const base = Number(row.base_calculo ?? valor - ded);
  const iss = Number(row.valor_iss ?? 0);
  const issRet = Number(row.valor_iss_retido ?? 0);
  const desc = String(row.discriminacao ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-orange" />
            NFS-e {row.numero_nfse ? `Nº ${row.numero_nfse}` : `(RPS ${row.numero_rps ?? "—"})`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Section title="Identificação">
            <Row label="Número NFS-e" value={row.numero_nfse ?? "—"} mono />
            <Row label="Série" value={row.serie ?? "1"} />
            <Row label="RPS" value={row.numero_rps ?? "—"} mono />
            <Row label="Emissão" value={fmtDT(row.data_emissao ?? row.created_at)} />
            <Row label="Status" value={status} />
            <Row
              label="Código de verificação"
              value={row.codigo_verificacao ?? "—"}
              mono
            />
            {!!order?.order_number && (
              <Row
                label="Pedido"
                value={
                  <Link
                    to="/admin/pedidos/$id"
                    params={{ id: String(row.order_id) }}
                    className="text-brand-orange hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    #{String(order.order_number)}
                  </Link>
                }
              />
            )}
          </Section>

          <Section title="Tomador do Serviço">
            <Row label="Razão social / Nome" value={String(tomador.razaoSocial ?? order?.full_name ?? "—")} />
            <Row label="CPF / CNPJ" value={fmtDoc(tomador.cpfCnpj)} mono />
            <Row label="Inscrição municipal" value={tomador.inscricaoMunicipal ?? "—"} />
            <Row label="E-mail" value={tomador.email ?? order?.email ?? "—"} />
            <Row label="Telefone" value={tomador.telefone ?? order?.phone ?? "—"} />
            <Row label="CEP" value={fmtCep(end.cep)} mono />
            <Row
              label="Logradouro"
              value={
                [end.logradouro, end.numero ? `nº ${end.numero}` : null, end.complemento]
                  .filter(Boolean).join(", ") || "—"
              }
            />
            <Row label="Bairro" value={end.bairro ?? "—"} />
            <Row
              label="Município / UF"
              value={[end.cidade, end.uf].filter(Boolean).join(" / ") || "—"}
            />
          </Section>

          <Section title="Valores">
            <Row label="Valor dos serviços" value={brl(valor)} />
            <Row label="Deduções" value={brl(ded)} />
            <Row label="Base de cálculo" value={brl(base)} />
            <Row label="Alíquota ISS" value={pct(row.aliquota_iss)} />
            <Row label="Valor do ISS" value={brl(iss)} />
            <Row label="ISS retido" value={brl(issRet)} />
            <Row label="IR" value={brl(row.valor_ir)} />
            <Row label="INSS" value={brl(row.valor_inss)} />
            <Row label="CSLL" value={brl(row.valor_csll)} />
            <Row label="COFINS" value={brl(row.valor_cofins)} />
            <Row label="PIS" value={brl(row.valor_pis)} />
            <Row label="Outras retenções" value={brl(row.outras_retencoes)} />
            <Row label="Trib. federais" value={brl(row.tributos_federais)} />
            <Row label="Trib. estaduais" value={brl(row.tributos_estaduais)} />
            <Row label="Trib. municipais" value={brl(row.tributos_municipais)} />
            <Row label="Desc. incondicional" value={brl(row.desconto_incondicional)} />
            <Row label="Desc. condicional" value={brl(row.desconto_condicional)} />
            <Row
              label="Valor líquido"
              value={<span className="font-bold text-emerald-500">{brl(row.valor_liquido ?? valor - issRet)}</span>}
            />
          </Section>

          <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-card/60">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange">
                Discriminação do Serviço
              </h3>
            </div>
            <pre className="p-4 text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {desc || "—"}
            </pre>
          </div>

          {isAutorizada && (
            <div className="flex gap-2 justify-end pt-2 border-t border-border">
              <button
                onClick={() => downloadNfsePdf(row as never)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:opacity-90"
              >
                <Download className="h-4 w-4" /> Baixar PDF
              </button>
              <button
                onClick={() => {
                  try { downloadNfseXml(row as never); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "XML indisponível"); }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-accent"
              >
                <FileCode2 className="h-4 w-4" /> Baixar XML
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
