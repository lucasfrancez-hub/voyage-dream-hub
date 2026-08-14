/**
 * Título comercial e frase de destino do orçamento público.
 * A frase é aleatória, mas estável por orçamento (seed = publicId).
 */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function limpaDestino(destino?: string | null): string | null {
  const d = (destino ?? "").split(/[-–—,(]/)[0].trim();
  if (!d || /^sua viagem$/i.test(d)) return null;
  return d;
}

/** "Pacote para Salvador" / "Passagens aéreas para Salvador" */
export function quoteHeadline(args: {
  type?: string | null;
  destination?: string | null;
  title?: string | null;
  hasHotel?: boolean;
}): string {
  const destino = limpaDestino(args.destination);
  if (!destino) return args.title || "Sua próxima viagem";
  const pacote = args.hasHotel || args.type === "TRIP_PACKAGE";
  return pacote ? `Pacote para ${destino}` : `Passagens aéreas para ${destino}`;
}

const FRASES_PACOTE = [
  (d: string) => `${d} está pronta para receber você — e nós cuidamos de cada detalhe.`,
  (d: string) => `Sua viagem para ${d} planejada do começo ao fim, sem dor de cabeça.`,
  (d: string) => `Dias inesquecíveis em ${d} esperando por você.`,
  (d: string) => `${d} do jeito certo: voos, hospedagem e tranquilidade no mesmo lugar.`,
  (d: string) => `Prepare as malas: ${d} vai render boas histórias.`,
  (d: string) => `Tudo o que ${d} tem de melhor, organizado em um único link.`,
  (d: string) => `Uma escapada completa para ${d}, pensada sob medida para você.`,
  (d: string) => `${d} combina descanso e descoberta — e essa proposta traz os dois.`,
  (d: string) => `Da decolagem ao check-out em ${d}, é só aproveitar.`,
  (d: string) => `Feito para você viver ${d} sem pressa e sem preocupação.`,
];

const FRASES_AEREO = [
  (d: string) => `O caminho mais tranquilo até ${d} começa aqui.`,
  (d: string) => `Voos selecionados para você chegar bem em ${d}.`,
  (d: string) => `${d} mais perto do que parece — é só escolher e embarcar.`,
  (d: string) => `Sua próxima decolagem tem destino: ${d}.`,
  (d: string) => `Escolhemos os melhores horários para a sua ida a ${d}.`,
  (d: string) => `Tarifa garantida e assento reservado rumo a ${d}.`,
  (d: string) => `Menos tempo pesquisando, mais tempo curtindo ${d}.`,
  (d: string) => `${d} te espera: confira os voos que separamos.`,
  (d: string) => `Do embarque ao pouso em ${d}, com quem entende de aéreo.`,
  (d: string) => `Uma proposta simples e direta para voar até ${d}.`,
];

export function quoteTagline(args: {
  type?: string | null;
  destination?: string | null;
  hasHotel?: boolean;
  seed?: string | null;
}): string {
  const destino = limpaDestino(args.destination);
  if (!destino) return "Todos os detalhes da sua viagem organizados em um único link.";
  const pacote = args.hasHotel || args.type === "TRIP_PACKAGE";
  const lista = pacote ? FRASES_PACOTE : FRASES_AEREO;
  const idx = hash(`${args.seed ?? destino}|${destino}`) % lista.length;
  return lista[idx](destino);
}
