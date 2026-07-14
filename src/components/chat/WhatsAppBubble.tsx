import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  side: "in" | "out";
  content: string;
  timestamp: string; // ISO
  senderLabel?: string; // "Camila", "Roberto", "Você"
  status?: "sent" | "delivered" | "read";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppBubble({ side, content, timestamp, senderLabel, status }: Props) {
  const isOut = side === "out";
  return (
    <div className={cn("flex w-full", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[70%] rounded-lg px-3 py-2 shadow-sm",
          isOut ? "bg-[#DCF8C6] text-slate-900" : "bg-white text-slate-900",
        )}
      >
        {senderLabel && isOut && (
          <div className="mb-0.5 text-[11px] font-medium text-[#F26B1F]">{senderLabel}</div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</div>
        <div className={cn("mt-1 flex items-center gap-1 text-[10px] text-slate-500", isOut ? "justify-end" : "justify-start")}>
          <span>{formatTime(timestamp)}</span>
          {isOut && status && (
            status === "read" ? (
              <CheckCheck className="h-3 w-3 text-blue-500" />
            ) : status === "delivered" ? (
              <CheckCheck className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-md bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
        {label}
      </span>
    </div>
  );
}
