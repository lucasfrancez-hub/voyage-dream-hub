import { useMemo, useState } from "react";
import { LogoCia } from "@/components/pacote-motor/LogoCia";
import { brl, hora, resumoVoo } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta, PassHubVoo } from "@/lib/passhub/types";

const dataCurta = (iso: string) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");

function Perna({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const r = resumoVoo(voo);
  return (
    <div className="leg">
      <div className="side">
        <strong>{hora(voo.partida)}</strong>
        <b>{voo.origem}</b>
        <small>
          {rotulo} · {dataCurta(voo.partida)}
        </small>
      </div>
      <div className="middle">
        <span>{r.duracao}</span>
        <div className="line" />
        <em>{[r.escalas, voo.escala, voo.familiaTarifaria || voo.classe].filter(Boolean).join(" · ")}</em>
      </div>
      <div className="side r">
        <strong>{hora(voo.chegada)}</strong>
        <b>{voo.destino}</b>
        <small>Chegada · {dataCurta(voo.chegada)}</small>
      </div>
    </div>
  );
}

function Detalhe({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  const trechos: any[] = voo.conexoes?.length ? voo.conexoes : [];
  return (
    <div className="detailbox">
      <h4>
        {rotulo} · {dataCurta(voo.partida)}
      </h4>
      {(trechos.length ? trechos : [null]).map((c, i) => {
        const origem = c?.origem ?? voo.origem;
        const destino = c?.destino ?? voo.destino;
        const partida = c?.partida ?? voo.partida;
        const chegada = c?.chegada ?? voo.chegada;
        return (
          <div key={`${origem}-${i}`}>
            {i > 0 ? <div className="connect">Conexão em {trechos[i - 1].destino}</div> : null}
            <div className="segment">
              <div className="clock">
                {hora(partida)}
                <small>{origem}</small>
              </div>
              <div className="dots" />
              <div className="segtext">
                <b>
                  {(c?.companhiaIata ?? voo.companhiaIata) || ""} {(c?.numeroVoo ?? voo.numeroVoo) || ""} · {origem} →{" "}
                  {destino}
                </b>
                <span>
                  Chegada {hora(chegada)}
                  {c?.duracao ? ` · ${c.duracao}` : ""}
                  {c?.classe ? ` · ${c.classe}` : ""}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type Paradas = "direto" | "ate1" | "todos";
type Ordem = "preco" | "precoDesc" | "duracao" | "partida";

/** Faixas de horário no padrão da operadora. */
const FAIXAS: [string, string][] = [
  ["madrugada", "00h–06h"],
  ["manha", "06h–12h"],
  ["tarde", "12h–18h"],
  ["noite", "18h–24h"],
];

function faixaHorario(iso: string): string {
  const h = Number(String(iso ?? "").slice(11, 13));
  if (h < 6) return "madrugada";
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

const duracaoTotal = (o: PassHubOferta) =>
  [o.ida, ...(o.voltas ?? [])].reduce((a, v) => a + (v.duracaoMinutos || 0), 0);

const horasMin = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** Chips de múltipla escolha reutilizados por todos os blocos de filtro. */
export function Chips({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: { v: string; l: string }[];
  valor: string[];
  onChange: (v: string[]) => void;
  rotulo: string;
}) {
  if (!opcoes.length) return null;
  return (
    <div className="fb">
      <span className="flabel">{rotulo}</span>
      <div className="chips">
        {opcoes.map((o) => (
          <span
            key={o.v}
            className={`chip${valor.includes(o.v) ? " active" : ""}`}
            onClick={() => onChange(valor.includes(o.v) ? valor.filter((x) => x !== o.v) : [...valor, o.v])}
          >
            {o.l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Alterar voo — padrão aprovado: filtros | resultados | resumo. */
export function SeletorVoo({
  ofertas,
  carregando,
  erro,
  selecionadaId,
  baseTotal,
  totalPacote,
  onSelecionar,
  resumo,
}: {
  ofertas: PassHubOferta[];
  carregando: boolean;
  erro?: string | null;
  selecionadaId: string | null;
  baseTotal: number;
  totalPacote: (oferta: PassHubOferta) => number;
  onSelecionar: (o: PassHubOferta) => void;
  resumo: React.ReactNode;
}) {
  const [somenteBagagem, setSomenteBagagem] = useState(false);
  const [paradas, setParadas] = useState<Paradas>("todos");
  const [cias, setCias] = useState<string[]>([]);
  const [familias, setFamilias] = useState<string[]>([]);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [conexoes, setConexoes] = useState<string[]>([]);
  const [faixasIda, setFaixasIda] = useState<string[]>([]);
  const [faixasVolta, setFaixasVolta] = useState<string[]>([]);
  const [precoMax, setPrecoMax] = useState<number | null>(null);
  const [duracaoMax, setDuracaoMax] = useState<number | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("preco");
  const [aberta, setAberta] = useState<string | null>(null);

  const opcoes = useMemo(() => {
    const cia = new Set<string>();
    const fam = new Set<string>();
    const forn = new Set<string>();
    const conx = new Set<string>();
    for (const o of ofertas) {
      for (const v of [o.ida, ...(o.voltas ?? [])]) {
        if (v.companhiaIata) cia.add(v.companhiaIata);
        if (v.familiaTarifaria) fam.add(v.familiaTarifaria);
        if (v.provedor) forn.add(v.provedor);
        for (const c of (v.conexoes ?? []) as any[]) {
          if (c?.destino && c.destino !== v.destino) conx.add(c.destino);
        }
      }
    }
    return {
      cias: [...cia].sort(),
      familias: [...fam].sort(),
      fornecedores: [...forn].sort(),
      conexoes: [...conx].sort(),
    };
  }, [ofertas]);

  const limites = useMemo(() => {
    const p = ofertas.map((o) => o.precoTotal).filter((v) => v > 0);
    const d = ofertas.map((o) => duracaoTotal(o)).filter((v) => v > 0);
    return {
      precoMin: p.length ? Math.floor(Math.min(...p)) : 0,
      precoMax: p.length ? Math.ceil(Math.max(...p)) : 0,
      duracaoMin: d.length ? Math.min(...d) : 0,
      duracaoMax: d.length ? Math.max(...d) : 0,
    };
  }, [ofertas]);

  const lista = useMemo(() => {
    const filtradas = ofertas.filter((o) => {
      const volta = o.voltas?.[0] ?? null;
      if (somenteBagagem && !o.ida.bagagemDespachada) return false;
      if (paradas === "direto" && (o.ida.paradas > 0 || (volta?.paradas ?? 0) > 0)) return false;
      if (paradas === "ate1" && (o.ida.paradas > 1 || (volta?.paradas ?? 0) > 1)) return false;
      if (cias.length && !cias.includes(o.ida.companhiaIata)) return false;
      if (familias.length && !familias.includes(o.ida.familiaTarifaria || "")) return false;
      if (fornecedores.length && !fornecedores.includes(o.ida.provedor || "")) return false;
      if (conexoes.length) {
        const paradasFeitas = [o.ida, ...(o.voltas ?? [])].flatMap((v) =>
          ((v.conexoes ?? []) as any[]).map((c) => c?.destino).filter((d) => d && d !== v.destino),
        );
        if (!paradasFeitas.some((d) => conexoes.includes(d))) return false;
      }
      if (faixasIda.length && !faixasIda.includes(faixaHorario(o.ida.partida))) return false;
      if (faixasVolta.length && !(volta && faixasVolta.includes(faixaHorario(volta.partida)))) return false;
      if (precoMax != null && o.precoTotal > precoMax) return false;
      if (duracaoMax != null && duracaoTotal(o) > duracaoMax) return false;
      return true;
    });
    const ordenadas = [...filtradas];
    if (ordem === "preco") ordenadas.sort((a, b) => a.precoTotal - b.precoTotal);
    if (ordem === "precoDesc") ordenadas.sort((a, b) => b.precoTotal - a.precoTotal);
    if (ordem === "duracao") ordenadas.sort((a, b) => duracaoTotal(a) - duracaoTotal(b));
    if (ordem === "partida")
      ordenadas.sort((a, b) => String(a.ida.partida).localeCompare(String(b.ida.partida)));
    return ordenadas;
  }, [
    ofertas,
    somenteBagagem,
    paradas,
    cias,
    familias,
    fornecedores,
    conexoes,
    faixasIda,
    faixasVolta,
    precoMax,
    duracaoMax,
    ordem,
  ]);

  const temVolta = ofertas.some((o) => (o.voltas?.length ?? 0) > 0);
  const limpar = () => {
    setSomenteBagagem(false);
    setParadas("todos");
    setCias([]);
    setFamilias([]);
    setFornecedores([]);
    setConexoes([]);
    setFaixasIda([]);
    setFaixasVolta([]);
    setPrecoMax(null);
    setDuracaoMax(null);
    setOrdem("preco");
  };


  return (
    <section className="screen active">
      <div className="title">
        <div>
          <h2>Escolha o aéreo do pacote</h2>
          <p>Compare a viagem completa em um único card: ida e volta já combinadas.</p>
        </div>
        <span className="pill">{lista.length} combinações</span>
      </div>

      <div className="market">
        <aside className="filters">
          <div className="filter-head">
            Filtros do aéreo
            <button type="button" className="fclear" onClick={limpar}>
              Limpar
            </button>
          </div>
          <div className="filter-body">
            <div className="fb">
              <span className="flabel">Ordenar por</span>
              <select className="fselect" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
                <option value="preco">Menor preço</option>
                <option value="precoDesc">Maior preço</option>
                <option value="duracao">Menor duração</option>
                <option value="partida">Partida mais cedo</option>
              </select>
            </div>
            <div className="fb">
              <div className="toggle">
                <span>Bagagem para despachar</span>
                <i
                  className={`switch${somenteBagagem ? " on" : ""}`}
                  onClick={() => setSomenteBagagem((v) => !v)}
                  role="switch"
                  aria-checked={somenteBagagem}
                />
              </div>
            </div>
            <div className="fb">
              <span className="flabel">Paradas</span>
              <div className="segments">
                {(
                  [
                    ["direto", "Direto"],
                    ["ate1", "Até 1"],
                    ["todos", "Todos"],
                  ] as [Paradas, string][]
                ).map(([v, l]) => (
                  <button key={v} type="button" className={paradas === v ? "active" : ""} onClick={() => setParadas(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {limites.precoMax > 0 ? (
              <div className="fb">
                <span className="flabel">Preço até</span>
                <div className="pricecap">
                  <span>{brl(limites.precoMin)}</span>
                  <span>{brl(precoMax ?? limites.precoMax)}</span>
                </div>
                <input
                  className="frange"
                  type="range"
                  min={limites.precoMin}
                  max={limites.precoMax}
                  step={10}
                  value={precoMax ?? limites.precoMax}
                  onChange={(e) => setPrecoMax(Number(e.target.value))}
                />
              </div>
            ) : null}
            {limites.duracaoMax > 0 ? (
              <div className="fb">
                <span className="flabel">Duração total até</span>
                <div className="pricecap">
                  <span>{horasMin(limites.duracaoMin)}</span>
                  <span>{horasMin(duracaoMax ?? limites.duracaoMax)}</span>
                </div>
                <input
                  className="frange"
                  type="range"
                  min={limites.duracaoMin}
                  max={limites.duracaoMax}
                  step={15}
                  value={duracaoMax ?? limites.duracaoMax}
                  onChange={(e) => setDuracaoMax(Number(e.target.value))}
                />
              </div>
            ) : null}
            <Chips
              rotulo="Companhia aérea"
              opcoes={opcoes.cias.map((c) => ({ v: c, l: c }))}
              valor={cias}
              onChange={setCias}
            />
            <Chips
              rotulo="Horário de saída (ida)"
              opcoes={FAIXAS.map(([v, l]) => ({ v, l }))}
              valor={faixasIda}
              onChange={setFaixasIda}
            />
            {temVolta ? (
              <Chips
                rotulo="Horário de saída (volta)"
                opcoes={FAIXAS.map(([v, l]) => ({ v, l }))}
                valor={faixasVolta}
                onChange={setFaixasVolta}
              />
            ) : null}
            <Chips
              rotulo="Família tarifária"
              opcoes={opcoes.familias.map((f) => ({ v: f, l: f }))}
              valor={familias}
              onChange={setFamilias}
            />
            <Chips
              rotulo="Aeroporto de conexão"
              opcoes={opcoes.conexoes.map((c) => ({ v: c, l: c }))}
              valor={conexoes}
              onChange={setConexoes}
            />
            <Chips
              rotulo="Fornecedor"
              opcoes={opcoes.fornecedores.map((f) => ({ v: f, l: f }))}
              valor={fornecedores}
              onChange={setFornecedores}
            />
          </div>
        </aside>

        <div className="results">
          {carregando && <div className="state-box">Consultando a malha aérea…</div>}
          {!carregando && erro && <div className="state-box err">{erro}</div>}
          {!carregando && !erro && lista.length === 0 && (
            <div className="state-box">Nenhum voo encontrado para este trecho e período.</div>
          )}

          {lista.map((o) => {
            const r = resumoVoo(o.ida);
            const volta = o.voltas?.[0] ?? null;
            const sel = o.id === selecionadaId;
            const dif = Number((o.precoTotal - baseTotal).toFixed(2));
            const expandida = aberta === o.id;
            return (
              <article key={o.id} className={`flight${sel ? " selected" : ""}${expandida ? " open" : ""}`}>
                <div className="flightgrid">
                  <div className="flightmain">
                    <div className="flighthead">
                      <div className="badge">
                        <i />
                        {volta ? "Ida e volta" : "Somente ida"} · {dataCurta(o.ida.partida)}
                        {volta ? ` → ${dataCurta(volta.partida)}` : ""}
                      </div>
                      <div className="airline">
                        <LogoCia iata={o.ida.companhiaIata} nome={r.companhia} size={34} />
                        <div>
                          <b>{r.companhia}</b>
                          <small>
                            {o.ida.companhiaIata} {o.ida.numeroVoo}
                            {volta ? ` / ${volta.companhiaIata} ${volta.numeroVoo}` : ""}
                          </small>
                        </div>
                      </div>
                    </div>

                    <div className="legs">
                      <Perna voo={o.ida} rotulo="Saída" />
                      {volta ? <Perna voo={volta} rotulo="Saída" /> : null}
                    </div>

                    <div className="flightfoot">
                      <span className="bag">{r.bagagem}</span>
                      <button type="button" className="more" onClick={() => setAberta(expandida ? null : o.id)}>
                        {expandida ? "Ver menos ⌃" : "Ver mais ⌄"}
                      </button>
                    </div>
                  </div>

                  <div className="priceside">
                    <div className="prow">
                      <span>Diferença</span>
                      <b>{Math.abs(dif) < 0.005 ? "Incluído" : dif > 0 ? `+ ${brl(dif)}` : `- ${brl(Math.abs(dif))}`}</b>
                    </div>
                    <div className="prow">
                      <span>Taxas</span>
                      <b>{brl(o.ida.taxas)}</b>
                    </div>
                    <div className="divider" />
                    <span className="plabel">Valor final do pacote</span>
                    <div className="big">{brl(totalPacote(o))}</div>
                    <div className="parcel">Parcelamento conforme a condição da operadora</div>
                    <button type="button" className={`select${sel ? " on" : ""}`} onClick={() => onSelecionar(o)}>
                      {sel ? "Selecionado" : "Selecionar"}
                    </button>
                  </div>
                </div>

                <div className="details">
                  <div className="detailgrid">
                    <Detalhe voo={o.ida} rotulo="Ida" />
                    {volta ? <Detalhe voo={volta} rotulo="Volta" /> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {resumo}
      </div>
    </section>
  );
}
