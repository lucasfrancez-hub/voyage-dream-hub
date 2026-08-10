import type {
  AjusteAudio,
  BlocoNarrativo,
  CorteEdl,
  PlanoEditorial,
  Preservacao,
  Remocao,
  TipoRemocao,
} from "./plan";

/** Converte o JSON da IA em um plano editorial válido e coerente com o material. */
export function normalizarPlano(bruto: unknown, duracaoMs: number, formato: string): PlanoEditorial {
  const o = (bruto ?? {}) as Record<string, any>;
  const num = (v: unknown, fb = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : fb);
  const clamp = (v: number) => Math.max(0, Math.min(duracaoMs || v, v));

  const cortes: CorteEdl[] = (Array.isArray(o.cortes) ? o.cortes : [])
    .map((c: any) => ({
      sourceInMs: clamp(num(c?.sourceInMs)),
      sourceOutMs: clamp(num(c?.sourceOutMs)),
      bloco: typeof c?.bloco === "string" ? c.bloco : undefined,
      rotulo: typeof c?.rotulo === "string" ? c.rotulo : undefined,
      continuidade: ["jcut", "lcut"].includes(c?.continuidade) ? c.continuidade : "nenhuma",
    }))
    .filter((c: CorteEdl) => c.sourceOutMs - c.sourceInMs >= 200)
    .sort((a: CorteEdl, b: CorteEdl) => a.sourceInMs - b.sourceInMs);

  // remove sobreposições entre tomadas
  const limpos: CorteEdl[] = [];
  for (const c of cortes) {
    const ult = limpos[limpos.length - 1];
    if (ult && c.sourceInMs < ult.sourceOutMs) {
      if (c.sourceOutMs - ult.sourceOutMs < 200) continue;
      c.sourceInMs = ult.sourceOutMs;
    }
    limpos.push(c);
  }

  const tipos: TipoRemocao[] = ["falso_comeco", "repeticao", "erro", "pausa_longa", "frase_interrompida", "tomada_pior", "off_topic"];

  const remocoes: Remocao[] = (Array.isArray(o.remocoes) ? o.remocoes : []).map((r: any) => ({
    fromMs: clamp(num(r?.fromMs)),
    toMs: clamp(num(r?.toMs)),
    tipo: tipos.includes(r?.tipo) ? r.tipo : "erro",
    motivo: String(r?.motivo ?? "").slice(0, 220) || "Trecho removido pelo editor.",
  }));

  const preservar: Preservacao[] = (Array.isArray(o.preservar) ? o.preservar : []).map((p: any) => ({
    fromMs: clamp(num(p?.fromMs)),
    toMs: clamp(num(p?.toMs)),
    motivo: String(p?.motivo ?? "").slice(0, 220) || "Pausa preservada de propósito.",
  }));

  const audio: AjusteAudio[] = (Array.isArray(o.audio) ? o.audio : [])
    .map((a: any) => ({
      fromMs: clamp(num(a?.fromMs)),
      toMs: clamp(num(a?.toMs)),
      ganhoDb: Math.max(-6, Math.min(6, Number(a?.ganhoDb) || 0)),
      motivo: String(a?.motivo ?? "").slice(0, 220) || "Nível fora da média da voz.",
    }))
    .filter((a: AjusteAudio) => Math.abs(a.ganhoDb) >= 0.5 && a.toMs > a.fromMs);

  const blocos: BlocoNarrativo[] = (Array.isArray(o.blocos) ? o.blocos : []).map((b: any) => ({
    titulo: String(b?.titulo ?? "Bloco").slice(0, 60),
    papel: ["gancho", "desenvolvimento", "prova", "conclusao", "cta"].includes(b?.papel) ? b.papel : "desenvolvimento",
    fromMs: clamp(num(b?.fromMs)),
    toMs: clamp(num(b?.toMs)),
    resumo: typeof b?.resumo === "string" ? b.resumo.slice(0, 240) : undefined,
  }));

  const total = limpos.reduce((s, c) => s + (c.sourceOutMs - c.sourceInMs), 0);
  const pres = (o.preservacoes ?? {}) as Record<string, any>;
  const cont = (o.continuidade ?? {}) as Record<string, any>;

  return {
    criadoEm: new Date().toISOString(),
    intencao: String(o.intencao ?? "").slice(0, 400),
    estrategia: String(o.estrategia ?? "").slice(0, 1200),
    formatoRecomendado: ["vertical", "feed", "horizontal", "quadrado"].includes(o.formatoRecomendado)
      ? o.formatoRecomendado
      : (formato as PlanoEditorial["formatoRecomendado"]) || "vertical",
    originalMs: duracaoMs,
    estimativaMinMs: num(o.estimativaMinMs, Math.round(total * 0.9)),
    estimativaMaxMs: num(o.estimativaMaxMs, Math.round(total * 1.1)),
    ritmo: ["calmo", "equilibrado", "acelerado"].includes(o.ritmo) ? o.ritmo : "equilibrado",
    blocos,
    cortes: limpos,
    remocoes,
    preservar,
    audio,
    normalizarMix: Boolean(o.normalizarMix),
    preservacoes: {
      cor: pres.cor !== false,
      enquadramento: pres.enquadramento !== false,
      exposicao: pres.exposicao !== false,
      nitidez: pres.nitidez !== false,
      motivo: String(pres.motivo ?? "Imagem já adequada — nada a corrigir.").slice(0, 300),
    },
    continuidade: {
      usarJcuts: Boolean(cont.usarJcuts),
      overlapMs: Math.max(80, Math.min(600, num(cont.overlapMs, 220))),
      observacao: String(cont.observacao ?? "").slice(0, 300),
    },
    avisos: (Array.isArray(o.avisos) ? o.avisos : []).map((a: unknown) => String(a).slice(0, 200)).slice(0, 8),
  };
}

/** Transcrição em texto compacto com marcações de tempo para o prompt. */
export function transcricaoParaPrompt(segmentos: { start: number; end: number; text: string }[]) {
  return segmentos
    .map((s) => `[${Math.round(s.start)}-${Math.round(s.end)}] ${s.text.trim()}`)
    .join("\n")
    .slice(0, 58000);
}
