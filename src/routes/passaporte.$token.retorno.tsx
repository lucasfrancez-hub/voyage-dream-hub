import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldCheck } from "lucide-react";
import { confirmarCheckoutPassaporte } from "@/lib/passaporte-infinitepay.functions";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/passaporte/$token/retorno")({
  head: () => ({
    meta: [
      { title: "Confirmação de pagamento do passaporte | VIA AIR" },
      {
        name: "description",
        content:
          "Estamos confirmando o pagamento da sua solicitação de renovação de passaporte com a VIA AIR.",
      },
      { property: "og:title", content: "Confirmação de pagamento do passaporte | VIA AIR" },
      {
        property: "og:description",
        content: "Acompanhe a confirmação do pagamento da sua solicitação de passaporte.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RetornoPagamento,
});

type Estado =
  | { fase: "verificando" }
  | {
      fase: "pago";
      valor: number | null;
      parcelas: number | null;
      comprovante: string | null;
    }
  | { fase: "pendente"; motivo?: string }
  | { fase: "erro"; motivo: string };

function RetornoPagamento() {
  const { token } = Route.useParams();
  const confirmFn = useServerFn(confirmarCheckoutPassaporte);
  const [estado, setEstado] = useState<Estado>({ fase: "verificando" });
  const tentativas = useRef(0);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.search);
    const dados = {
      token,
      orderNsu: params.get("order_nsu"),
      transactionNsu: params.get("transaction_nsu"),
      slug: params.get("slug") ?? params.get("invoice_slug"),
      receiptUrl: params.get("receipt_url"),
    };

    async function verificar() {
      try {
        const r = (await confirmFn({ data: dados })) as {
          paid: boolean;
          status: string;
          amount: number | null;
          installments: number | null;
          receiptUrl: string | null;
          motivo?: string;
        };
        if (!alive) return;
        if (r.paid) {
          setEstado({
            fase: "pago",
            valor: r.amount != null ? r.amount / 100 : null,
            parcelas: r.installments,
            comprovante: r.receiptUrl,
          });
          return;
        }
        if (r.status === "ERRO") {
          setEstado({ fase: "erro", motivo: r.motivo ?? "Não foi possível validar o pagamento." });
          return;
        }
        tentativas.current += 1;
        if (tentativas.current < 6) {
          setTimeout(() => void verificar(), 4000);
        } else {
          setEstado({ fase: "pendente", motivo: r.motivo });
        }
      } catch (e) {
        if (!alive) return;
        setEstado({
          fase: "erro",
          motivo: e instanceof Error ? e.message : "Não foi possível verificar o pagamento.",
        });
      }
    }

    void verificar();
    return () => {
      alive = false;
    };
  }, [confirmFn, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/40 via-background to-background p-5">
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 text-center shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
          VIA AIR
        </span>

        {estado.fase === "verificando" ? (
          <>
            <Loader2 className="mx-auto mt-5 h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 text-lg font-semibold">Verificando seu pagamento…</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Isso pode levar alguns segundos. Não feche esta página.
            </p>
          </>
        ) : null}

        {estado.fase === "pago" ? (
          <>
            <div className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Pagamento confirmado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {estado.valor != null ? formatBRL(estado.valor) : "Pagamento"}
              {estado.parcelas && estado.parcelas > 1 ? ` em ${estado.parcelas}x` : " à vista"} no
              cartão de crédito.
            </p>
            {estado.comprovante ? (
              <a
                href={estado.comprovante}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm font-medium text-primary underline"
              >
                Ver comprovante
              </a>
            ) : null}
          </>
        ) : null}

        {estado.fase === "pendente" ? (
          <>
            <ShieldCheck className="mx-auto mt-5 h-10 w-10 text-primary" />
            <h1 className="mt-4 text-lg font-semibold">Pagamento em processamento</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Assim que a operadora confirmar, atualizamos sua solicitação automaticamente. Você
              pode acompanhar por esta página.
            </p>
          </>
        ) : null}

        {estado.fase === "erro" ? (
          <>
            <AlertTriangle className="mx-auto mt-5 h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-lg font-semibold">Não conseguimos confirmar</h1>
            <p className="mt-1 text-sm text-muted-foreground">{estado.motivo}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Se o valor foi debitado, fale com a VIA AIR informando seu protocolo.
            </p>
          </>
        ) : null}

        <Button asChild variant="outline" className="mt-6 w-full">
          <Link to="/passaporte/$token" params={{ token }}>
            Voltar para a solicitação
          </Link>
        </Button>
      </div>
    </div>
  );
}
