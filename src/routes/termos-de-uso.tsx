import { createFileRoute } from "@tanstack/react-router";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/termos-de-uso")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Termos de Uso — VIA AIR" },
      { name: "description", content: "Termos e condições de uso da plataforma VIA AIR e do atendimento via WhatsApp." },
      { property: "og:title", content: "Termos de Uso — VIA AIR" },
      { property: "og:description", content: "Termos e condições de uso da plataforma VIA AIR." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://pedidos.viaair.tur.br/termos-de-uso" },
    ],
    links: [{ rel: "canonical", href: "https://pedidos.viaair.tur.br/termos-de-uso" }],
  }),
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <a href="/" className="mb-8 inline-block">
        <img src={viaAirLogo.url} alt="VIA AIR" className="h-10 w-auto" />
      </a>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">Termos de Uso</h1>
      <p className="mb-8 text-sm text-slate-500">Última atualização: 14 de julho de 2026</p>

      <section className="space-y-6 text-[15px] leading-relaxed">
        <p>
          Ao utilizar a plataforma <strong>pedidos.viaair.tur.br</strong> ou se comunicar com a
          VIA AIR pelo WhatsApp Business, você declara ter lido e concordado com os presentes
          termos e com a{" "}
          <a href="/politica-de-privacidade" className="text-[#F26B1F] hover:underline">
            Política de Privacidade
          </a>.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">1. Objeto</h2>
        <p>
          A VIA AIR é uma agência de viagens registrada no CADASTUR que intermedia a venda de
          passagens aéreas, hospedagens, pacotes turísticos, seguros e demais serviços de viagem.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">2. Cadastro</h2>
        <p>
          O cliente é responsável pela veracidade dos dados informados. Reservamos o direito de
          recusar cadastros com informações incorretas ou incompletas.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">3. Cotações e reservas</h2>
        <p>
          Cotações têm validade e disponibilidade sujeitas à confirmação pelo fornecedor
          (companhia aérea, hotel etc.). Preços podem sofrer alteração até a efetiva emissão.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">4. Pagamento</h2>
        <p>
          Aceitamos cartão de crédito (com parcelamento), PIX e boleto. A reserva só é efetivada
          após a confirmação do pagamento. Valores parcelados podem sofrer juros conforme a
          modalidade escolhida.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">5. Cancelamento e reembolso</h2>
        <p>
          Regras de cancelamento seguem as políticas de cada fornecedor (companhia aérea, hotel).
          Taxas administrativas da VIA AIR podem ser aplicadas conforme o contrato específico do
          serviço.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">6. Atendimento por WhatsApp</h2>
        <p>
          Nosso atendimento pelo WhatsApp Business API pode ser realizado por atendentes humanos
          ou assistente de inteligência artificial. As informações fornecidas pela IA têm caráter
          orientativo — cotações e contratos são sempre confirmados por um consultor humano antes
          da emissão.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">7. Responsabilidades</h2>
        <p>
          A VIA AIR atua como intermediária. Não nos responsabilizamos por: atrasos, cancelamentos
          ou overbooking de voos; alterações de itinerário decidas pelo fornecedor; problemas em
          hospedagens não decorrentes de erro na reserva; danos causados por caso fortuito ou
          força maior.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">8. Documentação de viagem</h2>
        <p>
          É responsabilidade do passageiro portar documentação válida (passaporte, visto, vacinas)
          para o destino. A VIA AIR orienta sobre exigências, mas não se responsabiliza por
          embarques negados por falta de documentação.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">9. Foro</h2>
        <p>
          Fica eleito o foro da comarca da sede da VIA AIR para dirimir quaisquer controvérsias,
          renunciando as partes a qualquer outro, por mais privilegiado que seja.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">10. Contato</h2>
        <p>
          E-mail:{" "}
          <a href="mailto:contato@viaair.tur.br" className="text-[#F26B1F] hover:underline">
            contato@viaair.tur.br
          </a>
        </p>
      </section>
    </main>
  );
}
