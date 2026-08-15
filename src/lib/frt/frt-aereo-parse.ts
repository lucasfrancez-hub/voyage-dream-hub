/**
 * PARSER DAS OPÇÕES AÉREAS DO MOTOR FRT ("Alterar voo").
 *
 * A FRT devolve CADA opção aérea em um painel próprio:
 *   frmResultadoProduto:rptAereoPesquisa:0:pnlAereoPreco
 *   frmResultadoProduto:rptAereoPesquisa:1:pnlAereoPreco
 *   ...
 * Nunca tratamos a resposta inteira como um único aéreo, e a quantidade de
 * opções é sempre descoberta dinamicamente (nada de N=10 hardcodado).
 */
import { parse, type HTMLElement } from "node-html-parser";
import { extractPartialUpdates } from "./frt-parse";
import {
  acharPorClasse,
  extrairAereo,
  linha,
  moedaParaNumero,
  texto,
  type FrtTrecho,
} from "./frt-package-parse";

export type FrtPrecoAereo = {
  moeda: string;
  porPessoa: number | null;
  porPessoaFormatado: string | null;
  total: number | null;
  totalFormatado: string | null;
  /** Diferença em relação ao aéreo-base (sempre positiva; o sinal vai em `diferencaTipo`). */
  diferenca: number | null;
  diferencaFormatada: string | null;
  diferencaTipo: "mais_caro" | "mais_barato" | "igual" | null;
  taxas: number | null;
  taxasFormatado: string | null;
  impostos: number | null;
  impostosFormatado: string | null;
};

export type FrtOpcaoAerea = {
  id: string;
  indice: number;
  companhia: string | null;
  logo: string | null;
  ida: FrtTrecho | null;
  volta: FrtTrecho | null;
  preco: FrtPrecoAereo;
  /** javax.faces.source do botão "Selecionar" desta opção (descoberto no HTML). */
  selectSource: string | null;
  selecionado: boolean;
};

export type FrtOpcoesAereasDiagnostico = {
  paineis: number;
  comPreco: number;
  comIda: number;
  comVolta: number;
  comSelectSource: number;
  ids: string[];
  origem: "partial-updates" | "dom" | "nenhuma";
};

const RE_PAINEL_AEREO = /rptAereoPesquisa:(\d+):pnlAereoPreco/;

function doc(html: string): HTMLElement {
  return parse(html.replace(/<!--[\s\S]*?-->/g, ""), {
    comment: false,
    blockTextElements: { script: false, style: false },
  });
}

function fmt(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  return bruto.replace(/\s+/g, " ").replace(/^BRL/i, "R$").trim();
}

function primeiroValor(txt: string): string | null {
  return txt.match(/(?:R\$|BRL|USD|EUR)?\s?[\d.]+,\d{2}/)?.[0] ?? null;
}

/** Preço da própria opção — lido apenas dentro do painel dela. */
function extrairPrecoAereo(painel: HTMLElement): FrtPrecoAereo {
  const txt = texto(painel);
  const moeda = /R\$/.test(txt) ? "BRL" : (txt.match(/\b(BRL|USD|EUR)\b/)?.[1] ?? "BRL");

  const elPessoa = acharPorClasse(painel, /price[_-]?per[_-]?person|preco[_-]?por[_-]?pessoa/i);
  const elTotal = acharPorClasse(painel, /price[_-]?total[_-]?container|price[_-]?total|preco[_-]?total/i);
  const elDiff = acharPorClasse(painel, /pacote[_-]?diff[_-]?preco|diff[_-]?preco|diferenca/i);

  const porPessoaFmt =
    (elPessoa ? primeiroValor(linha(elPessoa)) : null) ??
    txt.match(/((?:R\$|BRL)?\s?[\d.]+,\d{2})\s*(?:por\s+pessoa|\/\s*pessoa)/i)?.[1] ??
    txt.match(/por\s+pessoa[^\d]{0,20}((?:R\$|BRL)?\s?[\d.]+,\d{2})/i)?.[1] ??
    null;

  const totalFmt =
    (elTotal ? primeiroValor(linha(elTotal)) : null) ??
    txt.match(/total[^\d]{0,20}((?:R\$|BRL)?\s?[\d.]+,\d{2})/i)?.[1] ??
    null;

  const diffTexto = elDiff ? linha(elDiff) : (txt.match(/[+-]\s?(?:R\$|BRL)?\s?[\d.]+,\d{2}[^\n]{0,20}/)?.[0] ?? "");
  const diffFmt = diffTexto ? primeiroValor(diffTexto) : null;
  const diffNum = moedaParaNumero(diffFmt);
  let diferencaTipo: FrtPrecoAereo["diferencaTipo"] = null;
  if (diffNum != null) {
    if (diffNum === 0) diferencaTipo = "igual";
    else if (/mais\s+barato|desconto|economi/i.test(diffTexto) || /^\s*-/.test(diffTexto)) diferencaTipo = "mais_barato";
    else diferencaTipo = "mais_caro";
  } else if (/mesmo\s+valor|sem\s+diferen/i.test(txt)) {
    diferencaTipo = "igual";
  }

  const taxasFmt = txt.match(/taxas?[^\d]{0,20}((?:R\$|BRL)?\s?[\d.]+,\d{2})/i)?.[1] ?? null;
  const impostosFmt = txt.match(/impostos?[^\d]{0,20}((?:R\$|BRL)?\s?[\d.]+,\d{2})/i)?.[1] ?? null;

  return {
    moeda,
    porPessoa: moedaParaNumero(porPessoaFmt),
    porPessoaFormatado: fmt(porPessoaFmt),
    total: moedaParaNumero(totalFmt),
    totalFormatado: fmt(totalFmt),
    diferenca: diffNum != null ? Math.abs(diffNum) : null,
    diferencaFormatada: fmt(diffFmt),
    diferencaTipo,
    taxas: moedaParaNumero(taxasFmt),
    taxasFormatado: fmt(taxasFmt),
    impostos: moedaParaNumero(impostosFmt),
    impostosFormatado: fmt(impostosFmt),
  };
}

