import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, CreditCard, Info, Loader2, PlaneTakeoff, PlaneLanding, Sparkles, Ticket } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  passhubTarifarOferta,
  passhubReservar,
  passhubLinkPagamento,
} from "@/lib/passhub/passhub.functions";
import { BuscarCadastroPax, LeitorIAPax, type PaxPreenchido } from "@/components/passhub/PaxAssist";
import type {
  PassHubOferta,
  PassHubPax,
  PassHubPaxTipo,
  PassHubReserva,
  PassHubVoo,
} from "@/lib/passhub/types";

type Props = {
  oferta: PassHubOferta | null;
  adultos: number;
  criancas: number;
  bebes: number;
  ravPercentual: number;
  onClose: () => void;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const hora = (dataHora: string) => (dataHora?.split(" ")[1] ?? dataHora ?? "").slice(0, 5) || "--:--";
const dia = (dataHora: string) => (dataHora?.split(" ")[0] ?? "").replace(/-/g, "/");

const rotuloTipo: Record<PassHubPaxTipo, string> = {
  ADT: "Adulto",
  CHD: "Criança",
  INF: "Bebê",
};

const CONTATO_PADRAO = {
  email: "reservas@viaair.tur.br",
  ddi: "55",
  ddd: "44",
  telefone: "999093642",
};

function paxVazio(tipo: PassHubPaxTipo): PassHubPax {
  return {
    tipo,
    nome: "",
    sobrenome: "",
    nascimento: "",
    genero: "M",
    documentoTipo: "cpf",
    documento: "",
    paisEmissor: "BR",
    paisResidencia: "BR",
    emissao: "",
    validade: "",
    ...CONTATO_PADRAO,
  };
}

/** A volta já contém o preço fechado da viagem; nunca somamos ida e volta. */
function valoresDaOferta(oferta: PassHubOferta) {
  const vooComPrecoFechado = oferta.voltas[0] ?? oferta.ida;
  const base = vooComPrecoFechado.precoTarifa || 0;
  const taxas = vooComPrecoFechado.taxas || 0;
  const total = vooComPrecoFechado.precoTotal || oferta.precoTotal;
  return { base, taxas, total };
}

function CardTrecho({ voo, rotulo }: { voo: PassHubVoo | undefined; rotulo: string }) {
  if (!voo) return null;
  const conexao =
    voo.paradas === 0
      ? "Voo direto"
      : `${voo.paradas} ${voo.paradas === 1 ? "parada" : "paradas"}${voo.escala ? ` · ${voo.escala}` : ""}`;
  const idaVolta = rotulo === "Ida selecionada";
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
          {idaVolta ? <PlaneTakeoff className="h-4 w-4" /> : <PlaneLanding className="h-4 w-4" />}
          {rotulo}
        </p>
        <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">Selecionada</Badge>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-extrabold leading-none">{hora(voo.partida)}</p>
          <p className="text-sm font-semibold text-white/80">{voo.origem}</p>
          <p className="text-[11px] text-white/50">{dia(voo.partida)}</p>
        </div>
        <div className="flex-1 px-2 text-center text-[11px] text-white/50">
          <div className="mx-auto mb-1 h-px w-full bg-white/15" />
          {voo.duracao || "—"}
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold leading-none">{hora(voo.chegada)}</p>
          <p className="text-sm font-semibold text-white/80">{voo.destino}</p>
          <p className="text-[11px] text-white/50">{dia(voo.chegada)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {[
          ["Companhia / voos", `${voo.companhia || voo.companhiaIata} ${voo.numeroVoo || ""}`.trim()],
          ["Duração", voo.duracao || "—"],
          ["Conexão", conexao],
          ["Rota", `${voo.origem} → ${voo.destino}`],
          ["Bagagem de mão", voo.bagagemMao ? "Inclusa" : "Não inclusa"],
          [
            "Bagagem despachada",
            voo.bagagemDespachada ? `${voo.bagagemDespachadaQtd || 1} peça(s)` : "Não inclusa",
          ],
        ].map(([rot, val]) => (
          <div key={rot} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-white/45">{rot}</p>
            <p className="font-medium text-white/90">{val || "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReservaPassHubDialog({
  oferta,
  adultos,
  criancas,
  bebes,
  ravPercentual,
  onClose,
}: Props) {
  const tarifarFn = useServerFn(passhubTarifarOferta);
  const reservarFn = useServerFn(passhubReservar);

  const listaInicial = useMemo(() => {
    const l: PassHubPax[] = [];
    for (let i = 0; i < adultos; i += 1) l.push(paxVazio("ADT"));
    for (let i = 0; i < criancas; i += 1) l.push(paxVazio("CHD"));
    for (let i = 0; i < bebes; i += 1) l.push(paxVazio("INF"));
    return l.length ? l : [paxVazio("ADT")];
  }, [adultos, criancas, bebes]);

  const [paxs, setPaxs] = useState<PassHubPax[]>(listaInicial);
  const [contato, setContato] = useState(CONTATO_PADRAO);
  const [tokens, setTokens] = useState<string[] | null>(null);
  const [precoTarifado, setPrecoTarifado] = useState<number | null>(null);
  const [precoSemTaxaTarifado, setPrecoSemTaxaTarifado] = useState<number | null>(null);
  const [comissaoTarifada, setComissaoTarifada] = useState<number | null>(null);
  const [reserva, setReserva] = useState<PassHubReserva | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [leitorIA, setLeitorIA] = useState(false);

  /** Aplica os dados vindos do cadastro ou da IA em um passageiro. */
  const preencherPax = (i: number, d: PaxPreenchido) =>
    setPaxs((prev) =>
      prev.map((p, idx) =>
        idx === i
          ? {
              ...p,
              nome: d.nome || p.nome,
              sobrenome: d.sobrenome || p.sobrenome,
              nascimento: d.nascimento || p.nascimento,
              genero: d.genero ?? p.genero,
              documentoTipo: d.documentoTipo || p.documentoTipo,
              documento: d.documento || p.documento,
              emissao: d.emissao || p.emissao,
              validade: d.validade || p.validade,
            }
          : p,
      ),
    );

  /** A IA pode devolver vários passageiros de uma vez — preenche na ordem. */
  const preencherLista = (lista: PaxPreenchido[]) => {
    lista.forEach((d, i) => preencherPax(i, d));
    const c = lista.find((d) => d.email || d.telefone);
    if (c) {
      setContato((prev) => ({
        email: c.email || prev.email,
        ddi: c.ddi || prev.ddi,
        ddd: c.ddd || prev.ddd,
        telefone: c.telefone || prev.telefone,
      }));
    }
  };

  const rateTokens = oferta
    ? [...new Set([oferta.ida, ...oferta.voltas].map((v) => v.rateToken).filter(Boolean))]
    : [];
  const provedor = oferta?.ida.provedor || "CVC";

  const atualiza = (i: number, campo: keyof PassHubPax, valor: string) =>
    setPaxs((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));

  /** O contato é o mesmo para todos os passageiros — a PassHub exige em cada pax. */
  const paxsComContato = () =>
    paxs.map((p) => ({
      ...p,
      email: contato.email.trim(),
      ddi: contato.ddi.replace(/\D/g, "") || "55",
      ddd: contato.ddd.replace(/\D/g, ""),
      telefone: contato.telefone.replace(/\D/g, ""),
    }));

  const tarifacao = useMutation({
    mutationFn: async () =>
      tarifarFn({
        data: {
          rateTokens,
          provedor,
          precoEsperado: oferta?.precoTotal ?? 0,
          ravPercentual: ravPercentual || null,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setTokens(r.tarifacao.pricedRateTokens);
      setPrecoTarifado(r.tarifacao.preco);
      setPrecoSemTaxaTarifado(r.tarifacao.precoSemTaxa);
      setComissaoTarifada(r.tarifacao.ravValor || 0);
      const totalConfirmado = r.tarifacao.preco + (r.tarifacao.ravValor || 0);
      toast[r.tarifacao.retarifou ? "warning" : "success"](
        r.tarifacao.retarifou
          ? `Tarifa mudou: agora ${brl(totalConfirmado)}`
          : `Tarifa confirmada em ${brl(totalConfirmado)}`,
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const buscarLink = useServerFn(passhubLinkPagamento);
  const linkPagamento = useMutation({
    mutationFn: async () => buscarLink({ data: { localizador } }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      await navigator.clipboard.writeText(res.link);
      toast.success("Link de pagamento copiado");
      window.open(res.link, "_blank", "noopener");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao obter o link"),
  });

  const criacao = useMutation({
    mutationFn: async (tokensAtuais: string[]) =>
      reservarFn({
        data: {
          pricedRateTokens: tokensAtuais,
          provedor,
          ravPercentual: ravPercentual || null,
          paxs: paxsComContato(),
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setReserva(r.reserva);
      toast.success(`Reserva criada — localizador ${r.reserva.localizador || r.reserva.bookingId}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /** Ao abrir, já retarifamos a oferta: o operador não precisa clicar em "tarifar". */
  useEffect(() => {
    if (!oferta) return;
    setPaxs(listaInicial);
    setContato(CONTATO_PADRAO);
    setTokens(null);
    setPrecoTarifado(null);
    setPrecoSemTaxaTarifado(null);
    setComissaoTarifada(null);
    setReserva(null);
    tarifacao.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oferta?.id]);

  const paxCompleto = (p: PassHubPax) =>
    p.nome.trim().length > 1 &&
    p.sobrenome.trim().length > 1 &&
    !!p.nascimento &&
    p.documento.trim().length > 4 &&
    (p.documentoTipo === "cpf" || (!!p.emissao && !!p.validade));

  const contatoCompleto =
    /\S+@\S+\.\S+/.test(contato.email) &&
    contato.ddd.replace(/\D/g, "").length >= 2 &&
    contato.telefone.replace(/\D/g, "").length >= 8;

  const localizador = reserva?.localizador || reserva?.bookingId || "";

  const copiar = async () => {
    await navigator.clipboard.writeText(localizador);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const valoresBusca = oferta ? valoresDaOferta(oferta) : null;
  const valores = valoresBusca
    ? {
        base: precoSemTaxaTarifado ?? valoresBusca.base,
        taxas:
          precoTarifado != null && precoSemTaxaTarifado != null
            ? Math.max(0, precoTarifado - precoSemTaxaTarifado)
            : valoresBusca.taxas,
        total: precoTarifado ?? valoresBusca.total,
      }
    : null;
  const totalReserva =
    precoTarifado != null
      ? Math.round((precoTarifado + (comissaoTarifada ?? 0)) * 100) / 100
      : valores?.total ?? 0;
  const qtdPax = paxs.length || 1;

  const linhasTarifa = (["ADT", "CHD", "INF"] as PassHubPaxTipo[])
    .map((t) => ({ tipo: t, qtd: paxs.filter((p) => p.tipo === t).length }))
    .filter((l) => l.qtd > 0);

  const rotuloPax = [
    adultos ? `${adultos} adulto${adultos > 1 ? "s" : ""}` : "",
    criancas ? `${criancas} criança${criancas > 1 ? "s" : ""}` : "",
    bebes ? `${bebes} bebê${bebes > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open={!!oferta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(1560px,96vw)] max-w-none overflow-y-auto border-white/10 bg-[#07131d] p-6 text-white sm:p-8">
        <DialogHeader className="mb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-3xl font-extrabold tracking-tight">
                Fazer reserva
              </DialogTitle>
              <DialogDescription className="text-white/55">
                Depois de selecionar a ida e a volta, esta é a etapa de preenchimento dos dados do
                passageiro e contato.
              </DialogDescription>
            </div>
            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              Etapa de reserva
            </Badge>
          </div>
        </DialogHeader>

        <LeitorIAPax aberto={leitorIA} onFechar={() => setLeitorIA(false)} onPreencher={preencherLista} />

        {oferta && !reserva && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
            {/* ---------------- coluna esquerda ---------------- */}
            <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <section>
                <h3 className="mb-3 text-xl font-bold">Tarifas</h3>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-white/55">
                      <tr>
                        {["Tipo", "Qtd.", "Tarifa unitária", "Tx emb.", "Comissão", "Total tarifa", "Total taxa", "Total"].map(
                          (c) => (
                            <th key={c} className="px-3 py-2 text-left font-semibold">
                              {c}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {linhasTarifa.map((l) => {
                        const base = ((valores?.base ?? 0) / qtdPax) * l.qtd;
                        const tx = ((valores?.taxas ?? 0) / qtdPax) * l.qtd;
                        const comissao = ((comissaoTarifada ?? 0) / qtdPax) * l.qtd;
                        return (
                          <tr key={l.tipo} className="border-t border-white/10">
                            <td className="px-3 py-2 font-semibold">{l.tipo}</td>
                            <td className="px-3 py-2">{l.qtd}</td>
                            <td className="px-3 py-2">{brl(base / l.qtd)}</td>
                            <td className="px-3 py-2">{brl(tx / l.qtd)}</td>
                            <td className="px-3 py-2 text-primary">{brl(comissao)}</td>
                            <td className="px-3 py-2">{brl(base)}</td>
                            <td className="px-3 py-2">{brl(tx)}</td>
                            <td className="px-3 py-2 font-bold">{brl(base + tx + comissao)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">Passageiro{paxs.length > 1 ? "s" : ""}</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    onClick={() => setLeitorIA(true)}
                  >
                    <Sparkles className="mr-2 h-4 w-4" /> Preencher com IA (foto ou texto)
                  </Button>
                </div>
                <div className="space-y-4">
                  {paxs.map((p, i) => (
                    <div key={i} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="outline" className="border-white/20 text-white/70">
                          {rotuloTipo[p.tipo]} {i + 1}
                        </Badge>
                        <div className="min-w-[240px] flex-1">
                          <BuscarCadastroPax onEscolher={(d) => preencherPax(i, d)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div>
                          <Label className="text-white/60">Sobrenome</Label>
                          <Input
                            value={p.sobrenome}
                            onChange={(e) => atualiza(i, "sobrenome", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-white/60">Nome</Label>
                          <Input value={p.nome} onChange={(e) => atualiza(i, "nome", e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-white/60">Sexo</Label>
                          <Select value={p.genero} onValueChange={(v) => atualiza(i, "genero", v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="M">Masculino</SelectItem>
                              <SelectItem value="F">Feminino</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-white/60">Nascimento</Label>
                          <Input
                            type="date"
                            value={p.nascimento}
                            onChange={(e) => atualiza(i, "nascimento", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-white/60">Tipo de documento</Label>
                          <Select
                            value={p.documentoTipo}
                            onValueChange={(v) => atualiza(i, "documentoTipo", v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cpf">CPF</SelectItem>
                              <SelectItem value="passport">Passaporte</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-white/60">
                            {p.documentoTipo === "cpf" ? "Documento (CPF)" : "Nº do passaporte"}
                          </Label>
                          <Input
                            value={p.documento}
                            onChange={(e) => atualiza(i, "documento", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-white/60">País</Label>
                          <Input
                            maxLength={2}
                            value={p.paisEmissor ?? "BR"}
                            onChange={(e) => atualiza(i, "paisEmissor", e.target.value.toUpperCase())}
                          />
                        </div>
                        {p.documentoTipo === "passport" && (
                          <>
                            <div>
                              <Label className="text-white/60">Emissão</Label>
                              <Input
                                type="date"
                                value={p.emissao ?? ""}
                                onChange={(e) => atualiza(i, "emissao", e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-white/60">Validade</Label>
                              <Input
                                type="date"
                                value={p.validade ?? ""}
                                onChange={(e) => atualiza(i, "validade", e.target.value)}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-xl font-bold">Contato</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)]">
                  <div>
                    <Label className="text-white/60">Email</Label>
                    <Input
                      type="email"
                      value={contato.email}
                      onChange={(e) => setContato((c) => ({ ...c, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-white/60">DDD</Label>
                    <Input
                      maxLength={3}
                      value={contato.ddd}
                      onChange={(e) => setContato((c) => ({ ...c, ddd: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-white/60">Telefone</Label>
                    <Input
                      value={contato.telefone}
                      onChange={(e) => setContato((c) => ({ ...c, telefone: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-white/75">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Os dados de email e telefone já vêm preenchidos e são enviados para a PassHub em
                  todos os passageiros — continuam editáveis.
                </p>
              </section>
            </div>

            {/* ---------------- coluna direita ---------------- */}
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div>
                <h3 className="text-xl font-bold">Resumo da viagem</h3>
                <p className="text-sm text-white/55">
                  Confira a ida e a volta escolhidas antes de concluir a reserva.
                </p>
              </div>

              <CardTrecho voo={oferta.ida} rotulo="Ida selecionada" />
              {oferta.voltas.map((v, i) => (
                <CardTrecho key={i} voo={v} rotulo="Volta selecionada" />
              ))}

              <div className="rounded-xl border border-primary/40 bg-primary/10 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide">Total da reserva</p>
                    <p className="text-xs text-white/60">{rotuloPax || "1 adulto"}</p>
                  </div>
                  <p className="text-2xl font-extrabold">{brl(totalReserva)}</p>
                </div>
                {tokens && (
                  <p className="mt-2 text-right text-[11px] text-emerald-300">Tarifa confirmada</p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  className="text-white/70 hover:text-white"
                  onClick={() => tarifacao.mutate()}
                  disabled={tarifacao.isPending}
                >
                  {tarifacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Retarifar
                </Button>
                <Button
                  size="lg"
                  onClick={async () => {
                    const r = await tarifacao.mutateAsync();
                    if (!r.ok) return;
                    await criacao.mutateAsync(r.tarifacao.pricedRateTokens);
                  }}
                  disabled={
                    !paxs.every(paxCompleto) ||
                    !contatoCompleto ||
                    tarifacao.isPending ||
                    criacao.isPending
                  }
                >
                  {tarifacao.isPending || criacao.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Ticket className="mr-2 h-4 w-4" />
                  )}
                  Reservar
                </Button>
              </div>
              <p className="text-right text-[11px] text-white/45">
                Ao reservar, a tarifa é revalidada na consolidadora antes de gerar o localizador.
              </p>
            </div>
          </div>
        )}

        {reserva && (
          <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-emerald-500/60 bg-emerald-500/5 p-6 text-center">
            <p className="text-sm text-white/60">Reserva criada com sucesso</p>
            <p className="font-mono text-3xl font-extrabold tracking-widest">{localizador}</p>
            {reserva.localizadorCompanhia && (
              <p className="text-sm text-white/60">
                Localizador da companhia:{" "}
                <span className="font-mono font-semibold text-white">
                  {reserva.localizadorCompanhia}
                </span>
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              {reserva.status && <Badge variant="secondary">{reserva.status}</Badge>}
              {reserva.total > 0 && <Badge variant="outline">{brl(reserva.total)}</Badge>}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                onClick={() => linkPagamento.mutate()}
                disabled={linkPagamento.isPending}
              >
                {linkPagamento.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                Link de pagamento
              </Button>
              <Button variant="outline" onClick={copiar}>
                {copiado ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                Copiar localizador
              </Button>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
