import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Primitivas visuais "cyber premium" compartilhadas pelos três cofres
 * (link seguro, convencional, boleto). Mesma linguagem visual do modal
 * de Novo Pacote: uppercase heavy, borders finas, laranja pontual.
 */

/** Input/textarea/select cyber padrão. */
export const cyberInput =
  "w-full bg-background/60 border border-border/70 rounded-lg px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange/30 transition-colors";

/** Label + campo em bloco. */
export function CyberField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-muted-foreground/70">{hint}</span>}
    </label>
  );
}

/**
 * Bloco essencial — cabeçalho instrumental com ícone lucide,
 * hairline inferior estilo cockpit e conteúdo padded.
 */
export function EssentialGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header className="flex items-center gap-2.5 border-b border-border/60 pb-2.5">
        {icon && <span className="text-brand-orange [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-[1.5]">{icon}</span>}
        <h3 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
          {title}
        </h3>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * Bloco colapsável para campos avançados. Mantém aparência instrumental
 * com contagem de campos preenchidos.
 */
export function CollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  filledCount,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  filledCount?: number;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-border/60 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className={`${open ? "text-brand-orange" : "text-muted-foreground"} transition-colors [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-[1.5]`}>
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground group-hover:text-foreground transition-colors">
                {title}
              </span>
              {typeof filledCount === "number" && filledCount > 0 && (
                <span className="inline-flex items-center rounded-sm bg-brand-orange/10 text-brand-orange px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest border border-brand-orange/20">
                  {filledCount}
                </span>
              )}
            </div>
            {hint && !open && (
              <p className="mt-1 text-[10px] text-muted-foreground/70 normal-case tracking-normal">{hint}</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180 text-brand-orange" : ""}`}
        />
      </button>
      {open && <div className="mt-5 space-y-4">{children}</div>}
    </section>
  );
}
