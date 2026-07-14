import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ChevronLeft, Chrome, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/instalar-extensao")({
  head: () => ({ meta: [{ title: "Instalar extensão — Via Air" }] }),
  component: InstalarExtensao,
});

function InstalarExtensao() {
  function download() {
    fetch("/via-air-import.zip")
      .then((r) => { if (!r.ok) throw new Error("Falha ao baixar (" + r.status + ")"); return r.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "via-air-import.zip";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      })
      .catch((e) => alert(e.message));
  }

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

      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-3">
            <Chrome className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-medium">Passo 1 — Baixar</div>
            <p className="text-sm text-muted-foreground mt-1">
              Baixe o arquivo <code className="text-xs bg-muted px-1 py-0.5 rounded">via-air-import.zip</code> e descompacte em uma pasta do seu computador
              (ex.: <code className="text-xs bg-muted px-1 py-0.5 rounded">Documentos/via-air-extensao</code>). Não apague essa pasta depois.
            </p>
            <Button onClick={download} className="mt-3 gap-2">
              <Download className="h-4 w-4" /> Baixar extensão (.zip)
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-medium">Passo 2 — Instalar no navegador</div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>Abra <code className="bg-muted px-1 rounded">chrome://extensions</code> (ou <code className="bg-muted px-1 rounded">edge://extensions</code>, <code className="bg-muted px-1 rounded">brave://extensions</code>).</li>
          <li>Ative o <b>Modo do desenvolvedor</b> (canto superior direito).</li>
          <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta que você descompactou.</li>
          <li>A extensão <b>Via Air — Importar reserva aérea</b> deve aparecer na lista, ativa.</li>
          <li>(Opcional) Fixe o ícone da extensão na barra pra facilitar.</li>
        </ol>
      </Card>

      <Card className="p-5">
        <div className="font-medium">Passo 3 — Usar</div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>No admin, abra o pedido e clique em <b>Importar aéreo</b>.</li>
          <li>Escolha a companhia e preencha os campos (localizador, sobrenome, IATA de origem).</li>
          <li>Clique em <b>Abrir página da cia</b>. Vai abrir em nova aba já com seus dados.</li>
          <li>Resolva captcha se aparecer e espere a página carregar a reserva.</li>
          <li>Clique no botão <b>📥 Importar pra Via Air</b> que aparece no canto inferior direito.</li>
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
