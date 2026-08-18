/**
 * Turbinar publicação do Instagram — modal de criação + painel de desempenho.
 * Toda a complexidade da Meta (campanha, conjunto, criativo, anúncio) fica no
 * servidor; aqui é só objetivo, investimento, duração e público.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Rocket,
  Loader2,
  MessageCircle,
  Globe,
  Heart,
  Instagram,
  AlertTriangle,
  RefreshCw,
  Pause,
  Play,
  TrendingUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import {
  contaDeAnuncios,
  turbinarPublicacao,
  pausarOuRetomarBoost,
  aumentarOrcamentoBoost,
  sincronizarBoost,
} from "@/lib/ads/boosts.functions";

export type Boost = {
  id: string;
  ig_media_id: string;
  objetivo: string;
  budget_type: string;
  budget_amount: number;
  total_budget: number;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: string;
  meta_error: string | null;
  insights: Record<string, number> | null;
  last_synced_at: string | null;
  ig_caption: string | null;
};

export const OBJETIVOS = [
  { id: "whatsapp", nome: "Receber mensagens no WhatsApp", icone: MessageCircle, sugerido: true },
  { id: "site", nome: "Levar pessoas para o site", icone: Globe, sugerido: false },
  { id: "engajamento", nome: "Gerar engajamento", icone: Heart, sugerido: false },
  { id: "perfil", nome: "Levar pessoas ao perfil", icone: Instagram, sugerido: false },
] as const;

export const ROTULO_RESULTADO: Record<string, string> = {
  whatsapp: "conversas iniciadas",
  site: "cliques no link",
  engajamento: "interações",
  perfil: "visitas ao perfil",
};

export const STATUS_INFO: Record<string, { nome: string; cor: string; bolinha: string }> = {
  criando: { nome: "Criando", cor: "text-muted-foreground", bolinha: "⚪" },
  em_analise: { nome: "Em análise pela Meta", cor: "text-amber-600", bolinha: "🟡" },
  ativo: { nome: "Ativo", cor: "text-emerald-600", bolinha: "🟢" },
  pausado: { nome: "Pausado", cor: "text-slate-500", bolinha: "⏸️" },
  finalizado: { nome: "Finalizado", cor: "text-sky-600", bolinha: "🔵" },
  erro: { nome: "Erro / Reprovado", cor: "text-destructive", bolinha: "🔴" },
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR");
const dataBr = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR");

// ============================ MODAL DE CRIAÇÃO ============================

export function TurbinarDialog({
  aberto,
  onOpenChange,
  publicacao,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  publicacao: {
    ig_media_id: string;
    ig_user_id?: string | null;
    caption?: string | null;
    permalink?: string | null;
    thumbnail?: string | null;
  };
}) {
  const qc = useQueryClient();
  const fetchConta = useServerFn(contaDeAnuncios);
  const criar = useServerFn(turbinarPublicacao);

  const [etapa, setEtapa] = useState<"form" | "confirmar">("form");
  const [objetivo, setObjetivo] = useState<string>("whatsapp");
  const [tipoOrcamento, setTipoOrcamento] = useState<"daily" | "lifetime">("daily");
  const [valor, setValor] = useState(50);
  const [dias, setDias] = useState(7);
  const [linkSite, setLinkSite] = useState("");
  const [modoPublico, setModoPublico] = useState<"auto" | "custom">("auto");
  const [estado, setEstado] = useState("");
  const [cidade, setCidade] = useState("");
  const [idadeMin, setIdadeMin] = useState(18);
  const [idadeMax, setIdadeMax] = useState(65);
  const [sexo, setSexo] = useState<"todos" | "feminino" | "masculino">("todos");

  const { data: conta } = useQuery({
    queryKey: ["meta-ad-account"],
    queryFn: () => fetchConta(),
    enabled: aberto,
    staleTime: 10 * 60_000,
  });

  const total = tipoOrcamento === "daily" ? valor * dias : valor;
  const inicio = new Date();
  const fim = new Date(inicio.getTime() + (dias - 1) * 86_400_000);

  const mutation = useMutation({
    mutationFn: () =>
      criar({
        data: {
          ig_media_id: publicacao.ig_media_id,
          ig_user_id: publicacao.ig_user_id ?? null,
          ig_permalink: publicacao.permalink ?? null,
          ig_caption: publicacao.caption ?? null,
          ig_thumbnail: publicacao.thumbnail ?? null,
          objetivo: objetivo as "whatsapp",
          budget_type: tipoOrcamento,
          budget_amount: valor,
          duration_days: dias,
          link_site: objetivo === "site" && linkSite ? linkSite : null,
          publico: {
            modo: modoPublico,
            pais: "BR",
            estados: estado ? [estado] : [],
            cidades: cidade ? [cidade] : [],
            idade_min: idadeMin,
            idade_max: idadeMax,
            sexo,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Publicação enviada para a Meta! Em análise, já já entra no ar.");
      qc.invalidateQueries({ queryKey: ["meta-boosts"] });
      onOpenChange(false);
      setEtapa("form");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => { onOpenChange(v); if (!v) setEtapa("form"); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-[#F26B1F]" />
            {etapa === "form" ? "Turbinar publicação" : "Confirmar impulsionamento"}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {publicacao.caption || "Publicação do Instagram"}
          </DialogDescription>
        </DialogHeader>

        {etapa === "form" ? (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Objetivo</h3>
              <div className="grid gap-2">
                {OBJETIVOS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setObjetivo(o.id)}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                      objetivo === o.id
                        ? "border-[#F26B1F] bg-orange-50 dark:bg-orange-950/20"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <o.icone className="h-4 w-4 text-[#F26B1F]" />
                    <span className="flex-1">{o.nome}</span>
                    {o.sugerido && (
                      <span className="rounded-full bg-[#F26B1F] px-2 py-0.5 text-[10px] font-semibold text-white">
                        Sugerido
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {objetivo === "site" && (
                <input
                  value={linkSite}
                  onChange={(e) => setLinkSite(e.target.value)}
                  placeholder="https://viaair.tur.br/pacotes"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Investimento</h3>
              <div className="flex gap-2">
                {(["daily", "lifetime"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTipoOrcamento(t)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      tipoOrcamento === t
                        ? "bg-[#F26B1F] text-white"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {t === "daily" ? "Orçamento diário" : "Orçamento total"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">R$</span>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={valor}
                  onChange={(e) => setValor(Math.max(5, Number(e.target.value) || 0))}
                  className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="text-sm text-muted-foreground">
                  {tipoOrcamento === "daily" ? "por dia" : "no total"}
                </span>
              </div>

              <h3 className="pt-2 text-sm font-semibold">Duração</h3>
              <div className="flex flex-wrap gap-2">
                {[3, 5, 7, 15].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDias(d)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      dias === d ? "bg-slate-900 text-white" : "border border-border text-muted-foreground"
                    }`}
                  >
                    {d} dias
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={dias}
                  onChange={(e) => setDias(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  aria-label="Duração personalizada em dias"
                />
              </div>
              <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
                {tipoOrcamento === "daily" ? `${brl(valor)}/dia × ${dias} dias` : `${brl(valor)} no total`} ·
                Investimento máximo: <strong>{brl(total)}</strong>
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Público</h3>
              <div className="flex gap-2">
                {(["auto", "custom"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModoPublico(m)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      modoPublico === m
                        ? "bg-slate-900 text-white"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {m === "auto" ? "Recomendado pela Meta" : "Personalizado"}
                  </button>
                ))}
              </div>
              {modoPublico === "custom" && (
                <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
                  <input
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    placeholder="Estado (ex.: Paraná)"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="Cidade (ex.: Paranavaí)"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  <label className="text-xs text-muted-foreground">
                    Idade mínima
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={idadeMin}
                      onChange={(e) => setIdadeMin(Number(e.target.value) || 18)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Idade máxima
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={idadeMax}
                      onChange={(e) => setIdadeMax(Number(e.target.value) || 65)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <div className="sm:col-span-2 flex gap-2">
                    {(["todos", "feminino", "masculino"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSexo(s)}
                        className={`rounded-full px-3 py-1 text-xs capitalize ${
                          sexo === s ? "bg-[#F26B1F] text-white" : "border border-border text-muted-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Posicionamentos automáticos, recomendados pela Meta.
              </p>
            </section>

            <section className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="font-semibold text-foreground">Cobrança</div>
              {conta?.ok ? (
                <>
                  <div className="text-muted-foreground">Conta de anúncios Meta: {conta.nome}</div>
                  <div className="text-muted-foreground">Pagamento: configurado na Meta</div>
                  {conta.aviso && (
                    <div className="mt-1 flex items-start gap-1 text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3" /> {conta.aviso}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-destructive">{conta?.erro ?? "Verificando conta de anúncios…"}</div>
              )}
            </section>

            <DialogFooter>
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => setEtapa("confirmar")}
                className="inline-flex items-center gap-2 rounded-md bg-[#F26B1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                Continuar
              </button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <Linha rotulo="Publicação" valor={publicacao.caption?.slice(0, 80) || "Publicação do Instagram"} />
            <Linha rotulo="Objetivo" valor={OBJETIVOS.find((o) => o.id === objetivo)!.nome} />
            <Linha
              rotulo="Público"
              valor={
                modoPublico === "auto"
                  ? "Recomendado pela Meta (Brasil)"
                  : [cidade, estado, "Brasil"].filter(Boolean).join(" · ")
              }
            />
            <Linha
              rotulo="Orçamento"
              valor={tipoOrcamento === "daily" ? `${brl(valor)}/dia` : `${brl(valor)} no total`}
            />
            <Linha rotulo="Duração" valor={`${dias} dias`} />
            <Linha rotulo="Período" valor={`${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`} />
            <Linha rotulo="Investimento máximo" valor={brl(total)} destaque />

            <DialogFooter>
              <button
                onClick={() => setEtapa("form")}
                disabled={mutation.isPending}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Voltar
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-[#F26B1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Turbinar agora
              </button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className={`text-right ${destaque ? "text-base font-semibold text-[#F26B1F]" : "font-medium"}`}>
        {valor}
      </span>
    </div>
  );
}

// ============================ DETALHES / DESEMPENHO ============================

export function DesempenhoDialog({
  boost,
  historico,
  onOpenChange,
}: {
  boost: Boost | null;
  historico: Boost[];
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const sincronizar = useServerFn(sincronizarBoost);
  const alternar = useServerFn(pausarOuRetomarBoost);
  const aumentar = useServerFn(aumentarOrcamentoBoost);
  const [novoValor, setNovoValor] = useState<number | "">("");

  const atualizar = useMutation({
    mutationFn: () => sincronizar({ data: { id: boost!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-boosts"] });
      toast.success("Dados atualizados.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarStatus = useMutation({
    mutationFn: (ativo: boolean) => alternar({ data: { id: boost!.id, ativo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-boosts"] });
      toast.success("Status do anúncio atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarOrcamento = useMutation({
    mutationFn: (v: number) => aumentar({ data: { id: boost!.id, novo_valor: v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-boosts"] });
      setNovoValor("");
      toast.success("Orçamento atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!boost) return null;
  const i = boost.insights ?? {};
  const gasto = i.spend ?? 0;
  const resultados = i.results ?? 0;
  const info = STATUS_INFO[boost.status] ?? STATUS_INFO.criando;
  const pausado = boost.status === "pausado";

  return (
    <Dialog open={!!boost} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#F26B1F]" /> Desempenho do anúncio
          </DialogTitle>
          <DialogDescription className="line-clamp-2">{boost.ig_caption || "Publicação"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className={`text-sm font-semibold ${info.cor}`}>
            {info.bolinha} {info.nome}
          </div>
          {boost.meta_error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <strong>Motivo:</strong> {boost.meta_error}
            </p>
          )}

          <div className="text-xs text-muted-foreground">
            Início: {dataBr(boost.start_date)} · Término: {dataBr(boost.end_date)}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metrica rotulo="Orçamento" valor={brl(Number(boost.total_budget))} />
            <Metrica rotulo="Gasto" valor={brl(gasto)} />
            <Metrica rotulo="Saldo previsto" valor={brl(Math.max(0, Number(boost.total_budget) - gasto))} />
            <Metrica rotulo="Alcance" valor={num(i.reach)} />
            <Metrica rotulo="Impressões" valor={num(i.impressions)} />
            <Metrica rotulo="Cliques" valor={num(i.clicks)} />
            <Metrica
              rotulo={ROTULO_RESULTADO[boost.objetivo] ?? "Resultados"}
              valor={num(resultados)}
            />
            <Metrica
              rotulo="Custo por resultado"
              valor={resultados > 0 ? brl(gasto / resultados) : "—"}
            />
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="text-xs font-semibold text-foreground">Aumentar orçamento</div>
            <div className="text-xs text-muted-foreground">
              Atual: {brl(Number(boost.budget_amount))}
              {boost.budget_type === "daily" ? "/dia" : " no total"}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={5}
                value={novoValor}
                onChange={(e) => setNovoValor(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Novo valor"
                className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button
                disabled={!novoValor || salvarOrcamento.isPending}
                onClick={async () => {
                  const v = Number(novoValor);
                  const ok = await confirm({
                    title: "Confirmar novo orçamento",
                    description: `O investimento passa para ${brl(v)}${boost.budget_type === "daily" ? " por dia" : " no total"}.`,
                    confirmText: "Salvar",
                  });
                  if (ok) salvarOrcamento.mutate(v);
                }}
                className="rounded-md bg-[#F26B1F] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>

          {historico.length > 1 && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-semibold text-foreground">Histórico de impulsionamentos</div>
              <div className="space-y-1">
                {historico.map((h, idx) => (
                  <div key={h.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Campanha {String(historico.length - idx).padStart(2, "0")} · {dataBr(h.start_date)}–
                      {dataBr(h.end_date)}
                    </span>
                    <span>
                      {brl(Number(h.total_budget))} · {num(h.insights?.results)}{" "}
                      {ROTULO_RESULTADO[h.objetivo] ?? "resultados"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Última atualização:{" "}
            {boost.last_synced_at
              ? new Date(boost.last_synced_at).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "ainda não sincronizado"}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => atualizar.mutate()}
            disabled={atualizar.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {atualizar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar dados
          </button>
          {boost.status !== "finalizado" && (
            <button
              onClick={() => alternarStatus.mutate(pausado)}
              disabled={alternarStatus.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pausado ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {pausado ? "Retomar anúncio" : "Pausar anúncio"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="text-sm font-semibold text-foreground">{valor}</div>
    </div>
  );
}
