import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plane,
  Luggage,
  User,
  Clock,
  Ticket,
  CreditCard,
  Copy,
  ArrowRight,
  CheckCircle2,
  Building2,
  Mail,
  Phone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/reservas-preview")({
  component: Preview,
  head: () => ({
    meta: [
      { title: "Modelos da tela de reserva — VIA AIR" },
      {
        name: "description",
        content:
          "Quatro propostas de design para a tela de detalhe de reserva da consolidadora VIA AIR.",
      },
      { property: "og:title", content: "Modelos da tela de reserva — VIA AIR" },
      {
        property: "og:description",
        content: "Escolha o layout da tela de reserva e emissão da consolidadora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* ------------------------------- dados de exemplo ------------------------------- */

const reserva = {
  localizador: "GIEVDQ",
  status: "Reservado",
  limite: "25/08/2026 até 14:46h",
  criacao: "22/08/2026 às 14:46h",
  agencia: "VIA AIR",
  usuario: "Lucas Rocha Francez",
  companhia: "GOL",
  total: 8769.36,
  tarifa: 7874.46,
  taxaEmbarque: 107.45,
  taxaServico: 787.45,
  pax: [
    {
      nome: "LUCAS FRANCEZ",
      tipo: "Adulto",
      nascimento: "09/04/1998",
      documento: "072.500.279-48",
      email: "lucas@voeair.com",
      telefone: "+55 44 99909-3642",
      status: "Reservado",
    },
  ],
  voos: [
    {
      cia: "G3",
      numero: "1135",
      origem: "MGF",
      origemNome: "Maringá",
      destino: "CGH",
      destinoNome: "São Paulo",
      partida: "20 Set 2026 · 14:55",
      chegada: "20 Set 2026 · 16:10",
      duracao: "1h15",
      familia: "LIGHT",
      cabine: "Econômica",
      bagagem: "Mão 10kg · sem despachada",
      status: "HK",
      equip: "7M8",
      sentido: "Ida",
    },
    {
      cia: "G3",
      numero: "1208",
      origem: "CGH",
      origemNome: "São Paulo",
      destino: "LDB",
      destinoNome: "Londrina",
      partida: "20 Set 2026 · 21:30",
      chegada: "20 Set 2026 · 22:45",
      duracao: "1h15",
      familia: "LIGHT",
      cabine: "Econômica",
      bagagem: "Mão 10kg · sem despachada",
      status: "HK",
      equip: "738",
      sentido: "Ida",
    },
    {
      cia: "G3",
      numero: "1209",
      origem: "LDB",
      origemNome: "Londrina",
      destino: "CGH",
      destinoNome: "São Paulo",
      partida: "24 Set 2026 · 07:20",
      chegada: "24 Set 2026 · 08:30",
      duracao: "1h10",
      familia: "LIGHT",
      cabine: "Econômica",
      bagagem: "Mão 10kg · sem despachada",
      status: "HK",
      equip: "738",
      sentido: "Volta",
    },
    {
      cia: "G3",
      numero: "1134",
      origem: "CGH",
      origemNome: "São Paulo",
      destino: "MGF",
      destinoNome: "Maringá",
      partida: "24 Set 2026 · 11:50",
      chegada: "24 Set 2026 · 13:15",
      duracao: "1h25",
      familia: "LIGHT",
      cabine: "Econômica",
      bagagem: "Mão 10kg · sem despachada",
      status: "HK",
      equip: "7M8",
      sentido: "Volta",
    },
  ],
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/* --------------------------------- modelo 1 --------------------------------- */

function Modelo1() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Localizador</p>
              <p className="font-mono text-3xl font-extrabold tracking-widest">
                {reserva.localizador}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">
                {reserva.status}
              </Badge>
              <Badge variant="outline">
                <Clock className="mr-1 h-3 w-3" /> Limite {reserva.limite}
              </Badge>
              <Button size="sm" variant="outline">
                <Copy className="mr-2 h-4 w-4" /> Copiar
              </Button>
            </div>
          </div>
          <CardContent className="space-y-5 p-5">
            {["Ida", "Volta"].map((sentido) => (
              <div key={sentido} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {sentido}
                </p>
                {reserva.voos
                  .filter((v) => v.sentido === sentido)
                  .map((v) => (
                    <div
                      key={v.numero}
                      className="relative rounded-xl border border-border p-4 pl-12"
                    >
                      <span className="absolute left-4 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Plane className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-base font-semibold">
                          {v.origem} <ArrowRight className="inline h-4 w-4" /> {v.destino}
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            {v.origemNome} → {v.destinoNome}
                          </span>
                        </p>
                        <Badge variant="secondary">
                          {v.cia} {v.numero}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {v.partida} → {v.chegada} · {v.duracao} · {v.equip}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">{v.familia}</Badge>
                        <Badge variant="outline">{v.cabine}</Badge>
                        <Badge variant="outline">
                          <Luggage className="mr-1 h-3 w-3" />
                          {v.bagagem}
                        </Badge>
                        <Badge variant="outline">Status {v.status}</Badge>
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Passageiros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reserva.pax.map((p) => (
              <div
                key={p.nome}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium">{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.tipo} · {p.nascimento} · {p.documento}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    <Mail className="mr-1 inline h-3 w-3" />
                    {p.email}
                  </p>
                  <p>
                    <Phone className="mr-1 inline h-3 w-3" />
                    {p.telefone}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Linha label="Tarifa" valor={reserva.tarifa} />
            <Linha label="Taxa de embarque" valor={reserva.taxaEmbarque} />
            <Linha label="Taxa de serviço" valor={reserva.taxaServico} />
            <Separator />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>{brl(reserva.total)}</span>
            </div>
            <Button className="mt-3 w-full">
              <Ticket className="mr-2 h-4 w-4" /> Emitir bilhete
            </Button>
            <Button variant="outline" className="w-full">
              <CreditCard className="mr-2 h-4 w-4" /> Gerar link de pagamento
            </Button>
            <Button variant="ghost" className="w-full text-destructive">
              Cancelar reserva
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4 text-xs text-muted-foreground">
            <p>
              <Building2 className="mr-1 inline h-3 w-3" />
              {reserva.agencia} · {reserva.usuario}
            </p>
            <p>Criada em {reserva.criacao}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{brl(valor)}</span>
    </div>
  );
}

/* --------------------------------- modelo 2 --------------------------------- */

function Modelo2() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-transparent p-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Reserva confirmada
          </p>
          <p className="font-mono text-4xl font-black tracking-[0.2em] text-primary">
            {reserva.localizador}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Emissão até {reserva.limite} · {reserva.companhia}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <CreditCard className="mr-2 h-4 w-4" /> Link de pagamento
          </Button>
          <Button>
            <Ticket className="mr-2 h-4 w-4" /> Emitir
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {reserva.voos.map((v) => (
          <div
            key={v.numero}
            className="relative overflow-hidden rounded-xl border border-dashed border-border bg-card"
          >
            <div className="flex items-center justify-between bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-widest">
              <span>
                {v.sentido} · {v.cia} {v.numero}
              </span>
              <span className="text-muted-foreground">{v.familia}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <p className="text-2xl font-bold">{v.origem}</p>
                <p className="text-xs text-muted-foreground">{v.partida}</p>
              </div>
              <div className="flex flex-col items-center text-muted-foreground">
                <Plane className="h-4 w-4" />
                <span className="text-[10px]">{v.duracao}</span>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{v.destino}</p>
                <p className="text-xs text-muted-foreground">{v.chegada}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-dashed border-border px-4 py-2 text-xs text-muted-foreground">
              <span>
                <Luggage className="mr-1 inline h-3 w-3" />
                {v.bagagem}
              </span>
              <span>{v.equip}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Passageiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {reserva.pax.map((p) => (
              <div key={p.nome}>
                <p className="font-semibold">{p.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {p.tipo} · nasc. {p.nascimento} · CPF {p.documento}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.email} · {p.telefone}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Valores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Linha label="Tarifa" valor={reserva.tarifa} />
            <Linha label="Taxa de embarque" valor={reserva.taxaEmbarque} />
            <Linha label="Taxa de serviço" valor={reserva.taxaServico} />
            <Separator />
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">{brl(reserva.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- modelo 3 --------------------------------- */

function Modelo3() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <span className="font-mono text-xl font-bold tracking-widest">{reserva.localizador}</span>
        <Badge variant="secondary">{reserva.status}</Badge>
        <span className="text-muted-foreground">Limite {reserva.limite}</span>
        <span className="text-muted-foreground">Criada {reserva.criacao}</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline">
            Retarifar
          </Button>
          <Button size="sm" variant="outline">
            Link de pagamento
          </Button>
          <Button size="sm">Emitir</Button>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Voo</th>
              <th className="px-3 py-2">Saída</th>
              <th className="px-3 py-2">Chegada</th>
              <th className="px-3 py-2">Trecho</th>
              <th className="px-3 py-2">Dur.</th>
              <th className="px-3 py-2">Família</th>
              <th className="px-3 py-2">Bagagem</th>
              <th className="px-3 py-2">St.</th>
            </tr>
          </thead>
          <tbody>
            {reserva.voos.map((v) => (
              <tr key={v.numero} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">
                  {v.cia} {v.numero}
                </td>
                <td className="px-3 py-2">{v.partida}</td>
                <td className="px-3 py-2">{v.chegada}</td>
                <td className="px-3 py-2">
                  {v.origem} → {v.destino}
                </td>
                <td className="px-3 py-2">{v.duracao}</td>
                <td className="px-3 py-2">{v.familia}</td>
                <td className="px-3 py-2 text-muted-foreground">{v.bagagem}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline">{v.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-border">
          <p className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            Passageiros
          </p>
          <table className="w-full text-left text-sm">
            <tbody>
              {reserva.pax.map((p) => (
                <tr key={p.nome} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{p.nome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.tipo}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.documento}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <p className="bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider">
            Valores
          </p>
          <table className="w-full text-left text-sm">
            <tbody>
              <tr className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">Tarifa</td>
                <td className="px-3 py-2 text-right">{brl(reserva.tarifa)}</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">Taxa de embarque</td>
                <td className="px-3 py-2 text-right">{brl(reserva.taxaEmbarque)}</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">Taxa de serviço</td>
                <td className="px-3 py-2 text-right">{brl(reserva.taxaServico)}</td>
              </tr>
              <tr className="border-t border-border bg-muted/30 font-bold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{brl(reserva.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- modelo 4 --------------------------------- */

function Modelo4() {
  return (
    <div className="space-y-4 rounded-2xl bg-foreground/95 p-5 text-background">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-background/60">Consolidadora</p>
          <p className="font-mono text-4xl font-black tracking-[0.25em]">{reserva.localizador}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground">
              {reserva.status}
            </span>
            <span className="rounded-full bg-background/10 px-3 py-1">Limite {reserva.limite}</span>
            <span className="rounded-full bg-background/10 px-3 py-1">{reserva.companhia}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-background/60">Total</p>
          <p className="text-3xl font-black">{brl(reserva.total)}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary">
              Link de pagamento
            </Button>
            <Button size="sm">
              <Ticket className="mr-2 h-4 w-4" /> Emitir
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {reserva.voos.map((v) => (
          <div
            key={v.numero}
            className="rounded-xl border border-background/15 bg-background/5 p-4 backdrop-blur"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-widest text-background/60">
              <span>{v.sentido}</span>
              <span>
                {v.cia} {v.numero} · {v.familia}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div>
                <p className="text-xl font-bold">{v.origem}</p>
                <p className="text-[11px] text-background/60">{v.partida}</p>
              </div>
              <div className="flex-1 border-t border-dashed border-background/30" />
              <span className="text-[11px] text-background/70">{v.duracao}</span>
              <div className="flex-1 border-t border-dashed border-background/30" />
              <div className="text-right">
                <p className="text-xl font-bold">{v.destino}</p>
                <p className="text-[11px] text-background/60">{v.chegada}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-background/60">
              <Luggage className="mr-1 inline h-3 w-3" />
              {v.bagagem} · {v.cabine} · {v.equip}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-background/15 bg-background/5 p-4">
          <p className="text-xs uppercase tracking-widest text-background/60">Passageiros</p>
          {reserva.pax.map((p) => (
            <div key={p.nome} className="mt-2 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold">{p.nome}</p>
                <p className="text-[11px] text-background/60">
                  {p.tipo} · {p.documento} · {p.nascimento}
                </p>
                <p className="text-[11px] text-background/60">
                  {p.email} · {p.telefone}
                </p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-background/15 bg-background/5 p-4 text-sm">
          <p className="text-xs uppercase tracking-widest text-background/60">Valores</p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-background/60">Tarifa</span>
              <span>{brl(reserva.tarifa)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-background/60">Taxa de embarque</span>
              <span>{brl(reserva.taxaEmbarque)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-background/60">Taxa de serviço</span>
              <span>{brl(reserva.taxaServico)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-background/20 pt-2 text-base font-bold">
              <span>Total</span>
              <span>{brl(reserva.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- página ---------------------------------- */

const modelos = [
  {
    id: "1",
    nome: "1 · Executivo",
    desc: "Coluna principal com voos em timeline e resumo financeiro fixo na lateral.",
    render: <Modelo1 />,
  },
  {
    id: "2",
    nome: "2 · Cartão de embarque",
    desc: "Cada trecho vira um boarding pass; ações de emissão no topo.",
    render: <Modelo2 />,
  },
  {
    id: "3",
    nome: "3 · Operacional",
    desc: "Densidade da consolidadora, em tabelas limpas — rápido para operar.",
    render: <Modelo3 />,
  },
  {
    id: "4",
    nome: "4 · Premium escuro",
    desc: "Painel escuro com destaque laranja no localizador e no total.",
    render: <Modelo4 />,
  },
];

function Preview() {
  const [tab, setTab] = useState("1");
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">Tela de reserva — 4 modelos</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um modelo para eu aplicar em Pedidos → Reservas e emissões.
        </p>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          {modelos.map((m) => (
            <TabsTrigger key={m.id} value={m.id}>
              {m.nome}
            </TabsTrigger>
          ))}
        </TabsList>
        {modelos.map((m) => (
          <TabsContent key={m.id} value={m.id} className="space-y-3">
            <p className="text-sm text-muted-foreground">{m.desc}</p>
            {m.render}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
