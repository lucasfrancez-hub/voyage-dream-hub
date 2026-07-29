import jsPDF from "jspdf";

export type PdfBloco = {
  tipo: "text" | "image" | "video" | "document" | "buttons";
  texto?: string | null;
  midia_url?: string | null;
  midia_filename?: string | null;
  midia_caption?: string | null;
  scheduled_at?: string | null;
};

export type PdfCampanha = {
  nome: string;
  status: string;
  scheduled_at?: string | null;
  sent_at?: string | null;
  observacoes_marketing?: string | null;
  metrics?: Record<string, number> | null;
};

export type PdfDestino = { nome: string; tipo: "channel" | "group" | "instagram_story" };

const TIPO_LABEL: Record<PdfBloco["tipo"], string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  document: "PDF / Documento",
  buttons: "Botões",
};

const DEST_LABEL: Record<PdfDestino["tipo"], string> = {
  channel: "Canal",
  group: "Grupo",
  instagram_story: "Instagram Story",
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Gera um relatório PDF da campanha de broadcast: destinos, horários
 * programados de cada bloco e o conteúdo que será enviado.
 */
export function exportCampanhaPdf(
  campanha: PdfCampanha,
  blocos: PdfBloco[],
  destinos: PdfDestino[],
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const maxW = W - M * 2;
  let y = 0;

  // Cabeçalho
  doc.setFillColor(242, 107, 31);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("VIA AIR — Relatorio de campanha", M, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Gerado em ${fmt(new Date().toISOString())} (horario de Brasilia)`, M, 19);
  y = 36;

  doc.setTextColor(20, 20, 20);

  function ensure(h: number) {
    if (y + h > 282) {
      doc.addPage();
      y = 20;
    }
  }

  function sectionTitle(t: string) {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(242, 107, 31);
    doc.text(t.toUpperCase(), M, y);
    doc.setDrawColor(230, 230, 230);
    doc.line(M, y + 1.5, W - M, y + 1.5);
    doc.setTextColor(20, 20, 20);
    y += 8;
  }

  function line(label: string, value: string) {
    ensure(7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`${label}:`, M, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(value, maxW - 38) as string[];
    doc.text(wrapped, M + 38, y);
    y += Math.max(6, wrapped.length * 4.6);
  }

  // Identificação
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const nomeLinhas = doc.splitTextToSize(campanha.nome, maxW) as string[];
  doc.text(nomeLinhas, M, y);
  y += nomeLinhas.length * 7 + 2;

  line("Status", campanha.status);
  line("Inicio programado", fmt(campanha.scheduled_at));
  if (campanha.sent_at) line("Concluida em", fmt(campanha.sent_at));
  if (campanha.metrics && Object.keys(campanha.metrics).length > 0) {
    line(
      "Metricas",
      `Enviados: ${campanha.metrics.enviados ?? 0} | Falhas: ${campanha.metrics.falhas ?? 0} | Total: ${campanha.metrics.total ?? 0}`,
    );
  }
  if (campanha.observacoes_marketing) line("Observacoes", campanha.observacoes_marketing);
  y += 4;

  // Destinos
  sectionTitle(`Destinos (${destinos.length})`);
  if (destinos.length === 0) {
    line("", "Nenhum destino selecionado");
  } else {
    for (const d of destinos) {
      ensure(6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(`• ${d.nome}  (${DEST_LABEL[d.tipo]})`, M + 2, y);
      y += 5.2;
    }
  }
  y += 5;

  // Cronograma
  sectionTitle(`Cronograma de envio (${blocos.length} blocos)`);
  blocos.forEach((b, i) => {
    ensure(20);
    const horario = b.scheduled_at ? fmt(b.scheduled_at) : `${fmt(campanha.scheduled_at)} (horario da campanha)`;

    doc.setFillColor(248, 248, 248);
    const conteudo = (b.texto || b.midia_caption || "").trim();
    const corpo = conteudo ? (doc.splitTextToSize(conteudo, maxW - 8) as string[]) : [];
    const extra = b.midia_url ? 5 : 0;
    const boxH = 13 + corpo.length * 4.4 + extra;
    ensure(boxH + 4);
    doc.roundedRect(M, y - 4, maxW, boxH, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`#${i + 1} · ${TIPO_LABEL[b.tipo]}`, M + 4, y + 1);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(horario, W - M - 4, y + 1, { align: "right" });
    doc.setTextColor(20, 20, 20);
    let inner = y + 6.5;

    if (b.midia_url) {
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const arquivo = b.midia_filename || b.midia_url.split("/").pop() || b.midia_url;
      doc.text(`Arquivo: ${arquivo}`, M + 4, inner);
      doc.setTextColor(20, 20, 20);
      inner += 4.5;
    }
    if (corpo.length > 0) {
      doc.setFontSize(9);
      doc.text(corpo, M + 4, inner);
      inner += corpo.length * 4.4;
    }
    y = y - 4 + boxH + 5;
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`VIA AIR · Broadcast · pagina ${p} de ${total}`, W / 2, 291, { align: "center" });
  }

  const slug = campanha.nome.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "campanha";
  doc.save(`campanha-${slug}.pdf`);
}
