import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Busca passageiros já cadastrados em pedidos anteriores (nome, CPF, passaporte). */
export const passhubBuscarPassageiros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ termo: z.string().max(80) }).parse(raw))
  .handler(async ({ data, context }) => {
    const termo = data.termo.trim();
    if (termo.length < 2) return { ok: true as const, passageiros: [] };

    const { separarNome } = await import("./pax-assist.server");
    const like = `%${termo.replace(/[%,]/g, " ")}%`;
    const { data: linhas, error } = await context.supabase
      .from("order_passengers")
      .select(
        "id, full_name, birth_date, cpf, doc_type, document, passport_number, passport_issue_date, passport_expiry_date, whatsapp, updated_at",
      )
      .or(`full_name.ilike.${like},cpf.ilike.${like},passport_number.ilike.${like}`)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (error) return { ok: false as const, erro: error.message };

    const vistos = new Set<string>();
    const passageiros = (linhas ?? [])
      .map((l) => {
        const { nome, sobrenome } = separarNome(l.full_name ?? "");
        const cpf = (l.cpf ?? "").replace(/\D/g, "");
        const passaporte = (l.passport_number ?? l.document ?? "").toUpperCase();
        const usaCpf = !!cpf || l.doc_type === "cpf";
        const tel = (l.whatsapp ?? "").replace(/\D/g, "");
        const semDdi = tel.startsWith("55") ? tel.slice(2) : tel;
        return {
          id: l.id,
          nomeCompleto: (l.full_name ?? "").toUpperCase(),
          nome,
          sobrenome,
          nascimento: l.birth_date ?? "",
          documentoTipo: (usaCpf ? "cpf" : "passport") as "cpf" | "passport",
          documento: usaCpf ? cpf : passaporte,
          emissao: l.passport_issue_date ?? "",
          validade: l.passport_expiry_date ?? "",
          ddi: tel ? "55" : "",
          ddd: semDdi.slice(0, 2),
          telefone: semDdi.slice(2),
        };
      })
      .filter((p) => {
        const chave = `${p.nomeCompleto}|${p.documento}`;
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return !!p.nomeCompleto;
      })
      .slice(0, 12);

    return { ok: true as const, passageiros };
  });

/** Lê foto de documento / texto colado com IA e devolve os campos preenchidos. */
export const passhubLerPassageiros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        texto: z.string().max(8000).optional().nullable(),
        imagens: z.array(z.string().max(8_000_000)).max(4).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { extrairPaxComIA } = await import("./pax-assist.server");
    try {
      return { ok: true as const, passageiros: await extrairPaxComIA(data) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao ler os dados." };
    }
  });
