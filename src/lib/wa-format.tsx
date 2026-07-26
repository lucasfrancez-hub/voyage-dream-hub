import { Fragment, type ReactNode } from "react";

/**
 * Formata texto no estilo WhatsApp:
 *   *negrito*   → <strong>
 *   _itálico_   → <em>
 *   ~riscado~   → <del>
 *   `code`      → <code>
 * Só ativa quando os delimitadores estão em fronteira de palavra
 * (evita capturar asteriscos soltos no meio de URLs, por exemplo).
 */
export function formatWhatsAppInline(text: string): ReactNode[] {
  // Ordem importa: código > negrito > itálico > riscado
  const regex = /(`[^`\n]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const token = m[0];
    const inner = token.slice(1, -1);
    if (token.startsWith("*")) {
      nodes.push(<strong key={key++} className="font-semibold text-foreground">{inner}</strong>);
    } else if (token.startsWith("_")) {
      nodes.push(<em key={key++}>{inner}</em>);
    } else if (token.startsWith("~")) {
      nodes.push(<del key={key++}>{inner}</del>);
    } else {
      nodes.push(
        <code key={key++} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{inner}</code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Renderiza texto multilinha (Roteiro, notas do pacote) com espaçamento
 * compacto entre linhas e formatação WhatsApp inline (*negrito*, _itálico_).
 * Colapsa múltiplas linhas em branco em uma só, pra não abrir buracos grandes.
 */
export function WhatsAppText({
  children,
  className = "",
}: {
  children: string | null | undefined;
  className?: string;
}) {
  if (!children) return null;
  // Normaliza: colapsa 2+ quebras em blocos, preservando parágrafos leves
  const blocks = children.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={`space-y-2 text-sm leading-snug text-muted-foreground ${className}`}>
      {blocks.map((block, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {block.split("\n").map((line, j, arr) => (
            <Fragment key={j}>
              {formatWhatsAppInline(line)}
              {j < arr.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
