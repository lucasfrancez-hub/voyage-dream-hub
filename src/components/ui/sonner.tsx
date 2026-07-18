import { Toaster as Sonner } from "sonner";
import { CheckCircle2, AlertTriangle, Info, XCircle, Loader2 } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      offset={20}
      gap={10}
      duration={3800}
      visibleToasts={4}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />,
        error: <XCircle className="h-4 w-4 text-rose-400" strokeWidth={2.2} />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-400" strokeWidth={2.2} />,
        info: <Info className="h-4 w-4 text-sky-400" strokeWidth={2.2} />,
        loading: <Loader2 className="h-4 w-4 text-primary animate-spin" strokeWidth={2.2} />,
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            "group toast pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-neutral-900/95 px-4 py-3 text-sm text-neutral-100 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl ring-1 ring-black/5",
          title: "font-medium tracking-tight text-neutral-50",
          description: "text-xs text-neutral-400",
          icon: "flex h-6 w-6 items-center justify-center rounded-full bg-white/5",
          actionButton:
            "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors",
          cancelButton:
            "rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/15 transition-colors",
          closeButton:
            "!bg-white/10 !border-white/10 !text-neutral-300 hover:!bg-white/20",
          success: "!border-emerald-500/20",
          error: "!border-rose-500/25",
          warning: "!border-amber-500/25",
          info: "!border-sky-500/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
