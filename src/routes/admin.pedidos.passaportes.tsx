import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import {
  createPassportRequest,
  listPassportRequests,
  updatePassportAdmin,
  type PassportAdminRow,
} from "@/lib/passaporte.functions";

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
      setRows(await listFn());
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

  const linkDe = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/passaporte/${token}`;

  async function novo() {
    setCreating(true);
    try {
      const r = await createFn({ data: { nome: nome || null, telefone: telefone || null } });
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
      const updated = await updateFn({ data: { id: row.id, pfProtocolo } });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("Protocolo da Polícia Federal salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
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
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{row.applicantName ?? "Sem nome"}</div>
          <div className="text-xs text-muted-foreground">
            Protocolo VIA AIR {row.protocolo} · {new Date(row.createdAt).toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{link}</code>
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
    </div>
  );
}
