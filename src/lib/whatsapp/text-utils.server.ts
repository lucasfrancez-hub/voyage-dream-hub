/**
 * Utilitários de texto para WhatsApp.
 * SERVER-ONLY.
 */

/** "LUCAS ROCHA FRANCEZ" → "Lucas", "maria" → "Maria", "" → null */
export function firstName(full: string | null | undefined): string | null {
  if (!full) return null;
  const raw = full.trim().split(/\s+/)[0];
  if (!raw) return null;
  return capitalizeName(raw);
}

/** Coloca a primeira letra em maiúsculo, resto minúsculo. Preserva acentos. */
export function capitalizeName(word: string): string {
  const lower = word.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

/** Capitaliza a primeira letra do texto (respeitando espaços iniciais). */
export function capitalizeSentenceStart(text: string): string {
  return text.replace(/^(\s*)([\p{Ll}])/u, (_m, ws, c: string) => ws + c.toLocaleUpperCase("pt-BR"));
}

/**
 * Conserta texto "grudado" que o modelo às vezes devolve:
 * "pedido.Vou reforçar" → "pedido.\n\nVou reforçar"
 * "tá bom?Pode ficar"   → "tá bom?\n\nPode ficar"
 * "PerfeitoO Fabrício"  → "Perfeito. O Fabrício"
 * Ignora números (1.200), siglas (S.A.) e URLs.
 */
export function fixGluedSentences(text: string): string {
  let out = text;
  // "aqui:- Origem" → "aqui:\n- Origem"
  out = out.replace(/([:：])\s*-\s+/gu, "$1\n- ");
  // itens de lista grudados: "Maringá- Destino:" → quebra antes do "-"
  out = out.replace(/([^\s\n-])\s*-\s+(?=[A-ZÀ-Þa-zà-ÿ][^\n:]{1,40}:)/gu, "$1\n- ");
  // pontuação final colada em letra maiúscula (sem espaço)
  out = out.replace(
    /([a-zà-ÿ0-9)\]"'])([.!?…])([A-ZÀ-Þ])/gu,
    (_m, before: string, punct: string, after: string) => `${before}${punct}\n\n${after}`,
  );
  // interjeição colada na frase seguinte: "PerfeitoO Fabrício" → "Perfeito. O Fabrício".
  // Só para um conjunto fechado de palavras, pra não quebrar "WhatsApp", "ViaAir" etc.
  out = out.replace(
    /\b(perfeito|certo|combinado|show|beleza|entendi|obrigad[oa]|ótimo|otimo|claro|isso|consigo sim|sim)([A-ZÀ-Þ])/gu,
    (_m, word: string, after: string) => `${word}.\n\n${after}`,
  );
  // palavra minúscula colada em nova frase: "HotelVou pedir" → "Hotel\n\nVou pedir"
  // também cobre inicial isolada: "anterioresA cotação" → "anteriores\n\nA cotação"
  const KEEP = /^(WhatsApp|ViaAir|VIA AIR|TripAdvisor|LATAM|GOL|iPhone|McDonald|MacBook|PayPal|YouTube|InstaGram|Instagram|AirBnb|Airbnb|eSIM)$/;
  out = out.replace(
    /([a-zà-ÿ]{3,})([A-ZÀ-Þ][a-zà-ÿ]{2,})/gu,
    (m, a: string, b: string) => (KEEP.test(m) ? m : `${a}\n\n${b}`),
  );
  // letra maiúscula isolada iniciando frase nova: "anterioresA cotação", "pedidoO resumo"
  out = out.replace(
    /([a-zà-ÿ]{3,})([A-ZÀ-Þ])(?=\s[\p{L}])/gu,
    (_m, a: string, b: string) => `${a}\n\n${b}`,
  );
  // garante espaço depois de vírgula/ponto-e-vírgula colados em letra
  out = out.replace(/([,;])(?=[^\s\d])/gu, "$1 ");
  return out;
}


/**
 * Aplica capitalização inicial em cada balão (separados por \n+).
 * Não mexe no meio do balão pra manter o tom informal.
 */
export function capitalizeBubbles(fullText: string): string {
  return fullText

    .split(/\n+/)
    .map((line) => capitalizeSentenceStart(line))
    .join("\n\n");
}

/** Prefixo estilo "*Roberto:*\n" pra colocar no início do primeiro balão. */
export function buildSenderPrefix(name: string | null | undefined): string | null {
  const fn = firstName(name);
  if (!fn) return null;
  return `*${fn}:*`;
}

/**
 * Capitaliza ocorrências de nomes conhecidos no meio do texto (word-boundary, case-insensitive).
 * Ex.: capitalizeKnownNames("oi lucas, tem hotel em faria lima?", ["Lucas", "Faria Lima"])
 *   → "oi Lucas, tem hotel em Faria Lima?"
 */
export function capitalizeKnownNames(text: string, names: (string | null | undefined)[]): string {
  let out = text;
  const seen = new Set<string>();
  for (const raw of names) {
    if (!raw) continue;
    const cleaned = raw.trim();
    if (cleaned.length < 2) continue;
    // Capitaliza cada palavra do nome (ex.: "faria lima" → "Faria Lima")
    const proper = cleaned
      .split(/\s+/)
      .map((w) => capitalizeName(w))
      .join(" ");
    const key = proper.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    const escaped = proper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b não casa com acento em JS; usamos lookarounds de "não letra"
    const re = new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu");
    out = out.replace(re, proper);
  }
  return out;
}

/**
 * Remove Markdown das mensagens que vão pro WhatsApp.
 *
 * O WhatsApp não renderiza `**negrito**`, `__itálico__` nem `# título` —
 * eles chegam como lixo visual. Aqui o texto vira texto simples; só o
 * negrito nativo do WhatsApp (*asterisco simples*) é preservado.
 */
/**
 * MARCADOR INTERNO DE MÍDIA — nunca pode virar mensagem.
 *
 * `[[media:image|url|arquivo.png]]` é só a forma como guardamos "aqui foi
 * enviada uma foto". Se esse texto vaza pro histórico do prompt, a IA copia e
 * o cliente recebe o LINK cru em vez da imagem. Então: no histórico vira uma
 * descrição, e no envio de texto é apagado sempre.
 */
const MEDIA_RE = /\[\[media:(image|document|audio|video)\|([^|\]]+)\|([^\]]*)\]\]/gi;

