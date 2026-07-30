import { Check, CheckCheck, FileText, Download, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { firstName } from "@/lib/whatsapp/text-utils.shared";

type Media = { kind: "image" | "document" | "audio" | "video"; url: string; filename: string };
function safeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const maybe = value as { text?: unknown; body?: unknown; caption?: unknown; url?: unknown; filename?: unknown; type?: unknown };
    const text = maybe.text ?? maybe.body ?? maybe.caption;
    if (typeof text === "string") return text;
    if (typeof maybe.url === "string") {
      const filename = typeof maybe.filename === "string" ? maybe.filename : "arquivo";
      const type = typeof maybe.type === "string" ? maybe.type : "document";
      return `[[media:${type}|${maybe.url}|${filename}]]`;
    }
  }
  return String(value);
}

function parseMedia(content: unknown): { media: Media | null; text: string } {
  const normalized = safeText(content);
  const m = normalized.match(/^\[\[media:(image|document|audio|video)\|([^|]+)\|([^\]]+)\]\](?:\n([\s\S]*))?$/);
  if (!m) return { media: null, text: normalized };
  return { media: { kind: m[1] as Media["kind"], url: m[2], filename: m[3] }, text: (m[4] ?? "").trim() };
}

interface Props {
  side: "in" | "out";
  content: unknown;
  timestamp: string; // ISO
  senderLabel?: string; // qualquer nome (completo ou não) — o balão extrai o primeiro
  status?: "sent" | "delivered" | "read" | "failed";
  deleted?: boolean;
  /** Marca visual "respondida" — aparece uma setinha ↩ ao lado do horário */
  replied?: boolean;
  /** Prévia da mensagem citada (reply/quote) */
  reply?: { sender?: string | null; snippet: unknown } | null;
  /** Handler pra "Responder" — clica na setinha que aparece no hover */
  onReply?: () => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function WhatsAppBubble({ side, content, timestamp, senderLabel, status, deleted, replied, reply, onReply }: Props) {
  const isOut = side === "out";
  const label = firstName(senderLabel);
  const replySender = firstName(reply?.sender ?? null);
  const replySnippet = safeText(reply?.snippet).trim();
  return (
    <div className={cn("group flex w-full items-center gap-1", isOut ? "justify-end" : "justify-start")}>
      {isOut && onReply && !deleted && (
        <button
          onClick={onReply}
          title="Responder"
          className="hidden h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white opacity-0 transition-opacity hover:bg-black/30 group-hover:opacity-100 group-hover:flex"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </button>
      )}
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
        {reply && (
          <div
            className="mb-1 truncate rounded-md border-l-4 bg-black/10 px-2 py-1 text-[11px] leading-tight"
            style={{ borderColor: "var(--brand-orange)", color: "color-mix(in oklab, var(--chat-bubble-fg) 80%, transparent)" }}
          >
            {replySender && <div className="font-semibold" style={{ color: "var(--brand-orange)" }}>{replySender}</div>}
            <div className="line-clamp-2 opacity-80">{replySnippet || "mensagem"}</div>
          </div>
        )}
        {(() => {
          const { media, text } = parseMedia(content);
          return (
            <>
              {media?.kind === "image" && (
                <a href={media.url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                  <img src={media.url} alt={media.filename} className="max-h-72 w-full rounded-md object-cover" />
                </a>
              )}
              {media?.kind === "audio" && (
                <audio src={media.url} controls preload="none" className="mb-1 w-56 max-w-full" />
              )}
              {media?.kind === "video" && (
                <video src={media.url} controls preload="metadata" className="mb-1 max-h-72 w-full rounded-md" />
              )}
              {media?.kind === "document" && (
                <a
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-1 flex items-center gap-2 rounded-md border border-black/10 bg-black/5 px-2 py-1.5 text-xs hover:bg-black/10"
                  style={{ color: "var(--chat-bubble-fg)" }}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{media.filename}</span>
                  <Download className="h-3.5 w-3.5 opacity-70" />
                </a>
              )}
              {text && (
                <div className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", deleted && "opacity-60")}>{text}</div>
              )}
              {deleted && (
                <div className="mt-1 text-[11px] font-medium italic text-red-500">
                  🚫 mensagem apagada
                </div>
              )}
            </>
          );
        })()}
        <div
          className={cn("mt-1 flex items-center gap-1 text-[10px]", isOut ? "justify-end" : "justify-start")}
          style={{ color: "color-mix(in oklab, var(--chat-bubble-fg) 55%, transparent)" }}
        >
          <span>{formatTime(timestamp)}</span>
          {replied && (
            <span title="Respondida" className="flex items-center gap-0.5 text-[10px]" style={{ color: "var(--brand-orange)" }}>
              <CornerUpLeft className="h-3 w-3" />
            </span>
          )}
          {isOut && status && (
            status === "failed" ? (
              <span className="flex items-center gap-0.5 font-medium text-red-500" title="Não entregue">
                <AlertCircle className="h-3 w-3" /> não entregue
              </span>
            ) : status === "read" ? (
              <CheckCheck className="h-3 w-3 text-blue-500" />
            ) : status === "delivered" ? (
              <CheckCheck className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )
          )}

        </div>
      </div>
      {!isOut && onReply && !deleted && (
        <button
          onClick={onReply}
          title="Responder"
          className="hidden h-7 w-7 items-center justify-center rounded-full bg-black/20 text-white opacity-0 transition-opacity hover:bg-black/30 group-hover:opacity-100 group-hover:flex"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </button>
      )}
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
