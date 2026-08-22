import { useEffect, useMemo, useState } from "react";
import { Filter, Luggage, Briefcase, Plus, Check, Info, FileText } from "lucide-react";
import { AirlineLogo } from "@/components/AirlineLogo";
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
const diaCurto = (dataHora: string) => {
  const d = dataHora.split(" ")[0] ?? "";
  const p = d.split(/[-/]/);
  if (p.length < 3) return d;
  const [a, b, c] = p;
  const dd = a!.length === 4 ? c! : a!;
  const mm = a!.length === 4 ? b! : b!;
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${dd} ${meses[Number(mm) - 1] ?? mm}`;
};

const chaveVoo = (v: PassHubVoo) =>
  `${v.companhiaIata || v.companhia}-${v.numeroVoo}-${v.partida}-${v.chegada}-${v.familiaTarifaria}`;

type Perna = { chave: string; voo: PassHubVoo; oferta: PassHubOferta; preco: number };

function ordena(lista: Perna[], ordem: FiltrosMotor["ordem"]) {
  const copia = [...lista];
  copia.sort((a, b) => {
    if (ordem === "duracao") return a.voo.duracaoMinutos - b.voo.duracaoMinutos;
    if (ordem === "partida") return hora(a.voo.partida).localeCompare(hora(b.voo.partida));
    if (ordem === "chegada") return hora(a.voo.chegada).localeCompare(hora(b.voo.chegada));
    return a.preco - b.preco;
  });
  return copia;
}

function ResumoCias({
  pernas,
  selecionada,
  onSelecionar,
  rotulo,
}: {
  pernas: Perna[];
  selecionada: string | null;
  onSelecionar: (cia: string | null) => void;
  rotulo: string;
}) {
  const cias = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of pernas) {
      const cia = p.voo.companhia || p.voo.companhiaIata;
      const atual = mapa.get(cia);
      if (atual === undefined || p.preco < atual) mapa.set(cia, p.preco);
    }
    return [...mapa.entries()].sort((a, b) => a[1] - b[1]).slice(0, 6);
  }, [pernas]);

  if (!cias.length) return null;

  return (
    <div className="cons-card grid grid-cols-2 overflow-hidden md:grid-cols-[minmax(0,1fr)_repeat(auto-fit,minmax(150px,1fr))]">
      <div className="border-b border-white/5 px-4 py-3 md:border-b-0 md:border-r">
        <div className="cons-lab">{rotulo}</div>
        <div className="text-[13px] font-bold">{pernas.length} opções</div>
      </div>
      {cias.map(([cia, preco], i) => {
        const ativa = selecionada === cia;
        return (
          <button
            key={cia}
            type="button"
            onClick={() => onSelecionar(ativa ? null : cia)}
            className={`relative border-l border-white/5 px-4 py-3 text-center transition hover:bg-white/[0.04] ${
              ativa ? "bg-[rgba(255,148,64,.1)]" : ""
            }`}
          >
            {i === 0 && (
              <span className="absolute left-0 top-0 border-b-[10px] border-l-[10px] border-b-transparent border-l-[var(--cons-green)]" />
            )}
            <span className="mx-auto mb-1 flex items-center justify-center gap-2">
              <AirlineLogo airline={cia} size={20} hideIfUnknown />
              <span className="cons-pill">{cia}</span>
            </span>
            <div className="text-[15px] font-black">{brl(preco)}</div>
          </button>
        );
      })}
    </div>
  );
}

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
  const trechos = [
    { de: v.origem, para: v.conexoes[0]?.aeroporto ?? v.destino, hi: v.partida, ho: v.conexoes[0]?.chegada ?? v.chegada },
    ...(v.conexoes.length
      ? [{ de: v.conexoes[0]!.aeroporto, para: v.destino, hi: v.conexoes[0]!.saida, ho: v.chegada }]
      : []),
  ];

  return (
    <tr
      onClick={onSelecionar}
      className={`cursor-pointer align-top transition hover:bg-[rgba(90,169,255,.06)] ${
        selecionada ? "bg-[rgba(255,148,64,.09)]" : ""
      }`}
    >
      <td className="w-[56px] px-3 py-3">
        <span
          className={`grid h-9 w-9 place-items-center rounded-full border transition ${
            selecionada
              ? "border-transparent bg-[linear-gradient(180deg,#ff9244,#e66318)] text-white"
              : "border-[rgba(255,148,64,.45)] text-[#ff9440]"
          }`}
        >
          {selecionada ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
      </td>

      <td className="px-2 py-3">
        <div className="grid gap-1.5">
          {trechos.map((_, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <AirlineLogo airline={v.companhiaIata || v.companhia} size={18} hideIfUnknown />
              <span className="cons-pill">{v.companhiaIata || v.companhia}</span>
            </span>
          ))}
        </div>
      </td>

      <td className="px-2 py-3">
        <div className="grid gap-1.5">
          {trechos.map((t, i) => (
            <div key={i} className="cons-soft flex items-center gap-2 px-3 py-1.5">
              <b className="text-[13px]">{hora(t.hi)}</b>
              <span className="text-[11px] cons-muted">{diaCurto(t.hi)}</span>
              <span className="text-[12px] font-bold">{v.numeroVoo}</span>
            </div>
          ))}
        </div>
      </td>

      <td className="px-2 py-3">
        <div className="grid gap-1.5">
          {trechos.map((t, i) => (
            <div key={i} className="cons-soft flex items-center gap-2 px-3 py-1.5">
              <b className="text-[13px]">{hora(t.ho)}</b>
              <span className="text-[11px] cons-muted">{diaCurto(t.ho)}</span>
              <span className="text-[12px] font-bold">
                {t.de} → {t.para}
              </span>
            </div>
          ))}
        </div>
      </td>

      <td className="px-2 py-3">
        <b className="text-[14px]">{v.duracao}</b>
        <div className="text-[11px] cons-muted">
          {v.paradas === 0 ? "voo direto" : `${v.paradas} escala`}
        </div>
      </td>

      <td className="px-2 py-3">
        <div className="flex items-center gap-1.5">
          <span className="cons-chip">{v.classe || v.provedor || "—"}</span>
          <Info className="h-3.5 w-3.5 cons-muted" />
          <FileText className="h-3.5 w-3.5 cons-muted" />
        </div>
      </td>

      <td className="px-2 py-3">
        {v.bagagemDespachada ? (
          <span className="text-[12px] cons-muted">—</span>
        ) : (
          <div className="cons-box flex items-center justify-between gap-2 px-3 py-2">
            <span className="rounded-md bg-[rgba(55,211,154,.18)] px-2 py-0.5 text-[10px] font-black text-[#8effd2]">
              LIG
            </span>
            <Briefcase className="h-3.5 w-3.5 cons-muted" />
            <b className="text-[13px]">{brl(perna.preco)}</b>
          </div>
        )}
      </td>

      <td className="px-2 py-3">
        {v.bagagemDespachada ? (
          <div className="cons-box flex items-center justify-between gap-2 px-3 py-2">
            <span className="rounded-md bg-[rgba(122,168,255,.2)] px-2 py-0.5 text-[10px] font-black text-[#cfe0ff]">
              {v.familiaTarifaria?.slice(0, 3).toUpperCase() || "CLA"}
            </span>
            <Luggage className="h-3.5 w-3.5 cons-muted" />
            <b className="text-[13px]">{brl(perna.preco)}</b>
          </div>
        ) : (
          <span className="text-[12px] cons-muted">—</span>
        )}
      </td>

      <td className="px-2 py-3">
        <b className="text-[13px]">{v.origem}</b>
        <div className="text-[11px] cons-muted">
          {v.conexoes.map((c) => c.aeroporto).join(" · ") || "sem conexão"}
        </div>
        <div className="text-[11px] cons-muted">{v.destino}</div>
      </td>

      <td className="px-3 py-3">
        <b className="text-[13px]">{v.conexoes[0]?.duracao ?? "—"}</b>
        <div className="text-[11px] cons-muted">
          {v.paradas === 0 ? "direto" : `${v.paradas} parada`}
        </div>
      </td>
    </tr>
  );
}

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
  const [texto, setTexto] = useState("");
  const [cia, setCia] = useState<string | null>(null);
  const [mais, setMais] = useState(false);
  const [paradas, setParadas] = useState<"todas" | "0" | "1+">("todas");

  const visiveis = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const lista = pernas.filter((p) => {
      const v = p.voo;
      if (cia && (v.companhia || v.companhiaIata) !== cia) return false;
      if (filtros.companhias.length && !filtros.companhias.includes(v.companhia || v.companhiaIata))
        return false;
      if (filtros.direto && v.paradas > 0) return false;
      if (paradas === "0" && v.paradas > 0) return false;
      if (paradas === "1+" && v.paradas === 0) return false;
      if (filtros.bagagem === "com" && !v.bagagemDespachada) return false;
      if (filtros.bagagem === "sem" && v.bagagemDespachada) return false;
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
  }, [pernas, texto, cia, paradas, filtros]);

  const filtrosAtivos =
    (texto.trim() ? 1 : 0) + (cia ? 1 : 0) + (paradas !== "todas" ? 1 : 0);

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
            className={`cons-btn h-9 ${mais || filtrosAtivos ? "cons-btn-primary" : ""}`}
            onClick={() => setMais((m) => !m)}
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

      {mais && (
        <div className="cons-card space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="cons-field h-9 max-w-[260px]"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Voo, cia, aeroporto"
            />
            <div className="flex items-center gap-2">
              {(["todas", "0", "1+"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setParadas(p)}
                  className={`cons-btn h-9 px-3 text-[12px] ${paradas === p ? "cons-btn-blue" : ""}`}
                >
                  {p === "todas" ? "Todas" : p === "0" ? "Diretos" : "Com escala"}
                </button>
              ))}
            </div>
            {filtrosAtivos > 0 && (
              <button
                type="button"
                className="cons-btn h-9 px-3 text-[12px]"
                onClick={() => {
                  setTexto("");
                  setCia(null);
                  setParadas("todas");
                }}
              >
                Limpar
              </button>
            )}
          </div>

          <ResumoCias
            pernas={pernas}
            selecionada={cia}
            onSelecionar={setCia}
            rotulo={`Companhias ${titulo.includes("volta") ? "volta" : "ida"}`}
          />
        </div>
      )}


      <div className="cons-card overflow-x-auto">
        <table className="cons-table min-w-[1180px]">
          <thead>
            <tr>
              <th />
              <th>Cia</th>
              <th>Saída</th>
              <th>Chegada</th>
              <th>Duração</th>
              <th>Info</th>
              <th>Sem bagagem</th>
              <th>Com bagagem</th>
              <th>Origem / Destino</th>
              <th>Conexão</th>
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
                <td colSpan={10} className="px-4 py-8 text-center text-[13px] cons-muted">
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
