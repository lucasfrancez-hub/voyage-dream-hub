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
          .select("slug, title, destination, origin, going_date, return_date, nights, price_per_person, hotel_name, hotel_stars, base_occupancy, image_url, meal_plan, includes, services")
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
          pacotes: data.map((p) => {
            const svc: any = p.services ?? {};
            const servicos: string[] = [];
            const detalhes: Record<string, string> = {};
            if (svc.seguro?.enabled) { servicos.push("seguro"); if (svc.seguro.cobertura) detalhes.seguro = `${svc.seguro.moeda || "USD"} ${svc.seguro.cobertura} por pessoa`; }
            if (svc.cancelamento?.enabled) { servicos.push("cancelamento"); if (svc.cancelamento.cobertura) detalhes.cancelamento = `${svc.cancelamento.moeda || "BRL"} ${svc.cancelamento.cobertura} por pessoa`; }
            if (svc.transfer?.enabled) { servicos.push("transfer"); detalhes.transfer = svc.transfer.sentido === "in" ? "só chegada" : svc.transfer.sentido === "out" ? "só saída" : "ida e volta"; }
            if (svc.city_tour?.enabled) { servicos.push("city_tour"); if (svc.city_tour.detalhe) detalhes.city_tour = svc.city_tour.detalhe; }
            if (svc.tickets?.enabled) {
              const parks = (svc.tickets.parks ?? []).map((x: any) => String(x ?? "").trim()).filter(Boolean);
              if (parks.length) { servicos.push("ingressos"); detalhes.ingressos = parks.join(", "); }
            }
            for (const extra of svc.outros ?? []) {
              const t = (extra || "").trim();
              if (t) servicos.push(t.toLowerCase());
            }
            const mealText = String(p.meal_plan ?? "");
            const regime = /all\s*inclusive|tudo\s*incluso/i.test(mealText)
              ? "All Inclusive"
              : /café|cafe|manhã|manha/i.test(mealText) ? "Café da Manhã" : null;
            return {
              slug: p.slug,
              titulo: p.title,
              destino: p.destination,
              origem: p.origin,
              ida: fmtDate(p.going_date),
              volta: fmtDate(p.return_date),
              noites: p.nights,
              hotel: p.hotel_name,
              estrelas: p.hotel_stars,
              regime,
              preco_por_pessoa: fmtMoney(Number(p.price_per_person)),
              ocupacao_base: p.base_occupancy,
              tem_imagem: !!p.image_url,
              servicos_inclusos: servicos,
              servicos_detalhe: detalhes,
              link: `https://pedidos.viaair.tur.br/w/${p.slug}`,
            };
          }),
        };
      },
    }),



    enviar_pacote: tool({
      description:
        "Envia o FOLDER completo do pacote pelo WhatsApp: imagem do header + descritivo formatado (origem, datas, hotel, refeição, serviços inclusos) + formas de pagamento (Pix com 5% off, cartão 10x sem juros, boleto 10x mediante aprovação, boleto sem análise de crédito até a data da viagem) + link. NUNCA use o termo 'assessoria completa' nem 'assessoria' em nenhum lugar. Use SEMPRE que o cliente demonstrar interesse num pacote específico. NÃO exige CPF nem confirmação — pacote é conteúdo público. Depois de chamar, responda com UM balão curto só perguntando 'O que você achou?' (ou variação natural).",
      inputSchema: z.object({
        slug: z.string().describe("slug do pacote (vem de buscar_pacotes)"),
        quantidade_adultos: z.number().int().nullable().describe("adultos para calcular Pix total; padrão = base_occupancy (geralmente 2)"),
      }),
      execute: async ({ slug, quantidade_adultos }) => {
        const { data: pkg } = await supabaseAdmin
          .from("packages")
          .select("id, slug, title, destination, origin, going_date, return_date, price_per_person, image_url, meal_plan, includes, base_occupancy, hotel_name, hotel_stars, is_active, services")
          .eq("slug", slug)
          .maybeSingle();
        const storedCopyRes = pkg
          ? await supabaseAdmin
              .from("package_ai_copy")
              .select("text, package_id")
              .eq("channel", "whatsapp")
              .eq("package_id", (pkg as any).id)
              .maybeSingle()
          : { data: null };
        const storedCopy: any = (storedCopyRes as any).data;

        if (!pkg || !pkg.is_active) return { error: "Pacote não encontrado ou inativo" };

        const qtd = quantidade_adultos && quantidade_adultos > 0 ? quantidade_adultos : (pkg.base_occupancy ?? 2);
        const priceP = Number(pkg.price_per_person) || 0;
        const total = priceP * qtd;
        const pixTotal = total * 0.95;
        const parcelaCartao = total / 10;

        const link = `https://pedidos.viaair.tur.br/w/${pkg.slug}`;

        // Se existe copy curada pra este pacote no WhatsApp, reusa (mesma estrutura da curadoria)
        // apenas retirando a linha "Para mais informações me chame aqui 📲 <telefone>".
        let caption: string | null = null;
        if (storedCopy?.text && storedCopy?.package_id === pkg.id) {
          caption = String(storedCopy.text)
            .split("\n")
            .filter((l: string) => !/Para mais informações me chame aqui/i.test(l) && !/^\s*4499826-1137\s*$/.test(l))
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }

        if (!caption) {
          // Fallback determinístico com as MESMAS regras da curadoria
          const brl2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const dateRange = (() => {
            try {
              const d1 = new Date(String(pkg.going_date) + "T12:00:00");
              const d2 = new Date(String(pkg.return_date) + "T12:00:00");
              const dd = (d: Date) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
              return `${dd(d1)} a ${dd(d2)}`;
            } catch {
              return `${fmtDate(pkg.going_date)} a ${fmtDate(pkg.return_date)}`;
            }
          })();
          const nights = (() => {
            try {
              const d1 = new Date(String(pkg.going_date) + "T12:00:00").getTime();
              const d2 = new Date(String(pkg.return_date) + "T12:00:00").getTime();
              const n = Math.round((d2 - d1) / 86400000);
              return n > 0 ? n : null;
            } catch { return null; }
          })();
          const daysUntil = (() => {
            try {
              const t = new Date(String(pkg.going_date) + "T12:00:00").getTime();
              return Math.round((t - Date.now()) / 86400000);
            } catch { return null; }
          })();
          const boletoAteViagem = daysUntil !== null && daysUntil >= 60;

          const includesArr: string[] = Array.isArray(pkg.includes) ? (pkg.includes as string[]) : [];
          const mealText = String(pkg.meal_plan ?? "");
          const hasBreakfast =
            /café|cafe|breakfast|manhã|manha/i.test(mealText) ||
            includesArr.some((i) => /café|cafe|manhã|manha/i.test(String(i)));
          const hasAllInclusive =
            /all\s*inclusive|tudo\s*incluso/i.test(mealText) ||
            includesArr.some((i) => /all\s*inclusive|tudo\s*incluso/i.test(String(i)));
          const regime = hasAllInclusive ? "All Inclusive" : hasBreakfast ? "Café da Manhã" : "";
          const stars = pkg.hotel_stars ? "★".repeat(Math.min(5, Math.max(1, Number(pkg.hotel_stars)))) : "";

          // Services (idêntico à curadoria)
          const fmtCob = (raw: string) => {
            const s = String(raw).trim().replace(/[^\d.,-]/g, "");
            let n: number;
            if (s.includes(",")) n = Number(s.replace(/\./g, "").replace(",", "."));
            else if (/^\d+\.\d{1,2}$/.test(s)) n = Number(s);
            else n = Number(s.replace(/\./g, ""));
            if (!isFinite(n) || n === 0) return raw;
            return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
          };
          const sentidoLabel = (s?: string | null) =>
            s === "in" ? "somente chegada" : s === "out" ? "somente saída" : "ida e volta (chegada e saída)";
          const svc: any = pkg.services ?? {};
          const services_lines: string[] = [];
          if (svc.seguro?.enabled) {
            const cob = svc.seguro.cobertura?.toString().trim();
            const moeda = svc.seguro.moeda || "USD";
            services_lines.push(cob ? `🛡️ Seguro Viagem ${moeda} ${fmtCob(cob)} por pessoa` : `🛡️ Seguro Viagem`);
          }
          if (svc.cancelamento?.enabled) {
            const cob = svc.cancelamento.cobertura?.toString().trim();
            const moeda = svc.cancelamento.moeda || "BRL";
            services_lines.push(cob ? `🧾 Cobertura para cancelamento involuntário ${moeda} ${fmtCob(cob)} por pessoa` : `🧾 Cobertura para cancelamento involuntário`);
          }
          if (svc.transfer?.enabled) services_lines.push(`🚐 Transfer aeroporto ↔ hotel (${sentidoLabel(svc.transfer.sentido)})`);
          if (svc.city_tour?.enabled) {
            const det = svc.city_tour.detalhe?.trim();
            services_lines.push(det ? `🗺️ City Tour — ${det}` : `🗺️ City Tour`);
          }
          if (svc.tickets?.enabled) {
            const parks = (svc.tickets.parks ?? []).map((p: any) => String(p ?? "").trim()).filter(Boolean);
            for (const park of parks) services_lines.push(`🎟️ Ingresso ${park}`);
          }
          for (const extra of svc.outros ?? []) {
            const t = (extra || "").trim();
            if (t) services_lines.push(`✨ ${t}`);
          }

          const title = String(pkg.title || pkg.destination || "PACOTE").toUpperCase();
          const lines: string[] = [];
          lines.push(`*${title}*`);
          lines.push("");
          if (pkg.origin) lines.push(`✈️ Saindo de ${pkg.origin}`);
          lines.push(`🗓️ ${dateRange}${nights ? ` (${nights} noites)` : ""}`);
          if (pkg.hotel_name) {
            lines.push(`🏨 ${pkg.hotel_name}${stars ? ` ${stars}` : ""}${regime ? ` — ${regime}` : ""}`);
          }
          if (services_lines.length) {
            lines.push("");
            for (const s of services_lines) lines.push(s);
          }
          lines.push("");
          lines.push(`*FORMAS DE PAGAMENTO:*`);
          lines.push(`🤑 *PIX:* ${brl2(pixTotal)} PARA ${qtd} ADULTO${qtd === 1 ? "" : "S"} _(5% de desconto já aplicado)_`);
          lines.push(`💳 *Cartão de crédito:* 10x de ${brl2(parcelaCartao)}`);
          lines.push(`📄 *Boleto bancário:* até 10x mediante aprovação`);
          if (boletoAteViagem) lines.push(`📄 *Boleto parcelado:* até a data da viagem (sem análise de crédito)`);
          lines.push(`*sem juros em qualquer forma de pagamento*`);
          lines.push("");
          lines.push(link);
          caption = lines.join("\n");
        } else {
          // Garante que o link do pacote esteja presente
          if (!caption.includes(link)) caption = `${caption}\n${link}`;
        }


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

        // Destaques pra IA usar no comentário humanizado logo depois do folder
        const svcAny: any = (pkg as any).services ?? {};
        const highlights: string[] = [];
        if (pkg.origin) highlights.push(`sai de ${pkg.origin}`);
        if (pkg.hotel_name) {
          const st = pkg.hotel_stars ? ` ${pkg.hotel_stars} estrelas` : "";
          highlights.push(`fica no ${pkg.hotel_name}${st}`);
        }
        if (/all\s*inclusive|tudo\s*incluso/i.test(String(pkg.meal_plan ?? ""))) highlights.push("regime all inclusive");
        else if (/café|cafe|manhã|manha/i.test(String(pkg.meal_plan ?? ""))) highlights.push("com café da manhã incluso");
        if (svcAny?.tickets?.enabled) {
          const parks = (svcAny.tickets.parks ?? []).map((p: any) => String(p ?? "").trim()).filter(Boolean);
          if (parks.length) highlights.push(`já com ingresso ${parks.join(" e ")}`);
        }
        if (svcAny?.transfer?.enabled) highlights.push("com transfer aeroporto ↔ hotel");
        if (svcAny?.seguro?.enabled) highlights.push("com seguro viagem incluso");
        if (svcAny?.city_tour?.enabled) highlights.push("com city tour");

        return {
          ok: true,
          enviado: true,
          image_fallback_error: sendErr ?? null,
          destaques_para_comentar: highlights,
          instrucao:
            "Folder do pacote JÁ foi enviado (imagem + descritivo + preços + link). NÃO repita título, datas, valores nem link. AGORA mande 1 mensagem curta e humanizada (3 a 5 linhas curtas, tom de consultora experiente e simpática, NADA robótico, NADA de venda empurrada) resumindo em português natural 2 ou 3 destaques da lista 'destaques_para_comentar' (ex.: 'Olha, que legal! Esse aqui sai de São Paulo, fica no [hotel] e já vem com ingresso pra Disney e Universal — bem completinho.'). Encaixe UMA sugestão sutil de vantagem quando fizer sentido ('hotel muito bem avaliado', 'datas de novembro estão saindo rápido', 'com café já incluso'). SEMPRE inclua no final, antes da pergunta, um convite leve de personalização, algo como: 'Se preferir, também consigo montar um personalizado pra você — posso trocar o hotel, mudar a origem, ajustar as datas ou incluir mais serviços, é só me falar o que faz mais sentido.' (varie a redação, não copie literal, mas SEMPRE cite pelo menos: outra origem, outro hotel e outros serviços). TERMINE com uma pergunta gentil tipo 'O que você achou?' ou 'Faz sentido pra vocês?'. Pode começar com 'Olha, que legal…' ou variação natural. No máx. 1 emoji na mensagem inteira. Sem asterisco de negrito, sem hashtag, sem link.",


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
        const link = `https://pedidos.viaair.tur.br/w/${pkg.slug}`;
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
        "Transfere a conversa pro atendimento humano (nova cotação, alteração/cancelamento de voo pela cia, reclamação, algo fora do seu escopo). Marca a conversa como mode=human com prioridade e briefing pro painel do atendente. DEPOIS de chamar essa tool, envie APENAS UMA mensagem curta avisando que passou pro time humano e ENCERRE — a IA sai do ar automaticamente e o atendente assume. Preencha os campos estruturados com o que já foi coletado.",

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
            // Ao escalar, transfere de fato pra humano: a IA para de responder
            // e a conversa aparece no painel como "aguardando atendimento".
            mode: "human",
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
          to_mode: "human",
          reason: motivo,
          briefing,
        });

        return {
          ok: true,
          instrucao:
            "Envie UMA mensagem curta avisando que já passou pro time humano assumir daqui, agradeça a paciência e encerre por aqui — NÃO faça mais perguntas nem siga respondendo, o atendente humano vai continuar.",
        };
      },
    }),



    _meta: { isIdentityVerified }, // usado só pelo runner pra decidir prompt
  };
}