const ROTULO: Record<string, string> = {
  image: "[foto enviada ao cliente]",
  document: "[documento enviado ao cliente]",
  audio: "[áudio enviado ao cliente]",
  video: "[vídeo enviado ao cliente]",
};

/** Para o histórico que a IA lê: troca o marcador por uma descrição. */
export function descreverMidiaNoHistorico(text: string): string {
  return String(text ?? "").replace(MEDIA_RE, (_m, kind: string) => ROTULO[kind.toLowerCase()] ?? "[mídia enviada]");
}

/** Para o que sai pro cliente: apaga o marcador (e o link cru junto). */
export function removerMarcadorMidia(text: string): string {
  return String(text ?? "")
    .replace(MEDIA_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripMarkdownForWhatsApp(text: string): string {
  let out = String(text ?? "");
  // blocos e trechos de código
  out = out.replace(/```[a-z]*\n?/gi, "").replace(/`([^`\n]+)`/g, "$1");
  // **negrito** e ***negrito itálico*** → texto simples
  out = out.replace(/\*{2,3}([^*\n]+)\*{2,3}/g, "$1");
  // asteriscos duplos soltos que sobraram
  out = out.replace(/\*{2,}/g, "");
  // __itálico__ / ___texto___
  out = out.replace(/_{2,3}([^_\n]+)_{2,3}/g, "$1");
  out = out.replace(/_{2,}/g, "");
  // títulos "# ", "## ", "### " no início da linha
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  // links markdown [texto](url) → texto (url)
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
  // marcadores de lista "* item" → "- item"
  out = out.replace(/^\s{0,3}\*\s+/gm, "- ");
  // linhas horizontais
  out = out.replace(/^\s{0,3}(-{3,}|_{3,})\s*$/gm, "");
  return out;
}

/**
 * VÍCIOS DE LINGUAGEM (fala de gente, não de sistema).
 *
 * A equipe da VIA AIR escreve no WhatsApp como conversa de verdade: "vc" no
 * lugar de "você", "tá" no lugar de "está", "pra" no lugar de "para a/o".
 * O modelo às vezes escorrega pro português formal — aqui o texto é ajustado
 * antes de sair, sem tocar em links nem em nomes próprios.
 */
export function aplicarViciosDeLinguagem(text: string): string {
  let out = String(text ?? "");
  const trocas: Array<[RegExp, string]> = [
    [/(?<![\p{L}])Você(?![\p{L}])/gu, "Vc"],
    [/(?<![\p{L}])você(?![\p{L}])/gu, "vc"],
    [/(?<![\p{L}])Está(?![\p{L}])/gu, "Tá"],
    [/(?<![\p{L}])está(?![\p{L}])/gu, "tá"],
    [/(?<![\p{L}])Estão(?![\p{L}])/gu, "Tão"],
    [/(?<![\p{L}])estão(?![\p{L}])/gu, "tão"],
    [/(?<![\p{L}])para vc(?![\p{L}])/gu, "pra vc"],
    [/(?<![\p{L}])Para vc(?![\p{L}])/gu, "Pra vc"],
  ];
  // Preserva URLs: troca só fora de links.
  const partes = out.split(/(https?:\/\/\S+)/g);
  out = partes
    .map((p, i) => {
      if (i % 2 === 1) return p; // é o link
      let t = p;
      for (const [re, sub] of trocas) t = t.replace(re, sub);
      return t;
    })
    .join("");
  return out;
}
