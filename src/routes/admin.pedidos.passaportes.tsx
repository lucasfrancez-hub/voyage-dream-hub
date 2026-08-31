import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Copy, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import { BlocoCampos, CampoItem } from "@/components/admin/CamposFormulario";
import {
  createPassportRequest,
  listPassportRequests,
  updatePassportAdmin,
  type PassportAdminRow,
} from "@/lib/passaporte.functions";
import { listarPagamentosPassaporte } from "@/lib/passaporte-infinitepay.functions";
import { publicOrigin } from "@/lib/public-url";
import type { PassportPaymentRow } from "@/lib/passaporte-pagamento.types";


export const Route = createFileRoute("/admin/pedidos/passaportes")({
  head: () => ({
    meta: [
      { title: "Passaportes | VIA AIR" },
      { name: "description", content: "Gere links públicos de renovação de passaporte e lance o protocolo da Polícia Federal." },
      { property: "og:title", content: "Passaportes | VIA AIR" },
      { property: "og:description", content: "Links de renovação de passaporte e protocolos da Polícia Federal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassaportesAdmin,
});

function PassaportesAdmin() {
  const listFn = useServerFn(listPassportRequests);
  const createFn = useServerFn(createPassportRequest);
  const updateFn = useServerFn(updatePassportAdmin);

  const [rows, setRows] = useState<PassportAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      setRows((await listFn()) as PassportAdminRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkDe = (token: string) => `${publicOrigin()}/passaporte/${token}`;

  async function novo() {
    setCreating(true);
    try {
      const r = (await createFn({ data: { nome: nome || null, telefone: telefone || null } })) as PassportAdminRow;
      setRows((prev) => [r, ...prev]);
      setNome("");
      setTelefone("");
      void navigator.clipboard.writeText(linkDe(r.token));
      toast.success(`Link criado (${r.protocolo}) e copiado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar link.");
    } finally {
      setCreating(false);
    }
  }

  async function salvarPf(row: PassportAdminRow, pfProtocolo: string) {
    try {
      const updated = (await updateFn({ data: { id: row.id, pfProtocolo } })) as PassportAdminRow;
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("Protocolo da Polícia Federal salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden p-4 sm:p-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Renovação de passaporte</h1>
          <p className="text-sm text-muted-foreground">
            Gere o link público, acompanhe o preenchimento e lance o protocolo da Polícia Federal.
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Novo link público</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Nome do cliente (opcional)</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">WhatsApp (opcional)</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void novo()} disabled={creating} className="w-full">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Gerar link
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pix {formatBRL(285)} · Cartão {formatBRL(320)} em até 10x.
        </p>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma solicitação ainda.</p>
        ) : (
          rows.map((r) => <Card key={r.id} row={r} link={linkDe(r.token)} onSavePf={salvarPf} />)
        )}
      </section>
    </div>
  );
}

function Card({
  row,
  link,
  onSavePf,
}: {
  row: PassportAdminRow;
  link: string;
  onSavePf: (row: PassportAdminRow, pf: string) => Promise<void>;
}) {
  const [pf, setPf] = useState(row.pfProtocolo ?? "");
  const [aberto, setAberto] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{row.applicantName ?? "Sem nome"}</div>
          <div className="truncate text-xs text-muted-foreground">
            Protocolo VIA AIR {row.protocolo} · {new Date(row.createdAt).toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{row.status}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              row.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {row.paymentStatus === "paid" ? "Pago" : "Pagamento pendente"}
            {row.amount ? ` · ${formatBRL(row.amount)}` : ""}
          </span>
        </div>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        <code className="min-w-0 max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{link}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(link);
            toast.success("Link copiado.");
          }}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
        </Button>
        <a href={link} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">
          Abrir
        </a>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Protocolo da Polícia Federal</Label>
          <Input value={pf} onChange={(e) => setPf(e.target.value)} placeholder="Lançar quando emitido" />
        </div>
        <div className="flex items-end">
          <Button size="sm" onClick={() => void onSavePf(row, pf)}>
            Salvar protocolo
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t pt-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary"
        >
          {aberto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {aberto ? "Ocultar dados do formulário" : "Ver dados do formulário e pagamento"}
        </button>

        {aberto && (
          <div className="mt-3 space-y-4">
            <Bloco titulo="Dados pessoais" dados={row.dadosPessoais} />
            <Bloco titulo="Documentos" dados={row.documentos} />
            <Bloco titulo="Dados complementares" dados={row.complementares} />
            <BlocoInfinitePay requestId={row.id} />


            <section className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-4">
              <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-orange">
                <span className="h-3 w-1 rounded-full bg-brand-orange" />
                Pagamento
              </h4>
              <dl className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <Item rotulo="Situação" valor={row.paymentStatus === "paid" ? "Pago" : "Pendente"} />
                <Item
                  rotulo="Forma"
                  valor={
                    row.paymentMethod === "PIX"
                      ? "Pix"
                      : row.paymentMethod === "CREDIT_CARD"
                        ? `Cartão de crédito${row.installments ? ` — ${row.installments}x` : ""}`
                        : "—"
                  }
                />
                <Item rotulo="Valor" valor={row.amount ? formatBRL(row.amount) : "—"} />
                <Item
                  rotulo="Pago em"
                  valor={row.paidAt ? new Date(row.paidAt).toLocaleString("pt-BR") : "—"}
                />
                <Item
                  rotulo="Enviado em"
                  valor={row.submittedAt ? new Date(row.submittedAt).toLocaleString("pt-BR") : "—"}
                />
                <Item rotulo="ID da cobrança" valor={row.asaasPaymentId ?? "—"} />
                <Item rotulo="CPF do titular" valor={row.applicantCpf ?? "—"} />
                <Item rotulo="E-mail" valor={row.applicantEmail ?? "—"} />
                <Item rotulo="Telefone" valor={row.applicantPhone ?? "—"} />
              </dl>
              {row.invoiceUrl && (
                <a
                  href={row.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-primary underline"
                >
                  Abrir comprovante/cobrança
                </a>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

const ROTULOS: Record<string, string> = {
  nomeCompleto: "Nome completo",
  nascimento: "Data de nascimento",
  sexo: "Sexo",
  nacionalidade: "Nacionalidade",
  estadoCivil: "Estado civil",
  naturalidadeUf: "UF de nascimento",
  naturalidadeCidade: "Cidade de nascimento",
  mae: "Nome da mãe",
  pai: "Nome do pai",
  docNumero: "Documento — número",
  docEmissao: "Documento — emissão",
  docOrgao: "Documento — órgão emissor",
  docUf: "Documento — UF",
  cpf: "CPF",
  cpfResponsavel: "CPF do responsável",
  certidaoMatricula: "Certidão — matrícula",
  certidaoTipo: "Certidão — tipo",
  certidaoNumero: "Certidão — número",
  certidaoLivro: "Certidão — livro",
  certidaoFolha: "Certidão — folha",
  certidaoCartorio: "Certidão — cartório",
  certidaoUf: "Certidão — UF",
  certidaoCidade: "Certidão — cidade",
  passaporteSituacao: "Passaporte anterior — situação",
  passaporteSerie: "Passaporte anterior — série",
  passaporteNumero: "Passaporte anterior — número",
  profissao: "Profissão",
  email: "E-mail",
  pais: "País",
  cep: "CEP",
  uf: "UF",
  cidade: "Cidade",
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Distrito/Bairro",
  ddd: "DDD",
  telefone: "Telefone",
};

const rotular = (k: string) =>
  ROTULOS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function Bloco({ titulo, dados }: { titulo: string; dados: Record<string, string> }) {
  const entradas = Object.entries(dados ?? {})
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => [rotular(k), String(v)] as [string, string]);
  return <BlocoCampos titulo={titulo} entradas={entradas} />;
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <CampoItem rotulo={rotulo} valor={valor} />;
}

/** Cobranças de cartão (InfinitePay) desta solicitação de passaporte. */
function BlocoInfinitePay({ requestId }: { requestId: string }) {
  const listar = useServerFn(listarPagamentosPassaporte);
  const [rows, setRows] = useState<PassportPaymentRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = (await listar({ data: { requestId } })) as PassportPaymentRow[];
        if (alive) setRows(r);
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [listar, requestId]);

  return (
    <div>
      <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-orange">
        <span className="h-3 w-1 rounded-full bg-brand-orange" />
        Cobranças no cartão (InfinitePay)
      </h4>
      {rows === null ? (
        <p className="mt-1 text-xs text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Nenhuma cobrança de cartão gerada.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="rounded-lg border bg-muted/20 p-3">
              <dl className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <Item rotulo="Situação" valor={p.status} />
                <Item
                  rotulo="Valor"
                  valor={formatBRL((p.paidAmount ?? p.amount) / 100)}
                />
                <Item rotulo="Parcelas" valor={p.installments ? `${p.installments}x` : "—"} />
                <Item rotulo="Forma capturada" valor={p.captureMethod ?? "—"} />
                <Item rotulo="Pedido (order_nsu)" valor={p.orderNsu} />
                <Item rotulo="Transação (transaction_nsu)" valor={p.transactionNsu ?? "—"} />
                <Item
                  rotulo="Criada em"
                  valor={new Date(p.createdAt).toLocaleString("pt-BR")}
                />
                <Item
                  rotulo="Paga em"
                  valor={p.paidAt ? new Date(p.paidAt).toLocaleString("pt-BR") : "—"}
                />
              </dl>
              {p.notes ? (
                <p className="mt-2 text-xs font-medium text-amber-700">{p.notes}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3">
                {p.receiptUrl ? (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary underline"
                  >
                    Ver comprovante
                  </a>
                ) : null}
                {p.checkoutUrl ? (
                  <a
                    href={p.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary underline"
                  >
                    Abrir link de pagamento
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


