import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

// Webhook público da ClickSign. Recebe eventos de assinatura e atualiza o banco.
// Documentação: https://developers.clicksign.com/docs/webhook

type ClickSignEvent = {
  event?: {
    name?: string; // "sign" | "auto_close" | "refusal" | "cancel" | "deadline" | "close" | "add_signer" | ...
    data?: {
      signer?: { key?: string };
      user?: { email?: string; name?: string };
    };
    occurred_at?: string;
  };
  document?: {
    key?: string;
    status?: string;
    downloads?: {
      signed_file_url?: string;
      original_file_url?: string;
    };
    signers?: Array<{ key?: string; email?: string }>;
  };
};

export const Route = createFileRoute("/api/public/clicksign-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CLICKSIGN_HMAC_SECRET;
        if (!secret) {
          console.error("[clicksign-webhook] CLICKSIGN_HMAC_SECRET não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }

        const rawBody = await request.text();

        // ClickSign envia o header "Content-Hmac: sha256=<hex>"
        const header = request.headers.get("Content-Hmac") ?? request.headers.get("content-hmac") ?? "";
        const receivedHex = header.startsWith("sha256=") ? header.slice(7) : header;
        const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");

        try {
          const a = Buffer.from(receivedHex, "hex");
          const b = Buffer.from(expectedHex, "hex");
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            console.warn("[clicksign-webhook] HMAC inválido");
            return new Response("Invalid signature", { status: 401 });
          }
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: ClickSignEvent;
        try {
          payload = JSON.parse(rawBody) as ClickSignEvent;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const eventName = payload.event?.name ?? "";
        const documentKey = payload.document?.key;
        if (!documentKey) {
          console.warn("[clicksign-webhook] evento sem document.key", eventName);
          return new Response("ok");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: assinatura } = await supabaseAdmin
          .from("pedido_assinaturas")
          .select("id,pedido_id,status")
          .eq("clicksign_document_key", documentKey)
          .maybeSingle();

        if (!assinatura) {
          console.warn("[clicksign-webhook] assinatura não encontrada para", documentKey);
          return new Response("ok");
        }

        // Log bruto do último evento
        await supabaseAdmin
          .from("pedido_assinaturas")
          .update({ raw_last_event: JSON.parse(JSON.stringify(payload)) })
          .eq("id", assinatura.id);

        const signerKey = payload.event?.data?.signer?.key;

        if (eventName === "sign" && signerKey) {
          await supabaseAdmin
            .from("pedido_assinatura_signers")
            .update({ status: "signed", signed_at: new Date().toISOString() })
            .eq("assinatura_id", assinatura.id)
            .eq("clicksign_signer_key", signerKey);
        }

        if (eventName === "refusal" || eventName === "refuse") {
          if (signerKey) {
            await supabaseAdmin
              .from("pedido_assinatura_signers")
              .update({ status: "refused", refused_at: new Date().toISOString() })
              .eq("assinatura_id", assinatura.id)
              .eq("clicksign_signer_key", signerKey);
          }
          await supabaseAdmin
            .from("pedido_assinaturas")
            .update({ status: "refused" })
            .eq("id", assinatura.id);
        }

        if (eventName === "cancel") {
          await supabaseAdmin
            .from("pedido_assinaturas")
            .update({ status: "canceled" })
            .eq("id", assinatura.id);
        }

        if (eventName === "auto_close" || eventName === "close") {
          // Baixa o PDF assinado e guarda no storage
          const signedFileUrl = payload.document?.downloads?.signed_file_url;
          let signedPdfPath: string | null = null;

          if (signedFileUrl) {
            try {
              const pdfRes = await fetch(signedFileUrl);
              if (pdfRes.ok) {
                const buf = new Uint8Array(await pdfRes.arrayBuffer());
                const path = `${assinatura.pedido_id}/${documentKey}.pdf`;
                const { error: upErr } = await supabaseAdmin.storage
                  .from("assinaturas")
                  .upload(path, buf, { contentType: "application/pdf", upsert: true });
                if (upErr) console.error("[clicksign-webhook] upload err:", upErr.message);
                else signedPdfPath = path;

                // Também anexa em "Vouchers e contratos" do pedido
                const friendlyName = `${Date.now()}-contrato-assinado.pdf`;
                const contratoPath = `${assinatura.pedido_id}/${friendlyName}`;
                const { error: upErr2 } = await supabaseAdmin.storage
                  .from("order-documents")
                  .upload(contratoPath, buf, { contentType: "application/pdf", upsert: true });
                if (upErr2) console.error("[clicksign-webhook] upload contrato err:", upErr2.message);
              } else {
                console.error("[clicksign-webhook] falha ao baixar PDF assinado", pdfRes.status);
              }
            } catch (e) {
              console.error("[clicksign-webhook] erro baixando PDF:", e);
            }
          }

          await supabaseAdmin
            .from("pedido_assinaturas")
            .update({
              status: "closed",
              ...(signedPdfPath ? { signed_pdf_path: signedPdfPath } : {}),
            })
            .eq("id", assinatura.id);
        }

        return new Response("ok");
      },
    },
  },
});
