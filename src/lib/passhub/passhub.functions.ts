import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato aaaa-mm-dd");
const iata = z.string().regex(/^[A-Za-z]{3}$/, "Código IATA de 3 letras");

const buscaSchema = z.object({
  trechos: z.array(z.object({ origem: iata, destino: iata, data: dataIso })).min(1).max(6),
  dataVolta: dataIso.optional().nullable(),
  adultos: z.number().int().min(1).max(9).default(1),
  criancas: z.number().int().min(0).max(8).optional(),
  bebes: z.number().int().min(0).max(8).optional(),
  classe: z.number().int().min(1).max(4).optional(),
  ravPercentual: z.number().min(0).max(100).optional(),
  pagina: z.number().int().min(1).max(20).optional(),
  porPagina: z.number().int().min(1).max(50).optional(),
  provedores: z.array(z.string().max(40)).max(20).optional(),
});

/** Diagnóstico: valida login/credenciais da conta PassHub. */
export const passhubStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { passhubPing } = await import("./client.server");
    return passhubPing();
  });

/** Estado da sessão guardada (sem expor o token). */
export const passhubSessaoInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { passhubSessaoStatus } = await import("./client.server");
    return passhubSessaoStatus();
  });

/** Força novo login (descarta a sessão atual e refaz a verificação). */
export const passhubReconectar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { passhubInvalidarToken, passhubPing } = await import("./client.server");
    await passhubInvalidarToken();
    return passhubPing();
  });


