import { X } from "lucide-react";

export function TermsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#7a2f0a] text-white px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/80 font-semibold">
              Termos e política de cancelamento
            </div>
            <div className="font-display font-bold text-white text-lg leading-tight mt-0.5">
              Condições Gerais — Via Air
            </div>
            <div className="text-xs text-white/90 mt-1">
              Via Air Agência e Representações Ltda
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-white/20 transition text-white shrink-0"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm leading-relaxed text-foreground/90">
          <Section n="1" title="Responsabilidade do Contratante e Passageiros">
            <P>
              <B>1.1.</B> No caso de o CONTRATANTE (pagante) e o PASSAGEIRO não serem a mesma
              pessoa, o pagante compromete-se a informar todos os passageiros sobre as
              presentes Condições Gerais, sendo solidariamente responsável por qualquer ato
              praticado por estes.
            </P>
            <P>
              <B>1.2.</B> O CONTRATANTE declara-se ciente de que é responsável por verificar as
              condições contratuais, bem como repassar as informações a todos os passageiros
              envolvidos na viagem.
            </P>
          </Section>

          <Section n="2" title="Serviços Contratados">
            <P>
              <B>2.1.</B> Consideram-se "serviços inclusos" apenas aqueles expressamente
              descritos no contrato/proposta e nos vouchers oficiais emitidos pela Via Air.
            </P>
            <P>
              <B>2.2.</B> Informações verbais, sugestões de passeios opcionais ou qualquer
              referência fora do contrato não devem ser consideradas inclusas.
            </P>
          </Section>

          <Section n="3" title="Documentação de Viagem">
            <P>
              <B>3.1.</B> É de inteira responsabilidade dos passageiros portar os documentos
              exigidos (RG, Passaporte, vistos, vacinas, autorizações para menores etc.),
              conforme legislação brasileira e normas do país de destino.
            </P>
            <P>
              <B>3.2.</B> A Via Air não se responsabiliza por negativa de embarque, deportação
              ou problemas de imigração, não havendo reembolso em tais hipóteses.
            </P>
            <P>
              <B>3.3.</B> Todos os bilhetes, vouchers e documentos devem ser conferidos
              imediatamente após recebimento pelo CONTRATANTE/PASSAGEIRO.
            </P>
          </Section>

          <Section n="4" title="Seguro Viagem">
            <P>
              <B>4.1.</B> O CONTRATANTE declara estar ciente da importância de contratar cartão
              de assistência/seguro viagem, sendo responsável por adquiri-lo caso não esteja
              incluso no pacote.
            </P>
            <P>
              <B>4.2.</B> Quando incluso, as coberturas poderão ser ampliadas mediante
              solicitação prévia e pagamento adicional.
            </P>
          </Section>

          <Section n="5" title="Alterações, Cancelamentos, Reembolsos e No-Show">
            <P>
              <B>5.1.</B> Qualquer alteração, cancelamento, solicitação de crédito ou
              transferência deverá ser formalizada por escrito, diretamente junto à Via Air,
              com antecedência mínima de 48 (quarenta e oito) horas úteis da data da viagem.
            </P>
            <P>
              <B>5.2.</B> Em caso de não comparecimento (no-show), o passageiro fica ciente de
              que a companhia aérea/hotel/cruzeiro cancelará automaticamente os demais serviços
              contratados, sem direito a reembolso.
            </P>
            <P>
              <B>5.3.</B> Os reembolsos seguirão exclusivamente as regras e prazos de cada
              fornecedor (companhias aéreas, hotéis, cruzeiros etc.).
            </P>
            <P>
              <B>5.4.</B> Independentemente da política do fornecedor, a Via Air aplicará taxa
              administrativa de 25% (vinte e cinco por cento) sobre o valor efetivamente
              reembolsado.
            </P>
            <P>
              <B>5.5.</B> Reembolsos somente serão processados após o repasse dos valores pelos
              fornecedores, não cabendo à Via Air antecipação de valores.
            </P>
            <P>
              <B>5.6.</B> Passagens emitidas em tarifas promocionais, não reembolsáveis ou em
              voos fretados poderão não ter qualquer valor devolvido, conforme regras da
              companhia aérea ou operadora.
            </P>
          </Section>

          <Section n="6" title="Direito de Arrependimento">
            <P>
              <B>6.1.</B> Nos termos do art. 49 do Código de Defesa do Consumidor, o
              CONTRATANTE poderá exercer o direito de arrependimento em até 24 (vinte e quatro)
              horas após a emissão da passagem aérea, desde que a compra tenha sido realizada
              com antecedência mínima de 7 (sete) dias em relação à data do voo.
            </P>
            <P>
              <B>6.2.</B> Hospedagens (hotéis, pousadas, resorts), pacotes e demais serviços
              turísticos <B>não</B> estão sujeitos ao direito de arrependimento, seguindo
              exclusivamente as políticas de cancelamento de cada fornecedor.
            </P>
          </Section>

          <Section n="7" title="Pagamentos e Chargeback">
            <P>
              <B>7.1.</B> Pagamentos via cartão de crédito estão sujeitos à aprovação da
              operadora.
            </P>
            <P>
              <B>7.2.</B> Em caso de contestação de pagamento (chargeback), mesmo após a
              utilização dos serviços contratados, o CONTRATANTE permanecerá responsável pelo
              valor integral, devendo ressarcir imediatamente a Via Air.
            </P>
            <P>
              <B>7.3.</B> A inadimplência em qualquer modalidade de pagamento autoriza a Via
              Air a suspender reservas e aplicar multa de 2% e juros de 1% a.m., correção
              monetária pelo IGP-M, além de honorários advocatícios e custas judiciais, se
              necessário.
            </P>
          </Section>

          <Section n="8" title="Bagagens">
            <P>
              <B>8.1.</B> A franquia de bagagem segue regras específicas de cada companhia
              aérea.
            </P>
            <P>
              <B>8.2.</B> A maioria das tarifas não inclui bagagem despachada, devendo ser
              adquirida antecipadamente pelo passageiro.
            </P>
            <P>
              <B>8.3.</B> Recomenda-se que objetos de valor (dinheiro, eletrônicos, documentos,
              remédios etc.) sejam transportados na bagagem de mão, observadas as restrições da
              companhia aérea.
            </P>
            <P>
              <B>8.4.</B> A Via Air não se responsabiliza por extravio, danos, atrasos ou perda
              de bagagem, tampouco por objetos deixados em seu interior. Tais ocorrências são
              de responsabilidade exclusiva da companhia aérea transportadora, devendo o
              passageiro registrar o R.I.B. (Registro de Irregularidade de Bagagem) ainda no
              aeroporto.
            </P>
          </Section>

          <Section n="9" title="Companhias Aéreas e Serviços de Transporte">
            <P>
              <B>9.1.</B> A Via Air atua exclusivamente como intermediária na venda dos
              serviços de transporte aéreo, não sendo responsável por atrasos, cancelamentos,
              alterações de horários, mudanças de aeronave, overbooking, reacomodação em outros
              voos ou pernoites decorrentes de decisão da companhia aérea.
            </P>
            <P>
              <B>9.2.</B> Assistência material (alimentação, hospedagem, transporte) em casos
              de atraso ou cancelamento é obrigação da companhia aérea, conforme Resolução ANAC
              nº 400.
            </P>
            <P>
              <B>9.3.</B> Eventuais indenizações por danos morais ou materiais decorrentes da
              operação aérea devem ser pleiteadas diretamente junto à companhia aérea
              responsável.
            </P>
          </Section>

          <Section n="10" title="Condições Gerais de Viagem">
            <P>
              <B>10.1.</B> Comparecer com antecedência mínima de 2h para voos nacionais e 4h
              para voos internacionais.
            </P>
            <P>
              <B>10.2.</B> Hotéis operam com check-in geralmente às 14h e check-out às 11h.
            </P>
            <P>
              <B>10.3.</B> Pacotes em voos fretados estão sujeitos a alterações de horários,
              companhias e aeroportos, não havendo reembolso por essas mudanças.
            </P>
            <P>
              <B>10.4.</B> Viagens rodoviárias dependem de número mínimo de participantes; caso
              não haja, a viagem poderá ser cancelada com reembolso integral.
            </P>
            <P>
              <B>10.5.</B> Em viagens a negócios, congressos e compromissos com horário fixo,
              recomenda-se embarque com no mínimo 2 dias de antecedência.
            </P>
            <P>
              <B>10.6.</B> Acomodação em apartamentos ou cabines seguirá disponibilidade do
              fornecedor, podendo ocorrer em camas de solteiro, casal, beliche, sofá-cama etc.
            </P>
          </Section>

          <Section n="11" title="Compras e Taxas Extras">
            <P>
              <B>11.1.</B> Alguns hotéis e resorts podem cobrar taxas adicionais ("resort fee",
              "fee" ou similares), não inclusas no pacote, a serem pagas diretamente pelo
              hóspede no destino.
            </P>
            <P>
              <B>11.2.</B> Em viagens internacionais, é responsabilidade do passageiro portar
              moeda estrangeira ou meios de pagamento aceitos no destino.
            </P>
          </Section>

          <Section n="12" title="Responsabilidades e Ocorrências">
            <P>
              <B>12.1.</B> A Via Air, fornecedores, hotéis e companhias aéreas não se
              responsabilizam por roubos, furtos, perdas de documentos ou bens pessoais durante
              a viagem.
            </P>
            <P>
              <B>12.2.</B> Em caso de ocorrência, o passageiro deverá registrar boletim de
              ocorrência junto às autoridades locais.
            </P>
          </Section>

          <Section n="13" title="Eventos com Descontos">
            <P>
              <B>13.1.</B> Passageiros que adquirirem ingressos com desconto (estudantes,
              aposentados, terceira idade etc.) deverão apresentar os documentos comprobatórios
              na bilheteria.
            </P>
            <P>
              <B>13.2.</B> Caso não apresentem, será de responsabilidade do
              CONTRATANTE/PASSAGEIRO pagar a diferença do ingresso diretamente ao organizador
              do evento.
            </P>
          </Section>

          <Section n="14" title="Eleição de Foro">
            <P>
              <B>14.1.</B> Para dirimir quaisquer dúvidas decorrentes deste contrato, as partes
              elegem o foro da comarca da sede da Via Air, com renúncia a qualquer outro, por
              mais privilegiado que seja.
            </P>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display font-bold text-base text-foreground mb-2">
        {n}. {title}
      </h3>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}
