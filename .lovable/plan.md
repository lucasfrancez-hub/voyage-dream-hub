## Objetivo
Gerar automaticamente **Recibo + Contrato** (PDF único no formato do modelo VIA AIR anexado) para qualquer pedido, puxando dados do pagador, serviços, valores e forma de pagamento já cadastrados no pedido. E garantir que esses dados do pagador sejam coletados também no checkout do pacote pronto e no link Pix — hoje só o link de boleto pede endereço completo.

## Escopo

### 1. Coletar dados do pagador em todos os checkouts
Hoje só o **link-boleto** pede endereço/CPF/telefone. Vou padronizar os mesmos campos em:
- `pacotes.$slug.checkout.tsx` (checkout do pacote pronto — Pix, Cartão)
- `admin.link-pagamento.tsx` (seguro/personalizado)
- `admin.link-cartao-simples.tsx` (cartão simples)

Campos: nome completo, CPF/CNPJ, e-mail, telefone, CEP, endereço, número, bairro, cidade, UF. Todos salvos em `orders.payer_*` (novas colunas) e/ou no snapshot para servirem à geração de contrato.

### 2. Contrato/Recibo automático (PDF)
Novo módulo `src/lib/contract-pdf.ts` que monta o PDF (via `pdf-lib` — funciona no Worker) espelhando o modelo:

- **Cabeçalho fixo VIA AIR** — CNPJ, endereço, telefone, e-mail, logo.
- **Recibo (pág. 1)** — "RECIBO - VENDA {order_number} - {data}", bloco "Pagante" com todos os dados do pagador, texto legal com valor por extenso.
- **Serviços** condicionais pelo que o pedido tem:
  - Se houver `order_items.kind='flight'`: tabela **Passagem Aérea** (Cia + Localizador), tabela de voos (segmentos ida/volta), tabela de passageiros (nº bilhete + tarifa + taxas + total).
  - Se houver `kind='hotel'`: tabela **Hospedagem** (hotel, check-in/out, noites, regime, hóspedes).
  - Se houver `kind='other'`: tabela **Outros serviços** (título, fornecedor, valor).
- **Resumo financeiro** — Produtos / Abatimentos / Taxas / Total (a partir de `order_item_financials`).
- **Pagamentos** — bloco "Pagamento para o Fornecedor" listando cada linha de `order_payments` (método + parcelas + valor + autorização quando existir).
- **Contrato (págs. 2–4)** — texto integral das Condições Gerais do modelo, com cabeçalho "VENDA Nº / CONTRATADA / CONTRATANTE" em cada página.
- Rodapé "Paranavaí, {data} - {hora}" + espaço para assinatura do contratante.

### 3. Botões que já existem passam a funcionar
No `admin.pedidos.$id.tsx`:
- **Imprimir → Contrato**: gera o PDF e abre em nova aba.
- **Imprimir → Recibo**: gera só a página 1.
- **Enviar e-mail → Contrato**: anexa o PDF ao e-mail do pagador (usa a infra de e-mail já configurada).
- Também vou expor um botão "Baixar contrato" na aba **Contrato**.

## Detalhes técnicos

```text
src/
├── lib/
│   └── contract-pdf.ts          ← montagem do PDF (pdf-lib, roda no client)
├── routes/
│   ├── admin.pedidos.$id.tsx    ← ligar botões Imprimir/Enviar
│   ├── admin.link-boleto.tsx    ← já pede endereço; padronizar salvamento
│   ├── admin.link-pagamento.tsx ← + campos endereço
│   ├── admin.link-cartao-simples.tsx ← + campos endereço
│   └── pacotes.$slug.checkout.tsx ← + campos endereço (Pix/Cartão)
```

Migração (será enviada em call separada para aprovação):
- `orders`: colunas `payer_full_name`, `payer_cpf`, `payer_email`, `payer_phone`, `payer_zip`, `payer_address`, `payer_number`, `payer_district`, `payer_city`, `payer_state`.
- Preenchidas pelos checkouts; fallback para `orders.full_name/email` já existentes quando ausentes.

Texto das Condições Gerais: hard-coded a partir do modelo anexado (idêntico ao PDF que você mandou).

## Fora deste escopo (fica para depois)
- Assinatura digital / DocuSign (já é outro item da lista).
- Envio automático agendado (por ora, só sob demanda pelos botões).
- Personalização das cláusulas via UI (o texto vem do modelo; se quiser editar depois, criamos um editor).

## Confirmações rápidas
1. **Logo VIA AIR**: uso a que já está no projeto?
2. **E-mail de destino** do "Enviar → Contrato": pagador (payer_email) ou cliente do pedido (`orders.full_name/email`)?
3. **Pix no checkout do pacote pronto**: quer que eu já ative Pix como opção de pagamento no `pacotes.$slug.checkout.tsx`, ou por enquanto só coletar endereço e manter as formas atuais?