/** Busca aérea (ida, ida e volta e multitrecho) na PassHub. */
export const passhubBuscar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => buscaSchema.parse(input))
  .handler(async ({ data }) => {
    const { passhubBuscarVoos } = await import("./search.server");
    try {
      return { ok: true as const, resultado: await passhubBuscarVoos(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na busca PassHub";
      console.error("[passhub] busca falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Tarifação do voo escolhido (payload devolvido pela busca). */
export const passhubTarifarVoo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ payload: z.unknown() }).parse(input))
  .handler(async ({ data }) => {
    const { passhubTarifar } = await import("./search.server");
    try {
      return { ok: true as const, resultado: await passhubTarifar(data.payload) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao tarifar" };
    }
  });

/** Busca já normalizada para o motor interno (cards, filtros e ordenação). */
export const passhubMotorBuscar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => buscaSchema.parse(input))
  .handler(async ({ data }) => {
    const { passhubBuscarVoos } = await import("./search.server");
    const { normalizaBuscaPassHub } = await import("./normalize.server");
    const { passhubIncentivoPct } = await import("./incentivo.server");
    try {
      const [bruto, incentivoPct] = await Promise.all([
        passhubBuscarVoos(data),
        passhubIncentivoPct(false),
      ]);
      // O JSON original pode ter vários megabytes. A tela só precisa do
      // resultado normalizado para listar, filtrar e reservar as ofertas.
      return { ok: true as const, resultado: normalizaBuscaPassHub(bruto, incentivoPct) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na busca PassHub";
      console.error("[passhub] motor falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Campos opcionais chegam como "" quando o usuário não preenche; tratamos como ausentes. */
const vazioComoIndefinido = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const paxSchema = z.object({
  tipo: z.enum(["ADT", "CHD", "INF"]),
  nome: z.string().min(2).max(60),
  sobrenome: z.string().min(2).max(80),
  nascimento: dataIso,
  genero: z.enum(["M", "F"]),
  documentoTipo: z.enum(["cpf", "passport"]),
  documento: z.string().min(5).max(30),
  paisEmissor: vazioComoIndefinido(z.string().length(2)),
  paisResidencia: vazioComoIndefinido(z.string().length(2)),
  emissao: vazioComoIndefinido(dataIso),
  validade: vazioComoIndefinido(dataIso),
  email: z.string().email().max(120).optional().or(z.literal("")),
  ddi: z.string().max(4).optional(),
  ddd: z.string().max(3).optional(),
  telefone: z.string().max(20).optional(),
});

/** Revalida preço e disponibilidade da oferta escolhida (passo obrigatório antes de reservar). */
export const passhubTarifarOferta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        rateTokens: z.array(z.string().min(4)).min(1).max(6),
        provedor: z.string().max(40).default("CVC"),
        precoEsperado: z.number().min(0),
        ravPercentual: z.number().min(0).max(100).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubTarifarOferta: tarifar } = await import("./book.server");
    const { passhubMotivo } = await import("./client.server");
    try {
      return { ok: true as const, tarifacao: await tarifar(data) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao tarifar";
      const motivo = passhubMotivo(e);
      console.error(
        `[passhub] tarifar falhou: ${msg} | provedor=${data.provedor} tokens=${data.rateTokens.length} | ${motivo}`,
      );
      return { ok: false as const, erro: motivo ? `${msg} — ${motivo}` : msg, detalhe: motivo };
    }
  });


/** Cria a reserva na PassHub e devolve o localizador. */
export const passhubReservar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        pricedRateTokens: z.array(z.string().min(4)).min(1).max(6),
        provedor: z.string().max(40).default("CVC"),
        ravPercentual: z.number().min(0).max(100).nullable().optional(),
        paxs: z.array(paxSchema).min(1).max(9),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { passhubReservarOferta } = await import("./book.server");
    try {
      const reserva = await passhubReservarOferta(data);
      try {
        const idp = Number((reserva as any)?.idPassagem ?? (reserva as any)?.id ?? 0);
        if (idp > 0) {
          const { marcaDonoReserva } = await import("@/lib/permissions/escopo.server");
          await marcaDonoReserva(idp, String((reserva as any)?.localizador ?? "") || null, context.userId);
        }
      } catch { /* dono é opcional */ }
      return { ok: true as const, reserva };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao reservar";
      // A PassHub devolve o motivo real dentro do corpo do erro. Sem isso, a
      // tela só mostrava "respondeu 500" e ninguém sabia o que corrigir.
      const detalhe = (e as { detalhe?: unknown } | null)?.detalhe;
      const textoDetalhe = typeof detalhe === "string" ? detalhe : detalhe ? JSON.stringify(detalhe) : "";
      console.error("[passhub] reservar falhou:", msg, textoDetalhe);
      let amigavel = msg;
      const { passhubMotivo } = await import("./client.server");
      const legivel = passhubMotivo(e) || motivoLegivel(textoDetalhe);
      const d = textoDetalhe.toLowerCase();
      if (/segment_unavailable|segmento sem disponibilidade|indispon/.test(d)) {
        amigavel = "Este trecho acabou de ficar indisponível na companhia. Refaça a busca e escolha outro voo.";
      } else if (/expir|token|inválid|invalid|not found/.test(d) || /respondeu 5\d\d/.test(msg)) {
        amigavel = legivel || "A tarifa pode ter expirado; tarife novamente e reserve em seguida.";
      } else if (legivel) {
        amigavel = legivel;
      }
      return { ok: false as const, erro: amigavel, detalhe: textoDetalhe.slice(0, 800) };

    }
  });

/** Extrai a mensagem legível de um corpo de erro da PassHub (JSON ou texto). */
function motivoLegivel(texto: string): string {
  if (!texto) return "";
  try {
    const j = JSON.parse(texto) as Record<string, unknown>;
    for (const k of ["message", "mensagem", "detail", "error", "erro", "description"]) {
      const v = j[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") return JSON.stringify(v).slice(0, 300);
    }
    return JSON.stringify(j).slice(0, 300);
  } catch {
    return texto.replace(/\s+/g, " ").trim().slice(0, 300);
  }
}

/** Lista todas as reservas da agência na PassHub (painel + motor interno). */
export const passhubReservas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { passhubListarReservas } = await import("./reservas.server");
    try {
      const reservas = await passhubListarReservas();
      const { podeVerTudo, idsPassagemDoUsuario } = await import("@/lib/permissions/escopo.server");
      const verTudo = await podeVerTudo(context.userId, (context.claims as any)?.email);
      if (verTudo) return { ok: true as const, reservas };
      const meus = await idsPassagemDoUsuario(context.userId);
      return { ok: true as const, reservas: reservas.filter((r) => meus.has(r.idPassagem)) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao listar reservas";
      console.error("[passhub] reservas falhou:", msg);
      return { ok: false as const, erro: msg };
    }
  });

/** Detalhe de uma reserva/bilhete específico. */
export const passhubReservaDetalhe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const { passhubReservaDetalhe: detalhe } = await import("./reservas.server");
    try {
      return { ok: true as const, reserva: await detalhe(data.id) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao carregar" };
    }
  });

/** Busca (e devolve) o link de pagamento do checkout PassHub de uma reserva. */
export const passhubLinkPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive().optional(),
        localizador: z.string().min(4).max(12).optional(),
      })
      .refine((v) => !!v.id || !!v.localizador, "Informe a reserva")
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubLinkPagamentoReserva } = await import("./reservas.server");
    try {
      const { link } = await passhubLinkPagamentoReserva(data);
      if (!link) {
        return {
          ok: false as const,
          erro: "A consolidadora ainda não gerou o link desta reserva. Tente de novo em instantes.",
        };
      }
      return { ok: true as const, link };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao obter link" };
    }
  });

