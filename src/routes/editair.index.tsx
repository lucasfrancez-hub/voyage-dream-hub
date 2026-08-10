import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Film, UploadCloud, X } from "lucide-react";
import {
  criarProjetoEditair,
  excluirProjetoEditair,
  listarProjetosEditair,
} from "@/lib/editair/projects.functions";
import { guardarHandoff } from "@/lib/editair/handoff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { confirmThen } from "@/lib/confirm";

export const Route = createFileRoute("/editair/")({
  ssr: false,
  component: ProjetosPage,
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

function ProjetosPage() {
  const navigate = useNavigate();
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [instrucoes, setInstrucoes] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [criando, setCriando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    try {
      const rows = (await listarProjetosEditair()) as unknown as Projeto[];
      setProjetos(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar projetos");
      setProjetos([]);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const adicionar = (lista: FileList | null) => {
    if (!lista?.length) return;
    setArquivos((a) => [...a, ...Array.from(lista)]);
  };

  const criar = async () => {
    if (!arquivos.length) return toast.error("Adicione pelo menos um vídeo.");
    setCriando(true);
    try {
      const nome = arquivos[0].name.replace(/\.[^.]+$/, "").slice(0, 100) || "Novo projeto";
      const { id } = await criarProjetoEditair({
        data: {
          // formato é decidido depois, dentro do editor
          name: nome,
          format: "custom",
          width: 1080,
          height: 1920,
          fps: 30,
          instructions: instrucoes.trim() || null,
        },
      });
      guardarHandoff(id, { arquivos, instrucao: instrucoes.trim() });
      setAberto(false);
      setArquivos([]);
      setInstrucoes("");
      navigate({ to: "/editair/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar projeto");
    } finally {
      setCriando(false);
    }
  };

  const excluir = (p: Projeto) =>
    confirmThen(
      {
        title: "Excluir projeto",
        description: `“${p.name}” e toda a edição serão removidos. Essa ação não pode ser desfeita.`,
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


  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus projetos</h1>
          <p className="mt-1 text-sm text-white/50">
            Importe seu vídeo, deixe a IA cortar as pausas e legendar. Você continua no controle.
          </p>
        </div>
        <Button onClick={() => setAberto(true)} className="bg-[#F26B1F] text-white hover:bg-[#d95c14]">
          <Plus className="mr-1.5 h-4 w-4" /> Novo projeto
        </Button>
      </div>

      {projetos === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#F26B1F]" />
        </div>
      ) : projetos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 py-20 text-center text-white/40">
          <Film className="mx-auto mb-3 h-8 w-8" />
          Nenhum projeto ainda. Crie o primeiro.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <p className="mt-0.5 text-xs text-white/40">
                {p.width}×{p.height} · {new Date(p.updated_at).toLocaleDateString("pt-BR")}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  excluir(p);
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

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="border-white/10 bg-[#131316] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                adicionar(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                arrastando ? "border-[#F26B1F] bg-[#F26B1F]/10" : "border-white/15 bg-white/[0.03] hover:border-white/30"
              }`}
            >
              <UploadCloud className="mx-auto mb-3 h-8 w-8 text-[#F26B1F]" />
              <p className="text-sm font-medium">Adicione seu vídeo</p>
              <p className="mt-1 text-xs text-white/45">Arraste o arquivo para cá ou</p>
              <span className="mt-3 inline-block rounded-lg border border-white/15 px-3 py-1.5 text-xs">
                Selecionar arquivo
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="video/*,audio/*,image/*"
                multiple
                hidden
                onChange={(e) => {
                  adicionar(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {arquivos.length ? (
              <div className="space-y-1.5">
                {arquivos.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
                  >
                    <Film className="h-3.5 w-3.5 text-white/40" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-white/35">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={() => setArquivos((a) => a.filter((_, idx) => idx !== i))}
                      className="rounded p-1 text-white/35 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-sm">Como você quer que o EditAir edite?</label>
              <Textarea
                value={instrucoes}
                onChange={(e) => setInstrucoes(e.target.value)}
                rows={3}
                placeholder="Ex.: Tire os erros e pausas, mantenha meu jeito natural de falar e faça uma edição dinâmica."
                className="border-white/10 bg-white/5"
              />
              <p className="mt-1.5 text-[11px] text-white/35">
                Opcional. Sem instrução, o EditAir usa a inteligência editorial padrão. O formato (Reels, horizontal…)
                você escolhe depois, dentro do editor.
              </p>
            </div>

            <Button
              onClick={criar}
              disabled={criando || !arquivos.length}
              className="w-full bg-[#F26B1F] text-white hover:bg-[#d95c14]"
            >
              {criando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Começar edição
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
