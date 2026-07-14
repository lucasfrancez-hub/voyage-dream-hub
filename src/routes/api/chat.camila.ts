import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { CAMILA_SYSTEM_PROMPT } from "@/lib/chat/camila-prompt";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

type ChatRequestBody = { messages?: unknown };

export const Route = createFileRoute("/api/chat/camila")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("openai/gpt-5.4-mini");

        const result = streamText({
          model,
          system: CAMILA_SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages as UIMessage[]),
          temperature: 0.7,
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
        });
      },
    },
  },
});