/** Cancela a reserva na consolidadora (PassHub). */
export const passhubCancelarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        motivo: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubCancelarReserva: cancelar } = await import("./reservas.server");
    try {
      const r = await cancelar(data.id, data.motivo);
      if (!r.ok) return { ok: false as const, erro: r.mensagem };
      return { ok: true as const, mensagem: r.mensagem, rota: r.rota, reserva: r.reserva };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao cancelar" };
    }
  });

/** Gera o QR Code Pix a partir do link de pagamento do checkout PassHub. */
export const passhubPixReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        link: z.string().url().optional(),
        id: z.number().int().positive().optional(),
        localizador: z.string().min(4).max(12).optional(),
      })
      .refine((v) => !!v.link || !!v.id || !!v.localizador, "Informe a reserva")
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      let link = data.link ?? "";
      if (!link) {
        const { passhubLinkPagamentoReserva } = await import("./reservas.server");
        const r = await passhubLinkPagamentoReserva({ id: data.id, localizador: data.localizador });
        link = r.link;
      }
      if (!link) {
        return {
          ok: false as const,
          erro: "A consolidadora ainda não gerou o link desta reserva.",
        };
      }
      const { passhubPixDoLink } = await import("./pix.server");
      return { ok: true as const, pix: await passhubPixDoLink(link) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao gerar o Pix" };
    }
  });

/**
 * Pix público do checkout da consolidadora — usado pela micro-tela que enviamos
 * ao cliente (/pagar/reserva/<codigo>). O código curto do link já é o segredo.
 */
export const passhubPixPublico = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ codigo: z.string().min(6).max(64) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubPixDoLink } = await import("./pix.server");
    const link = `https://checkout.passhub.com.br/payment/${data.codigo}`;
    try {
      return { ok: true as const, pix: await passhubPixDoLink(link), link };
    } catch (e) {
      return {
        ok: false as const,
        link,
        erro: e instanceof Error ? e.message : "Falha ao gerar o Pix",
      };
    }
  });

/* ============================================================
 * Cartão de crédito no checkout da consolidadora (público — o
 * código curto do link já é o segredo, igual ao Pix público).
 * Número e CVV nunca chegam aqui: o navegador tokeniza antes.
 * ============================================================ */

const cartaoPublicoSchema = z.object({
  codigo: z.string().min(6).max(64),
  deviceId: z.string().min(8).max(80),
});

