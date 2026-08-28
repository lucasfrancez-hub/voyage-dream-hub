import { z } from "zod";

export const PASSAPORTE_PRECO_PIX = 285;
export const PASSAPORTE_PRECO_CARTAO = 320;
export const PASSAPORTE_MAX_PARCELAS = 10;

export const passportStepSchema = z.object({
  token: z.string().min(6).max(64),
  dadosPessoais: z.record(z.string(), z.any()).optional(),
  documentos: z.record(z.string(), z.any()).optional(),
  complementares: z.record(z.string(), z.any()).optional(),
});

export const passportPaymentSchema = z.object({
  token: z.string().min(6).max(64),
  metodo: z.enum(["PIX", "CREDIT_CARD"]),
  parcelas: z.number().int().min(1).max(PASSAPORTE_MAX_PARCELAS).optional(),
  nome: z.string().min(3).max(120),
  cpf: z.string().min(11).max(20),
  email: z.string().email().max(160),
  telefone: z.string().max(20).optional().nullable(),
  cep: z.string().min(8).max(9),
  endereco: z.string().max(160).optional().nullable(),
  numero: z.string().min(1).max(20),
  complemento: z.string().max(80).optional().nullable(),
  bairro: z.string().max(80).optional().nullable(),
  cidade: z.string().max(80).optional().nullable(),
  estado: z.string().max(2).optional().nullable(),
  cartaoTitular: z.string().max(120).optional().nullable(),
  cartaoNumero: z.string().max(25).optional().nullable(),
  cartaoMes: z.string().max(2).optional().nullable(),
  cartaoAno: z.string().max(4).optional().nullable(),
  cartaoCvv: z.string().max(4).optional().nullable(),
});

export type PassportPublic = {
  id: string;
  protocolo: string;
  token: string;
  status: string;
  serviceType: string;
  applicantName: string | null;
  dadosPessoais: Record<string, string>;
  documentos: Record<string, string>;
  complementares: Record<string, string>;
  paymentMethod: string | null;
  paymentStatus: string;
  amount: number | null;
  installments: number | null;
  invoiceUrl: string | null;
  pixPayload: string | null;
  pixQrBase64: string | null;
  pfProtocolo: string | null;
};

const asObj = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = val == null ? "" : String(val);
  }
  return out;
};

export function mapPassport(row: Record<string, any>): PassportPublic {
  return {
    id: row.id,
    protocolo: row.protocolo,
    token: row.token,
    status: row.status,
    serviceType: row.service_type,
    applicantName: row.applicant_name ?? null,
    dadosPessoais: asObj(row.dados_pessoais),
    documentos: asObj(row.documentos),
    complementares: asObj(row.complementares),
    paymentMethod: row.payment_method ?? null,
    paymentStatus: row.payment_status ?? "pending",
    amount: row.amount != null ? Number(row.amount) : null,
    installments: row.installments ?? null,
    invoiceUrl: row.invoice_url ?? null,
    pixPayload: row.pix_payload ?? null,
    pixQrBase64: row.pix_qr_base64 ?? null,
    pfProtocolo: row.pf_protocolo ?? null,
  };
}

export function proximoVencimento(dias = 3): string {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
}
