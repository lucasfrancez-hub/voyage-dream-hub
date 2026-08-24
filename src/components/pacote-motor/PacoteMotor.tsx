import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { CidadeAutocompleteCF } from "@/components/comprefacil/CidadeAutocompleteCF";
import { CardHotelSelecionado } from "@/components/pacote-motor/CardHotelSelecionado";
import { CardVooSelecionado } from "@/components/pacote-motor/CardVooSelecionado";
import { ResumoPacote } from "@/components/pacote-motor/ResumoPacote";
import { SeletorVoo } from "@/components/pacote-motor/SeletorVoo";
import { SeletorHospedagem } from "@/components/pacote-motor/SeletorHospedagem";
import {
  ocupacaoPadrao,
  plural,
  somaOcupacao,
  type HotelPacote,
  type OcupacaoQuarto,
} from "@/lib/pacote-motor/mapear";
import { buscarAereoCF, buscarHospedagemCF } from "@/lib/comprefacil/dinamico.functions";
import type { PassHubOferta } from "@/lib/passhub/types";

type Vista = "overview" | "voo" | "hotel";

/**
 * Motor de Pacotes VIA AIR — padrão visual aprovado.
 * Busca com distribuição real por quarto e opções vindas da operadora.
 */
export function PacoteMotor() {
  const buscarHoteis = useServerFn(buscarHospedagemCF);
  const buscarVoos = useServerFn(buscarAereoCF);

  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [cidadeId, setCidadeId] = useState<number | null>(null);
  const [origemIata, setOrigemIata] = useState("");
  const [destinoIata, setDestinoIata] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [quartos, setQuartos] = useState<OcupacaoQuarto[]>([ocupacaoPadrao()]);

  const [vista, setVista] = useState<Vista>("overview");
  const [hotel, setHotel] = useState<HotelPacote | null>(null);
  const [quartoId, setQuartoId] = useState<string | null>(null);
  const [voo, setVoo] = useState<PassHubOferta | null>(null);

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

  const hoteis: HotelPacote[] = ((pacotes.data as any)?.hoteis ?? []) as HotelPacote[];
  const ofertas: PassHubOferta[] = ((voos.data as any)?.ofertas ?? []) as PassHubOferta[];
  const erroVoos = (voos.data as any)?.ok === false ? (voos.data as any).erro : null;
  const erroHoteis = (pacotes.data as any)?.ok === false ? (pacotes.data as any).erro : null;

  useEffect(() => {
    if (hoteis.length && !hotel) {
      setHotel(hoteis[0]);
      setQuartoId(hoteis[0].quartos[0]?.id ?? null);
    }
  }, [hoteis, hotel]);
  useEffect(() => {
    if (ofertas.length && !voo) setVoo(ofertas[0]);
  }, [ofertas, voo]);

  const quarto = hotel?.quartos.find((q) => q.id === quartoId) ?? hotel?.quartos[0] ?? null;
  const total = (hotel?.total ?? 0) + (quarto?.diferenca ?? 0) + (voo?.precoTotal ?? 0);

  const baseVoo = ofertas[0]?.precoTotal ?? voo?.precoTotal ?? 0;
  const baseHotel = hoteis[0]?.total ?? hotel?.total ?? 0;
  const baseTotal = baseVoo + baseHotel;

  const buscou = pacotes.isSuccess || voos.isSuccess;
  const carregando = pacotes.isPending || voos.isPending;

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

  function pesquisar() {
    setHotel(null);
    setVoo(null);
    setQuartoId(null);
    setVista("overview");
    if (cidadeId && ida) pacotes.mutate();
    if (origemIata && destinoIata && ida) voos.mutate();
  }

  const totalComVoo = (o: PassHubOferta) => (hotel?.total ?? 0) + (quarto?.diferenca ?? 0) + o.precoTotal;
  const totalComHotel = (h: HotelPacote, qId: string | null) => {
    const q = h.quartos.find((x) => x.id === qId) ?? h.quartos[0] ?? null;
    return h.total + (q?.diferenca ?? 0) + (voo?.precoTotal ?? 0);
  };

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
      diferenca={Number((total - baseTotal).toFixed(2))}
      moeda={hotel?.moeda ?? "BRL"}
      acao={
        <button
          type="button"
          className="primary"
          disabled={checkout.isPending || (!hotel && !voo)}
          onClick={() => checkout.mutate()}
        >
          {checkout.isPending ? "Gerando link de pagamento…" : "Reservar pacote"}
        </button>
      }
    />
  );


  return (
    <div className="mkt">
      <div className="shell" style={{ padding: 0 }}>
        <section className="search">
          <div className="search-grid">
            <div>
              <div className="label">Origem</div>
              <div className="field">
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
            </div>
            <div>
              <div className="label">Destino</div>
              <div className="field">
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
            </div>
            <div>
              <div className="label">Ida</div>
              <div className="field">
                <input type="date" value={ida} onChange={(e) => setIda(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="label">Volta</div>
              <div className="field">
                <input type="date" value={volta} onChange={(e) => setVolta(e.target.value)} />
              </div>
            </div>
            <button type="button" className="search-btn" onClick={pesquisar} disabled={carregando}>
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Buscar pacote
            </button>
          </div>

          <div className="occupancy-wrap">
            <div className="occupancy-top">
              <div className="occupancy-left">
                <div className="room-count">
                  <span>Quartos</span>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={quartos.length}
                    onChange={(e) => alterarQtdQuartos(Number(e.target.value))}
                  />
                </div>
                <div className="occupancy-summary">
                  {plural(pax.hospedes, "passageiro", "passageiros")} ·{" "}
                  {plural(quartos.length, "quarto", "quartos")}
                </div>
              </div>
              <button type="button" className="mode">
                <span />
                Pacote de viagens
              </button>
            </div>

            <div className="room-lines">
              {quartos.map((q, i) => (
                <div className="room-line" key={i}>
                  <div className="room-name">
                    <b>Quarto {i + 1}</b>
                    <small>Distribuição dos hóspedes</small>
                  </div>
                  <label className="guest-field">
                    <span>Adultos</span>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={q.adultos}
                      onChange={(e) => alterarQuarto(i, "adultos", Number(e.target.value))}
                    />
                  </label>
                  <label className="guest-field">
                    <span>Crianças</span>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={q.criancas}
                      onChange={(e) => alterarQuarto(i, "criancas", Number(e.target.value))}
                    />
                  </label>
                  <label className="guest-field">
                    <span>Bebês</span>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={q.bebes}
                      onChange={(e) => alterarQuarto(i, "bebes", Number(e.target.value))}
                    />
                  </label>
                  <div className="room-total">
                    {plural(q.adultos + q.criancas + q.bebes, "hóspede", "hóspedes")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

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
        </div>

        {vista === "overview" && (
          <section className="screen active">
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

            {!buscou && !carregando ? (
              <div className="state-box">Informe origem, destino e datas para montar o pacote recomendado.</div>
            ) : (
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
                </div>
                {resumo}
              </div>
            )}
          </section>
        )}

        {vista === "voo" && (
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
            resumo={resumo}
          />
        )}

        {vista === "hotel" && (
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
            resumo={resumo}
          />
        )}
      </div>
    </div>
  );
}
