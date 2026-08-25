/**
 * Estética única dos motores de busca (aéreo, hotel, pacotes, carro,
 * exclusivos e seguros). O padrão é o motor AÉREO — qualquer outro motor
 * deve importar estas classes em vez de recriar estilos próprios.
 */

/** Bloco/cartão que envolve o formulário de busca. */
export const ENGINE_CARD =
  "rounded-[32px] border border-border/50 bg-card/60 p-6 shadow-2xl backdrop-blur-xl md:p-8";

/** Rótulo acima de cada campo. */
export const ENGINE_LABEL =
  "flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

/** Campo de entrada (input, autocomplete, gatilho de popover). */
export const ENGINE_FIELD =
  "h-12 rounded-xl border-border/40 bg-muted/40 px-4 text-sm font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary/50 sm:text-base";

/** Caixa que embrulha um select/campo com ícone à esquerda. */
export const ENGINE_FIELD_BOX =
  "flex h-12 items-center gap-2 rounded-xl border border-border/40 bg-muted/40 px-4 text-sm font-semibold transition-all focus-within:ring-2 focus-within:ring-primary/50";

/** Botão principal de busca. */
export const ENGINE_BUTTON =
  "h-12 w-full rounded-xl font-bold shadow-xl shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95";

/** Rótulo pequeno dos contadores de passageiros/quartos. */
export const ENGINE_PAX_LABEL =
  "mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground";

/** Campo numérico dos contadores de passageiros/quartos. */
export const ENGINE_PAX_INPUT =
  "h-8 w-16 rounded-lg border-border/50 bg-muted/40 px-2 text-center";

/** Espaçamento padrão entre rótulo e campo. */
export const ENGINE_FIELD_WRAP = "space-y-2";
