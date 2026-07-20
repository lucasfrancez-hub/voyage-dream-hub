import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Play, Eye, Trash2, Type as TypeIcon, MousePointer2, Clock, ArrowUp,
  Power, PowerOff, ArrowLeft, Camera, RotateCcw,
} from "lucide-react";
import { confirmThen } from "@/lib/confirm";
import {
  askVisionAboutScreenshot,
  openTrainingSession,
  runLiveTrainingStep,
  screenshotTrainingSession,
  heartbeatTrainingSession,
  closeTrainingSession,
  captureTrainingPdf,
  listTrainingScripts,
  getTrainingScript,
  saveTrainingScript,
  deleteTrainingScript,
  type TrainingStep,
} from "@/lib/checkin/training.functions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/checkin-treino")({
  head: () => ({ meta: [{ title: "Treinador de Check-in — VIA AIR" }] }),
  component: TreinoPage,
});

type Airline = "LATAM" | "GOL" | "AZUL";
type VisionTarget = { label: string; x: number; y: number; w: number; h: number; confidence?: number };
type VisionParsed = { reasoning?: string; targets?: VisionTarget[]; notes?: string; raw?: string };
type Shot = { b64: string; w: number; h: number; url: string; title: string };
type SavedScript = { id: string; airline: Airline; name: string; initial_url: string; viewport_width: number; viewport_height: number; updated_at: string };

const DEFAULT_URL_BY_AIRLINE: Record<Airline, string> = {
  LATAM: "https://www.latamairlines.com/br/pt/check-in/status?orderId=LA9571886LWKG&lastName=pereira",
  GOL: "https://www.voegol.com.br/checkin",
  AZUL: "https://www.voeazul.com.br/br/pt/home/check-in",
};
const DEFAULT_QUESTION =
  "Identifique os campos para iniciar check-in por localizador (código de reserva) e sobrenome, e o botão para continuar. Retorne cada elemento em 'targets' com coordenadas do centro e tamanho.";
const SESSION_STORAGE_KEY = "via_training_session_id";

