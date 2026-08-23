/**
 * Abre o documento (plano de viagem / bilhete) em uma aba do navegador,
 * fora do painel admin — evita ficar "preso" dentro do app instalado (PWA).
 */
import { toast } from "sonner";
import { criarLinkComprovante } from "./comprovante.functions";
import { DOC_EVENT } from "@/components/docs/DocumentoViewer";

export type TipoDoc = "reserva" | "bilhete" | "pedido";

export async function linkDocumento(
  tipo: TipoDoc,
  id: string | number,
  opcoes: { semValores?: boolean } = {},
): Promise<string | null> {
  try {
    const r = await criarLinkComprovante({ data: { tipo, id: String(id) } });
    if (!r?.ok) return null;
    const url = new URL(r.caminho, window.location.origin);
    if (opcoes.semValores) url.searchParams.set("valores", "0");
    return url.toString();
  } catch {
    return null;
  }
}

const TITULOS: Record<TipoDoc, string> = {
  reserva: "Plano de viagem",
  bilhete: "Bilhete eletrônico",
  pedido: "Plano de viagem",
};

function shellHtml(url: string, titulo: string): string {
  const u = JSON.stringify(url);
  const t = titulo.replace(/</g, "&lt;");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${t} — VIA AIR</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#e9edf1;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  iframe{border:0;width:100%;height:100%;display:block;background:#fff}
  .barra{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;display:flex;gap:8px;background:rgba(15,29,48,.95);padding:8px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.28);z-index:10}
  .barra button{border:0;cursor:pointer;color:#fff;background:transparent;font-size:13px;font-weight:600;padding:9px 14px;border-radius:999px}
  .barra button:hover{background:rgba(255,255,255,.12)}
  .barra .p{background:#F26B1F}
  @media print{.barra{display:none}}
</style></head><body>
<iframe id="doc" src=${u}></iframe>
<div class="barra">
  <button class="p" onclick="imprimir()">Imprimir / Salvar PDF</button>
  <button onclick="compartilhar()">Compartilhar</button>
  <button onclick="copiar()">Copiar link</button>
</div>
<script>
var URL_DOC=${u};
function imprimir(){try{var f=document.getElementById('doc');f.contentWindow.focus();f.contentWindow.print();}catch(e){window.print();}}
function compartilhar(){
  if(navigator.share){navigator.share({title:document.title,url:URL_DOC}).catch(function(){});}
  else{window.open('https://wa.me/?text='+encodeURIComponent(document.title+': '+URL_DOC),'_blank');}
}
function copiar(){navigator.clipboard.writeText(URL_DOC);}
document.getElementById('doc').addEventListener('load',function(){setTimeout(imprimir,600);});
</script></body></html>`;
}

export async function abrirDocumento(
  tipo: TipoDoc,
  id: string | number,
  opcoes: { semValores?: boolean } = {},
): Promise<void> {
  // Abre igual à NFS-e: nova aba (about:blank) que já cai na tela de
  // imprimir / salvar PDF, com botão de compartilhar.
  const w = window.open("", "_blank");
  const url = await linkDocumento(tipo, id, opcoes);
  if (!url) {
    try { w?.close(); } catch { /* noop */ }
    toast.error("Não foi possível gerar o link do documento.");
    return;
  }
  if (!w) {
    // Pop-up bloqueado: cai na janela flutuante dentro do app
    window.dispatchEvent(
      new CustomEvent(DOC_EVENT, { detail: { url, titulo: TITULOS[tipo] } }),
    );
    return;
  }
  w.document.open();
  w.document.write(shellHtml(url, TITULOS[tipo]));
  w.document.close();
}

