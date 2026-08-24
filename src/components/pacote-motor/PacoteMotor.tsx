import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Hotel, Loader2, Plane, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CidadeAutocompleteCF } from "@/components/comprefacil/CidadeAutocompleteCF";
import { ResumoPacote } from "@/components/pacote-motor/ResumoPacote";
import { SeletorVoo } from "@/components/pacote-motor/SeletorVoo";
import { SeletorHospedagem } from "@/components/pacote-motor/SeletorHospedagem";
import { TimelineConexao } from "@/components/pacote-motor/TimelineConexao";
import { brl, hora, resumoVoo, type HotelPacote, type ServicoPacote } from "@/lib/pacote-motor/mapear";
import { listarServicosCompreFacil } from "@/lib/comprefacil/comprefacil.functions";
import { buscarAereoCF, buscarHospedagemCF } from "@/lib/comprefacil/dinamico.functions";
import type { PassHubOferta } from "@/lib/passhub/types";

type Vista = "overview" | "voo" | "hotel";

/** Motor de Pacotes VIA AIR — pacote recomendado + troca de aéreo e hospedagem. */
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
        data: {
          cidadeId: cidadeId!,
          checkin: ida,
          checkout: volta || ida,
          adultos,
          criancas,
        },
      }),
  });

  const voos = useMutation({
    mutationFn: (v: void) =>
      buscarVoos({
        data: {
          origem: origemIata,
          destino: destinoIata,
          ida,
          volta: volta || null,
          adultos,
          criancas,
        },
      }),
  });

  const hoteis: HotelPacote[] = ((pacotes.data as any)?.hoteis ?? []) as HotelPacote[];

  const ofertas: PassHubOferta[] = ((voos.data as any)?.ofertas ?? []) as PassHubOferta[];
  const erroVoos = (voos.data as any)?.ok === false ? (voos.data as any).erro : null;

  // pacote recomendado = melhor preço de cada motor
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

  const info = useMemo(
    () => ({
      inclui: hotel?.regime ? [hotel.regime] : [],
      servicos: (((detalhe.data as any)?.itens ?? []) as any[]).map((s) => ({
        id: String(s.id),
        titulo: s.titulo ?? "Serviço",
        tipo: s.tipo ?? null,
        descricao: textoSimples(s.descricao) || s.fornecedor || null,
        valor: null,
      })) as ServicoPacote[],
    }),
    [detalhe.data, hotel],
  );

  const hotelCompleto: HotelPacote | null = hotel;

  const hoteisCompletos = hoteis;

  const servicos: ServicoPacote[] = info?.servicos ?? [];
  const quarto = hotelCompleto?.quartos.find((q) => q.id === quartoId) ?? null;
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


  const resumo = (
    <ResumoPacote
      destino={hotel?.localizacao || destino || "Pacote VIA AIR"}
      periodo={[ida, volta].filter(Boolean).map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(" a ")}
      pax={`${adultos} adulto(s)${criancas ? ` · ${criancas} criança(s)` : ""}`}
      noites={noites}
      linhas={[
        { rotulo: "Aéreo", valor: voo ? brl(voo.precoTotal) : "Não selecionado" },
        { rotulo: "Hospedagem", valor: hotel ? brl(hotel.total, hotel.moeda) : "Não selecionada" },
        { rotulo: "Acomodação", valor: quarto?.nome ?? "Conforme pacote" },
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
    <div className="motor-navy rounded-3xl p-4 md:p-6">
      {/* Barra de busca */}
      <div className="mb-5 grid gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-lg lg:grid-cols-[1.2fr_1.2fr_.8fr_.8fr_.9fr_auto]">
        <Campo icone={<Plane className="h-3.5 w-3.5" />} label="Origem">
          <CidadeAutocompleteCF
            valor={origem}
            campo="saida"
            placeholder="Cidade de saída"
            onChange={(nome, _id, iata) => {
              setOrigem(nome);
              setOrigemIata(iata ?? "");
            }}
          />
        </Campo>
        <Campo icone={<Hotel className="h-3.5 w-3.5" />} label="Destino">
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
        </Campo>
        <Campo icone={<CalendarDays className="h-3.5 w-3.5" />} label="Ida">
          <Input type="date" value={ida} onChange={(e) => setIda(e.target.value)} />
        </Campo>
        <Campo icone={<CalendarDays className="h-3.5 w-3.5" />} label="Volta">
          <Input type="date" value={volta} onChange={(e) => setVolta(e.target.value)} />
        </Campo>
        <Campo icone={<Users className="h-3.5 w-3.5" />} label="Passageiros">
          <div className="flex gap-2">
            <Input type="number" min={1} max={9} value={adultos} onChange={(e) => setAdultos(Number(e.target.value) || 1)} />
            <Input type="number" min={0} max={8} value={criancas} onChange={(e) => setCriancas(Number(e.target.value) || 0)} />
          </div>
        </Campo>
        <div className="flex items-end">
          <Button className="h-10 w-full rounded-xl" onClick={pesquisar} disabled={pacotes.isPending || voos.isPending}>
            {pacotes.isPending || voos.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2">Buscar</span>
          </Button>
        </div>
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
          onVoltar={() => setVista("overview")}
          resumo={resumo}
        />
      )}

      {vista === "hotel" && (
        <SeletorHospedagem
          hoteis={hoteisCompletos}
          carregando={pacotes.isPending}
          hotelSelecionadoId={hotel?.id ?? null}
          quartoSelecionadoId={quartoId}
          baseTotal={baseHotel}
          onSelecionar={(h, q) => {
            setHotel(h);
            setQuartoId(q);
            setVista("overview");
          }}
          onVoltar={() => setVista("overview")}
          resumo={resumo}
        />
      )}

      {vista === "overview" && (
        <div className={buscou ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]" : "grid gap-4"}>
          <div className="space-y-3">
            {!buscou && (
              <p className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
                Informe origem, destino e datas para montar o pacote recomendado.
              </p>
            )}

            {buscou && (
              <>
                <header className="rounded-2xl bg-white/5 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-orange">Pacote recomendado</p>
                  <h2 className="text-xl font-semibold text-white">{hotel?.nome ?? destino}</h2>
                  <p className="text-xs text-white/70">
                    {[hotel?.localizacao, noites, `${pagantes} passageiro(s)`].filter(Boolean).join(" · ")}
                  </p>
                </header>

                {/* Voo atualmente selecionado */}
                <section className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Voo selecionado</h3>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" onClick={() => setVista("voo")}>
                      Alterar voo
                    </Button>
                  </div>
                  {voos.isPending && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando o motor aéreo…
                    </p>
                  )}
                  {!voos.isPending && !voo && (
                    <p className="text-xs text-muted-foreground">{erroVoos ?? "Nenhum voo selecionado para este trecho."}</p>
                  )}
                  {voo && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <b className="text-sm">{resumoVoo(voo.ida).companhia}</b>
                          <p className="text-[11px] text-muted-foreground">
                            {resumoVoo(voo.ida).rota} · {resumoVoo(voo.ida).horarios} · {resumoVoo(voo.ida).escalas} ·{" "}
                            {resumoVoo(voo.ida).bagagem}
                          </p>
                          {voo.voltas.map((v) => (
                            <p key={v.numeroVoo + v.partida} className="text-[11px] text-muted-foreground">
                              {v.origem} → {v.destino} · {hora(v.partida)} → {hora(v.chegada)} ·{" "}
                              {v.paradas === 0 ? "Direto" : `${v.paradas} conexão`}
                            </p>
                          ))}
                        </div>
                        <b className="text-sm text-brand-blue">{brl(voo.precoTotal)}</b>
                      </div>
                      {voo.ida.paradas > 0 && <TimelineConexao titulo="Detalhes da conexão · ida" voo={voo.ida} />}
                    </div>
                  )}
                </section>

                {/* Hospedagem atualmente selecionada */}
                <section className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Hospedagem selecionada</h3>
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" onClick={() => setVista("hotel")}>
                      Alterar hospedagem
                    </Button>
                  </div>
                  {pacotes.isPending && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando pacotes na operadora…
                    </p>
                  )}
                  {!pacotes.isPending && !hotel && (
                    <p className="text-xs text-muted-foreground">Nenhum pacote encontrado para este destino e período.</p>
                  )}
                  {hotelCompleto && (
                    <div className="grid gap-3 sm:grid-cols-[150px_1fr_auto]">
                      <div className="h-[100px] overflow-hidden rounded-xl bg-muted">
                        {hotelCompleto.fotos[0] ? (
                          <img
                            src={hotelCompleto.fotos[0]}
                            alt={`Foto do hotel ${hotelCompleto.nome}`}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-muted-foreground">
                            <Hotel className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <b className="text-sm">{hotelCompleto.nome}</b>
                        <p className="text-[11px] text-muted-foreground">{hotelCompleto.localizacao ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{quarto?.nome ?? "Acomodação conforme o pacote"}</p>
                        {info?.inclui?.length ? (
                          <ul className="mt-1.5 flex flex-wrap gap-1">
                            {info.inclui.slice(0, 6).map((i) => (
                              <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                {i.length > 48 ? `${i.slice(0, 48)}…` : i}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <b className="text-sm text-brand-blue">{brl(hotelCompleto.total, hotelCompleto.moeda)}</b>
                    </div>
                  )}
                </section>

                {/* Serviços */}
                <section className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Serviços</h3>
                    <span className="text-[10px] text-muted-foreground">
                      Não entram no pacote até serem adicionados
                    </span>
                  </div>
                  {detalhe.isPending ? (
                    <p className="text-xs text-muted-foreground">Buscando serviços do destino…</p>
                  ) : servicos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem serviços adicionais para este destino.</p>
                  ) : (
                    <div className="grid gap-2">
                      {servicos.map((s) => {
                        const marcado = servicosSel.includes(s.id);
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${marcado ? "border-brand-blue bg-brand-blue/5" : "border-border/60"}`}
                          >
                            <span>
                              <b className="text-xs">{s.titulo}</b>
                              {s.descricao ? (
                                <span className="block text-[10px] text-muted-foreground">
                                  {s.descricao.length > 120 ? `${s.descricao.slice(0, 120)}…` : s.descricao}
                                </span>
                              ) : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold">
                              {s.valor ? brl(s.valor) : "Sob consulta"}
                              <Button
                                type="button"
                                size="sm"
                                variant={marcado ? "secondary" : "outline"}
                                className="h-7 text-[11px]"
                                onClick={() =>
                                  setServicosSel((v) => (marcado ? v.filter((x) => x !== s.id) : [...v, s.id]))
                                }
                              >
                                {marcado ? "Remover" : "Adicionar"}
                              </Button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

              </>
            )}
          </div>

          {buscou ? resumo : null}
        </div>
      )}
    </div>
  );
}

function Campo({ icone, label, children }: { icone: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icone}
        {label}
      </Label>
      {children}
    </div>
  );
}