function TreinoPage() {
  const askVision = useServerFn(askVisionAboutScreenshot);
  const openSession = useServerFn(openTrainingSession);
  const runStep = useServerFn(runLiveTrainingStep);
  const shotSession = useServerFn(screenshotTrainingSession);
  const heartbeatSession = useServerFn(heartbeatTrainingSession);
  const closeSession = useServerFn(closeTrainingSession);
  const capturePdf = useServerFn(captureTrainingPdf);
  const listScripts = useServerFn(listTrainingScripts);
  const getScript = useServerFn(getTrainingScript);
  const saveScript = useServerFn(saveTrainingScript);
  const deleteScript = useServerFn(deleteTrainingScript);

  const [airline, setAirline] = useState<Airline>("LATAM");
  const [url, setUrl] = useState(DEFAULT_URL_BY_AIRLINE.LATAM);
  const [pnr, setPnr] = useState("LA9571886LWKG");
  const [surname, setSurname] = useState("PEREIRA");
  const [steps, setSteps] = useState<TrainingStep[]>([]);
  const [shot, setShot] = useState<Shot | null>(null);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [vision, setVision] = useState<VisionParsed | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [useProxy, setUseProxy] = useState(true);
  const [interactive, setInteractive] = useState(true);
  const [lastClick, setLastClick] = useState<{ x: number; y: number } | null>(null);
  const [typeBuffer, setTypeBuffer] = useState("");
  const [hintBuffer, setHintBuffer] = useState("");
  const [annotations, setAnnotations] = useState<{ x: number; y: number; label: string; kind: "type" | "click"; url: string }[]>([]);
  const [pdfs, setPdfs] = useState<{ url: string; path: string; sizeKb: number; source: string }[]>([]);
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);



  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) setSessionId(saved);
    }
  }, []);

  // Recarrega scripts sempre que a companhia muda
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await listScripts({ data: { airline } });
        if (!cancelled && r.ok) setSavedScripts(r.scripts as unknown as SavedScript[]);
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [airline, listScripts]);

  const onChangeAirline = (a: Airline) => {
    if (sessionId) {
      toast.error("Feche a sessão antes de trocar de companhia.");
      return;
    }
    setAirline(a);
    setUrl(DEFAULT_URL_BY_AIRLINE[a]);
    setSteps([]);
    setAnnotations([]);
    setCurrentScriptId(null);
    setScriptName("");
  };

  const loadScript = async (id: string) => {
    try {
      const r = await getScript({ data: { id } });
      if (!r.ok) return;
      const s = r.script as unknown as { id: string; name: string; initial_url: string; steps: TrainingStep[]; annotations: typeof annotations; viewport_width: number; viewport_height: number };
      setCurrentScriptId(s.id);
      setScriptName(s.name);
      setUrl(s.initial_url);
      setSteps(s.steps || []);
      setAnnotations(s.annotations || []);
      toast.success(`Script "${s.name}" carregado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar");
    }
  };

  const saveCurrentScript = async () => {
    const name = scriptName.trim();
    if (!name) { toast.error("Dá um nome pro script antes de salvar."); return; }
    try {
      const r = await saveScript({
        data: {
          id: currentScriptId ?? undefined,
          airline,
          name,
          initial_url: url,
          steps,
          annotations,
          viewport_width: 1280,
          viewport_height: 900,
        },
      });
      if (!r.ok) return;
      setCurrentScriptId(r.id);
      const list = await listScripts({ data: { airline } });
      if (list.ok) setSavedScripts(list.scripts as unknown as SavedScript[]);
      toast.success("Script salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const removeCurrentScript = () => {
    if (!currentScriptId) return;
    confirmThen(
      { title: "Excluir script", description: "Excluir este script de treinamento?", confirmText: "Excluir" },
      async () => {
        try {
          await deleteScript({ data: { id: currentScriptId } });
          setCurrentScriptId(null);
          setScriptName("");
          const list = await listScripts({ data: { airline } });
          if (list.ok) setSavedScripts(list.scripts as unknown as SavedScript[]);
          toast.success("Script excluído");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Falha ao excluir");
        }
      },
    );
  };



  useEffect(() => {
    if (!sessionId || busy) return;
    let cancelled = false;
    const renew = async () => {
      const result = await heartbeatSession({ data: { sessionId } }).catch(() => ({ ok: false as const, error: "SESSION_EXPIRED" }));
      if (!cancelled && !result.ok) handleSessionError(new Error(result.error));
    };
    const timer = window.setInterval(() => void renew(), 6_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, busy, heartbeatSession]);

  const persistSession = (id: string | null) => {
    setSessionId(id);
    if (typeof window === "undefined") return;
    if (id) window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    else window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const handleSessionError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("SESSION_EXPIRED")) {
      persistSession(null);
      toast.error("A sessão expirou. Clique em Abrir sessão novamente.");
      return true;
    }
    toast.error(msg);
    return false;
  };

  const open = async () => {
    setBusy(true);
    setVision(null);
    setSelectedTarget(null);
    try {
      const r = await openSession({
        data: { url, viewportWidth: 1280, viewportHeight: 900, useResidentialProxy: useProxy },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      persistSession(r.sessionId);
      setShot({ b64: r.screenshot, w: r.width, h: r.height, url: r.currentUrl, title: r.title });
      toast.success(`Sessão aberta: ${r.title || r.currentUrl}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await closeSession({ data: { sessionId } });
      persistSession(null);
      setShot(null);
      setVision(null);
      toast.success("Sessão encerrada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  };

  const refreshShot = async () => {
    if (!sessionId) return;
    setBusy(true);
    setVision(null);
    setSelectedTarget(null);
    try {
      const r = await shotSession({ data: { sessionId } });
      if (!r.ok) {
        handleSessionError(new Error(r.error));
        return;
      }
      setShot((prev) => ({ b64: r.screenshot, w: prev?.w ?? 1280, h: prev?.h ?? 900, url: r.currentUrl, title: r.title }));
    } catch (e) {
      handleSessionError(e);
    } finally {
      setBusy(false);
    }
  };

  const goBack = async () => {
    if (!sessionId) return;
    setBusy(true);
    setVision(null);
    setSelectedTarget(null);
    try {
      const r = await runStep({ data: { sessionId, step: { action: "back" } } });
      if (!r.ok) {
        handleSessionError(new Error(r.error));
        return;
      }
      setShot((prev) => ({ b64: r.screenshot, w: prev?.w ?? 1280, h: prev?.h ?? 900, url: r.currentUrl, title: r.title }));
    } catch (e) {
      handleSessionError(e);
    } finally {
      setBusy(false);
    }
  };

  const runAllFromScratch = async () => {
    setBusy(true);
    setVision(null);
    setSelectedTarget(null);
    try {
      if (sessionId) await closeSession({ data: { sessionId } }).catch(() => undefined);
      persistSession(null);
      const opened = await openSession({
        data: { url, viewportWidth: 1280, viewportHeight: 900, useResidentialProxy: useProxy },
      });
      if (!opened.ok) {
        toast.error(opened.error);
        return;
      }
      persistSession(opened.sessionId);
      let latest: Shot = {
        b64: opened.screenshot,
        w: opened.width,
        h: opened.height,
        url: opened.currentUrl,
        title: opened.title,
      };
      const executionLogs: Array<{ step: number; action: string; ok: boolean; error?: string }> = [];
      for (let i = 0; i < steps.length; i += 1) {
        const result = await runStep({ data: { sessionId: opened.sessionId, step: steps[i] } });
        if (!result.ok) {
          executionLogs.push({ step: i + 1, action: steps[i].action, ok: false, error: result.error });
          setLogs(executionLogs);
          handleSessionError(new Error(result.error));
          return;
        }
        executionLogs.push({ step: i + 1, action: steps[i].action, ok: true });
        latest = { ...latest, b64: result.screenshot, url: result.currentUrl, title: result.title };
        setShot(latest);
      }
      setShot(latest);
      setLogs(executionLogs);
      toast.success(`Validado: ${latest.title || latest.url}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (!shot) return;
    setAsking(true);
    setVision(null);
    setSelectedTarget(null);
    try {
      const r = await askVision({ data: { imageBase64: shot.b64, question, width: shot.w, height: shot.h } });
      setVision(r.parsed as VisionParsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na IA");
    } finally {
      setAsking(false);
    }
  };

  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const executeAndAppend = async (step: TrainingStep, label: string, hint?: string) => {
    if (!sessionId) {
      toast.error("Abra uma sessão primeiro.");
      return;
    }
    setBusy(true);
    setVision(null);
    setSelectedTarget(null);
    const urlBefore = shot?.url ?? "";
    try {
      const r = await runStep({ data: { sessionId, step } });
      if (!r.ok) {
        handleSessionError(new Error(r.error));
        return;
      }
      setSteps((prev) => [...prev, step]);
      // Annotate the screenshot the action was taken ON (urlBefore), so the label sticks
      // to the field the user marked, not to the next screen.
      if ((step.action === "type" || step.action === "click") && hint && urlBefore) {
        setAnnotations((prev) => [
          ...prev,
          { x: step.x, y: step.y, label: hint, kind: step.action, url: urlBefore },
        ]);
      }
      setShot((prev) => ({ b64: r.screenshot, w: prev?.w ?? 1280, h: prev?.h ?? 900, url: r.currentUrl, title: r.title }));
      toast.success(`${label} · executado`);
    } catch (e) {
      handleSessionError(e);
    } finally {
      setBusy(false);
    }
  };


  const clickTargetAsStep = async (t: VisionTarget, mode: "click" | "type", text = "") => {
    const step: TrainingStep =
      mode === "click"
        ? { action: "click", x: Math.round(t.x), y: Math.round(t.y) }
        : { action: "type", x: Math.round(t.x), y: Math.round(t.y), text, clearFirst: true };
    const hint =
      mode === "type"
        ? `digite aqui: ${text || t.label}`
        : `clique aqui: ${t.label}`;
    await executeAndAppend(step, `${mode === "click" ? "Clique" : "Digitação"} em ${t.label}`, hint);
  };


  const addManualStep = (s: TrainingStep, label: string) => executeAndAppend(s, label);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Treinador de Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Abra a sessão UMA vez — cada clique/digitação roda ao vivo na mesma aba, sem reabrir a página.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sessionId ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Sessão ativa</Badge>
          ) : (
            <Badge variant="outline">Sem sessão</Badge>
          )}
          <Badge variant="outline">LATAM</Badge>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Config */}
        <Card className="col-span-12 lg:col-span-4 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Companhia aérea</label>
              <Select value={airline} onValueChange={(v) => onChangeAirline(v as Airline)} disabled={!!sessionId}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LATAM">LATAM</SelectItem>
                  <SelectItem value="GOL">GOL</SelectItem>
                  <SelectItem value="AZUL">AZUL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Sessão salva</label>
              <Select
                value={currentScriptId ?? "__new"}
                onValueChange={(v) => { if (v === "__new") { setCurrentScriptId(null); setScriptName(""); } else { void loadScript(v); } }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Nova sessão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new">+ Nova sessão</SelectItem>
                  {savedScripts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              placeholder="Nome da sessão (ex: LATAM padrão)"
              className="flex-1"
            />
            <Button size="sm" variant="secondary" onClick={saveCurrentScript} disabled={!scriptName.trim()}>
              Salvar
            </Button>
            {currentScriptId && (
              <Button size="sm" variant="outline" onClick={removeCurrentScript} title="Excluir sessão salva">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div>
            <label className="text-xs font-medium">URL inicial</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1" disabled={!!sessionId} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Localizador</label>
              <Input value={pnr} onChange={(e) => setPnr(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">Sobrenome</label>
              <Input value={surname} onChange={(e) => setSurname(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Proxy residencial BR sempre ativo — LATAM bloqueia conexões diretas de datacenter */}

          <div className="flex gap-2 pt-1">
            {!sessionId ? (
              <Button onClick={open} disabled={busy} className="flex-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Power className="h-4 w-4 mr-2" />}
                Abrir sessão
              </Button>
            ) : (
              <>
                <Button onClick={refreshShot} disabled={busy} variant="secondary" className="flex-1">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                  Print agora
                </Button>
                <Button onClick={goBack} disabled={busy} variant="outline" size="icon" title="Voltar">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={async () => {
                    if (!sessionId) return;
                    setBusy(true);
                    setVision(null);
                    setSelectedTarget(null);
                    try {
                      const r = await runStep({ data: { sessionId, step: { action: "goto", url } } });
                      if (!r.ok) { handleSessionError(new Error(r.error)); return; }
                      setShot((prev) => ({ b64: r.screenshot, w: prev?.w ?? 1280, h: prev?.h ?? 900, url: r.currentUrl, title: r.title }));
                      toast.success("Página inicial recarregada");
                    } catch (e) { handleSessionError(e); } finally { setBusy(false); }
                  }}
                  disabled={busy}
                  variant="outline"
                  size="icon"
                  title="Recarregar URL inicial (mesma sessão)"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button onClick={close} disabled={busy} variant="destructive" size="icon" title="Fechar sessão">
                  <PowerOff className="h-4 w-4" />
                </Button>

              </>
            )}
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Passos aprendidos ({steps.length})</span>
              {steps.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSteps([])}>
                  Limpar
                </Button>
              )}
            </div>
            <div className="space-y-1 max-h-64 overflow-auto">
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum passo. Abra a sessão e comece a interagir.</p>
              )}
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1">
                  <span className="w-5 text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 font-mono truncate">{JSON.stringify(s)}</span>
                  <button onClick={() => removeStep(i)} className="text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {steps.length > 0 && (
              <Button
                onClick={runAllFromScratch}
                disabled={busy}
                variant="outline"
                size="sm"
                className="w-full mt-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Repetir do zero (validar script)
              </Button>
            )}
          </div>

          <div className="pt-3 border-t space-y-2">
            <label className="text-xs font-medium">Pergunta pra IA sobre o print atual</label>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} />
            <Button onClick={ask} disabled={!shot || asking} variant="secondary" className="w-full">
              {asking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              Perguntar pra IA
            </Button>
          </div>
        </Card>

        {/* Screenshot */}
        <Card className="col-span-12 lg:col-span-8 p-4">
          {!shot && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Clique em <strong>Abrir sessão</strong> pra iniciar o navegador ao vivo.
            </div>
          )}
          {shot && (
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2 flex-wrap">
                <span className="font-mono truncate flex-1 min-w-0">{shot.url}</span>
                <span>·</span>
                <span>{shot.w}×{shot.h}</span>
                <label className="flex items-center gap-1 ml-2 cursor-pointer">
                  <input type="checkbox" checked={interactive} onChange={(e) => setInteractive(e.target.checked)} />
                  Interação direta (clique na imagem)
                </label>
              </div>
              {interactive && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {lastClick ? `Último clique: ${lastClick.x},${lastClick.y}` : "Clique na imagem pra clicar na página."}
                  </span>
                  <input
                    type="text"
                    value={hintBuffer}
                    onChange={(e) => setHintBuffer(e.target.value)}
                    placeholder='rótulo do campo (ex: "aqui vai o localizador")'
                    className="flex-1 min-w-[180px] border rounded px-2 py-1"
                  />
                  <input
                    type="text"
                    value={typeBuffer}
                    onChange={(e) => setTypeBuffer(e.target.value)}
                    placeholder="digitar no último clique + Enter"
                    className="flex-1 min-w-[180px] border rounded px-2 py-1"
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter" || !lastClick || !typeBuffer || busy) return;
                      e.preventDefault();
                      const text = typeBuffer;
                      const hint = hintBuffer.trim() || `digite aqui: ${text}`;
                      setTypeBuffer("");
                      setHintBuffer("");
                      await executeAndAppend(
                        { action: "type", x: lastClick.x, y: lastClick.y, text, clearFirst: true },
                        `Digitou "${text}"`,
                        hint,
                      );
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !sessionId || !lastClick || !pnr}
                    onClick={async () => {
                      if (!lastClick || !pnr) return;
                      const hint = hintBuffer.trim() || `aqui vai o localizador: ${pnr}`;
                      setHintBuffer("");
                      await executeAndAppend(
                        { action: "type", x: lastClick.x, y: lastClick.y, text: pnr, clearFirst: true },
                        `Preencheu localizador (${pnr})`,
                        hint,
                      );
                    }}
                  >
                    Preencher localizador
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !sessionId || !lastClick || !surname}
                    onClick={async () => {
                      if (!lastClick || !surname) return;
                      const hint = hintBuffer.trim() || `aqui vai o sobrenome: ${surname}`;
                      setHintBuffer("");
                      await executeAndAppend(
                        { action: "type", x: lastClick.x, y: lastClick.y, text: surname, clearFirst: true },
                        `Preencheu sobrenome (${surname})`,
                        hint,
                      );
                    }}
                  >
                    Preencher sobrenome
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={busy || !sessionId || !lastClick}
                    onClick={async () => {
                      if (!lastClick || !sessionId) return;
                      setBusy(true);
                      try {
                        const filename = `${pnr || "reserva"}-${surname || "pax"}.pdf`;
                        const r = await capturePdf({ data: { sessionId, x: lastClick.x, y: lastClick.y, filename } });
                        if (!r.ok) {
                          handleSessionError(new Error(r.error));
                          return;
                        }
                        if (r.signedUrl) {
                          setPdfs((prev) => [{ url: r.signedUrl!, path: r.path, sizeKb: r.sizeKb, source: r.sourceUrl }, ...prev]);
                          toast.success(`PDF salvo (${r.sizeKb} KB)`);
                        } else {
                          toast.success("PDF capturado, mas sem URL assinada.");
                        }
                        // atualiza o screenshot pós-clique
                        const s = await shotSession({ data: { sessionId } });
                        if (s.ok) setShot((prev) => ({ b64: s.screenshot, w: prev?.w ?? 1280, h: prev?.h ?? 900, url: s.currentUrl, title: s.title }));
                      } catch (e) {
                        handleSessionError(e);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    title="Clica no botão de baixar PDF marcado como Último clique e salva o arquivo na base"
                  >
                    Capturar PDF
                  </Button>
                </div>
              )}
              <div className="relative inline-block border rounded overflow-hidden bg-black/5">
                <img
                  ref={imgRef}
                  src={`data:image/jpeg;base64,${shot.b64}`}
                  className={`block w-full h-auto ${interactive ? "cursor-crosshair" : ""}`}
                  alt="screenshot"
                  onClick={async (e) => {
                    if (!interactive || busy || !shot) return;
                    const img = imgRef.current;
                    if (!img) return;
                    const rect = img.getBoundingClientRect();
                    const x = Math.round(((e.clientX - rect.left) / rect.width) * shot.w);
                    const y = Math.round(((e.clientY - rect.top) / rect.height) * shot.h);
                    setLastClick({ x, y });
                    const hint = hintBuffer.trim();
                    if (hint) setHintBuffer("");
                    await executeAndAppend(
                      { action: "click", x, y },
                      `Clique ${x},${y}`,
                      hint || undefined,
                    );
                  }}
                />

                {annotations
                  .filter((a) => a.url === shot.url)
                  .map((a, i) => {
                    const left = (a.x / shot.w) * 100;
                    const top = (a.y / shot.h) * 100;
                    const color = a.kind === "type" ? "bg-emerald-500" : "bg-sky-500";
                    return (
                      <div
                        key={`ann-${i}`}
                        className="absolute pointer-events-none"
                        style={{ left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -50%)" }}
                      >
                        <div className={`h-3 w-3 rounded-full ${color} ring-2 ring-white shadow`} />
                        <div className={`absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-white ${color} px-1.5 py-0.5 rounded shadow`}>
                          {a.label}
                        </div>
                      </div>
                    );
                  })}


                {vision?.targets?.map((t, i) => {
                  const isSel = selectedTarget === i;
                  const startDrag = (
                    e: React.PointerEvent,
                    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
                  ) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setSelectedTarget(i);
                    const img = imgRef.current;
                    if (!img || !shot) return;
                    const rect = img.getBoundingClientRect();
                    const sx = shot.w / rect.width;
                    const sy = shot.h / rect.height;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const orig = { x: t.x, y: t.y, w: t.w, h: t.h };
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    const onMove = (ev: PointerEvent) => {
                      const dx = (ev.clientX - startX) * sx;
                      const dy = (ev.clientY - startY) * sy;
                      let { x, y, w, h } = orig;
                      if (mode === "move") {
                        x += dx;
                        y += dy;
                      } else {
                        if (mode.includes("e")) w = Math.max(10, orig.w + dx);
                        if (mode.includes("w")) {
                          w = Math.max(10, orig.w - dx);
                          x = orig.x + dx / 2;
                        }
                        if (mode.includes("s")) h = Math.max(10, orig.h + dy);
                        if (mode.includes("n")) {
                          h = Math.max(10, orig.h - dy);
                          y = orig.y + dy / 2;
                        }
                      }
                      setVision((prev) => {
                        if (!prev?.targets) return prev;
                        const next = [...prev.targets];
                        next[i] = { ...next[i], x, y, w, h };
                        return { ...prev, targets: next };
                      });
                    };
                    const onUp = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", onUp);
                    };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  };
                  const handleCls =
                    "absolute w-3 h-3 bg-white border-2 border-brand-orange rounded-sm";
                  return (
                    <div
                      key={i}
                      onPointerDown={(e) => startDrag(e, "move")}
                      onClick={() => setSelectedTarget(i)}
                      className={`absolute border-2 cursor-move ${
                        isSel
                          ? "border-brand-orange bg-brand-orange/20"
                          : "border-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20"
                      }`}
                      style={{
                        left: `${((t.x - t.w / 2) / shot.w) * 100}%`,
                        top: `${((t.y - t.h / 2) / shot.h) * 100}%`,
                        width: `${(t.w / shot.w) * 100}%`,
                        height: `${(t.h / shot.h) * 100}%`,
                      }}
                      title={t.label}
                    >
                      <span className="absolute -top-5 left-0 text-[10px] font-mono bg-emerald-600 text-white px-1 rounded whitespace-nowrap pointer-events-none">
                        {i + 1}. {t.label}
                      </span>
                      {isSel && (
                        <>
                          <div onPointerDown={(e) => startDrag(e, "nw")} className={`${handleCls} -left-1.5 -top-1.5 cursor-nwse-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "ne")} className={`${handleCls} -right-1.5 -top-1.5 cursor-nesw-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "sw")} className={`${handleCls} -left-1.5 -bottom-1.5 cursor-nesw-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "se")} className={`${handleCls} -right-1.5 -bottom-1.5 cursor-nwse-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "n")} className={`${handleCls} left-1/2 -top-1.5 -ml-1.5 cursor-ns-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "s")} className={`${handleCls} left-1/2 -bottom-1.5 -ml-1.5 cursor-ns-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "w")} className={`${handleCls} -left-1.5 top-1/2 -mt-1.5 cursor-ew-resize`} />
                          <div onPointerDown={(e) => startDrag(e, "e")} className={`${handleCls} -right-1.5 top-1/2 -mt-1.5 cursor-ew-resize`} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Vision output + actions */}
        {vision && (
          <Card className="col-span-12 p-4 space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">IA respondeu:</div>
              <p className="text-sm">{vision.reasoning || "—"}</p>
              {vision.notes && <p className="text-xs text-muted-foreground mt-1">Obs: {vision.notes}</p>}
            </div>
            {vision.targets && vision.targets.length > 0 && (
              <div>
                <div className="text-xs font-medium mb-2">
                  Alvos identificados — clicar já executa na sessão viva:
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {vision.targets.map((t, i) => (
                    <div
                      key={i}
                      className={`border rounded p-2 text-xs space-y-2 ${
                        selectedTarget === i ? "border-brand-orange" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {i + 1}. {t.label}
                        </span>
                        <span className="text-muted-foreground">
                          {Math.round(t.x)},{Math.round(t.y)} · {Math.round(t.w)}×{Math.round(t.h)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => clickTargetAsStep(t, "click")}>
                          <MousePointer2 className="h-3 w-3 mr-1" /> Clicar
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => clickTargetAsStep(t, "type", pnr)}>
                          <TypeIcon className="h-3 w-3 mr-1" /> Digitar PNR
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => clickTargetAsStep(t, "type", surname)}>
                          <TypeIcon className="h-3 w-3 mr-1" /> Digitar sobrenome
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">JSON bruto</summary>
              <pre className="mt-2 bg-muted/40 p-2 rounded overflow-auto max-h-64">
                {JSON.stringify(vision, null, 2)}
              </pre>
            </details>
          </Card>
        )}

        {/* Utility steps */}
        <Card className="col-span-12 p-4">
          <div className="text-xs font-medium mb-2">Adicionar passo manual (já executa na sessão)</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => addManualStep({ action: "wait", ms: 2000 }, "Esperar 2s")}>
              <Clock className="h-3 w-3 mr-1" /> Esperar 2s
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => addManualStep({ action: "press", key: "Enter" }, "Enter")}>
              ⏎ Enter
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => addManualStep({ action: "scroll", dy: 400 }, "Scroll ↓400")}>
              <ArrowUp className="h-3 w-3 mr-1 rotate-180" /> Scroll ↓400
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !sessionId} onClick={() => addManualStep({ action: "wait", ms: 8000 }, "Esperar carregar 8s")}>
              <Clock className="h-3 w-3 mr-1" /> Esperar carregar 8s
            </Button>
          </div>
        </Card>

        {pdfs.length > 0 && (
          <Card className="col-span-12 p-4">
            <div className="text-xs font-medium mb-2">PDFs capturados nesta sessão</div>
            <ul className="space-y-1 text-xs">
              {pdfs.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-muted-foreground">{p.sizeKb} KB</span>
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-brand-orange underline truncate flex-1">
                    {p.path}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Card className="col-span-12 p-4">
            <div className="text-xs font-medium mb-2">Logs da última reexecução</div>
            <pre className="text-xs bg-muted/40 p-2 rounded overflow-auto max-h-48">
              {JSON.stringify(logs, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  );
}
