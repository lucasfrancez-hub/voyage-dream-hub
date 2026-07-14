import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import camilaAvatar from "@/assets/viaair-logo.png.asset.json";

interface CamilaChatProps {
  threadId: string;
  contactName?: string;
}

/**
 * Chat window: mimics WhatsApp bubbles.
 * Assistant bubbles use brand-orange accent, user bubbles muted (client-side).
 */
export function CamilaChat({ threadId, contactName }: CamilaChatProps) {
  const [initialMessages] = useState<UIMessage[]>(() => {
    // Optionally seed from localStorage per thread
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(`camila:${threadId}`);
      return raw ? (JSON.parse(raw) as UIMessage[]) : [];
    } catch {
      return [];
    }
  });

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat/camila" }),
    onFinish: ({ messages: msgs }) => {
      try {
        window.localStorage.setItem(`camila:${threadId}`, JSON.stringify(msgs));
      } catch {
        /* noop */
      }
    },
  });

  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full flex-col bg-[hsl(200_15%_10%)]">
      {/* Header estilo WhatsApp */}
      <header className="flex items-center gap-3 border-b border-border/40 bg-background/60 px-4 py-3">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-brand-orange/20 ring-1 ring-brand-orange/40">
          <img src={camilaAvatar.url} alt="Camila" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {contactName ?? "Teste — Camila IA"}
          </div>
          <div className="text-[11px] text-emerald-400">
            {isLoading ? "digitando…" : "online • atendida pela Camila (IA)"}
          </div>
        </div>
      </header>

      {/* Transcript */}
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-brand-orange/10 p-3 ring-1 ring-brand-orange/30">
                <img src={camilaAvatar.url} alt="" className="h-full w-full object-contain" />
              </div>
              <div className="text-sm">
                Comece uma conversa — a Camila responde como se fosse no WhatsApp
              </div>
              <div className="text-xs opacity-70">
                Ex.: "oi, tô querendo viajar em janeiro"
              </div>
            </div>
          )}

          {messages.map((m) => {
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            // Quebra por 2 linhas em balões separados (padrão WhatsApp)
            const bubbles = text.split(/\n{2,}/).filter((s) => s.trim().length > 0);
            return (
              <Message from={m.role} key={m.id}>
                <div className="flex max-w-[85%] flex-col gap-1">
                  {bubbles.length === 0 ? (
                    <MessageContent>
                      <MessageResponse>{text}</MessageResponse>
                    </MessageContent>
                  ) : (
                    bubbles.map((b, i) => (
                      <MessageContent key={i}>
                        <MessageResponse>{b}</MessageResponse>
                      </MessageContent>
                    ))
                  )}
                </div>
              </Message>
            );
          })}

          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Camila está digitando…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Composer */}
      <div className="border-t border-border/40 bg-background/60 px-4 py-3">
        <PromptInput
          onSubmit={(_, e) => {
            e.preventDefault();
            if (!input.trim() || isLoading) return;
            sendMessage({ text: input.trim() });
            setInput("");
          }}
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma mensagem…"
            autoFocus
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim() || isLoading} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
