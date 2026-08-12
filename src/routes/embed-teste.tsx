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
  style="width:100%;max-width:1320px;height:496px;border:0;display:block;margin:0 auto;background:#0a1622;border-radius:16px;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  title="Pacotes em destaque VIA AIR"
></iframe>`;

  const motorUrl = `${origin}/embed/motor-busca`;
  const motorSnippet = `<iframe
  src="${motorUrl}"
  style="width:100%;max-width:1100px;height:260px;border:0;display:block;margin:0 auto;background:transparent;"
  loading="lazy"
  referrerpolicy="no-referrer-when-downgrade"
  title="Buscar passagens aéreas VIA AIR"
></iframe>`;

  const [copiedMotor, setCopiedMotor] = useState(false);
  async function copyMotor() {
    try {
      await navigator.clipboard.writeText(motorSnippet);
      setCopiedMotor(true);
      setTimeout(() => setCopiedMotor(false), 1800);
    } catch {}
  }

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
              height: 496,
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
        <div className="mt-12 rounded-2xl border border-white/10 bg-[#0a1622] p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-white/40">
            Widget do motor de busca (passagens aéreas)
          </div>
          <iframe
            src="/embed/motor-busca"
            style={{
              width: "100%",
              maxWidth: 1100,
              height: 260,
              border: 0,
              display: "block",
              margin: "0 auto",
            }}
            title="Buscar passagens aéreas VIA AIR"
          />

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-white/40">
              Código para colar no WordPress
            </div>
            <button
              type="button"
              onClick={copyMotor}
              className="rounded-full bg-brand-orange px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
            >
              {copiedMotor ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-4 text-xs leading-relaxed text-white/85">
            <code>{motorSnippet}</code>
          </pre>
          <p className="mt-3 text-xs text-white/50">
            Ao buscar, o visitante é levado para <code>{origin}/voar</code> com
            os parâmetros preenchidos. Ao clicar em "Comprar agora" ele vai
            direto pro carrinho da operadora e o sistema registra um pedido
            pendente em /admin/pedidos.
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-white/10 bg-[#0a1622] p-4">
          <div className="mb-3 text-xs uppercase tracking-widest text-white/40">
            Widget de passagens aéreas baratas (sem passo a passo)
          </div>
          <iframe
            src="/embed/passagens-baratas"
            style={{
              width: "100%",
              maxWidth: 1320,
              height: 900,
              border: 0,
              display: "block",
              margin: "0 auto",
            }}
            title="Passagens aéreas baratas VIA AIR"
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-white/40">
              Código para colar no WordPress
            </div>
            <button
              type="button"
              onClick={copyBaratas}
              className="rounded-full bg-brand-orange px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:brightness-110"
            >
              {copiedBaratas ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-4 text-xs leading-relaxed text-white/85">
            <code>{baratasSnippet}</code>
          </pre>
          <p className="mt-3 text-xs text-white/50">
            O snippet já ajusta a altura sozinho conforme o conteúdo. Os filtros
            de origem e mês ficam dentro do widget e "Ver voos" abre o motor
            VIA AIR em nova aba.
          </p>
        </div>
      </div>
    </div>
  );
}
