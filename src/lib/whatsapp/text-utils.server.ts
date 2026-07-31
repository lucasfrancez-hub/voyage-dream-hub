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

/** Prefixo estilo "Roberto:\n" pra colocar no início do primeiro balão. */
export function buildSenderPrefix(name: string | null | undefined): string | null {
  const fn = firstName(name);
  if (!fn) return null;
  return `${fn}:`;
}

/**
 * Remove assinaturas que o próprio modelo escreveu ("*Maria:*", "Maria:")
 * no começo de qualquer balão — a assinatura é adicionada pelo código.
 */
export function stripAgentSignature(fullText: string, agentName: string | null | undefined): string {
  const fn = firstName(agentName);
  if (!fn) return fullText;
  const esc = fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Linha que é SÓ a assinatura ("Maria:", "*Maria:*", "_Maria_:") — pode
  // aparecer em qualquer ponto do texto, não só no começo.
  const signatureLine = new RegExp(`^[*_~\\s]*${esc}\\s*:?\\s*[*_~\\s]*$`, "i");
  // Assinatura grudada no início de um parágrafo ("Maria: oi, Lucas").
  const inlineSignature = new RegExp(`^[*_~]*\\s*${esc}\\s*:\\s*[*_~]*\\s*`, "i");

  const lines = fullText
    .split("\n")
    .filter((l) => !signatureLine.test(l) || l.trim() === "");

  const cleaned = lines
    .join("\n")
    .split(/\n{2,}/)
    .map((b) => {
      let out = b.trim();
      // Repete enquanto houver assinatura no início ("Maria: Maria: oi").
      while (inlineSignature.test(out)) out = out.replace(inlineSignature, "").trim();
      return out;
    })
    .filter(Boolean);

  return cleaned.join("\n\n").trim();
}


/**
 * Remove balões de saudação/apresentação quando o atendimento JÁ começou.
 * Evita o "Olá, sou Roberto, consultor da Via Air / tudo bem?" repetido a cada turno.
 */
export function stripReintroBubbles(fullText: string): string {
  const SAUDACAO = /^(oi|ol[áa]|bom dia|boa tarde|boa noite|e a[íi])\b[\s,!.…-]*[\p{L}\s]{0,30}[!.…]*$/iu;
  const APRESENTACAO = /\b(sou|aqui [ée]|meu nome [ée])\b[^.\n]{0,40}\b(consultor[a]?|da via ?air|de via ?air)\b/iu;
  const COMO_AJUDAR = /^(tudo bem\??\s*)?(como (posso|eu posso) (te )?ajudar( hoje)?\??|em que posso (te )?ajudar\??|tudo bem( com voc[êe])?\??)$/iu;

  const kept = fullText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !(SAUDACAO.test(b) || APRESENTACAO.test(b) || COMO_AJUDAR.test(b)));

  // Se sobrou nada (resposta era só saudação), devolve o texto original.
  return kept.length ? kept.join("\n\n") : fullText;
}

/**
 * Junta balões consecutivos que são perguntas num único balão (uma por linha)
 * e garante "?" no final de cada pergunta. Evita a metralhadora de 5 balões.
 */
export function mergeQuestionBubbles(fullText: string): string {
  // Saudação/apresentação NUNCA se junta com pergunta — são balões próprios.
  const SAUDACAO_OU_APRESENTACAO =
    /^(oi+|ol[áa]|bom dia|boa tarde|boa noite|e a[íi])\b/iu;
  const APRESENTACAO = /\b(sou|aqui [ée]|meu nome [ée])\b[^.\n]{0,60}\b(consultor[a]?|via ?air)\b/iu;

  const withoutMarker = (b: string) =>
    b.replace(/^\s*(?:[-•▪◦‣⁃]|\d+[.)])\s*/u, "").trim();
  const isPergunta = (b: string) => {
    const clean = withoutMarker(b);
    return !clean.includes("\n") &&
    clean.length <= 120 &&
    !SAUDACAO_OU_APRESENTACAO.test(clean) &&
    !APRESENTACAO.test(clean) &&
    (/\?\s*$/.test(clean) ||
      /^(seria|quantos|quantas|voc[êe] tem|tem alguma|qual|quais|prefere|precisa|de onde|para quando|pra quando|em que|me diz|poderia)\b/iu.test(
        clean,
      ));
  };

  const bubbles = fullText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (!buffer.length) return;
    const questions = buffer.map((q) => {
      const clean = q.replace(/^\s*(?:[-•▪◦‣⁃]|\d+[.)])\s*/u, "").trim();
      return /[?!.…]$/.test(clean) ? clean : `${clean}?`;
    });
    // Quando há um briefing com várias perguntas, todas recebem o mesmo
    // marcador — inclusive a primeira. Isso evita o primeiro tópico "solto".
    out.push(questions.length > 1 ? questions.map((q) => `- ${q}`).join("\n") : questions[0]);
    buffer = [];
  };
  for (const b of bubbles) {
    if (isPergunta(b)) buffer.push(b);
    else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out.join("\n\n");
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
 * Remove balões em que o modelo INVENTA falha de envio das artes
 * ("tive um probleminha pra mandar as imagens", "posso te passar por texto?")
 * quando os cartões de voo na verdade foram entregues neste mesmo turno.
 */
export function stripFakeImageFailure(fullText: string): string {
  const FALHA =
    /(probleminha|problema|instabilidade|falha|dificuldade|erro|n[aã]o consegui|n[aã]o foi poss[íi]vel)[^\n]{0,80}(imagem|imagens|arte|artes|foto|fotos|enviar|mandar)/iu;
  const OFERTA_TEXTO =
    /(passar|mandar|enviar|te passo|posso te passar)[^\n]{0,60}(por (aqui )?texto|em texto|por escrito)/iu;
  const kept = fullText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !FALHA.test(b) && !OFERTA_TEXTO.test(b));
  return kept.join("\n\n");
}
