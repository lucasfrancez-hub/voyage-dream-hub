/**
 * Retorno do desafio 3D Secure (return_url da Stripe).
 *
 * A Stripe volta para cá com `payment_intent`; o backend confere o resultado
 * direto na Stripe e cancela a autorização de R$ 1,00.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { verificar3dsValidacao } from "@/lib/stripe/tres-ds.functions";

export const Route = createFileRoute("/reserva-3ds-retorno")({
  ssr: false,
  component: Retorno3DS,
  head: () => ({
    meta: [
      { title: "Verificação de cartão 3D Secure | VIA AIR" },
      {
        name: "description",
        content:
          "Retorno da autenticação 3D Secure do cartão usado na reserva VIA AIR.",
      },
      { property: "og:title", content: "Verificação de cartão 3D Secure | VIA AIR" },
      {
        property: "og:description",
        content: "Confirmação da autenticação 3D Secure do cartão da reserva.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Retorno3DS() {
  const verificarFn = useServerFn(verificar3dsValidacao);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [mensagem, setMensagem] = useState("Confirmando a autenticação com o banco...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentIntentId = params.get("payment_intent");
    const reservaId = params.get("reserva");
    if (!paymentIntentId || !reservaId) {
      setEstado("erro");
      setMensagem("Retorno inválido: não identificamos a reserva desta autenticação.");
      return;
    }
    verificarFn({ data: { reservaId, paymentIntentId } })
      .then((res) => {
        if (res.ok) {
          setEstado("ok");
          setMensagem("Cartão autenticado. Pode fechar esta janela e voltar à reserva.");
        } else {
          setEstado("erro");
          setMensagem(res.erro ?? "Não foi possível confirmar a identidade do portador.");
        }
      })
      .catch((e: unknown) => {
        setEstado("erro");
        setMensagem(e instanceof Error ? e.message : "Erro ao confirmar a autenticação.");
      });
  }, [verificarFn]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Verificação de segurança</h1>
        <div className="mt-6 flex justify-center">
          {estado === "carregando" ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : estado === "ok" ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          ) : (
            <XCircle className="h-8 w-8 text-destructive" />
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{mensagem}</p>
      </section>
    </main>
  );
}
