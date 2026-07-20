import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Eye, Trash2, Type as TypeIcon, MousePointer2, Clock, ArrowUp } from "lucide-react";
import {
  runTrainingScript,
  askVisionAboutScreenshot,
  type TrainingStep,
} from "@/lib/checkin/training.functions";

export const Route = createFileRoute("/admin/checkin-treino")({
  head: () => ({ meta: [{ title: "Treinador de Check-in — VIA AIR" }] }),
  component: TreinoPage,
});

type VisionTarget = { label: string; x: number; y: number; w: number; h: number; confidence?: number };
type VisionParsed = { reasoning?: string; targets?: VisionTarget[]; notes?: string; raw?: string };

const DEFAULT_URL = "https://www.latamairlines.com/br/pt/checkin";
const DEFAULT_QUESTION =
  "Identifique os campos para iniciar check-in por localizador (código de reserva) e sobrenome, e o botão para continuar. Retorne cada elemento em 'targets' com coordenadas do centro e tamanho.";

function TreinoPage() {
  const runScript = useServerFn(runTrainingScript);
  const askVision = useServerFn(askVisionAboutScreenshot);

  const [url, setUrl] = useState(DEFAULT_URL);
  const [pnr, setPnr] = useState("LA9571886LWKG");
  const [surname, setSurname] = useState("PEREIRA");
  const [steps, setSteps] = useState<TrainingStep[]>([]);
  const [shot, setShot] = useState<{ b64: string; w: number; h: number; url: string; title: string } | null>(null);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [vision, setVision] = useState<VisionParsed | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const runAll = async () => {
    setBusy(true);
    setVision(null);
    setSelectedTarget(null);
    try {
      const r = await runScript({ data: { url, steps, viewportWidth: 1280, viewportHeight: 900 } });
      setShot({ b64: r.screenshot, w: r.width, h: r.height, url: r.currentUrl, title: r.title });
      setLogs(r.logs);
      toast.success(`Página aberta: ${r.title || r.currentUrl}`);
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

  const addStep = (s: TrainingStep) => setSteps((prev) => [...prev, s]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));

  const clickTargetAsStep = (t: VisionTarget, mode: "click" | "type", text = "") => {
    if (mode === "click") addStep({ action: "click", x: Math.round(t.x), y: Math.round(t.y) });
    else addStep({ action: "type", x: Math.round(t.x), y: Math.round(t.y), text, clearFirst: true });
    toast.success(`Passo adicionado (${mode}) em ${t.label}`);
  };

  const scale = useMemo(() => {
    if (!shot || !imgRef.current) return 1;
    return imgRef.current.clientWidth / shot.w;
  }, [shot]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Treinador de Check-in</h1>
          <p className="text-sm text-muted-foreground">
            Abra a página da cia, tire print, deixe a IA identificar onde clicar. Você valida antes de virar passo.
          </p>
        </div>
        <Badge variant="outline">MVP · LATAM</Badge>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Config */}
        <Card className="col-span-12 lg:col-span-4 p-4 space-y-3">
          <div>
            <label className="text-xs font-medium">URL inicial</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1" />
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
                <p className="text-xs text-muted-foreground">Nenhum passo. Rode o script pra começar.</p>
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
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={runAll} disabled={busy} className="flex-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Executar & Print
            </Button>
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
              Clique em <strong>Executar & Print</strong> pra abrir a página.
            </div>
          )}
          {shot && (
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                <span className="font-mono">{shot.url}</span>
                <span>·</span>
                <span>
                  {shot.w}×{shot.h}
                </span>
              </div>
              <div className="relative inline-block border rounded overflow-hidden bg-black/5">
                <img
                  ref={imgRef}
                  src={`data:image/jpeg;base64,${shot.b64}`}
                  className="block w-full h-auto"
                  alt="screenshot"
                />
                {vision?.targets?.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedTarget(i)}
                    className={`absolute border-2 transition ${
                      selectedTarget === i
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
                    <span className="absolute -top-5 left-0 text-[10px] font-mono bg-emerald-600 text-white px-1 rounded whitespace-nowrap">
                      {i + 1}. {t.label}
                    </span>
                  </button>
                ))}
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
                <div className="text-xs font-medium mb-2">Alvos identificados — valide e vire passo:</div>
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
                        <Button size="sm" variant="outline" onClick={() => clickTargetAsStep(t, "click")}>
                          <MousePointer2 className="h-3 w-3 mr-1" /> Clicar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => clickTargetAsStep(t, "type", pnr)}>
                          <TypeIcon className="h-3 w-3 mr-1" /> Digitar PNR
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => clickTargetAsStep(t, "type", surname)}>
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
          <div className="text-xs font-medium mb-2">Adicionar passo manual</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => addStep({ action: "wait", ms: 2000 })}>
              <Clock className="h-3 w-3 mr-1" /> Esperar 2s
            </Button>
            <Button size="sm" variant="outline" onClick={() => addStep({ action: "press", key: "Enter" })}>
              ⏎ Enter
            </Button>
            <Button size="sm" variant="outline" onClick={() => addStep({ action: "scroll", dy: 400 })}>
              <ArrowUp className="h-3 w-3 mr-1 rotate-180" /> Scroll ↓400
            </Button>
          </div>
        </Card>

        {/* Logs */}
        {logs.length > 0 && (
          <Card className="col-span-12 p-4">
            <div className="text-xs font-medium mb-2">Logs da execução</div>
            <pre className="text-xs bg-muted/40 p-2 rounded overflow-auto max-h-48">
              {JSON.stringify(logs, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </div>
  );
}
