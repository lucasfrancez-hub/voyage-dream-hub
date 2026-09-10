/**
 * Tela de pagamento (cartão 1/2/3 e Pix).
 * Todas as condições — parcelas, juros, bandeira e total — vêm da operadora.
 * Nada é calculado aqui além da soma dos valores distribuídos nos cartões.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, QrCode, Loader2, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  onerCheckoutResumo,
  onerParcelasCartao,
  onerPagarCartao,
  onerPagarPix,
} from "@/lib/integrations/oner/payment.functions";

type Opcao = {
  installment: number;
  installmentsValue: number;
  total: number;
  interestRate: number;
  hasRate: boolean;
};

type CartaoForm = {
  valor: string;
  nome: string;
  numero: string;
  cvv: string;
  mes: string;
  ano: string;
  documentoNumero: string;
  bandeira: string | null;
  finalCartao: string | null;
  opcoes: Opcao[] | null;
  parcela: number | null;
  carregando: boolean;
  erroParcelas: boolean;
};

const cartaoVazio = (valor = ""): CartaoForm => ({
  valor,
  nome: "",
  numero: "",
  cvv: "",
  mes: "",
  ano: "",
  documentoNumero: "",
  bandeira: null,
  finalCartao: null,
  opcoes: null,
  parcela: null,
  carregando: false,
  erroParcelas: false,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const somenteNumeros = (v: string) => v.replace(/\D/g, "");

export function OnerPagamento({
  cartId,
  modoAdmin = false,
}: {
  cartId: string;
  modoAdmin?: boolean;
}) {
  const carregarResumo = useServerFn(onerCheckoutResumo);
  const buscarParcelas = useServerFn(onerParcelasCartao);
  const pagarCartao = useServerFn(onerPagarCartao);
  const pagarPix = useServerFn(onerPagarPix);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [trechos, setTrechos] = useState<Array<{ trecho: string; data: string; cia: string; voo: string }>>([]);
  const [maxCartoes, setMaxCartoes] = useState(1);
  const [aceitaPix, setAceitaPix] = useState(false);

  const [metodo, setMetodo] = useState<"cartao" | "pix">("cartao");
  const [quantidade, setQuantidade] = useState(1);
  const [cartoes, setCartoes] = useState<CartaoForm[]>([cartaoVazio()]);
  const [enviando, setEnviando] = useState(false);
  const [localizador, setLocalizador] = useState<string | null>(null);

  const [pixFornecedor, setPixFornecedor] = useState<{ qrCode: string; expiraEm: string | null } | null>(null);
  const [gerandoPix, setGerandoPix] = useState(false);
  const [documentoPix, setDocumentoPix] = useState("");

  const [pagador, setPagador] = useState({
    nome: "",
    sobrenome: "",
    documentoNumero: "",
    nascimento: "",
    email: "",
    telefone: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  });
  const mudarPagador = (patch: Partial<typeof pagador>) =>
    setPagador((prev) => ({ ...prev, ...patch }));


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
      setTotal(r.resumo.total ?? 0);
      setTrechos(r.resumo.trechos);
      setMaxCartoes(r.maxCartoes || 1);
      setAceitaPix(r.aceitaPix);
      setCartoes([cartaoVazio(String((r.resumo.total ?? 0).toFixed(2)))]);
      if (!r.aceitaCartao && r.aceitaPix) setMetodo("pix");
      if (r.resumo.expirado) setErro("Esta reserva expirou. Refaça a busca para continuar.");
    })();
    return () => {
      ativo = false;
    };
  }, [cartId, carregarResumo]);

  const soma = useMemo(
    () => cartoes.reduce((s, c) => s + (Number(c.valor.replace(",", ".")) || 0), 0),
    [cartoes],
  );
  const somaConfere = Math.abs(soma - total) < 0.005 && total > 0;

  const atualizar = (i: number, patch: Partial<CartaoForm>) =>
    setCartoes((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  async function escolherQuantidade(n: number) {
    if (n === quantidade) return;
    if (n > 1) {
      const ok = await confirm({
        title: "Cartões da mesma titularidade",
        description:
          "Para pagar com mais de um cartão, todos precisam estar no nome da mesma pessoa. Deseja continuar?",
        confirmText: "Entendi, continuar",
        cancelText: "Cancelar",
      });
      if (!ok) return;
    }
    setQuantidade(n);
    setCartoes((prev) => {
      const novos = [...prev];
      while (novos.length < n) novos.push(cartaoVazio());
      novos.length = n;
      return novos.map((c, i) => (i === 0 && n === 1 ? { ...c, valor: String(total.toFixed(2)) } : c));
    });
  }

  async function consultarParcelas(i: number) {
    const c = cartoes[i];
    if (!c) return;
    const numero = somenteNumeros(c.numero);
    const valor = Number(c.valor.replace(",", "."));
    if (numero.length < 13 || !c.mes || !c.ano || !c.cvv || !c.nome || !(valor > 0)) {
      toast.error("Preencha os dados do cartão e o valor para carregar as parcelas.");
      return;
    }
    atualizar(i, { carregando: true, erroParcelas: false, opcoes: null, parcela: null });
    const r = await buscarParcelas({
      data: {
        cartId,
        valor,
        multiplosCartoes: quantidade > 1,
        cartao: {
          nome: c.nome,
          numero,
          cvv: c.cvv,
          mesValidade: c.mes,
          anoValidade: c.ano,
          documentoTipo: 1,
          documentoNumero: somenteNumeros(c.documentoNumero),
        },
      },
    });
    if (!r.ok) {
      atualizar(i, { carregando: false, erroParcelas: true });
      return;
    }
    atualizar(i, {
      carregando: false,
      opcoes: r.opcoes as Opcao[],
      bandeira: r.bandeira,
      finalCartao: r.finalCartao,
    });
  }

  async function finalizar() {
    if (!somaConfere) {
      toast.error("A soma dos cartões precisa ser igual ao total da compra.");
      return;
    }
    if (cartoes.some((c) => !c.parcela)) {
      toast.error("Escolha o parcelamento de cada cartão.");
      return;
    }
    setEnviando(true);
    const r = await pagarCartao({
      data: {
        cartId,
        totalEsperado: total,
        cartoes: cartoes.map((c) => {
          const opcao = c.opcoes?.find((o) => o.installment === c.parcela);
          return {
            nome: c.nome,
            numero: somenteNumeros(c.numero),
            cvv: c.cvv,
            mesValidade: c.mes,
            anoValidade: c.ano,
            documentoTipo: 1,
            documentoNumero: somenteNumeros(c.documentoNumero),
            valor: Number(c.valor.replace(",", ".")),
            parcelas: c.parcela ?? 1,
            juros: opcao?.interestRate ?? 0,
          };
        }),
      },
    });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    setLocalizador(r.localizador ?? null);
    toast.success("Pagamento aprovado.");
  }

  async function gerarPixFornecedor() {
    if (somenteNumeros(documentoPix).length < 11) {
      toast.error("Informe o CPF do pagador.");
      return;
    }
    setGerandoPix(true);
    const r = await pagarPix({
      data: { cartId, valor: total, documentoNumero: somenteNumeros(documentoPix), documentoTipo: 1 },
    });
    setGerandoPix(false);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    setPixFornecedor({ qrCode: r.pix.qrCode, expiraEm: r.pix.expiraEm });
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando sua reserva...
      </div>
    );
  }

  if (localizador) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Check className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h2 className="text-lg font-semibold">Pagamento aprovado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Código da reserva: <span className="font-semibold text-foreground">{localizador}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {erro ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {erro}
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold">Pagamento</h2>
          <p className="mb-4 text-sm text-muted-foreground">Como prefere pagar?</p>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMetodo("cartao")}
              className={`rounded-xl border p-4 text-left transition ${
                metodo === "cartao" ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="font-semibold">Cartão de crédito</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {maxCartoes > 1 ? `Pague com até ${maxCartoes} cartões.` : "Pagamento em um cartão."}
              </p>
            </button>

            <button
              type="button"
              disabled={!aceitaPix}
              onClick={() => setMetodo("pix")}
              className={`rounded-xl border p-4 text-left transition disabled:opacity-50 ${
                metodo === "pix" ? "border-primary bg-primary/5" : "border-border bg-background"
              }`}
            >
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <span className="font-semibold">Pix</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Pagamento por QR Code.</p>
            </button>
          </div>

          {metodo === "cartao" ? (
            <div className="mt-6 border-t border-border pt-6">
              {maxCartoes > 1 ? (
                <div className="mb-6">
                  <div className="mb-2 text-xs text-muted-foreground">Quantos cartões deseja usar?</div>
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-background p-1.5">
                    {Array.from({ length: Math.min(3, maxCartoes) }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => void escolherQuantidade(n)}
                        className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition ${
                          quantidade === n
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-card hover:text-foreground"
                        }`}
                      >
                        {n} {n === 1 ? "cartão" : "cartões"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-8">
                {cartoes.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border p-4">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">Cartão {i + 1}</div>
                        {c.bandeira ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {c.bandeira} •••• {c.finalCartao}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">
                            A bandeira é identificada pela operadora
                          </div>
                        )}
                      </div>
                      <label className="shrink-0 text-right">
                        <span className="mb-1 block text-[10px] text-muted-foreground">Valor neste cartão</span>
                        <Input
                          value={c.valor}
                          inputMode="decimal"
                          onChange={(e) =>
                            atualizar(i, {
                              valor: e.target.value,
                              opcoes: null,
                              parcela: null,
                              erroParcelas: false,
                            })
                          }
                          className="w-32 text-right"
                          placeholder="0,00"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Nome impresso no cartão</Label>
                        <Input
                          value={c.nome}
                          onChange={(e) => atualizar(i, { nome: e.target.value.toUpperCase(), opcoes: null, parcela: null })}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Número do cartão</Label>
                        <Input
                          value={c.numero}
                          inputMode="numeric"
                          onChange={(e) => atualizar(i, { numero: e.target.value, opcoes: null, parcela: null })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Mês</Label>
                          <Input
                            value={c.mes}
                            inputMode="numeric"
                            placeholder="MM"
                            onChange={(e) => atualizar(i, { mes: e.target.value, opcoes: null, parcela: null })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Ano</Label>
                          <Input
                            value={c.ano}
                            inputMode="numeric"
                            placeholder="AAAA"
                            onChange={(e) => atualizar(i, { ano: e.target.value, opcoes: null, parcela: null })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">CVV</Label>
                          <Input
                            value={c.cvv}
                            inputMode="numeric"
                            onChange={(e) => atualizar(i, { cvv: e.target.value, opcoes: null, parcela: null })}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">CPF do titular</Label>
                        <Input
                          value={c.documentoNumero}
                          inputMode="numeric"
                          onChange={(e) => atualizar(i, { documentoNumero: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <Label className="text-xs">Parcelamento</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={c.carregando}
                          onClick={() => void consultarParcelas(i)}
                        >
                          {c.carregando ? "Carregando..." : "Carregar parcelas"}
                        </Button>
                      </div>
                      {c.carregando ? (
                        <p className="text-xs text-muted-foreground">Carregando opções de parcelamento...</p>
                      ) : c.erroParcelas ? (
                        <p className="text-xs text-destructive">
                          Não foi possível carregar o parcelamento para este cartão.
                        </p>
                      ) : c.opcoes && c.opcoes.length > 0 ? (
                        <select
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          value={c.parcela ?? ""}
                          onChange={(e) => atualizar(i, { parcela: Number(e.target.value) })}
                        >
                          <option value="">Selecione</option>
                          {c.opcoes.map((o) => (
                            <option key={o.installment} value={o.installment}>
                              {o.installment}x de {brl(o.installmentsValue)}
                              {o.hasRate ? " com juros" : " sem juros"} — total {brl(o.total)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Informe o cartão para carregar as parcelas.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-4 border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">
                Ao fazer o pedido, será gerado o QR Code Pix da VIA AIR.
              </p>
              {modoAdmin ? (
                <div className="rounded-xl border border-dashed border-border p-4">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Teste interno — Pix da operadora
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div>
                      <Label className="text-xs">CPF do pagador</Label>
                      <Input
                        value={documentoPix}
                        inputMode="numeric"
                        onChange={(e) => setDocumentoPix(e.target.value)}
                        className="w-48"
                      />
                    </div>
                    <Button type="button" variant="outline" disabled={gerandoPix} onClick={() => void gerarPixFornecedor()}>
                      {gerandoPix ? "Gerando..." : "Gerar Pix da operadora"}
                    </Button>
                  </div>
                  {pixFornecedor ? (
                    <div className="mt-4 space-y-2">
                      <textarea
                        readOnly
                        value={pixFornecedor.qrCode}
                        className="h-24 w-full rounded-md border border-border bg-background p-2 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void navigator.clipboard.writeText(pixFornecedor.qrCode);
                            toast.success("Código copiado.");
                          }}
                        >
                          <Copy className="mr-1 h-3 w-3" /> Copiar código
                        </Button>
                        {pixFornecedor.expiraEm ? (
                          <span className="text-xs text-muted-foreground">
                            Expira em {new Date(pixFornecedor.expiraEm).toLocaleString("pt-BR")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <aside className="h-fit rounded-2xl border border-border bg-card p-6">
        <h3 className="font-semibold">Resumo</h3>
        <div className="mt-4 space-y-2 text-sm">
          {trechos.map((t, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span>
                {t.trecho}
                {t.data ? <span className="block text-xs text-muted-foreground">{t.data}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.cia} {t.voo}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-2xl font-bold text-primary">{brl(total)}</span>
        </div>
        {metodo === "cartao" ? (
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {cartoes.every((c) => c.parcela)
              ? cartoes
                  .map((c, i) => {
                    const o = c.opcoes?.find((x) => x.installment === c.parcela);
                    return o ? `Cartão ${i + 1}: ${o.installment}x de ${brl(o.installmentsValue)}` : "";
                  })
                  .filter(Boolean)
                  .join(" · ")
              : "Parcelamento não selecionado"}
          </div>
        ) : null}
        {metodo === "cartao" && !somaConfere ? (
          <div className="mt-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
            Soma dos cartões: {brl(soma)} — precisa ficar igual ao total.
          </div>
        ) : null}

        <Button
          type="button"
          className="mt-5 w-full"
          disabled={enviando || metodo === "pix" || Boolean(erro)}
          onClick={() => void finalizar()}
        >
          {enviando ? "Processando..." : "Fazer pedido"}
        </Button>
      </aside>
    </div>
  );
}
