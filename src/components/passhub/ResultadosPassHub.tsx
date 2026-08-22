import { useEffect, useMemo, useState } from "react";
import { Filter, Luggage, Briefcase, Plus, Check, Info, FileText, X } from "lucide-react";
import type { PassHubOferta, PassHubResultado, PassHubVoo } from "@/lib/passhub/types";

export type FiltrosMotor = {
  ordem: "preco" | "duracao" | "partida" | "chegada";
  mostrar: number;
  bagagem: "todas" | "com" | "sem";
  direto: boolean;
  companhias: string[];
};

type Props = {
  resultado: PassHubResultado;
  filtros: FiltrosMotor;
  onReservar: (oferta: PassHubOferta) => void;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const hora = (dataHora: string) => (dataHora.split(" ")[1] ?? dataHora).slice(0, 5);
const minutosDoDia = (dataHora: string) => {
  const h = hora(dataHora);
  const [hh, mm] = h.split(":");
  return Number(hh || 0) * 60 + Number(mm || 0);
};
const diaCurto = (dataHora: string) => {
  const d = dataHora.split(" ")[0] ?? "";
  const p = d.split(/[-/]/);
  if (p.length < 3) return d;
  const [a, b, c] = p;
  const dd = a!.length === 4 ? c! : a!;
  const mm = b!;
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${dd} ${meses[Number(mm) - 1] ?? mm}`;
};

/** Cores oficiais por companhia — fundo da marca + texto legível. */
const CORES_CIA: Record<string, { bg: string; fg: string }> = {
  G3: { bg: "#ff7a00", fg: "#ffffff" },
  GOL: { bg: "#ff7a00", fg: "#ffffff" },
  AD: { bg: "#e11d2e", fg: "#ffffff" },
  AZUL: { bg: "#0a5bd3", fg: "#ffffff" },
  "2Z": { bg: "#0a5bd3", fg: "#ffffff" },
  LA: { bg: "#0b1b6b", fg: "#ffffff" },
  JJ: { bg: "#0b1b6b", fg: "#ffffff" },
  LATAM: { bg: "#0b1b6b", fg: "#ffffff" },
  AA: { bg: "#0c2f5a", fg: "#ffffff" },
  UA: { bg: "#0033a0", fg: "#ffffff" },
  DL: { bg: "#003268", fg: "#ffffff" },
  CM: { bg: "#0b3b8c", fg: "#ffffff" },
  AV: { bg: "#d0021b", fg: "#ffffff" },
  AR: { bg: "#4aa3df", fg: "#08283f" },
  TP: { bg: "#008f4c", fg: "#ffffff" },
  IB: { bg: "#d7192d", fg: "#ffffff" },
  AF: { bg: "#002157", fg: "#ffffff" },
  KL: { bg: "#00a1de", fg: "#04263a" },
  LH: { bg: "#05164d", fg: "#ffffff" },
  TK: { bg: "#c8102e", fg: "#ffffff" },
  EK: { bg: "#d71921", fg: "#ffffff" },
  QR: { bg: "#5c0632", fg: "#ffffff" },
  BA: { bg: "#075aaa", fg: "#ffffff" },
  IG: { bg: "#0f766e", fg: "#ffffff" },
};

function corCia(codigo: string, nome: string) {
  const k1 = (codigo || "").toUpperCase();
  const k2 = (nome || "").toUpperCase().split(" ")[0] ?? "";
  return CORES_CIA[k1] ?? CORES_CIA[k2] ?? { bg: "#22303f", fg: "#e8f2ff" };
}

/** Nome amigável por código IATA, quando a API só devolve a sigla. */
const NOMES_CIA: Record<string, string> = {
  G3: "GOL",
  AD: "Azul",
  "2Z": "Azul Conecta",
  LA: "LATAM",
  JJ: "LATAM",
  AA: "American",
  UA: "United",
  DL: "Delta",
  CM: "Copa",
  AV: "Avianca",
  AR: "Aerolíneas",
  TP: "TAP",
  IB: "Ibéria",
  AF: "Air France",
  KL: "KLM",
  LH: "Lufthansa",
  TK: "Turkish",
  EK: "Emirates",
  QR: "Qatar",
  BA: "British",
  IG: "ITA Airways",
};

function nomeCia(codigo: string, nome?: string) {
  const n = (nome ?? "").trim();
  const cod = (codigo ?? "").trim().toUpperCase();
  if (n && n.toUpperCase() !== cod) return n;
  return NOMES_CIA[cod] ?? n ?? cod;
}

function BadgeCia({
  codigo,
  nome,
  grande,
}: {
  codigo: string;
  nome?: string;
  grande?: boolean;
}) {
  const c = corCia(codigo, nome ?? "");
  const label = nomeCia(codigo, nome);
  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-black tracking-wide ${
        grande ? "h-9 px-3.5 text-[15px]" : "h-7 px-2.5 text-[12px]"
      }`}
      style={{ background: c.bg, color: c.fg }}
      title={label}
    >
      {label}
    </span>
  );
}

