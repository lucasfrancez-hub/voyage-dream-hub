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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { confirm } from "@/lib/confirm";
import { listFlows, saveFlow } from "@/lib/flows.functions";
import {
  SETOR_LABEL,
  TIPO_LABEL,
  validarFluxo,
  type Flow,
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
  return (
    <div
      className={`min-w-[190px] max-w-[240px] rounded-xl border-2 px-3 py-2 shadow-sm transition-shadow ${
        SETOR_CLASSE[setor] ?? "border-border bg-card"
      } ${selected ? "ring-2 ring-ring" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-muted-foreground" />
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
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-muted-foreground" />
    </div>
  );
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
    setNodes(
      (f.nodes ?? []).map((n) => ({
        id: n.id,
        type: "fluxo" as const,
        position: n.position,
        data: n.data,
      })),
    );
    setEdges(
      (f.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || undefined,
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
      addEdge({ ...c, id: `e${Date.now()}`, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, es),
    );
    setSujo(true);
  }, []);

  const novoQuadro = () => {
    const id = `no_${Date.now()}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "fluxo" as const,
        position: { x: 60 + ns.length * 24, y: 60 + ns.length * 24 },
        data: { titulo: "Novo quadro", tipo: "intencao", setor: null, descricao: "", keywords: [] },
      },
    ]);
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
              <p>Clique num quadro pra editar título, setor responsável, descrição e palavras-chave.</p>
              <p>Arraste da bolinha de baixo de um quadro até a de cima de outro pra criar a seta do caminho.</p>
              <p>As palavras-chave são os gatilhos: quando o cliente escreve uma delas, o atendimento vai direto pro setor daquele quadro.</p>
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

      <Button variant="outline" size="sm" className="w-full text-destructive" onClick={onExcluir}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir quadro
      </Button>
    </div>
  );
}
