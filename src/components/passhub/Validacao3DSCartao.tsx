/**
 * Validação de cartão por 3D Secure (Stripe).
 *
 * Autoriza R$ 1,00 temporariamente (captura manual), exige o desafio do banco
 * e cancela a autorização em seguida. Número do cartão e CVV são digitados
 * apenas dentro do Payment Element da Stripe — nunca passam pelo nosso sistema.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import {
  criar3dsValidacao,
  situacao3dsReserva,
  stripeChavePublicavel,
  verificar3dsValidacao,
} from "@/lib/stripe/tres-ds.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const dataHora = (valor: string | null) => {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const bandeira = (b: string | null) => (b ? b.toUpperCase() : "CARTÃO");

function FormularioCartao({
  reservaId,
  onConcluido,
}: {
  reservaId: string;
  onConcluido: (aprovado: boolean) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const verificarFn = useServerFn(verificar3dsValidacao);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const validar = async () => {
    if (!stripe || !elements) return;
    setProcessando(true);
    setErro(null);
    try {
      const retorno = `${window.location.origin}/reserva-3ds-retorno?reserva=${encodeURIComponent(reservaId)}`;
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: retorno },
        redirect: "if_required",
      });

      if (error) {
        const msg =
          error.type === "card_error" || error.type === "validation_error"
            ? (error.message ?? "Cartão recusado.")
            : "Não foi possível concluir a autenticação. Tente novamente ou use outro cartão.";
        setErro(msg);
        onConcluido(false);
        return;
      }
      if (!paymentIntent) {
        setErro("A autenticação foi interrompida. Tente novamente.");
        onConcluido(false);
        return;
      }

      // Nunca confiamos só no status do PaymentIntent: o backend confere na Stripe.
      const res = await verificarFn({ data: { reservaId, paymentIntentId: paymentIntent.id } });
      if (res.ok) {
        toast.success("Cartão autenticado — liberado para emissão");
        onConcluido(true);
      } else {
        setErro(res.erro ?? "Não foi possível confirmar a identidade do portador.");
        onConcluido(false);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado na validação.");
      onConcluido(false);
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {erro ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <Button className="w-full" disabled={!stripe || processando} onClick={validar}>
        {processando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        VALIDAR CARTÃO
      </Button>
    </div>
  );
}

export function Validacao3DSCartao({ reservaId }: { reservaId: string }) {
  const chaveFn = useServerFn(stripeChavePublicavel);
  const criarFn = useServerFn(criar3dsValidacao);
  const situacaoFn = useServerFn(situacao3dsReserva);

  const [aberto, setAberto] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  const chave = useQuery({ queryKey: ["stripe-pk"], queryFn: () => chaveFn() });
  const situacao = useQuery({
    queryKey: ["3ds-situacao", reservaId],
    queryFn: () => situacaoFn({ data: { reservaId } }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const pk = chave.data?.chave;
    if (pk && !stripePromise) setStripePromise(loadStripe(pk));
  }, [chave.data?.chave, stripePromise]);

  const iniciar = useMutation({
    mutationFn: () => criarFn({ data: { reservaId } }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      setClientSecret(res.clientSecret ?? null);
      setAberto(true);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a validação"),
  });

  const s = situacao.data;
  const opcoes = useMemo(
    () =>
      clientSecret
        ? ({ clientSecret, appearance: { theme: "night" as const } } as const)
        : undefined,
    [clientSecret],
  );

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        className="w-full border-primary/50 text-primary hover:bg-primary/10"
        disabled={iniciar.isPending || !chave.data?.chave}
        onClick={() => iniciar.mutate()}
      >
        {iniciar.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="mr-2 h-4 w-4" />
        )}
        VALIDAR CARTÃO COM 3DS
      </Button>
      {!chave.data?.chave && !chave.isLoading ? (
        <p className="text-xs text-muted-foreground">
          Cadastre a chave publicável da Stripe para habilitar a validação.
        </p>
      ) : null}

      {s?.liberado ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          <p className="font-semibold text-emerald-500">VERIFICAÇÃO DO CARTÃO</p>
          <p className="mt-2">
            Cartão: {bandeira(s.bandeira)} •••• {s.final ?? "----"}
          </p>
          <p>3D Secure: AUTENTICADO</p>
          <p>Autenticado em: {dataHora(s.autenticadoEm)}</p>
          <p>Validade: {dataHora(s.expiraEm)}</p>
          <p>Autorização temporária: R$ 1,00</p>
          <p>Captura: NÃO</p>
          <p>Status da autorização: CANCELADA</p>
          <p className="mt-2 flex items-center gap-2 font-semibold text-emerald-500">
            <CheckCircle2 className="h-4 w-4" /> LIBERADO PARA EMISSÃO
          </p>
        </div>
      ) : s?.expirado ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-500">
            <AlertTriangle className="h-4 w-4" /> VALIDAÇÃO 3DS EXPIRADA
          </p>
          <p className="mt-1 text-muted-foreground">
            A validação vale 15 minutos. Faça uma nova autenticação para liberar a emissão.
          </p>
        </div>
      ) : s?.status ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-semibold text-destructive">CARTÃO NÃO AUTENTICADO</p>
          <p className="mt-1 text-muted-foreground">
            Não foi possível confirmar a identidade do portador através do 3D Secure.
          </p>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => iniciar.mutate()}
            disabled={iniciar.isPending}
          >
            TENTAR OUTRO CARTÃO
          </Button>
        </div>
      ) : null}

      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) {
            setClientSecret(null);
            situacao.refetch();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verificação de segurança</DialogTitle>
            <DialogDescription>
              Para confirmar a identidade do portador do cartão, será realizada uma autorização
              temporária de R$ 1,00. O valor não será capturado e a autorização será cancelada
              após a validação.
            </DialogDescription>
          </DialogHeader>
          {stripePromise && opcoes ? (
            <Elements stripe={stripePromise} options={opcoes}>
              <FormularioCartao
                reservaId={reservaId}
                onConcluido={(aprovado) => {
                  situacao.refetch();
                  if (aprovado) setAberto(false);
                }}
              />
            </Elements>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
