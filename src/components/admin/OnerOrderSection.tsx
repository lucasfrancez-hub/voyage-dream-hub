/**
 * Seção "Integração Oner" exibida dentro do pedido VIA AIR já existente.
 * Só aparece quando o pedido tem a Comprar Viagem / Oner como fornecedor.
 * - Cartão: informativo (a automação conduz).
 * - Pix: operação manual da equipe + autorização do pagamento ao fornecedor.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  onerAutorizarPagamento,
  onerDoPedido,
  onerRegistrarCarrinhoOperacional,
  onerRegistrarComissaoZerada,
  onerRegistrarPedidoFornecedor,
  onerRegistrarPixFornecedor,
  onerSalvarNotas,
  type IntegracaoOnerDoPedido,
} from "@/lib/integrations/oner/order.functions";
import { rotuloTitularCartaoOner } from "@/lib/integrations/oner/config";

const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataHora = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const PURPOSE_LABEL: Record<string, string> = {
  ORIGINAL_QUOTE: "Cotação original",
  CARD_CHECKOUT: "Checkout no cartão",
  PIX_REBOOK: "Carrinho operacional (Pix)",
};

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium text-right break-all">{valor}</span>
    </div>
  );
}

export function OnerOrderSection({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const buscar = useServerFn(onerDoPedido);
  const { data } = useQuery({
    queryKey: ["oner", "pedido", orderId] as const,
    queryFn: (): Promise<IntegracaoOnerDoPedido | null> =>
      buscar({ data: { orderId } }) as Promise<IntegracaoOnerDoPedido | null>,
    refetchInterval: 30000,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["oner", "pedido", orderId] });

  const carrinhoFn = useServerFn(onerRegistrarCarrinhoOperacional);
  const comissaoFn = useServerFn(onerRegistrarComissaoZerada);
  const pixFn = useServerFn(onerRegistrarPixFornecedor);
  const pedidoFn = useServerFn(onerRegistrarPedidoFornecedor);
  const notasFn = useServerFn(onerSalvarNotas);
  const autorizarFn = useServerFn(onerAutorizarPagamento);

  const [cartId, setCartId] = useState("");
  const [liquido, setLiquido] = useState("");
  const [brcode, setBrcode] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [numeroPedido, setNumeroPedido] = useState("");
  const [notas, setNotas] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const mut = <T,>(fn: (v: T) => Promise<unknown>, sucesso: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(sucesso);
        invalidar();
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const salvarCarrinho = mut(
    () => carrinhoFn({ data: { integrationOrderId: data!.id, cartId: cartId.trim() } }),
    "Carrinho operacional registrado",
  );
  const salvarComissao = mut(
    () =>
      comissaoFn({
        data: { integrationOrderId: data!.id, providerNetTotal: Number(liquido.replace(",", ".")) },
      }),
    "Comissão zerada e valor líquido registrado",
  );
  const salvarPix = mut(
    () =>
      pixFn({
        data: {
          integrationOrderId: data!.id,
          brcode: brcode.trim(),
          vencimento: vencimento ? new Date(vencimento).toISOString() : null,
        },
      }),
    "Pix da Oner registrado",
  );
  const salvarPedido = mut(
    () => pedidoFn({ data: { integrationOrderId: data!.id, numeroPedido: numeroPedido.trim() } }),
    "Pedido F-… registrado",
  );
  const salvarNotas = mut(
    () => notasFn({ data: { integrationOrderId: data!.id, notas } }),
    "Observações salvas",
  );

  const autorizar = useMutation({
    mutationFn: () => autorizarFn({ data: { integrationOrderId: data!.id, confirmado: true as const } }),
    onSuccess: (r: any) => {
      setConfirmando(false);
      if (r?.ok) toast.success("Pagamento autorizado");
      else toast.error((r?.motivos ?? ["Não foi possível autorizar"]).join(" "));
      invalidar();
    },
    onError: (e: Error) => {
      setConfirmando(false);
      toast.error(e.message);
    },
  });

  if (!data) return null;
  const pix = data.paymentMethod === "PIX";

  return (
    <Card className="border-brand-orange/40">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">
          Integração Oner {pix ? "— Pix" : "— Cartão"}
        </CardTitle>
        <Badge variant="secondary">{data.etapa}</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Linha rotulo="Carrinho original" valor={data.originalCartId ?? "—"} />
          <Linha rotulo="Carrinho operacional" valor={data.fulfillmentCartId ?? "—"} />
          <Linha rotulo="Pedido Oner" valor={data.providerOrderNumber ?? "—"} />
          <Linha rotulo="Venda (saleId)" valor={data.providerSaleId ?? "—"} />
          <Linha rotulo="Status Oner" valor={data.providerStatus ?? "—"} />
          <Linha rotulo="Localizador" valor={data.locator ?? "—"} />
          <Linha rotulo="Última sincronização" valor={dataHora(data.lastSyncAt)} />
          <Linha
            rotulo="Pagamento ao fornecedor"
            valor={data.providerPaymentStatus === "paid" ? "Fornecedor pago ✓" : (data.providerPaymentStatus ?? "—")}
          />
          <Linha
            rotulo="Na tela de pagamento da Oner"
            valor={rotuloTitularCartaoOner(pix ? "PIX" : "CARD")}
          />
        </div>

        <div className="grid gap-x-8 gap-y-1 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
          <Linha rotulo="Recebido do cliente" valor={brl(data.customerTotal)} />
          <Linha rotulo="Valor original Oner" valor={brl(data.providerOriginalTotal)} />
          <Linha rotulo="Valor líquido Oner" valor={brl(data.providerNetTotal)} />
          <Linha rotulo="Margem VIA AIR" valor={brl(data.margem)} />
          <Linha rotulo="Comissão original" valor={brl(data.commissionOriginal)} />
          <Linha rotulo="Comissão final" valor={brl(data.commissionFinal)} />
        </div>

        {data.bilhetes.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Bilhetes</p>
            {data.bilhetes.map((b, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {b.passenger_name ?? "Passageiro"} — {b.ticket_number ?? "—"} {b.status ? `(${b.status})` : ""}
              </p>
            ))}
          </div>
        )}

        {pix && (
          <div className="space-y-4 rounded-lg border border-dashed p-4">
            <p className="text-sm font-semibold">Preparação manual na Comprar Viagem</p>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="oner-cart">Carrinho operacional (novo carrinho Oner)</Label>
                <Input id="oner-cart" value={cartId} onChange={(e) => setCartId(e.target.value)} placeholder="Ex.: 789012" />
              </div>
              <Button onClick={() => salvarCarrinho.mutate(undefined as never)} disabled={!cartId.trim() || salvarCarrinho.isPending}>
                Salvar carrinho
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="oner-liquido">Valor líquido da Oner (comissão zerada)</Label>
                <Input id="oner-liquido" value={liquido} onChange={(e) => setLiquido(e.target.value)} placeholder="Ex.: 920,49" inputMode="decimal" />
              </div>
              <Button onClick={() => salvarComissao.mutate(undefined as never)} disabled={!liquido.trim() || salvarComissao.isPending}>
                Comissão zerada
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor="oner-f">Pedido F-… da Oner</Label>
                <Input id="oner-f" value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)} placeholder="F-123456" />
              </div>
              <Button onClick={() => salvarPedido.mutate(undefined as never)} disabled={!numeroPedido.trim() || salvarPedido.isPending}>
                Salvar pedido
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oner-brcode">Pix da Oner (copia e cola)</Label>
              <Textarea id="oner-brcode" rows={3} value={brcode} onChange={(e) => setBrcode(e.target.value)} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="oner-venc">Vencimento da cobrança</Label>
                  <Input id="oner-venc" type="datetime-local" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </div>
                <Button onClick={() => salvarPix.mutate(undefined as never)} disabled={!brcode.trim() || salvarPix.isPending}>
                  Salvar Pix Oner
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oner-notas">Observações da operação</Label>
              <Textarea id="oner-notas" rows={2} value={notas || (data.notas ?? "")} onChange={(e) => setNotas(e.target.value)} />
              <Button variant="outline" size="sm" onClick={() => salvarNotas.mutate(undefined as never)} disabled={salvarNotas.isPending}>
                Salvar observações
              </Button>
            </div>

            <div className="border-t pt-4">
              <Button
                className="w-full"
                disabled={!data.podeAutorizar || autorizar.isPending}
                onClick={() => setConfirmando(true)}
              >
                Autorizar pagamento
              </Button>
              {!data.podeAutorizar && data.motivosBloqueio.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {data.motivosBloqueio.map((m) => (
                    <li key={m}>• {m}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Linha do tempo</p>
          <ol className="space-y-1 border-l pl-4 text-sm">
            {data.carrinhos.map((c) => (
              <li key={c.id} className="text-muted-foreground">
                {PURPOSE_LABEL[c.purpose] ?? c.purpose}
                {c.cart_id ? ` — carrinho ${c.cart_id}` : ""} · {dataHora(c.created_at)}
              </li>
            ))}
            {data.linhaTempo.map((e) => (
              <li key={e.id} className="text-muted-foreground">
                {e.message ?? e.event_type} · {dataHora(e.created_at)}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Autorizar pagamento à Oner</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>Pedido/Carrinho Oner: {data.providerOrderNumber ?? data.fulfillmentCartId ?? "—"}</p>
                <p>Recebido do cliente: {brl(data.customerTotal)}</p>
                <p>Valor a pagar à Oner: {brl(data.providerNetTotal)}</p>
                <p>Margem VIA AIR: {brl(data.margem)}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                autorizar.mutate();
              }}
              disabled={autorizar.isPending}
            >
              Autorizar pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
