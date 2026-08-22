/**
 * Apoio ao preenchimento dos passageiros na reserva da consolidadora:
 * - busca de passageiros já cadastrados em pedidos anteriores;
 * - leitura por IA de foto de documento / texto colado.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, Search, Sparkles, UserRoundSearch, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  passhubBuscarPassageiros,
  passhubLerPassageiros,
} from "@/lib/passhub/pax-assist.functions";

export type PaxPreenchido = {
  nome: string;
  sobrenome: string;
  nascimento: string;
  genero?: "M" | "F";
  documentoTipo: "cpf" | "passport";
  documento: string;
  emissao?: string;
  validade?: string;
  email?: string;
  ddi?: string;
  ddd?: string;
  telefone?: string;
};

/** Campo de busca do cadastro (pedidos anteriores) para um passageiro. */
export function BuscarCadastroPax({ onEscolher }: { onEscolher: (p: PaxPreenchido) => void }) {
  const buscar = useServerFn(passhubBuscarPassageiros);
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [itens, setItens] = useState<Array<PaxPreenchido & { id: string; nomeCompleto: string }>>([]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) {
      setItens([]);
      return;
    }
    const timer = setTimeout(() => {
      setCarregando(true);
      void (async () => {
        try {
          const r = (await buscar({ data: { termo: t } })) as {
            ok: boolean;
            passageiros?: Array<PaxPreenchido & { id: string; nomeCompleto: string }>;
          };
          setItens(r.ok ? (r.passageiros ?? []) : []);
          setAberto(true);
        } catch {
          setItens([]);
        } finally {
          setCarregando(false);
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [termo, buscar]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => itens.length && setAberto(true)}
          placeholder="Buscar passageiro cadastrado (nome, CPF, passaporte)"
          className="h-9 pl-8 text-sm"
        />
        {carregando ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/40" />
        ) : null}
      </div>
      {aberto && itens.length > 0 ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/15 bg-[#0b1a24] p-1 shadow-2xl">
          {itens.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-white/10"
              onClick={() => {
                onEscolher(p);
                setAberto(false);
                setTermo("");
                toast.success(`Dados de ${p.nomeCompleto} preenchidos`);
              }}
            >
              <span className="text-sm font-semibold text-white">{p.nomeCompleto}</span>
              <span className="text-[11px] text-white/50">
                {p.documentoTipo === "cpf" ? "CPF" : "Passaporte"} {p.documento || "—"}
                {p.nascimento ? ` · nasc. ${p.nascimento.split("-").reverse().join("/")}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {aberto ? <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setAberto(false)} /> : null}
    </div>
  );
}

async function arquivoParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    fr.readAsDataURL(file);
  });
}

/** Diálogo: cola texto ou anexa/arrasta foto e a IA devolve os passageiros. */
export function LeitorIAPax({
  aberto,
  onFechar,
  onPreencher,
}: {
  aberto: boolean;
  onFechar: () => void;
  onPreencher: (lista: PaxPreenchido[]) => void;
}) {
  const ler = useServerFn(passhubLerPassageiros);
  const [texto, setTexto] = useState("");
  const [imagens, setImagens] = useState<string[]>([]);
  const [processando, setProcessando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const adicionar = async (files: FileList | File[] | null) => {
    const lista = Array.from(files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, 4);
    if (!lista.length) return;
    try {
      const urls = await Promise.all(lista.map(arquivoParaDataUrl));
      setImagens((prev) => [...prev, ...urls].slice(0, 4));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao anexar imagem");
    }
  };

  const processar = async () => {
    if (!texto.trim() && !imagens.length) {
      toast.error("Cole um texto ou anexe uma foto.");
      return;
    }
    setProcessando(true);
    try {
      const r = (await ler({ data: { texto: texto.trim() || null, imagens } })) as {
        ok: boolean;
        erro?: string;
        passageiros?: PaxPreenchido[];
      };
      if (!r.ok) throw new Error(r.erro || "Falha ao ler os dados.");
      const lista = r.passageiros ?? [];
      if (!lista.length) throw new Error("Não encontrei dados de passageiro no que você enviou.");
      onPreencher(lista);
      toast.success(`${lista.length} passageiro(s) preenchido(s) pela IA`);
      setTexto("");
      setImagens([]);
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler os dados.");
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="border-white/10 bg-[#07131d] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-5 w-5 text-primary" /> Preencher com IA
          </DialogTitle>
          <DialogDescription className="text-white/55">
            Cole o texto com os dados ou anexe/arraste a foto do documento — a IA preenche os campos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-white/60">Texto</Label>
            <Textarea
              rows={5}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"Ex.: Maria da Silva, 12/03/1988, CPF 123.456.789-00, (44) 99999-0000"}
              className="mt-1 bg-black/20"
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
              void adicionar(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-xl border border-dashed p-4 text-center text-sm transition ${
              arrastando ? "border-primary bg-primary/10" : "border-white/20 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <ImagePlus className="mx-auto mb-1 h-5 w-5 text-white/50" />
            Arraste a foto do documento aqui ou clique para anexar (até 4)
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void adicionar(e.target.files)}
            />
          </div>

          {imagens.length ? (
            <div className="flex flex-wrap gap-2">
              {imagens.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt={`Anexo ${i + 1}`} className="h-16 w-24 rounded-md object-cover" />
                  <button
                    type="button"
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-0.5 text-white"
                    onClick={() => setImagens((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <Button className="w-full" onClick={() => void processar()} disabled={processando}>
            {processando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lendo…
              </>
            ) : (
              <>
                <UserRoundSearch className="mr-2 h-4 w-4" /> Preencher campos
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
