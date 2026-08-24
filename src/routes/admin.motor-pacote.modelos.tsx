import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Hotel, Plane, Check, Star, Luggage, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/motor-pacote/modelos")({
  head: () => ({
    meta: [
      { title: "Modelos do Motor de Pacotes | VIA AIR" },
      { name: "description", content: "Comparativo visual dos três modelos de interface do Motor de Pacotes VIA AIR." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Modelos do Motor de Pacotes" },
      { property: "og:description", content: "Três direções visuais para a montagem de pacotes VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

/* ------------------------------ dados fictícios ----------------------------- */
const D = {
  destino: "São Paulo (SAO)",
  periodo: "08/09 a 28/09",
  pax: "2 adultos",
  noites: "20 noites",
  voo: {
    cia: "LATAM",
    rota: "MGF → GRU",
    horarios: "06:15 → 07:45",
    duracao: "01h30",
    escalas: "Direto",
    bagagem: "1 bagagem despachada",
    preco: "R$ 1.632,90",
  },
  hotel: {
    nome: "Ibis Styles São Paulo Faria Lima",
    local: "Pinheiros, São Paulo",
    regime: "Café da manhã incluso",
    estrelas: 3,
    preco: "R$ 2.940,79",
  },
  servicos: [
    { t: "Transfer aeroporto ⇄ hotel", v: "R$ 180,00" },
    { t: "Seguro viagem nacional", v: "Incluído" },
    { t: "City tour São Paulo", v: "R$ 240,00" },
  ],
  total: "R$ 4.573,69",
};

const navy = "bg-[oklch(0.19_0.04_250)]";
const card = "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur";

function Preco({ children, grande }: { children: React.ReactNode; grande?: boolean }) {
  return <b className={grande ? "text-2xl text-brand-orange" : "text-sm text-brand-orange"}>{children}</b>;
}

function Resumo({ compacto }: { compacto?: boolean }) {
  return (
    <aside className={`${card} p-5 ${compacto ? "" : "lg:sticky lg:top-6"}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Resumo do pacote</p>
      <h3 className="mt-1 text-xl font-semibold text-white">{D.destino}</h3>
      <p className="mb-3 text-xs text-white/60">{`${D.noites} · ${D.pax} · ${D.periodo}`}</p>
      {[
        ["Aéreo", D.voo.preco],
        ["Hospedagem", D.hotel.preco],
        ["Serviços", "Incluídos"],
      ].map(([r, v]) => (
        <div key={r} className="flex justify-between border-t border-white/10 py-2.5 text-xs text-white/80">
          <span className="text-white/55">{r}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
      <div className="mt-3 rounded-xl bg-white/[0.06] p-3">
        <small className="block text-[11px] text-white/55">Valor total do pacote</small>
        <Preco grande>{D.total}</Preco>
      </div>
      <button className="mt-3 w-full rounded-xl bg-brand-orange py-2.5 text-sm font-semibold text-black">
        Reservar pacote
      </button>
    </aside>
  );
}

function BlocoVoo({ destaque }: { destaque?: boolean }) {
  return (
    <section className={`${card} p-4 ${destaque ? "ring-1 ring-brand-orange/40" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Plane className="h-4 w-4 text-brand-orange" /> Voo selecionado
        </h3>
        <button className="rounded-lg border border-white/15 px-3 py-1 text-[11px] text-white/70">Alterar voo</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b className="text-white">{D.voo.cia}</b>
          <p className="text-[11px] text-white/60">{`${D.voo.rota} · ${D.voo.horarios} · ${D.voo.escalas}`}</p>
          <p className="mt-1 flex items-center gap-3 text-[11px] text-white/50">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{D.voo.duracao}</span>
            <span className="flex items-center gap-1"><Luggage className="h-3 w-3" />{D.voo.bagagem}</span>
          </p>
        </div>
        <Preco>{D.voo.preco}</Preco>
      </div>
    </section>
  );
}

function BlocoHotel({ fotoGrande }: { fotoGrande?: boolean }) {
  return (
    <section className={`${card} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Hotel className="h-4 w-4 text-brand-orange" /> Hospedagem
        </h3>
        <button className="rounded-lg border border-white/15 px-3 py-1 text-[11px] text-white/70">Alterar hospedagem</button>
      </div>
      <div className={fotoGrande ? "space-y-3" : "grid gap-3 sm:grid-cols-[150px_1fr_auto]"}>
        <div className={`${fotoGrande ? "h-40" : "h-[100px]"} grid place-items-center overflow-hidden rounded-xl bg-white/10 text-white/40`}>
          <Hotel className="h-6 w-6" />
        </div>
        <div>
          <b className="text-white">{D.hotel.nome}</b>
          <p className="text-[11px] text-white/60">{D.hotel.local}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-white/50">
            {Array.from({ length: D.hotel.estrelas }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-brand-orange text-brand-orange" />
            ))}
            <span className="ml-2">{D.hotel.regime}</span>
          </p>
        </div>
        <Preco>{D.hotel.preco}</Preco>
      </div>
    </section>
  );
}

function BlocoServicos({ colunas }: { colunas?: boolean }) {
  return (
    <section className={`${card} p-4`}>
      <h3 className="mb-3 text-sm font-semibold text-white">Serviços</h3>
      <div className={colunas ? "grid gap-2 sm:grid-cols-3" : "grid gap-2"}>
        {D.servicos.map((s) => (
          <label key={s.t} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/80">
            <span>{s.t}</span>
            <span className="flex items-center gap-2 font-semibold text-white/90">
              {s.v}
              <Check className="h-3.5 w-3.5 text-brand-orange" />
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- modelos -------------------------------- */
function ModeloA() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <header className={`${card} p-4`}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-orange">Pacote recomendado</p>
          <h2 className="text-xl font-semibold text-white">{D.destino}</h2>
          <p className="text-xs text-white/60">{`${D.noites} · ${D.pax}`}</p>
        </header>
        <BlocoVoo />
        <BlocoHotel />
        <BlocoServicos />
      </div>
      <Resumo />
    </div>
  );
}

function ModeloB() {
  return (
    <div className="space-y-4">
      <header className="rounded-2xl bg-gradient-to-r from-brand-orange/25 to-transparent p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-orange">Pacote montado</p>
        <h2 className="text-2xl font-semibold text-white">{D.destino}</h2>
        <p className="text-xs text-white/70">{`${D.noites} · ${D.pax} · ${D.periodo}`}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <BlocoVoo destaque />
          <BlocoHotel fotoGrande />
        </div>
        <Resumo compacto />
      </div>
      <BlocoServicos colunas />
    </div>
  );
}

function ModeloC() {
  const etapas = ["Voo", "Hospedagem", "Serviços", "Resumo"];
  const [etapa, setEtapa] = useState(0);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        {etapas.map((e, i) => (
          <button
            key={e}
            onClick={() => setEtapa(i)}
            className={`flex-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${i === etapa ? "bg-brand-orange text-black" : "border border-white/10 text-white/60"}`}
          >
            {i + 1}. {e}
          </button>
        ))}
      </div>
      {etapa === 0 && <BlocoVoo destaque />}
      {etapa === 1 && <BlocoHotel fotoGrande />}
      {etapa === 2 && <BlocoServicos />}
      {etapa === 3 && <Resumo compacto />}
      <div className="flex justify-between">
        <button onClick={() => setEtapa((v) => Math.max(0, v - 1))} className="rounded-xl border border-white/15 px-4 py-2 text-xs text-white/70">
          Voltar
        </button>
        <button onClick={() => setEtapa((v) => Math.min(3, v + 1))} className="rounded-xl bg-brand-orange px-5 py-2 text-xs font-semibold text-black">
          Continuar
        </button>
      </div>
    </div>
  );
}

function Page() {
  const [m, setM] = useState<"a" | "b" | "c">("a");
  const nomes = { a: "A · Coluna + resumo fixo", b: "B · Bento", c: "C · Passo a passo" } as const;
  return (
    <div className={`min-h-screen ${navy} p-4 md:p-8`}>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/admin/motor-pacote" className="flex items-center gap-1 text-xs font-semibold text-white/60 hover:text-white">
            <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao motor
          </Link>
          <h1 className="text-sm font-semibold text-white">Modelos do Motor de Pacotes</h1>
          <div className="ml-auto flex gap-1.5">
            {(["a", "b", "c"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setM(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${m === k ? "bg-brand-orange text-black" : "border border-white/15 text-white/60"}`}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-white/50">{nomes[m]} — dados de exemplo, só para escolher o visual.</p>
        {m === "a" && <ModeloA />}
        {m === "b" && <ModeloB />}
        {m === "c" && <ModeloC />}
      </div>
    </div>
  );
}
