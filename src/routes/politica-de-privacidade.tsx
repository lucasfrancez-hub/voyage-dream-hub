import { createFileRoute } from "@tanstack/react-router";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/politica-de-privacidade")({
  component: PrivacyPolicyPage,
  head: () => ({
    meta: [
      { title: "Política de Privacidade — VIA AIR" },
      { name: "description", content: "Como a VIA AIR coleta, utiliza e protege os dados pessoais dos clientes na plataforma pedidos.viaair.tur.br e no atendimento via WhatsApp." },
      { property: "og:title", content: "Política de Privacidade — VIA AIR" },
      { property: "og:description", content: "Política de Privacidade da VIA AIR — LGPD, WhatsApp Business e tratamento de dados." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://pedidos.viaair.tur.br/politica-de-privacidade" },
    ],
    links: [{ rel: "canonical", href: "https://pedidos.viaair.tur.br/politica-de-privacidade" }],
  }),
});

function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <a href="/" className="mb-8 inline-block">
        <img src={viaAirLogo.url} alt="VIA AIR" className="h-10 w-auto" />
      </a>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">Política de Privacidade</h1>
      <p className="mb-8 text-sm text-slate-500">Última atualização: 14 de julho de 2026</p>

      <section className="prose prose-slate space-y-6 text-[15px] leading-relaxed">
        <p>
          Esta Política descreve como a <strong>VIA AIR VIAGENS E TURISMO LTDA</strong>{" "}
          (CNPJ 12.345.678/0001-90), doravante "VIA AIR", coleta, utiliza, armazena e protege
          dados pessoais de clientes e visitantes da plataforma <strong>pedidos.viaair.tur.br</strong>{" "}
          e do atendimento via WhatsApp Business API, em conformidade com a Lei Geral de Proteção
          de Dados (Lei 13.709/2018 — LGPD).
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">1. Dados que coletamos</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Cadastro:</strong> nome completo, CPF/passaporte, data de nascimento, e-mail, telefone e endereço.</li>
          <li><strong>Viagem:</strong> destino, datas, preferências de voo/hotel, número de passageiros, documentos de viagem.</li>
          <li><strong>Pagamento:</strong> dados do cartão (tokenizados e armazenados criptografados), comprovantes de PIX/boleto. Nunca armazenamos o CVV.</li>
          <li><strong>Comunicação:</strong> mensagens trocadas via WhatsApp, e-mail e telefone, incluindo áudio e imagens quando enviados pelo cliente.</li>
          <li><strong>Navegação:</strong> endereço IP, tipo de navegador, páginas visitadas e cookies essenciais para o funcionamento da plataforma.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">2. Como usamos os dados</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Emissão e gestão de reservas de voos, hotéis e pacotes turísticos.</li>
          <li>Processamento de pagamentos e emissão de recibos/notas fiscais.</li>
          <li>Comunicação sobre pedidos, alterações de voo, check-in e emergências de viagem.</li>
          <li>Atendimento ao cliente por atendentes humanos e assistente virtual (IA) da VIA AIR.</li>
          <li>Cumprimento de obrigações legais (Receita Federal, ANAC, órgãos consulares).</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">3. WhatsApp Business API</h2>
        <p>
          Utilizamos a plataforma oficial do WhatsApp Business (Meta) para atendimento. Ao iniciar
          uma conversa conosco pelo WhatsApp, você autoriza que a VIA AIR receba, armazene e
          responda suas mensagens dentro da plataforma interna de CRM. Nossas respostas podem ser
          geradas por atendente humano ou assistente de inteligência artificial. Você pode
          solicitar a qualquer momento o encerramento da conversa ou o atendimento exclusivamente
          humano enviando "falar com atendente".
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">4. Compartilhamento com terceiros</h2>
        <p>Compartilhamos apenas o mínimo necessário para prestar o serviço, com:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Companhias aéreas, redes hoteleiras e operadoras turísticas para emissão das reservas.</li>
          <li>Instituições financeiras e processadores de pagamento (Itaú, Stripe, Paddle).</li>
          <li>Meta Platforms Inc. — apenas o conteúdo enviado por WhatsApp, conforme os termos do WhatsApp Business.</li>
          <li>Provedores de infraestrutura em nuvem (Cloudflare, Supabase, Lovable).</li>
          <li>Autoridades públicas, quando exigido por lei ou ordem judicial.</li>
        </ul>
        <p>Não vendemos, alugamos ou cedemos dados pessoais para fins de marketing de terceiros.</p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">5. Armazenamento e segurança</h2>
        <p>
          Dados são armazenados em servidores no Brasil e nos Estados Unidos, com criptografia em
          trânsito (TLS 1.2+) e em repouso. Dados sensíveis (cartão, documentos) são criptografados
          com chaves gerenciadas separadamente. O acesso interno é restrito a colaboradores
          autorizados, com registro de auditoria.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">6. Retenção</h2>
        <p>
          Mantemos os dados enquanto o cliente estiver ativo e por até <strong>5 anos</strong> após
          o último contrato, conforme obrigações fiscais e do Código de Defesa do Consumidor. Dados
          de conversas do WhatsApp são retidos por <strong>24 meses</strong> para histórico de
          atendimento.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">7. Seus direitos (LGPD)</h2>
        <p>Você pode a qualquer momento solicitar:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Confirmação da existência e acesso aos seus dados;</li>
          <li>Correção de dados incompletos ou desatualizados;</li>
          <li>Anonimização, bloqueio ou eliminação de dados;</li>
          <li>Portabilidade dos dados a outro fornecedor;</li>
          <li>Revogação de consentimento.</li>
        </ul>
        <p>
          Para exercer seus direitos, envie e-mail para{" "}
          <a href="mailto:privacidade@viaair.tur.br" className="text-[#F26B1F] hover:underline">
            privacidade@viaair.tur.br
          </a>
          . Responderemos em até 15 dias.
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">8. Exclusão de dados</h2>
        <p>
          Para solicitar a exclusão completa dos seus dados pessoais, acesse{" "}
          <a href="/exclusao-de-dados" className="text-[#F26B1F] hover:underline">
            pedidos.viaair.tur.br/exclusao-de-dados
          </a>{" "}
          ou envie um e-mail para privacidade@viaair.tur.br com o assunto "Exclusão de dados".
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">9. Contato do Encarregado (DPO)</h2>
        <p>
          <strong>VIA AIR Viagens e Turismo Ltda</strong>
          <br />
          E-mail: <a href="mailto:privacidade@viaair.tur.br" className="text-[#F26B1F] hover:underline">privacidade@viaair.tur.br</a>
          <br />
          WhatsApp: informado no site
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-900">10. Alterações desta política</h2>
        <p>
          Podemos atualizar esta Política periodicamente. Alterações relevantes serão comunicadas
          por e-mail ou aviso na plataforma. A versão vigente estará sempre disponível nesta página.
        </p>
      </section>
    </main>
  );
}
