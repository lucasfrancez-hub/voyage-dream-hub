import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmThen } from "@/lib/confirm";
import { cancelarReservaFRTFn, consultarReservaFRTFn } from "@/lib/comprefacil/cancelamento.functions";

type Item = {
  tipo: "aereo" | "hotel" | "servico" | "seguro";
  id: number;
  descricao: string;
  localizador: string | null;
  status: string | null;
  cancelado: boolean;
};

type Passo = { passo: string; ok: boolean; detalhe?: string | null };

/** Painel de cancelamento (item a item ou tudo) de um orçamento da operadora. */
export function CancelarReservaFrt({ orcamentoId }: { orcamentoId: number }) {
  const consultar = useServerFn(consultarReservaFRTFn);
  const cancelar = useServerFn(cancelarReservaFRTFn);

  const [itens, setItens] = useState<Item[]>([]);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [motivo, setMotivo] = useState("");
  const [passos, setPassos] = useState<Passo[] | null>(null);

  const carga = useMutation({
    mutationFn: async () => (await consultar({ data: { orcamentoId } })) as { itens: Item[] },
    onSuccess: (r) => setItens(r.itens ?? []),
  });

  const acao = useMutation({
    mutationFn: async (alvo: { tipo: Item["tipo"]; id: number }[] | null) =>
      (await cancelar({
        data: { orcamentoId, itens: alvo, motivo: motivo.trim() || null },
      })) as { ok: boolean; itens: Item[]; passos: Passo[] },
    onSuccess: (r) => {
      setPassos(r.passos ?? []);
      if (r.itens?.length) setItens(r.itens);
      setSelecionados({});
    },
  });

  useEffect(() => {
    if (orcamentoId) carga.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentoId]);

  const ativos = itens.filter((i) => !i.cancelado);
  const marcados = ativos.filter((i) => selecionados[`${i.tipo}:${i.id}`]);

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Cancelamento na operadora — orçamento #{orcamentoId}</p>
        <Button size="sm" variant="ghost" disabled={carga.isPending} onClick={() => carga.mutate()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${carga.isPending ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {carga.isPending && !itens.length ? (
        <p className="text-sm text-muted-foreground">Consultando itens do orçamento…</p>
      ) : !itens.length ? (
        <p className="text-sm text-muted-foreground">Nenhum item encontrado neste orçamento.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((i) => {
            const chave = `${i.tipo}:${i.id}`;
            return (
              <li key={chave} className="flex items-start gap-3 rounded-lg border border-border/50 bg-background p-3">
                <Checkbox
                  className="mt-0.5"
                  disabled={i.cancelado || acao.isPending}
                  checked={Boolean(selecionados[chave])}
                  onCheckedChange={(v) => setSelecionados((s) => ({ ...s, [chave]: Boolean(v) }))}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{i.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.localizador ? `Localizador ${i.localizador} · ` : ""}
                    {i.cancelado ? "Cancelado" : (i.status ?? "Ativo")}
                  </p>
                </div>
                {i.cancelado ? (
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`motivo-${orcamentoId}`} className="text-xs">
          Motivo do cancelamento (opcional)
        </Label>
        <Input
          id={`motivo-${orcamentoId}`}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: desistência do cliente"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!marcados.length || acao.isPending}
          onClick={() =>
            confirmThen(
              {
                title: "Cancelar itens selecionados?",
                description: `${marcados.length} item(ns) serão cancelados na operadora. Essa ação não pode ser desfeita.`,
                confirmText: "Cancelar itens",
              },
              () => acao.mutate(marcados.map((i) => ({ tipo: i.tipo, id: i.id }))),
            )
          }
        >
          Cancelar selecionados ({marcados.length})
        </Button>
        <Button
          variant="destructive"
          disabled={!ativos.length || acao.isPending}
          onClick={() =>
            confirmThen(
              {
                title: "Cancelar tudo deste orçamento?",
                description: "Aéreo, hospedagem, serviços e seguros ativos serão cancelados na operadora.",
                confirmText: "Cancelar tudo",
              },
              () => acao.mutate(null),
            )
          }
        >
          {acao.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Cancelar tudo
        </Button>
      </div>

      {passos && (
        <ul className="space-y-2 border-t border-border/50 pt-3">
          {passos.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {p.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
              )}
              <span>
                <strong>{p.passo}</strong>
                {p.detalhe ? <span className="text-muted-foreground"> — {p.detalhe}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
