/** Tipos compartilhados (client-safe) do pagamento de passaporte via InfinitePay. */
export type PassportPaymentRow = {
  id: string;
  passportRequestId: string;
  provider: string;
  orderNsu: string;
  invoiceSlug: string | null;
  transactionNsu: string | null;
  amount: number;
  paidAmount: number | null;
  installments: number | null;
  captureMethod: string | null;
  receiptUrl: string | null;
  checkoutUrl: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type ConfirmacaoResultado = {
  status: string;
  paid: boolean;
  amount: number | null;
  installments: number | null;
  captureMethod: string | null;
  receiptUrl: string | null;
  motivo?: string;
};
