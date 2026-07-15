import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { firstName } from "@/lib/whatsapp/text-utils.shared";

interface Props {
  side: "in" | "out";
  content: string;
  timestamp: string; // ISO
  senderLabel?: string; // qualquer nome (completo ou não) — o balão extrai o primeiro
  status?: "sent" | "delivered" | "read";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppBubble({ side, content, timestamp, senderLabel, status }: Props) {
  const isOut = side === "out";
  const label = firstName(senderLabel);
  return (
    <div className={cn("flex w-full", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[70%] rounded-lg px-3 py-2 shadow-sm",
          isOut ? "bg-[var(--chat-bubble-out)]" : "bg-[var(--chat-bubble-in)]",
        )}
        style={{ color: "var(--chat-bubble-fg)" }}
      >
        {label && (
          <div
            className="mb-0.5 text-[11px] font-bold"
            style={{ color: isOut ? "var(--brand-orange)" : "color-mix(in oklab, var(--chat-bubble-fg) 65%, transparent)" }}
          >
            {label}:
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</div>
        <div
          className={cn("mt-1 flex items-center gap-1 text-[10px]", isOut ? "justify-end" : "justify-start")}
          style={{ color: "color-mix(in oklab, var(--chat-bubble-fg) 55%, transparent)" }}
        >
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
      <span className="rounded-md bg-[var(--chat-panel-raised)]/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
        {label}
      </span>
    </div>
  );
}
