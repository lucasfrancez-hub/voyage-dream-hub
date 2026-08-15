import * as React from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Pill({
  children,
  active,
  onClick,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "solid" | "ghost";
  className?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
        tone === "solid" && "bg-primary text-primary-foreground",
        tone !== "solid" &&
          (active
            ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--brand-orange)]"
            : "border border-border bg-card/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"),
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  className,
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all active:scale-[0.98]",
        size === "sm" && "px-4 py-2 text-xs",
        size === "md" && "px-5 py-2.5 text-sm",
        size === "lg" && "px-7 py-3.5 text-base",
        variant === "primary" && "bg-primary text-primary-foreground hover:brightness-110",
        variant === "outline" && "border border-primary/60 text-primary hover:bg-primary/10",
        variant === "ghost" && "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tabs({
  items,
  value,
  onChange,
  variant = "pill",
}: {
  items: { key: string; label: string; badge?: React.ReactNode }[];
  value: string;
  onChange: (k: string) => void;
  variant?: "pill" | "underline" | "segment";
}) {
  if (variant === "underline") {
    return (
      <div className="flex gap-6 overflow-x-auto border-b border-border">
        {items.map((i) => (
          <button
            key={i.key}
            onClick={() => onChange(i.key)}
            className={cx(
              "-mb-px shrink-0 border-b-2 pb-3 text-sm font-semibold transition-colors",
              value === i.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {i.label}
            {i.badge != null && <span className="ml-1.5 text-[11px] opacity-70">{i.badge}</span>}
          </button>
        ))}
      </div>
    );
  }
  if (variant === "segment") {
    return (
      <div className="inline-flex rounded-full border border-border bg-card/60 p-1">
        {items.map((i) => (
          <button
            key={i.key}
            onClick={() => onChange(i.key)}
            className={cx(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
              value === i.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {i.label}
            {i.badge != null && <span className="ml-1 opacity-70">{i.badge}</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Pill key={i.key} active={value === i.key} onClick={() => onChange(i.key)}>
          {i.label}
          {i.badge != null && <span className="opacity-70">{i.badge}</span>}
        </Pill>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  side = "center",
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: "center" | "right" | "bottom";
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(
          "relative z-10 overflow-y-auto border-border bg-card shadow-2xl",
          side === "center" &&
            cx("m-auto max-h-[88%] w-[92%] rounded-3xl border", wide ? "max-w-5xl" : "max-w-2xl"),
          side === "right" && "ml-auto h-full w-full max-w-xl border-l",
          side === "bottom" && "mt-auto max-h-[88%] w-full rounded-t-3xl border-t",
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full bg-background/80 p-2 text-foreground backdrop-blur hover:bg-background"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function Lightbox({
  fotos,
  index,
  onClose,
  onIndex,
  legenda,
}: {
  fotos: string[];
  index: number | null;
  onClose: () => void;
  onIndex: (i: number) => void;
  legenda?: string;
}) {
  if (index === null) return null;
  const prev = () => onIndex((index - 1 + fotos.length) % fotos.length);
  const next = () => onIndex((index + 1) % fotos.length);
  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-black/92 p-4" onClick={onClose}>
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>
          {index + 1} / {fotos.length} {legenda ? `• ${legenda}` : ""}
        </span>
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-1 items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={prev} className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <img src={fotos[index]} alt="" className="mx-auto max-h-full min-h-0 flex-1 rounded-2xl object-contain" />
        <button onClick={next} className="rounded-full bg-white/10 p-3 text-white hover:bg-white/20">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
        {fotos.map((f, i) => (
          <button key={f + i} onClick={() => onIndex(i)}>
            <img
              src={f}
              alt=""
              className={cx(
                "h-14 w-20 rounded-lg object-cover transition-opacity",
                i === index ? "opacity-100 ring-2 ring-primary" : "opacity-50",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-2xl border border-border bg-card/70 backdrop-blur", className)}>{children}</div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cx("mb-6", align === "center" && "text-center")}>
      {eyebrow && (
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</div>
      )}
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      {sub && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Cabeçalho VIA AIR usado dentro dos protótipos (não é o header real do site). */
export function FakeTopBar({ active = "Cruzeiros" }: { active?: string }) {
  const menu = ["Início", "Pacotes", "Cruzeiros", "Passagens", "Contato"];
  return (
    <div className="sticky top-0 z-40 border-b border-white/5 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5">
        <div className="flex items-center gap-2">
          <div className="relative h-5 w-8">
            <span className="absolute left-0 top-0 h-2 w-7 -skew-x-[22deg] rounded-[10px_3px_10px_3px] bg-gradient-to-r from-[var(--brand-orange)] to-[var(--brand-blue)]" />
            <span className="absolute bottom-0 left-1.5 h-2 w-7 -skew-x-[22deg] rounded-[10px_3px_10px_3px] bg-gradient-to-r from-[var(--brand-orange)] to-[var(--brand-blue)]" />
          </div>
          <span className="text-[17px] tracking-[0.06em]">
            <b className="font-semibold">VIA</b> <span className="font-light text-[var(--brand-blue)]">AIR</span>
          </span>
        </div>
        <nav className="hidden gap-6 text-xs text-muted-foreground md:flex">
          {menu.map((m) => (
            <span key={m} className={cx(m === active && "font-bold text-primary")}>
              {m}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex gap-2">
          <Pill className="hidden sm:inline-flex">Meus pedidos</Pill>
          <Pill tone="solid">Falar com consultor</Pill>
        </div>
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}
