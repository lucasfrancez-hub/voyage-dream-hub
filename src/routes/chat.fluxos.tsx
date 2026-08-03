import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  Workflow,
  Tag,
  X,
  RotateCcw,
  Zap,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { confirm } from "@/lib/confirm";
import { listFlows, saveFlow } from "@/lib/flows.functions";
import {
  ACAO_LABEL,
  SETOR_LABEL,
  TIPO_LABEL,
  validarFluxo,
  type Flow,
  type FlowAcao,
  type FlowAcaoTipo,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type FlowNodeTipo,
  type FlowSetor,
} from "@/lib/whatsapp/flow";

export const Route = createFileRoute("/chat/fluxos")({
  ssr: false,
  component: FluxosPage,
  head: () => ({
    meta: [
      { title: "Fluxos de Atendimento — VIA AIR Chat" },
      {
        name: "description",
        content: "Mapa visual de roteamento do atendimento: quem atende o quê, quando transfere e com quais palavras-chave.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

/* ────────────────────────── cores por setor ─────────────────────────────── */

const SETOR_CLASSE: Record<string, string> = {
  aereo: "border-sky-500/60 bg-sky-500/10",
  consultoria: "border-fuchsia-500/60 bg-fuchsia-500/10",
  comercial: "border-primary/60 bg-primary/10",
};
const SETOR_PONTO: Record<string, string> = {
  aereo: "bg-sky-500",
  consultoria: "bg-fuchsia-500",
  comercial: "bg-primary",
};

/* ────────────────────────── quadro do mapa ──────────────────────────────── */

type FluxoNodeType = Node<FlowNodeData, "fluxo">;

function QuadroFluxo({ data, selected }: NodeProps<FluxoNodeType>) {
  const setor = data.setor ?? "";
  const acoes = data.acoes ?? [];
  return (
    <div
      className={`w-[240px] rounded-xl border-2 px-3 py-2 shadow-sm transition-shadow ${
        SETOR_CLASSE[setor] ?? "border-border bg-card"
      } ${selected ? "ring-2 ring-ring" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-muted-foreground" />
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${SETOR_PONTO[setor] ?? "bg-muted-foreground"}`} />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {TIPO_LABEL[data.tipo] ?? data.tipo}
        </span>
      </div>
      <p className="mt-0.5 text-sm font-semibold leading-tight text-foreground">{data.titulo}</p>
      {data.descricao ? (
        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground">{data.descricao}</p>
      ) : null}
      {data.keywords?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.keywords.slice(0, 4).map((k) => (
            <span key={k} className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {k}
            </span>
          ))}
          {data.keywords.length > 4 ? (
            <span className="text-[10px] text-muted-foreground">+{data.keywords.length - 4}</span>
          ) : null}
        </div>
      ) : null}
      {acoes.length ? (
        <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">
          {acoes.slice(0, 4).map((a) => (
            <div key={a.id} className="flex items-start gap-1.5 text-[10px] leading-snug text-foreground/80">
              <Zap className="mt-[1px] h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">
                <span className="font-medium">{ACAO_LABEL[a.tipo] ?? a.tipo}</span>
                {a.detalhe ? <span className="text-muted-foreground"> — {a.detalhe}</span> : null}
              </span>
            </div>
          ))}
          {acoes.length > 4 ? (
            <span className="text-[10px] text-muted-foreground">+{acoes.length - 4} ações</span>
          ) : null}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !bg-muted-foreground" />
    </div>
  );
}

/* ───────────── auto-organização da esquerda pra direita ─────────────────── */

function organizarLR<T extends { id: string; position: { x: number; y: number } }>(
  nodes: T[],
  edges: { source: string; target: string }[],
): T[] {
  if (!nodes.length) return nodes;
  const nivel = new Map<string, number>();
  const entradas = new Map<string, number>();
  for (const n of nodes) entradas.set(n.id, 0);
  for (const e of edges) entradas.set(e.target, (entradas.get(e.target) ?? 0) + 1);

  let fila = nodes.filter((n) => (entradas.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (!fila.length) fila = [nodes[0]!.id];
  for (const id of fila) nivel.set(id, 0);

  // BFS com limite pra não travar em ciclos
  let guarda = nodes.length * 4;
  while (fila.length && guarda-- > 0) {
    const atual = fila.shift()!;
    const base = nivel.get(atual) ?? 0;
    for (const e of edges.filter((x) => x.source === atual)) {
      const prox = (nivel.get(e.target) ?? -1) < base + 1 ? base + 1 : nivel.get(e.target)!;
      if (nivel.get(e.target) !== prox) {
        nivel.set(e.target, prox);
        fila.push(e.target);
      }
    }
  }

  const porNivel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = nivel.get(n.id) ?? 0;
    porNivel.set(l, [...(porNivel.get(l) ?? []), n.id]);
  }
  const COL = 320;
  const LINHA = 170;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of porNivel) {
    ids.forEach((id, i) => pos.set(id, { x: 40 + l * COL, y: 40 + i * LINHA }));
  }
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

const nodeTypes = { fluxo: QuadroFluxo };

/* ────────────────────────────── página ──────────────────────────────────── */

function FluxosPage() {
  const carregar = useServerFn(listFlows);
  const salvar = useServerFn(saveFlow);

  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FluxoNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);

  const flow = useMemo(() => flows.find((f) => f.id === flowId) ?? null, [flows, flowId]);
  const noSelecionado = useMemo(() => nodes.find((n) => n.id === selecionado) ?? null, [nodes, selecionado]);

  const aplicar = useCallback((f: Flow) => {
    const base = (f.nodes ?? []).map((n) => ({
      id: n.id,
      type: "fluxo" as const,
      position: n.position,
      data: n.data,
    }));
    // Se o mapa foi salvo empilhado (tudo na mesma coluna), já abre organizado LR.
    const xs = base.map((n) => n.position.x);
    const vertical = base.length > 1 && Math.max(...xs) - Math.min(...xs) < 120;
    setNodes(vertical ? organizarLR(base, f.edges ?? []) : base);
    setEdges(
      (f.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
        type: "smoothstep",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    );
    setSujo(false);
    setSelecionado(null);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const lista = (await carregar()) as Flow[];
        if (!vivo) return;
        setFlows(lista);
        const ativo = lista.find((f) => f.ativo) ?? lista[0] ?? null;
        if (ativo) {
          setFlowId(ativo.id);
          aplicar(ativo);
        }
      } catch (e) {
        toast.error("Não consegui carregar os fluxos", { description: (e as Error)?.message });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [carregar, aplicar]);

  const onNodesChange = useCallback((changes: NodeChange<FluxoNodeType>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    if (changes.some((c) => c.type !== "select" && c.type !== "dimensions")) setSujo(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
    if (changes.some((c) => c.type !== "select")) setSujo(true);
  }, []);

  const onConnect = useCallback((c: Connection) => {
    setEdges((es) =>
      addEdge(
        { ...c, id: `e${Date.now()}`, type: "smoothstep", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
        es,
      ),
    );
    setSujo(true);
  }, []);

  const organizar = () => {
    setNodes((ns) => organizarLR(ns, edges));
    setSujo(true);
  };

  const novoQuadro = () => {
    const id = `no_${Date.now()}`;
    setNodes((ns) => {
      const maxX = ns.length ? Math.max(...ns.map((n) => n.position.x)) : 0;
      return [
        ...ns,
        {
          id,
          type: "fluxo" as const,
          position: { x: maxX + 320, y: 40 + (ns.length % 4) * 170 },
          data: {
            titulo: "Novo quadro",
            tipo: "intencao" as FlowNodeTipo,
            setor: null,
            descricao: "",
            keywords: [],
            acoes: [],
          },
        },
      ];
    });
    setSelecionado(id);
    setSujo(true);
  };

  const atualizarNo = (patch: Partial<FlowNodeData>) => {
    if (!selecionado) return;
    setNodes((ns) => ns.map((n) => (n.id === selecionado ? { ...n, data: { ...n.data, ...patch } } : n)));
    setSujo(true);
  };

  const excluirNo = async () => {
    if (!selecionado) return;
    const ok = await confirm({
      title: "Excluir quadro",
      description: "As setas ligadas a ele também serão removidas.",
      confirmText: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setNodes((ns) => ns.filter((n) => n.id !== selecionado));
    setEdges((es) => es.filter((e) => e.source !== selecionado && e.target !== selecionado));
    setSelecionado(null);
    setSujo(true);
  };

  const salvarTudo = async () => {
    if (!flow) return;
    const payloadNodes: FlowNode[] = nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: n.data,
    }));
    const payloadEdges: FlowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === "string" ? e.label : "",
    }));
    const erros = validarFluxo(payloadNodes, payloadEdges);
    if (erros.length) {
      toast.warning("Confira o mapa antes de salvar", { description: erros.join(" ") });
      return;
    }
    setSalvando(true);
    try {
      await salvar({ data: { id: flow.id, nodes: payloadNodes, edges: payloadEdges } });
      setFlows((fs) => fs.map((f) => (f.id === flow.id ? { ...f, nodes: payloadNodes, edges: payloadEdges } : f)));
      setSujo(false);
      toast.success("Fluxo salvo — as IAs já passam a seguir esse mapa");
    } catch (e) {
      toast.error("Não consegui salvar", { description: (e as Error)?.message });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* cabeçalho */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Workflow className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground">{flow?.nome ?? "Fluxos de Atendimento"}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {flow?.descricao ?? "Mapa lido pelas IAs em tempo real."}
          </p>
        </div>
        {sujo ? <span className="text-xs text-amber-500">alterações não salvas</span> : null}
        <Button variant="outline" size="sm" onClick={() => flow && aplicar(flow)} disabled={!sujo}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Desfazer
        </Button>
        <Button variant="outline" size="sm" onClick={organizar}>
          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Organizar
        </Button>
        <Button variant="outline" size="sm" onClick={novoQuadro}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Quadro
        </Button>
        <Button size="sm" onClick={salvarTudo} disabled={salvando || !sujo}>
          {salvando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* mapa */}
        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelecionado(n.id)}
            onPaneClick={() => setSelecionado(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-card" />
          </ReactFlow>
        </div>

        {/* painel de edição */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border p-4">
          {noSelecionado ? (
            <PainelQuadro
              data={noSelecionado.data}
              onChange={atualizarNo}
              onExcluir={excluirNo}
            />
          ) : (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Como funciona</p>
              <p>Clique num quadro pra editar título, setor responsável, descrição, gatilhos e as ações que ele dispara.</p>
              <p>Arraste da bolinha da direita de um quadro até a da esquerda do outro pra criar a seta do caminho. O botão “Organizar” alinha tudo da esquerda pra direita.</p>
              <p>As palavras-chave são os gatilhos: quando o cliente escreve uma delas, o atendimento vai direto pro setor daquele quadro. As ações dizem o que a IA faz ali.</p>
              <div className="space-y-1 pt-2">
                {Object.entries(SETOR_LABEL).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className={`h-2.5 w-2.5 rounded-full ${SETOR_PONTO[k]}`} />
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────── painel lateral ───────────────────────────────── */

function PainelQuadro({
  data,
  onChange,
  onExcluir,
}: {
  data: FlowNodeData;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onExcluir: () => void;
}) {
  const [kw, setKw] = useState("");

  const addKw = () => {
    const novas = kw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !data.keywords.includes(s));
    if (!novas.length) return;
    onChange({ keywords: [...data.keywords, ...novas] });
    setKw("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Título</Label>
        <Input value={data.titulo} onChange={(e) => onChange({ titulo: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tipo</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={data.tipo}
          onChange={(e) => onChange({ tipo: e.target.value as FlowNodeTipo })}
        >
          {Object.entries(TIPO_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Setor responsável</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={data.setor ?? ""}
          onChange={(e) => onChange({ setor: (e.target.value || null) as FlowSetor })}
        >
          <option value="">Nenhum (só passagem)</option>
          {Object.entries(SETOR_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">O que acontece aqui</Label>
        <Textarea
          rows={3}
          value={data.descricao}
          onChange={(e) => onChange({ descricao: e.target.value })}
          placeholder="Explique pra IA o que ela deve fazer neste ponto."
        />
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <Tag className="h-3.5 w-3.5" /> Palavras-chave (gatilhos)
        </Label>
        <div className="flex gap-1.5">
          <Input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKw();
              }
            }}
            placeholder="passagem, voo, ida e volta"
          />
          <Button variant="outline" size="sm" onClick={addKw}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {data.keywords.map((k) => (
            <span
              key={k}
              className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {k}
              <button
                type="button"
                onClick={() => onChange({ keywords: data.keywords.filter((x) => x !== k) })}
                aria-label={`Remover ${k}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* ações / disparos do quadro */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-xs">
          <Zap className="h-3.5 w-3.5" /> Ações e disparos
        </Label>
        <div className="space-y-2">
          {(data.acoes ?? []).map((a) => (
            <div key={a.id} className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center gap-1.5">
                <select
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  value={a.tipo}
                  onChange={(e) =>
                    onChange({
                      acoes: (data.acoes ?? []).map((x) =>
                        x.id === a.id ? { ...x, tipo: e.target.value as FlowAcaoTipo } : x,
                      ),
                    })
                  }
                >
                  {Object.entries(ACAO_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onChange({ acoes: (data.acoes ?? []).filter((x) => x.id !== a.id) })}
                  aria-label="Remover ação"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                className="h-8 text-xs"
                value={a.detalhe}
                placeholder="O que exatamente ela faz aqui"
                onChange={(e) =>
                  onChange({
                    acoes: (data.acoes ?? []).map((x) => (x.id === a.id ? { ...x, detalhe: e.target.value } : x)),
                  })
                }
              />
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            onChange({
              acoes: [
                ...(data.acoes ?? []),
                { id: `ac_${Date.now()}`, tipo: "mensagem" as FlowAcaoTipo, detalhe: "" } as FlowAcao,
              ],
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar ação
        </Button>
      </div>


      <Button variant="outline" size="sm" className="w-full text-destructive" onClick={onExcluir}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir quadro
      </Button>
    </div>
  );
}
