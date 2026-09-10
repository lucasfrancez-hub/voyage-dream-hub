/**
 * Checkout de voos dentro do portal VIA AIR (modelo aprovado):
 * etapa 1 = passageiros, etapa 2 = pagamento (cartões/Pix da operadora).
 * Nada é calculado aqui: total, trechos e condições vêm sempre do fornecedor.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OnerPagamento, type DadosCheckoutOner } from "@/components/checkout/OnerPagamento";
import { ResumoReserva } from "@/components/checkout/ResumoReserva";
import {
  onerCheckoutResumo,
  onerSalvarPassageiros,
  type PassageiroCheckout,
} from "@/lib/integrations/oner/payment.functions";
import { onerAbrirPedidoCheckout } from "@/lib/integrations/oner/checkout-order.functions";

const vazio = (tipo: PassageiroCheckout["tipo"]): PassageiroCheckout => ({
  tratamento: "Sr.",
  nome: "",
  sobrenome: "",
  nascimento: "",
  sexo: "M",
  tipo,
  documentoTipo: "CPF",
  documento: "",
  nacionalidade: 30,
  email: "",
  telefone: "",
});

const rotuloTipo: Record<PassageiroCheckout["tipo"], string> = {
  ADT: "Adulto",
  CHD: "Criança",
  INF: "Bebê",
};

const campo =
  "h-12 w-full appearance-none rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/30";

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

export function CheckoutVoo({ cartId }: { cartId: string }) {
  const carregarResumo = useServerFn(onerCheckoutResumo);
  const salvarPassageiros = useServerFn(onerSalvarPassageiros);
  const abrirPedido = useServerFn(onerAbrirPedidoCheckout);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<DadosCheckoutOner | null>(null);
  const [passageiros, setPassageiros] = useState<PassageiroCheckout[]>([]);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [enviando, setEnviando] = useState(false);

  const total = dados?.resumo.total ?? 0;

  useEffect(() => {
    let ativo = true;
    void (async () => {
      const r = await carregarResumo({ data: { cartId } });
      if (!ativo) return;
      setCarregando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setDados({
        resumo: r.resumo,
        aceitaCartao: r.aceitaCartao,
        aceitaPix: r.aceitaPix,
        maxCartoes: r.maxCartoes,
      });
      const lista: PassageiroCheckout[] = [
        ...Array.from({ length: Math.max(1, r.resumo.adultos ?? 1) }, () => vazio("ADT")),
        ...Array.from({ length: r.resumo.criancas ?? 0 }, () => vazio("CHD")),
        ...Array.from({ length: r.resumo.bebes ?? 0 }, () => vazio("INF")),
      ];
      setPassageiros(lista);
      if (r.resumo.expirado) setErro("Esta reserva expirou. Refaça a busca para continuar.");
    })();
    return () => {
      ativo = false;
    };
  }, [cartId, carregarResumo]);

  const mudar = (i: number, patch: Partial<PassageiroCheckout>) =>
    setPassageiros((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const pronto = useMemo(
    () =>
      passageiros.length > 0 &&
      passageiros.every(
        (p) =>
          p.nome.trim() &&
          p.sobrenome.trim() &&
          p.nascimento &&
          p.documento.trim() &&
          passageiros[0]?.email.trim() &&
          passageiros[0]?.telefone.trim(),
      ),
    [passageiros],
  );

  async function continuar() {
    if (!pronto) {
      toast.error("Preencha todos os dados obrigatórios dos passageiros.");
      return;
    }
    setEnviando(true);
    try {
      const contato = passageiros[0]!;
      const r = await salvarPassageiros({
        data: {
          cartId,
          passageiros: passageiros.map((p) => ({
            ...p,
            email: p.email.trim() || contato.email,
            telefone: p.telefone.trim() || contato.telefone,
          })),
        },
      });
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      // O pedido já nasce em "Meus pedidos", com voos, passageiros e valor.
      void abrirPedido({
        data: {
          cartId,
          metodo: "CARD",
          passageiros: passageiros.map((p) => ({
            nome: p.nome.trim(),
            sobrenome: p.sobrenome.trim(),
            tipo: p.tipo,
            nascimento: p.nascimento || null,
            documento: p.documento || null,
            email: p.email.trim() || contato.email,
            telefone: p.telefone.trim() || contato.telefone,
          })),
        },
      });
      setEtapa(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar os passageiros.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (erro && !total) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        {erro}
      </div>
    );
  }

  const listaPassageiros = passageiros.map((p, i) => ({
    nome:
      [p.nome, p.sobrenome].filter(Boolean).join(" ").trim() ||
      dados?.resumo.passageiros[i]?.nome ||
      `Passageiro ${i + 1}`,
    tipo: p.tipo || dados?.resumo.passageiros[i]?.tipo,
  }));

  const resumoLateral = dados ? (
    <ResumoReserva
      resumo={dados.resumo}
      passageiros={listaPassageiros}
      mostrarParcelas={etapa === 2}
      rodape={erro ? <p className="text-xs text-destructive">{erro}</p> : null}
    />
  ) : null;

  return (
    <div className="via-checkout mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {etapa === 1 ? "Dados dos passageiros" : "Pagamento"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {etapa === 1
              ? "Preencha os dados conforme o documento de viagem."
              : "Escolha a forma de pagamento para concluir a reserva."}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
            Passo {etapa} de 2
          </span>
          <div className="mt-2 flex gap-1">
            <div className="h-1.5 w-12 rounded-full bg-brand-orange" />
            <div className={`h-1.5 w-12 rounded-full ${etapa === 2 ? "bg-brand-orange" : "bg-muted"}`} />
          </div>
        </div>
      </div>

      {etapa === 1 ? (
        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            {passageiros.map((p, i) => (
              <section
                key={i}
                className="space-y-8 rounded-2xl border border-border bg-card p-6 lg:p-8"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </div>
                  <h2 className="text-lg font-semibold">
                    Passageiro {rotuloTipo[p.tipo]}
                    {i === 0 ? " (responsável pela reserva)" : ""}
                  </h2>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <label className="block">
                      <Rotulo>Tratamento</Rotulo>
                      <select
                        className={campo}
                        value={p.tratamento}
                        onChange={(e) => mudar(i, { tratamento: e.target.value })}
                      >
                        <option>Sr.</option>
                        <option>Sra.</option>
                        <option>Srta.</option>
                      </select>
                    </label>
                    <label className="block">
                      <Rotulo>Sexo</Rotulo>
                      <select
                        className={campo}
                        value={p.sexo}
                        onChange={(e) => mudar(i, { sexo: e.target.value as "M" | "F" })}
                      >
                        <option value="M">Masculino</option>
                        <option value="F">Feminino</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <label className="block">
                      <Rotulo>Nome</Rotulo>
                      <input
                        className={campo}
                        value={p.nome}
                        onChange={(e) => mudar(i, { nome: e.target.value })}
                        placeholder="Ex: João"
                      />
                    </label>
                    <label className="block">
                      <Rotulo>Sobrenome</Rotulo>
                      <input
                        className={campo}
                        value={p.sobrenome}
                        onChange={(e) => mudar(i, { sobrenome: e.target.value })}
                        placeholder="Ex: Silva"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <label className="block">
                      <Rotulo>Data de nascimento</Rotulo>
                      <input
                        className={campo}
                        type="date"
                        value={p.nascimento}
                        onChange={(e) => mudar(i, { nascimento: e.target.value })}
                      />
                    </label>
                    <div className="hidden md:block" />
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <label className="block">
                      <Rotulo>Nacionalidade</Rotulo>
                      <select className={campo} value={30} disabled>
                        <option value={30}>Brasil</option>
                      </select>
                    </label>
                    <label className="block">
                      <Rotulo>{p.documentoTipo === "CPF" ? "CPF" : "Passaporte"}</Rotulo>
                      <input
                        className={campo}
                        value={p.documento}
                        onChange={(e) => mudar(i, { documento: e.target.value })}
                        placeholder={p.documentoTipo === "CPF" ? "000.000.000-00" : "AB123456"}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <label className="block">
                      <Rotulo>Telefone {i === 0 ? "" : "(opcional)"}</Rotulo>
                      <input
                        className={campo}
                        value={p.telefone}
                        onChange={(e) => mudar(i, { telefone: e.target.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </label>
                    <label className="block">
                      <Rotulo>E-mail {i === 0 ? "" : "(opcional)"}</Rotulo>
                      <input
                        className={campo}
                        type="email"
                        value={p.email}
                        onChange={(e) => mudar(i, { email: e.target.value })}
                        placeholder="exemplo@email.com"
                      />
                    </label>
                  </div>
                </div>
              </section>
            ))}

            <div className="flex justify-end pt-2">
              <Button
                className="w-full rounded-xl bg-sky-600 px-12 py-6 text-sm font-bold text-white hover:bg-brand-orange md:w-auto"
                disabled={enviando}
                onClick={() => void continuar()}
              >
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ir para o pagamento
              </Button>
            </div>
          </div>

          <div className="lg:sticky lg:top-8 lg:col-span-4">{resumoLateral}</div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <button
            type="button"
            onClick={() => setEtapa(1)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar aos passageiros
          </button>
          <OnerPagamento
            cartId={cartId}
            modoAdmin
            dados={dados ?? undefined}
            passageiros={listaPassageiros}
          />
        </div>
      )}
    </div>
  );
}
