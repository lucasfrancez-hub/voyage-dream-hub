import jsPDF from "jspdf";
import { formatBRL } from "@/lib/format";

export type AuthorizationData = {
  type?: string;
  supplier?: string;
  representative?: string;
  holder_name?: string;
  holder_cpf?: string;
  holder_email?: string;
  holder_phone?: string;
  holder_birth_date?: string;
  masked_card?: string;
  brand?: string;
  expiry?: string;
  amount?: number;
  installments?: number;
  description?: string | null;
  reference?: string | null;
  accepted_terms?: boolean;
  signature_data_url?: string | null;
  signed_at?: string;
  ip_address?: string | null;
  ip_geo?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    org?: string;
  } | null;
  geolocation?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    source?: "gps" | "ip";
  } | null;
  user_agent?: string | null;
  language?: string | null;
  timezone?: string | null;
  valid_until?: string;
};


export type LivenessData = {
  photos?: string[];
  motion_scores?: number[];
  min_motion_score?: number;
  captured_at?: string;
  selfie_valid_until?: string;
  user_agent?: string | null;
  challenges?: string[];
  face_detector_used?: boolean;
};

const M = 14; // margem
const LINE = 5;

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

export function generateAuthorizationPDF(opts: {
  orderId: string;
  createdAt: string;
  authorization: AuthorizationData;
  liveness: LivenessData | null;
}) {
  const { orderId, createdAt, authorization: a, liveness } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = M;

  const ensure = (h: number) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  const h1 = (t: string) => {
    ensure(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(t, M, y);
    y += 6;
    doc.setDrawColor(230, 100, 30);
    doc.setLineWidth(0.6);
    doc.line(M, y, pageW - M, y);
    y += 4;
  };
  const h2 = (t: string) => {
    ensure(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(230, 100, 30);
    doc.text(t.toUpperCase(), M, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  };
  const kv = (k: string, v: string) => {
    ensure(LINE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(k + ":", M, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(v || "—", pageW - M * 2 - 45);
    doc.text(wrapped, M + 45, y);
    y += Math.max(LINE, wrapped.length * LINE);
  };
  const para = (t: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(t, pageW - M * 2);
    ensure(wrapped.length * LINE);
    doc.text(wrapped, M, y);
    y += wrapped.length * LINE + 2;
  };

  // Cabeçalho
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Autorização de débito em cartão de crédito", M, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Documento validado eletronicamente · Via Air Agência e Representações Ltda", M, 16);
  doc.text(`CNPJ 56.339.877/0001-66 · Paranavaí/PR`, M, 20);
  doc.setTextColor(0, 0, 0);
  y = 30;

  kv("Pedido", orderId);
  kv("Criado em", fmtDate(createdAt));
  kv("Assinado em", fmtDate(a.signed_at));
  kv("Válido até", fmtDate(a.valid_until));

  h1("Fornecedor e representante");
  kv("Fornecedor", a.supplier ?? "—");
  kv("Representante", a.representative ?? "Via Air Agência e Representações Ltda");

  h1("Portador do cartão");
  kv("Nome", a.holder_name ?? "—");
  kv("CPF", a.holder_cpf ?? "—");
  kv("Nascimento", a.holder_birth_date ?? "—");
  kv("E-mail", a.holder_email ?? "—");
  kv("Telefone", a.holder_phone ?? "—");

  h1("Dados do cartão e cobrança");
  kv("Bandeira", a.brand ?? "—");
  kv("Número (mascarado)", a.masked_card ?? "—");
  kv("Validade", a.expiry ?? "—");
  kv("Valor autorizado", a.amount != null ? formatBRL(a.amount) : "—");
  kv(
    "Forma de pagamento",
    a.installments && a.installments > 1
      ? `Crédito parcelado em ${a.installments}x sem juros`
      : "Crédito à vista",
  );
  kv("Descrição", a.description ?? "—");
  if (a.reference) kv("Referência", a.reference);

  h1("Termos aceitos pelo portador");
  para(
    `Eu, portador do cartão acima identificado, autorizo e reconheço o débito da minha conta no valor de ${a.amount != null ? formatBRL(a.amount) : "—"} na forma de pagamento indicada, referente à contratação dos serviços de viagem descritos, intermediados pela Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66), na qualidade de representante. A cobrança poderá ser realizada diretamente pelo fornecedor ${a.supplier ?? "—"}, podendo aparecer na fatura em nome deste, e não como "Via Air".`,
  );
  para(
    "Declaro que sou o legítimo titular do cartão informado, que os dados fornecidos são verdadeiros e que assumo integral responsabilidade pelo pagamento, inclusive quando os serviços forem prestados em nome de terceiros (passageiros).",
  );
  para(
    "Reconheço como legítima esta cobrança. A contestação (chargeback) sem fundamento pode configurar má-fé e fraude, sujeitando-me às penalidades legais cabíveis, cobrança judicial do valor integral, juros, custas processuais e honorários advocatícios.",
  );
  para(
    "Cancelamentos seguem as regras dos fornecedores acrescidas da taxa administrativa Via Air de 20% sobre o valor reembolsável. No-show, alterações de datas/nomes/trechos estão sujeitos às regras tarifárias do fornecedor e podem implicar perda parcial ou total do valor pago.",
  );
  para(
    "Esta autorização é válida por 12 (doze) meses e é registrada eletronicamente com data, hora, endereço IP, geolocalização, dados do dispositivo, verificação facial (liveness) e assinatura digital do portador, com validade jurídica nos termos da MP 2.200-2/2001.",
  );

  // Assinatura
  h1("Assinatura do portador");
  if (a.signature_data_url) {
    try {
      ensure(50);
      doc.addImage(a.signature_data_url, "PNG", M, y, 80, 30);
      y += 32;
    } catch {
      kv("Assinatura", "capturada (imagem inválida)");
    }
  } else {
    kv("Assinatura", "não capturada");
  }
  kv("Assinado por", a.holder_name ?? "—");
  kv("CPF", a.holder_cpf ?? "—");
  kv("Data/hora da assinatura", fmtDate(a.signed_at));
  kv("Aceite dos termos", a.accepted_terms ? "SIM (checkbox marcada)" : "não registrado");

  // Prova de vida / biometria
  doc.addPage();
  y = M;
  h1("Verificação de biometria facial (prova de vida)");
  if (liveness && liveness.photos?.length) {
    kv("Capturado em", fmtDate(liveness.captured_at));
    kv("Selfie válida até", fmtDate(liveness.selfie_valid_until));
    kv(
      "Movimento mínimo detectado",
      liveness.min_motion_score != null ? liveness.min_motion_score.toFixed(4) : "—",
    );
    kv(
      "Scores por transição",
      (liveness.motion_scores ?? []).map((s) => s.toFixed(4)).join(" · ") || "—",
    );
    y += 2;
    h2("Capturas");
    const labels = ["Frente", "Direita", "Esquerda"];
    const imgW = 55;
    const imgH = 41;
    const gap = 6;
    ensure(imgH + 8);
    let x = M;
    liveness.photos.slice(0, 3).forEach((p, i) => {
      try {
        doc.addImage(p, "JPEG", x, y, imgW, imgH);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(labels[i] ?? `#${i + 1}`, x + imgW / 2, y + imgH + 4, { align: "center" });
      } catch {}
      x += imgW + gap;
    });
    y += imgH + 8;
  } else {
    kv("Status", "não capturada");
  }

  // Metadados técnicos
  h1("Registro eletrônico (evidência)");
  kv("Endereço IP", a.ip_address ?? "não capturado");
  if (a.ip_geo) {
    const parts = [a.ip_geo.city, a.ip_geo.region, a.ip_geo.country].filter(Boolean).join(", ");
    if (parts) kv("Localização por IP", parts);
    if (a.ip_geo.org) kv("Operadora / rede", a.ip_geo.org);
  }
  if (a.geolocation) {
    const src = a.geolocation.source === "ip" ? "aproximada por IP" : "GPS / Wi-Fi";
    kv(
      "Geolocalização",
      `lat ${a.geolocation.latitude.toFixed(6)}, lng ${a.geolocation.longitude.toFixed(6)} (±${Math.round(a.geolocation.accuracy)}m · ${src})`,
    );
    kv(
      "Mapa",
      `https://www.google.com/maps?q=${a.geolocation.latitude},${a.geolocation.longitude}`,
    );
  } else {
    kv("Geolocalização", "não disponível");
  }
  kv("Fuso horário", a.timezone ?? "—");
  kv("Idioma do dispositivo", a.language ?? "—");
  kv("User-Agent", a.user_agent ?? "—");


  // Rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Autorização de débito · Pedido ${orderId} · Página ${i}/${pages}`,
      pageW / 2,
      pageH - 6,
      { align: "center" },
    );
    doc.setTextColor(0);
  }

  doc.save(`autorizacao-debito-${orderId.slice(0, 8)}.pdf`);
}
