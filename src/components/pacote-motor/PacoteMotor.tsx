import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, BedDouble, CalendarDays, Loader2, MapPin, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateRangeField } from "@/components/search/DateRangeField";
import { RoomsPaxField } from "@/components/search/RoomsPaxField";
import { toast } from "sonner";
import { QuoteBasketBar } from "@/components/quote/QuoteBasketBar";
import { addToQuoteBasket } from "@/lib/quote-basket";
import { passhubToQuoteFlight } from "@/lib/passhub/quote";
import { CidadeAutocompleteCF } from "@/components/comprefacil/CidadeAutocompleteCF";
import { CardHotelSelecionado } from "@/components/pacote-motor/CardHotelSelecionado";
import { CardVooSelecionado } from "@/components/pacote-motor/CardVooSelecionado";
import { ResumoPacote } from "@/components/pacote-motor/ResumoPacote";
import { EsqueletoPacote } from "@/components/pacote-motor/EsqueletoPacote";
import { SeletorVoo } from "@/components/pacote-motor/SeletorVoo";
import { SeletorHospedagem } from "@/components/pacote-motor/SeletorHospedagem";
import { SeletorServicos } from "@/components/pacote-motor/SeletorServicos";
import {
  ocupacaoPadrao,
  plural,
  somaOcupacao,
  type HotelPacote,
  type OcupacaoQuarto,
} from "@/lib/pacote-motor/mapear";
import { buscarAereoCF, buscarHospedagemCF } from "@/lib/comprefacil/dinamico.functions";
import { buscarServicosCF, buscarServicosCFPublic } from "@/lib/comprefacil/servicos.functions";
import { buscarAereoCFPublic, buscarHospedagemCFPublic } from "@/lib/comprefacil/publico.functions";
import { criarPacoteMotorCheckout } from "@/lib/pacote-motor/checkout.functions";
import type { ServicoDisponivel } from "@/lib/comprefacil/servicos.server";
import type { PassHubOferta } from "@/lib/passhub/types";
import { encodeQuartos, type PacotePreset } from "@/lib/pacote-motor/preset";
import { ResumoDock } from "./ResumoDock";
import { ReservaFrtDialog } from "./ReservaFrtDialog";

type Vista = "overview" | "voo" | "hotel" | "servico" | "revisar";

/**
 * Motor de Pacotes VIA AIR — padrão visual aprovado.
 * Busca com distribuição real por quarto e opções vindas da operadora.
 */
