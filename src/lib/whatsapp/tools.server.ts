/**
 * Tools da Camila (AI SDK). Cada tool acessa o banco via supabaseAdmin.
 * SERVER-ONLY.
 */
import { tool } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordHandoff, type WaConversation } from "./conversation.server";

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
}

/**
 * Cria o conjunto de tools da Camila para uma conversa específica.
 * `conversation` é passada por closure para que as tools tenham contexto
 * (identidade verificada, telefone, etc).
 */
export function buildCamilaTools(conversation: WaConversation) {
  const isIdentityVerified = !!conversation.identity_verified_at;

  return {
    consultar_pedido: tool({
      description:
        "Busca um pedido por UMA de três opções equivalentes: número do pedido, localizador/número da reserva ou CPF. Se o cliente já forneceu uma delas, consulte imediatamente e nunca peça outra. Retorna status, viajantes, voos, hotel e pagamentos.",
      inputSchema: z.object({
        numero: z.string().nullable().describe("Número do pedido, 8 dígitos"),
        localizador: z.string().nullable().describe("Localizador ou número da reserva, como ABC123"),
        cpf: z.string().nullable().describe("CPF do cliente (só dígitos ou formatado)"),
      }),
      execute: async ({ numero, localizador, cpf }) => {
        if (!numero && !localizador && !cpf) {
          return { error: "Informe número do pedido, localizador da reserva ou CPF" };
        }

        let query = supabaseAdmin
          .from("orders")
          .select("id, order_number, status, full_name, cpf, total_price, created_at, airline_locator, package_snapshot")
          .order("created_at", { ascending: false })
          .limit(5);

        if (numero) {
          query = query.eq("order_number", numero.replace(/\D/g, ""));
        } else if (localizador) {
          const locator = localizador.trim();
          const { data: matchingItems } = await supabaseAdmin
            .from("order_items")
            .select("order_id")
            .ilike("supplier_locator", locator);
          const itemOrderIds = [...new Set((matchingItems ?? []).map((item) => item.order_id))];
          if (itemOrderIds.length > 0) {
            query = query.or(`airline_locator.ilike.${locator},id.in.(${itemOrderIds.join(",")})`);
          } else {
            query = query.ilike("airline_locator", locator);
          }
        } else if (cpf) {
          query = query.eq("cpf", digits(cpf));
        }

        const { data, error } = await query;
        if (error) return { error: error.message };
        if (!data || data.length === 0) return { error: "Nenhum pedido encontrado" };

        // Se pediu por CPF, retorna lista resumida
        if (cpf && !numero && data.length > 1) {
          return {
            multiplos: true,
            pedidos: data.map((o) => ({
              numero: o.order_number,
              status: o.status,
              valor: fmtMoney(Number(o.total_price)),
              criado_em: fmtDate(o.created_at),
            })),
          };
        }

        const order = data[0];
        const snap = (order.package_snapshot ?? {}) as Record<string, unknown>;

        // Voos e hotel
        const items = await supabaseAdmin
          .from("order_items")
          .select("kind, status, title, supplier_locator, details")
          .eq("order_id", order.id);

        const payments = await supabaseAdmin
          .from("order_payments")
          .select("status, method, amount, installments, paid_at")
          .eq("order_id", order.id);

        const passengers = await supabaseAdmin
          .from("order_passengers")
          .select("full_name, passenger_type")
          .eq("order_id", order.id);

        return {
          numero: order.order_number,
          status: order.status,
          cliente: order.full_name,
          destino: snap.destination ?? null,
          valor_total: fmtMoney(Number(order.total_price)),
          criado_em: fmtDate(order.created_at),
          localizador_aereo: order.airline_locator,
          viajantes: (passengers.data ?? []).map((p) => `${p.full_name} (${p.passenger_type})`),
          itens: (items.data ?? []).map((i) => ({
            tipo: i.kind,
            status: i.status,
            titulo: i.title,
            localizador: i.supplier_locator,
            detalhes: i.details,
          })),
          pagamentos: (payments.data ?? []).map((p) => ({
            status: p.status,
            metodo: p.method,
            valor: fmtMoney(Number(p.amount)),
            parcelas: p.installments,
            pago_em: fmtDate(p.paid_at),
          })),
        };
      },
    }),

    consultar_voo: tool({
      description:
        "Consulta detalhes de voo (ida/volta) de um pedido: horários, aeroportos, cia, localizador. Não requer verificação de identidade se o cliente é conhecido.",
      inputSchema: z.object({
        numero_pedido: z.string().describe("Número do pedido, 8 dígitos"),
      }),
      execute: async ({ numero_pedido }) => {
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id, airline_locator, full_name")
          .eq("order_number", numero_pedido.replace(/\D/g, ""))
          .maybeSingle();
        if (!order) return { error: "Pedido não encontrado" };

        const { data: flights } = await supabaseAdmin
          .from("order_items")
          .select("status, title, supplier_locator, details")
          .eq("order_id", order.id)
          .eq("kind", "flight");

        if (!flights || flights.length === 0) return { error: "Sem voos neste pedido" };

        return {
          cliente: order.full_name,
          localizador: order.airline_locator,
          voos: flights.map((f) => {
            const d = (f.details ?? {}) as Record<string, unknown>;
            return {
              direcao: d.direction ?? "—",
              status: f.status,
              cia: d.airline ?? null,
              numero_voo: d.flight_number ?? null,
              origem: d.from_iata ?? null,
              destino: d.to_iata ?? null,
              partida: d.departure_at ?? d.departure_time ?? null,
              chegada: d.arrival_at ?? d.arrival_time ?? null,
            };
          }),
        };
      },
    }),

    buscar_pacotes: tool({
      description:
        "Lista pacotes disponíveis no admin, opcionalmente filtrados por destino ou mês. Use quando o cliente está buscando ideia de viagem ou perguntando sobre um destino específico.",
      inputSchema: z.object({
        destino: z.string().nullable().describe("Cidade/país (ex: 'Buenos Aires', 'Nordeste')"),
        limit: z.number().nullable().describe("Máximo de resultados, padrão 5"),
      }),
      execute: async ({ destino, limit }) => {
        let q = supabaseAdmin
          .from("packages")
          .select("slug, title, destination, going_date, return_date, nights, price_per_person, hotel_name, hotel_stars, base_occupancy")
          .eq("is_active", true)
          .order("going_date", { ascending: true })
          .limit(limit ?? 5);
        if (destino) q = q.ilike("destination", `%${destino}%`);

        const { data, error } = await q;
        if (error) return { error: error.message };
        if (!data || data.length === 0) {
          return { encontrados: 0, mensagem: "Nenhum pacote pronto para esse filtro. Posso montar uma proposta personalizada com o time comercial." };
        }
        return {
          encontrados: data.length,
          pacotes: data.map((p) => ({
            titulo: p.title,
            destino: p.destination,
            ida: fmtDate(p.going_date),
            volta: fmtDate(p.return_date),
            noites: p.nights,
            hotel: p.hotel_name,
            estrelas: p.hotel_stars,
            preco_por_pessoa: fmtMoney(Number(p.price_per_person)),
            ocupacao_base: p.base_occupancy,
            link: `https://pedidos.viaair.tur.br/pacotes/${p.slug}`,
          })),
        };
      },
    }),

    pedir_confirmacao_identidade: tool({
      description:
        "Use somente antes de uma ação sensível, nunca para consultar pedido, reserva ou voo. Não diga que CPF é obrigatório e não use justificativas de segurança ou privacidade.",
      inputSchema: z.object({
        motivo: z.string().describe("Por que precisa confirmar (ex: 'antes de mostrar o valor do pedido')"),
      }),
      execute: async ({ motivo }) => {
        return {
          ok: true,
          instrucao: `Explique brevemente que precisa validar o dado antes de ${motivo}, sem usar discurso de segurança ou privacidade. Aceite o dado que o cliente já tiver fornecido e nunca insista em CPF se ele tiver número do pedido ou localizador.`,
        };
      },
    }),

    verificar_cpf: tool({
      description:
        "Verifica o CPF informado pelo cliente contra os pedidos e cadastro. Se conferir, marca a identidade como verificada nesta conversa. Use logo após o cliente informar o CPF.",
      inputSchema: z.object({
        cpf: z.string().describe("CPF informado pelo cliente (aceita formatado)"),
      }),
      execute: async ({ cpf }) => {
        const clean = digits(cpf);
        if (clean.length !== 11) return { verificado: false, motivo: "CPF inválido" };

        // Confere contra people OU orders com este telefone
        const phone = conversation.wa_phone;
        const suffix = digits(phone).slice(-9);

        const [personRes, orderRes] = await Promise.all([
          supabaseAdmin
            .from("people")
            .select("id, cpf, name")
            .eq("cpf", clean)
            .or(`phone.ilike.%${suffix}%,mobile_phone.ilike.%${suffix}%`)
            .maybeSingle(),
          supabaseAdmin
            .from("orders")
            .select("id, cpf, full_name, phone")
            .eq("cpf", clean)
            .ilike("phone", `%${suffix}%`)
            .limit(1)
            .maybeSingle(),
        ]);

        const match = personRes.data ?? orderRes.data;
        if (!match) {
          return { verificado: false, motivo: "CPF não confere com o número de WhatsApp" };
        }

        await supabaseAdmin
          .from("wa_conversations")
          .update({
            identity_verified_at: new Date().toISOString(),
            identity_verified_cpf: clean,
            person_id: personRes.data?.id ?? conversation.person_id,
          })
          .eq("id", conversation.id);

        return { verificado: true, nome: personRes.data?.name ?? orderRes.data?.full_name };
      },
    }),

    escalar_para_humano: tool({
      description:
        "Sinaliza que a conversa precisa de um consultor humano (nova cotação, alteração/cancelamento de voo pela cia, reclamação, algo fora do seu escopo). Marca a conversa como aguardando_humano com prioridade e briefing pro painel do atendente. IMPORTANTE: você CONTINUA respondendo ao cliente normalmente até um humano assumir manualmente pelo painel — não pare, não fique em silêncio, siga ajudando com o que puder (dúvidas, informações, contexto). O comercial pode estar ocupado ou fora do horário. Preencha os campos estruturados com o que já foi coletado.",

      inputSchema: z.object({
        motivo: z
          .enum(["nova_cotacao", "alteracao_voo", "reclamacao", "outro"])
          .describe("Categoria do motivo"),
        destino: z.string().nullable().describe("Cidade/país de destino, ex: 'Cancún' ou 'Orlando + Miami'"),
        data_ida: z.string().nullable().describe("Data de ida no formato DD/MM/AAAA ou período aproximado, ex: '15/03/2026' ou 'segunda quinzena de março'"),
        data_volta: z.string().nullable().describe("Data de volta no formato DD/MM/AAAA ou duração, ex: '22/03/2026' ou '7 noites'"),
        quantidade_adultos: z.number().int().nullable().describe("Número de adultos"),
        quantidade_criancas: z.number().int().nullable().describe("Número de crianças (com idades no campo observacoes se houver)"),
        voo_info: z.string().nullable().describe("Info de voo relevante: cia preferida, localizador, número do voo, ou 'a definir'"),
        orcamento: z.string().nullable().describe("Orçamento informado pelo cliente, ex: 'até R$ 8.000 por pessoa'"),
        hotel_preferencia: z.string().nullable().describe("Preferência de hotel/categoria, ex: '4 estrelas all inclusive'"),
        observacoes: z.string().nullable().describe("Qualquer info extra relevante: idades de crianças, restrições, urgência, contexto emocional"),
        prioridade: z.enum(["normal", "high", "urgent"]).nullable(),
      }),
      execute: async ({
        motivo,
        destino,
        data_ida,
        data_volta,
        quantidade_adultos,
        quantidade_criancas,
        voo_info,
        orcamento,
        hotel_preferencia,
        observacoes,
        prioridade,
      }) => {
        // Monta a "necessidade do cliente" formatada pro atendente
        const linhas: string[] = [];
        if (destino) linhas.push(`✈️ Destino: ${destino}`);
        if (data_ida || data_volta) {
          const datas = [data_ida && `ida ${data_ida}`, data_volta && `volta ${data_volta}`]
            .filter(Boolean)
            .join(" · ");
          linhas.push(`📅 Datas: ${datas}`);
        }
        const pax: string[] = [];
        if (quantidade_adultos != null) pax.push(`${quantidade_adultos} adulto${quantidade_adultos === 1 ? "" : "s"}`);
        if (quantidade_criancas != null && quantidade_criancas > 0) pax.push(`${quantidade_criancas} criança${quantidade_criancas === 1 ? "" : "s"}`);
        if (pax.length) linhas.push(`👥 Passageiros: ${pax.join(" + ")}`);
        if (voo_info) linhas.push(`🛫 Voo: ${voo_info}`);
        if (hotel_preferencia) linhas.push(`🏨 Hotel: ${hotel_preferencia}`);
        if (orcamento) linhas.push(`💰 Orçamento: ${orcamento}`);
        if (observacoes) linhas.push(`📝 Obs: ${observacoes}`);
        const briefing = linhas.length ? linhas.join("\n") : "Cliente solicitou atendimento humano — dados ainda não coletados.";

        const existingTags = conversation.tags ?? [];
        const newTags = Array.from(new Set([...existingTags, motivo, "aguardando_humano"]));
        await supabaseAdmin
          .from("wa_conversations")
          .update({
            // IMPORTANTE: NÃO trocamos mode pra "human" automaticamente.
            // A IA segue respondendo até um operador assumir manualmente pelo painel.
            priority: prioridade ?? "normal",
            tags: newTags,
          })
          .eq("id", conversation.id);

        // Salva a "necessidade do cliente" no protocolo ativo pra aparecer no painel do atendente
        if (conversation.protocolo_ativo_id) {
          await supabaseAdmin
            .from("wa_protocolos")
            .update({ assunto_resumo: briefing })
            .eq("id", conversation.protocolo_ativo_id);
        }

        await recordHandoff({
          conversation_id: conversation.id,
          from_mode: "ai",
          to_mode: "ai", // marcado como pendente de humano, mas IA segue ativa
          reason: motivo,
          briefing,
        });

        return {
          ok: true,
          instrucao:
            "Avise ao cliente que já sinalizou pro time comercial assumir e siga ajudando normalmente com o que puder — dúvidas, informações, contexto. Não fique em silêncio. Quando um humano assumir, o sistema te desativa automaticamente.",
        };
      },
    }),



    _meta: { isIdentityVerified }, // usado só pelo runner pra decidir prompt
  };
}
