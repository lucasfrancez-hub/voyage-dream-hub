import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Copy, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlocoCampos, humanizar } from "@/components/admin/CamposFormulario";
import {
  createVisaRequest,
  listVisaRequests,
  updateVisaRequest,
  type VisaAdminRow,
} from "@/lib/visto.functions";

export const Route = createFileRoute("/admin/pedidos/vistos")({
  head: () => ({
    meta: [
      { title: "Visto americano | VIA AIR" },
      {
        name: "description",
        content: "Gere links públicos do formulário de apoio ao DS-160 e acompanhe o preenchimento.",
      },
      { property: "og:title", content: "Visto americano | VIA AIR" },
      {
        property: "og:description",
        content: "Formulário de apoio ao DS-160 da VIA AIR, com link público por cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VistosAdmin,
});

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando preenchimento",
  em_preenchimento: "Em preenchimento",
  enviado: "Enviado para conferência",
  concluido: "Concluído",
};

function VistosAdmin() {
  const listFn = useServerFn(listVisaRequests);
  const createFn = useServerFn(createVisaRequest);

  const [rows, setRows] = useState<VisaAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      setRows((await listFn()) as VisaAdminRow[]);
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

  const linkDe = (token: string) => `${publicOrigin()}/visto-americano/${token}`;

  async function novo() {
    setCreating(true);
    try {
      const r = (await createFn({
        data: { nome: nome || null, telefone: telefone || null },
      })) as VisaAdminRow;
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 overflow-x-hidden p-4 sm:p-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Visto americano</h1>
          <p className="text-sm text-muted-foreground">
            Gere o link do formulário de apoio ao DS-160 e acompanhe o preenchimento. O pagamento é
            lançado depois, na geração do pedido.
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </header>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Novo link público</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="min-w-0">
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Nome do cliente (opcional)
            </Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label className="mb-1.5 block text-xs text-muted-foreground">WhatsApp (opcional)</Label>
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void novo()} disabled={creating} className="w-full">
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Gerar link
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Sem cobrança nesta etapa — o pagamento entra somente quando o pedido for gerado.
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
          rows.map((r) => <CardVisto key={r.id} row={r} link={linkDe(r.token)} />)
        )}
      </section>
    </div>
  );
}

function CardVisto({ row, link }: { row: VisaAdminRow; link: string }) {
  const updateFn = useServerFn(updateVisaRequest);
  const [aberto, setAberto] = useState(false);
  const [notas, setNotas] = useState(row.notes ?? "");

  const grupos = useMemo(() => agruparCampos(row.formData), [row.formData]);
  const preenchidos = grupos.reduce((acc, g) => acc + g.entradas.length, 0);

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{row.applicantName ?? "Sem nome"}</div>
          <div className="truncate text-xs text-muted-foreground">
            Protocolo VIA AIR {row.protocolo} · {new Date(row.createdAt).toLocaleString("pt-BR")}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {STATUS_LABEL[row.status] ?? row.status}
        </span>
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
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-primary underline"
        >
          Abrir
        </a>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Observações internas</Label>
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Anotações da equipe"
          />
        </div>
        <div className="flex items-end">
          <Button
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  await updateFn({ data: { id: row.id, notes: notas } });
                  toast.success("Observações salvas.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
                }
              })();
            }}
          >
            Salvar
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
          {aberto ? "Ocultar dados do formulário" : `Ver dados do formulário (${preenchidos})`}
        </button>

        {aberto && (
          <div className="mt-3 space-y-3">
            {grupos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ainda não preenchido pelo cliente.</p>
            ) : (
              grupos.map((g) => (
                <BlocoCampos key={g.titulo} titulo={g.titulo} entradas={g.entradas} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Agrupa os campos do DS-160 por prefixo do nome do campo. */
function agruparCampos(formData: Record<string, any>) {
  const fields = (formData?.fields ?? {}) as Record<string, string>;
  const buckets = new Map<string, Array<[string, string]>>();

  for (const [key, valor] of Object.entries(fields)) {
    const v = String(valor ?? "").trim();
    if (!v) continue;
    const nome = key.split("#")[0] ?? key;
    const grupo = GRUPOS.find((g) => g.prefixos.some((p) => nome.startsWith(p)));
    const titulo = grupo?.titulo ?? "Outras informações";
    const lista = buckets.get(titulo) ?? [];
    lista.push([humanizar(nome), v]);
    buckets.set(titulo, lista);
  }

  return [...buckets.entries()].map(([titulo, entradas]) => ({ titulo, entradas }));
}

const GRUPOS: Array<{ titulo: string; prefixos: string[] }> = [
  {
    titulo: "Dados pessoais",
    prefixos: ["nome", "outro_nome", "data_nascimento", "cpf", "nascimento", "estado_civil", "nacionalidade", "sexo"],
  },
  {
    titulo: "Contato e endereço",
    prefixos: ["endereco", "bairro", "cidade", "cep", "celular", "telefone", "email", "outros_"],
  },
  { titulo: "Redes sociais", prefixos: ["facebook", "instagram", "twitter", "outra_rede"] },
  { titulo: "Passaporte", prefixos: ["passaporte"] },
  { titulo: "Viagem", prefixos: ["viagem", "voo", "chegada", "hospedagem", "acompanhante", "pagador", "payer"] },
  { titulo: "Trabalho e educação", prefixos: ["trabalho", "empresa", "cargo", "salario", "escola", "educacao", "curso", "formacao"] },
  { titulo: "Família", prefixos: ["pai", "mae", "conjuge", "familiar", "parente"] },
  { titulo: "Vistos e viagens anteriores", prefixos: ["visto", "eua", "us_", "viagens"] },
  { titulo: "Segurança", prefixos: ["seguranca", "security"] },
];
