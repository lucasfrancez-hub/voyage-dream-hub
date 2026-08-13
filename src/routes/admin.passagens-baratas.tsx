/**
 * Passagens aéreas baratas — navegação igual à do Melhores Destinos:
 * região → país → destino → origem → datas, tudo automático e com o link
 * do nosso motor (Comprar Viagem) no lugar do parceiro.
 */
import { abrirLinkExterno } from "@/lib/md-trail";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Backpack,
  BookmarkPlus,
  Check,
  Briefcase,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Luggage,
  Plane,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { explorarPassagensMdPublic as explorarPassagensMd, buscarOrigensMdPublic as buscarOrigensMd } from "@/lib/melhores-destinos.public.functions";
import { nomeCompanhia } from "@/lib/melhores-destinos.parse";
import { imagemRegiao } from "@/lib/regiao-imagens";
import { salvarOportunidadePassagensBaratas } from "@/lib/airfare-promos.functions";
import { enqueuePublish } from "@/lib/publish-queue";


export const Route = createFileRoute("/admin/passagens-baratas")({
  component: PassagensBaratasPage,
});

function PassagensBaratasPage() {
  return <PassagensBaratasExplorer admin />;
}

/**
 * Curadoria manual: envia a oportunidade para o motor VIA AIR e só grava a
 * promoção se o motor devolver tarifa. O preço do Passagens Baratas é apenas
 * referência. Existe somente na ferramenta administrativa.
 */
