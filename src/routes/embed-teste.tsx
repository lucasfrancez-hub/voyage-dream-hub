/**
 * Página de teste do widget de embed pra WordPress.
 * Simula o container do site do cliente (largura, fundo) e mostra o mesmo
 * carrossel que sai no iframe /embed/pacotes-destaque, além do snippet HTML
 * pronto pra colar no WordPress.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

const EMBED_PATH = "/embed/pacotes-destaque";

export const Route = createFileRoute("/embed-teste")({
  head: () => ({
    meta: [
      { title: "Teste do widget · VIA AIR" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedTestePage,
});

function EmbedTestePage() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = `${origin}${EMBED_PATH}`;

  const snippet = `<iframe
  src="${embedUrl}"
  style="width:100%;max-width:1320px;height:560px;border:0;display:block;margin:0 auto;background:#0a1622;border-radius:16px;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  title="Pacotes em destaque VIA AIR"
></iframe>`;

  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="min-h-screen bg-[#050a10] text-white">
      <div className="mx-auto max-w-[1360px] px-4 py-8">
        <h1 className="text-2xl font-bold">Teste do widget para WordPress</h1>
        <p className="mt-1 text-sm text-white/60">
          Prévia real do iframe. A largura simula um container comum de tema
          WordPress (max 1320px).
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-[#0a1622] p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-white/40">
            Prévia
          </div>
          <iframe
            src={EMBED_PATH}
            style={{
              width: "100%",
              maxWidth: 1320,
              height: 560,
              border: 0,
              display: "block",
              margin: "0 auto",
              background: "#0a1622",
              borderRadius: 16,
            }}
            title="Pacotes em destaque VIA AIR"
          />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-[#0a1622] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-white/40">
              Código para colar no WordPress (bloco HTML customizado)
            </div>
            <button
              type="button"
              onClick={copy}
              className="rounded-full bg-brand-orange px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-black/60 p-4 text-xs leading-relaxed text-white/85">
            <code>{snippet}</code>
          </pre>
          <p className="mt-3 text-xs text-white/50">
            No WordPress: adicione um bloco "HTML personalizado" onde o widget
            deve aparecer e cole o código acima. A altura padrão é 560px —
            ajuste no atributo <code>height</code> se precisar.
          </p>
        </div>
      </div>
    </div>
  );
}