const chaveVoo = (v: PassHubVoo) =>
  `${v.companhiaIata || v.companhia}-${v.numeroVoo}-${v.partida}-${v.chegada}-${v.familiaTarifaria}`;

type Perna = { chave: string; voo: PassHubVoo; oferta: PassHubOferta; preco: number };

type Segmento = {
  de: string;
  para: string;
  saida: string;
  chegada: string;
  voo: string;
  esperaAntes: string | null;
};

/** Quebra o voo em segmentos reais (1 por perna do itinerário). */
function segmentos(v: PassHubVoo): Segmento[] {
  const numeros = (v.numeroVoo || "")
    .split("/")
    .map((n) => n.trim())
    .filter(Boolean);
  const cx = v.conexoes ?? [];
  const out: Segmento[] = [];
  let deAtual = v.origem;
  let saidaAtual = v.partida;
  cx.forEach((c, i) => {
    out.push({
      de: deAtual,
      para: c.aeroporto,
      saida: saidaAtual,
      chegada: c.chegada,
      voo: numeros[i] ?? numeros[0] ?? v.numeroVoo,
      esperaAntes: i === 0 ? null : (cx[i - 1]?.duracao ?? null),
    });
    deAtual = c.aeroporto;
    saidaAtual = c.saida;
  });
  out.push({
    de: deAtual,
    para: v.destino,
    saida: saidaAtual,
    chegada: v.chegada,
    voo: numeros[cx.length] ?? numeros[numeros.length - 1] ?? v.numeroVoo,
    esperaAntes: cx.length ? (cx[cx.length - 1]?.duracao ?? null) : null,
  });
  return out;
}

function ordena(lista: Perna[], ordem: FiltrosMotor["ordem"]) {
  const copia = [...lista];
  copia.sort((a, b) => {
    if (ordem === "duracao") return a.voo.duracaoMinutos - b.voo.duracaoMinutos;
    if (ordem === "partida") return minutosDoDia(a.voo.partida) - minutosDoDia(b.voo.partida);
    if (ordem === "chegada") return minutosDoDia(a.voo.chegada) - minutosDoDia(b.voo.chegada);
    return a.preco - b.preco;
  });
  return copia;
}

/* -------------------------- resumo: cias + paradas -------------------------- */

