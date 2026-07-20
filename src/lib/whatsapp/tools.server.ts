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
        "Lista pacotes disponíveis no admin, opcionalmente filtrados por destino. Retorna a lista SÓ pra você escolher — não envia nada ao cliente. Depois use enviar_pacote (folder completo com imagem + preços) ou enviar_link_pacote.",
      inputSchema: z.object({
        destino: z.string().nullable().describe("Cidade/país (ex: 'Buenos Aires', 'Nordeste')"),
        limit: z.number().nullable().describe("Máximo de resultados, padrão 5"),
      }),
      execute: async ({ destino, limit }) => {
        let q = supabaseAdmin
          .from("packages")
          .select("slug, title, destination, origin, going_date, return_date, nights, price_per_person, hotel_name, hotel_stars, base_occupancy, image_url")
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
            slug: p.slug,
            titulo: p.title,
            destino: p.destination,
            origem: p.origin,
            ida: fmtDate(p.going_date),
            volta: fmtDate(p.return_date),
            noites: p.nights,
            hotel: p.hotel_name,
            estrelas: p.hotel_stars,
            preco_por_pessoa: fmtMoney(Number(p.price_per_person)),
            ocupacao_base: p.base_occupancy,
            tem_imagem: !!p.image_url,
            link: `https://pedidos.viaair.tur.br/pacotes/${p.slug}`,
          })),
        };
      },
    }),

    enviar_pacote: tool({
      description:
        "Envia o FOLDER completo do pacote pelo WhatsApp: imagem do header + descritivo formatado (origem, datas, hotel, refeição, assessoria) + formas de pagamento (Pix com 5% off, cartão 10x sem juros, boleto 10x mediante aprovação, boleto sem análise de crédito até a data da viagem) + link. Use SEMPRE que o cliente demonstrar interesse num pacote específico. NÃO exige CPF nem confirmação — pacote é conteúdo público. Depois de chamar, responda com UM balão curto só perguntando 'O que você achou?' (ou variação natural).",
      inputSchema: z.object({
        slug: z.string().describe("slug do pacote (vem de buscar_pacotes)"),
        quantidade_adultos: z.number().int().nullable().describe("adultos para calcular Pix total; padrão = base_occupancy (geralmente 2)"),
      }),
      execute: async ({ slug, quantidade_adultos }) => {
        const { data: pkg } = await supabaseAdmin
          .from("packages")
          .select("slug, title, destination, origin, going_date, return_date, price_per_person, image_url, meal_plan, includes, base_occupancy, hotel_name, hotel_stars, is_active")
          .eq("slug", slug)
          .maybeSingle();
        if (!pkg || !pkg.is_active) return { error: "Pacote não encontrado ou inativo" };

        const qtd = quantidade_adultos && quantidade_adultos > 0 ? quantidade_adultos : (pkg.base_occupancy ?? 2);
        const priceP = Number(pkg.price_per_person) || 0;
        const total = priceP * qtd;
        const pixTotal = total * 0.95;
        const parcelaCartao = total / 10;

        const brl = (n: number) =>
          n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        const includesArr: string[] = Array.isArray(pkg.includes) ? (pkg.includes as string[]) : [];
        const mealText = String(pkg.meal_plan ?? "");
        const hasBreakfast =
          /café|cafe|breakfast|manhã|manha/i.test(mealText) ||
          includesArr.some((i) => /café|cafe|manhã|manha/i.test(String(i)));
        const hasAllInclusive =
          /all\s*inclusive|tudo\s*incluso/i.test(mealText) ||
          includesArr.some((i) => /all\s*inclusive|tudo\s*incluso/i.test(String(i)));

        const dateRange = (() => {
          try {
            const d1 = new Date(String(pkg.going_date) + "T12:00:00");
            const d2 = new Date(String(pkg.return_date) + "T12:00:00");
            const mes = d1.toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();
            const sameMonth = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
            if (sameMonth) return `${d1.getDate()} a ${d2.getDate()}/${mes}`;
            return `${d1.toLocaleDateString("pt-BR")} a ${d2.toLocaleDateString("pt-BR")}`;
          } catch {
            return `${fmtDate(pkg.going_date)} a ${fmtDate(pkg.return_date)}`;
          }
        })();

        const link = `https://pedidos.viaair.tur.br/pacotes/${pkg.slug}`;
        const title = String(pkg.title || pkg.destination || "PACOTE").toUpperCase();

        const lines: string[] = [];
        lines.push(`*${title}*`);
        lines.push("");
        if (pkg.origin) lines.push(`✈️ Saindo de ${pkg.origin}`);
        lines.push(`🗓 ${dateRange}`);
        const hotelLine = pkg.hotel_name
          ? `🏨 Hospedagem no ${pkg.hotel_name}${pkg.hotel_stars ? ` (${pkg.hotel_stars}★)` : ""}`
          : `🏨 Hospedagem`;
        lines.push(hotelLine);
        if (hasAllInclusive) lines.push(`🍽 All inclusive`);
        else if (hasBreakfast) lines.push(`🍽 Café da manhã`);
        lines.push(`🎧 Assessoria completa`);
        lines.push("");
        lines.push(`*FORMAS DE PAGAMENTO:*`);
        lines.push(`🤑 PIX: ${brl(pixTotal)} para ${qtd} adulto${qtd === 1 ? "" : "s"} (5% de desconto)`);
        lines.push(`💳 Cartão de crédito: 10x de ${brl(parcelaCartao)}`);
        lines.push(`🧾 Boleto bancário: até 10x mediante aprovação`);
        lines.push(`🧾 Boleto sem análise de crédito até a data da viagem`);
        lines.push(`_sem juros em qualquer forma de pagamento_`);
        lines.push("");
        lines.push(link);
        const caption = lines.join("\n");

        const { sendWhatsAppImage, sendWhatsAppText } = await import("./send.server");
        const { saveMessage } = await import("./conversation.server");

        let sendErr: string | undefined;
        if (pkg.image_url) {
          const r = await sendWhatsAppImage(conversation.wa_phone, pkg.image_url, caption);
          if (r.error) {
            sendErr = r.error;
            await sendWhatsAppText(conversation.wa_phone, caption);
          }
        } else {
          await sendWhatsAppText(conversation.wa_phone, caption);
        }

        await saveMessage({
          conversation_id: conversation.id,
          direction: "outbound",
          sender: "camila",
          content: caption,
        });

        return {
          ok: true,
          enviado: true,
          image_fallback_error: sendErr ?? null,
          instrucao:
            "Folder do pacote (imagem + descritivo + preços + link) JÁ enviado pelo WhatsApp. NÃO repita título, datas, valores nem link no seu texto. Responda AGORA apenas com UM balão curto perguntando 'O que você achou?' (ou variação natural).",
        };
      },
    }),

    enviar_link_pacote: tool({
      description:
        "Envia SOMENTE o link direto do pacote. Use quando o cliente pedir 'tem o link?', 'me manda o link'. NUNCA peça CPF, pedido, localizador nem justifique segurança — link de pacote é público.",
      inputSchema: z.object({
        slug: z.string().describe("slug do pacote"),
      }),
      execute: async ({ slug }) => {
        const { data: pkg } = await supabaseAdmin
          .from("packages")
          .select("slug, title, is_active")
          .eq("slug", slug)
          .maybeSingle();
        if (!pkg || !pkg.is_active) return { error: "Pacote não encontrado" };
        const link = `https://pedidos.viaair.tur.br/pacotes/${pkg.slug}`;
        return { ok: true, link, titulo: pkg.title, instrucao: "Envie o link ao cliente em balão curto (ex.: 'Segue aqui, ó:' + link em outro balão). NÃO peça CPF nem justifique segurança." };
      },
    }),

    pedir_confirmacao_identidade: tool({
      description:
        "Use somente antes de uma ação sensível — NUNCA para consultar pedido/reserva/voo NEM para enviar link/folder de pacote. Não diga que CPF é obrigatório nem use justificativas de segurança/privacidade.",
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
