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
  order_number?: string | null;
  trip_locator?: string | null;
  trip_route?: string | null;
  trip_date?: string | null;
  trip_passengers?: string | null;
  trip_hotel?: string | null;
  trip_flights?: string | null;
  trip_checkin?: string | null;
  trip_checkout?: string | null;
  trip_days?: string | null;
  trip_nights?: string | null;
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

// ─────────────────────────────────────────────────────────
// Paleta e métricas
const M = 16; // margem
const LINE = 4.4;
const BRAND: [number, number, number] = [230, 100, 30]; // laranja Via Air
const INK: [number, number, number] = [23, 23, 27];
const MUTED: [number, number, number] = [110, 110, 120];
const RULE: [number, number, number] = [225, 225, 232];
const ROW_ALT: [number, number, number] = [248, 249, 251];
const HEADER_BG: [number, number, number] = [15, 23, 42];

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

export async function generateAuthorizationPDF(opts: {
  orderId: string;
  createdAt: string;
  authorization: AuthorizationData;
  liveness: LivenessData | null;
}) {
  const doc = await buildAuthorizationDoc(opts);
  doc.save(`autorizacao-debito-${opts.orderId.slice(0, 8)}.pdf`);
}

export async function buildAuthorizationBlob(opts: {
  orderId: string;
  createdAt: string;
  authorization: AuthorizationData;
  liveness: LivenessData | null;
  pendingSignature?: boolean;
}): Promise<Blob> {
  const doc = await buildAuthorizationDoc(opts);
  return doc.output("blob");
}

