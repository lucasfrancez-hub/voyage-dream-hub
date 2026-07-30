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

/** Remove emojis e símbolos que as fontes padrão do PDF não conseguem desenhar. */
function stripUnsupported(s: string) {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{200D}]/gu, "")
    .replace(/[ \t]{2,}/g, " ");
}

type Seg = { text: string; bold: boolean; italic: boolean };

/** Converte markdown do WhatsApp (*negrito*, _itálico_) em segmentos formatados. */
function parseInline(line: string): Seg[] {
  const segs: Seg[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), bold: false, italic: false });
    const raw = m[0];
    segs.push({ text: raw.slice(1, -1), bold: raw[0] === "*", italic: raw[0] === "_" });
    last = m.index + raw.length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), bold: false, italic: false });
  return segs.filter((s) => s.text.length > 0);
}

async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number; format: string } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    const format = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
    return { dataUrl, w: dims.w, h: dims.h, format };
  } catch {
    return null;
  }
}

/**
 * Gera um relatório PDF da campanha de broadcast: destinos, horários
 * programados e uma prévia legível de cada bloco (com a imagem embutida).
 */
export async function exportCampanhaPdf(
  campanha: PdfCampanha,
  blocos: PdfBloco[],
  destinos: PdfDestino[],
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const maxW = W - M * 2;
  const BOTTOM = 278;
  let y = 0;

  // Pré-carrega as imagens dos blocos
  const imagens = await Promise.all(
    blocos.map((b) => (b.tipo === "image" && b.midia_url ? loadImage(b.midia_url) : Promise.resolve(null))),
  );

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
    if (y + h > BOTTOM) {
      doc.addPage();
      y = 20;
    }
  }

  function sectionTitle(t: string) {
    ensure(14);
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
    ensure(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`${label}:`, M, y);
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(value, maxW - 40) as string[];
    doc.text(wrapped, M + 40, y);
    y += Math.max(6, wrapped.length * 5);
  }

  /** Desenha um parágrafo com markdown do WhatsApp, quebrando página quando precisa. */
  function drawRichText(text: string, x: number, width: number, size = 9.5, leading = 5) {
    doc.setFontSize(size);
    const paragrafos = stripUnsupported(text).split(/\r?\n/);
    for (const p of paragrafos) {
      if (!p.trim()) {
        y += leading * 0.6;
        continue;
      }
      const segs = parseInline(p);
      let cursorX = x;
      ensure(leading + 2);
      for (const seg of segs) {
        doc.setFont("helvetica", seg.bold ? "bold" : seg.italic ? "italic" : "normal");
        const words = seg.text.split(/(\s+)/);
        for (const w of words) {
          if (!w) continue;
          const wWidth = doc.getTextWidth(w);
          if (cursorX + wWidth > x + width && w.trim()) {
            y += leading;
            ensure(leading + 2);
            cursorX = x;
          }
          if (cursorX === x && !w.trim()) continue;
          doc.text(w, cursorX, y);
          cursorX += wWidth;
        }
      }
      y += leading;
    }
    doc.setFont("helvetica", "normal");
  }

  // Identificação
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const nomeLinhas = doc.splitTextToSize(stripUnsupported(campanha.nome), maxW) as string[];
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
  if (campanha.observacoes_marketing) line("Observacoes", stripUnsupported(campanha.observacoes_marketing));
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
      doc.text(`• ${stripUnsupported(d.nome)}  (${DEST_LABEL[d.tipo]})`, M + 2, y);
      y += 5.2;
    }
  }
  y += 6;

  // Cronograma
  sectionTitle(`Cronograma de envio (${blocos.length} blocos)`);

  blocos.forEach((b, i) => {
    const horario = b.scheduled_at ? fmt(b.scheduled_at) : `${fmt(campanha.scheduled_at)} (horario da campanha)`;
    const img = imagens[i];
    const conteudo = (b.texto || b.midia_caption || "").trim();

    // dimensões da imagem no papel
    const imgW = img ? 46 : 0;
    const imgH = img ? Math.min(70, (imgW * img.h) / img.w) : 0;

    ensure(imgH + 24);

    const topo = y;
    // cabeçalho do bloco
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(M, topo - 5, maxW, 9, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    doc.text(`#${i + 1} · ${TIPO_LABEL[b.tipo]}`, M + 4, topo + 1);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.setFontSize(8.5);
    doc.text(horario, W - M - 4, topo + 1, { align: "right" });
    doc.setTextColor(20, 20, 20);
    y = topo + 10;

    const textoX = img ? M + imgW + 8 : M + 2;
    const textoW = img ? maxW - imgW - 10 : maxW - 4;
    const textoTop = y;

    if (img) {
      try {
        doc.addImage(img.dataUrl, img.format, M + 2, y, imgW, imgH, undefined, "FAST");
        doc.setDrawColor(225, 225, 225);
        doc.roundedRect(M + 2, y, imgW, imgH, 1.5, 1.5, "S");
      } catch {
        /* imagem incompatível — segue só com o texto */
      }
    } else if (b.midia_url) {
      // mídia não visual (PDF/vídeo): mostra só o nome do arquivo
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const arquivo = b.midia_filename || decodeURIComponent(b.midia_url.split("/").pop() || "");
      doc.text(`Arquivo: ${arquivo}`.slice(0, 110), M + 2, y);
      doc.setTextColor(20, 20, 20);
      y += 5;
    }

    if (conteudo) {
      drawRichText(conteudo, textoX, textoW, 9, 4.8);
    } else {
      doc.setFontSize(8.5);
      doc.setTextColor(150, 150, 150);
      doc.text("(sem legenda)", textoX, y);
      doc.setTextColor(20, 20, 20);
      y += 5;
    }

    if (img) y = Math.max(y, textoTop + imgH);
    y += 9;
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`VIA AIR · Broadcast · pagina ${p} de ${total}`, W / 2, 289, { align: "center" });
  }

  const slug = campanha.nome.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "campanha";
  doc.save(`campanha-${slug}.pdf`);
}
