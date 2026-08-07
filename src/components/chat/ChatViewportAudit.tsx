import { useEffect, useState } from "react";

/**
 * Painel TEMPORÁRIO de auditoria do viewport (somente leitura).
 * Não altera layout: renderiza em position:fixed por cima, sem afetar o fluxo.
 * Remover depois do diagnóstico.
 */

type Snap = Record<string, number | string>;

function ler(): Snap {
  if (typeof window === "undefined") return {};
  const vv = window.visualViewport;
  const root = document.querySelector('[style*="100dvh"]') as HTMLElement | null;
  const r = root?.getBoundingClientRect();
  const n = (v: number | undefined) => (v === undefined ? -1 : Math.round(v * 10) / 10);
  return {
    innerHeight: n(window.innerHeight),
    vvHeight: n(vv?.height),
    vvOffsetTop: n(vv?.offsetTop),
    vvPageTop: n(vv?.pageTop),
    scrollY: n(window.scrollY),
    docClientH: n(document.documentElement.clientHeight),
    bodyClientH: n(document.body.clientHeight),
    rootTop: n(r?.top),
    rootBottom: n(r?.bottom),
    rootAchado: root ? "sim" : "NAO",
    hora: new Date().toLocaleTimeString("pt-BR"),
  };
}

export function ChatViewportAudit() {
  const [agora, setAgora] = useState<Snap>({});
  const [capturas, setCapturas] = useState<{ nome: string; s: Snap }[]>([]);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    const upd = () => setAgora(ler());
    upd();
    const t = setInterval(upd, 250);
    window.visualViewport?.addEventListener("resize", upd);
    window.visualViewport?.addEventListener("scroll", upd);
    window.addEventListener("resize", upd);
    window.addEventListener("scroll", upd);
    return () => {
      clearInterval(t);
      window.visualViewport?.removeEventListener("resize", upd);
      window.visualViewport?.removeEventListener("scroll", upd);
      window.removeEventListener("resize", upd);
      window.removeEventListener("scroll", upd);
    };
  }, []);

  const capturar = (nome: string) => setCapturas((c) => [...c, { nome, s: ler() }]);

  const linhas = Object.entries(agora);

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        style={{
          position: "fixed", right: 6, top: 6, zIndex: 2147483647,
          background: "#111", color: "#0f0", fontSize: 11, padding: "4px 8px", borderRadius: 6,
        }}
      >
        VV
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", right: 4, top: 4, zIndex: 2147483647,
        background: "rgba(0,0,0,.88)", color: "#0f0", fontFamily: "monospace",
        fontSize: 10, lineHeight: 1.35, padding: 6, borderRadius: 8, maxWidth: 210,
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        <button onClick={() => capturar("1-fechado")} style={{ background: "#222", padding: "2px 4px" }}>1</button>
        <button onClick={() => capturar("2-aberto")} style={{ background: "#222", padding: "2px 4px" }}>2</button>
        <button onClick={() => capturar("3-refechado")} style={{ background: "#222", padding: "2px 4px" }}>3</button>
        <button
          onClick={() => {
            const txt = capturas.map((c) => `${c.nome}: ${JSON.stringify(c.s)}`).join("\n");
            void navigator.clipboard?.writeText(txt);
          }}
          style={{ background: "#222", padding: "2px 4px" }}
        >
          copiar
        </button>
        <button onClick={() => setAberto(false)} style={{ background: "#222", padding: "2px 4px" }}>x</button>
      </div>
      {linhas.map(([k, v]) => (
        <div key={k}>
          {k}: <span style={{ color: "#fff" }}>{String(v)}</span>
        </div>
      ))}
      {capturas.length > 0 && (
        <div style={{ marginTop: 4, borderTop: "1px solid #333", paddingTop: 4, color: "#ff0" }}>
          {capturas.map((c, i) => (
            <div key={i}>
              {c.nome}: ih={String(c.s.innerHeight)} vv={String(c.s.vvHeight)} off={String(c.s.vvOffsetTop)} sy=
              {String(c.s.scrollY)} dch={String(c.s.docClientH)} rb={String(c.s.rootBottom)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
