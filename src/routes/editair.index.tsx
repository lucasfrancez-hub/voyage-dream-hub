import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Film,
  UploadCloud,
  Image as ImageIcon,
  Music,
  Pencil,
  Sparkles,
  Plus,
  Clock,
} from "lucide-react";
import {
  criarProjetoEditair,
  excluirProjetoEditair,
  listarProjetosEditair,
  listarMidiasEditair,
  renomearAssetEditair,
  excluirAssetEditair,
} from "@/lib/editair/projects.functions";
import { hidratarMidias, importarParaGaleria, type MidiaGaleria } from "@/lib/editair/gallery";
import { guardarHandoff } from "@/lib/editair/handoff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { confirmThen } from "@/lib/confirm";

export const Route = createFileRoute("/editair/")({
  ssr: false,
  component: EditairHome,
});

type Projeto = {
  id: string;
  name: string;
  format: string;
  width: number;
  height: number;
  status: string;
  updated_at: string;
};

type Filtro = "todas" | "video" | "image" | "audio";

function duracaoTexto(ms: number) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function EditairHome() {
  const navigate = useNavigate();
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [midias, setMidias] = useState<MidiaGaleria[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<string[]>([]);
  const [instrucao, setInstrucao] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [renomeando, setRenomeando] = useState<MidiaGaleria | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    try {
      const [rowsP, rowsM] = await Promise.all([
        listarProjetosEditair() as unknown as Promise<Projeto[]>,
        listarMidiasEditair() as unknown as Promise<Array<Record<string, unknown>>>,
      ]);
      setProjetos(rowsP);
      setMidias(await hidratarMidias(rowsM));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar a galeria");
      setProjetos([]);
      setMidias([]);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const visiveis = useMemo(
    () => (midias ?? []).filter((m) => (filtro === "todas" ? true : m.kind === filtro)),
    [midias, filtro],
  );

  const importar = async (lista: FileList | File[] | null) => {
    if (!lista?.length) return;
    const novos: MidiaGaleria[] = [];
    try {
      for (const arquivo of Array.from(lista)) {
        const m = await importarParaGaleria(arquivo, { aoProgredir: setEnviando });
        novos.push(m);
        setMidias((cur) => [m, ...(cur ?? [])]);
      }
      setSelecao((s) => [...s, ...novos.map((m) => m.id)]);
      toast.success(novos.length > 1 ? `${novos.length} mídias na galeria` : "Mídia salva na galeria");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setEnviando(null);
    }
  };

  const alternar = (id: string) =>
    setSelecao((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const abrirNoEditor = async (ids: string[]) => {
    if (!ids.length) return;
    setAbrindo(true);
    try {
      const base = (midias ?? []).find((m) => m.id === ids[0]);
      const { id } = await criarProjetoEditair({
        data: {
          name: (base?.nome ?? "Novo projeto").replace(/\.[^.]+$/, "").slice(0, 100) || "Novo projeto",
          format: "custom",
          width: base && base.width > 0 ? base.width : 1080,
          height: base && base.height > 0 ? base.height : 1920,
          fps: 30,
          instructions: instrucao.trim() || null,
          assetIds: ids,
        },
      });
      if (instrucao.trim()) guardarHandoff(id, { instrucao: instrucao.trim() });
      navigate({ to: "/editair/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir o editor");
    } finally {
      setAbrindo(false);
    }
  };

  const excluirMidia = (m: MidiaGaleria) =>
    confirmThen(
      {
        title: "Excluir mídia",
        description: `“${m.nome}” será removida da galeria. Projetos que usam esse arquivo perdem a mídia.`,
        confirmText: "Excluir",
        destructive: true,
      },
      async () => {
        try {
          await excluirAssetEditair({ data: { id: m.id } });
          setMidias((cur) => (cur ?? []).filter((x) => x.id !== m.id));
          setSelecao((s) => s.filter((x) => x !== m.id));
          toast.success("Mídia excluída");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao excluir");
        }
      },
    );

  const salvarNome = async () => {
    if (!renomeando) return;
    const nome = novoNome.trim();
    if (!nome) return;
    try {
      await renomearAssetEditair({ data: { id: renomeando.id, name: nome } });
      setMidias((cur) => (cur ?? []).map((m) => (m.id === renomeando.id ? { ...m, nome } : m)));
      setRenomeando(null);
      toast.success("Nome atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao renomear");
    }
  };

  const excluirProjeto = (p: Projeto) =>
    confirmThen(
      {
        title: "Excluir projeto",
        description: `“${p.name}” e toda a edição serão removidos. As mídias continuam na galeria.`,
        confirmText: "Excluir",
        destructive: true,
      },
      async () => {
        try {
          await excluirProjetoEditair({ data: { id: p.id } });
          setProjetos((cur) => (cur ?? []).filter((x) => x.id !== p.id));
          toast.success("Projeto excluído");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao excluir");
        }
      },
    );

  const icone = (kind: string) =>
    kind === "audio" ? <Music className="h-6 w-6" /> : kind === "image" ? <ImageIcon className="h-6 w-6" /> : <Film className="h-6 w-6" />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">EditAir</h1>
          <p className="mt-1 text-sm text-white/50">
            Importe suas mídias, use quantas vezes quiser e edite com a inteligência do EditAir.
          </p>
        </div>
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={!!enviando}
          className="bg-[#F26B1F] text-white hover:bg-[#d95c14]"
        >
          {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1.5 h-4 w-4" />}
          {enviando ?? "Importar mídia"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          hidden
          onChange={(e) => {
            void importar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void importar(e.dataTransfer.files);
        }}
        className={`mb-6 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          arrastando ? "border-[#F26B1F] bg-[#F26B1F]/10" : "border-white/12 bg-white/[0.02]"
        }`}
      >
        <UploadCloud className="mx-auto mb-2 h-7 w-7 text-[#F26B1F]" />
        <p className="text-sm">Arraste vídeos, fotos ou áudios para cá</p>
        <p className="mt-1 text-xs text-white/40">Tudo fica salvo na galeria e pode ser reaproveitado em vários projetos.</p>
      </div>

      {/* Galeria */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="mr-2 text-sm font-medium text-white/80">Galeria</h2>
        {(["todas", "video", "image", "audio"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              filtro === f ? "bg-[#F26B1F] text-white" : "border border-white/10 text-white/55 hover:text-white"
            }`}
          >
            {f === "todas" ? "Todas" : f === "video" ? "Vídeos" : f === "image" ? "Fotos" : "Áudios"}
          </button>
        ))}
      </div>

      {midias === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#F26B1F]" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-14 text-center text-sm text-white/40">
          Nenhuma mídia por aqui ainda.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visiveis.map((m) => {
            const ativo = selecao.includes(m.id);
            return (
              <div
                key={m.id}
                onClick={() => alternar(m.id)}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white/[0.03] transition ${
                  ativo ? "border-[#F26B1F] ring-1 ring-[#F26B1F]/50" : "border-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex aspect-video items-center justify-center bg-black/45 text-white/25">
                  {m.thumbUrl ? (
                    <img src={m.thumbUrl} alt={m.nome} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    icone(m.kind)
                  )}
                </div>
                {m.durationMs ? (
                  <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/80">
                    {duracaoTexto(m.durationMs)}
                  </span>
                ) : null}
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{m.nome}</p>
                  <p className="text-[10px] text-white/35">{(m.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenomeando(m);
                      setNovoNome(m.nome);
                    }}
                    className="rounded-md bg-black/70 p-1.5 text-white/70 hover:text-white"
                    title="Renomear"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      excluirMidia(m);
                    }}
                    className="rounded-md bg-black/70 p-1.5 text-white/70 hover:text-red-400"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Instrução opcional + abrir editor */}
      {selecao.length ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-[#F26B1F]" />
            Instruir EditAir IA <span className="text-xs font-normal text-white/40">(opcional)</span>
          </div>
          <Textarea
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value.slice(0, 100000))}
            rows={2}
            maxLength={100000}
            placeholder="Ex.: tire as pausas e os erros, mantenha meu jeito natural de falar."
            className="border-white/10 bg-white/5"
          />
          <div className="mt-1 text-right text-[11px] text-white/40">
            {instrucao.length.toLocaleString("pt-BR")} / 100.000 caracteres
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void abrirNoEditor(selecao)}
              disabled={abrindo}
              className="bg-[#F26B1F] text-white hover:bg-[#d95c14]"
            >
              {abrindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              Abrir {selecao.length} mídia(s) no editor
            </Button>
            <Button variant="ghost" onClick={() => setSelecao([])} className="text-white/60">
              Limpar seleção
            </Button>
          </div>
        </div>
      ) : null}

      {/* Projetos recentes */}
      <h2 className="mb-3 mt-10 text-sm font-medium text-white/80">Projetos recentes</h2>
      {projetos === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-[#F26B1F]" />
        </div>
      ) : projetos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-12 text-center text-sm text-white/40">
          Nenhum projeto ainda. Selecione uma mídia acima para começar.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {projetos.map((p) => (
            <div
              key={p.id}
              className="group relative cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#F26B1F]/50 hover:bg-white/[0.06]"
              onClick={() => navigate({ to: "/editair/$id", params: { id: p.id } })}
            >
              <div className="mb-3 flex aspect-video items-center justify-center rounded-xl bg-black/40 text-white/20">
                <Film className="h-7 w-7" />
              </div>
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/40">
                <Clock className="h-3 w-3" />
                {new Date(p.updated_at).toLocaleDateString("pt-BR")}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  excluirProjeto(p);
                }}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-white/30 opacity-0 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!renomeando} onOpenChange={(o) => !o && setRenomeando(null)}>
        <DialogContent className="border-white/10 bg-[#131316] text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear mídia</DialogTitle>
          </DialogHeader>
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="border-white/10 bg-white/5"
            onKeyDown={(e) => e.key === "Enter" && void salvarNome()}
          />
          <Button onClick={() => void salvarNome()} className="bg-[#F26B1F] text-white hover:bg-[#d95c14]">
            Salvar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
