import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  ChevronRight,
  Clock,
  CreditCard,
  Filter,
  Info,
  Luggage,
  Plane,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import type { PassHubOferta, PassHubResultado, PassHubVoo } from "@/lib/passhub/types";

type Props = {
  resultado: PassHubResultado;
  onReservar: (oferta: PassHubOferta) => void;
};

type Ordem = "preco" | "duracao" | "partida" | "chegada";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const hora = (dataHora: string) => (dataHora.split(" ")[1] ?? dataHora).slice(0, 5);
const dia = (dataHora: string) => dataHora.split(" ")[0] ?? "";
const minutosDaPartida = (dataHora: string) => {
  const [h, m] = hora(dataHora).split(":");
  return Number(h ?? 0) * 60 + Number(m ?? 0);
};

const faixas = [
  { id: "madrugada", rotulo: "00h–06h", de: 0, ate: 359 },
  { id: "manha", rotulo: "06h–12h", de: 360, ate: 719 },
  { id: "tarde", rotulo: "12h–18h", de: 720, ate: 1079 },
  { id: "noite", rotulo: "18h–24h", de: 1080, ate: 1440 },
] as const;

const COLUNAS =
  "grid grid-cols-1 items-center gap-3 xl:grid-cols-[44px_110px_minmax(0,1.15fr)_minmax(0,1.15fr)_96px_120px_minmax(0,1fr)_minmax(0,0.9fr)_96px_40px]";

