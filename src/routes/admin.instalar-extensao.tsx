import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ChevronLeft, Chrome, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Versão esperada — bate com extension/manifest.json
const EXPECTED_VERSION = "1.7.15";

export const Route = createFileRoute("/admin/instalar-extensao")({
  head: () => ({ meta: [{ title: "Instalar extensão — Via Air" }] }),
  component: InstalarExtensao,
});

function InstalarExtensao() {
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { __viaair?: string; version?: string } | null;
      if (!d || d.__viaair !== "ready") return;
      setDetected(true);
      if (d.version) setInstalledVersion(d.version);
    }
    window.addEventListener("message", onMsg);
    // Ping — se a extensão estiver ativa, responde com "ready" e a versão.
    window.postMessage({ __viaair: "ping" }, window.location.origin);
    const iv = setInterval(() => window.postMessage({ __viaair: "ping" }, window.location.origin), 1000);
    const stop = setTimeout(() => clearInterval(iv), 5000);
    return () => { window.removeEventListener("message", onMsg); clearInterval(iv); clearTimeout(stop); };
  }, []);

  function download() {
    // cache-bust pra garantir que baixa o zip mais novo publicado
    const url = "/via-air-import.zip?v=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("Falha ao baixar (" + r.status + ")"); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `via-air-import-v${EXPECTED_VERSION}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      })
      .catch((e) => alert(e.message));
  }

  const isUpToDate = detected && installedVersion === EXPECTED_VERSION;
  const isOutdated = detected && installedVersion && installedVersion !== EXPECTED_VERSION;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/pedidos" className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar aos pedidos
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Extensão de importação de reservas</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          A extensão lê os dados da página oficial de "Minhas Viagens" da LATAM, GOL ou AZUL
          e envia pro admin da Via Air, pra você conferir e importar num clique.
          Funciona em Chrome, Edge, Brave, Opera e qualquer navegador Chromium.
        </p>
      </div>

      {/* Status da versão */}
      <Card className={`p-4 border-2 ${
        isUpToDate ? "border-emerald-300 bg-emerald-50" :
        isOutdated ? "border-amber-300 bg-amber-50" :
        "border-border"
      }`}>
        <div className="flex items-center gap-3 text-sm">
          {isUpToDate ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
              <div>
                <div className="font-medium text-emerald-900">Extensão instalada e atualizada</div>
                <div className="text-emerald-800 text-xs">Versão {installedVersion} — última disponível</div>
              </div>
            </>
          ) : isOutdated ? (
            <>
              <AlertCircle className="h-5 w-5 text-amber-700 shrink-0" />
              <div>
                <div className="font-medium text-amber-900">Extensão desatualizada</div>
                <div className="text-amber-800 text-xs">
                  Você tem a v{installedVersion} instalada. Última disponível: v{EXPECTED_VERSION}. Baixe abaixo e recarregue em <code>chrome://extensions</code>.
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <div className="font-medium">Extensão não detectada nesta página</div>
                <div className="text-muted-foreground text-xs">
                  Última versão disponível: <b>v{EXPECTED_VERSION}</b>. Se você já instalou, recarregue a extensão em <code>chrome://extensions</code> e dê F5 aqui.
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-3">
            <Chrome className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-medium">Passo 1 — Baixar (v{EXPECTED_VERSION})</div>
            <p className="text-sm text-muted-foreground mt-1">
              Baixe o arquivo <code className="text-xs bg-muted px-1 py-0.5 rounded">via-air-import-v{EXPECTED_VERSION}.zip</code> e descompacte em uma pasta do seu computador
              (ex.: <code className="text-xs bg-muted px-1 py-0.5 rounded">Documentos/via-air-extensao</code>). Não apague essa pasta depois.
            </p>
            <Button onClick={download} className="mt-3 gap-2">
              <Download className="h-4 w-4" /> Baixar extensão v{EXPECTED_VERSION} (.zip)
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-medium">Passo 2 — Instalar no navegador</div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>Abra <code className="bg-muted px-1 rounded">chrome://extensions</code> (ou <code className="bg-muted px-1 rounded">edge://extensions</code>, <code className="bg-muted px-1 rounded">brave://extensions</code>).</li>
          <li>Ative o <b>Modo do desenvolvedor</b> (canto superior direito).</li>
          <li>Se já tem uma versão antiga, clique em <b>Remover</b> primeiro pra evitar conflito.</li>
          <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta que você descompactou.</li>
          <li>A extensão <b>Via Air — Importar reserva aérea v{EXPECTED_VERSION}</b> deve aparecer na lista, ativa.</li>
          <li>Recarregue esta página (F5) — o status acima vai mudar pra "atualizada".</li>
        </ol>
      </Card>

      <Card className="p-5">
        <div className="font-medium">Passo 3 — Usar</div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>No admin, abra o pedido e clique em <b>Importar aéreo</b>.</li>
          <li>Escolha a companhia e preencha os campos (localizador, sobrenome, IATA de origem).</li>
          <li>Clique em <b>Abrir página da cia</b>. Vai abrir em nova aba já com seus dados.</li>
          <li>Resolva captcha se aparecer e espere a página carregar a reserva.</li>
          <li>Clique no botão <b>📤 Exportar para Via Air</b> que aparece no canto inferior direito.</li>
          <li>Volte pro admin — a tela de conferência abre sozinha com os dados prontos pra revisar e salvar.</li>
        </ol>
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Se algum dado não vier (CPF, por exemplo), você preenche à mão na tela de conferência antes de salvar.
        </div>
      </Card>
    </div>
  );
}
