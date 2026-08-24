import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { CidadeAutocompleteCF } from "@/components/comprefacil/CidadeAutocompleteCF";
import { ResumoPacote } from "@/components/pacote-motor/ResumoPacote";
import { SeletorVoo } from "@/components/pacote-motor/SeletorVoo";
import { SeletorHospedagem } from "@/components/pacote-motor/SeletorHospedagem";
import { brl, hora, resumoVoo, type HotelPacote, type ServicoPacote } from "@/lib/pacote-motor/mapear";
import { listarServicosCompreFacil } from "@/lib/comprefacil/comprefacil.functions";
import { buscarAereoCF, buscarHospedagemCF } from "@/lib/comprefacil/dinamico.functions";
import type { PassHubOferta } from "@/lib/passhub/types";

/** Remove HTML/entidades da descrição vinda da operadora. */
function textoSimples(v: unknown): string {
  if (!v) return "";
  return String(v)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

type Vista = "overview" | "voo" | "hotel";

/** Motor de Pacotes VIA AIR — modelo aprovado: visão geral, alterar voo, alterar hospedagem. */
export function PacoteMotor() {
  const buscarHoteis = useServerFn(buscarHospedagemCF);
  const listarServicos = useServerFn(listarServicosCompreFacil);
  const buscarVoos = useServerFn(buscarAereoCF);

  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [cidadeId, setCidadeId] = useState<number | null>(null);
  const [origemIata, setOrigemIata] = useState("");
  const [destinoIata, setDestinoIata] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [adultos, setAdultos] = useState(2);
  const [criancas, setCriancas] = useState(0);

  const [vista, setVista] = useState<Vista>("overview");
  const [hotel, setHotel] = useState<HotelPacote | null>(null);
  const [quartoId, setQuartoId] = useState<string | null>(null);
  const [voo, setVoo] = useState<PassHubOferta | null>(null);
  const [servicosSel, setServicosSel] = useState<string[]>([]);

  const pagantes = adultos + criancas;

  const pacotes = useMutation({
    mutationFn: (v: void) =>
      buscarHoteis({
        data: { cidadeId: cidadeId!, checkin: ida, checkout: volta || ida, adultos, criancas },
      }),
  });

  const voos = useMutation({
    mutationFn: (v: void) =>
      buscarVoos({
        data: { origem: origemIata, destino: destinoIata, ida, volta: volta || null, adultos, criancas },
      }),
  });

  const hoteis: HotelPacote[] = ((pacotes.data as any)?.hoteis ?? []) as HotelPacote[];
  const ofertas: PassHubOferta[] = ((voos.data as any)?.ofertas ?? []) as PassHubOferta[];
  const erroVoos = (voos.data as any)?.ok === false ? (voos.data as any).erro : null;

  // pacote recomendado = primeira opção devolvida por cada motor
  useEffect(() => {
    if (hoteis.length && !hotel) setHotel(hoteis[0]);
  }, [hoteis, hotel]);
  useEffect(() => {
    if (ofertas.length && !voo) setVoo(ofertas[0]);
  }, [ofertas, voo]);

  const detalhe = useQuery({
    queryKey: ["cf", "servicos-motor", destino, cidadeId],
    queryFn: () =>
      listarServicos({ data: { busca: destino, cidadeId: cidadeId ?? null, somenteAtivos: true } }),
    enabled: (!!destino.trim() || !!cidadeId) && (pacotes.isSuccess || voos.isSuccess),
    staleTime: 5 * 60_000,
  });

  const servicos: ServicoPacote[] = useMemo(
    () =>
      (((detalhe.data as any)?.itens ?? []) as any[]).map((s) => ({
        id: String(s.id),
        titulo: s.titulo ?? "Serviço",
        tipo: s.tipo ?? null,
        descricao: textoSimples(s.descricao) || s.fornecedor || null,
        valor: null,
      })),
    [detalhe.data],
  );

  const quarto = hotel?.quartos.find((q) => q.id === quartoId) ?? null;
  const servicosEscolhidos = servicos.filter((s) => servicosSel.includes(s.id));
  const servicosTotal = servicosEscolhidos.reduce((a, s) => a + (s.valor ?? 0), 0);
  const total = (hotel?.total ?? 0) + (quarto?.diferenca ?? 0) + (voo?.precoTotal ?? 0) + servicosTotal;

  const baseVoo = ofertas[0]?.precoTotal ?? voo?.precoTotal ?? 0;
  const baseHotel = hoteis[0]?.total ?? hotel?.total ?? 0;

  const buscou = pacotes.isSuccess || voos.isSuccess;
  const noites = useMemo(() => {
    if (!ida || !volta) return null;
    const d = Math.round((new Date(volta).getTime() - new Date(ida).getTime()) / 86400000);
    return d > 0 ? `${d} noite(s)` : null;
  }, [ida, volta]);

  function pesquisar() {
    setHotel(null);
    setVoo(null);
    setQuartoId(null);
    setServicosSel([]);
    setVista("overview");
    if (cidadeId && ida) pacotes.mutate();
    if (origemIata && destinoIata && ida) voos.mutate();
  }

  const rIda = voo ? resumoVoo(voo.ida) : null;

  const resumo = (
    <ResumoPacote
      destino={hotel?.localizacao || destino || "Pacote VIA AIR"}
      periodo={[ida, volta].filter(Boolean).map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(" a ")}
      pax={`${adultos} adulto(s)${criancas ? ` · ${criancas} criança(s)` : ""}`}
      noites={noites}
      linhas={[
        { rotulo: "Voo", valor: voo ? `${rIda!.companhia} · ${rIda!.horarios}` : "Não selecionado" },
        { rotulo: "Hotel", valor: hotel?.nome ?? "Não selecionado" },
        { rotulo: "Quarto", valor: quarto?.nome ?? "Conforme pacote" },
        {
          rotulo: "Serviços",
          valor: servicosEscolhidos.length
            ? servicosTotal
              ? `${servicosEscolhidos.length} adicionado(s) · ${brl(servicosTotal)}`
              : `${servicosEscolhidos.length} adicionado(s) · sob consulta`
            : "Nenhum adicionado",
        },
        ...servicosEscolhidos.map((s) => ({
          rotulo: `· ${s.titulo}`,
          valor: s.valor ? brl(s.valor) : "Sob consulta",
        })),
      ]}
      total={total}
      moeda={hotel?.moeda ?? "BRL"}
      rodape={pagantes ? `Valor para ${pagantes} passageiro(s) pagante(s)` : undefined}
    />
  );

  return (
    <div className="mkt">
      {/* Busca */}
      <div className="searchbar">
        <div className="search-fields">
          <div className="field">
            <label>Origem</label>
            <CidadeAutocompleteCF
              valor={origem}
              campo="saida"
              placeholder="Cidade de saída"
              onChange={(nome, _id, iata) => {
                setOrigem(nome);
                setOrigemIata(iata ?? "");
              }}
            />
          </div>
          <div className="field">
            <label>Destino</label>
            <CidadeAutocompleteCF
              valor={destino}
              campo="destino"
              placeholder="Cidade do pacote"
              onChange={(nome, id, iata) => {
                setDestino(nome);
                setCidadeId(id);
                setDestinoIata(iata ?? "");
              }}
            />
          </div>
          <div className="field">
            <label>Ida</label>
            <input type="date" value={ida} onChange={(e) => setIda(e.target.value)} />
          </div>
          <div className="field">
            <label>Volta</label>
            <input type="date" value={volta} onChange={(e) => setVolta(e.target.value)} />
          </div>
          <div className="field">
            <label>Viajantes</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                min={1}
                max={9}
                value={adultos}
                onChange={(e) => setAdultos(Number(e.target.value) || 1)}
              />
              <input
                type="number"
                min={0}
                max={8}
                value={criancas}
                onChange={(e) => setCriancas(Number(e.target.value) || 0)}
              />
            </div>
            <small>adultos · crianças</small>
          </div>
          <button
            type="button"
            className="search-action"
            onClick={pesquisar}
            disabled={pacotes.isPending || voos.isPending}
          >
            {pacotes.isPending || voos.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Pesquisar
          </button>
        </div>
      </div>

      {/* Abas de tela (não é a linha de etapas) */}
      <div className="screen-tabs">
        <button
          type="button"
          className={`screen-tab${vista === "overview" ? " active" : ""}`}
          onClick={() => setVista("overview")}
        >
          <b>Visão geral</b>
          <span>Primeira tela já com hospedagem</span>
        </button>
        <button
          type="button"
          className={`screen-tab${vista === "voo" ? " active" : ""}`}
          onClick={() => setVista("voo")}
        >
          <b>Alterar voo</b>
          <span>Conexões e detalhes do aéreo</span>
        </button>
        <button
          type="button"
          className={`screen-tab${vista === "hotel" ? " active" : ""}`}
          onClick={() => setVista("hotel")}
        >
          <b>Alterar hospedagem</b>
          <span>Troca de hotel/quarto</span>
        </button>
      </div>

      {vista === "voo" && (
        <SeletorVoo
          ofertas={ofertas}
          carregando={voos.isPending}
          erro={erroVoos}
          selecionadaId={voo?.id ?? null}
          baseTotal={baseVoo}
          onSelecionar={(o) => {
            setVoo(o);
            setVista("overview");
          }}
          resumo={resumo}
        />
      )}

      {vista === "hotel" && (
        <SeletorHospedagem
          hoteis={hoteis}
          carregando={pacotes.isPending}
          hotelSelecionadoId={hotel?.id ?? null}
          quartoSelecionadoId={quartoId}
          baseTotal={baseHotel}
          onSelecionar={(h, q) => {
            setHotel(h);
            setQuartoId(q);
            setVista("overview");
          }}
          resumo={resumo}
        />
      )}

      {vista === "overview" && (
        <div className="overview-layout">
          <div className="overview-card">
            {!buscou ? (
              <p className="empty">Informe origem, destino e datas para montar o pacote recomendado.</p>
            ) : (
              <>
                <p className="eyebrow">Pacote recomendado</p>
                <h2>{hotel?.nome ?? destino ?? "Pacote VIA AIR"}</h2>

                <div className="overview-grid">
                  {/* Voo selecionado */}
                  <div className="resume-card">
                    <div className="resume-head">
                      <b>Voo selecionado</b>
                      <button type="button" onClick={() => setVista("voo")}>
                        Alterar voo
                      </button>
                    </div>
                    <div className="resume-body">
                      {voos.isPending && <p style={{ fontSize: 12, color: "var(--muted)" }}>Consultando o motor aéreo…</p>}
                      {!voos.isPending && !voo && (
                        <p style={{ fontSize: 12, color: "var(--muted)" }}>
                          {erroVoos ?? "Nenhum voo selecionado para este trecho."}
                        </p>
                      )}
                      {voo && rIda && (
                        <>
                          <div className="quick-flight">
                            <div className="time">
                              <strong>{hora(voo.ida.partida)}</strong>
                              <small>{voo.ida.origem}</small>
                            </div>
                            <div className="midline">
                              <div className="bar" />
                              <span>
                                {rIda.escalas} · {rIda.duracao}
                              </span>
                            </div>
                            <div className="time" style={{ textAlign: "right" }}>
                              <strong>{hora(voo.ida.chegada)}</strong>
                              <small>{voo.ida.destino}</small>
                            </div>
                          </div>

                          {voo.voltas.map((v) => (
                            <div className="quick-flight" key={v.numeroVoo + v.partida}>
                              <div className="time">
                                <strong>{hora(v.partida)}</strong>
                                <small>{v.origem}</small>
                              </div>
                              <div className="midline">
                                <div className="bar" />
                                <span>
                                  {v.paradas === 0 ? "Direto" : `${v.paradas} conexão`} · {v.duracao}
                                </span>
                              </div>
                              <div className="time" style={{ textAlign: "right" }}>
                                <strong>{hora(v.chegada)}</strong>
                                <small>{v.destino}</small>
                              </div>
                            </div>
                          ))}

                          <div className="resume-tags">
                            <span>{rIda.companhia}</span>
                            <span>{rIda.bagagem}</span>
                            {(voo.ida.conexoes ?? []).map((c, i) => (
                              <span key={`${c.aeroporto}-${i}`}>Conexão em {c.aeroporto}</span>
                            ))}
                            <span>{brl(voo.precoTotal)}</span>
                          </div>

                          <button type="button" className="outline-btn" onClick={() => setVista("voo")}>
                            Ver detalhes da conexão
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Hospedagem selecionada */}
                  <div className="resume-card">
                    <div className="resume-head">
                      <b>Hospedagem selecionada</b>
                      <button type="button" onClick={() => setVista("hotel")}>
                        Alterar hospedagem
                      </button>
                    </div>
                    <div className="resume-body">
                      {pacotes.isPending && (
                        <p style={{ fontSize: 12, color: "var(--muted)" }}>Buscando pacotes na operadora…</p>
                      )}
                      {!pacotes.isPending && !hotel && (
                        <p style={{ fontSize: 12, color: "var(--muted)" }}>
                          Nenhum pacote encontrado para este destino e período.
                        </p>
                      )}
                      {hotel && (
                        <>
                          <div className="hotel-snap">
                            {hotel.fotos[0] ? (
                              <img src={hotel.fotos[0]} alt={`Foto do hotel ${hotel.nome}`} loading="lazy" />
                            ) : (
                              <div className="noimg" style={{ width: 84, height: 84, borderRadius: 12 }}>
                                —
                              </div>
                            )}
                            <div>
                              {hotel.categoria ? <p className="stars">{"★".repeat(hotel.categoria)}</p> : null}
                              <h4>{hotel.nome}</h4>
                              <p>
                                {[
                                  hotel.localizacao,
                                  quarto?.nome ?? "Acomodação conforme o pacote",
                                  quarto?.regime ?? hotel.regime,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          </div>

                          <div className="resume-tags">
                            {hotel.avaliacao ? <span>{hotel.avaliacao} / 5</span> : null}
                            {hotel.beneficios.slice(0, 3).map((b) => (
                              <span key={b}>{b.length > 30 ? `${b.slice(0, 30)}…` : b}</span>
                            ))}
                            <span>{brl(hotel.total, hotel.moeda)}</span>
                          </div>

                          <button type="button" className="outline-btn" onClick={() => setVista("hotel")}>
                            Trocar hotel ou quarto
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Serviços — só entram no pacote quando adicionados */}
                <div className="servicos">
                  <div className="resume-head" style={{ borderRadius: 12, border: "1px solid var(--line)" }}>
                    <b>Serviços</b>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>
                      Não entram no pacote até serem adicionados
                    </span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {detalhe.isPending ? (
                      <p style={{ fontSize: 12, color: "var(--muted)" }}>Buscando serviços do destino…</p>
                    ) : servicos.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--muted)" }}>Sem serviços adicionais para este destino.</p>
                    ) : (
                      servicos.map((s) => {
                        const marcado = servicosSel.includes(s.id);
                        return (
                          <div key={s.id} className={`servico-row${marcado ? " on" : ""}`}>
                            <span>
                              <b>{s.titulo}</b>
                              {s.descricao ? (
                                <span className="desc">
                                  {s.descricao.length > 120 ? `${s.descricao.slice(0, 120)}…` : s.descricao}
                                </span>
                              ) : null}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                              {s.valor ? brl(s.valor) : "Sob consulta"}
                              <button
                                type="button"
                                onClick={() =>
                                  setServicosSel((v) => (marcado ? v.filter((x) => x !== s.id) : [...v, s.id]))
                                }
                              >
                                {marcado ? "Remover" : "Adicionar"}
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <p className="overview-note">
                  Período {dataBr(ida)}
                  {volta ? ` a ${dataBr(volta)}` : ""} · {pagantes} passageiro(s). Voo e hospedagem vêm dos motores
                  reais; alterar um não altera o outro.
                </p>
              </>
            )}
          </div>

          {resumo}
        </div>
      )}
    </div>
  );
}