function SalvarPromocaoButton({
  origem,
  destino,
  ida,
  volta,
  referencia,
}: {
  origem: string;
  destino: string;
  ida: string;
  volta: string | null;
  referencia: number | null;
}) {
  const salvar = useServerFn(salvarOportunidadePassagensBaratas);
  const [estado, setEstado] = useState<"idle" | "queued">("idle");

  // Não prende a tela: a cotação no motor roda na Fila, em segundo plano.
  const onClick = () => {
    if (estado !== "idle") return;
    setEstado("queued");
    enqueuePublish({
      label: `Salvar promoção ${origem} → ${destino}`,
      channel: "promocao",
      detail: "Cotando no motor VIA AIR…",
      run: async () => {
        const r = await salvar({
          data: {
            origin: origem,
            destination: destino,
            departureDate: ida,
            returnDate: volta,
            referencePrice: referencia ?? null,
          },
        });
        if (!r.ok) {
          toast.error(`Tarifa não encontrada no motor VIA AIR: ${origem} → ${destino}`);
          throw new Error("Tarifa não encontrada no motor VIA AIR");
        }
        const dif =
          r.difference != null
            ? ` (referência ${brl(r.referencePrice ?? 0)} · ${r.difference >= 0 ? "+" : ""}${brl(r.difference)})`
            : "";
        toast.success(
          `${r.created ? "Promoção salva" : "Promoção existente atualizada"}: ${r.originCity} → ${r.destinationCity} • ${brl(r.totalPrice)}${dif}`,
        );
        if (r.unresolvedCities.length) {
          toast.warning(
            `Cidade não reconhecida para ${r.unresolvedCities.join(", ")} — confira o nome antes de divulgar.`,
          );
        }
        return `${r.originCity} → ${r.destinationCity} • ${brl(r.totalPrice)}`;
      },
    });
    toast.info("Enviado para a Fila — pode continuar navegando.");
  };

  if (estado === "queued") {
    return (
      <Button size="sm" variant="outline" disabled className="text-emerald-600">
        <Check className="mr-1 h-3.5 w-3.5" /> Na fila
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Salvar
    </Button>
  );
}

export type MdStep = Step;
export type MdFiltro = { iata: string | null; label: string; month: string };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

type Step = {
  label: string;
  baseLabel?: string;
  categoryId?: number;
  toIata?: string;
  fromIata?: string;
  month?: string;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-xl border bg-background px-3 py-2 focus-within:border-primary">
      <span className="block text-[9px] font-black uppercase tracking-widest text-primary">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Blocos de bagagem (item pessoal / mão / despachada) no estilo do comparador. */
function BaggageBlocks({ label }: { label: string | null }) {
  const t = (label ?? "").toLowerCase();
  const despachada = /despach|checked|23kg|bagagem inclu/.test(t);
  const mao = despachada || /mão|mao|carry|hand|10kg/.test(t);
  const pessoal = true;
  const itens: { icon: typeof Briefcase; on: boolean; title: string }[] = [
    { icon: Backpack, on: pessoal, title: "Item pessoal" },
    { icon: Briefcase, on: mao, title: "Bagagem de mão" },
    { icon: Luggage, on: despachada, title: "Bagagem despachada" },
  ];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-1">
        {itens.map(({ icon: Icon, on, title }) => (
          <span
            key={title}
            title={title}
            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
              on
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 bg-muted/40 text-muted-foreground/40"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
      </div>
      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        {despachada ? "Com despachada" : mao ? "Bagagem de mão" : "Item pessoal"}
      </span>
    </div>
  );
}

/** Que tipo de conteúdo o próximo passo vai mostrar (para o texto e o esqueleto certos). */
type StageKind = "categories" | "cities" | "routes" | "fares";

function stageKindOf(step: Step): StageKind {
  if (step.fromIata && step.toIata) return "fares";
  if (step.toIata) return "routes";
  if (step.categoryId) return "cities";
  return "categories";
}

/** Mensagem real da etapa — nunca um "carregando..." genérico. */
function stageMessage(step: Step): { titulo: string; sub: string } {
  const nome = step.baseLabel ?? step.label;
  switch (stageKindOf(step)) {
    case "cities":
      return {
        titulo: `Verificando o histórico das últimas 24 horas em ${nome}...`,
        sub: "Reunindo os destinos com melhor preço registrado",
      };
    case "routes":
      return {
        titulo: `Verificando o histórico das últimas 24 horas para ${nome}...`,
        sub: "Comparando as origens com melhor preço registrado",
      };
    case "fares":
      return {
        titulo: `Verificando o histórico das últimas 24 horas: ${nome}...`,
        sub: "Reunindo preços, datas e companhias registrados",
      };
    default:
      return {
        titulo: "Verificando o histórico das últimas 24 horas...",
        sub: "Reunindo os destinos mais econômicos do período",
      };
  }
}

const Bloco = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-xl bg-muted/50 ${className}`} />
);

/** Esqueleto com o formato do conteúdo que vai aparecer (a página não "pula"). */
function StageSkeleton({ kind }: { kind: StageKind }) {
  if (kind === "categories") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card p-4">
            <Bloco className="h-24 w-24 shrink-0" />
            <div className="flex-1 space-y-2">
              <Bloco className="h-4 w-1/2" />
              <Bloco className="h-3 w-3/4" />
            </div>
            <Bloco className="h-7 w-20 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "cities" || kind === "routes") {
    return (
      <Card className="overflow-hidden border-white/5 shadow-2xl">
        <div className="flex items-center justify-between bg-primary px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-primary-foreground">
          <span>{kind === "routes" ? "Origem → Destino" : "Destino"}</span>
          <span className="text-right">Ida + volta a partir de</span>
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Bloco className="h-4 w-2/5" />
                <Bloco className="h-2.5 w-24" />
              </div>
              <Bloco className="h-6 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Bloco className="h-2.5 w-48" />
          <Bloco className="h-8 w-72" />
        </div>
        <Bloco className="h-20 w-56" />
      </div>
      <Card className="rounded-2xl p-6">
        <Bloco className="mb-7 h-3 w-40" />
        <div className="flex h-32 items-end justify-between gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Bloco key={i} className="w-full" />
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden rounded-2xl shadow-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b px-6 py-5">
            <Bloco className="h-9 w-9 shrink-0" />
            <Bloco className="h-4 flex-1" />
            <Bloco className="h-7 w-24 shrink-0" />
            <Bloco className="h-8 w-24 shrink-0" />
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Faixa de etapa: diz exatamente o que está sendo buscado agora. */
function StageBanner({
  titulo,
  sub,
  lento,
}: {
  titulo: string;
  sub: string;
  lento: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 rounded-2xl border-primary/20 bg-primary/[0.06] px-5 py-4">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">
          {lento ? "Ainda verificando o histórico das últimas 24 horas..." : titulo}
        </div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  );
}



/**
 * Explorador de passagens baratas. Pode ser usado solto (estado interno) ou
 * controlado por quem chama — é assim que a página pública guarda tudo na URL.
 */
export function PassagensBaratasExplorer({
  trail: trailProp,
  onTrailChange,
  filtro: filtroProp,
  onFiltroChange,
  className,
  linkVoos,
  hideTrail,
  linkPasso,
  admin,
}: {
  trail?: Step[];
  onTrailChange?: (t: Step[]) => void;
  filtro?: MdFiltro;
  onFiltroChange?: (f: MdFiltro) => void;
  className?: string;
  /** Monta o link de "Ver voos"/"Pesquisar" (padrão: motor Comprar Viagem). */
  linkVoos?: (p: { origem: string; destino: string; ida: string; volta: string }) => string;
  /** Esconde o passo a passo (usado no embed do WordPress). */
  hideTrail?: boolean;
  /**
   * Quando definido, cada avanço de passo abre esta URL (nova aba) em vez de
   * navegar dentro do próprio bloco — usado no embed do WordPress.
   */
  linkPasso?: (trail: Step[]) => string;
  /** Habilita as ações internas de curadoria (somente ambiente administrativo). */
  admin?: boolean;
} = {}) {

  const explorar = useServerFn(explorarPassagensMd);
  const buscarOrigens = useServerFn(buscarOrigensMd);
  const [trailState, setTrailState] = useState<Step[]>([{ label: "Passagens baratas" }]);
  const trail = trailProp ?? trailState;
  const setTrail = (updater: Step[] | ((t: Step[]) => Step[])) => {
    const next = typeof updater === "function" ? updater(trail) : updater;
    if (onTrailChange) onTrailChange(next);
    else setTrailState(next);
  };

  // Filtros globais (origem e mês), iguais aos do site de referência.
  const [filtroState, setFiltroState] = useState<MdFiltro>({
    iata: null,
    label: "",
    month: "",
  });
  const filtro = filtroProp ?? filtroState;
  const setFiltro = (updater: MdFiltro | ((f: MdFiltro) => MdFiltro)) => {
    const next = typeof updater === "function" ? updater(filtro) : updater;
    if (onFiltroChange) onFiltroChange(next);
    else setFiltroState(next);
  };
  const [buscaOrigem, setBuscaOrigem] = useState("");

  const sugestoes = useQuery({
    queryKey: ["md-origens", buscaOrigem],
    enabled: buscaOrigem.trim().length >= 2,
    queryFn: () => buscarOrigens({ data: { q: buscaOrigem.trim() } }),
    staleTime: 10 * 60 * 1000,
  });

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";
  const current = trail[trail.length - 1];

  const paramsDe = (step: Step) => ({
    base: origin,
    ...(step.categoryId ? { categoryId: step.categoryId } : {}),
    ...(step.toIata ? { toIata: step.toIata } : {}),
    ...(step.fromIata ? { fromIata: step.fromIata } : {}),
    ...(filtro.iata ? { originIata: filtro.iata } : {}),
    ...(step.month || filtro.month ? { month: step.month || filtro.month } : {}),
  });

  const q = useQuery({
    queryKey: ["md-explorar", current, filtro.iata, filtro.month],
    queryFn: () => explorar({ data: paramsDe(current) }),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    retry: 5,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 8000),
    // Se ainda assim falhar, continua tentando em silêncio (sem tela de erro).
    refetchInterval: (query) => (query.state.status === "error" ? 5000 : false),
  });

  const queryClient = useQueryClient();
  /** Pré-carrega o próximo nível assim que o mouse passa por cima. */
  const prefetch = (step: Step) =>
    queryClient.prefetchQuery({
      queryKey: ["md-explorar", step, filtro.iata, filtro.month],
      queryFn: () => explorar({ data: paramsDe(step) }),
      staleTime: 30 * 60 * 1000,
    });

  const hrefPasso = (step: Step) =>
    linkPasso ? linkPasso([...trail, step]) : undefined;

  // Passo clicado: pinta o carregamento na hora (sem esperar a rede) e
  // bloqueia cliques repetidos no mesmo nível.
  const [pendente, setPendente] = useState<Step | null>(null);

  const go = (step: Step) => {
    const next = [...trail, step];
    if (linkPasso) {
      const url = linkPasso(next);
      abrirLinkExterno(url);
      return;
    }
    if (pendente) return; // evita clique duplo / navegação concorrente
    setPendente(step);
    setTrail(next);
  };

  const backTo = (i: number) => {
    // Voltar é sempre permitido: descarta a etapa que estava carregando.
    setPendente(null);
    setTrail((t) => t.slice(0, i + 1));
  };


  const data = q.data;
  const cheapest = data?.dates[0] ?? null;
  const maxMonth = Math.max(0, ...(data?.months.map((m) => m.price ?? 0) ?? [0]));

  // Só é "carregando" quando existe trabalho real: cache pronto renderiza direto.
  const buscando = q.isFetching && (q.isPlaceholderData || !data);
  const carregando = !!pendente || buscando;
  const etapa = stageMessage(pendente ?? current);

  useEffect(() => {
    if (!q.isFetching) setPendente(null);
  }, [q.isFetching, current]);

  // Mensagem muda depois de alguns segundos; nunca esqueleto infinito.
  const [lento, setLento] = useState(false);
  const [estourou, setEstourou] = useState(false);
  useEffect(() => {
    if (!carregando) {
      setLento(false);
      setEstourou(false);
      return;
    }
    const a = setTimeout(() => setLento(true), 4000);
    const b = setTimeout(() => setEstourou(true), 30000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [carregando, current]);


  const [motor, setMotor] = useState({ origem: "", destino: "", ida: "", volta: "" });

  useEffect(() => {
    if (!data?.dates.length) return;
    setMotor({
      origem: current.fromIata ?? "",
      destino: current.toIata ?? "",
      ida: data.dates[0].departDate,
      volta: data.dates[0].returnDate ?? "",
    });
  }, [data, current.fromIata, current.toIata]);

  // Portal interno: "Ver voos" abre o NOSSO motor (/voar), nunca o site da
  // operadora. Os embeds públicos continuam podendo sobrescrever via linkVoos.
  const montarLink = (p: { origem: string; destino: string; ida: string; volta: string }) => {
    if (linkVoos) return linkVoos(p);
    const q = new URLSearchParams({ o: p.origem, d: p.destino, ida: p.ida });
    if (p.volta) q.set("volta", p.volta);
    return `/voar?${q.toString()}`;
  };

  const pesquisar = () => {
    if (!motor.origem || !motor.destino || !motor.ida) {
      toast.error("Informe origem, destino e data de ida");
      return;
    }
    abrirLinkExterno(montarLink(motor));
  };



  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthParam = (label: string): string | null => {
    const [mes, ano] = label.split("/");
    const idx = MESES.indexOf(mes) + 1;
    return idx && ano ? `${ano}-${idx}` : null;
  };
  const selectMonth = (label: string) => {
    const month = monthParam(label);
    if (!month) return;
    setTrail((t) => {
      const last = t[t.length - 1];
      const base = last.baseLabel ?? last.label;
      return [...t.slice(0, -1), { ...last, baseLabel: base, label: `${base} · ${label}`, month }];
    });
  };

  // Próximos 12 meses para o filtro global.
  const hoje = new Date();
  const mesesFiltro = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    return {
      value: `${d.getFullYear()}-${d.getMonth() + 1}`,
      label: `${MESES[d.getMonth()]}/${d.getFullYear()}`,
    };
  });



  return (
    <div className={className ?? "mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6"}>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Plane className="h-6 w-6 text-primary" /> Passagens aéreas baratas
          </h1>
          <p className="mt-1 text-sm font-semibold text-primary">
            Veja as passagens que encontramos nas últimas 24 horas
          </p>
        </div>

        {/* Filtros de origem e mês — ao lado do título */}
        <div className="flex w-full items-stretch gap-2 sm:gap-3 lg:w-auto">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:w-[440px] lg:flex-none">


        <div className="relative">
          <Field label="Origem">
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Digite a origem"
              value={filtro.iata ? filtro.label : buscaOrigem}
              onChange={(e) => {
                setBuscaOrigem(e.target.value);
                setFiltro((f) => ({ ...f, iata: null, label: "" }));
              }}
            />
          </Field>
          {filtro.iata && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setFiltro((f) => ({ ...f, iata: null, label: "" }));
                setBuscaOrigem("");
              }}
            >
              limpar
            </button>
          )}
          {!filtro.iata && buscaOrigem.trim().length >= 2 && sugestoes.data?.length ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-xl">
              {sugestoes.data.map((o) => (
                <button
                  key={o.iata}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setFiltro((f) => ({ ...f, iata: o.iata, label: `${o.cidade} (${o.iata})` }));
                    setBuscaOrigem("");
                  }}
                >
                  <span className="truncate">
                    {o.cidade} <span className="text-muted-foreground">· {o.pais}</span>
                  </span>
                  <span className="ml-2 font-mono text-xs text-primary">{o.iata}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Field label="Mês">
          <select
            className="w-full bg-transparent text-sm outline-none"
            value={filtro.month}
            onChange={(e) => setFiltro((f) => ({ ...f, month: e.target.value }))}
          >
            <option value="">Qualquer mês</option>
            {mesesFiltro.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
          </div>
          <Button
            variant="secondary"
            size="icon"
            className="h-auto w-11 shrink-0 self-stretch px-0 sm:px-4"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          </Button>

        </div>
      </header>


      {/* Trilha de navegação — setas encadeadas na identidade VIA AIR */}
      {hideTrail ? (
        trail.length > 1 ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => backTo(trail.length - 2)}>
              ← Voltar
            </Button>
          </div>
        ) : null
      ) : (
      <nav
        aria-label="Trilha de navegação"
        className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/50 bg-card/60 p-1.5 backdrop-blur"
      >
        {trail.map((s, i) => {
          const isLast = i === trail.length - 1;
          const isFirst = i === 0;
          return (
            <button
              key={`${s.label}-${i}`}
              onClick={() => backTo(i)}
              title={s.label}
              style={{
                clipPath: isFirst
                  ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                  : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                marginLeft: isFirst ? 0 : -10,
              }}
              className={`relative flex items-center gap-1.5 py-2 pr-6 text-sm font-semibold transition-colors ${
                isFirst ? "pl-4" : "pl-6"
              } ${
                isLast
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {isFirst && <Plane className="h-3.5 w-3.5 shrink-0" />}
              <span className="max-w-[42vw] truncate sm:max-w-none">{s.label}</span>
            </button>
          );
        })}
      </nav>
      )}


      {carregando && !estourou ? (
        <div className="space-y-4">
          <StageBanner titulo={etapa.titulo} sub={etapa.sub} lento={lento} />
          <StageSkeleton kind={stageKindOf(pendente ?? current)} />
        </div>
      ) : null}

      {(estourou || (q.isError && !data)) && (
        <Card className="flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-semibold">Não conseguimos carregar agora.</div>
          <Button
            onClick={() => {
              setEstourou(false);
              setLento(false);
              void q.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
          </Button>
        </Card>
      )}

      {/* Regiões / países */}
      {!carregando && data?.categories.length ? (

        <div className="grid gap-4 md:grid-cols-2">
          {data.categories.map((c) => {
            const step: Step = { label: c.name, categoryId: c.id };
            const href = hrefPasso(step);
            const Tag: any = href ? "a" : "button";
            return (
            <Tag
              key={c.id}
              {...(href
                ? { href, target: "_blank", rel: "noopener noreferrer" }
                : { onClick: () => go(step) })}
              onMouseEnter={() => prefetch(step)}
              className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-border/50 bg-card p-3 text-left transition-all duration-300 hover:border-primary/40 hover:bg-muted/40 sm:gap-4 sm:p-4"
            >

              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24">
                <img
                  src={imagemRegiao(c.name)}
                  alt={c.name}
                  loading="lazy"
                  width={640}
                  height={640}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold leading-tight sm:text-lg">{c.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.description}</p>
                </div>
                {c.price != null && (
                  <div className="shrink-0 sm:text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Ida + volta a partir de{" "}
                    </span>
                    <span className="whitespace-nowrap text-lg font-bold text-primary sm:block sm:text-xl">
                      {brl(c.price)}
                    </span>
                  </div>
                )}
              </div>

            </Tag>
            );
          })}

        </div>

      ) : null}

      {/* Destinos ou origens (tabela igual à do Melhores Destinos) */}
      {!carregando && data?.cities.length ? (
        <Card className="overflow-hidden border-white/5 shadow-2xl">
          <div className="flex items-center justify-between bg-primary px-4 py-3 sm:px-6 sm:py-4 text-[11px] font-bold uppercase tracking-widest text-primary-foreground">
            <span>{data.level === "origins" ? "Origem → Destino" : "Destino"}</span>
            <span className="text-right">Ida + volta a partir de</span>
          </div>
          <div className="flex flex-col">
            {data.cities.map((c, i) => {
              const step: Step =
                data.level === "cities"
                  ? {
                      label: c.toName,
                      categoryId: current.categoryId,
                      toIata: c.toIata ?? undefined,
                    }
                  : {
                      label: `${c.fromName} → ${c.toName}`,
                      categoryId: current.categoryId,
                      toIata: c.toIata ?? current.toIata,
                      fromIata: c.fromIata ?? undefined,
                    };
              const href = hrefPasso(step);
              const Tag: any = href ? "a" : "button";
              return (
              <Tag
                key={`${c.fromIata ?? ""}-${c.toIata ?? i}`}
                className="group flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-6 sm:py-4 text-left transition-all hover:bg-white/[0.03]"
                onMouseEnter={() => prefetch(step)}
                {...(href
                  ? { href, target: "_blank", rel: "noopener noreferrer" }
                  : { onClick: () => go(step) })}
              >


                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                    {c.fromName ? `${c.fromName} → ${c.toName}` : c.toName}
                  </span>
                  <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {[c.fromIata, c.toIata].filter(Boolean).join(" → ") || "Principais aeroportos"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="whitespace-nowrap text-lg font-bold text-foreground">
                    {c.price != null ? (
                      <>
                        <span className="mr-1 text-sm font-medium text-primary">R$</span>
                        {brl(c.price).replace(/^R\$\s*/, "")}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </div>
              </Tag>
              );
            })}

            <div className="bg-black/10 p-4 text-center text-[11px] font-medium uppercase tracking-tight text-muted-foreground">
              Visualizando os destinos mais econômicos{current.label ? ` para ${current.label}` : ""}
            </div>
          </div>
        </Card>

      ) : null}


      {/* Preços do trecho: gráfico de meses + tabela comparativa + motor */}
      {!carregando && data && (data.months.length > 0 || data.dates.length > 0) ? (
        <div className="space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Ida + volta • melhores preços encontrados
              </div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight">{data.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.dates.length} datas disponíveis
              </p>
            </div>
            {cheapest && (
              <Card className="border-primary/30 bg-card/80 px-5 py-3 shadow-xl">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Melhor tarifa detectada
                </div>
                <div className="flex items-baseline gap-1 text-3xl font-black text-primary">
                  {brl(cheapest.price)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {cheapest.departLabel}
                  {cheapest.returnLabel ? ` — ${cheapest.returnLabel}` : ""}
                </div>
              </Card>
            )}
          </div>

          {data.months.length > 0 && (
            <Card className="rounded-2xl p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2 sm:mb-7">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                  <h3 className="truncate text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Histórico de preços
                  </h3>
                </div>
                <span className="hidden shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground sm:inline">
                  Clique no mês para filtrar
                </span>
              </div>

              {/* Mobile: grade de meses (igual ao app do Melhores Destinos) */}
              <div className="grid grid-cols-3 gap-2 md:hidden">
                {data.months.map((m) => {
                  const active = current.month === monthParam(m.label);
                  return (
                    <button
                      key={`g-${m.label}`}
                      onClick={() => selectMonth(m.label)}
                      className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                        active
                          ? "border-primary bg-primary/15"
                          : "border-border/60 bg-muted/30 hover:bg-muted/60"
                      }`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {m.label}
                      </div>
                      <div
                        className={`text-sm font-black ${
                          active || m.cheapest ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {m.price ? brl(m.price) : "—"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop: gráfico de barras */}
              <div className="hidden h-32 items-end justify-between gap-3 md:flex">
                {data.months.map((m) => {
                  const value = m.price ?? 0;
                  const height = maxMonth ? Math.max(14, Math.round((value / maxMonth) * 100)) : 14;
                  const active = current.month === monthParam(m.label);
                  return (
                    <button
                      key={m.label}
                      onClick={() => selectMonth(m.label)}
                      className="group flex min-w-12 flex-1 flex-col items-center gap-3"
                      title={m.price ? brl(m.price) : "Sem preço"}
                    >

                      <span
                        className={`text-[10px] ${
                          active || m.cheapest
                            ? "font-black text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      >
                        {m.price ? brl(m.price) : "—"}
                      </span>
                      <span
                        style={{ height: `${height}px` }}
                        className={`w-full rounded-t-md transition-all ${
                          active
                            ? "bg-gradient-to-t from-primary to-primary/60 shadow-[0_0_20px_hsl(var(--primary)/0.35)]"
                            : "bg-muted group-hover:bg-muted-foreground/40"
                        }`}
                      />
                      <span
                        className={`text-[10px] font-semibold uppercase ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {q.isFetching && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> carregando tarifas salvas...
                </div>
              )}
            </Card>
          )}

          {/* Mobile: lista enxuta — cia, ida, volta, bagagem e preço (sem duração) */}
          {data.dates.length > 0 && (
            <Card className="overflow-hidden rounded-2xl md:hidden">
              <div className="grid grid-cols-[24px_1fr_1fr_84px] items-center gap-2 border-b bg-muted/40 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                <span>Cia</span>
                <span>Ida</span>
                <span>Volta</span>
                <span className="text-right">Preço</span>
              </div>
              <div className="divide-y">
                {data.dates.map((o, i) => (
                  <div key={`m-${o.departDate}-${o.returnDate}-${o.price}`} className="px-3 py-3">
                    <div className="grid grid-cols-[24px_1fr_1fr_84px] items-center gap-2">
                      {o.airlineLogo ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-white p-0.5">
                          <img
                            src={o.airlineLogo}
                            alt={nomeCompanhia(o.airline) ?? "Companhia"}
                            className="max-h-full max-w-full"
                          />
                        </span>
                      ) : (
                        <span className="h-6 w-6" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-bold leading-tight">{o.departLabel}</div>
                        <div className="truncate text-[10px] uppercase text-muted-foreground">
                          {o.weekdayOut}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold leading-tight">{o.returnLabel ?? "—"}</div>
                        <div className="truncate text-[10px] uppercase text-muted-foreground">
                          {o.weekdayIn}
                        </div>
                      </div>
                      <a
                        href={
                          current.fromIata && current.toIata
                            ? montarLink({
                                origem: current.fromIata,
                                destino: current.toIata,
                                ida: o.departDate,
                                volta: o.returnDate ?? "",
                              })
                            : o.viaairUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                        className={`rounded-lg px-2 py-2 text-center text-sm font-black leading-tight ${
                          i === 0
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {brl(o.price)}
                      </a>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 pl-8">
                      <BaggageBlocks label={o.baggage} />
                      {admin && current.fromIata && current.toIata ? (
                        <SalvarPromocaoButton
                          origem={current.fromIata}
                          destino={current.toIata}
                          ida={o.departDate}
                          volta={o.returnDate ?? null}
                          referencia={o.price ?? null}
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            </div>
          )}

          {data.dates.length > 0 && (
            <Card className="hidden overflow-hidden rounded-2xl shadow-2xl md:block">
              <div className="overflow-x-auto">

                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <th className="px-6 py-4">Companhia</th>
                      <th className="px-6 py-4">Ida</th>
                      <th className="px-6 py-4">Volta</th>
                      <th className="px-6 py-4">Duração</th>
                      <th className="px-6 py-4 text-center">Bagagem</th>
                      <th className="px-6 py-4">Preço final</th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.dates.map((o, i) => (
                      <tr
                        key={`${o.departDate}-${o.returnDate}-${o.price}`}
                        className="transition-colors hover:bg-muted/40"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            {o.airlineLogo ? (
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1.5">
                                <img
                                  src={o.airlineLogo}
                                  alt={nomeCompanhia(o.airline) ?? "Companhia"}
                                  className="max-h-full max-w-full"
                                />
                              </span>
                            ) : null}
                            <div className="text-xs font-bold">
                              {nomeCompanhia(o.airline) ?? "—"}
                            </div>

                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold">{o.departLabel}</div>
                          <div className="text-[10px] text-muted-foreground">{o.weekdayOut}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold">{o.returnLabel ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{o.weekdayIn}</div>
                        </td>
                        <td className="px-6 py-5">
                          {o.nights ? (
                            <Badge variant="secondary" className="rounded-full text-[10px]">
                              {o.nights} dias
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <BaggageBlocks label={o.baggage} />
                        </td>

                        <td className="px-6 py-5">
                          <div
                            className={`text-xl font-black ${i === 0 ? "text-primary" : ""}`}
                          >
                            {brl(o.price)}
                          </div>
                          {i === 0 && (
                            <div className="text-[9px] font-bold uppercase tracking-tight text-primary">
                              Tarifa mínima
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant={i === 0 ? "default" : "secondary"} asChild>
                              <a
                                href={
                                  current.fromIata && current.toIata
                                    ? montarLink({
                                        origem: current.fromIata,
                                        destino: current.toIata,
                                        ida: o.departDate,
                                        volta: o.returnDate ?? "",
                                      })
                                    : o.viaairUrl
                                }

                                target="_blank"
                                rel="noreferrer"
                              >

                                Ver voos <ExternalLink className="ml-1 h-3.5 w-3.5" />
                              </a>
                            </Button>
                            {admin && current.fromIata && current.toIata ? (
                              <SalvarPromocaoButton
                                origem={current.fromIata}
                                destino={current.toIata}
                                ida={o.departDate}
                                volta={o.returnDate ?? null}
                                referencia={o.price ?? null}
                              />
                            ) : null}
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Motor de busca — pesquise outras datas */}
          <Card className="rounded-2xl p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-6 w-1.5 rounded-full bg-primary" />
              <h3 className="text-sm font-black uppercase tracking-[0.15em]">
                Pesquise outras datas
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Origem">
                <input
                  value={motor.origem}
                  onChange={(e) => setMotor((m) => ({ ...m, origem: e.target.value.toUpperCase() }))}
                  placeholder="PFB"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <Field label="Destino">
                <input
                  value={motor.destino}
                  onChange={(e) =>
                    setMotor((m) => ({ ...m, destino: e.target.value.toUpperCase() }))
                  }
                  placeholder="SAO"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <Field label="Ida">
                <input
                  type="date"
                  value={motor.ida}
                  onChange={(e) => setMotor((m) => ({ ...m, ida: e.target.value }))}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <Field label="Volta">
                <input
                  type="date"
                  value={motor.volta}
                  onChange={(e) => setMotor((m) => ({ ...m, volta: e.target.value }))}
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </Field>
              <div className="flex items-end">
                <Button className="h-11 w-full font-black uppercase tracking-[0.2em]" onClick={pesquisar}>
                  <Search className="mr-2 h-4 w-4" /> Pesquisar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}


      {data && !q.isFetching && !data.categories.length && !data.cities.length && !data.dates.length && (
        <Card className="p-6 text-sm text-muted-foreground">
          Nada encontrado aqui. <Badge variant="secondary">volte um nível</Badge>
        </Card>
      )}
    </div>
  );
}
