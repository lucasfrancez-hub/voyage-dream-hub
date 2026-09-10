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
import { Input } from "@/components/ui/input";
import { OnerPagamento, type DadosCheckoutOner } from "@/components/checkout/OnerPagamento";
import { ResumoReserva } from "@/components/checkout/ResumoReserva";
import {
  onerCheckoutResumo,
  onerSalvarPassageiros,
  type PassageiroCheckout,
} from "@/lib/integrations/oner/payment.functions";

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
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs text-muted-foreground">{children}</span>;
}

export function CheckoutVoo({ cartId }: { cartId: string }) {
  const carregarResumo = useServerFn(onerCheckoutResumo);
  const salvarPassageiros = useServerFn(onerSalvarPassageiros);

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

  const resumoLateral = (
    <aside className="h-fit space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        <Plane className="h-3.5 w-3.5 text-primary" /> Sua viagem
      </div>
      <div className="space-y-3">
        {trechos.map((t, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
            <div className="font-semibold">{t.trecho}</div>
            <div className="text-xs text-muted-foreground">
              {[t.data, t.cia, t.voo ? `Voo ${t.voo}` : null].filter(Boolean).join(" • ")}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-xl font-bold text-primary">{brl(total)}</span>
      </div>
      {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
    </aside>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold md:text-4xl">
        Falta pouco para concluir <span className="text-primary">sua reserva</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {etapa === 1
          ? "Preencha os dados dos passageiros. Na próxima etapa você escolhe a forma de pagamento."
          : "Escolha a forma de pagamento para concluir a reserva."}
      </p>

      <div className="mt-5 flex items-center gap-3 text-xs">
        <div
          className={`inline-flex items-center gap-2 font-semibold ${etapa === 1 ? "text-foreground" : "text-muted-foreground"}`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${etapa === 1 ? "bg-foreground text-background" : "border border-border bg-background"}`}
          >
            1
          </span>
          Passageiros
        </div>
        <div className="h-px w-12 bg-border" />
        <div
          className={`inline-flex items-center gap-2 font-semibold ${etapa === 2 ? "text-foreground" : "text-muted-foreground"}`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full ${etapa === 2 ? "bg-foreground text-background" : "border border-border bg-background"}`}
          >
            2
          </span>
          Pagamento
        </div>
      </div>

      {etapa === 1 ? (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {passageiros.map((p, i) => (
              <section key={i} className="rounded-2xl border border-border bg-card p-6">
                <h2 className="mb-4 font-semibold">
                  Passageiro {i + 1} — {rotuloTipo[p.tipo]}
                  {i === 0 ? " (responsável pela reserva)" : ""}
                </h2>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <Rotulo>Tratamento *</Rotulo>
                    <select
                      className={campo}
                      value={p.tratamento}
                      onChange={(e) => mudar(i, { tratamento: e.target.value })}
                    >
                      <option>Sr.</option>
                      <option>Sra.</option>
                    </select>
                  </label>

                  <label className="block">
                    <Rotulo>Nacionalidade *</Rotulo>
                    <select className={campo} value={30} disabled>
                      <option value={30}>Brasil</option>
                    </select>
                  </label>

                  <label className="block">
                    <Rotulo>Primeiro nome *</Rotulo>
                    <Input
                      value={p.nome}
                      onChange={(e) => mudar(i, { nome: e.target.value })}
                      placeholder="Primeiro nome"
                    />
                  </label>

                  <label className="block">
                    <Rotulo>Último sobrenome *</Rotulo>
                    <Input
                      value={p.sobrenome}
                      onChange={(e) => mudar(i, { sobrenome: e.target.value })}
                      placeholder="Último sobrenome"
                    />
                  </label>

                  <label className="block">
                    <Rotulo>Data de nascimento *</Rotulo>
                    <Input
                      type="date"
                      value={p.nascimento}
                      onChange={(e) => mudar(i, { nascimento: e.target.value })}
                    />
                  </label>

                  <label className="block">
                    <Rotulo>Sexo *</Rotulo>
                    <select
                      className={campo}
                      value={p.sexo}
                      onChange={(e) => mudar(i, { sexo: e.target.value as "M" | "F" })}
                    >
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                    </select>
                  </label>

                  <label className="block">
                    <Rotulo>E-mail {i === 0 ? "*" : "(opcional)"}</Rotulo>
                    <Input
                      value={p.email}
                      onChange={(e) => mudar(i, { email: e.target.value })}
                      placeholder="voce@email.com"
                    />
                  </label>

                  <label className="block">
                    <Rotulo>Telefone / WhatsApp {i === 0 ? "*" : "(opcional)"}</Rotulo>
                    <Input
                      value={p.telefone}
                      onChange={(e) => mudar(i, { telefone: e.target.value })}
                      placeholder="(00) 00000-0000"
                    />
                  </label>
                </div>

                <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                  <label className="block">
                    <Rotulo>Tipo de documento *</Rotulo>
                    <select
                      className={campo}
                      value={p.documentoTipo}
                      onChange={(e) =>
                        mudar(i, { documentoTipo: e.target.value as "CPF" | "PASSAPORTE" })
                      }
                    >
                      <option value="CPF">CPF</option>
                      <option value="PASSAPORTE">Passaporte</option>
                    </select>
                  </label>

                  <label className="block">
                    <Rotulo>Número do documento *</Rotulo>
                    <Input
                      value={p.documento}
                      onChange={(e) => mudar(i, { documento: e.target.value })}
                      placeholder={p.documentoTipo === "CPF" ? "000.000.000-00" : "AB123456"}
                    />
                  </label>
                </div>
              </section>
            ))}

            <Button
              className="w-full py-6 text-xs font-black uppercase tracking-[0.15em]"
              disabled={enviando}
              onClick={() => void continuar()}
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Ir para o pagamento
            </Button>
          </div>

          {resumoLateral}
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
          <OnerPagamento cartId={cartId} modoAdmin />
        </div>
      )}
    </div>
  );
}
