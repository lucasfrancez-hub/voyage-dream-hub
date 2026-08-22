import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Luggage, Briefcase, Plus, Check, Info, FileText, X } from "lucide-react";
import type { PassHubOferta, PassHubResultado, PassHubVoo } from "@/lib/passhub/types";
import { cityLabel } from "@/lib/iata-lookup";

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
  ravPercentual?: number;
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
  AD: { bg: "#1f8ae0", fg: "#ffffff" },
  AZUL: { bg: "#1f8ae0", fg: "#ffffff" },
  "2Z": { bg: "#1f8ae0", fg: "#ffffff" },
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

export function BadgeCia({
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

/* ------------------------- cálculo de valores / RAV ------------------------- */

export type Valores = {
  tarifa: number;
  taxas: number;
  rav: number;
  pct: number;
  outros: number;
  comissaoIncentivo: number;
  total: number;
};

const INCENTIVO_PCT = 1; // comissão de incentivo sobre a tarifa (%)

/** Calcula tarifa/taxas/RAV. Quando a PassHub não devolve a RAV, aplica o % fixado na busca. */
export function calcularValores(voo: PassHubVoo, ravPercentual = 0): Valores {
  const tarifa = voo.precoTarifa || 0;
  const taxas = voo.taxas || 0;
  const totalApi = voo.precoTotal || 0;
  const residual = Math.round((totalApi - tarifa - taxas) * 100) / 100;

  let rav = voo.ravValor || 0;
  let pct = voo.ravPercentual || 0;
  let outros = 0;
  let total = totalApi;

  if (rav > 0) {
    if (!pct && tarifa > 0) pct = Math.round((rav / tarifa) * 1000) / 10;
    outros = Math.round((residual - rav) * 100) / 100;
  } else if (residual >= 0.01) {
    // a API já embutiu a RAV no total
    rav = residual;
    pct = tarifa > 0 ? Math.round((rav / tarifa) * 1000) / 10 : 0;
  }

  // O percentual fixado na busca (10% nacional / 7% internacional) é um PISO:
  // se a consolidadora já embutiu uma RAV maior, mantemos o total dela — nunca
  // devolvemos um preço abaixo do que a PassHub cobra.
  if (ravPercentual > 0 && tarifa > 0) {
    const alvo = Math.round(tarifa * (ravPercentual / 100) * 100) / 100;
    if (alvo > rav) {
      pct = ravPercentual;
      rav = alvo;
      total = Math.round((tarifa + taxas + outros + rav) * 100) / 100;
    }
  }

  if (!total) total = Math.round((tarifa + taxas + rav) * 100) / 100;


  const comissaoIncentivo = tarifa > 0 ? Math.round(tarifa * (INCENTIVO_PCT / 100) * 100) / 100 : 0;

  return { tarifa, taxas, rav, pct, outros, comissaoIncentivo, total };
}

/* -------------------- matriz de filtro: cias x paradas -------------------- */

function MatrizFiltro({
  pernas,
  ravPercentual,
  cia,
  paradasSel,
  onCia,
  onParadas,
}: {
  pernas: Perna[];
  ravPercentual: number;
  cia: string | null;
  paradasSel: number | null;
  onCia: (cia: string | null) => void;
  onParadas: (p: number | null) => void;
}) {
  const { cias, paradas, celulas, menorGeral } = useMemo(() => {
    const precoDe = (p: Perna) => calcularValores(p.voo, ravPercentual).total || p.preco;
    const cs = new Map<string, { preco: number; iata: string }>();
    const ps = new Map<number, number>();
    const cel = new Map<string, number>();
    let menor = Infinity;
    for (const p of pernas) {
      const nome = p.voo.companhia || p.voo.companhiaIata;
      const preco = precoDe(p);
      if (preco < menor) menor = preco;
      const c = cs.get(nome);
      if (!c || preco < c.preco) cs.set(nome, { preco, iata: p.voo.companhiaIata || nome });
      const n = p.voo.paradas;
      const a = ps.get(n);
      if (a === undefined || preco < a) ps.set(n, preco);
      const k = `${nome}|${n}`;
      const b = cel.get(k);
      if (b === undefined || preco < b) cel.set(k, preco);
    }
    return {
      cias: [...cs.entries()].sort((a, b) => a[1].preco - b[1].preco),
      paradas: [...ps.entries()].sort((a, b) => a[0] - b[0]),
      celulas: cel,
      menorGeral: menor,
    };
  }, [pernas, ravPercentual]);

  if (!cias.length) return null;

  const rotuloParada = (n: number) => (n === 0 ? "Direto" : n === 1 ? "1 parada" : `${n} paradas`);

  return (
    <div className="cons-card overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-[150px] px-4 py-3 text-left">
              <button
                type="button"
                onClick={() => {
                  onCia(null);
                  onParadas(null);
                }}
                className="cons-lab hover:text-[var(--cons-orange)]"
              >
                Filtro rápido
              </button>
            </th>
            {cias.map(([nome, info]) => {
              const ativa = cia === nome;
              return (
                <th key={nome} className="px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => onCia(ativa ? null : nome)}
                    className={`inline-flex flex-col items-center gap-1 rounded-lg px-2 py-1 transition ${
                      ativa ? "ring-2 ring-[var(--cons-orange)]" : "hover:brightness-125"
                    }`}
                  >
                    <BadgeCia codigo={info.iata || nome} nome={nome} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {paradas.map(([n]) => {
            const linhaAtiva = paradasSel === n;
            return (
              <tr key={n} className="border-t border-white/[.06]">
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onParadas(linhaAtiva ? null : n)}
                    className={`text-[13px] font-bold transition ${
                      linhaAtiva ? "text-[var(--cons-orange)]" : "hover:text-[var(--cons-orange)]"
                    }`}
                  >
                    {rotuloParada(n)}
                  </button>
                </td>
                {cias.map(([nome]) => {
                  const preco = celulas.get(`${nome}|${n}`);
                  const ativo = cia === nome && paradasSel === n;
                  if (preco === undefined)
                    return (
                      <td key={nome} className="px-3 py-2.5 text-center cons-muted">
                        —
                      </td>
                    );
                  const eMenor = Math.abs(preco - menorGeral) < 0.01;
                  return (
                    <td key={nome} className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          onCia(ativo ? null : nome);
                          onParadas(ativo ? null : n);
                        }}
                        className={`w-full rounded-lg px-3 py-1.5 font-black tabular-nums transition ${
                          ativo
                            ? "bg-[rgba(255,148,64,.18)] text-[#ffc496] ring-1 ring-[var(--cons-orange)]"
                            : eMenor
                              ? "text-[#8effd2] hover:bg-white/5"
                              : "hover:bg-white/5"
                        }`}
                      >
                        {brl(preco)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/* ------------------------------- detalhes pop ------------------------------- */

function PainelDetalhe({
  voo,
  aba,
  ravPercentual,
  onFechar,
}: {
  voo: PassHubVoo;
  aba: "info" | "docs";
  ravPercentual: number;
  onFechar: () => void;
}) {
  const { tarifa, taxas, rav, pct, outros, comissaoIncentivo, total } = calcularValores(voo, ravPercentual);

  const totalComissao = Math.round((rav + comissaoIncentivo) * 100) / 100;

  const linhas: { rot: string; val: number; destaque?: boolean; positivo?: boolean }[] = [
    { rot: "Tarifa (base)", val: tarifa },
    { rot: "Taxa de embarque / TAX", val: taxas },
    { rot: `RAV (${pct ? `${pct}%` : "0%"})`, val: rav, destaque: true },
  ];
  if (Math.abs(outros) >= 0.01) linhas.push({ rot: "Outros / ajustes", val: outros });
  if (comissaoIncentivo > 0) {
    linhas.push({ rot: `Comissão de incentivo (${INCENTIVO_PCT}% da tarifa)`, val: comissaoIncentivo, positivo: true });
  }
  if (totalComissao > 0) {
    linhas.push({ rot: "Total de comissão (RAV + incentivo)", val: totalComissao, destaque: true, positivo: true });
  }

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div className="overflow-hidden border-y border-white/10 bg-[#051722]">
          {/* contexto do voo */}
          <div className="flex items-center gap-4 border-b border-white/10 bg-black/25 px-6 py-3">
            <BadgeCia codigo={voo.companhiaIata || voo.companhia} nome={voo.companhia} />
            <div className="flex items-center gap-5 text-[13px] text-white/80">
              <span className="text-[17px] font-black tabular-nums">{hora(voo.partida)}</span>
              <span className="flex items-center gap-2 font-bold text-white/45">
                {voo.origem}
                <span className="text-[11px] text-[#f26b1f]">→</span>
                {voo.destino}
              </span>
              <span className="text-[17px] font-black tabular-nums">{hora(voo.chegada)}</span>
              <span className="text-[11px] cons-muted">
                {voo.duracao} ·{" "}
                {voo.paradas === 0
                  ? "voo direto"
                  : voo.paradas === 1
                    ? "1 parada"
                    : `${voo.paradas} paradas`}
              </span>
            </div>
            <span className="ml-auto text-[17px] font-black tabular-nums">{brl(total)}</span>
          </div>

          {aba === "info" ? (
            <div className="flex flex-col md:flex-row">
              {/* valores */}
              <div className="flex-1 border-b border-white/10 p-6 md:border-b-0 md:border-r">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-[#f26b1f]">
                    Detalhamento do valor
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {[voo.familiaTarifaria, voo.classe, voo.provedor]
                      .filter(Boolean)
                      .map((t) => (
                        <span
                          key={t as string}
                          className="rounded bg-white/[.06] px-2 py-0.5 text-[10px] font-bold text-white/65"
                        >
                          {t}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {linhas.map((l) => (
                    <div key={l.rot} className="flex items-center justify-between text-[13px]">
                      <span className={l.destaque ? "font-bold text-[#ffc496]" : l.positivo ? "font-bold text-emerald-400" : "text-white/50"}>
                        {l.rot}
                      </span>
                      <span
                        className={`tabular-nums font-semibold ${
                          l.destaque ? "text-[#ffc496]" : l.positivo ? "text-emerald-400" : "text-white/90"
                        }`}
                      >
                        {l.positivo ? `+${brl(l.val)}` : brl(l.val)}
                      </span>
                    </div>
                  ))}

                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-[13px] font-bold text-white/80">Total do trecho</span>
                    <span className="text-[26px] font-black leading-none tracking-tight tabular-nums">
                      {brl(total)}
                    </span>
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded ${
                        voo.bagagemDespachada ? "bg-emerald-500/15" : "bg-red-500/15"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          voo.bagagemDespachada ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-tight text-white/45">
                      Despachada:{" "}
                      {voo.bagagemDespachada ? `${voo.bagagemDespachadaQtd || 1} peça(s)` : "não"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded ${
                        voo.bagagemMao ? "bg-emerald-500/15" : "bg-red-500/15"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          voo.bagagemMao ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-tight text-white/45">
                      Mão: {voo.bagagemMao ? "inclusa" : "não inclusa"}
                    </span>
                  </div>
                </div>
              </div>

              {/* parcelamento */}
              <div className="flex-1 bg-black/15 p-6">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-400">
                    Parcelamento
                  </h3>
                  <button
                    type="button"
                    onClick={onFechar}
                    aria-label="Fechar detalhes"
                    className="rounded-full p-1.5 text-white/35 transition hover:bg-white/5 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {voo.parcelamento?.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {voo.parcelamento.map((p) => (
                      <div
                        key={p.bandeira}
                        className="flex items-center justify-between rounded-lg border border-white/[.07] bg-white/[.02] px-3 py-2.5 transition hover:border-[#f26b1f]/40"
                      >
                        <span className="text-[10px] font-black uppercase text-white/45">
                          {p.bandeira}
                        </span>
                        <span className="text-[12px] font-bold text-white/85 tabular-nums">
                          {p.maxParcelas}x {brl(total / Math.max(1, p.maxParcelas))}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[12px] cons-muted">Sem informação de parcelamento.</div>
                )}

                <div className="mt-6 flex items-center gap-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[.06] px-3 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-semibold text-emerald-400/85">
                    Valores por passageiro adulto, com RAV já aplicada
                    {voo.provedor ? ` · provedor ${voo.provedor}` : ""}.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[.2em] text-[#f26b1f]">
                  Serviços da tarifa
                </h3>
                <button
                  type="button"
                  onClick={onFechar}
                  aria-label="Fechar detalhes"
                  className="rounded-full p-1.5 text-white/35 transition hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {voo.servicos?.length ? (
                <ul className="grid gap-2 md:grid-cols-2">
                  {voo.servicos.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.02] px-3 py-2 text-[12px]"
                    >
                      <span className={s.incluso ? "text-emerald-400" : "text-red-400/80"}>
                        {s.incluso ? "✓" : "✕"}
                      </span>
                      <span className="text-white/80">{s.descricao || s.tipo}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[12px] cons-muted">Sem detalhamento de serviços.</div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}


/* ---------------------------------- linha ---------------------------------- */

function LinhaPerna({
  perna,
  selecionada,
  ravPercentual,
  onSelecionar,
}: {
  perna: Perna;
  selecionada: boolean;
  ravPercentual: number;
  onSelecionar: () => void;
}) {
  const v = perna.voo;
  const segs = segmentos(v);
  const valores = calcularValores(v, ravPercentual);
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
        <td className="px-3 py-3">
          <div className="flex flex-col">
            {segs.map((s, i) => (
              <div key={i}>
                {s.esperaAntes && (
                  <div className="relative flex items-center py-3">
                    <div className="absolute left-[5.25rem] top-0 h-full border-l border-dashed border-white/15" />
                    <div className="absolute left-[5rem] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#F26B1F] shadow-[0_0_12px_rgba(242,107,31,0.6)]" />
                    <div className="ml-[6.5rem] flex items-center gap-2 rounded-lg border border-white/5 bg-[#0a1e29] px-3 py-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Conexão em {s.de}
                      </span>
                      <div className="h-1 w-1 rounded-full bg-slate-600" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#F26B1F]">
                        Espera {s.esperaAntes}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-5">
                  <div className="flex min-w-[92px] flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#F26B1F]">
                      {diaCurto(s.saida)}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[19px] font-bold tracking-tighter text-white">
                        {hora(s.saida)}
                      </span>
                      <span className="text-[12px] font-extrabold tracking-widest text-slate-400">
                        {s.de}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-500">{cityLabel(s.de)}</span>
                  </div>

                  <div className="flex flex-1 items-center justify-center gap-2 px-1">
                    <div className="h-[1px] w-5 bg-slate-700/50" />
                    <svg
                      className="h-3.5 w-3.5 shrink-0 text-slate-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                    <div className="h-[1px] w-5 bg-slate-700/50" />
                  </div>

                  <div className="flex min-w-[92px] flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#F26B1F] opacity-0">
                      {diaCurto(s.saida)}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-extrabold tracking-widest text-slate-400">
                        {s.para}
                      </span>
                      <span className="font-mono text-[19px] font-bold tracking-tighter text-white">
                        {hora(s.chegada)}
                      </span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-500">{cityLabel(s.para)}</span>
                  </div>

                  <span className="ml-auto rounded-md border border-white/5 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">
                    {s.voo}
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
              <b className="text-[13px]">{brl(valores.total || perna.preco)}</b>
            </div>
          )}
        </td>

        <td className="px-3 py-3">
          {v.bagagemDespachada ? (
            <div className="cons-box flex items-center justify-between gap-2 px-3 py-2">
              <Luggage className="h-3.5 w-3.5 cons-muted" />
              <b className="text-[13px]">{brl(valores.total || perna.preco)}</b>
            </div>
          ) : (
            <span className="text-[12px] cons-muted">—</span>
          )}
        </td>
      </tr>
      {detalhe && (
        <PainelDetalhe
          voo={v}
          aba={detalhe}
          ravPercentual={ravPercentual}
          onFechar={() => setDetalhe(null)}
        />
      )}
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
  ravPercentual,
  selecionada,
  onSelecionar,
  bloqueada,
  recolhida,
  pernaSelecionada,
  onAlterar,
}: {
  numero: number;
  titulo: string;
  status: string;
  statusTom: "res" | "ok";
  pernas: Perna[];
  filtros: FiltrosMotor;
  ravPercentual: number;
  selecionada: string | null;
  onSelecionar: (chave: string) => void;
  bloqueada?: boolean;
  recolhida?: boolean;
  pernaSelecionada?: Perna | null;
  onAlterar?: () => void;
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
  const [pag, setPag] = useState(1);

  useEffect(() => {
    setAv((a) => ({ ...a, duracaoMax: maxDur }));
  }, [maxDur]);

  const filtradas = useMemo(() => {
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
    return ordena(lista, filtros.ordem);
  }, [pernas, av, cia, paradasSel, filtros]);

  const porPagina = Math.max(5, filtros.mostrar || 10);
  const totalPags = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const pagAtual = Math.min(pag, totalPags);

  useEffect(() => {
    setPag(1);
  }, [filtradas.length, porPagina]);

  const visiveis = useMemo(
    () => filtradas.slice((pagAtual - 1) * porPagina, pagAtual * porPagina),
    [filtradas, pagAtual, porPagina],
  );


  const filtrosAtivos =
    (av.texto.trim() ? 1 : 0) +
    (cia ? 1 : 0) +
    (paradasSel !== null ? 1 : 0) +
    (av.aeroportos.length ? 1 : 0) +
    (av.saidaIni > 0 || av.saidaFim < 1439 ? 1 : 0) +
    (av.chegadaIni > 0 || av.chegadaFim < 1439 ? 1 : 0) +
    (av.duracaoMax < maxDur ? 1 : 0);

  if (recolhida && pernaSelecionada) {
    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="cons-lab">Etapa {numero}</div>
            <h2 className="text-[22px] font-black tracking-tight">{titulo}</h2>
          </div>
          <span className={`cons-status cons-status-${statusTom}`}>{status}</span>
        </div>
        <ResumoPerna
          perna={pernaSelecionada}
          ravPercentual={ravPercentual}
          acao={
            onAlterar ? (
              <button type="button" className="cons-btn h-9" onClick={onAlterar}>
                Alterar
              </button>
            ) : null
          }
        />
      </section>
    );
  }

  return (
    <section className={`space-y-3 ${bloqueada ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="cons-lab">Etapa {numero}</div>
          <h2 className="text-[22px] font-black tracking-tight">{titulo}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] cons-muted">
            {filtradas.length} opções · página {pagAtual}/{totalPags}
          </span>

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
      <MatrizFiltro
        pernas={pernas}
        ravPercentual={ravPercentual}
        cia={cia}
        paradasSel={paradasSel}
        onCia={setCia}
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
                ravPercentual={ravPercentual}
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

      {totalPags > 1 && (
        <div className="cons-card flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[12px]">
          <span className="cons-muted">
            Exibindo {(pagAtual - 1) * porPagina + 1}–{Math.min(pagAtual * porPagina, filtradas.length)} de{" "}
            <b>{filtradas.length}</b> opções
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="cons-btn h-8"
              disabled={pagAtual <= 1}
              onClick={() => setPag(pagAtual - 1)}
            >
              Anterior
            </button>
            {Array.from({ length: totalPags }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPags || Math.abs(n - pagAtual) <= 2)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-1.5">
                  {i > 0 && arr[i - 1] !== n - 1 && <span className="cons-muted">…</span>}
                  <button
                    type="button"
                    className={`cons-btn h-8 min-w-8 px-2.5 ${n === pagAtual ? "cons-btn-primary" : ""}`}
                    onClick={() => setPag(n)}
                  >
                    {n}
                  </button>
                </span>
              ))}
            <button
              type="button"
              className="cons-btn h-8"
              disabled={pagAtual >= totalPags}
              onClick={() => setPag(pagAtual + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

    </section>
  );
}

/** Card compacto de um trecho já escolhido (usado nas etapas recolhidas e no resumo final). */
function ResumoPerna({
  perna,
  ravPercentual,
  acao,
  rotulo,
}: {
  perna: Perna;
  ravPercentual: number;
  acao?: React.ReactNode;
  rotulo?: string;
}) {
  const v = perna.voo;
  const val = calcularValores(v, ravPercentual);
  return (
    <div className="cons-card flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {rotulo && <span className="cons-lab">{rotulo}</span>}
        <BadgeCia codigo={v.companhiaIata} nome={v.companhia} />
        <div className="text-[14px] font-black tracking-tight">
          {v.origem} <span className="cons-muted">→</span> {v.destino}
        </div>
        <div className="text-[13px] cons-muted">
          {diaCurto(v.partida)} · {hora(v.partida)} — {hora(v.chegada)} ·{" "}
          {v.paradas === 0 ? "Direto" : `${v.paradas} parada${v.paradas > 1 ? "s" : ""}`}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="cons-lab">Total</div>
          <div className="text-[16px] font-black">{brl(val.total)}</div>
          {val.comissaoIncentivo > 0 && (
            <div className="text-[11px] font-bold text-emerald-400">
              +{brl(val.comissaoIncentivo)} comissão de incentivo
            </div>
          )}
        </div>
        {acao}
      </div>
    </div>
  );
}

export function ResultadosPassHub({ resultado, filtros, ravPercentual = 0, onReservar }: Props) {
  const [idaSel, setIdaSel] = useState<string | null>(null);
  const [voltaSel, setVoltaSel] = useState<string | null>(null);
  const refVolta = useRef<HTMLDivElement | null>(null);
  const refResumo = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIdaSel(null);
    setVoltaSel(null);
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

  const pernaIda = useMemo(() => idas.find((i) => i.chave === idaSel) ?? null, [idas, idaSel]);
  const pernaVolta = useMemo(
    () => voltas.find((v) => v.chave === voltaSel) ?? null,
    [voltas, voltaSel],
  );

  const pronto = temVolta ? Boolean(pernaIda && pernaVolta) : Boolean(pernaIda);
  const ofertaFinal = pernaVolta?.oferta ?? pernaIda?.oferta ?? null;
  // O preço da PassHub é fechado por viagem: quando há volta, o total é o da
  // volta escolhida (ida + volta), nunca a soma dos dois trechos.
  const vooPreco = pernaVolta?.voo ?? pernaIda?.voo ?? null;
  const valoresFinais = vooPreco ? calcularValores(vooPreco, ravPercentual) : null;
  const totalFinal = valoresFinais?.total ?? 0;

  const rolar = (alvo: React.RefObject<HTMLDivElement | null>) =>
    window.setTimeout(() => alvo.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);


  function selecionaIda(chave: string) {
    setIdaSel(chave);
    setVoltaSel(null);
    rolar(temVolta ? refVolta : refResumo);
  }

  function selecionaVolta(chave: string) {
    setVoltaSel(chave);
    rolar(refResumo);
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
        ravPercentual={ravPercentual}
        selecionada={idaSel}
        onSelecionar={selecionaIda}
        recolhida={Boolean(pernaIda)}
        pernaSelecionada={pernaIda}
        onAlterar={() => {
          setIdaSel(null);
          setVoltaSel(null);
        }}
      />

      {temVolta && (
        <div ref={refVolta} className="scroll-mt-24">
          <Etapa
            numero={2}
            titulo="Trecho volta"
            status={
              pernaVolta ? "Volta selecionada" : idaSel ? "Escolha a volta" : "Selecione primeiro a ida"
            }
            statusTom={idaSel ? "ok" : "res"}
            pernas={voltas}
            filtros={filtros}
            ravPercentual={ravPercentual}
            selecionada={voltaSel}
            onSelecionar={selecionaVolta}
            bloqueada={!idaSel}
            recolhida={Boolean(pernaVolta)}
            pernaSelecionada={pernaVolta}
            onAlterar={() => setVoltaSel(null)}
          />
        </div>
      )}

      <div ref={refResumo} className="scroll-mt-24">
        {pronto && ofertaFinal && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="cons-lab">Etapa {temVolta ? 3 : 2}</div>
                <h2 className="text-[22px] font-black tracking-tight">Resumo da seleção</h2>
              </div>
              <span className="cons-status cons-status-ok">Pronto para reservar</span>
            </div>

            {pernaIda && (
              <ResumoPerna perna={pernaIda} ravPercentual={ravPercentual} rotulo="Ida" />
            )}
            {pernaVolta && (
              <ResumoPerna perna={pernaVolta} ravPercentual={ravPercentual} rotulo="Volta" />
            )}

            <div className="cons-card flex flex-wrap items-center justify-between gap-4 px-4 py-4">
              <div>
                <div className="cons-lab">Total da seleção</div>
                <div className="text-[24px] font-black tracking-tight">{brl(totalFinal)}</div>
              </div>
              <button
                type="button"
                className="cons-btn cons-btn-primary h-11 px-6 text-[14px] font-black"
                onClick={() => {
                  // Envia só o par escolhido (ida + a volta selecionada),
                  // nunca a lista inteira de voltas combináveis da oferta.
                  const ida = pernaIda?.voo ?? ofertaFinal.ida;
                  const voltas = pernaVolta ? [pernaVolta.voo] : [];
                  onReservar({
                    ...ofertaFinal,
                    ida,
                    voltas,
                    precoTotal:
                      (ida.precoTotal || 0) + voltas.reduce((s, v) => s + (v.precoTotal || 0), 0) ||
                      ofertaFinal.precoTotal,
                  });
                }}
              >
                Reservar
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
