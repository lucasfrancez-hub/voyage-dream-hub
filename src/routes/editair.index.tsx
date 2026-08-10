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
        <DialogContent className="border-white/10 bg-[#131316] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-white/50">Nome</label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Reels Cancún — agosto"
                className="border-white/10 bg-white/5"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-white/50">Formato</label>
              <div className="grid grid-cols-2 gap-2">
                {formatos.map(([chave, f]) => (
                  <button
                    key={chave}
                    onClick={() => setFormato(chave)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                      formato === chave
                        ? "border-[#F26B1F] bg-[#F26B1F]/10 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25"
                    }`}
                  >
                    <span className="block font-medium">{f.ratio}</span>
                    <span className="block text-[11px] text-white/40">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-white/50">Instruções para a IA (opcional)</label>
              <Textarea
                value={instrucoes}
                onChange={(e) => setInstrucoes(e.target.value)}
                rows={3}
                placeholder="Ex.: corte bem dinâmico, legendas em laranja, mantenha as risadas"
                className="border-white/10 bg-white/5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={criar}
              disabled={criando}
              className="w-full bg-[#F26B1F] text-white hover:bg-[#d95c14]"
            >
              {criando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Criar projeto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
