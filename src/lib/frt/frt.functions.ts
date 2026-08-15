import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const searchSchema = z.object({
  origem: z.string().min(2).max(200),
  destino: z.string().min(2).max(200),
  ida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  adultos: z.number().int().min(1).max(9).optional(),
  criancas: z.number().int().min(0).max(9).optional(),
  pais: z.string().max(60).optional(),
  companhia: z.string().max(60).optional(),
  origemLabel: z.string().max(200).optional(),
  destinoLabel: z.string().max(200).optional(),
  origemValue: z.string().max(200).optional(),
  destinoValue: z.string().max(200).optional(),
});

const componenteSchema = z.enum(["origem", "destino"]);

/** Sugestões reais do autocomplete PrimeFaces da FRT (query). */
export const sugestoesLocalFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ componente: componenteSchema, termo: z.string().min(3).max(60) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { frtSugestoesLocal } = await import("@/lib/frt/frt-connector.server");
    return frtSugestoesLocal(data.componente, data.termo);
  });

/** Confirma a escolha do usuário executando o itemSelect real na FRT. */
export const selecionarLocalFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        componente: componenteSchema,
        termo: z.string().min(2).max(60),
        value: z.string().min(1).max(200),
        label: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { frtSelecionarLocal } = await import("@/lib/frt/frt-connector.server");
    return frtSelecionarLocal(data.componente, data.termo, {
      value: data.value,
      label: data.label ?? "",
    });
  });

/** Consulta read-only na FRT/Infotravel. Nunca reserva nem adiciona ao carrinho. */
export const consultarFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data }) => {
    const { consultarFRT } = await import("@/lib/frt/frt-connector.server");
    return consultarFRT(data);
  });

/** Diagnóstico do POST de pesquisa (resposta bruta + updates), sem alterar o parser. */
export const diagnosticarPesquisaFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data }) => {
    const { frtDiagnosticoPesquisa } = await import("@/lib/frt/frt-connector.server");
    return frtDiagnosticoPesquisa(data);
  });

/** Diagnóstico da conexão (login + campos do formulário), sem pesquisar. */
export const diagnosticarFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ novaSessao: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { frtDiagnostico } = await import("@/lib/frt/frt-connector.server");
    return frtDiagnostico(!data.novaSessao);
  });

/** Envia o código de verificação que a FRT manda por e-mail (etapa de login). */
export const enviarCodigoFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ codigo: z.string().min(3).max(12) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { frtEnviarCodigo } = await import("@/lib/frt/frt-connector.server");
    return frtEnviarCodigo(data.codigo);
  });

/** Tenta concluir o 2FA sozinho, lendo o código na caixa dedicada. */
export const resolver2faAutomaticoFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { frtResolver2faAutomatico } = await import("@/lib/frt/frt-connector.server");
    return frtResolver2faAutomatico(60_000);
  });

/** Estado do desafio 2FA pendente (bloqueia novos logins enquanto ativo). */
export const estado2faFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { frtEstado2fa } = await import("@/lib/frt/frt-connector.server");
    return frtEstado2fa();
  });

/** Descarta o desafio 2FA pendente, liberando um novo login manual. */
export const cancelar2faFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { frtCancelar2fa } = await import("@/lib/frt/frt-connector.server");
    frtCancelar2fa();
    return { ok: true };
  });

/** Verificação rápida (sem espera) da caixa dedicada — usada em polling pela UI. */
export const poll2faFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { frtPoll2fa } = await import("@/lib/frt/frt-connector.server");
    return frtPoll2fa();
  });

/** Liga/desliga a busca automática do código (retorna na hora). */
export const buscaAutomatica2faFrt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ativo: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { frtBuscaAutomatica2fa } = await import("@/lib/frt/frt-connector.server");
    return frtBuscaAutomatica2fa(data.ativo);
  });