const titularSchema = cartaoPublicoSchema.extend({
  transactionId: z.string().min(6).max(200),
  nome: z.string().min(3).max(80),
  validadeMes: z.string().regex(/^\d{1,2}$/, "Mês inválido"),
  validadeAno: z.string().regex(/^(\d{2}|\d{4})$/, "Ano inválido"),
  cpfTitular: z.string().max(14).optional(),
  parcelas: z.number().int().min(1).max(24),
});

/** Parcelamento do cartão já tokenizado no navegador (transaction_id). */
export const passhubCartaoParcelasPublico = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    cartaoPublicoSchema.extend({ transactionId: z.string().min(6).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { passhubCartaoParcelas } = await import("./cartao.server");
      return {
        ok: true as const,
        ...(await passhubCartaoParcelas(data.codigo, data.transactionId, data.deviceId)),
      };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha no parcelamento" };
    }
  });

/** Inicia a autenticação 3DS — pode pedir desafio do banco. */
export const passhubCartao3dsPublico = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => titularSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { passhubCartaoSessao3ds } = await import("./cartao.server");
      const { codigo, deviceId, ...titular } = data;
      return { ok: true as const, resultado: await passhubCartaoSessao3ds(codigo, titular, deviceId) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha na autenticação" };
    }
  });

/** Emite o pagamento no cartão (após o 3DS quando houver desafio). */
export const passhubCartaoEmitirPublico = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => titularSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const { passhubCartaoEmitir } = await import("./cartao.server");
      const { codigo, deviceId, ...titular } = data;
      return { ok: true as const, resultado: await passhubCartaoEmitir(codigo, titular, deviceId) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao pagar" };
    }
  });

/* ============================================================
 * Pagamento interno da reserva (RAV por fora + pagar agora)
 * ============================================================ */

/** Cria a cobrança Pix NOSSA (valor da consolidadora + RAV por fora). */
export const passhubCobrarComRav = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        localizador: z.string().max(20).optional(),
        link: z.string().url().optional(),
        markup: z.number().min(0).max(100000).default(0),
        valorCobradoManual: z.number().min(0).max(1000000).optional(),
        clienteNome: z.string().max(120).optional(),
        clienteDocumento: z.string().max(20).optional(),
        clienteEmail: z.string().email().optional(),
        clienteTelefone: z.string().max(20).optional(),
        expiraEmMinutos: z.number().int().min(5).max(60 * 24 * 7).optional(),
        autoRepasse: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { criarCobrancaComRav } = await import("./pagamento-interno.server");
    try {
      const pagamento = await criarCobrancaComRav({
        idPassagem: data.id,
        localizador: data.localizador ?? null,
        link: data.link ?? null,
        markup: data.markup,
        valorCobradoManual: data.valorCobradoManual ?? null,
        clienteNome: data.clienteNome ?? null,
        clienteDocumento: data.clienteDocumento ?? null,
        clienteEmail: data.clienteEmail ?? null,
        clienteTelefone: data.clienteTelefone ?? null,
        expiraEmMinutos: data.expiraEmMinutos ?? null,
        autoRepasse: data.autoRepasse,
        criadoPor: context.userId ?? null,
      });
      return { ok: true as const, pagamento };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao criar a cobrança" };
    }
  });

/** Conferência do Pix da consolidadora antes de pagar (valor, destino, copia e cola). */
export const passhubPreviaPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        localizador: z.string().max(20).optional(),
        link: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { previaPixConsolidadora } = await import("./pagamento-interno.server");
    try {
      const previa = await previaPixConsolidadora({
        idPassagem: data.id,
        localizador: data.localizador ?? null,
        link: data.link ?? null,
      });
      return { ok: true as const, previa };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao abrir o Pix" };
    }
  });

