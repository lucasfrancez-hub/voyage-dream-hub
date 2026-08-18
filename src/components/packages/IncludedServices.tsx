import { useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ServiceDetail = { grupo?: string | null; titulo: string; detalhe: string };

const norm = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/…|\.\.\./g, "")
    .trim();

/**
 * Frases que são detalhamento de cobertura (seguro/condições), não serviço
 * incluso. Não devem aparecer na lista "O que inclui".
 */
const RUIDO = [
  /isen[cç][aã]o de multa/i,
  /cr[eé]dito para nova viagem/i,
  /voucher\)? no valor/i,
  /cobre impedimentos/i,
  /v[aá]lido para pacotes e servi[cç]os/i,
  /cancelamento eleg[ií]vel/i,
];

const ehRuido = (s: string) => RUIDO.some((r) => r.test(s));


/**
 * Lista do que está incluso. Itens que têm detalhamento do operador
 * abrem uma janela com o texto completo daquele serviço.
 */
export default function IncludedServices({
  includes,
  services,
}: {
  includes: string[];
  services?: any;
}) {
  const details: ServiceDetail[] = useMemo(() => {
    const raw = Array.isArray(services?.service_details) ? services.service_details : [];
    return raw
      .map((d: any) => ({
        grupo: d?.grupo ?? null,
        titulo: String(d?.titulo ?? "").trim(),
        detalhe: String(d?.detalhe ?? "").trim(),
      }))
      .filter((d: ServiceDetail) => d.titulo && d.detalhe);
  }, [services]);

  const [aberto, setAberto] = useState<ServiceDetail | null>(null);

  const acharDetalhe = (item: string): ServiceDetail | null => {
    const alvo = norm(item);
    if (!alvo) return null;
    return (
      details.find((d) => norm(d.titulo) === alvo) ??
      details.find((d) => {
        const t = norm(d.titulo);
        return t.startsWith(alvo.slice(0, 24)) || alvo.startsWith(t.slice(0, 24));
      }) ??
      details.find((d) => norm(d.detalhe).includes(alvo.slice(0, 24))) ??
      null
    );
  };

  // Itens do operador que não apareceram na lista de inclusos entram no fim.
  const extras = details.filter((d) => !includes.some((i) => acharDetalhe(i)?.detalhe === d.detalhe));
  const linhas: Array<{ label: string; detalhe: ServiceDetail | null }> = [
    ...includes.map((i) => ({ label: i, detalhe: acharDetalhe(i) })),
    ...extras.map((d) => ({ label: d.titulo, detalhe: d })),
  ];

  if (!linhas.length) return null;

  return (
    <>
      <ul className="mt-4 grid sm:grid-cols-2 gap-3">
        {linhas.map(({ label, detalhe }, i) => {
          const clicavel = !!detalhe;
          const conteudo = (
            <>
              <Check className="h-4 w-4 text-brand-orange mt-0.5 shrink-0" />
              <span className="flex-1">{label}</span>
              {clicavel && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-orange shrink-0">
                  Detalhes <ChevronRight className="h-3 w-3" />
                </span>
              )}
            </>
          );
          return (
            <li key={`${label}-${i}`}>
              {clicavel ? (
                <button
                  type="button"
                  onClick={() => setAberto(detalhe)}
                  className="flex w-full items-start gap-2 rounded-xl border border-border bg-card p-3 text-left text-sm transition hover:border-brand-orange/60 hover:bg-brand-orange/5"
                >
                  {conteudo}
                </button>
              ) : (
                <div className="flex items-start gap-2 p-3 text-sm">{conteudo}</div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">{aberto?.titulo}</DialogTitle>
          </DialogHeader>
          {aberto?.grupo && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-orange">
              {aberto.grupo}
            </div>
          )}
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {aberto?.detalhe}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
