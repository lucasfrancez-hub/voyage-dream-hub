/**
 * Tela de pagamento (cartão 1/2/3 e Pix).
 * Todas as condições — parcelas, juros, bandeira e total — vêm da operadora.
 * Nada é calculado aqui além da soma dos valores distribuídos nos cartões.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, QrCode, Loader2, Check, Copy, Eraser, MapPin, User } from "lucide-react";
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
import { onerConcluirPedidoCheckout } from "@/lib/integrations/oner/checkout-order.functions";
import { ResumoReserva } from "@/components/checkout/ResumoReserva";
import { CARD_BRANDS, BrandLogo, detectBrand, type CardBrand } from "@/components/CardForm";
import type { ResumoCarrinho } from "@/lib/integrations/oner/checkout.server";

/** Rótulos que a operadora espera para cada bandeira. */
const BANDEIRA_ONER: Record<CardBrand, string> = {
  Visa: "VISA",
  Mastercard: "MASTERCARD",
  Elo: "ELO",
  Amex: "AMEX",
  Diners: "DINERS",
  Hipercard: "HIPER",
};

/** Altura/estilo único para todos os campos da tela. */
const CAMPO = "h-12 rounded-xl";


export type DadosCheckoutOner = {
  resumo: ResumoCarrinho;
  aceitaCartao: boolean;
  aceitaPix: boolean;
  maxCartoes: number;
};

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
  dados,
  passageiros,
}: {
  cartId: string;
  modoAdmin?: boolean;
  /** Quando a etapa anterior já carregou o carrinho, evita nova consulta (e total zerado). */
  dados?: DadosCheckoutOner;
  /** Passageiros já preenchidos na etapa 1, exibidos no resumo lateral. */
  passageiros?: Array<{ nome: string; tipo?: string }>;
}) {
  const carregarResumo = useServerFn(onerCheckoutResumo);
  const buscarParcelas = useServerFn(onerParcelasCartao);
  const pagarCartao = useServerFn(onerPagarCartao);
  const pagarPix = useServerFn(onerPagarPix);
  const concluirPedido = useServerFn(onerConcluirPedidoCheckout);

  const [carregando, setCarregando] = useState(!dados);
  const [erro, setErro] = useState<string | null>(null);
  const [total, setTotal] = useState(dados?.resumo.total ?? 0);
  const [resumo, setResumo] = useState<ResumoCarrinho | null>(dados?.resumo ?? null);
  const [maxCartoes, setMaxCartoes] = useState(dados?.maxCartoes || 1);
  const [aceitaPix, setAceitaPix] = useState(dados?.aceitaPix ?? false);


  const [metodo, setMetodo] = useState<"cartao" | "pix">("cartao");
  const [quantidade, setQuantidade] = useState(1);
  const [cartoes, setCartoes] = useState<CartaoForm[]>([
    cartaoVazio(dados?.resumo.total ? String(dados.resumo.total.toFixed(2)) : ""),
  ]);
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

  const limparPagador = () =>
    setPagador({
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


  useEffect(() => {
    if (dados) {
      if (!dados.aceitaCartao && dados.aceitaPix) setMetodo("pix");
      if (dados.resumo.expirado) setErro("Esta reserva expirou. Refaça a busca para continuar.");
      return;
    }
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
      setResumo(r.resumo);
      setMaxCartoes(r.maxCartoes || 1);
      setAceitaPix(r.aceitaPix);
      setCartoes([cartaoVazio(String((r.resumo.total ?? 0).toFixed(2)))]);
      if (!r.aceitaCartao && r.aceitaPix) setMetodo("pix");
      if (r.resumo.expirado) setErro("Esta reserva expirou. Refaça a busca para continuar.");
    })();
    return () => {
      ativo = false;
    };
  }, [cartId, carregarResumo, dados]);

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
    const obrigatorios: Array<keyof typeof pagador> = [
      "nome",
      "sobrenome",
      "documentoNumero",
      "nascimento",
      "email",
      "telefone",
      "cep",
      "rua",
      "numero",
      "bairro",
      "cidade",
      "estado",
    ];
    if (obrigatorios.some((k) => !String(pagador[k] ?? "").trim())) {
      toast.error("Preencha todos os dados e o endereço do pagador.");
      return;
    }
    setEnviando(true);
    const r = await pagarCartao({
      data: {
        cartId,
        totalEsperado: total,
        pagador: {
          ...pagador,
          documentoNumero: somenteNumeros(pagador.documentoNumero),
          telefone: somenteNumeros(pagador.telefone),
          cep: somenteNumeros(pagador.cep),
        },

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
    // O pedido VIA AIR é finalizado com o localizador, na tela de Pedidos.
    void concluirPedido({
      data: { cartId, metodo: "CARD", localizador: r.localizador ?? null },
    });
    toast.success("Pedido realizado.");
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
    // Pix sobe para a Oner: abre a tarefa de refazer o carrinho sem comissão.
    void concluirPedido({
      data: {
        cartId,
        metodo: "PIX",
        pixBrcode: r.pix.qrCode,
        pixExpiraEm: r.pix.expiraEm,
      },
    });
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
        <h2 className="text-lg font-semibold">Pedido realizado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Código da reserva: <span className="font-semibold text-foreground">{localizador}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {erro ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {erro}
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-card/50 p-6">
          <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground">
              2
            </span>
            Forma de pagamento
          </h2>

          <div className="mb-8 flex gap-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setMetodo("cartao")}
              className={`h-auto flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition ${
                metodo === "cartao"
                  ? "border-2 border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <CreditCard className="h-5 w-5" />
              Cartão de crédito
            </Button>

            <Button
              variant="outline"
              type="button"
              disabled={!aceitaPix}
              onClick={() => setMetodo("pix")}
              className={`h-auto flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition disabled:opacity-50 ${
                metodo === "pix"
                  ? "border-2 border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <QrCode className="h-5 w-5" />
              Pix
            </Button>
          </div>

          {metodo === "cartao" ? (
            <div>
              {maxCartoes > 1 ? (
                <div className="mb-6">
                  <div className="mb-3 block text-sm text-muted-foreground">Quantidade de cartões</div>
                  <div className="flex gap-2">
                    {Array.from({ length: Math.min(3, maxCartoes) }, (_, i) => i + 1).map((n) => (
                      <Button
                        variant="ghost"
                        key={n}
                        type="button"
                        onClick={() => void escolherQuantidade(n)}
                        className={`h-auto rounded-lg px-6 py-2 font-bold transition ${
                          quantidade === n
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-6">
                {cartoes.map((c, i) => (
                  <div key={i} className="space-y-6 rounded-xl border border-border/60 bg-muted/20 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-sm font-bold uppercase tracking-wider text-sky-400">
                          Cartão {String(i + 1).padStart(2, "0")}
                        </span>
                        {c.bandeira && c.finalCartao ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {c.bandeira} •••• {c.finalCartao}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {i === 0 ? "Principal" : i === 1 ? "Segundo cartão" : "Terceiro cartão"}
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 block text-xs uppercase text-muted-foreground">Valor neste cartão</div>
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
                        className="w-full"
                        placeholder="0,00"
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs uppercase text-muted-foreground">Bandeira do cartão *</div>
                      <div className="flex flex-wrap gap-2">
                        {["VISA", "MASTERCARD", "ELO", "AMEX", "DINERS", "HIPER"].map((bandeira) => {
                          const ativa = c.bandeira?.toUpperCase().includes(bandeira === "MASTERCARD" ? "MASTER" : bandeira);
                          return (
                            <Button
                              type="button"
                              variant="outline"
                              key={bandeira}
                              onClick={() => atualizar(i, { bandeira, opcoes: null, parcela: null })}
                              className={`h-11 min-w-16 rounded-xl border p-1.5 transition ${ativa ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background opacity-80"}`}
                              aria-label={bandeira}
                              aria-pressed={Boolean(ativa)}
                            >
                              {bandeira === "MASTERCARD" ? (
                                <span className="flex min-w-14 flex-col items-center justify-center text-[7px] font-bold leading-none" aria-hidden="true">
                                  <span className="relative mb-0.5 h-5 w-8">
                                    <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-destructive" />
                                    <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-primary opacity-90" />
                                  </span>
                                  mastercard
                                </span>
                              ) : (
                                <span className="flex h-8 min-w-14 items-center justify-center rounded-md bg-background px-2 text-[9px] font-black">
                                  {bandeira}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Número do cartão *</Label>
                        <Input
                          value={c.numero}
                          inputMode="numeric"
                          placeholder="0000 0000 0000 0000"
                          onChange={(e) => atualizar(i, { numero: e.target.value, opcoes: null, parcela: null })}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Validade (MM/AA) *</Label>
                        <Input
                          value={[c.mes, c.ano].filter(Boolean).join("/")}
                          inputMode="numeric"
                          placeholder="MM/AA"
                          onChange={(e) => {
                            const valor = somenteNumeros(e.target.value).slice(0, 6);
                            atualizar(i, { mes: valor.slice(0, 2), ano: valor.slice(2), opcoes: null, parcela: null });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">CVV *</Label>
                        <Input
                          value={c.cvv}
                          inputMode="numeric"
                          placeholder="•••"
                          onChange={(e) => atualizar(i, { cvv: e.target.value, opcoes: null, parcela: null })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Nome impresso no cartão *</Label>
                        <Input
                          value={c.nome}
                          placeholder="Como está no cartão"
                          onChange={(e) => atualizar(i, { nome: e.target.value.toUpperCase(), opcoes: null, parcela: null })}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">CPF do titular *</Label>
                        <Input
                          value={c.documentoNumero}
                          inputMode="numeric"
                          placeholder="000.000.000-00"
                          onChange={(e) => atualizar(i, { documentoNumero: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs uppercase text-muted-foreground">Parcelas</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={c.carregando}
                          onClick={() => void consultarParcelas(i)}
                          className="w-full"
                        >
                          {c.carregando ? "Carregando..." : "Carregar parcelas"}
                        </Button>
                        {c.carregando ? (
                          <p className="mt-2 text-xs text-muted-foreground">Carregando opções de parcelamento...</p>
                        ) : c.erroParcelas ? (
                          <p className="mt-2 text-xs text-destructive">Não foi possível carregar o parcelamento para este cartão.</p>
                        ) : c.opcoes && c.opcoes.length > 0 ? (
                          <select
                            className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm"
                            value={c.parcela ?? ""}
                            onChange={(e) => atualizar(i, { parcela: Number(e.target.value) })}
                          >
                            <option value="">Selecione</option>
                            {c.opcoes.map((o) => (
                              <option key={o.installment} value={o.installment}>
                                {o.installment}x de {brl(o.installmentsValue)} {o.hasRate ? "com juros" : "sem juros"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">Informe o cartão para carregar as parcelas.</p>
                        )}
                      </div>
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

        {metodo === "cartao" ? (
          <>
            <section className="rounded-2xl border border-border bg-card/50 p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                  </span>
                  Dados de quem paga
                </h2>
                <Button type="button" variant="ghost" size="sm" onClick={limparPagador} className="text-primary">
                  <Eraser className="h-3.5 w-3.5" /> Limpar campos
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Nome *</Label><Input value={pagador.nome} onChange={(e) => mudarPagador({ nome: e.target.value })} /></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Sobrenome *</Label><Input value={pagador.sobrenome} onChange={(e) => mudarPagador({ sobrenome: e.target.value })} /></div>
                <div className="md:col-span-2"><Label className="mb-1 block text-xs uppercase text-muted-foreground">E-mail *</Label><Input type="email" value={pagador.email} onChange={(e) => mudarPagador({ email: e.target.value })} /></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Data de nascimento *</Label><Input type="date" value={pagador.nascimento} onChange={(e) => mudarPagador({ nascimento: e.target.value })} /></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Nacionalidade *</Label><select className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm" value="Brasil" disabled><option>Brasil</option></select></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Tipo de documento *</Label><select className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm" value="CPF" disabled><option>CPF</option></select></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Nº do documento *</Label><Input value={pagador.documentoNumero} inputMode="numeric" onChange={(e) => mudarPagador({ documentoNumero: e.target.value })} /></div>
                <div className="md:col-span-2"><Label className="mb-1 block text-xs uppercase text-muted-foreground">Celular *</Label><Input value={pagador.telefone} inputMode="numeric" placeholder="(00) 00000-0000" onChange={(e) => mudarPagador({ telefone: e.target.value })} /></div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/50 p-6">
              <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                </span>
                Endereço de cobrança
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">CEP *</Label><Input value={pagador.cep} inputMode="numeric" placeholder="00000-000" onChange={(e) => mudarPagador({ cep: e.target.value })} /></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Estado (UF) *</Label><Input value={pagador.estado} maxLength={2} placeholder="PR" onChange={(e) => mudarPagador({ estado: e.target.value.toUpperCase() })} /></div>
                <div className="md:col-span-2"><Label className="mb-1 block text-xs uppercase text-muted-foreground">Cidade *</Label><Input value={pagador.cidade} onChange={(e) => mudarPagador({ cidade: e.target.value })} /></div>
                <div className="md:col-span-2"><Label className="mb-1 block text-xs uppercase text-muted-foreground">Endereço *</Label><Input value={pagador.rua} onChange={(e) => mudarPagador({ rua: e.target.value })} /></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Número *</Label><Input value={pagador.numero} onChange={(e) => mudarPagador({ numero: e.target.value })} /></div>
                <div><Label className="mb-1 block text-xs uppercase text-muted-foreground">Complemento</Label><Input value={pagador.complemento} onChange={(e) => mudarPagador({ complemento: e.target.value })} /></div>
                <div className="md:col-span-2"><Label className="mb-1 block text-xs uppercase text-muted-foreground">Bairro *</Label><Input value={pagador.bairro} onChange={(e) => mudarPagador({ bairro: e.target.value })} /></div>
              </div>
            </section>
          </>
        ) : null}
      </div>

      <ResumoReserva
        resumo={
          resumo ?? { voos: [], precos: [], parcelas: [], total, taxas: null, tarifa: null }
        }
        passageiros={passageiros}
        rodape={
          <div>
            {metodo === "cartao" ? (
              <div className="text-right text-xs text-muted-foreground">
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
              className="mt-5 h-auto w-full rounded-xl bg-primary py-4 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={enviando || metodo === "pix" || Boolean(erro)}
              onClick={() => void finalizar()}
            >
              {enviando ? "Processando..." : "Fazer pedido"}
            </Button>
          </div>
        }
      />
    </div>
  );
}
