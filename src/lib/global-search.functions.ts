import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GlobalSearchResult = {
  id: string;
  type:
    | "pedido"
    | "passageiro"
    | "localizador"
    | "pessoa"
    | "pacote"
    | "financeiro"
    | "nfse"
    | "pagina";
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  to: string;
  params?: Record<string, string>;
};

const STATIC_PAGES: Array<{ title: string; subtitle: string; to: string; keywords: string[] }> = [
  { title: "Dashboard", subtitle: "Painel principal", to: "/admin/dashboard", keywords: ["dashboard", "painel", "início", "home"] },
  { title: "Pedidos", subtitle: "Gestão de pedidos", to: "/admin/pedidos", keywords: ["pedidos", "reservas", "orders"] },
  { title: "Pedidos de terceiros", subtitle: "Pedidos de terceiros", to: "/admin/pedidos/terceiros", keywords: ["terceiros", "pedidos terceiros"] },
  { title: "Pacotes", subtitle: "Catálogo de pacotes", to: "/admin/pacotes", keywords: ["pacotes", "packages", "catálogo"] },
  { title: "Pessoas", subtitle: "Clientes e contatos", to: "/admin/pessoas", keywords: ["pessoas", "clientes", "contatos", "cadastro"] },
  { title: "Check-ins", subtitle: "Fila de check-ins", to: "/admin/checkins", keywords: ["checkin", "check-in", "embarque", "cartão"] },
  { title: "Treino de check-in", subtitle: "IA de check-in", to: "/admin/checkin-treino", keywords: ["treino", "treinar", "ia", "checkin ia"] },
  { title: "Contas a pagar", subtitle: "Financeiro", to: "/admin/contas-pagar", keywords: ["contas a pagar", "pagar", "despesas", "financeiro"] },
  { title: "Contas a receber", subtitle: "Financeiro", to: "/admin/contas-receber", keywords: ["contas a receber", "receber", "receitas", "financeiro"] },
  { title: "Cofre", subtitle: "Cofre / caixa", to: "/admin/cofre", keywords: ["cofre", "caixa", "saldo"] },
  { title: "Notas fiscais", subtitle: "NFS-e", to: "/admin/notas-fiscais", keywords: ["nota fiscal", "nfse", "nfs-e", "focus"] },
  { title: "Link de pagamento", subtitle: "Gerar link", to: "/admin/link-pagamento", keywords: ["link pagamento", "cobrança", "pagar"] },
  { title: "Link de boleto", subtitle: "Gerar boleto", to: "/admin/link-boleto", keywords: ["boleto", "link boleto"] },
  { title: "Link cartão simples", subtitle: "Gerar link cartão", to: "/admin/link-cartao-simples", keywords: ["cartão", "link cartão"] },
  { title: "Usuários", subtitle: "Equipe / permissões", to: "/admin/usuarios", keywords: ["usuários", "equipe", "permissões", "roles"] },
  { title: "Segurança", subtitle: "Configurações de segurança", to: "/admin/seguranca", keywords: ["segurança", "auditoria"] },
  { title: "Instalar extensão", subtitle: "Extensão Chrome", to: "/admin/instalar-extensao", keywords: ["extensão", "chrome", "skyteam"] },
  { title: "Chat", subtitle: "Inbox WhatsApp", to: "/chat/inbox", keywords: ["chat", "whatsapp", "inbox", "conversas"] },
  { title: "CRM", subtitle: "Pipeline de vendas", to: "/chat/crm", keywords: ["crm", "pipeline", "vendas"] },
  { title: "Agenda", subtitle: "Agenda de atendimentos", to: "/chat/agenda", keywords: ["agenda", "calendário"] },
  { title: "Protocolos", subtitle: "Atendimentos", to: "/chat/protocolos", keywords: ["protocolos", "atendimentos"] },
  { title: "Contatos", subtitle: "Contatos do chat", to: "/chat/contatos", keywords: ["contatos chat"] },
  { title: "Broadcast", subtitle: "Envio em massa", to: "/chat/broadcast", keywords: ["broadcast", "envio massa", "campanha"] },
  { title: "Fluxos", subtitle: "Automações", to: "/chat/fluxos", keywords: ["fluxos", "automação", "bot"] },
  { title: "Pastas", subtitle: "Organização", to: "/chat/pastas", keywords: ["pastas", "tags"] },
  { title: "Agentes", subtitle: "IA / agentes", to: "/chat/agentes", keywords: ["agentes", "ia", "camila", "roberto"] },
  { title: "Configurações do chat", subtitle: "WhatsApp / UazAPI", to: "/chat/config", keywords: ["config chat", "uazapi", "whatsapp config"] },
];

