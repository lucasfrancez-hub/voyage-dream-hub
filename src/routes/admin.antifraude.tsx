import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck, Search, Loader2, User, Phone, FileText, AlertTriangle,
  MessageSquareWarning, ShoppingBag, Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { consultarAntifraude, type AntifraudeResultado } from "@/lib/antifraude.functions";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/admin/antifraude")({
  component: AntifraudePage,
  head: () => ({
    meta: [
      { title: "Antifraude — Verificação | VIA AIR" },
      { name: "description", content: "Central de verificação antifraude: consulta por CPF, telefone ou nome nos dados internos da VIA AIR." },
      { property: "og:title", content: "Antifraude — Verificação | VIA AIR" },
      { property: "og:description", content: "Central de verificação antifraude da VIA AIR." },
    ],
  }),
});

type Tipo = "cpf" | "telefone" | "nome";

const TIPOS: { id: Tipo; label: string; icon: typeof User; placeholder: string }[] = [
  { id: "cpf", label: "CPF / CNPJ", icon: Fingerprint, placeholder: "000.000.000-00" },
  { id: "telefone", label: "Telefone", icon: Phone, placeholder: "(44) 99999-0000" },
  { id: "nome", label: "Nome", icon: User, placeholder: "Nome completo ou parte" },
];

function nivelRisco(nivel: string | null | undefined) {
  const n = (nivel ?? "").toUpperCase();
  if (n.includes("CRIT") || n.includes("ALTO") || n.includes("HIGH"))
    return { label: nivel ?? "Alto", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (n.includes("MOD") || n.includes("MED"))
    return { label: nivel ?? "Moderado", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { label: nivel ?? "Baixo", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
}

function AntifraudePage() {
  const [tipo, setTipo] = useState<Tipo>("cpf");
  const [valor, setValor] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<AntifraudeResultado | null>(null);
  const consultar = useServerFn(consultarAntifraude);

  const tipoAtual = TIPOS.find((t) => t.id === tipo)!;

  async function buscar() {
    if (valor.trim().length < 3) {
      toast.error("Informe ao menos 3 caracteres");
      return;
    }
    setCarregando(true);
    try {
      const r = await consultar({ data: { tipo, valor: valor.trim() } });
      setResultado(r);
      if (!r.pessoas.length && !r.pedidos.length && !r.conversas.length) {
        toast.info("Nenhum registro encontrado na base interna");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na consulta");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-brand-orange/15">
          <ShieldCheck className="h-6 w-6 text-brand-orange" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Verificação Antifraude</h1>
          <p className="text-sm text-muted-foreground">
            Consulte CPF, telefone ou nome na base interna: cadastro, pedidos e score comportamental.
          </p>
        </div>
      </div>

      {/* Seletor de tipo + busca */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex gap-2">
          {TIPOS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTipo(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  tipo === t.id
                    ? "bg-brand-orange/15 border-brand-orange/40 text-brand-orange"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder={tipoAtual.placeholder}
            className="flex-1"
          />
          <Button onClick={buscar} disabled={carregando}>
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Verificar
          </Button>
        </div>
      </div>

      {resultado && (
        <div className="space-y-4">
          {/* Pessoas */}
          {resultado.pessoas.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-brand-orange" />
                <h2 className="font-semibold">{p.nome}</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <Campo label="CPF" valor={p.cpf} />
                <Campo label="RG" valor={p.rg} />
                <Campo label="Nascimento" valor={p.nascimento} />
                <Campo label="Mãe" valor={p.mae} />
                <Campo label="E-mail" valor={p.email} />
                <Campo label="Celular" valor={p.celular ?? p.telefone} />
                <Campo label="Endereço" valor={p.endereco} />
                <Campo label="Cidade/UF" valor={[p.cidade, p.uf].filter(Boolean).join("/") || null} />
                <Campo label="CEP" valor={p.cep} />
              </div>
            </div>
          ))}

          {/* Conversas / score */}
          {resultado.conversas.length > 0 && (
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-brand-orange" />
                <h2 className="font-semibold">Conversas WhatsApp — score comportamental</h2>
              </div>
              <div className="space-y-2">
                {resultado.conversas.map((c) => {
                  const risco = nivelRisco(c.riskLevel);
                  return (
                    <div key={c.conversationId} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                      <div>
                        <p className="font-medium">{c.nome ?? "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground">{c.telefone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.transferedToHuman && (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5" /> Transferido
                          </span>
                        )}
                        <span className={`px-2 py-1 rounded-md border text-xs font-bold ${risco.cls}`}>
                          {risco.label} · {c.riskScore ?? 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pedidos */}
          {resultado.pedidos.length > 0 && (
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-brand-orange" />
                <h2 className="font-semibold">Pedidos ({resultado.pedidos.length})</h2>
              </div>
              <div className="space-y-2">
                {resultado.pedidos.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                    <div>
                      <p className="font-medium flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {o.numero ?? o.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">{o.status ?? "—"}</p>
                    </div>
                    <p className="font-semibold">{o.total != null ? formatBRL(o.total) : "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium">{valor || "—"}</p>
    </div>
  );
}
