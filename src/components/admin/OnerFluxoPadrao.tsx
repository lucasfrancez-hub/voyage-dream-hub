/**
 * Fluxo padrão da Comprar Viagem, sempre na mesma ordem:
 * carrinho do nosso portal → ir para o pagamento (é aí que entra o código do
 * e-mail) → dados do passageiro → tela de pagamento. Nada é pulado.

 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Plus, Route as RouteIcon, X } from "lucide-react";
import { toast } from "sonner";
import { onerExecutarFluxo, type PassageiroEntrada } from "@/lib/integrations/oner/admin.functions";

const VAZIO: PassageiroEntrada = {
  nome: "",
  sobrenome: "",
  documento: "",
  nascimento: "",
  sexo: "M",
  tipo: "ADT",
  email: "",
  telefone: "",
};

const campo =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground";

export function OnerFluxoPadrao() {
  const executar = useServerFn(onerExecutarFluxo);
  const [carrinho, setCarrinho] = useState("");
  const [passageiros, setPassageiros] = useState<PassageiroEntrada[]>([{ ...VAZIO }]);

  const rodar = useMutation({
    mutationFn: () =>
      executar({
        data: {
          carrinho,
          passageiros: passageiros.filter((p) => p.nome && p.sobrenome && p.documento),
        },
      }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Tela de pagamento liberada");
      else toast.error(`Parou em: ${r.etapas.at(-1)?.titulo ?? "início"}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falhou"),
  });

  const atualizar = (i: number, dados: Partial<PassageiroEntrada>) =>
    setPassageiros((lista) => lista.map((p, idx) => (idx === i ? { ...p, ...dados } : p)));

  const r = rodar.data;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <RouteIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">Reserva passo a passo</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cole o endereço do carrinho que o nosso buscador gera no “Comprar agora”. O caminho é sempre
        o mesmo: carrinho, ir para o pagamento (é aí que chega o código do e-mail), dados do
        passageiro e então a tela de

        pagamento.
      </p>

      <input
        value={carrinho}
        onChange={(e) => setCarrinho(e.target.value)}
        placeholder="https://www.comprarviagem.com.br/viaair/flight-cart?newCartId=…"
        className={`${campo} mt-4`}
      />

      <div className="mt-4 space-y-3">
        {passageiros.map((p, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Passageiro {i + 1}
              </span>
              {passageiros.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setPassageiros((l) => l.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={campo}
                placeholder="Nome"
                value={p.nome}
                onChange={(e) => atualizar(i, { nome: e.target.value })}
              />
              <input
                className={campo}
                placeholder="Sobrenome"
                value={p.sobrenome}
                onChange={(e) => atualizar(i, { sobrenome: e.target.value })}
              />
              <input
                className={campo}
                placeholder="CPF"
                value={p.documento}
                onChange={(e) => atualizar(i, { documento: e.target.value })}
              />
              <input
                className={campo}
                type="date"
                value={p.nascimento}
                onChange={(e) => atualizar(i, { nascimento: e.target.value })}
              />
              <select
                className={campo}
                value={p.sexo}
                onChange={(e) => atualizar(i, { sexo: e.target.value as "M" | "F" })}
              >
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
              <select
                className={campo}
                value={p.tipo}
                onChange={(e) => atualizar(i, { tipo: e.target.value as PassageiroEntrada["tipo"] })}
              >
                <option value="ADT">Adulto</option>
                <option value="CHD">Criança</option>
                <option value="INF">Bebê</option>
              </select>
              <input
                className={campo}
                placeholder="E-mail"
                value={p.email}
                onChange={(e) => atualizar(i, { email: e.target.value })}
              />
              <input
                className={campo}
                placeholder="Telefone com DDD"
                value={p.telefone}
                onChange={(e) => atualizar(i, { telefone: e.target.value })}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPassageiros((l) => [...l, { ...VAZIO }])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
        >
          <Plus className="h-3.5 w-3.5" /> Outro passageiro
        </button>
      </div>

      <button
        type="button"
        onClick={() => rodar.mutate()}
        disabled={!carrinho.trim() || rodar.isPending}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {rodar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Seguir até o pagamento
      </button>

      {r ? (
        <div className="mt-5 space-y-2">
          {r.etapas.map((e) => (
            <div key={e.chave} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  e.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive"
                }`}
              >
                {e.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
              <span>
                <span className="font-semibold">{e.titulo}</span>
                <span className="text-muted-foreground"> — {e.detalhe}</span>
              </span>
            </div>
          ))}

          {r.pagamento?.formas.length ? (
            <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm">
              <p className="font-semibold">Formas aceitas pelo fornecedor</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {r.pagamento.formas.map((f) => (
                  <li key={f.codigo}>
                    {f.nome}
                    {f.maxCartoes ? ` · até ${f.maxCartoes} cartões` : ""}
                  </li>
                ))}
              </ul>
              {r.pagamento.parcelas.length ? (
                <p className="mt-2 text-muted-foreground">
                  Parcelamento: até {r.pagamento.parcelas.at(-1)?.numero}x
                </p>
              ) : null}
              <a
                href={r.pagamento.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
              >
                Abrir a tela de pagamento <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