export function PacoteMotor({
  embed = false,
  publico = embed,
  preset,
}: { embed?: boolean; publico?: boolean; preset?: PacotePreset } = {}) {
  const buscarHoteis = useServerFn(publico ? buscarHospedagemCFPublic : buscarHospedagemCF);
  const buscarVoos = useServerFn(publico ? buscarAereoCFPublic : buscarAereoCF);
  const criarCheckout = useServerFn(criarPacoteMotorCheckout);
  const buscarServicos = useServerFn(publico ? buscarServicosCFPublic : buscarServicosCF);



  const [origem, setOrigem] = useState(preset?.origem ?? "");
  const [destino, setDestino] = useState(preset?.destino ?? "");
  const [cidadeId, setCidadeId] = useState<number | null>(preset?.cidadeId ?? null);
  const [origemIata, setOrigemIata] = useState(preset?.origemIata ?? "");
  const [destinoIata, setDestinoIata] = useState(preset?.destinoIata ?? "");
  const [ida, setIda] = useState(preset?.ida ?? "");
  const [volta, setVolta] = useState(preset?.volta ?? "");
  const [quartos, setQuartos] = useState<OcupacaoQuarto[]>(
    preset?.quartos?.length ? preset.quartos : [ocupacaoPadrao()],
  );

  const [vista, setVista] = useState<Vista>("overview");
  const [hotel, setHotel] = useState<HotelPacote | null>(null);
  const [quartoId, setQuartoId] = useState<string | null>(null);
  const [voo, setVoo] = useState<PassHubOferta | null>(null);
  const [servicosSel, setServicosSel] = useState<ServicoDisponivel[]>([]);
  const [reservaAberta, setReservaAberta] = useState(false);

  const pax = somaOcupacao(quartos);

  const pacotes = useMutation({
    mutationFn: (_v: void) =>
      buscarHoteis({
        data: {
          cidadeId: cidadeId!,
          checkin: ida,
          checkout: volta || ida,
          adultos: pax.adultos,
          criancas: pax.criancas,
          quartos,
        },
      }),
  });

  const voos = useMutation({
    mutationFn: (_v: void) =>
      buscarVoos({
        data: {
          origem: origemIata,
          destino: destinoIata,
          ida,
          volta: volta || null,
          adultos: pax.adultos,
          criancas: pax.criancas,
        },
      }),
  });

  /** Serviços do destino pesquisado (transfers, passeios, proteção). */
  const servicos = useMutation({
    mutationFn: (_v: void) =>
      buscarServicos({
        data: {
          cidadeId: cidadeId!,
          data: ida,
          dataFim: volta || ida,
          adultos: pax.adultos,
          idades: quartos.flatMap((q) => q.idades),
          destino: destino || null,
          destinoIata: destinoIata ? destinoIata.toUpperCase() : null,

        },
      }),
  });

  const hoteis: HotelPacote[] = ((pacotes.data as any)?.hoteis ?? []) as HotelPacote[];
  const ofertas: PassHubOferta[] = ((voos.data as any)?.ofertas ?? []) as PassHubOferta[];
  const listaServicos: ServicoDisponivel[] = ((servicos.data as any)?.servicos ?? []) as ServicoDisponivel[];
  const erroVoos = (voos.data as any)?.ok === false ? (voos.data as any).erro : null;
  const erroHoteis = (pacotes.data as any)?.ok === false ? (pacotes.data as any).erro : null;
  const erroServicos = (servicos.data as any)?.ok === false ? (servicos.data as any).erro : null;

  useEffect(() => {
    if (hoteis.length && !hotel) {
      // O pacote recomendado deve partir do primeiro hotel recomendado,
      // não do mais barato, quando a operadora sinaliza recomendação.
      const recomendado = hoteis.find((h) => h.recomendado) ?? hoteis[0];
      setHotel(recomendado);
      setQuartoId(recomendado?.quartos[0]?.id ?? null);
    }
  }, [hoteis, hotel]);
  useEffect(() => {
    if (ofertas.length && !voo) setVoo(ofertas[0]);
  }, [ofertas, voo]);

  const quarto = hotel?.quartos.find((q) => q.id === quartoId) ?? hotel?.quartos[0] ?? null;
  const totalServicos = servicosSel.reduce((s, x) => s + (x.valor ?? 0), 0);
  const total =
    (hotel?.total ?? 0) + (quarto?.diferenca ?? 0) + (voo?.precoTotal ?? 0) + totalServicos;

  // Base do pacote recomendado: usado no resumo para mostrar a diferença
  // entre a montagem atual e a sugestão inicial da operadora.
  const baseVooRecomendado = ofertas[0]?.precoTotal ?? 0;
  const baseHotelRecomendado = (hoteis.find((h) => h.recomendado) ?? hoteis[0])?.total ?? 0;
  const baseTotalRecomendado = baseVooRecomendado + baseHotelRecomendado;

  // Base para os seletores: diferença em relação ao item atualmente selecionado,
  // para que o cliente veja o impacto financeiro ao trocar de voo ou hotel.
  const baseVoo = voo?.precoTotal ?? baseVooRecomendado;
  const baseHotel = (hotel?.total ?? 0) + (quarto?.diferenca ?? 0) || baseHotelRecomendado;

  const carregando = pacotes.isPending || voos.isPending;
  // Mostra a área de resultados (com esqueleto piscando) já durante a busca,
  // para o cliente não ficar olhando uma tela em branco.
  const buscou = pacotes.isSuccess || voos.isSuccess || carregando;

  // A operadora pode manter uma conexão aberta mesmo depois de parar de
  // processar. A tela não deve permanecer eternamente no esqueleto nesse caso.
  useEffect(() => {
    if (!carregando) return;
    const limite = window.setTimeout(() => {
      if (pacotes.isPending) pacotes.reset();
      if (voos.isPending) voos.reset();
      toast.error("A busca demorou mais que o esperado. Tente novamente.");
    }, 75_000);
    return () => window.clearTimeout(limite);
  }, [carregando, pacotes.isPending, voos.isPending]);

  const noites = useMemo(() => {
    if (!ida || !volta) return null;
    const d = Math.round((new Date(volta).getTime() - new Date(ida).getTime()) / 86400000);
    return d > 0 ? d : null;
  }, [ida, volta]);

  function alterarQuarto(i: number, chave: "adultos" | "criancas" | "bebes", valor: number) {
    setQuartos((atual) =>
      atual.map((q, idx) => {
        if (idx !== i) return q;
        const min = chave === "adultos" ? 1 : 0;
        const v = Math.max(min, Number.isFinite(valor) ? valor : min);
        const proximo = { ...q, [chave]: v } as OcupacaoQuarto;
        if (chave === "criancas") {
          const idades = [...proximo.idades].slice(0, v);
          while (idades.length < v) idades.push(7);
          proximo.idades = idades;
        }
        return proximo;
      }),
    );
  }

  function alterarQtdQuartos(qtd: number) {
    const alvo = Math.max(1, Math.min(4, qtd || 1));
    setQuartos((atual) => {
      const lista = [...atual];
      while (lista.length < alvo) lista.push({ adultos: 1, criancas: 0, bebes: 0, idades: [] });
      while (lista.length > alvo) lista.pop();
      return lista;
    });
  }

  /** Preset vindo da URL (/voar?m=combo&...): já dispara a busca ao abrir. */
  useEffect(() => {
    if (!preset) return;
    if (preset.cidadeId && preset.ida) {
      pacotes.mutate();
      servicos.mutate();
    }
    if (preset.origemIata && preset.destinoIata && preset.ida) voos.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** No widget (WordPress) a busca de pacote abre o site VIA AIR fora do iframe. */
  function abrirNoSite() {
    const p = new URLSearchParams();
    p.set("m", "combo");
    if (origemIata) p.set("o", origemIata);
    if (destinoIata) p.set("d", destinoIata);
    if (origem) p.set("pon", origem);
    if (destino) p.set("pdn", destino);
    if (cidadeId) p.set("cid", String(cidadeId));
    if (ida) p.set("ida", ida);
    if (volta) p.set("volta", volta);
    p.set("q", encodeQuartos(quartos));
    const url = `https://pedidos.viaair.tur.br/voar?${p.toString()}`;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(url, "_top");
    }
  }

  function pesquisar() {
    if (embed) {
      abrirNoSite();
      return;
    }
    setHotel(null);
    setVoo(null);
    setQuartoId(null);
    setServicosSel([]);
    setVista("overview");
    if (cidadeId && ida) {
      pacotes.mutate();
      servicos.mutate();
    }
    if (origemIata && destinoIata && ida) voos.mutate();
  }

  const totalComVoo = (o: PassHubOferta) =>
    (hotel?.total ?? 0) + (quarto?.diferenca ?? 0) + o.precoTotal + totalServicos;
  const totalComHotel = (h: HotelPacote, qId: string | null) => {
    const q = h.quartos.find((x) => x.id === qId) ?? h.quartos[0] ?? null;
    return h.total + (q?.diferenca ?? 0) + (voo?.precoTotal ?? 0) + totalServicos;
  };

  function alternarServico(s: ServicoDisponivel) {
    setServicosSel((atual) =>
      atual.some((x) => x.id === s.id) ? atual.filter((x) => x.id !== s.id) : [...atual, s],
    );
  }


  /** Gera o link de pagamento (mesmo checkout dos pacotes prontos). */
  const checkout = useMutation({
    mutationFn: async () => {
      if (!hotel && !voo) throw new Error("Monte o pacote antes de reservar.");
      return criarCheckout({
        data: {
          destino: destino || hotel?.localizacao || "Pacote VIA AIR",
          origem: origem || null,
          ida,
          volta: volta || null,
          noites: noites ?? null,
          adultos: pax.adultos,
          criancas: pax.criancas,
          bebes: pax.bebes,
          quartos: quartos.length,
          total,
          hotelNome: hotel?.nome ?? null,
          hotelEstrelas: hotel?.categoria ?? null,
          regime: quarto?.regime ?? hotel?.regime ?? null,
          quartoNome: quarto?.nome ?? null,
          foto: hotel?.fotos?.[0] ?? null,
          incluidos: hotel?.beneficios?.slice(0, 10) ?? [],
          vooIda: voo?.ida ?? null,
          vooVolta: voo?.voltas?.[0] ?? null,
        },
      });
    },
    onSuccess: (r: { url: string }) => {
      if (typeof window === "undefined") return;
      if (embed) window.open(r.url, "_top");
      else window.location.href = r.url;
    },
  });

  /** Guarda a montagem atual na cesta para virar uma opção do orçamento. */
  function salvarNaCesta() {
    if (!hotel && !voo) return;
    const idaVoo = voo?.ida ?? null;
    const voltaVoo = voo?.voltas?.[0] ?? null;
    addToQuoteBasket({
      label: `${destino || hotel?.nome || "Pacote"}${hotel?.nome ? ` • ${hotel.nome}` : ""}${
        idaVoo ? ` • ${idaVoo.companhia}` : ""
      }`,
      total,
      adults: pax.adultos,
      children: pax.criancas,
      origin: origemIata || origem || null,
      destination: destinoIata || destino || null,
      startDate: ida || null,
      endDate: volta || null,
      services: [
        ...(hotel
          ? [
              `Hospedagem: ${hotel.nome}${quarto?.nome ? ` — ${quarto.nome}` : ""}${
                quarto?.regime || hotel.regime ? ` (${quarto?.regime ?? hotel.regime})` : ""
              }`,
              noites ? `${noites} ${plural(noites, "noite", "noites")}` : "",
            ].filter(Boolean)
          : []),
        ...(idaVoo ? [`Aéreo ida: ${idaVoo.origem} → ${idaVoo.destino} • ${idaVoo.companhia}`] : []),
        ...(voltaVoo ? [`Aéreo volta: ${voltaVoo.origem} → ${voltaVoo.destino} • ${voltaVoo.companhia}`] : []),
        ...servicosSel.map((s) => `${s.categoria}: ${s.titulo}`),
      ],
      flights: [
        ...(idaVoo ? [passhubToQuoteFlight(idaVoo, voltaVoo ? "OUTBOUND" : null, total)] : []),
        ...(voltaVoo ? [passhubToQuoteFlight(voltaVoo, "INBOUND", null)] : []),
      ],
      notes: `${pax.adultos} adulto(s)${pax.criancas ? ` • ${pax.criancas} criança(s)` : ""}${
        pax.bebes ? ` • ${pax.bebes} bebê(s)` : ""
      } • ${quartos.length} ${plural(quartos.length, "quarto", "quartos")}`,
    });
    toast.success("Pacote salvo na cesta de orçamento");
  }

  const resumo = (

    <ResumoPacote
      destino={destino}
      quartos={quartos}
      noites={noites}
      checkin={ida}
      checkout={volta || ida}
      oferta={voo}
      hotel={hotel}
      quarto={quarto}
      total={total}
      diferenca={Number((total - baseTotalRecomendado).toFixed(2))}
      moeda={hotel?.moeda ?? "BRL"}
      servicos={servicosSel.map((s) => ({ id: s.id, titulo: s.titulo, valor: s.valor }))}
      onServicos={() => setVista("servico")}
      acao={
        <div style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            className="primary"
            disabled={checkout.isPending || (!hotel && !voo)}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending ? "Gerando link de pagamento…" : "Reservar pacote"}
          </button>
          {/* Cesta: junta várias montagens e vira UM orçamento com várias opções. */}
          {!publico && (
            <button type="button" className="ghost" disabled={!hotel && !voo} onClick={salvarNaCesta}>
              Gerar orçamento
            </button>
          )}
          {/* Reserva real na operadora (uso interno): cria o orçamento na FRT e gera o localizador. */}
          {!publico && (
            <button type="button" className="ghost" disabled={!hotel && !voo} onClick={() => setReservaAberta(true)}>
              Reservar na operadora
            </button>
          )}
        </div>
      }

    />
  );


  return (
    <div className="mkt inset">
      {!publico && (
        <ReservaFrtDialog
          aberto={reservaAberta}
          onFechar={() => setReservaAberta(false)}
          voo={voo}
          hotel={hotel}
          quartoId={quartoId}
          quartos={quartos}
        />
      )}
      <div className="shell">
        {/* Mesma linguagem visual das abas Aéreo/Hotel: card do design system,
            labels com ícone, calendário e seletor de hóspedes padrão. */}
        {/* Exatamente o mesmo painel da aba Aéreo: mesmas classes, mesmos campos. */}
        <section className="rounded-[32px] border border-border/50 bg-card/60 p-6 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]">
            <div className="relative grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Origem
                </Label>
                <CidadeAutocompleteCF
                  publico={publico}
                  valor={origem}
                  campo="saida"
                  placeholder="De onde sairemos?"
                  className="h-12 rounded-xl border-border bg-muted/40 text-sm font-semibold sm:text-base"
                  onChange={(nome, _id, iata) => {
                    setOrigem(nome);
                    setOrigemIata(iata ?? "");
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Inverter origem e destino"
                title="Inverter origem e destino"
                onClick={() => {
                  const o = origem;
                  const oi = origemIata;
                  setOrigem(destino);
                  setOrigemIata(destinoIata);
                  setDestino(o);
                  setDestinoIata(oi);
                  setCidadeId(null);
                }}
                className="absolute left-1/2 top-[calc(50%+0.55rem)] z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-lg transition hover:text-primary active:scale-95"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <ArrowLeftRight className="h-3 w-3" /> Destino
                </Label>
                <CidadeAutocompleteCF
                  publico={publico}
                  valor={destino}
                  campo="destino"
                  placeholder="Para onde vamos?"
                  className="h-12 rounded-xl border-border bg-muted/40 text-sm font-semibold sm:text-base"
                  onChange={(nome, id, iata) => {
                    setDestino(nome);
                    setCidadeId(id);
                    setDestinoIata(iata ?? "");
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-3 w-3" /> Ida e volta
              </Label>
              <DateRangeField
                departureDate={ida}
                returnDate={volta}
                allowOneWay={false}
                labels={{ start: "Ida", end: "Volta" }}
                onChange={(d, v) => {
                  setIda(d);
                  setVolta(v);
                }}
              />
            </div>

            <div className="flex items-end">
              <Button
                size="lg"
                className="h-12 w-full lg:w-auto"
                onClick={pesquisar}
                disabled={carregando}
              >
                {carregando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Buscar
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 md:grid-cols-[1.4fr_auto] md:items-end">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {plural(pax.hospedes, "passageiro", "passageiros")} ·{" "}
              {plural(quartos.length, "quarto", "quartos")}
            </div>
            <div className="w-full space-y-1 md:w-72">
              <Label className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <BedDouble className="h-3 w-3" /> Quartos e hóspedes
              </Label>
              <RoomsPaxField
                quartos={quartos}
                onChange={(novos) =>
                  // Preserva as idades já informadas para cada quarto ao redistribuir.
                  setQuartos(
                    novos.map((q, i) => ({
                      ...q,
                      idades: (quartos[i]?.idades ?? []).slice(0, q.criancas),
                    })),
                  )
                }
              />
            </div>
          </div>
        </section>


        {/* Abas e resultados só entram em cena depois da pesquisa. */}
        {buscou && (
        <div className="tabs">
          <button type="button" className={`tab${vista === "overview" ? " active" : ""}`} onClick={() => setVista("overview")}>
            Visão geral
          </button>
          <button type="button" className={`tab${vista === "voo" ? " active" : ""}`} onClick={() => setVista("voo")}>
            Alterar voo
          </button>
          <button type="button" className={`tab${vista === "hotel" ? " active" : ""}`} onClick={() => setVista("hotel")}>
            Alterar hospedagem
          </button>
          <button type="button" className={`tab${vista === "servico" ? " active" : ""}`} onClick={() => setVista("servico")}>
            Adicionar serviços
          </button>
          <button type="button" className={`tab${vista === "revisar" ? " active" : ""}`} onClick={() => setVista("revisar")}>
            Revise e compre
          </button>
        </div>

        )}

        {buscou && vista === "overview" && (
          <section className="screen active" id="overview">
            <div className="title">
              <div>
                <h2>Pacote recomendado</h2>
                <p>Combinação recomendada com aéreo ida e volta + hospedagem.</p>
              </div>
              <span className="pill">
                {plural(pax.adultos, "adulto", "adultos")}
                {noites ? ` · ${plural(noites, "noite", "noites")}` : ""}
              </span>
            </div>

            {carregando ? <EsqueletoPacote /> : (
            <div className="overview">
                <div className="overview-main">
                  <div className="overview-grid">
                    <CardVooSelecionado
                      oferta={voo}
                      carregando={voos.isPending}
                      aviso={erroVoos}
                      onAlterar={() => setVista("voo")}
                    />
                    <CardHotelSelecionado
                      hotel={hotel}
                      quarto={quarto}
                      qtdQuartos={quartos.length}
                      checkin={ida}
                      checkout={volta || ida}
                      noites={noites}
                      carregando={pacotes.isPending}
                      onAlterar={() => setVista("hotel")}
                    />
                  </div>

                  {/* Bloco resumido de serviços adicionais (catálogo fica na aba própria). */}
                  <div className={`svcbox${servicosSel.length ? " on" : ""}`}>
                    <div className="svcbox-head">
                      <b>Serviços adicionais</b>
                      <span className={servicosSel.length ? "svcbox-on" : "svcbox-off"}>
                        {servicosSel.length
                          ? plural(servicosSel.length, "serviço incluído", "serviços incluídos")
                          : "Não incluso"}
                      </span>
                    </div>
                    <p>
                      {servicosSel.length
                        ? servicosSel.slice(0, 3).map((s) => s.titulo).join(" · ") +
                          (servicosSel.length > 3 ? ` +${servicosSel.length - 3}` : "")
                        : "Transfers, passeios e proteção são opcionais e podem ser incluídos no seu pacote."}
                    </p>
                    <button type="button" className="ghost" onClick={() => setVista("servico")}>
                      {servicosSel.length ? "Alterar serviços" : "Ver mais serviços"}
                    </button>
                  </div>
                </div>
              {resumo}
            </div>
            )}
          </section>
        )}


        {buscou && vista === "voo" && (
          <SeletorVoo
            ofertas={ofertas}
            carregando={voos.isPending}
            erro={erroVoos}
            selecionadaId={voo?.id ?? null}
            baseTotal={baseVoo}
            totalPacote={totalComVoo}
            onSelecionar={(o) => {
              setVoo(o);
              setVista("overview");
            }}
            resumo={<ResumoDock>{resumo}</ResumoDock>}
          />
        )}

        {buscou && vista === "hotel" && (
          <SeletorHospedagem
            hoteis={hoteis}
            carregando={pacotes.isPending}
            erro={erroHoteis}
            hotelSelecionadoId={hotel?.id ?? null}
            quartoSelecionadoId={quarto?.id ?? null}
            baseTotal={baseHotel}
            qtdQuartos={quartos.length}
            totalPacote={totalComHotel}
            onSelecionar={(h, q) => {
              setHotel(h);
              setQuartoId(q);
              setVista("overview");
            }}
            resumo={<ResumoDock>{resumo}</ResumoDock>}
          />
        )}

        {buscou && vista === "servico" && (
          <SeletorServicos
            servicos={listaServicos}
            carregando={servicos.isPending}
            erro={erroServicos}
            selecionados={servicosSel.map((s) => s.id)}
            onAlternar={alternarServico}
            resumo={<ResumoDock>{resumo}</ResumoDock>}
          />
        )}

        {buscou && vista === "revisar" && (
          <section className="screen active" id="revisar">
            <div className="title">
              <div>
                <h2>Revise e compre</h2>
                <p>Confira tudo o que está incluído e finalize a sua reserva.</p>
              </div>
            </div>
            <div className="mx-auto w-full max-w-2xl">{resumo}</div>
          </section>
        )}
      </div>
      {!publico && <QuoteBasketBar />}
    </div>
  );
}