/** Botão-pílula usado nos filtros, no padrão da consolidadora. */
function Pilula({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cons-btn h-8 px-3 text-[12px]"
      style={
        ativo
          ? { background: "linear-gradient(180deg,#f26b1f,#db5c15)", borderColor: "transparent", color: "#fff" }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function BlocoVoo({ voo, rotulo }: { voo: PassHubVoo; rotulo: string }) {
  return (
    <div className="cons-soft grid grid-cols-[auto_auto_1fr] items-center gap-3 px-3 py-2">
      <div className="text-sm font-black">{hora(voo.partida)}</div>
      <div className="text-[11px] cons-muted">{dia(voo.partida)}</div>
      <div className="truncate text-[12px] font-bold">
        {rotulo === "chegada"
          ? `${voo.origem} → ${voo.destino}`
          : `${voo.companhiaIata || voo.companhia} ${voo.numeroVoo}`}
      </div>
    </div>
  );
}

function LinhaOferta({
  oferta,
  maisBarata,
  onReservar,
}: {
  oferta: PassHubOferta;
  maisBarata: boolean;
  onReservar: (o: PassHubOferta) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const voos = [oferta.ida, ...oferta.voltas];
  const maxParcelas = oferta.ida.parcelamento.reduce((m, p) => Math.max(m, p.maxParcelas), 0);
  const rota = [
    oferta.ida.origem,
    ...oferta.ida.conexoes.map((c) => c.aeroporto),
    oferta.ida.destino,
  ];
  const conexao = oferta.ida.conexoes[0]?.duracao ?? "—";

  return (
    <div className={`cons-row px-3 py-3 md:px-4 ${maisBarata ? "cons-row-sel" : ""}`}>
      <div className={COLUNAS}>
        <div>
          <button
            type="button"
            aria-label="Reservar esta opção"
            onClick={() => onReservar(oferta)}
            className="grid h-9 w-9 place-items-center rounded-full border border-[rgba(255,148,64,.5)] text-[#ff9440] transition hover:bg-[rgba(255,148,64,.14)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-2">
          {voos.map((v, i) => (
            <span key={i} className="cons-pill">
              {v.companhiaIata || v.companhia}
            </span>
          ))}
        </div>

        <div className="grid gap-2">
          {voos.map((v, i) => (
            <BlocoVoo key={i} voo={v} rotulo="saida" />
          ))}
        </div>

        <div className="grid gap-2">
          {voos.map((v, i) => (
            <BlocoVoo key={i} voo={{ ...v, partida: v.chegada }} rotulo="chegada" />
          ))}
        </div>

        <div>
          <b className="text-[13px]">{oferta.ida.duracao}</b>
          <div className="text-[11px] cons-muted">
            {oferta.ida.paradas === 0 ? "voo direto" : `${oferta.ida.paradas} parada(s)`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {oferta.ida.familiaTarifaria && (
            <span className="cons-chip">{oferta.ida.familiaTarifaria}</span>
          )}
          {oferta.ida.bagagemDespachada ? (
            <span className="cons-chip" title="Com bagagem despachada">
              <Luggage className="h-3 w-3" /> {oferta.ida.bagagemDespachadaQtd || 1}
            </span>
          ) : (
            <span className="cons-chip" title="Somente bagagem de mão">
              <Briefcase className="h-3 w-3" /> mão
            </span>
          )}
        </div>

        <div className="cons-box px-3 py-2">
          <div className="text-[15px] font-black leading-none">{brl(oferta.precoTotal)}</div>
          <div className="mt-1 text-[10px] cons-muted">
            tarifa {brl(oferta.ida.precoTarifa)} + taxas {brl(oferta.ida.taxas)}
          </div>
          {maxParcelas > 0 && (
            <div className="mt-1 flex items-center gap-1 text-[10px] cons-muted">
              <CreditCard className="h-3 w-3" /> até {maxParcelas}x
            </div>
          )}
        </div>

        <div className="min-w-0 text-[12px]">
          <b>{rota[0]}</b>
          <div className="truncate cons-muted">{rota.slice(1).join(" · ")}</div>
        </div>

        <div className="text-[12px]">
          <b>{conexao}</b>
          <div className="cons-muted">
            {oferta.ida.paradas === 0 ? "sem parada" : `${oferta.ida.paradas} parada(s)`}
          </div>
        </div>

        <div className="flex justify-end xl:justify-center">
          <button
            type="button"
            aria-label="Ver detalhes"
            onClick={() => setAberto((a) => !a)}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#102334] text-[#dcecff]"
          >
            <ChevronRight className={`h-4 w-4 transition ${aberto ? "rotate-90" : ""}`} />
          </button>
        </div>
      </div>

      {aberto && (
        <div className="cons-soft mt-3 grid gap-3 p-3 text-[12px] md:grid-cols-3">
          <div>
            <p className="mb-1 font-semibold">Serviços da tarifa</p>
            <ul className="space-y-1">
              {oferta.ida.servicos.map((s, i) => (
                <li key={i} className={s.incluso ? "" : "cons-muted"}>
                  {s.incluso ? "✔" : "✖"} {s.descricao || s.tipo}
                </li>
              ))}
              {oferta.ida.servicos.length === 0 && <li className="cons-muted">Não informado</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold">Conexões</p>
            <ul className="space-y-1 cons-muted">
              {voos.flatMap((v, vi) =>
                v.conexoes.map((c, ci) => (
                  <li key={`${vi}-${ci}`}>
                    {c.aeroporto} · espera {c.duracao}
                    {c.mudancaAeroporto ? " · troca de aeroporto" : ""}
                  </li>
                )),
              )}
              {voos.every((v) => v.conexoes.length === 0) && <li>Sem conexões</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold">Parcelamento por bandeira</p>
            <ul className="space-y-1 cons-muted">
              {oferta.ida.parcelamento.map((p) => (
                <li key={p.bandeira}>
                  {p.bandeira}: até {p.maxParcelas}x
                </li>
              ))}
              {oferta.ida.parcelamento.length === 0 && <li>Não informado</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResultadosPassHub({ resultado, onReservar }: Props) {
  const [texto, setTexto] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("preco");
  const [companhias, setCompanhias] = useState<string[]>([]);
  const [paradas, setParadas] = useState<"todas" | "0" | "1" | "2+">("todas");
  const [soBagagem, setSoBagagem] = useState(false);
  const [familias, setFamilias] = useState<string[]>([]);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [tetoPreco, setTetoPreco] = useState(resultado.precoMax);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  useEffect(() => {
    setCompanhias([]);
    setFamilias([]);
    setPeriodos([]);
    setParadas("todas");
    setSoBagagem(false);
    setTexto("");
    setTetoPreco(resultado.precoMax);
  }, [resultado]);

  const alterna = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);

  const precoPorCompanhia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of resultado.ofertas) {
      const cia = o.ida.companhia || o.ida.companhiaIata;
      const atual = mapa.get(cia);
      if (atual === undefined || o.precoTotal < atual) mapa.set(cia, o.precoTotal);
    }
    return [...mapa.entries()].sort((a, b) => a[1] - b[1]);
  }, [resultado]);

  const ofertas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const lista = resultado.ofertas.filter((o) => {
      const voos = [o.ida, ...o.voltas];
      if (o.precoTotal > tetoPreco) return false;
      if (companhias.length && !voos.some((v) => companhias.includes(v.companhia))) return false;
      if (familias.length && !voos.some((v) => familias.includes(v.familiaTarifaria))) return false;
      if (soBagagem && voos.some((v) => !v.bagagemDespachada)) return false;
      if (paradas === "0" && voos.some((v) => v.paradas > 0)) return false;
      if (paradas === "1" && voos.some((v) => v.paradas > 1)) return false;
      if (paradas === "2+" && !voos.some((v) => v.paradas >= 2)) return false;
      if (periodos.length) {
        const m = minutosDaPartida(o.ida.partida);
        const bate = faixas.some((f) => periodos.includes(f.id) && m >= f.de && m <= f.ate);
        if (!bate) return false;
      }
      if (q) {
        const alvo = voos
          .flatMap((v) => [
            v.companhia,
            v.companhiaIata,
            v.numeroVoo,
            v.origem,
            v.destino,
            v.familiaTarifaria,
            ...v.conexoes.map((c) => c.aeroporto),
          ])
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });

    const chave = (o: PassHubOferta) => {
      if (ordem === "preco") return o.precoTotal;
      if (ordem === "duracao") return [o.ida, ...o.voltas].reduce((s, v) => s + v.duracaoMinutos, 0);
      if (ordem === "chegada") return minutosDaPartida(o.ida.chegada);
      return minutosDaPartida(o.ida.partida);
    };
    return [...lista].sort((a, b) => chave(a) - chave(b));
  }, [resultado, texto, ordem, companhias, familias, paradas, soBagagem, periodos, tetoPreco]);

  const menorPreco = ofertas.length ? Math.min(...ofertas.map((o) => o.precoTotal)) : 0;
  const filtrosAtivos =
    companhias.length +
    familias.length +
    periodos.length +
    (soBagagem ? 1 : 0) +
    (paradas !== "todas" ? 1 : 0) +
    (tetoPreco < resultado.precoMax ? 1 : 0);

  const limpar = () => {
    setCompanhias([]);
    setFamilias([]);
    setPeriodos([]);
    setParadas("todas");
    setSoBagagem(false);
    setTetoPreco(resultado.precoMax);
    setTexto("");
  };

  const painelFiltros = (
    <div className="space-y-5">
      <div>
        <p className="cons-lab mb-2">Companhia aérea</p>
        <div className="space-y-2">
          {precoPorCompanhia.map(([cia, preco]) => (
            <label key={cia} className="flex cursor-pointer items-center justify-between gap-2 text-[13px]">
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={companhias.includes(cia)}
                  onCheckedChange={() => alterna(companhias, setCompanhias, cia)}
                />
                {cia}
              </span>
              <span className="text-[11px] cons-muted">{brl(preco)}</span>
            </label>
          ))}
          {precoPorCompanhia.length === 0 && (
            <p className="text-[12px] cons-muted">Sem companhias nesta busca.</p>
          )}
        </div>
      </div>

      <div className="cons-dot" />

      <div>
        <p className="cons-lab mb-2">Paradas</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["todas", "Todas"],
              ["0", "Direto"],
              ["1", "Até 1"],
              ["2+", "2 ou mais"],
            ] as const
          ).map(([v, rotulo]) => (
            <Pilula key={v} ativo={paradas === v} onClick={() => setParadas(v)}>
              {rotulo}
            </Pilula>
          ))}
        </div>
      </div>

      <div>
        <p className="cons-lab mb-2">Horário de partida (ida)</p>
        <div className="flex flex-wrap gap-2">
          {faixas.map((f) => (
            <Pilula
              key={f.id}
              ativo={periodos.includes(f.id)}
              onClick={() => alterna(periodos, setPeriodos, f.id)}
            >
              {f.rotulo}
            </Pilula>
          ))}
        </div>
      </div>

      {resultado.familias.length > 0 && (
        <div>
          <p className="cons-lab mb-2">Família tarifária</p>
          <div className="flex flex-wrap gap-2">
            {resultado.familias.map((f) => (
              <Pilula
                key={f}
                ativo={familias.includes(f)}
                onClick={() => alterna(familias, setFamilias, f)}
              >
                {f}
              </Pilula>
            ))}
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <Checkbox checked={soBagagem} onCheckedChange={(v) => setSoBagagem(v === true)} />
        Só com bagagem despachada
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="cons-lab">Preço até</p>
          <span className="text-[13px] font-bold">{brl(tetoPreco)}</span>
        </div>
        <Slider
          min={Math.floor(resultado.precoMin)}
          max={Math.ceil(resultado.precoMax)}
          step={10}
          value={[tetoPreco]}
          onValueChange={([v]) => setTetoPreco(v ?? resultado.precoMax)}
        />
      </div>

      <button type="button" className="cons-btn w-full" onClick={limpar}>
        <X className="h-4 w-4" /> Limpar filtros
      </button>
    </div>
  );

  return (
    <section className="space-y-4">
      {/* Resumo por companhia — clicável, vira filtro */}
      <div className="cons-card overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {precoPorCompanhia.slice(0, 4).map(([cia, preco], i) => {
            const ativo = companhias.includes(cia);
            return (
              <button
                key={cia}
                type="button"
                onClick={() => alterna(companhias, setCompanhias, cia)}
                className="border-b border-[var(--cons-line)] p-4 text-center transition last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0"
                style={ativo ? { background: "rgba(63,141,227,.12)" } : undefined}
              >
                <div className="mb-2 flex items-center justify-center gap-2">
                  <span className="cons-pill">{cia}</span>
                  {i === 0 && (
                    <span className="cons-status cons-status-ok">menor preço</span>
                  )}
                </div>
                <div className="text-[16px] font-black">{brl(preco)}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="cons-card hidden h-fit p-4 xl:block">
          <p className="mb-3 flex items-center gap-2 font-bold">
            <Filter className="h-4 w-4 text-[var(--cons-orange2)]" /> Filtros
            {filtrosAtivos > 0 && <span className="cons-status cons-status-ok">{filtrosAtivos}</span>}
          </p>
          {painelFiltros}
        </aside>

        <div className="min-w-0 space-y-3">
          <div className="cons-card flex flex-wrap items-center gap-3 p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 cons-muted" />
              <input
                className="cons-field pl-9"
                placeholder="Cia, voo, aeroporto ou família tarifária"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </div>
            <select
              className="cons-field w-auto"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
            >
              <option value="preco">Menor preço</option>
              <option value="duracao">Menor duração</option>
              <option value="partida">Partida mais cedo</option>
              <option value="chegada">Chegada mais cedo</option>
            </select>
            <button
              type="button"
              className="cons-btn cons-btn-primary xl:hidden"
              onClick={() => setFiltrosAbertos((v) => !v)}
            >
              <Filter className="h-4 w-4" /> Mais filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
            </button>
            <span className="text-[12px] cons-muted">
              {ofertas.length} de {resultado.ofertas.length} ofertas
            </span>
          </div>

          {filtrosAbertos && <div className="cons-card p-4 xl:hidden">{painelFiltros}</div>}

          <div className="cons-card overflow-hidden">
            <div
              className={`${COLUNAS} hidden px-4 py-3 text-[11px] font-extrabold uppercase tracking-wide text-[#dcedff] xl:grid`}
              style={{ background: "rgba(255,255,255,.02)" }}
            >
              <div />
              <div>Cia</div>
              <div>Saída</div>
              <div>Chegada</div>
              <div>Duração</div>
              <div>Info</div>
              <div>Total</div>
              <div>Origem / Destino</div>
              <div>Conexão</div>
              <div />
            </div>

            {ofertas.length === 0 ? (
              <p className="p-8 text-center text-[13px] cons-muted">
                Nenhuma oferta com os filtros atuais.{" "}
                <button type="button" className="underline" onClick={limpar}>
                  Limpar filtros
                </button>
              </p>
            ) : (
              ofertas.map((o) => (
                <LinhaOferta
                  key={o.id}
                  oferta={o}
                  maisBarata={o.precoTotal === menorPreco}
                  onReservar={onReservar}
                />
              ))
            )}
          </div>

          <p className="flex items-center gap-2 text-[11px] cons-muted">
            <Info className="h-3.5 w-3.5" /> Clique no <Plus className="h-3 w-3" /> para reservar: a
            tarifa é revalidada e o localizador sai sem sair do sistema.
            <Plane className="h-3.5 w-3.5" />
            <Clock className="h-3.5 w-3.5" />
          </p>
        </div>
      </div>
    </section>
  );
}
