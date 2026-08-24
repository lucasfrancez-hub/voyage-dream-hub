/**
 * Catálogo de módulos (menus) do painel VIA AIR.
 *
 * Cada módulo é liberado por usuário na tela Configurações › Usuários.
 * Admin e gestor enxergam tudo automaticamente.
 */

export type Modulo = {
  key: string;
  label: string;
  grupo: string;
  /** prefixos de rota cobertos por este módulo */
  paths: string[];
};

export const MODULOS: Modulo[] = [
  // Produtos
  { key: "pacotes", label: "Command Center", grupo: "Produtos", paths: ["/admin/pacotes"] },
  { key: "cruzeiros", label: "Cruzeiros", grupo: "Produtos", paths: ["/admin/cruzeiros"] },
  { key: "promocoes-aereo", label: "Promoções de Aéreo", grupo: "Produtos", paths: ["/admin/promocoes-aereo"] },
  { key: "buscar", label: "Motor de busca", grupo: "Produtos", paths: ["/admin/buscar"] },
  { key: "motor-pacote", label: "Motor de pacote", grupo: "Produtos", paths: ["/admin/motor-pacote"] },
  { key: "passhub", label: "Consolidadora", grupo: "Produtos", paths: ["/admin/passhub"] },

  // Dashboard e cadastros
  { key: "dashboard", label: "Dashboard", grupo: "Dashboard", paths: ["/admin/dashboard"] },
  { key: "pessoas", label: "Pessoas", grupo: "Dashboard", paths: ["/admin/pessoas"] },
  { key: "notas-fiscais", label: "Notas fiscais", grupo: "Dashboard", paths: ["/admin/notas-fiscais"] },
  { key: "checkins", label: "Check-ins", grupo: "Dashboard", paths: ["/admin/checkins"] },
  { key: "redes-sociais", label: "Redes sociais", grupo: "Dashboard", paths: ["/admin/redes-sociais"] },
  { key: "editair", label: "EditAir (editor de vídeo)", grupo: "Dashboard", paths: ["/editair"] },

  // Financeiro
  { key: "contas-receber", label: "Contas a receber", grupo: "Financeiro", paths: ["/admin/contas-receber"] },
  { key: "contas-pagar", label: "Contas a pagar", grupo: "Financeiro", paths: ["/admin/contas-pagar"] },
  { key: "recebimentos", label: "Recebimentos", grupo: "Financeiro", paths: ["/admin/recebimentos"] },
  { key: "pagamentos", label: "Pagamentos", grupo: "Financeiro", paths: ["/admin/pagamentos"] },
  { key: "conta-bancaria", label: "Conta bancária", grupo: "Financeiro", paths: ["/admin/conta-bancaria"] },
  { key: "comprovantes", label: "Comprovantes", grupo: "Financeiro", paths: ["/admin/comprovantes"] },

  // Pedidos
  { key: "pedidos", label: "Meus pedidos", grupo: "Pedidos", paths: ["/admin/pedidos"] },
  { key: "orcamentos", label: "Orçamentos", grupo: "Pedidos", paths: ["/admin/orcamentos"] },
  { key: "pedidos-terceiros", label: "Pedidos de terceiro", grupo: "Pedidos", paths: ["/admin/pedidos/terceiros"] },
  { key: "reservas", label: "Reservas", grupo: "Pedidos", paths: ["/admin/reservas"] },
  { key: "bilhetes", label: "Bilhetes", grupo: "Pedidos", paths: ["/admin/bilhetes"] },

  // Pagamentos / links
  { key: "link-pagamento", label: "Link seguro", grupo: "Pagamentos", paths: ["/admin/link-pagamento"] },
  { key: "link-cartao-simples", label: "Link convencional", grupo: "Pagamentos", paths: ["/admin/link-cartao-simples"] },
  { key: "link-boleto", label: "Link boleto bancário", grupo: "Pagamentos", paths: ["/admin/link-boleto"] },
  { key: "cobranca-cartao", label: "Cobrança no cartão (ASAAS)", grupo: "Pagamentos", paths: ["/admin/cobranca-cartao"] },
  { key: "link-asaas", label: "Cobrança ASAAS (Pix/Boleto)", grupo: "Pagamentos", paths: ["/admin/link-asaas"] },
  { key: "cofre", label: "Cofre", grupo: "Pagamentos", paths: ["/admin/cofre"] },
  { key: "encurtador", label: "Encurtador de URL", grupo: "Pagamentos", paths: ["/admin/encurtador"] },
  { key: "melhores-destinos", label: "Melhores Destinos", grupo: "Pagamentos", paths: ["/admin/melhores-destinos"] },
  { key: "passagens-baratas", label: "Passagens baratas", grupo: "Pagamentos", paths: ["/admin/passagens-baratas"] },

  // Configurações
  { key: "seguranca", label: "Segurança", grupo: "Configurações", paths: ["/admin/seguranca"] },
  { key: "metricas", label: "Métricas", grupo: "Configurações", paths: ["/admin/metricas"] },
  { key: "instalar-extensao", label: "Instalar extensão", grupo: "Configurações", paths: ["/admin/instalar-extensao"] },
  { key: "app-celular", label: "App no celular", grupo: "Configurações", paths: ["/admin/app-celular"] },
  { key: "pacotes-cativa", label: "Catálogo de pacotes", grupo: "Configurações", paths: ["/admin/pacotes-cativa"] },
  { key: "comprefacil", label: "Catálogo CompreFácil", grupo: "Configurações", paths: ["/admin/comprefacil"] },
  { key: "regras-parcelamento", label: "Regras de parcelamento", grupo: "Configurações", paths: ["/admin/regras-parcelamento"] },
  { key: "codigos-auth", label: "Códigos 2FA por e-mail", grupo: "Configurações", paths: ["/admin/codigos-auth"] },
  { key: "usuarios", label: "Usuários e permissões", grupo: "Configurações", paths: ["/admin/usuarios"] },

  // Atendimento
  { key: "chat", label: "Chat (WhatsApp + IA)", grupo: "Atendimento", paths: ["/chat"] },
];

export const MODULO_KEYS = MODULOS.map((m) => m.key);

/** Módulo que cobre a rota informada (prefixo mais específico), ou null. */
export function moduloDaRota(pathname: string): Modulo | null {
  let melhor: { modulo: Modulo; tamanho: number } | null = null;
  for (const m of MODULOS) {
    for (const p of m.paths) {
      if (pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`)) {
        if (!melhor || p.length > melhor.tamanho) melhor = { modulo: m, tamanho: p.length };
      }
    }
  }
  return melhor?.modulo ?? null;
}

export function modulosPorGrupo(): { grupo: string; modulos: Modulo[] }[] {
  const grupos: { grupo: string; modulos: Modulo[] }[] = [];
  for (const m of MODULOS) {
    let g = grupos.find((x) => x.grupo === m.grupo);
    if (!g) {
      g = { grupo: m.grupo, modulos: [] };
      grupos.push(g);
    }
    g.modulos.push(m);
  }
  return grupos;
}