async function buildAuthorizationDoc(opts: {
  orderId: string;
  createdAt: string;
  authorization: AuthorizationData;
  liveness: LivenessData | null;
  pendingSignature?: boolean;
}): Promise<jsPDF> {

  const { orderId, createdAt, authorization: a, liveness, pendingSignature } = opts;
  const numericFromUuid = (() => {
    const hex = orderId.replace(/-/g, "").slice(0, 12);
    const n = parseInt(hex, 16);
    return `#${String(n % 100000000).padStart(8, "0")}`;
  })();
  const displayOrderNumber = a.order_number && a.order_number.trim() ? a.order_number.trim() : numericFromUuid;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - M * 2;
  let y = M;
  let sectionCounter = 0;

  // ── helpers ─────────────────────────────────
  const ensure = (h: number) => {
    if (y + h > pageH - M - 8) {
      doc.addPage();
      drawHeaderBand(false);
      y = 34;
    }
  };

  const setInk = () => doc.setTextColor(INK[0], INK[1], INK[2]);
  const setMuted = () => doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const setBrand = () => doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);

  function drawHeaderBand(first: boolean) {
    doc.setFillColor(HEADER_BG[0], HEADER_BG[1], HEADER_BG[2]);
    doc.rect(0, 0, pageW, 26, "F");
    // marca de acento
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.rect(0, 26, pageW, 1.2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(first ? 15 : 11);
    doc.text("Autorização de Débito em Cartão de Crédito", M, first ? 12 : 11);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(210, 214, 224);
    if (first) {
      doc.text(
        "Via Air Agência e Representações Ltda · CNPJ 56.339.877/0001-66 · Paranavaí/PR",
        M,
        18,
      );
      doc.text("Documento validado eletronicamente (MP 2.200-2/2001)", M, 22.5);
    } else {
      doc.text(`Pedido ${displayOrderNumber}`, M, 17);
    }

    // selo à direita
    if (first) {
      doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.setLineWidth(0.6);
      doc.roundedRect(pageW - M - 46, 6, 46, 15, 2.5, 2.5, "S");
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("ASSINADO", pageW - M - 23, 12, { align: "center" });
      doc.setTextColor(210, 214, 224);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("Certificado digital", pageW - M - 23, 16.5, { align: "center" });
      doc.text(fmtDate(a.signed_at), pageW - M - 23, 19.5, { align: "center" });
    }
    setInk();
  }

  function h1(t: string) {
    ensure(14);
    sectionCounter += 1;
    // badge numérico
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.circle(M + 3.2, y + 1.6, 3.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(String(sectionCounter), M + 3.2, y + 2.6, { align: "center" });
    // título
    setInk();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(t, M + 9, y + 2.8);
    y += 6.5;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, y, pageW - M, y);
    y += 3.5;
  }

  // KV como linha de tabela com fundo alternado
  let kvRow = 0;
  function beginKvSection() {
    kvRow = 0;
  }
  function kv(k: string, v: string) {
    const labelW = 46;
    const valueW = contentW - labelW - 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(v || "—", valueW);
    const rowH = Math.max(6, wrapped.length * LINE + 1.6);
    ensure(rowH);
    if (kvRow % 2 === 1) {
      doc.setFillColor(ROW_ALT[0], ROW_ALT[1], ROW_ALT[2]);
      doc.rect(M, y - 0.5, contentW, rowH, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    setMuted();
    doc.text(k.toUpperCase(), M + 2, y + 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    setInk();
    doc.text(wrapped, M + labelW + 4, y + 3);
    y += rowH;
    kvRow += 1;
  }

  function para(t: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setInk();
    const wrapped = doc.splitTextToSize(t, contentW);
    ensure(wrapped.length * LINE + 2);
    doc.text(wrapped, M, y + 3);
    y += wrapped.length * LINE + 3.5;
  }

  function calloutHighlight(t: string) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(t, contentW - 8);
    const h = wrapped.length * LINE + 6;
    ensure(h + 2);
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, contentW, h, 2, 2, "FD");
    // barra lateral
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2]);
    doc.rect(M, y, 1.6, h, "F");
    setInk();
    doc.text(wrapped, M + 6, y + 4);
    y += h + 3;
  }

  // ── página 1 ─────────────────────────────────
  drawHeaderBand(true);
  y = 34;

  // linha de metadados do pedido
  const chip = (label: string, value: string, x: number, w: number) => {
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(x, y, w, 12, 1.5, 1.5, "FD");
    doc.setFontSize(7.2);
    setMuted();
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + 2.5, y + 4.2);
    doc.setFontSize(9);
    setInk();
    doc.setFont("helvetica", "normal");
    doc.text(value, x + 2.5, y + 9);
  };
  const chipW = (contentW - 6) / 3;
  const pedidoDisplay = displayOrderNumber;
  chip("Pedido", pedidoDisplay, M, chipW);

  chip("Assinado em", fmtDate(a.signed_at), M + chipW + 3, chipW);
  chip("Válido até", fmtDate(a.valid_until), M + (chipW + 3) * 2, chipW);
  y += 16;

  // ── seções
  h1("Fornecedor e representante");
  beginKvSection();
  kv("Fornecedor", a.supplier ?? "—");
  kv("Representante", a.representative ?? "Via Air Agência e Representações Ltda");
  y += 2;

  h1("Portador do cartão");
  beginKvSection();
  kv("Nome completo", a.holder_name ?? "—");
  kv("CPF", a.holder_cpf ?? "—");
  kv("Nascimento", a.holder_birth_date ?? "—");
  kv("E-mail", a.holder_email ?? "—");
  kv("Telefone", a.holder_phone ?? "—");
  y += 2;

  h1("Dados do cartão e cobrança");
  beginKvSection();
  kv("Bandeira", a.brand ?? "—");
  kv("Número (mascarado)", a.masked_card ?? "—");
  kv("Validade do cartão", a.expiry ?? "—");
  kv("Valor autorizado", a.amount != null ? formatBRL(a.amount) : "—");
  kv(
    "Forma de pagamento",
    a.installments && a.installments > 1
      ? `Crédito parcelado em ${a.installments}x sem juros`
      : "Crédito à vista",
  );
  kv("Descrição do serviço", a.description ?? "—");
  if (a.reference) kv("Referência", a.reference);
  y += 2;

  const hasExtraTrip =
    a.trip_hotel || a.trip_flights || a.trip_checkin || a.trip_checkout || a.trip_days || a.trip_nights;
  if (a.trip_locator || a.trip_route || a.trip_date || a.trip_passengers || hasExtraTrip) {
    h1("Informações da viagem");
    beginKvSection();
    if (a.trip_locator) kv("Localizador", a.trip_locator);
    if (a.trip_route) kv("Rota / voos / horários", a.trip_route);
    if (a.trip_flights) kv("Voos", a.trip_flights);
    if (a.trip_hotel) kv("Hotel / hospedagem", a.trip_hotel);
    if (a.trip_date) kv("Data(s) da viagem", a.trip_date);
    if (a.trip_checkin) kv("Check-in", a.trip_checkin);
    if (a.trip_checkout) kv("Check-out", a.trip_checkout);
    if (a.trip_days || a.trip_nights) {
      kv("Duração", `${a.trip_days || "—"} dia(s) / ${a.trip_nights || "—"} noite(s)`);
    }
    if (a.trip_passengers) kv("Passageiros", a.trip_passengers);
    y += 2;
  }

  // ── termos
  h1("Termos aceitos pelo portador");
  const supplierLabel = a.supplier && a.supplier.trim().length ? a.supplier : "fornecedor contratado";
  calloutHighlight(
    `A cobrança poderá ser realizada diretamente por ${supplierLabel}, podendo constar na fatura em nome deste fornecedor, e NÃO como "Via Air".`,
  );
  para(
    `Eu, portador do cartão acima identificado, autorizo e reconheço o débito no valor de ${a.amount != null ? formatBRL(a.amount) : "—"} na forma de pagamento indicada, referente à contratação dos serviços de viagem descritos, intermediados pela Via Air Agência e Representações Ltda (CNPJ 56.339.877/0001-66), na qualidade de representante.`,
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
    "Esta autorização é válida por 12 (doze) meses a partir da data da assinatura, registrada eletronicamente com data, hora, endereço IP, geolocalização, dados do dispositivo, verificação facial (liveness) e assinatura digital do portador, com validade jurídica nos termos da MP 2.200-2/2001.",
  );

  if (pendingSignature) {
    // Fluxo ClickSign: apenas reconhecimento do portador; assinatura, biometria
    // e evidências eletrônicas serão adicionadas pelo ClickSign no anexo final.
    ensure(30);
    h1("Reconhecimento do portador");
    beginKvSection();
    kv("Reconhecido por", a.holder_name ?? "—");
    kv("CPF", a.holder_cpf ?? "—");
    y += 2;
    para(
      "A assinatura eletrônica, verificação de identidade e demais evidências (data/hora, endereço IP, geolocalização e dispositivo) serão registradas no ato da assinatura via ClickSign e anexadas a este documento.",
    );
  } else {
    // ── assinatura em card
    ensure(52);
    h1("Assinatura do portador");
    const sigH = 42;
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(M, y, contentW, sigH, 2, 2, "FD");

    const sigBoxW = 88;
    const sigBoxH = 34;
    const sigX = M + 4;
    const sigY = y + 4;
    doc.setDrawColor(210, 214, 224);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.rect(sigX, sigY, sigBoxW, sigBoxH, "S");
    doc.setLineDashPattern([], 0);

    if (a.signature_data_url) {
      try {
        doc.addImage(a.signature_data_url, "PNG", sigX + 2, sigY + 2, sigBoxW - 4, sigBoxH - 4);
      } catch {
        setMuted();
        doc.setFontSize(8);
        doc.text("assinatura capturada (imagem inválida)", sigX + sigBoxW / 2, sigY + sigBoxH / 2, { align: "center" });
        setInk();
      }
    } else {
      setMuted();
      doc.setFontSize(8);
      doc.text("assinatura não capturada", sigX + sigBoxW / 2, sigY + sigBoxH / 2, { align: "center" });
      setInk();
    }

    // dados à direita da assinatura
    const infoX = sigX + sigBoxW + 8;
    const infoTop = y + 6;
    const infoRow = (label: string, value: string, i: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      setMuted();
      doc.text(label.toUpperCase(), infoX, infoTop + i * 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setInk();
      doc.text(value, infoX, infoTop + i * 8 + 4);
    };
    infoRow("Assinado por", a.holder_name ?? "—", 0);
    infoRow("CPF", a.holder_cpf ?? "—", 1);
    infoRow("Data / hora", fmtDate(a.signed_at), 2);
    infoRow("Termos", a.accepted_terms ? "ACEITOS (checkbox marcada)" : "não registrado", 3);

    y += sigH + 6;

    // ── página 2: biometria + evidências
    doc.addPage();
    drawHeaderBand(false);
    y = 34;

    h1("Verificação de biometria facial (prova de vida)");
    if (liveness && liveness.photos?.length) {
      beginKvSection();
      kv("Capturado em", fmtDate(liveness.captured_at));
      kv("Selfie válida até", fmtDate(liveness.selfie_valid_until));
      kv(
        "Método de verificação",
        liveness.face_detector_used
          ? "Detector facial nativo 3D + desafios ativos"
          : "Desafios ativos com análise de movimento",
      );
      kv("Desafios executados", (liveness.challenges ?? []).join(" · ") || "—");
      kv(
        "Movimento mínimo entre capturas",
        liveness.min_motion_score != null ? liveness.min_motion_score.toFixed(4) : "—",
      );
      kv(
        "Scores por transição",
        (liveness.motion_scores ?? []).map((s) => s.toFixed(4)).join(" · ") || "—",
      );
      y += 3;

      const labelMap: Record<string, string> = {
        fit: "Encaixe", near: "Aproximação", right: "Direita", left: "Esquerda", smile: "Sorriso",
        front: "Frente",
      };
      const photos = liveness.photos.slice(0, 5);
      const cols = photos.length;
      const gap = 4;
      const imgW = (contentW - gap * (cols - 1)) / cols;
      const imgH = imgW * 1.25;
      ensure(imgH + 12);

      const dims = await Promise.all(
        photos.map(
          (src) =>
            new Promise<{ w: number; h: number }>((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
              img.onerror = () => resolve({ w: 4, h: 3 });
              img.src = src;
            }),
        ),
      );

      photos.forEach((p, i) => {
        const x = M + i * (imgW + gap);
        doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
        doc.setFillColor(245, 246, 250);
        doc.roundedRect(x, y, imgW, imgH, 1.5, 1.5, "FD");
        const boxW = imgW - 3;
        const boxH = imgH - 3;
        const { w: iw, h: ih } = dims[i];
        const scale = Math.min(boxW / iw, boxH / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = x + 1.5 + (boxW - dw) / 2;
        const dy = y + 1.5 + (boxH - dh) / 2;
        try {
          doc.addImage(p, "JPEG", dx, dy, dw, dh);
        } catch {}
        const key = liveness.challenges?.[i];
        const label = (key && labelMap[key]) || `#${i + 1}`;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        setMuted();
        doc.text(label.toUpperCase(), x + imgW / 2, y + imgH + 5, { align: "center" });
      });
      setInk();
      y += imgH + 10;

    } else {
      beginKvSection();
      kv("Status", "não capturada");
      y += 2;
    }

    h1("Registro eletrônico (evidência)");
    beginKvSection();
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
      kv("Mapa", `https://www.google.com/maps?q=${a.geolocation.latitude},${a.geolocation.longitude}`);
    } else {
      kv("Geolocalização", "não disponível");
    }
    kv("Fuso horário", a.timezone ?? "—");
    kv("Idioma do dispositivo", a.language ?? "—");
    kv("User-Agent", a.user_agent ?? "—");
  }

  // ── rodapé em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    // linha
    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, pageH - 10, pageW - M, pageH - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const shortId = displayOrderNumber.slice(0, 20);
    doc.text("viaair.tur.br", M, pageH - 5.5);
    doc.text(`Autorização de débito · Pedido ${shortId}`, pageW / 2, pageH - 5.5, { align: "center" });
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 5.5, { align: "right" });
    setInk();
  }

  return doc;
}
