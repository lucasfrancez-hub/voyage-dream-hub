import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, Loader2, Ticket } from "lucide-react";
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
import { passhubTarifarOferta, passhubReservar } from "@/lib/passhub/passhub.functions";
import type { PassHubOferta, PassHubPax, PassHubPaxTipo, PassHubReserva } from "@/lib/passhub/types";

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

const rotuloTipo: Record<PassHubPaxTipo, string> = {
  ADT: "Adulto",
  CHD: "Criança",
  INF: "Bebê",
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
    email: "reservas@viaair.tur.br",
    ddi: "55",
    ddd: "44",
    telefone: "999093642",
  };
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
  const [tokens, setTokens] = useState<string[] | null>(null);
  const [precoTarifado, setPrecoTarifado] = useState<number | null>(null);
  const [reserva, setReserva] = useState<PassHubReserva | null>(null);
  const [copiado, setCopiado] = useState(false);

  const rateTokens = oferta ? [oferta.ida, ...oferta.voltas].map((v) => v.rateToken) : [];
  const provedor = oferta?.ida.provedor || "CVC";

  const atualiza = (i: number, campo: keyof PassHubPax, valor: string) =>
    setPaxs((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));

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
      toast[r.tarifacao.retarifou ? "warning" : "success"](
        r.tarifacao.retarifou
          ? `Tarifa mudou: agora ${brl(r.tarifacao.preco)}`
          : `Tarifa confirmada em ${brl(r.tarifacao.preco)}`,
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
          paxs,
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
    setTokens(null);
    setPrecoTarifado(null);
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


  const localizador = reserva?.localizador || reserva?.bookingId || "";

  const copiar = async () => {
    await navigator.clipboard.writeText(localizador);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={!!oferta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reservar na PassHub</DialogTitle>
          <DialogDescription>
            Tarifamos a oferta, criamos a reserva e o localizador aparece aqui no final.
          </DialogDescription>
        </DialogHeader>

        {oferta && !reserva && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div>
                <p className="font-medium">
                  {oferta.ida.companhia} · {oferta.ida.origem} → {oferta.ida.destino}
                  {oferta.voltas.length > 0 && " (com volta)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {oferta.ida.partida} · {oferta.ida.familiaTarifaria || oferta.ida.classe} ·{" "}
                  {provedor}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{brl(precoTarifado ?? oferta.precoTotal)}</p>
                {tokens && <Badge variant="secondary">Tarifa confirmada</Badge>}
              </div>
            </div>

            {paxs.map((p, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {rotuloTipo[p.tipo]} {i + 1}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={p.nome} onChange={(e) => atualiza(i, "nome", e.target.value)} />
                  </div>
                  <div>
                    <Label>Sobrenome</Label>
                    <Input
                      value={p.sobrenome}
                      onChange={(e) => atualiza(i, "sobrenome", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Nascimento</Label>
                    <Input
                      type="date"
                      value={p.nascimento}
                      onChange={(e) => atualiza(i, "nascimento", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Gênero</Label>
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
                    <Label>Documento</Label>
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
                    <Label>{p.documentoTipo === "cpf" ? "Número do CPF" : "Nº do passaporte"}</Label>
                    <Input
                      value={p.documento}
                      onChange={(e) => atualiza(i, "documento", e.target.value)}
                    />
                  </div>
                  {p.documentoTipo === "passport" && (
                    <>
                      <div>
                        <Label>Emissão</Label>
                        <Input
                          type="date"
                          value={p.emissao ?? ""}
                          onChange={(e) => atualiza(i, "emissao", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Validade</Label>
                        <Input
                          type="date"
                          value={p.validade ?? ""}
                          onChange={(e) => atualiza(i, "validade", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>País emissor</Label>
                        <Input
                          maxLength={2}
                          value={p.paisEmissor ?? "BR"}
                          onChange={(e) =>
                            atualiza(i, "paisEmissor", e.target.value.toUpperCase())
                          }
                        />
                      </div>
                    </>
                  )}
                  {i === 0 && (
                    <>
                      <div>
                        <Label>E-mail</Label>
                        <Input
                          type="email"
                          value={p.email ?? ""}
                          onChange={(e) => atualiza(i, "email", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>DDD</Label>
                        <Input
                          maxLength={3}
                          value={p.ddd ?? ""}
                          onChange={(e) => atualiza(i, "ddd", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Telefone</Label>
                        <Input
                          value={p.telefone ?? ""}
                          onChange={(e) => atualiza(i, "telefone", e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => tarifacao.mutate()}
                disabled={tarifacao.isPending}
              >
                {tarifacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Retarifar
              </Button>
              <Button
                onClick={async () => {
                  const r = await tarifacao.mutateAsync();
                  if (!r.ok) return;
                  await criacao.mutateAsync(r.tarifacao.pricedRateTokens);
                }}
                disabled={!paxs.every(paxCompleto) || tarifacao.isPending || criacao.isPending}
              >
                {tarifacao.isPending || criacao.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Ticket className="mr-2 h-4 w-4" />
                )}
                Reservar agora
              </Button>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              Ao clicar em reservar, a tarifa é revalidada automaticamente na consolidadora antes
              de gerar o localizador.
            </p>
          </div>
        )}

        {reserva && (
          <div className="space-y-4 rounded-xl border border-emerald-500/60 bg-emerald-500/5 p-5 text-center">
            <p className="text-sm text-muted-foreground">Reserva criada com sucesso</p>
            <p className="font-mono text-3xl font-extrabold tracking-widest">{localizador}</p>
            {reserva.localizadorCompanhia && (
              <p className="text-sm text-muted-foreground">
                Localizador da companhia:{" "}
                <span className="font-mono font-semibold text-foreground">
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
                {copiado ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
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
