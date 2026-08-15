import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Loader2,
  MapPin,
  Plane,
  Search,
  Star,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FrtLocalAutocomplete, type FrtLocalSelecionado } from "@/components/frt/FrtLocalAutocomplete";
import {
  opcoesAereasFrt,
  pacoteFrt,
  pesquisarPacotesFrt,
  selecionarAereoFrt,
} from "@/lib/frt/frt.functions";
import type { FrtPacote } from "@/lib/frt/frt-package-parse";
import type { FrtOpcaoAerea } from "@/lib/frt/frt-aereo-parse";

export const Route = createFileRoute("/admin/motor-frt")({
  head: () => ({
    meta: [
      { title: "Motor FRT — Pacotes | VIA AIR" },
      { name: "description", content: "Motor de consulta de pacotes FRT: hospedagem, aéreo e preço normalizados." },
      { property: "og:title", content: "Motor FRT — Pacotes | VIA AIR" },
      { property: "og:description", content: "Pesquise pacotes da FRT com hospedagem, voos e preços organizados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MotorFrtPage,
});

type Hotel = {
  id: string;
  hotel: FrtPacote["hotel"];
  preco: FrtPacote["preco"];
  temAereo: boolean;
};

type Etapa = "pesquisa" | "hospedagem" | "aereo" | "resumo";

function precoTexto(p: FrtPacote["preco"], campo: "porPessoa" | "total"): string {
  const fmt = campo === "porPessoa" ? p.porPessoaFormatado : p.totalFormatado;
  const num = campo === "porPessoa" ? p.porPessoa : p.total;
  if (fmt) return fmt.startsWith("R$") || /^[A-Z]{3}/.test(fmt) ? fmt : `R$ ${fmt}`;
  if (num == null) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: p.moeda || "BRL" });
}

function MotorFrtPage() {
  const [etapa, setEtapa] = useState<Etapa>("pesquisa");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [selOrigem, setSelOrigem] = useState<FrtLocalSelecionado | null>(null);
  const [selDestino, setSelDestino] = useState<FrtLocalSelecionado | null>(null);
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [adultos, setAdultos] = useState(2);
  const [criancas, setCriancas] = useState(0);

  const [searchId, setSearchId] = useState<string | null>(null);
  const [hoteis, setHoteis] = useState<Hotel[]>([]);
  const [diagnostico, setDiagnostico] = useState<Record<string, unknown> | null>(null);
  const [pacote, setPacote] = useState<FrtPacote | null>(null);
  const [pacoteId, setPacoteId] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<FrtOpcaoAerea[]>([]);
  const [aereoAtivo, setAereoAtivo] = useState<string | null>(null);
  const [resumoFrt, setResumoFrt] = useState<{
    precoPorPessoaFormatado: string | null;
    precoTotalFormatado: string | null;
  } | null>(null);

  const pesquisarFn = useServerFn(pesquisarPacotesFrt);
  const pacoteFn = useServerFn(pacoteFrt);
  const opcoesFn = useServerFn(opcoesAereasFrt);
  const selecionarFn = useServerFn(selecionarAereoFrt);

  const pesquisa = useMutation({
    mutationFn: async () =>
      pesquisarFn({
        data: {
          origem: selOrigem?.label ?? origem,
          destino: selDestino?.label ?? destino,
          ida,
          volta: volta || null,
          adultos,
          criancas,
          origemLabel: selOrigem?.label,
          destinoLabel: selDestino?.label,
          origemValue: selOrigem?.value,
          destinoValue: selDestino?.value,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.mensagem ?? "Falha na pesquisa", { description: r.erro });
        return;
      }
      setSearchId(r.searchId);
      setHoteis(r.hoteis);
      setDiagnostico(r.diagnostico as unknown as Record<string, unknown>);
      setEtapa("hospedagem");
      if (!r.hoteis.length) toast.warning("A FRT respondeu, mas nenhum pacote foi reconhecido nesta busca");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao pesquisar na FRT"),
  });

  const abrirAereo = useMutation({
    mutationFn: async (id: string) => {
      const p = await pacoteFn({ data: { searchId: searchId!, pacoteId: id } });
      const o = await opcoesFn({ data: { searchId: searchId!, pacoteId: id } });
      return { p, o, id };
    },
    onSuccess: ({ p, o, id }) => {
      if (!p.ok) {
        toast.error(p.mensagem ?? "Não foi possível carregar o pacote");
        return;
      }
      setPacote(p.pacote as FrtPacote);
      setPacoteId(id);
      setResumoFrt(null);
      if (o.ok) {
        setOpcoes(o.opcoes as FrtOpcaoAerea[]);
        setAereoAtivo(o.selecionado ?? null);
      } else {
        setOpcoes([]);
        setAereoAtivo(null);
        toast.warning(o.mensagem ?? "Opções aéreas indisponíveis", { description: o.erro });
      }
      setEtapa("aereo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const escolherVoo = useMutation({
    mutationFn: async (opcaoId: string) =>
      selecionarFn({ data: { searchId: searchId!, pacoteId: pacoteId!, opcaoId } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.mensagem ?? "Não foi possível selecionar este voo");
        return;
      }
      setAereoAtivo(r.selecionado);
      setResumoFrt({
        precoPorPessoaFormatado: r.resumo.precoPorPessoaFormatado,
        precoTotalFormatado: r.resumo.precoTotalFormatado,
      });
      if (r.pacote) setPacote(r.pacote as FrtPacote);
      setOpcoes((ant) => ant.map((o) => ({ ...o, selecionado: o.id === r.selecionado })));
      toast.success("Voo selecionado — resumo do pacote atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podePesquisar = Boolean(selOrigem && selDestino && ida) && !pesquisa.isPending;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Motor FRT</h1>
        <p className="text-sm text-muted-foreground">
          Pesquisa de pacotes FRT — hospedagem, aéreo e preço normalizados. Consulta somente leitura.
        </p>
      </header>

      <Passos etapa={etapa} />

      {etapa === "pesquisa" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pesquisar pacotes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FrtLocalAutocomplete
              id="motor-origem"
              rotulo="Origem"
              componente="origem"
              termo={origem}
              onTermoChange={setOrigem}
              selecionado={selOrigem}
              onSelecionar={setSelOrigem}
            />
            <FrtLocalAutocomplete
              id="motor-destino"
              rotulo="Destino"
              componente="destino"
              termo={destino}
              onTermoChange={setDestino}
              selecionado={selDestino}
              onSelecionar={setSelDestino}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="motor-ida">Ida</Label>
                <Input id="motor-ida" type="date" value={ida} onChange={(e) => setIda(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="motor-volta">Volta</Label>
                <Input id="motor-volta" type="date" value={volta} onChange={(e) => setVolta(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="motor-adultos">Adultos</Label>
                <Input
                  id="motor-adultos"
                  type="number"
                  min={1}
                  max={9}
                  value={adultos}
                  onChange={(e) => setAdultos(Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="motor-criancas">Crianças</Label>
                <Input
                  id="motor-criancas"
                  type="number"
                  min={0}
                  max={9}
                  value={criancas}
                  onChange={(e) => setCriancas(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <Button className="w-full md:w-auto" disabled={!podePesquisar} onClick={() => pesquisa.mutate()}>
                {pesquisa.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Pesquisar pacotes
              </Button>
              {!selOrigem || !selDestino ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Escolha origem e destino na lista da FRT — só a seleção real habilita a pesquisa.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {etapa === "hospedagem" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Escolha sua hospedagem</h2>
            <Button variant="ghost" size="sm" onClick={() => setEtapa("pesquisa")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Nova pesquisa
            </Button>
          </div>
          {abrirAereo.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando voos do pacote…
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {hoteis.map((h) => (
              <Card key={h.id} className="overflow-hidden">
                {h.hotel.imagem ? (
                  <img
                    src={h.hotel.imagem}
                    alt={h.hotel.nome ?? "Foto da hospedagem"}
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center bg-muted text-muted-foreground">
                    <BedDouble className="h-8 w-8" />
                  </div>
                )}
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium leading-tight">{h.hotel.nome ?? "Hospedagem"}</h3>
                    {h.hotel.estrelas ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-brand-orange">
                        {Array.from({ length: h.hotel.estrelas }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-current" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  {h.hotel.localizacao && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {h.hotel.localizacao}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {h.hotel.checkin ?? "—"} a {h.hotel.checkout ?? "—"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {h.hotel.regime && <Badge variant="secondary">{h.hotel.regime}</Badge>}
                    {h.hotel.quarto && <Badge variant="outline">{h.hotel.quarto}</Badge>}
                  </div>
                  <Separator />
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Por pessoa</p>
                      <p className="text-lg font-semibold">{precoTexto(h.preco, "porPessoa")}</p>
                      <p className="text-xs text-muted-foreground">Total {precoTexto(h.preco, "total")}</p>
                    </div>
                    <Button size="sm" onClick={() => abrirAereo.mutate(h.id)} disabled={abrirAereo.isPending}>
                      Selecionar hotel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {!hoteis.length && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nenhuma hospedagem reconhecida nesta resposta da FRT.
                {diagnostico ? (
                  <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(diagnostico, null, 2)}
                  </pre>
                ) : null}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {etapa === "aereo" && pacote && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Escolha seu voo</h2>
            <Button variant="ghost" size="sm" onClick={() => setEtapa("hospedagem")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar para hotéis
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {opcoes.length
              ? `${opcoes.length} opção${opcoes.length > 1 ? "es" : ""} aérea${opcoes.length > 1 ? "s" : ""} para ${pacote.hotel.nome ?? "a hospedagem escolhida"}.`
              : "A FRT não devolveu opções aéreas alternativas para este pacote."}
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            {opcoes.map((o) => (
              <OpcaoAereaCard
                key={o.id}
                opcao={o}
                ativo={aereoAtivo === o.id}
                carregando={escolherVoo.isPending}
                onSelecionar={() => escolherVoo.mutate(o.id)}
              />
            ))}
          </div>

          {!opcoes.length && (
            <div className="grid gap-4 md:grid-cols-2">
              <TrechoCard titulo="Ida" trecho={pacote.aereo.ida} />
              <TrechoCard titulo="Volta" trecho={pacote.aereo.volta} />
            </div>
          )}

          <Button onClick={() => setEtapa("resumo")}>Continuar para o resumo</Button>
        </section>
      )}

      {etapa === "resumo" && pacote && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Resumo do pacote</h2>
            <Button variant="ghost" size="sm" onClick={() => setEtapa("aereo")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Alterar voo
            </Button>
          </div>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <BedDouble className="h-4 w-4 text-brand-orange" />
                <span className="font-medium">{pacote.hotel.nome ?? "Hospedagem"}</span>
                {pacote.hotel.regime && <Badge variant="secondary">{pacote.hotel.regime}</Badge>}
                {pacote.hotel.quarto && <Badge variant="outline">{pacote.hotel.quarto}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {pacote.hotel.checkin ?? "—"} a {pacote.hotel.checkout ?? "—"}
              </p>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <TrechoCard titulo="Ida" trecho={pacote.aereo.ida} compacto />
                <TrechoCard titulo="Volta" trecho={pacote.aereo.volta} compacto />
              </div>
              <Separator />
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Por pessoa</p>
                  <p className="text-2xl font-semibold">
                    {resumoFrt?.precoPorPessoaFormatado ?? precoTexto(pacote.preco, "porPessoa")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total {resumoFrt?.precoTotalFormatado ?? precoTexto(pacote.preco, "total")}
                  </p>
                </div>
                <Button disabled title="Somente leitura nesta etapa">
                  Selecionar pacote
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function Passos({ etapa }: { etapa: Etapa }) {
  const passos: { chave: Etapa; label: string }[] = [
    { chave: "pesquisa", label: "Pesquisar" },
    { chave: "hospedagem", label: "Hospedagem" },
    { chave: "aereo", label: "Voos" },
    { chave: "resumo", label: "Resumo" },
  ];
  const atual = passos.findIndex((p) => p.chave === etapa);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {passos.map((p, i) => (
        <li
          key={p.chave}
          className={`rounded-full px-3 py-1 ${
            i <= atual ? "bg-brand-orange/10 text-brand-orange" : "bg-muted text-muted-foreground"
          }`}
        >
          {i + 1}. {p.label}
        </li>
      ))}
    </ol>
  );
}

function TrechoCard({
  titulo,
  trecho,
  compacto,
}: {
  titulo: string;
  trecho: FrtPacote["aereo"]["ida"];
  compacto?: boolean;
}) {
  if (!trecho) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {titulo}: nenhum voo informado pela FRT neste pacote.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Plane className="h-4 w-4 text-brand-orange" /> {titulo}
          </span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {trecho.logo ? (
              <img src={trecho.logo} alt={trecho.companhia ?? "Companhia aérea"} className="h-4" loading="lazy" />
            ) : null}
            {trecho.companhia ?? trecho.codigoCompanhia ?? "—"}
          </span>
        </div>
        <p className="text-lg font-semibold">
          {trecho.origem ?? "—"} → {trecho.destino ?? "—"}
        </p>
        <p className="text-sm">
          {trecho.saida ?? "—"} — {trecho.chegada ?? "—"}
          {trecho.chegaDiaSeguinte ? <sup className="ml-0.5 text-brand-orange">+1</sup> : null}
          {trecho.duracao ? <span className="ml-2 text-muted-foreground">({trecho.duracao})</span> : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {trecho.paradas === 0 ? "Direto" : `${trecho.paradas} parada${trecho.paradas > 1 ? "s" : ""}`}
          </Badge>
          {trecho.conexoes.map((c) => (
            <Badge key={c} variant="outline">
              Conexão {c}
            </Badge>
          ))}
          {trecho.classe && <Badge variant="outline">{trecho.classe}</Badge>}
          {trecho.bagagem && <Badge variant="outline">{trecho.bagagem}</Badge>}
          {trecho.trocaAeroporto && <Badge variant="destructive">Troca de aeroporto</Badge>}
        </div>
        {!compacto && trecho.segmentos.length > 1 && (
          <ul className="space-y-1 border-l pl-3 text-xs text-muted-foreground">
            {trecho.segmentos.map((s, i) => (
              <li key={i}>
                {s.origem ?? "—"} → {s.destino ?? "—"} · {s.saida ?? "—"}–{s.chegada ?? "—"}
                {s.codigoCompanhia ? ` · ${s.codigoCompanhia}${s.numeroVoo ?? ""}` : ""}
              </li>
            ))}
          </ul>
        )}
        {!compacto && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Valores por pacote conforme ocupação pesquisada
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OpcaoAereaCard({
  opcao,
  ativo,
  carregando,
  onSelecionar,
}: {
  opcao: FrtOpcaoAerea;
  ativo: boolean;
  carregando: boolean;
  onSelecionar: () => void;
}) {
  const diff = opcao.preco;
  const sinal = diff.diferencaTipo === "mais_barato" ? "−" : "+";
  return (
    <Card className={ativo ? "border-brand-orange ring-1 ring-brand-orange" : undefined}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium">
            {opcao.logo ? (
              <img src={opcao.logo} alt={opcao.companhia ?? "Companhia aérea"} className="h-5" loading="lazy" />
            ) : (
              <Plane className="h-4 w-4 text-brand-orange" />
            )}
            {opcao.companhia ?? opcao.ida?.codigoCompanhia ?? "Companhia"}
          </span>
          {ativo && <Badge>Selecionado</Badge>}
        </div>

        <LinhaVoo rotulo="Ida" trecho={opcao.ida} />
        <LinhaVoo rotulo="Volta" trecho={opcao.volta} />

        <Separator />
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{opcao.preco.porPessoaFormatado ?? "—"}</p>
            <p className="text-xs text-muted-foreground">por pessoa</p>
            <p className="text-sm">{opcao.preco.totalFormatado ?? "—"} total</p>
            {opcao.preco.taxasFormatado && (
              <p className="text-xs text-muted-foreground">Taxas {opcao.preco.taxasFormatado}</p>
            )}
            {opcao.preco.impostosFormatado && (
              <p className="text-xs text-muted-foreground">Impostos {opcao.preco.impostosFormatado}</p>
            )}
            {opcao.preco.diferencaFormatada && (
              <p
                className={`text-xs font-medium ${
                  diff.diferencaTipo === "mais_barato" ? "text-emerald-600" : "text-brand-orange"
                }`}
              >
                {diff.diferencaTipo === "igual"
                  ? "Mesmo valor do aéreo base"
                  : `${sinal} ${opcao.preco.diferencaFormatada} ${
                      diff.diferencaTipo === "mais_barato" ? "mais barato" : "mais caro"
                    }`}
              </p>
            )}
          </div>
          <Button size="sm" onClick={onSelecionar} disabled={carregando || !opcao.selectSource}>
            {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {ativo ? "Selecionado" : "Selecionar voo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaVoo({ rotulo, trecho }: { rotulo: string; trecho: FrtOpcaoAerea["ida"] }) {
  if (!trecho) {
    return <p className="text-xs text-muted-foreground">{rotulo}: não informado</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="mr-2 text-xs uppercase text-muted-foreground">{rotulo}</span>
        <span className="font-medium">
          {trecho.origem ?? "—"} {trecho.saida ?? ""} → {trecho.destino ?? "—"} {trecho.chegada ?? ""}
        </span>
        {trecho.chegaDiaSeguinte ? <sup className="ml-0.5 text-brand-orange">+1</sup> : null}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">
          {trecho.paradas === 0
            ? "Direto"
            : `${trecho.paradas} parada${trecho.paradas > 1 ? "s" : ""}${
                trecho.conexoes.length ? ` em ${trecho.conexoes.join(", ")}` : ""
              }`}
        </Badge>
        {trecho.duracao && <Badge variant="outline">{trecho.duracao}</Badge>}
        {trecho.classe && <Badge variant="outline">{trecho.classe}</Badge>}
        {trecho.bagagem && <Badge variant="outline">{trecho.bagagem}</Badge>}
        {trecho.trocaAeroporto && <Badge variant="destructive">Troca de aeroporto</Badge>}
      </div>
    </div>
  );
}