/** Paga agora o Pix da consolidadora debitando o saldo ASAAS. */
export const passhubPagarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        localizador: z.string().max(20).optional(),
        link: z.string().url().optional(),
        brcode: z.string().min(20).optional(),
        valorEsperado: z.number().positive().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { pagarReservaAgora } = await import("./pagamento-interno.server");
    try {
      const pagamento = await pagarReservaAgora({
        idPassagem: data.id,
        localizador: data.localizador ?? null,
        link: data.link ?? null,
        brcode: data.brcode ?? null,
        valorEsperado: data.valorEsperado ?? null,
        criadoPor: context.userId ?? null,
      });
      return { ok: true as const, pagamento };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao pagar a reserva" };
    }
  });


/** Repassa manualmente (paga a consolidadora) uma cobrança já recebida. */
export const passhubRepassarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ pagamentoId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { repassarPagamento } = await import("./pagamento-interno.server");
    try {
      return { ok: true as const, pagamento: await repassarPagamento(data.pagamentoId) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao repassar" };
    }
  });

/** Histórico de pagamentos internos de uma reserva. */
export const passhubPagamentosReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const { listarPagamentosReserva } = await import("./pagamento-interno.server");
    try {
      return { ok: true as const, pagamentos: await listarPagamentosReserva(data.id) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao listar" };
    }
  });

/** Define/edita a comissão extra (RAV por fora) da reserva. */
export const passhubComissaoExtra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        localizador: z.string().max(20).optional(),
        comissaoExtra: z.number().min(0).max(1000000),
        observacao: z.string().max(280).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { passhubSalvarComissaoExtra } = await import("./reservas.server");
    try {
      const salvo = await passhubSalvarComissaoExtra({
        idPassagem: data.id,
        localizador: data.localizador ?? null,
        comissaoExtra: data.comissaoExtra,
        observacao: data.observacao ?? null,
        userId: context.userId ?? null,
      });
      return { ok: true as const, ...salvo };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao salvar" };
    }
  });

/** Salva/edita os dados completos dos passageiros da reserva (nome, documento, nascimento). */
export const passhubSalvarPassageiros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        localizador: z.string().min(3).max(20),
        passageiros: z
          .array(
            z.object({
              nome: z.string().min(2).max(120),
              documentoTipo: z.enum(["cpf", "passport"]).default("cpf"),
              documento: z.string().max(40).optional().default(""),
              nascimento: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .nullable()
                .optional(),
              tipo: z.string().max(4).optional().default("ADT"),
            }),
          )
          .max(9),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubSalvarPassageirosReserva } = await import("./reservas.server");
    try {
      const passageiros = await passhubSalvarPassageirosReserva(data.localizador, data.passageiros);
      return { ok: true as const, passageiros };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao salvar" };
    }
  });

/** Número do bilhete (e-ticket) lido do PDF da reserva na consolidadora. */
export const passhubBilheteNumeros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        localizador: z.string().max(12).nullable().optional(),
        forcar: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { passhubNumerosBilhete } = await import("./bilhete.server");
    try {
      const info = await passhubNumerosBilhete(data.id, {
        localizador: data.localizador ?? null,
        forcar: data.forcar,
      });
      return { ok: true as const, ...info };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao ler o bilhete" };
    }
  });

/** PDF da reserva emitida (base64) para download direto no painel. */
export const passhubBilhetePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    const { passhubPdfReserva } = await import("./bilhete.server");
    try {
      const pdf = await passhubPdfReserva(data.id);
      return { ok: true as const, base64: pdf.toString("base64") };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao baixar o PDF" };
    }
  });

/** Lê automaticamente os bilhetes das reservas já emitidas (cache + PDF). */
export const passhubBilhetesLista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.number().int().positive()).max(60) }).parse(input),
  )
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return { ok: true as const, bilhetes: {} };
    const { passhubBilhetesEmLote } = await import("./bilhete.server");
    try {
      return { ok: true as const, bilhetes: await passhubBilhetesEmLote(data.ids) };
    } catch (e) {
      return { ok: false as const, erro: e instanceof Error ? e.message : "Falha ao ler bilhetes" };
    }
  });
