/* Configurações do EditAir Desktop: armazenamento, importação e atualizações reais. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, ClipboardCopy, Download, FileDown, FolderOpen, HardDrive, Loader2, RefreshCw, RotateCw, Terminal, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { confirmThen } from "@/lib/confirm";
import {
  formatarBytes,
  pontoDesktop,
  type EstadoUpdate,
  type InfoDesktop,
  type SettingsDesktop,
} from "@/lib/editair/desktop";

export function DesktopSettingsDialog({
  aberto,
  aoFechar,
  abaInicial = "armazenamento",
}: {
  aberto: boolean;
  aoFechar: () => void;
  abaInicial?: string;
}) {
  const api = pontoDesktop();
  const [aba, setAba] = useState(abaInicial);
  const [info, setInfo] = useState<InfoDesktop | null>(null);
  const [settings, setSettings] = useState<SettingsDesktop | null>(null);
  const [cache, setCache] = useState<{ bytes: number; caminho: string } | null>(null);
  const [update, setUpdate] = useState<EstadoUpdate | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [diag, setDiag] = useState("");
  const [estadoWhisper, setEstadoWhisper] = useState<{
    binario: boolean;
    modelo: string;
    modeloBaixado: boolean;
  } | null>(null);

  /* ---- alinhador local de legendas (whisper.cpp) ---- */
  const verEstadoWhisper = async () => {
    try {
      const e = await api?.transcricao?.estado();
      if (!e) {
        toast.error("Esta versão do Desktop ainda não tem o alinhador local. Atualize o app.");
        return;
      }
      setEstadoWhisper({ binario: e.disponivel, modelo: e.modelo.id, modeloBaixado: e.modelo.presente });
      setDiag(JSON.stringify(e, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler o alinhador");
    }
  };

  const baixarModeloWhisper = async () => {
    if (!api?.transcricao) {
      toast.error("Alinhador local indisponível nesta versão.");
      return;
    }
    setOcupado(true);
    try {
      await api.transcricao.baixarModelo();
      toast.success("Modelo de fala pronto");
      await verEstadoWhisper();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar o modelo");
    } finally {
      setOcupado(false);
    }
  };

  const limparCacheTranscricao = async () => {
    try {
      await api?.transcricao?.limparCache();
      toast.success("Cache de transcrições limpo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao limpar o cache");
    }
  };

  const rodarAB = async () => {
    const w = window as unknown as { editairABLegendas?: () => Promise<unknown> };
    if (typeof w.editairABLegendas !== "function") {
      toast.error("Abra um projeto com vídeo importado nesta sessão antes de rodar o A/B.");
      return;
    }
    setOcupado(true);
    try {
      const r = await w.editairABLegendas();
      setDiag(JSON.stringify(r, null, 2));
      toast.success("Teste A/B concluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no teste A/B");
    } finally {
      setOcupado(false);
    }
  };

  useEffect(() => setAba(abaInicial), [abaInicial, aberto]);

  useEffect(() => {
    if (!api || !aberto) return;
    void (async () => {
      const i = await api.info();
      setInfo(i);
      setSettings(i.settings);
      setCache(await api.cache.tamanho());
      setUpdate(await api.update.estado());
    })();
  }, [api, aberto]);

  useEffect(() => {
    if (!api) return;
    return api.update.aoMudar((e) => setUpdate((cur) => ({ ...(cur ?? {}), ...e })));
  }, [api]);

  if (!api) return null;

  const gravar = async (patch: Partial<SettingsDesktop>) => {
    const novo = await api.settings.salvar(patch);
    setSettings(novo);
  };

  const trocarCache = async () => {
    const destino = await api.dialogo.escolherPasta();
    if (!destino) return;
    const r = await api.cache.mover(destino);
    setSettings(r.settings);
    setCache(await api.cache.tamanho());
    toast.success("Cache movido para a nova pasta");
  };

  const limpar = () =>
    confirmThen(
      { title: "Limpar cache?", description: "Miniaturas, waveforms e proxies serão recriados quando necessário.", destructive: true },
      async () => {
        const r = await api.cache.limpar();
        setCache(r);
        toast.success("Cache limpo");
      },
    );

  const acao = async (fn: () => Promise<EstadoUpdate>) => {
    setOcupado(true);
    try {
      setUpdate(await fn());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na atualização");
    } finally {
      setOcupado(false);
    }
  };

  const abas = [
    { id: "armazenamento", rotulo: "Armazenamento" },
    { id: "importacao", rotulo: "Importação" },
    { id: "atualizacoes", rotulo: "Sobre e atualizações" },
    { id: "diagnostico", rotulo: "Diagnóstico" },
  ];

  /* Diagnóstico de áudio: apenas leitura do estado real do preview. */
  const coletarDiagnostico = () => {
    const w = window as unknown as { editairAudioDiag?: () => unknown };
    if (typeof w.editairAudioDiag !== "function") {
      toast.error("Abra um projeto no editor e toque o vídeo antes de diagnosticar.");
      return;
    }
    const dump = {
      app: { versao: info?.versao, plataforma: info?.plataforma, arquitetura: info?.arquitetura },
      userAgent: navigator.userAgent,
      audio: w.editairAudioDiag(),
    };
    setDiag(JSON.stringify(dump, null, 2));
    toast.success("Diagnóstico capturado");
  };

  /* Auditoria de importação: onde cada mídia vive e se o áudio sobrevive ao proxy. */
  const auditarImportacao = async () => {
    try {
      const r = await api.diagnostico?.importacao();
      if (!r) {
        toast.error("Esta versão do Desktop ainda não tem a auditoria. Atualize o app.");
        return;
      }
      setDiag(JSON.stringify(r, null, 2));
      toast.success("Auditoria de importação capturada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao auditar a importação");
    }
  };


  const copiarDiagnostico = async () => {
    try {
      await navigator.clipboard.writeText(diag);
      toast.success("Diagnóstico copiado");
    } catch {
      toast.error("Não consegui copiar — selecione o texto e use Cmd+C.");
    }
  };

  const salvarDiagnostico = async () => {
    try {
      const caminho = await api.diagnostico?.salvarTexto("EditAir-audio-diag.txt", diag);
      if (caminho) {
        toast.success("Salvo em Downloads");
        void api.arquivo.revelar(caminho);
      } else {
        toast.error("Esta versão do Desktop ainda não salva o arquivo. Use Copiar diagnóstico.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o diagnóstico");
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-2xl border-white/10 bg-[#111114] text-white">
        <DialogHeader>
          <DialogTitle>Configurações do EditAir</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm">
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex-1 rounded-md px-3 py-1.5 transition ${
                aba === a.id ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white"
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        {aba === "armazenamento" && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-white/10 p-4">
              <div className="mb-1 flex items-center gap-2 text-white/60">
                <HardDrive className="h-4 w-4" /> Cache atual
              </div>
              <div className="text-xl font-semibold">{cache ? formatarBytes(cache.bytes) : "—"}</div>
              <div className="mt-1 break-all text-xs text-white/45">{cache?.caminho}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={trocarCache}>
                  <FolderOpen className="mr-1.5 h-4 w-4" /> Alterar pasta
                </Button>
                <Button size="sm" variant="destructive" onClick={limpar}>
                  <Trash2 className="mr-1.5 h-4 w-4" /> Limpar cache
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-white/60">
              <div className="rounded-lg border border-white/10 p-3">
                <div className="text-white/40">Biblioteca</div>
                <div className="break-all">{info?.pastas.biblioteca}</div>
              </div>
              <div className="rounded-lg border border-white/10 p-3">
                <div className="text-white/40">Projetos</div>
                <div className="break-all">{info?.pastas.projetos}</div>
              </div>
            </div>
          </div>
        )}

        {aba === "importacao" && settings && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-4">
              <div>
                <Label>Copiar arquivos para a Biblioteca</Label>
                <p className="text-xs text-white/50">Desligado, o EditAir apenas referencia o arquivo onde ele está.</p>
              </div>
              <Switch
                checked={settings.copiarParaBiblioteca}
                onCheckedChange={(v) => void gravar({ copiarParaBiblioteca: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-4">
              <div>
                <Label>Proxy automático para arquivos pesados</Label>
                <p className="text-xs text-white/50">Gera versão leve local para o preview; a exportação usa o original.</p>
              </div>
              <Switch checked={settings.proxyAutomatico} onCheckedChange={(v) => void gravar({ proxyAutomatico: v })} />
            </div>
          </div>
        )}

        {aba === "atualizacoes" && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-white/10 p-4">
              <div className="text-lg font-semibold">EditAir</div>
              <div className="text-white/60">
                Versão {info?.versao} · {info?.plataforma} {info?.arquitetura}
              </div>
              {!!info?.capacidades?.hardware?.length && (
                <div className="mt-1 text-xs text-white/45">
                  Aceleração: {info.capacidades.hardware.join(", ")}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => void acao(() => api.update.verificar())}>
                  {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                  Verificar atualizações
                </Button>
                {update?.estado === "disponivel" && (
                  <Button size="sm" onClick={() => void acao(() => api.update.baixar())}>
                    <Download className="mr-1.5 h-4 w-4" /> Atualizar para {update.versao}
                  </Button>
                )}
                {update?.estado === "pronto" && (
                  <Button size="sm" onClick={() => void acao(() => api.update.instalar())}>
                    <RotateCw className="mr-1.5 h-4 w-4" /> Reiniciar e atualizar
                  </Button>
                )}
              </div>

              {update?.estado === "baixando" && (
                <div className="mt-3">
                  <Progress value={update.percentual ?? 0} className="h-2" />
                  <div className="mt-1 text-xs text-white/50">
                    Baixando EditAir {update.versao} — {formatarBytes(update.transferido ?? 0)} /{" "}
                    {formatarBytes(update.total ?? 0)}
                  </div>
                </div>
              )}
              {update?.estado === "atual" && <p className="mt-3 text-xs text-emerald-400">Você já está na versão mais recente.</p>}
              {update?.estado === "erro" && <p className="mt-3 text-xs text-red-400">{update.mensagem}</p>}
              {update?.exportando && (
                <p className="mt-2 text-xs text-amber-400">
                  Existe uma exportação em andamento. A atualização será instalada quando ela terminar.
                </p>
              )}
              {update?.changelog && (
                <div className="mt-3 whitespace-pre-wrap rounded-md bg-white/5 p-3 text-xs text-white/70">
                  {update.changelog}
                </div>
              )}
            </div>

            {settings && (
              <div className="flex items-center justify-between rounded-lg border border-white/10 p-4">
                <div>
                  <Label>Canal de atualização</Label>
                  <p className="text-xs text-white/50">Beta recebe novidades antes, com mais risco.</p>
                </div>
                <div className="flex gap-1 rounded-md bg-white/5 p-1">
                  {(["stable", "beta"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={async () => {
                        await api.update.canal(c);
                        setSettings({ ...settings, updateChannel: c });
                      }}
                      className={`rounded px-3 py-1 text-xs capitalize ${
                        settings.updateChannel === c ? "bg-primary text-primary-foreground" : "text-white/70"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {aba === "diagnostico" && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-white/10 p-4">
              <div className="mb-1 flex items-center gap-2 text-white/60">
                <Activity className="h-4 w-4" /> Diagnóstico de áudio do preview
              </div>
              <p className="text-xs text-white/50">
                Deixe o vídeo tocando no editor e clique abaixo. Nada é alterado no áudio — é só leitura.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={coletarDiagnostico}>
                  <Activity className="mr-1.5 h-4 w-4" /> Diagnosticar áudio do preview
                </Button>
                <Button size="sm" variant="secondary" disabled={!diag} onClick={() => void copiarDiagnostico()}>
                  <ClipboardCopy className="mr-1.5 h-4 w-4" /> Copiar diagnóstico
                </Button>
                <Button size="sm" variant="secondary" disabled={!diag} onClick={() => void salvarDiagnostico()}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Salvar em arquivo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void api.diagnostico?.devTools()}>
                  <Terminal className="mr-1.5 h-4 w-4" /> Abrir DevTools
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void auditarImportacao()}>
                  <FileDown className="mr-1.5 h-4 w-4" /> Auditar importação (local × proxy)
                </Button>
              </div>

            </div>

            <div className="rounded-lg border border-white/10 p-4">
              <div className="mb-1 flex items-center gap-2 text-white/60">
                <Activity className="h-4 w-4" /> Timeline e mídia do preview
              </div>
              <p className="text-xs text-white/50">
                Diagnóstico direto na interface — sem console. Abra o projeto no editor antes de coletar.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={coletarTimeline}>
                  <Activity className="mr-1.5 h-4 w-4" /> Diagnóstico da timeline
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void coletarMidia()}>
                  <Activity className="mr-1.5 h-4 w-4" /> Auditar mídia do preview
                </Button>
              </div>
            </div>


            <div className="rounded-lg border border-white/10 p-4">
              <div className="mb-1 flex items-center gap-2 text-white/60">
                <Activity className="h-4 w-4" /> Legendas — alinhador local (whisper.cpp)
              </div>
              <p className="text-xs text-white/50">
                Os tempos das palavras vêm do alinhador acústico local. O modelo é baixado uma única vez
                e fica salvo fora do cache.
              </p>
              {estadoWhisper && (
                <p className="mt-2 text-xs text-white/70">
                  Binário: {estadoWhisper.binario ? "ok" : "ausente"} · Modelo:{" "}
                  {estadoWhisper.modeloBaixado
                    ? `${estadoWhisper.modelo} pronto`
                    : `${estadoWhisper.modelo} não baixado`}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void verEstadoWhisper()}>
                  Ver estado do alinhador
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={ocupado}
                  onClick={() => void baixarModeloWhisper()}
                >
                  Baixar / verificar modelo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void limparCacheTranscricao()}>
                  Limpar cache de transcrições
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void rodarAB()}>
                  Rodar teste A/B de legendas
                </Button>
              </div>
            </div>

            <textarea
              readOnly
              value={diag}
              placeholder="O resultado aparece aqui e pode ser copiado."
              onFocus={(e) => e.currentTarget.select()}
              className="h-64 w-full resize-none rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-white/80 outline-none"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