export const searchGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) {
      const { data: isPartner } = await supabase.rpc("has_role", { _user_id: userId, _role: "partner" });
      if (!isPartner) throw new Error("Forbidden");
    }

    const q = (data.q || "").trim();
    if (q.length < 2) return [] as GlobalSearchResult[];
    const like = `%${q}%`;
    const qLower = q.toLowerCase();
    const results: GlobalSearchResult[] = [];

    // Páginas estáticas (match por título/keywords)
    for (const p of STATIC_PAGES) {
      const hay = [p.title, p.subtitle, ...p.keywords].join(" ").toLowerCase();
      if (hay.includes(qLower)) {
        results.push({ id: `page:${p.to}`, type: "pagina", title: p.title, subtitle: p.subtitle, to: p.to });
      }
    }

    // Pedidos
    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_number, full_name, trip_title, supplier_order_number, payer_full_name")
      .or(
        [
          `full_name.ilike.${like}`,
          `order_number.ilike.${like}`,
          `trip_title.ilike.${like}`,
          `supplier_order_number.ilike.${like}`,
          `payer_full_name.ilike.${like}`,
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(15);
    for (const o of (orders ?? []) as Array<Record<string, unknown>>) {
      results.push({
        id: `order:${o.id as string}`,
        type: "pedido",
        title: (o.trip_title as string) || (o.full_name as string) || (o.payer_full_name as string) || "Pedido",
        subtitle: `#${(o.order_number as string) ?? String(o.id).slice(0, 8).toUpperCase()}${o.supplier_order_number ? ` · ${o.supplier_order_number}` : ""}`,
        to: "/admin/pedidos/$id",
        params: { id: o.id as string },
      });
    }

    // Passageiros → pedido
    const seenOrderIds = new Set((orders ?? []).map((o: any) => o.id));
    const { data: pax } = await supabase
      .from("order_passengers")
      .select("order_id, full_name, cpf, passport_number, document")
      .or(
        [
          `full_name.ilike.${like}`,
          `cpf.ilike.${like}`,
          `passport_number.ilike.${like}`,
          `document.ilike.${like}`,
        ].join(","),
      )
      .limit(15);
    const paxIds = Array.from(new Set((pax ?? []).map((p: any) => p.order_id).filter((id: string) => !seenOrderIds.has(id))));
    if (paxIds.length) {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, order_number, full_name, trip_title, supplier_order_number")
        .in("id", paxIds);
      for (const o of (ords ?? []) as Array<Record<string, unknown>>) {
        const match = (pax ?? []).find((p: any) => p.order_id === o.id) as any;
        results.push({
          id: `order-pax:${o.id as string}`,
          type: "passageiro",
          title: (match?.full_name as string) || (o.full_name as string) || "Passageiro",
          subtitle: `Pedido #${(o.order_number as string) ?? String(o.id).slice(0, 8).toUpperCase()}`,
          to: "/admin/pedidos/$id",
          params: { id: o.id as string },
        });
      }
    }

    // Localizadores em order_items
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, supplier_locator, title")
      .ilike("supplier_locator", like)
      .limit(15);
    const itemIds = Array.from(new Set((items ?? []).map((p: any) => p.order_id).filter((id: string) => !seenOrderIds.has(id))));
    if (itemIds.length) {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, order_number, full_name, trip_title")
        .in("id", itemIds);
      for (const o of (ords ?? []) as Array<Record<string, unknown>>) {
        const match = (items ?? []).find((p: any) => p.order_id === o.id) as any;
        results.push({
          id: `order-loc:${o.id as string}`,
          type: "localizador",
          title: (match?.supplier_locator as string) || "Localizador",
          subtitle: `${(o.trip_title as string) || (o.full_name as string) || "Pedido"} · #${(o.order_number as string) ?? String(o.id).slice(0, 8).toUpperCase()}`,
          to: "/admin/pedidos/$id",
          params: { id: o.id as string },
        });
      }
    }

    // Pessoas
    const { data: people } = await supabase
      .from("people")
      .select("id, name, email, phone, cpf, cnpj")
      .or(
        [
          `name.ilike.${like}`,
          `email.ilike.${like}`,
          `phone.ilike.${like}`,
          `cpf.ilike.${like}`,
          `cnpj.ilike.${like}`,
        ].join(","),
      )
      .limit(15);
    for (const p of (people ?? []) as Array<Record<string, unknown>>) {
      results.push({
        id: `person:${p.id as string}`,
        type: "pessoa",
        title: (p.name as string) || "Pessoa",
        subtitle: (p.email as string) || (p.phone as string) || (p.cpf as string) || (p.cnpj as string) || null,
        to: "/admin/pessoas/$id",
        params: { id: p.id as string },
      });
    }

    // Pacotes
    const { data: pkgs } = await supabase
      .from("packages")
      .select("id, title, slug, destination")
      .or([`title.ilike.${like}`, `destination.ilike.${like}`, `slug.ilike.${like}`].join(","))
      .limit(10);
    for (const p of (pkgs ?? []) as Array<Record<string, unknown>>) {
      results.push({
        id: `pkg:${p.id as string}`,
        type: "pacote",
        title: (p.title as string) || "Pacote",
        subtitle: (p.destination as string) || null,
        to: "/admin/pacotes",
      });
    }

    // Financeiro
    const { data: fin } = await supabase
      .from("financial_entries")
      .select("id, kind, description, counterparty, amount, status")
      .or([`description.ilike.${like}`, `counterparty.ilike.${like}`, `category.ilike.${like}`].join(","))
      .order("created_at", { ascending: false })
      .limit(10);
    for (const f of (fin ?? []) as Array<Record<string, unknown>>) {
      const kind = String(f.kind ?? "");
      const to = kind === "payable" || kind === "expense" ? "/admin/contas-pagar" : "/admin/contas-receber";
      results.push({
        id: `fin:${f.id as string}`,
        type: "financeiro",
        title: (f.description as string) || (f.counterparty as string) || "Lançamento",
        subtitle: `${kind === "payable" || kind === "expense" ? "A pagar" : "A receber"}${f.counterparty ? ` · ${f.counterparty}` : ""}`,
        badge: String(f.status ?? ""),
        to,
      });
    }

    // NFS-e
    const { data: nfse } = await supabase
      .from("nfse_emissoes")
      .select("id, numero_rps, status")
      .or([`numero_rps.ilike.${like}`].join(","))
      .limit(5);
    for (const n of (nfse ?? []) as Array<Record<string, unknown>>) {
      results.push({
        id: `nfse:${n.id as string}`,
        type: "nfse",
        title: `RPS ${n.numero_rps ?? ""}`,
        subtitle: String(n.status ?? ""),
        to: "/admin/notas-fiscais",
      });
    }

    return results.slice(0, 60);
  });