/** javax.faces.source do botão "Selecionar" — sempre lido do HTML, nunca fixo. */
export function acharSelectSource(painel: HTMLElement, indice: number): string | null {
  const candidatos = painel.querySelectorAll("button, a, input, span[onclick], div[onclick]");
  const reIndice = new RegExp(`rptAereoPesquisa:${indice}:`);

  const porTexto = candidatos.filter((c) => /selecionar|escolher|aplicar|usar\s+este/i.test(texto(c)));
  const ordem = [...porTexto, ...candidatos];

  for (const c of ordem) {
    const id = c.getAttribute("id") ?? "";
    if (id && reIndice.test(id) && /j_idt\d+|btn|select/i.test(id)) return id;
  }
  for (const c of ordem) {
    const onclick = `${c.getAttribute("onclick") ?? ""} ${c.getAttribute("data-pfconfirmcommand") ?? ""}`;
    const src =
      onclick.match(/PrimeFaces\.ab\(\s*\{\s*s\s*:\s*["'&quot;]+([^"'&]+)/)?.[1] ??
      onclick.match(/["']javax\.faces\.source["']\s*[:,]\s*["']([^"']+)["']/)?.[1] ??
      onclick.match(/source\s*:\s*["']([^"']+)["']/)?.[1] ??
      null;
    if (src && reIndice.test(src)) return src;
  }
  // Último recurso: qualquer id do índice correto dentro do painel.
  const qualquer = painel.querySelectorAll("[id]").find((c) => reIndice.test(c.getAttribute("id") ?? ""));
  return qualquer?.getAttribute("id") ?? null;
}

function painelParaOpcao(indice: number, id: string, html: string): FrtOpcaoAerea {
  const root = doc(html);
  const painel = (root.querySelector(`[id="${id}"]`) as HTMLElement | null) ?? root;
  const { ida, volta } = extrairAereo(painel);
  const preco = extrairPrecoAereo(painel);

  const companhia = ida?.companhia ?? volta?.companhia ?? null;
  const logo = ida?.logo ?? volta?.logo ?? null;

  return {
    id,
    indice,
    companhia,
    logo,
    ida,
    volta,
    preco,
    selectSource: acharSelectSource(painel, indice),
    selecionado: /ui-state-active|selecionado|aereo[_-]?ativo|selected/i.test(
      `${painel.getAttribute("class") ?? ""} ${texto(painel).slice(0, 200)}`,
    ),
  };
}

/**
 * Converte a resposta do "Alterar voo" em UMA opção por rptAereoPesquisa:N.
 * Aceita tanto o XML partial-response quanto HTML já materializado.
 */
export function parseOpcoesAereas(xmlOuHtml: string): {
  opcoes: FrtOpcaoAerea[];
  diagnostico: FrtOpcoesAereasDiagnostico;
} {
  const updates = extractPartialUpdates(xmlOuHtml);
  const paineis: { indice: number; id: string; html: string }[] = [];
  let origem: FrtOpcoesAereasDiagnostico["origem"] = "nenhuma";

  for (const [id, html] of Object.entries(updates)) {
    const m = id.match(RE_PAINEL_AEREO);
    if (m) paineis.push({ indice: Number(m[1]), id, html });
  }
  if (paineis.length) origem = "partial-updates";

  if (!paineis.length) {
    // Sem partial-response: procurar os painéis direto no DOM.
    const root = doc(xmlOuHtml);
    for (const el of root.querySelectorAll("[id]")) {
      const id = el.getAttribute("id") ?? "";
      const m = id.match(RE_PAINEL_AEREO);
      if (m) paineis.push({ indice: Number(m[1]), id, html: el.outerHTML });
    }
    if (paineis.length) origem = "dom";
  }

  paineis.sort((a, b) => a.indice - b.indice);
  const vistos = new Set<string>();
  const opcoes = paineis
    .filter((p) => (vistos.has(p.id) ? false : (vistos.add(p.id), true)))
    .map((p) => painelParaOpcao(p.indice, p.id, p.html))
    .filter((o) => Boolean(o.ida || o.volta || o.preco.porPessoa || o.preco.total));

  return {
    opcoes,
    diagnostico: {
      paineis: paineis.length,
      comPreco: opcoes.filter((o) => o.preco.porPessoa || o.preco.total).length,
      comIda: opcoes.filter((o) => o.ida).length,
      comVolta: opcoes.filter((o) => o.volta).length,
      comSelectSource: opcoes.filter((o) => o.selectSource).length,
      ids: paineis.map((p) => p.id),
      origem,
    },
  };
}

/** Resumo do pacote (pnlPacoteResumo / pnlPacoteResumoFixo) após selecionar o aéreo. */
export function parseResumoPacote(xmlOuHtml: string): {
  precoPorPessoaFormatado: string | null;
  precoTotalFormatado: string | null;
  precoPorPessoa: number | null;
  precoTotal: number | null;
  texto: string | null;
} {
  const updates = extractPartialUpdates(xmlOuHtml);
  const chave = Object.keys(updates).find((k) => /pnlPacoteResumoFixo/i.test(k))
    ?? Object.keys(updates).find((k) => /pnlPacoteResumo/i.test(k));
  const html = chave ? updates[chave]! : xmlOuHtml;
  const root = doc(html);
  const t = texto(root);

  const pessoaEl = acharPorClasse(root, /price[_-]?per[_-]?person|preco[_-]?por[_-]?pessoa/i);
  const totalEl = acharPorClasse(root, /price[_-]?total[_-]?container|price[_-]?total|preco[_-]?total/i);

  const pessoaFmt =
    (pessoaEl ? primeiroValor(linha(pessoaEl)) : null) ??
    t.match(/((?:R\$|BRL)?\s?[\d.]+,\d{2})\s*(?:por\s+pessoa)/i)?.[1] ??
    null;
  const totalFmt =
    (totalEl ? primeiroValor(linha(totalEl)) : null) ??
    t.match(/total[^\d]{0,20}((?:R\$|BRL)?\s?[\d.]+,\d{2})/i)?.[1] ??
    null;

  return {
    precoPorPessoaFormatado: fmt(pessoaFmt),
    precoTotalFormatado: fmt(totalFmt),
    precoPorPessoa: moedaParaNumero(pessoaFmt),
    precoTotal: moedaParaNumero(totalFmt),
    texto: t ? t.slice(0, 400) : null,
  };
}

/** Descobre o javax.faces.source do botão "Alterar voo" dentro do pacote. */
export function acharSourceAlterarVoo(htmlPacote: string): string | null {
  const root = doc(htmlPacote);
  const RE = /alterar\s*(?:o\s*)?(?:voo|a[ée]reo)|trocar\s*(?:o\s*)?(?:voo|a[ée]reo)|outros\s*voos|mudar\s*voo/i;
  const candidatos = root.querySelectorAll("button, a, input, span[onclick], div[onclick]");
  for (const c of candidatos) {
    const rotulo = `${texto(c)} ${c.getAttribute("title") ?? ""} ${c.getAttribute("value") ?? ""} ${c.getAttribute("aria-label") ?? ""}`;
    if (!RE.test(rotulo)) continue;
    const id = c.getAttribute("id");
    if (id) return id;
    const onclick = c.getAttribute("onclick") ?? "";
    const src =
      onclick.match(/PrimeFaces\.ab\(\s*\{\s*s\s*:\s*["'&quot;]+([^"'&]+)/)?.[1] ??
      onclick.match(/source\s*:\s*["']([^"']+)["']/)?.[1] ??
      null;
    if (src) return src;
  }
  return null;
}

/** Extrai o HTML do container de um pacote (por id) dentro do resultado bruto. */
export function htmlDoPacote(htmlResultado: string, pacoteId: string): string | null {
  const root = doc(htmlResultado);
  const el = root.querySelector(`[id="${pacoteId}"]`) as HTMLElement | null;
  return el ? el.outerHTML : null;
}
