import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search, Loader2, User, Phone, Fingerprint, AlertTriangle,
} from "lucide-react";
import { consultarAntifraude, type AntifraudeResultado, type AntifraudeConversa } from "@/lib/antifraude.functions";
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

function nivelRisco(score: number | null, nivel: string | null) {
  const n = (nivel ?? "").toUpperCase();
  if (n.includes("CRIT") || n.includes("ALTO") || n.includes("HIGH") || (score ?? 0) >= 70)
    return { label: n || "ALTO", cor: "text-red-500", barra: "stroke-red-500", selo: "bg-red-500/10 text-red-400 border-red-500/20" };
  if (n.includes("MOD") || n.includes("MED") || n.includes("ATEN") || (score ?? 0) >= 40)
    return { label: n || "MODERADO", cor: "text-amber-500", barra: "stroke-amber-500", selo: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  return { label: n || "BAIXO", cor: "text-emerald-500", barra: "stroke-emerald-500", selo: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
}

function AntifraudePage() {
  const [tipo, setTipo] = useState<Tipo>("cpf");
  const [valor, setValor] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<AntifraudeResultado | null>(null);
  const consultar = useServerFn(consultarAntifraude);

  const tipoAtual = TIPOS.find((t) => t.id === tipo)!;
  const piorConversa = resultado?.conversas.reduce<AntifraudeConversa | null>(
    (acc, c) => (!acc || (c.riskScore ?? 0) > (acc.riskScore ?? 0) ? c : acc),
    null,
  ) ?? null;
  const risco = piorConversa ? nivelRisco(piorConversa.riskScore, piorConversa.riskLevel) : null;
  const score = piorConversa?.riskScore ?? 0;
  const dashOffset = 301 - (301 * Math.min(score, 100)) / 100;

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
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <span className="w-2 h-8 bg-brand-orange rounded-full" />
            Verificação Antifraude
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Painel de Auditoria Interna VIA AIR</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-brand-orange bg-brand-orange/10 px-3 py-1.5 rounded-full border border-brand-orange/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-orange" />
          </span>
          SISTEMA ATIVO
        </div>
      </div>

      {/* Busca */}
      <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[260px]">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
              Parâmetro de Busca
            </label>
            <div className="flex bg-background rounded-lg p-1 border border-border/60">
              {TIPOS.map((t) => {
                const Icon = t.icon;
                const ativo = tipo === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTipo(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      ativo ? "bg-brand-orange text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex-[2] min-w-[260px] relative">
            <input
              type="text"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder={tipoAtual.placeholder}
              className="w-full bg-background border border-border/60 rounded-lg py-3 px-4 text-foreground focus:outline-none focus:border-brand-orange transition-all placeholder:text-muted-foreground/50"
            />
            <div className="absolute right-3 top-3.5 text-muted-foreground/60 italic text-xs">Enter ↵</div>
          </div>
          <button
            onClick={buscar}
            disabled={carregando}
            className="flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-60 text-white font-bold py-3 px-8 rounded-lg transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(242,107,31,0.2)]"
          >
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            VERIFICAR
          </button>
        </div>
      </div>

      {/* Resultados */}
      {resultado && (resultado.pessoas.length > 0 || resultado.conversas.length > 0 || resultado.pedidos.length > 0) && (
        <div className="grid grid-cols-12 gap-6">
          {/* Coluna esquerda */}
          <div className="col-span-12 lg:col-span-7 space-y-6">
            {resultado.pessoas.map((p) => (
              <div key={p.id} className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 bg-muted/40 border-b border-border/40 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Dados Cadastrais Identificados</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${risco ? risco.selo : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"}`}>
                    {risco ? `RISCO ${risco.label}` : "SEM ALERTAS"}
                  </span>
                </div>
                <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-8">
                  <Campo label="Nome Completo" valor={p.nome} />
                  <Campo label="Documento Principal" valor={p.cpf} mono />
                  <Campo label="Data de Nascimento" valor={p.nascimento ? new Date(p.nascimento + "T12:00:00").toLocaleDateString("pt-BR") : null} />
                  <Campo label="Nome da Mãe" valor={p.mae} />
                  <Campo label="Celular" valor={p.celular ?? p.telefone} />
                  <Campo label="E-mail" valor={p.email} />
                  <div className="col-span-2 pt-4 border-t border-border/40">
                    <Campo
                      label="Endereço Vinculado"
                      valor={[p.endereco, [p.cidade, p.uf].filter(Boolean).join("/"), p.cep].filter(Boolean).join(" — ") || null}
                      italic
                    />
                  </div>
                </div>
              </div>
            ))}

            {resultado.pedidos.length > 0 && (
              <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 bg-muted/40 border-b border-border/40">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Histórico de Pedidos ({resultado.pedidos.length})
                  </h3>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/40">
                      <th className="px-6 py-3 font-bold">Pedido</th>
                      <th className="px-6 py-3 font-bold">Data</th>
                      <th className="px-6 py-3 font-bold text-right">Valor</th>
                      <th className="px-6 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {resultado.pedidos.map((o) => (
                      <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 text-sm font-mono text-brand-orange">{o.numero ?? o.id.slice(0, 8)}</td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {new Date(o.criadoEm).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground font-semibold text-right">
                          {o.total != null ? formatBRL(o.total) : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded uppercase">
                            {o.status ?? "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Coluna direita */}
          <div className="col-span-12 lg:col-span-5 space-y-6">
            {piorConversa && risco && (
              <div className="bg-card border border-border/60 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-[60px] rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-6">Risco Comportamental</h3>
                <div className="flex items-center gap-6">
                  <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="56" cy="56" r="48" strokeWidth="8" fill="transparent" className="stroke-border/40" />
                      <circle
                        cx="56" cy="56" r="48" strokeWidth="8" fill="transparent"
                        strokeDasharray="301" strokeDashoffset={dashOffset} strokeLinecap="round"
                        className={risco.barra}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-foreground">{score}</span>
                      <span className={`text-[10px] font-bold uppercase ${risco.cor}`}>{risco.label}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Conversas analisadas</span>
                      <span className="text-foreground font-medium">{resultado.conversas.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Pedidos vinculados</span>
                      <span className="text-foreground font-medium">{resultado.pedidos.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Transferência p/ humano</span>
                      <span className={piorConversa.transferedToHuman ? "text-red-400" : "text-emerald-400"}>
                        {piorConversa.transferedToHuman ? "Sim" : "Não"}
                      </span>
                    </div>
                  </div>
                </div>
                {piorConversa.transferedToHuman && (
                  <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300 leading-relaxed">
                      Esta conversa foi sinalizada pelo motor antifraude e transferida para atendimento humano.
                    </p>
                  </div>
                )}
              </div>
            )}

            {resultado.conversas.length > 0 && (
              <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 bg-muted/40 border-b border-border/40 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Conversas WhatsApp</h3>
                </div>
                <div className="p-4 space-y-3">
                  {resultado.conversas.map((c) => {
                    const rc = nivelRisco(c.riskScore, c.riskLevel);
                    return (
                      <div key={c.conversationId} className="bg-background/60 border border-border/40 rounded-xl p-3">
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="text-[10px] font-mono text-emerald-400">{c.telefone}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {c.ultimaMensagemEm ? new Date(c.ultimaMensagemEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-foreground font-medium truncate">{c.nome ?? "Sem nome"}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${rc.selo}`}>
                            {rc.label} · {c.riskScore ?? 0}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link
                  to="/chat"
                  className="block w-full py-3 text-center text-[10px] font-bold tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border-t border-border/40"
                >
                  ABRIR CHAT COMPLETO
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor, mono, italic }: { label: string; valor: string | null; mono?: boolean; italic?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground font-bold mb-1">{label}</p>
      <p className={`text-sm font-medium text-foreground ${mono ? "font-mono" : ""} ${italic ? "italic text-muted-foreground" : ""}`}>
        {valor || "—"}
      </p>
    </div>
  );
}