function ResumoCias({
  pernas,
  selecionada,
  onSelecionar,
  paradasSel,
  onParadas,
}: {
  pernas: Perna[];
  selecionada: string | null;
  onSelecionar: (cia: string | null) => void;
  paradasSel: number | null;
  onParadas: (p: number | null) => void;
}) {
  const cias = useMemo(() => {
    const mapa = new Map<string, { preco: number; iata: string; nome: string }>();
    for (const p of pernas) {
      const nome = p.voo.companhia || p.voo.companhiaIata;
      const atual = mapa.get(nome);
      if (!atual || p.preco < atual.preco)
        mapa.set(nome, { preco: p.preco, iata: p.voo.companhiaIata || nome, nome });
    }
    return [...mapa.entries()].sort((a, b) => a[1].preco - b[1].preco);
  }, [pernas]);

  const paradas = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const p of pernas) {
      const n = p.voo.paradas;
      const atual = mapa.get(n);
      if (atual === undefined || p.preco < atual) mapa.set(n, p.preco);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [pernas]);

  if (!cias.length) return null;

  const rotuloParada = (n: number) =>
    n === 0 ? "Voo direto" : n === 1 ? "1 parada" : `${n} paradas`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {cias.map(({ 0: nome, 1: info }, i) => {
          const ativa = selecionada === nome;
          return (
            <button
              key={nome}
              type="button"
              onClick={() => onSelecionar(ativa ? null : nome)}
              className={`cons-soft flex items-center gap-3 px-3 py-2 text-left transition ${
                ativa ? "ring-2 ring-[var(--cons-orange)]" : "hover:brightness-125"
              }`}
            >
              <BadgeCia codigo={info.iata || nome} nome={nome} grande />
              <span className="text-[14px] font-black">
                {brl(info.preco)}
                {i === 0 && (
                  <span className="ml-2 rounded bg-[rgba(55,211,154,.18)] px-1.5 py-0.5 text-[10px] font-black text-[#8effd2]">
                    menor
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onParadas(null)}
          className={`cons-btn h-9 px-3 text-[12px] ${paradasSel === null ? "cons-btn-blue" : ""}`}
        >
          Todas
        </button>
        {paradas.map(([n, preco]) => (
          <button
            key={n}
            type="button"
            onClick={() => onParadas(paradasSel === n ? null : n)}
            className={`cons-btn h-9 px-3 text-[12px] ${paradasSel === n ? "cons-btn-blue" : ""}`}
          >
            {rotuloParada(n)} <span className="cons-muted">· {brl(preco)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- detalhes pop ------------------------------- */

function PainelDetalhe({
  voo,
  aba,
  onFechar,
}: {
  voo: PassHubVoo;
  aba: "info" | "docs";
  onFechar: () => void;
}) {
  return (
    <tr>
      <td colSpan={7} className="bg-[rgba(255,255,255,.03)] px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid flex-1 gap-3 md:grid-cols-2">
            {aba === "info" ? (
              <>
                <div>
                  <div className="cons-lab mb-1">Tarifa</div>
                  <div className="text-[13px]">
                    {voo.familiaTarifaria || "—"} · {voo.classe || "—"} · {voo.provedor || "—"}
                  </div>
                  <div className="mt-1 text-[12px] cons-muted">
                    Tarifa {brl(voo.precoTarifa)} + taxas {brl(voo.taxas)} ={" "}
                    <b className="text-[var(--cons-text)]">{brl(voo.precoTotal)}</b>
                  </div>
                  <div className="mt-1 text-[12px] cons-muted">
                    Bagagem despachada: {voo.bagagemDespachada ? `${voo.bagagemDespachadaQtd || 1} peça(s)` : "não inclusa"} ·
                    Mão: {voo.bagagemMao ? "inclusa" : "não inclusa"}
                  </div>
                </div>
                <div>
                  <div className="cons-lab mb-1">Parcelamento</div>
                  {voo.parcelamento?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {voo.parcelamento.map((p) => (
                        <span key={p.bandeira} className="cons-chip">
                          {p.bandeira}: {p.maxParcelas}x
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[12px] cons-muted">Sem informação de parcelamento.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="md:col-span-2">
                <div className="cons-lab mb-1">Serviços da tarifa</div>
                {voo.servicos?.length ? (
                  <ul className="grid gap-1 md:grid-cols-2">
                    {voo.servicos.map((s, i) => (
                      <li key={i} className="text-[12px]">
                        <span className={s.incluso ? "text-[#8effd2]" : "cons-muted"}>
                          {s.incluso ? "✓" : "✕"}
                        </span>{" "}
                        {s.descricao || s.tipo}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[12px] cons-muted">Sem detalhamento de serviços.</div>
                )}
              </div>
            )}
          </div>
          <button type="button" className="cons-btn h-8 px-2" onClick={onFechar}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ---------------------------------- linha ---------------------------------- */

function LinhaPerna({
  perna,
  selecionada,
  onSelecionar,
}: {
  perna: Perna;
  selecionada: boolean;
  onSelecionar: () => void;
}) {
  const v = perna.voo;
  const segs = segmentos(v);
  const [detalhe, setDetalhe] = useState<"info" | "docs" | null>(null);

  return (
    <>
      <tr className={`align-top ${selecionada ? "bg-[rgba(255,148,64,.09)]" : ""}`}>
        <td className="w-[62px] px-3 py-3">
          <button
            type="button"
            onClick={onSelecionar}
            aria-label={selecionada ? "Selecionado" : "Selecionar voo"}
            className={`grid h-9 w-9 place-items-center rounded-full border transition ${
              selecionada
                ? "border-transparent bg-[#f26b1f] text-white"
                : "border-[rgba(255,148,64,.45)] text-[#ff9440] hover:bg-[rgba(255,148,64,.12)]"
            }`}
          >
            {selecionada ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </td>

        <td className="px-2 py-3">
          <div className="flex items-center gap-2">
            <BadgeCia codigo={v.companhiaIata || v.companhia} nome={v.companhia} />
          </div>
          {v.operadoPor && v.operadoPor !== v.companhia && (
            <div className="mt-1 text-[10px] cons-muted">op. {v.operadoPor}</div>
          )}
        </td>

        {/* Itinerário: uma linha por segmento */}
        <td className="px-2 py-3">
          <div className="grid gap-1.5">
            {segs.map((s, i) => (
              <div key={i}>
                {s.esperaAntes && (
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#ffc496]">
                    conexão em {s.de} · espera {s.esperaAntes}
                  </div>
                )}
                <div className="cons-soft grid grid-cols-[62px_54px_16px_54px_62px_1fr] items-center gap-2 px-3 py-1.5">
                  <b className="text-[13px]">{hora(s.saida)}</b>
                  <span className="text-[12px] font-black">{s.de}</span>
                  <span className="cons-muted">→</span>
                  <span className="text-[12px] font-black">{s.para}</span>
                  <b className="text-[13px]">{hora(s.chegada)}</b>
                  <span className="text-[11px] cons-muted">
                    {s.voo} · {diaCurto(s.saida)}
                    {diaCurto(s.chegada) !== diaCurto(s.saida) ? ` → ${diaCurto(s.chegada)}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </td>

        <td className="px-2 py-3">
          <b className="text-[14px]">{v.duracao}</b>
          <div className="text-[11px] cons-muted">
            {v.paradas === 0 ? "voo direto" : v.paradas === 1 ? "1 parada" : `${v.paradas} paradas`}
          </div>
          {v.mudancaAeroporto && (
            <div className="mt-1 text-[10px] font-bold text-[#ffb4b4]">muda de aeroporto</div>
          )}
        </td>

        <td className="px-2 py-3">
          <div className="flex items-center gap-1.5">
            <span className="cons-chip">{v.classe || v.provedor || "—"}</span>
            <button
              type="button"
              title="Tarifa e parcelamento"
              onClick={() => setDetalhe((d) => (d === "info" ? null : "info"))}
              className={`grid h-7 w-7 place-items-center rounded-md ${
                detalhe === "info" ? "bg-[rgba(255,148,64,.2)] text-[#ffc496]" : "cons-muted hover:bg-white/5"
              }`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Serviços inclusos"
              onClick={() => setDetalhe((d) => (d === "docs" ? null : "docs"))}
              className={`grid h-7 w-7 place-items-center rounded-md ${
                detalhe === "docs" ? "bg-[rgba(255,148,64,.2)] text-[#ffc496]" : "cons-muted hover:bg-white/5"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>

        <td className="px-2 py-3">
          {v.bagagemDespachada ? (
            <span className="text-[12px] cons-muted">—</span>
          ) : (
            <div className="cons-box flex items-center justify-between gap-2 px-3 py-2">
              <Briefcase className="h-3.5 w-3.5 cons-muted" />
              <b className="text-[13px]">{brl(perna.preco)}</b>
            </div>
          )}
        </td>

        <td className="px-3 py-3">
          {v.bagagemDespachada ? (
            <div className="cons-box flex items-center justify-between gap-2 px-3 py-2">
              <Luggage className="h-3.5 w-3.5 cons-muted" />
              <b className="text-[13px]">{brl(perna.preco)}</b>
            </div>
          ) : (
            <span className="text-[12px] cons-muted">—</span>
          )}
        </td>
      </tr>
      {detalhe && <PainelDetalhe voo={v} aba={detalhe} onFechar={() => setDetalhe(null)} />}
    </>
  );
}

/* ---------------------------------- etapa ---------------------------------- */

type FiltroAvancado = {
  texto: string;
  aeroportos: string[];
  saidaIni: number;
  saidaFim: number;
  chegadaIni: number;
  chegadaFim: number;
  duracaoMax: number;
};

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function Etapa({
  numero,
  titulo,
  status,
  statusTom,
  pernas,
  filtros,
  selecionada,
  onSelecionar,
  bloqueada,
}: {
  numero: number;
  titulo: string;
  status: string;
  statusTom: "res" | "ok";
  pernas: Perna[];
  filtros: FiltrosMotor;
  selecionada: string | null;
  onSelecionar: (chave: string) => void;
  bloqueada?: boolean;
}) {
  const maxDur = useMemo(
    () => Math.max(120, ...pernas.map((p) => p.voo.duracaoMinutos || 0)),
    [pernas],
  );
  const aeroportosDisp = useMemo(() => {
    const s = new Set<string>();
    for (const p of pernas) for (const c of p.voo.conexoes ?? []) s.add(c.aeroporto);
    return [...s].sort();
  }, [pernas]);

  const vazio: FiltroAvancado = {
    texto: "",
    aeroportos: [],
    saidaIni: 0,
    saidaFim: 1439,
    chegadaIni: 0,
    chegadaFim: 1439,
    duracaoMax: maxDur,
  };

  const [av, setAv] = useState<FiltroAvancado>(vazio);
  const [cia, setCia] = useState<string | null>(null);
  const [paradasSel, setParadasSel] = useState<number | null>(null);
  const [painel, setPainel] = useState(false);

  useEffect(() => {
    setAv((a) => ({ ...a, duracaoMax: maxDur }));
  }, [maxDur]);

  const visiveis = useMemo(() => {
    const q = av.texto.trim().toLowerCase();
    const lista = pernas.filter((p) => {
      const v = p.voo;
      if (cia && (v.companhia || v.companhiaIata) !== cia) return false;
      if (paradasSel !== null && v.paradas !== paradasSel) return false;
      if (filtros.companhias.length && !filtros.companhias.includes(v.companhia || v.companhiaIata))
        return false;
      if (filtros.direto && v.paradas > 0) return false;
      if (filtros.bagagem === "com" && !v.bagagemDespachada) return false;
      if (filtros.bagagem === "sem" && v.bagagemDespachada) return false;
      if (av.aeroportos.length && !(v.conexoes ?? []).some((c) => av.aeroportos.includes(c.aeroporto)))
        return false;
      const ms = minutosDoDia(v.partida);
      if (ms < av.saidaIni || ms > av.saidaFim) return false;
      const mc = minutosDoDia(v.chegada);
      if (mc < av.chegadaIni || mc > av.chegadaFim) return false;
      if (v.duracaoMinutos && v.duracaoMinutos > av.duracaoMax) return false;
      if (
        q &&
        !`${v.companhia} ${v.companhiaIata} ${v.numeroVoo} ${v.origem} ${v.destino}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
    return ordena(lista, filtros.ordem).slice(0, filtros.mostrar);
  }, [pernas, av, cia, paradasSel, filtros]);

  const filtrosAtivos =
    (av.texto.trim() ? 1 : 0) +
    (cia ? 1 : 0) +
    (paradasSel !== null ? 1 : 0) +
    (av.aeroportos.length ? 1 : 0) +
    (av.saidaIni > 0 || av.saidaFim < 1439 ? 1 : 0) +
    (av.chegadaIni > 0 || av.chegadaFim < 1439 ? 1 : 0) +
    (av.duracaoMax < maxDur ? 1 : 0);

  return (
    <section className={`space-y-3 ${bloqueada ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="cons-lab">Etapa {numero}</div>
          <h2 className="text-[22px] font-black tracking-tight">{titulo}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] cons-muted">{visiveis.length} exibidas</span>
          <button
            type="button"
            className={`cons-btn h-9 ${painel || filtrosAtivos ? "cons-btn-primary" : ""}`}
            onClick={() => setPainel((m) => !m)}
          >
            <Filter className="h-4 w-4" /> Filtros
            {filtrosAtivos > 0 && (
              <span className="rounded-full bg-black/25 px-1.5 text-[11px] font-black">
                {filtrosAtivos}
              </span>
            )}
          </button>
          <span className={`cons-status cons-status-${statusTom}`}>{status}</span>
        </div>
      </div>

      {/* sempre visível: companhias + paradas */}
      <ResumoCias
        pernas={pernas}
        selecionada={cia}
        onSelecionar={setCia}
        paradasSel={paradasSel}
        onParadas={setParadasSel}
      />

      {painel && (
        <div className="cons-card grid gap-4 px-4 py-4 md:grid-cols-2">
          <div>
            <div className="cons-lab mb-1">Busca</div>
            <input
              className="cons-field h-9"
              value={av.texto}
              onChange={(e) => setAv({ ...av, texto: e.target.value })}
              placeholder="Voo, cia, aeroporto"
            />
          </div>

          <div>
            <div className="cons-lab mb-1">Aeroportos de conexão</div>
            {aeroportosDisp.length ? (
              <div className="flex flex-wrap gap-1.5">
                {aeroportosDisp.map((a) => {
                  const on = av.aeroportos.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      className={`cons-btn h-8 px-3 text-[12px] ${on ? "cons-btn-blue" : ""}`}
                      onClick={() =>
                        setAv({
                          ...av,
                          aeroportos: on
                            ? av.aeroportos.filter((x) => x !== a)
                            : [...av.aeroportos, a],
                        })
                      }
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] cons-muted">Somente voos diretos nesta busca.</div>
            )}
          </div>

          <div>
            <div className="cons-lab mb-1">
              Horário de saída · {hhmm(av.saidaIni)} — {hhmm(av.saidaFim)}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={1439} step={15} value={av.saidaIni}
                onChange={(e) =>
                  setAv({ ...av, saidaIni: Math.min(Number(e.target.value), av.saidaFim) })
                }
                className="w-full accent-[var(--cons-orange)]"
              />
              <input
                type="range" min={0} max={1439} step={15} value={av.saidaFim}
                onChange={(e) =>
                  setAv({ ...av, saidaFim: Math.max(Number(e.target.value), av.saidaIni) })
                }
                className="w-full accent-[var(--cons-orange)]"
              />
            </div>
          </div>

          <div>
            <div className="cons-lab mb-1">
              Horário de chegada · {hhmm(av.chegadaIni)} — {hhmm(av.chegadaFim)}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={1439} step={15} value={av.chegadaIni}
                onChange={(e) =>
                  setAv({ ...av, chegadaIni: Math.min(Number(e.target.value), av.chegadaFim) })
                }
                className="w-full accent-[var(--cons-orange)]"
              />
              <input
                type="range" min={0} max={1439} step={15} value={av.chegadaFim}
                onChange={(e) =>
                  setAv({ ...av, chegadaFim: Math.max(Number(e.target.value), av.chegadaIni) })
                }
                className="w-full accent-[var(--cons-orange)]"
              />
            </div>
          </div>

          <div>
            <div className="cons-lab mb-1">
              Duração máxima · {Math.floor(av.duracaoMax / 60)}h{String(av.duracaoMax % 60).padStart(2, "0")}
            </div>
            <input
              type="range" min={60} max={maxDur} step={15} value={av.duracaoMax}
              onChange={(e) => setAv({ ...av, duracaoMax: Number(e.target.value) })}
              className="w-full accent-[var(--cons-orange)]"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="cons-btn h-9 px-3 text-[12px]"
              onClick={() => {
                setAv({ ...vazio, duracaoMax: maxDur });
                setCia(null);
                setParadasSel(null);
              }}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      )}

      <div className="cons-card overflow-x-auto">
        <table className="cons-table min-w-[1080px]">
          <thead>
            <tr>
              <th />
              <th>Cia</th>
              <th>Itinerário</th>
              <th>Duração</th>
              <th>Tarifa</th>
              <th>Sem bagagem</th>
              <th>Com bagagem</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <LinhaPerna
                key={p.chave}
                perna={p}
                selecionada={selecionada === p.chave}
                onSelecionar={() => onSelecionar(p.chave)}
              />
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] cons-muted">
                  Nenhuma opção com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ResultadosPassHub({ resultado, filtros, onReservar }: Props) {
  const [idaSel, setIdaSel] = useState<string | null>(null);

  useEffect(() => {
    setIdaSel(null);
  }, [resultado]);

  const idas = useMemo(() => {
    const mapa = new Map<string, Perna>();
    for (const o of resultado.ofertas) {
      const chave = chaveVoo(o.ida);
      const preco = o.ida.precoTotal || o.precoTotal;
      const atual = mapa.get(chave);
      if (!atual || preco < atual.preco) mapa.set(chave, { chave, voo: o.ida, oferta: o, preco });
    }
    return [...mapa.values()];
  }, [resultado]);

  const temVolta = useMemo(() => resultado.ofertas.some((o) => o.voltas.length > 0), [resultado]);

  const voltas = useMemo(() => {
    if (!idaSel) return [];
    const mapa = new Map<string, Perna>();
    for (const o of resultado.ofertas) {
      if (chaveVoo(o.ida) !== idaSel) continue;
      for (const v of o.voltas) {
        const chave = chaveVoo(v);
        const preco = v.precoTotal || o.precoTotal - o.ida.precoTotal;
        const atual = mapa.get(chave);
        if (!atual || preco < atual.preco) mapa.set(chave, { chave, voo: v, oferta: o, preco });
      }
    }
    return [...mapa.values()];
  }, [resultado, idaSel]);

  function selecionaIda(chave: string) {
    setIdaSel(chave);
    if (!temVolta) {
      const p = idas.find((i) => i.chave === chave);
      if (p) onReservar(p.oferta);
    }
  }

  function selecionaVolta(chave: string) {
    const p = voltas.find((v) => v.chave === chave);
    if (p) onReservar(p.oferta);
  }

  return (
    <div className="space-y-6">
      <Etapa
        numero={1}
        titulo="Trecho ida"
        status={idaSel ? "Ida selecionada" : "Aguardando seleção"}
        statusTom={idaSel ? "ok" : "res"}
        pernas={idas}
        filtros={filtros}
        selecionada={idaSel}
        onSelecionar={selecionaIda}
      />

      {temVolta && (
        <Etapa
          numero={2}
          titulo="Trecho volta"
          status={idaSel ? "Escolha a volta" : "Selecione primeiro a ida"}
          statusTom={idaSel ? "ok" : "res"}
          pernas={voltas}
          filtros={filtros}
          selecionada={null}
          onSelecionar={selecionaVolta}
          bloqueada={!idaSel}
        />
      )}
    </div>
  );
}
