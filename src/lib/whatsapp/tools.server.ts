/**
 * Tools da Camila (AI SDK). Cada tool acessa o banco via supabaseAdmin.
 * SERVER-ONLY.
 */
import { tool } from "ai";
import { aiSender } from "./sender-identity";
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
          return {
            error: "sem_identificador",
            faltam_dados: true,
            instrucao:
              "NÃO consulte. Peça UMA única vez, curto e natural: número do pedido, localizador da reserva OU CPF — qualquer um dos três serve. Nunca invente pedido e nunca justifique com segurança ou privacidade.",
          };
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
        "Lista pacotes disponíveis no admin, opcionalmente filtrados por destino e origem. Retorna a lista SÓ pra você escolher — não envia nada ao cliente. SEMPRE informe 'origem' quando souber a cidade do cliente: a busca prioriza pacotes saindo dessa cidade e, se não houver, retorna também as opções de outras origens marcadas como fallback. Depois use enviar_pacote (folder completo com imagem + preços) ou enviar_link_pacote.",
      inputSchema: z.object({
        destino: z.string().nullable().describe("Cidade/país (ex: 'Buenos Aires', 'Nordeste')"),
        origem: z.string().nullable().describe("Cidade/origem preferida do cliente (ex: 'Curitiba'). Pacotes dessa origem vêm primeiro; se não houver, entram os de outras origens."),
        limit: z.number().nullable().describe("Máximo de resultados, padrão 5"),
        confirmado_para_este_destino: z
          .boolean()
          .nullable()
          .describe("true SOMENTE se, PARA ESTE destino, o cliente já confirmou nesta conversa origem, quantidade de passageiros e período/noites. Se ainda não confirmou, mande false."),
        periodo: z
          .string()
          .nullable()
          .describe("Período/mês confirmado pelo cliente PARA ESTE destino (ex: 'setembro'). Null se ele ainda não disse."),
      }),
      execute: async ({ destino, origem, limit, confirmado_para_este_destino, periodo }) => {
        // Sem destino a busca devolveria pacotes aleatórios: bloqueia e manda perguntar.
        if (!destino || destino.trim().length < 2) {
          return {
            encontrados: 0,
            faltam_dados: true,
            campos_faltando: ["destino"],
            instrucao:
              "NÃO liste pacotes. O cliente ainda não disse o destino. Pergunte, em um balão curto, para onde ele quer viajar (ou se quer sugestões de destino). Nunca mande pacote aleatório.",
          };
        }
        // Confirmação obrigatória por destino. Não basta a IA dizer que confirmou:
        // exigimos a pergunta de confirmação realmente enviada nesta conversa,
        // depois do pedido do cliente para ESTE destino.
        let confirmacaoEnviada = false;
        {
          const chaveDestino = destino
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length >= 4)[0] ?? destino.toLowerCase();
          const { data: recentes } = await supabaseAdmin
            .from("wa_messages")
            .select("direction, content, created_at")
            .eq("conversation_id", (conversation as any).id)
            .order("created_at", { ascending: false })
            .limit(14);
          // Índice do último pedido do cliente citando este destino.
          const lista = (recentes ?? []).slice().reverse();
          const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          let idxPedido = -1;
          lista.forEach((m: any, i: number) => {
            if (m.direction === "inbound" && norm(m.content).includes(chaveDestino)) idxPedido = i;
          });
          if (idxPedido >= 0) {
            confirmacaoEnviada = lista
              .slice(idxPedido + 1)
              .some((m: any) => m.direction === "outbound" && norm(m.content).includes(chaveDestino) && m.content.includes("?"));
          }
        }
        if (confirmado_para_este_destino !== true || !confirmacaoEnviada) {
          const faltando: string[] = [];
          if (!origem) faltando.push("origem");
          if (!periodo) faltando.push("período/noites");
          faltando.push("quantidade de passageiros");
          return {
            encontrados: 0,
            faltam_dados: true,
            confirmacao_ainda_nao_enviada: !confirmacaoEnviada,
            campos_faltando: faltando,
            instrucao: `NÃO pesquise nem mande card ainda. Mesmo que os dados já apareçam no histórico, esta é uma NOVA solicitação. Mande EXATAMENTE 2 balões e espere a resposta: (1) "Claro! Para ${destino}, continuam sendo as mesmas ${"{quantidade}"} pessoas saindo de ${origem ?? "qual cidade"}?" — troque {quantidade} pelo número de passageiros já dito na conversa; (2) "Vocês têm alguma data específica em mente? E mais ou menos quantas noites gostariam de ficar? Se estiverem flexíveis, posso procurar o período com melhor custo-benefício." NUNCA empilhe alternativas com "ou ... ou ..." na mesma frase. Depois da resposta dele, mande a transição ("Perfeito! Vou verificar as opções de ${destino} com essas condições e já te mostro 😊") e só então chame buscar_pacotes com confirmado_para_este_destino=true.`,
          };
        }


        const cap = limit ?? 5;
        const COLS = "slug, title, destination, origin, going_date, return_date, nights, price_per_person, hotel_name, hotel_stars, base_occupancy, image_url, meal_plan, includes, services, outbound_flight, return_flight";
        const POOL = 200; // busca ampla: o filtro de mês é feito depois, senão o limit corta o pacote certo

        // Mês pedido pelo cliente (a validação usa a DATA DE IDA: 28/12 é dezembro
        // mesmo que o retorno caia em janeiro).
        const MESES_NOME = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
        const normTxt = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        let mesAlvo = 0;
        if (periodo && String(periodo).trim()) {
          const alvo = normTxt(String(periodo));
          mesAlvo = MESES_NOME.findIndex((m) => alvo.includes(m)) + 1;
          if (!mesAlvo) {
            const m = alvo.match(/(?:^|[^0-9])(\d{1,2})(?:[^0-9]|$)/);
            if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) mesAlvo = Number(m[1]);
          }
        }
        const mesDe = (p: any) => (p?.going_date ? Number(String(p.going_date).slice(5, 7)) : 0);

        let base = supabaseAdmin
          .from("packages")
          .select(COLS)
          .eq("is_active", true)
          .order("going_date", { ascending: true });
        if (destino) base = base.ilike("destination", `%${destino}%`);

        let data: any[] = [];
        let foraDoMes: any[] = [];
        if (origem) {
          const { data: match, error: e1 } = await base.ilike("origin", `%${origem}%`).limit(POOL);
          if (e1) return { error: e1.message };
          let pool = match ?? [];
          if (mesAlvo) {
            foraDoMes = pool.filter((p) => mesDe(p) !== mesAlvo);
            pool = pool.filter((p) => mesDe(p) === mesAlvo);
          }
          data = pool.slice(0, cap);
          if (data.length === 0) {
            // Só cai pra outras origens quando não há nada na origem do cliente.
            let base2 = supabaseAdmin
              .from("packages")
              .select(COLS)
              .eq("is_active", true)
              .order("going_date", { ascending: true });
            if (destino) base2 = base2.ilike("destination", `%${destino}%`);
            const { data: rest } = await base2.not("origin", "ilike", `%${origem}%`).limit(POOL);
            let pool2 = rest ?? [];
            if (mesAlvo) pool2 = pool2.filter((p) => mesDe(p) === mesAlvo);
            data = pool2.slice(0, cap).map((p) => ({ ...p, origem_diferente_da_do_cliente: true }));
          }
        } else {
          const { data: all, error } = await base.limit(POOL);
          if (error) return { error: error.message };
          let pool = all ?? [];
          if (mesAlvo) {
            foraDoMes = pool.filter((p) => mesDe(p) !== mesAlvo);
            pool = pool.filter((p) => mesDe(p) === mesAlvo);
          }
          data = pool.slice(0, cap);
        }
        if (!data || data.length === 0) {
          return {
            encontrados: 0,
            sem_pacote_compativel: true,
            pacotes_fora_do_periodo: foraDoMes.slice(0, 3).map((p) => ({ slug: p.slug, origem: p.origin, ida: p.going_date })),
            instrucao:
              'Não existe pacote pronto compatível. NÃO invente pacote, NÃO sugira outro destino por conta própria, NÃO altere datas nem cidade de embarque. Chame escalar_para_humano com TODO o contexto já coletado (destino, origem/cidade de embarque, período, passageiros, preferências) e motivo "pacote pronto inexistente". Depois envie exatamente: "Não encontrei um pacote pronto que atenda exatamente ao que você procura. Já encaminhei todas as informações para o nosso time Comercial preparar uma opção personalizada para você."',
          };
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
              if (t && !/assessoria/i.test(t)) servicos.push(t.toLowerCase());
            }
            const mealText = String(p.meal_plan ?? "");
            const regime = /all\s*inclusive|tudo\s*incluso/i.test(mealText)
              ? "All Inclusive"
              : /café|cafe|manhã|manha/i.test(mealText) ? "Café da Manhã" : null;
            const flightInfo = (f: any) => {
              if (!f || typeof f !== "object") return null;
              const segs = Array.isArray(f.segments) ? f.segments : [];
              const numSegs = segs.length;
              const paradas = numSegs > 1 ? numSegs - 1 : 0;
              const conexoes = numSegs > 1
                ? segs.slice(0, -1).map((s: any) => s?.to_city || s?.to_iata).filter(Boolean)
                : [];
              return {
                direto: paradas === 0,
                paradas,
                conexoes,
                cia: f.airline ?? null,
                duracao: f.duration ?? null,
              };
            };
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
              voo_ida: flightInfo(p.outbound_flight),
              voo_volta: flightInfo(p.return_flight),
              link: `https://pedidos.viaair.tur.br/w/${p.slug}`,
            };

          }),
        };
      },
    }),



    enviar_pacote: tool({
      description:
        "Envia o FOLDER completo do pacote pelo WhatsApp: imagem do header + descritivo formatado (origem, datas, hotel, refeição, serviços inclusos) + formas de pagamento (Pix com 5% off, cartão 10x sem juros — e quando for pacote Cativa Operadora, Visa e Master saem em 15x sem juros e demais bandeiras em 10x sem juros —, boleto 10x mediante aprovação, boleto sem análise de crédito até a data da viagem) + link. NUNCA use o termo 'assessoria completa' nem 'assessoria' em nenhum lugar. Use SEMPRE que o cliente demonstrar interesse num pacote específico. NÃO exige CPF nem confirmação — pacote é conteúdo público. Depois de chamar, responda com UM balão curto só perguntando 'O que você achou?' (ou variação natural).",
      inputSchema: z.object({
        slug: z.string().describe("slug do pacote (vem de buscar_pacotes)"),
        quantidade_adultos: z.number().int().nullable().describe("adultos para calcular Pix total; padrão = base_occupancy (geralmente 2)"),
        origem_cliente: z
          .string()
          .nullable()
          .describe("OBRIGATÓRIO: cidade de saída que ESTE cliente informou nesta conversa (ex: 'Vitória'). Nunca invente nem use a origem do pacote."),
        mes_desejado: z
          .string()
          .nullable()
          .describe("OBRIGATÓRIO quando o cliente citou período: mês/período pedido por ele (ex: 'novembro', '11', '2026-11')."),
      }),
      execute: async ({ slug, quantidade_adultos, origem_cliente, mes_desejado }) => {
        const { data: pkg } = await supabaseAdmin
          .from("packages")
          .select("id, slug, title, destination, origin, going_date, return_date, price_per_person, image_url, meal_plan, includes, base_occupancy, hotel_name, hotel_stars, is_active, services, supplier_name")
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

        /* ── TRAVA DE CONSISTÊNCIA ────────────────────────────────────────────
           O folder não pode sair com origem ou período diferentes do que o
           cliente informou nesta conversa (bug real: cliente de Vitória
           recebendo pacote saindo de Maringá/Curitiba). */
        const norm = (s: string) =>
          s
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
        if (origem_cliente && String(origem_cliente).trim().length >= 2) {
          const oCli = norm(String(origem_cliente));
          const oPkg = norm(String((pkg as any).origin ?? ""));
          if (oPkg && !oPkg.includes(oCli) && !oCli.includes(oPkg)) {
            return {
              bloqueado: true,
              motivo: "origem_divergente",
              origem_do_cliente: origem_cliente,
              origem_do_pacote: (pkg as any).origin,
              instrucao: `NÃO envie este folder. O cliente sai de ${origem_cliente} e este pacote sai de ${(pkg as any).origin}. Nunca troque a cidade de embarque do cliente. Busque pacote com a origem correta; se não existir, avise o cliente que não há pacote pronto saindo de ${origem_cliente} e ofereça montar personalizado com o time Comercial (chamando escalar_para_humano com todo o contexto).`,
            };
          }
        }
        const MESES = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
        if (mes_desejado && String(mes_desejado).trim()) {
          const alvo = norm(String(mes_desejado));
          let mesAlvo = MESES.findIndex((m) => alvo.includes(m)) + 1;
          if (!mesAlvo) {
            const m = alvo.match(/(?:^|-)(\d{1,2})(?:$|-)/);
            if (m) mesAlvo = Number(m[1]);
          }
          const mesPkg = (pkg as any).going_date ? Number(String((pkg as any).going_date).slice(5, 7)) : 0;
          if (mesAlvo && mesPkg && mesAlvo !== mesPkg) {
            return {
              bloqueado: true,
              motivo: "periodo_divergente",
              mes_pedido: MESES[mesAlvo - 1],
              data_do_pacote: (pkg as any).going_date,
              instrucao: `NÃO envie este folder. O cliente pediu ${MESES[mesAlvo - 1]} e este pacote sai em ${(pkg as any).going_date}. Nunca altere o período pedido por conta própria. Procure pacote no mês correto; se não houver, diga isso ao cliente e ofereça montar personalizado com o Comercial.`,
            };
          }
        }

        // Passageiros: nunca cair no padrão do pacote sem o cliente ter dito.
        if (quantidade_adultos == null || quantidade_adultos <= 0) {
          return {
            bloqueado: true,
            motivo: "pax_nao_informado",
            instrucao:
              "NÃO envie o folder. Você não passou a quantidade de passageiros que ESTE cliente informou. Nunca use o padrão do pacote (2 adultos). Releia a conversa e chame de novo com quantidade_adultos correto; se ele ainda não disse, pergunte em um balão curto.",
          };
        }
        const ocupBase = Number((pkg as any).base_occupancy ?? 2);
        if (quantidade_adultos === 1 && ocupBase >= 2) {
          return {
            bloqueado: true,
            motivo: "ocupacao_individual",
            ocupacao_base: ocupBase,
            instrucao:
              "NÃO envie este folder. Nossos pacotes prontos são calculados para 2 adultos e o cliente vai viajar sozinho. Explique isso e CONDUZA, sem pedir permissão: nada de \"quer que eu siga?\". Diga algo como: \"Nossos pacotes prontos disponíveis hoje são calculados para 2 adultos. Como no seu caso é só 1 pessoa, precisamos montar uma cotação personalizada pra te passar o valor certinho. Já vou encaminhar pro nosso time comercial com as informações que você me passou.\" Em seguida transfira para o Comercial levando o briefing completo (origem, destino, período, noites, passageiros), sem fazer o cliente repetir nada.",

          };
        }
        const qtd = quantidade_adultos;


        const priceP = Number(pkg.price_per_person) || 0;
        const total = priceP * qtd;
        const pixTotal = total * 0.95;
        const isCaptive = /cativ/i.test(String((pkg as any).supplier_name ?? ""));
        const parcelaVisaMaster = total / 15;
        const parcelaOutrasBandeiras = total / 10;
        const parcelaCartao10 = total / 10;

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
          const brl2 = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          // termo proibido: nunca sai "assessoria" no folder
          for (let i = services_lines.length - 1; i >= 0; i--) {
            if (/assessoria/i.test(services_lines[i])) services_lines.splice(i, 1);
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
          if (isCaptive) {
            lines.push(`💳 *Cartão Visa/Master:* 15x de ${brl2(parcelaVisaMaster)}`);
            lines.push(`💳 *Demais bandeiras:* 10x de ${brl2(parcelaOutrasBandeiras)}`);
          } else {
            lines.push(`💳 *Cartão de crédito:* 10x de ${brl2(parcelaCartao10)}`);
          }
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
        let sentWaId: string | null = null;
        if (pkg.image_url) {
          const r = await sendWhatsAppImage(conversation.wa_phone, pkg.image_url, caption);
          sentWaId = r.id ?? null;
          if (r.error) {
            sendErr = r.error;
            const fb = await sendWhatsAppText(conversation.wa_phone, caption);
            sentWaId = fb.id ?? null;
          }
        } else {
          const r = await sendWhatsAppText(conversation.wa_phone, caption);
          sentWaId = r.id ?? null;
        }

        await saveMessage({
          conversation_id: conversation.id,
          direction: "outbound",
          sender: aiSender(conversation.agent_slug),
          agent_slug: conversation.agent_slug ?? null,
          content: caption,
          wa_message_id: sentWaId,
        });

        // Detecta se já foi enviado pacote antes nessa conversa (folder tem o link /w/)
        // e se o cliente falou em personalização nas últimas mensagens.
        const { data: recentMsgs } = await supabaseAdmin
          .from("wa_messages")
          .select("direction, content")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(40);
        const priorFolders = (recentMsgs ?? []).filter(
          (m: any) => m.direction === "outbound" && typeof m.content === "string" && m.content.includes("/w/") && m.content !== caption,
        ).length;
        const lastInbound = (recentMsgs ?? [])
          .filter((m: any) => m.direction === "inbound")
          .slice(0, 6)
          .map((m: any) => String(m.content || "").toLowerCase())
          .join(" ");
        const clienteFalouPersonalizado = /personaliz|outro hotel|outra origem|outra data|trocar hotel|montar (um )?pacote|montar pra mim|montar pra n[oó]s|montar personalizado|sob medida|customiz/.test(lastInbound);
        const isFirstPackage = priorFolders === 0;

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

        const incluirConvitePersonalizacao = isFirstPackage || clienteFalouPersonalizado;
        const nOrdinal = priorFolders + 1; // 1 = primeiro, 2 = segundo, 3 = terceiro...
        const aberturasProibidas = priorFolders === 0
          ? "" // primeiro pacote pode usar 'Olha, que legal...'
          : " PROIBIDO começar com 'Olha, que legal', 'Que legal', 'Que incrível', 'Nossa, adoro' ou qualquer variação de elogio genérico — isso soa robótico quando é o " + (nOrdinal === 2 ? "segundo" : nOrdinal === 3 ? "terceiro" : `${nOrdinal}º`) + " pacote da conversa. Em vez disso, faça uma abertura que CONECTA com a mensagem anterior do cliente, do tipo: 'E olha esse outro aqui, ó...', 'Esse aqui é uma alternativa bem legal — ...', 'Já esse é diferente porque...', 'Tem esse também que...', 'Se preferir mais [ponto forte], esse encaixa melhor...'. Varie sempre, nunca repita a mesma abertura de um pacote anterior nesta conversa.";
        const instrucaoBase =
          "Folder do pacote JÁ foi enviado (imagem + descritivo + preços + link). NÃO repita título, datas, valores nem link. AGORA mande 1 mensagem curta e humanizada (3 a 5 linhas curtas, tom de consultora experiente e simpática, NADA robótico, NADA de venda empurrada) resumindo em português natural 2 ou 3 destaques da lista 'destaques_para_comentar'. Encaixe UMA sugestão sutil de vantagem quando fizer sentido ('hotel muito bem avaliado', 'datas saindo rápido', 'com café já incluso')." + aberturasProibidas;
        const instrucaoConvite = incluirConvitePersonalizacao
          ? " Inclua no final, antes da pergunta, um convite leve de personalização, algo como: 'Se preferir, também consigo montar um personalizado pra você — posso trocar o hotel, mudar a origem, ajustar as datas ou incluir mais serviços, é só me falar o que faz mais sentido.' (varie a redação, cite pelo menos: outra origem, outro hotel e outros serviços)."
          : " NÃO ofereça personalização nem diga 'se preferir posso montar personalizado' — o cliente já viu opções antes e ficaria repetitivo. Só ofereça personalização se o cliente PEDIR explicitamente (falar em outro hotel, outra origem, montar sob medida, etc.). Vá direto ao ponto: 2-3 linhas comparando/destacando o que esse pacote tem de diferente ou interessante e termine com pergunta gentil.";
        const instrucaoFinal =
          " TERMINE com uma pergunta gentil e variada (ex.: 'Curtiu?', 'Faz sentido?', 'Esse encaixa melhor?', 'O que acha desse?', 'Quer que eu segure a disponibilidade?'), sem repetir a mesma pergunta de mensagens anteriores. No máx. 1 emoji na mensagem inteira. Sem asterisco de negrito, sem hashtag, sem link.";

        return {
          ok: true,
          enviado: true,
          image_fallback_error: sendErr ?? null,
          destaques_para_comentar: highlights,
          eh_primeiro_pacote: isFirstPackage,
          cliente_pediu_personalizacao: clienteFalouPersonalizado,
          instrucao: instrucaoBase + instrucaoConvite + instrucaoFinal,
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
        "Sinaliza que a conversa precisa ser assumida pelo time comercial humano (nova cotação, alteração/cancelamento de voo pela cia, reclamação, algo fora do seu escopo). Marca prioridade + briefing pro painel do atendente e adiciona a tag 'aguardando_humano'. IMPORTANTE: você (IA) CONTINUA respondendo normalmente até um atendente humano de fato assumir — se o cliente mandar mais mensagens depois, siga atendendo com naturalidade. Preencha os campos estruturados com o que já foi coletado.",

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
        // 🚫 BLOQUEIO DE ESCALAÇÃO SEM NECESSIDADE: nunca transferir alguém que
        // só cumprimentou ("boa noite, tudo bem?"). Sem NENHUM dado do que o
        // cliente precisa, o Consultor tem que se apresentar e perguntar antes.
        const temNecessidade = [destino, data_ida, data_volta, voo_info, orcamento, hotel_preferencia, observacoes]
          .some((v) => typeof v === "string" && v.trim().length > 2) ||
          (quantidade_adultos != null && quantidade_adultos > 0) ||
          (quantidade_criancas != null && quantidade_criancas > 0);
        if (!temNecessidade) {
          return {
            ok: false,
            bloqueado: true,
            instrucao:
              "NÃO houve transferência nenhuma. É PROIBIDO dizer que sinalizou/passou pro time comercial, é proibido agradecer a preferência e é proibido se despedir. O cliente ainda não disse o que precisa. Responda como atendimento normal: se ainda não se apresentou neste protocolo, cumprimente pelo nome, diga quem você é (nome + consultor(a) da VIA AIR) e pergunte como pode ajudar hoje. Se já se apresentou, faça UMA pergunta curta e natural pra entender o que ele precisa. Só use esta tool de novo depois de saber a necessidade real.",
          };
        }

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
            // NÃO troca mode pra "human" aqui: a IA continua atendendo até um
            // atendente humano de fato assumir (assumir = enviar mensagem pelo
            // painel, o que já troca mode=human em queries.functions.ts).
            // Só marca prioridade e a tag "aguardando_humano" pro painel.
            priority: prioridade ?? "normal",
            tags: newTags,
            // Escalada genérica é pra TODO MUNDO ver — libera assigned_to
            // pra conversa aparecer como "não atribuída" no painel de todos
            // os atendentes ativos, não fica travada com um só.
            assigned_to: null,
          })
          .eq("id", conversation.id);

        // Salva a "necessidade do cliente" no protocolo ativo pra aparecer no painel do atendente
        if (conversation.protocolo_ativo_id) {
          await supabaseAdmin
            .from("wa_protocolos")
            .update({ assunto_resumo: briefing })
            .eq("id", conversation.protocolo_ativo_id);
        }

        // Registra o pedido de handoff pro painel, mas mantém from_mode/to_mode
        // sinalizando que ainda estamos em IA aguardando humano assumir.
        await recordHandoff({
          conversation_id: conversation.id,
          from_mode: "ai",
          to_mode: "ai",
          reason: `aguardando_humano:${motivo}`,
          briefing,
        });

        // Checa horário comercial (America/Sao_Paulo, 09:00–21:00)
        const hourSP = Number(
          new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hour12: false,
          }).format(new Date()),
        );
        const dentroDoHorario = hourSP >= 9 && hourSP < 21;

        const instrucao = dentroDoHorario
          ? "Envie UMA mensagem curta (2 a 3 linhas) confirmando que já anotou tudo e passou pro time comercial, e que em breve um consultor entra em contato por aqui mesmo. NÃO mencione horário de atendimento (o cliente já está DENTRO do horário comercial 09h–21h). SEMPRE agradeça com 'obrigado pela preferência' — NUNCA 'obrigado pela paciência'. IMPORTANTE: você (IA) CONTINUA no atendimento — se o cliente mandar mais alguma coisa depois, siga respondendo com naturalidade até o atendente humano assumir. Não se despeça de vez."
          : "Envie UMA mensagem curta (2 a 4 linhas) avisando que já sinalizou pro time comercial. Como está FORA do horário comercial, informe que o comercial atende das 09h às 21h e que logo no início do expediente um consultor entra em contato por aqui. SEMPRE agradeça com 'obrigado pela preferência' — NUNCA 'obrigado pela paciência'. IMPORTANTE: você (IA) CONTINUA no atendimento — se o cliente mandar mais alguma coisa depois, siga respondendo com naturalidade até o atendente humano assumir. Não se despeça de vez.";

        return {
          ok: true,
          instrucao,
        };

      },
    }),

    transferir_para_atendente: tool({
      description:
        "Use esta tool SEMPRE que o cliente pedir para falar/continuar com um atendente humano específico pelo nome (ex.: 'quero falar com o Lucas', 'me passa pra Nathally', 'a Camila que me atendeu antes'). Busca no cadastro de atendentes VIA AIR (equipe interna) o nome informado. Regras: (1) se encontrar EXATAMENTE 1 atendente, a conversa é transferida automaticamente pra ele — envie 1 mensagem curta confirmando o repasse pelo nome; (2) se encontrar MAIS de um com nome parecido, NÃO transfere — pergunte ao cliente qual deles (ex.: 'temos o Lucas Silva e o Lucas Andrade, sabe dizer qual te atendeu?'); (3) se não encontrar nenhum, informe que não localizou esse atendente e ofereça repassar pro time comercial (aí use a tool escalar_para_humano em seguida se o cliente concordar). NUNCA invente nome de atendente que não venha desta tool.",
      inputSchema: z.object({
        nome: z
          .string()
          .min(2)
          .describe("Nome (ou parte do nome) do atendente conforme o cliente falou. Ex.: 'Lucas', 'Nathally', 'Fabrício'. Pode ser primeiro nome, sobrenome ou completo."),
      }),
      execute: async ({ nome }) => {
        const termo = nome.trim().replace(/[%_]/g, "");
        if (!termo) return { error: "Nome vazio." };

        // Só admins (equipe interna) podem receber transferência — mesma
        // regra do listAttendants no painel de chat.
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const adminIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
        if (adminIds.length === 0) {
          return {
            encontrados: 0,
            instrucao:
              "Diga com naturalidade que não encontrou esse atendente no sistema agora e pergunte se quer que você registre um pedido pro time comercial retornar.",
          };
        }

        const { data: matches } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", adminIds)
          .ilike("full_name", `%${termo}%`)
          .order("full_name");

        const list = (matches ?? []).filter((m) => (m.full_name ?? "").trim().length > 0);

        if (list.length === 0) {
          return {
            encontrados: 0,
            termo_buscado: termo,
            instrucao: `Diga ao cliente, com naturalidade, que não localizou nenhum atendente com o nome "${termo}" no sistema. Pergunte se ele lembra o nome completo ou se prefere que você encaminhe pro time comercial em geral (nesse caso, na próxima resposta use a tool escalar_para_humano com motivo apropriado).`,
          };
        }

        if (list.length > 1) {
          const nomes = list.map((m) => m.full_name).filter(Boolean) as string[];
          return {
            encontrados: list.length,
            opcoes: nomes,
            instrucao: `Envie UMA mensagem curta perguntando ao cliente qual desses atendentes é. Cite os nomes assim: ${nomes.join(" e ")}. Ex.: "temos aqui o ${nomes[0]} e o ${nomes[1]}${nomes.length > 2 ? ` (e mais ${nomes.length - 2})` : ""} — sabe dizer qual te atendeu?". NÃO transfira até o cliente confirmar; quando confirmar, chame esta tool de novo com o nome completo escolhido.`,
          };
        }

        // Match único: transfere agora.
        const alvo = list[0];
        // Nome curto: só primeiro nome se for ÚNICO entre todos os atendentes
        // admins; se houver outro admin com o mesmo primeiro nome, usa
        // primeiro + último pra desambiguar. Sempre em negrito no WhatsApp.
        const partes = (alvo.full_name ?? "").trim().split(/\s+/).filter(Boolean);
        const primeiro = partes[0] ?? (alvo.full_name ?? "");
        const ultimo = partes.length >= 2 ? partes[partes.length - 1] : "";
        const { data: allAdmins } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", adminIds);
        const primeiroNorm = primeiro.toLowerCase();
        const conflita = (allAdmins ?? []).some((a) => {
          if (a.id === alvo.id) return false;
          const p0 = (a.full_name ?? "").trim().split(/\s+/)[0]?.toLowerCase();
          return p0 === primeiroNorm;
        });
        const nomeCurto = conflita && ultimo ? `${primeiro} ${ultimo}` : primeiro;
        const nomeBold = `*${nomeCurto}*`;

        const existingTags = conversation.tags ?? [];
        const newTags = Array.from(new Set([...existingTags, "transferencia_nominal", "aguardando_humano"]));
        await supabaseAdmin
          .from("wa_conversations")
          .update({
            assigned_to: alvo.id,
            mode: "human",
            tags: newTags,
            priority: "high",
          })
          .eq("id", conversation.id);

        if (conversation.protocolo_ativo_id) {
          await supabaseAdmin
            .from("wa_protocolos")
            .update({
              assunto_resumo: `Cliente pediu falar diretamente com ${alvo.full_name}.`,
            })
            .eq("id", conversation.protocolo_ativo_id);
        }

        await recordHandoff({
          conversation_id: conversation.id,
          from_mode: "ai",
          to_mode: "human",
          reason: `transferencia_nominal:${alvo.full_name}`,
          briefing: `Cliente solicitou nominalmente falar com ${alvo.full_name}. Conversa atribuída automaticamente.`,
        });

        return {
          encontrados: 1,
          atendente: alvo.full_name,
          nome_curto: nomeCurto,
          transferido: true,
          instrucao: `Envie UMA mensagem curta (2-3 linhas) confirmando que já transferiu a conversa pra ${nomeBold} e que ${nomeBold} responde em breve por aqui. REGRA OBRIGATÓRIA: use EXATAMENTE "${nomeBold}" (com os asteriscos do WhatsApp pra negrito) — NUNCA use o nome completo "${alvo.full_name}", só a versão curta "${nomeCurto}". Horário comercial 09h às 21h — se fora do horário, avise que retorna no início do próximo expediente. Use "obrigado pela preferência", NUNCA "paciência". A partir desta mensagem você (IA) não responde mais nesta conversa até o atendente humano assumir.`,
        };
      },
    }),

    /* ── Roteamento para a Central de Especialistas (só passagens aéreas) ── */
    transferir_para_central: tool({
      description:
        "Use SOMENTE quando o cliente pedir uma cotação de PASSAGEM AÉREA avulsa (ex.: 'quero uma passagem', 'quero um voo', 'quero cotar um aéreo', 'quero comprar só as passagens'). Encaminha o atendimento para a Central de Especialistas, que opera o motor de busca de passagens. NUNCA use para pacotes prontos, personalização de pacote, hotel, carro, seguro ou cruzeiro — esses continuam com você (e, se não houver pacote, com o time Comercial).",
      inputSchema: z.object({
        origem: z.string().nullable().describe("Cidade/aeroporto de origem, se já informado"),
        destino: z.string().nullable().describe("Cidade/aeroporto de destino, se já informado"),
        data_ida: z.string().nullable().describe("Data de ida como o cliente falou"),
        data_volta: z.string().nullable().describe("Data de volta, ou null se só ida"),
        quantidade_adultos: z.number().int().nullable(),
        quantidade_criancas: z.number().int().nullable(),
        observacoes: z.string().nullable().describe("Preferências já ditas: horário, companhia, bagagem, orçamento"),
      }),
      execute: async (input) => {
        // ── TRAVA DE ESCOPO (não depende do LLM) ────────────────────────
        // Se o cliente falou de hotel, pacote ou qualquer outro serviço nas
        // últimas mensagens, a transferência é BLOQUEADA e o atendimento
        // continua com o consultor (Comercial).
        {
          const { contemProdutoCombinado } = await import("./escopo-produto");
          const { data: ultimas } = await supabaseAdmin
            .from("wa_messages")
            .select("content")
            .eq("conversation_id", conversation.id)
            .eq("direction", "inbound")
            .order("created_at", { ascending: false })
            .limit(4);
          const textoCliente = ((ultimas ?? []) as Array<{ content: string | null }>)
            .map((m) => (m.content ?? "").trim())
            .filter(Boolean)
            .join("\n");
          const combinado =
            contemProdutoCombinado(textoCliente) ||
            contemProdutoCombinado(`${input.observacoes ?? ""} ${input.destino ?? ""}`);
          if (combinado) {
            console.log(
              JSON.stringify({
                event: "transferencia_central_bloqueada",
                conversation_id: conversation.id,
                motivo: "produto_combinado",
              }),
            );
            return {
              ok: false,
              motivo: "produto_combinado",
              instrucao:
                "TRANSFERÊNCIA BLOQUEADA: o cliente quer pacote / aéreo + hotel / outro serviço combinado. " +
                "Isso é COMERCIAL e continua com VOCÊ. Não fale em transferência, não cite Central nem especialista. " +
                "Siga o atendimento normalmente, reaproveitando tudo o que ele já informou (destino, datas, passageiros, origem) " +
                "e pergunte apenas o dado que ainda falta.",
            };
          }
        }

        const linhas: string[] = ["✈️ Cotação de passagem aérea (encaminhado à Central de Especialistas)"];

        if (input.origem) linhas.push(`📍 Origem: ${input.origem}`);
        if (input.destino) linhas.push(`📍 Destino: ${input.destino}`);
        if (input.data_ida) linhas.push(`📅 Ida: ${input.data_ida}`);
        linhas.push(`🔁 Tipo: ${input.data_volta ? `ida e volta (volta ${input.data_volta})` : "a confirmar / somente ida"}`);
        if (input.quantidade_adultos != null) linhas.push(`👥 Adultos: ${input.quantidade_adultos}`);
        if (input.quantidade_criancas != null) linhas.push(`🧒 Crianças: ${input.quantidade_criancas}`);
        if (input.observacoes) linhas.push(`📝 Obs: ${input.observacoes}`);
        const brief = linhas.join("\n");

        // Escolhe o especialista de forma determinística (menor carga → round-robin).
        const { pickEspecialista } = await import("./triage.server");
        const escolhido = await pickEspecialista();

        await supabaseAdmin
          .from("wa_conversations")
          .update({
            central_slug: escolhido,
            central_desde: new Date().toISOString(),
            central_brief: brief,
            central_busca: "aereo",
          })
          .eq("id", conversation.id);

        await recordHandoff({
          conversation_id: conversation.id,
          from_mode: "ai",
          to_mode: "ai",
          reason: "central_especialistas:aereo",
          briefing: brief,
        }).catch(() => {});

        return {
          ok: true,
          instrucao:
            'Envie AGORA uma única mensagem curta, natural e sem acrescentar perguntas: "Claro! Já vou te transferir pro nosso setor aéreo, que continua com vc por aqui." Não fale em Central de Especialistas, não peça mais nenhum dado e não deixe o novo agente aparecer sem este aviso.',
        };
      },
    }),

    _meta: { isIdentityVerified }, // usado só pelo runner pra decidir prompt

  };
}

