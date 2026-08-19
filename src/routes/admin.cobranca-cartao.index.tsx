import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, RefreshCw, ShieldCheck, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import {
  cobrarCartao,
  listarCobrancasCartao,
  reconsultarCobranca,
  type CobrancaCartao,
} from "@/lib/asaas-card.functions";

export const Route = createFileRoute("/admin/cobranca-cartao/")({
  component: CobrancaCartaoPage,
  head: () => ({
    meta: [
      { title: "Cobrança no cartão | VIA AIR" },
      {
        name: "description",
        content: "Cobrança de cartão de crédito transmitida direto ao ASAAS, com auditoria, conciliação e antecipação.",
      },
      { property: "og:title", content: "Cobrança no cartão | VIA AIR" },
      { property: "og:description", content: "Painel interno de cobrança por cartão da VIA AIR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export const ROTULO_STATUS: Record<string, string> = {
  aprovado: "APROVADO",
  em_analise: "EM ANÁLISE DE RISCO",
  recusado: "RECUSADO",
  erro: "ERRO DE PROCESSAMENTO",
  indefinido: "RESULTADO INDEFINIDO — CONSULTANDO TRANSAÇÃO",
  recebido: "RECEBIDO (SALDO DISPONÍVEL)",
  estornado: "ESTORNADO",
  estornado_parcial: "ESTORNADO PARCIALMENTE",
  chargeback: "CHARGEBACK ABERTO",
};

export const corStatus = (s: string) =>
  s === "aprovado" || s === "recebido"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
    : s === "em_analise" || s === "indefinido"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
      : s === "chargeback"
        ? "border-destructive bg-destructive/10 text-destructive"
        : s === "recusado" || s === "erro"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground";

const campo = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const so = (v: string) => v.replace(/\D/g, "");
const hoje = () => new Date().toISOString().slice(0, 10);

function CobrancaCartaoPage() {
  const cobrar = useServerFn(cobrarCartao);
  const listar = useServerFn(listarCobrancasCartao);
  const reconsultar = useServerFn(reconsultarCobranca);

  const [vendaRef, setVendaRef] = useState("");
  const [descricao, setDescricao] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  const [titularNome, setTitularNome] = useState("");
  const [titularDoc, setTitularDoc] = useState("");
  const [cardNumero, setCardNumero] = useState("");
  const [cardMes, setCardMes] = useState("");
  const [cardAno, setCardAno] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [vencimento, setVencimento] = useState(hoje());

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<CobrancaCartao | null>(null);
  const [lista, setLista] = useState<CobrancaCartao[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  const valorNumero = useMemo(() => Number(valor.replace(/\./g, "").replace(",", ".")) || 0, [valor]);
  const valorParcela = valorNumero > 0 ? valorNumero / parcelas : 0;

  const recarregar = async (termo?: string) => {
    setCarregando(true);
    try {
      setLista(await listar({ data: { busca: termo ?? null } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar as cobranças.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscarCep = async (v: string) => {
    setCep(v);
    const d = so(v);
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then((x) => x.json());
      if (r?.erro) return toast.error("CEP não encontrado.");
      setEndereco(r.logradouro || "");
      setBairro(r.bairro || "");
      setCidade(r.localidade || "");
      setEstado(r.uf || "");
    } catch {
      toast.error("Não consegui consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  };

  const enviar = async () => {
    if (clienteNome.trim().length < 2) return toast.error("Informe o cliente da venda.");
    if (so(clienteDoc).length < 11) return toast.error("Informe o CPF/CNPJ do cliente.");
    if (!email.includes("@")) return toast.error("Informe o e-mail.");
    if (so(cep).length !== 8) return toast.error("Informe o CEP.");
    if (!numero.trim()) return toast.error("Informe o número do endereço.");
    if (titularNome.trim().length < 2) return toast.error("Informe o titular do cartão.");
    if (so(titularDoc).length < 11) return toast.error("Informe o CPF/CNPJ do titular.");
    if (so(cardNumero).length < 13) return toast.error("Número do cartão inválido.");
    if (!cardMes || !cardAno || so(cardCvv).length < 3) return toast.error("Validade/CVV inválidos.");
    if (valorNumero <= 0) return toast.error("Informe o valor total.");

    setProcessando(true);
    try {
      const r = await cobrar({
        data: {
          vendaRef: vendaRef.trim() || null,
          descricao: descricao.trim() || null,
          clienteNome: clienteNome.trim(),
          clienteDocumento: so(clienteDoc),
          clienteEmail: email.trim(),
          clienteTelefone: so(telefone) || null,
          cep: so(cep),
          endereco: endereco.trim() || null,
          numero: numero.trim(),
          complemento: complemento.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          estado: estado.trim().toUpperCase() || null,
          titularNome: titularNome.trim(),
          titularDocumento: so(titularDoc),
          valor: valorNumero,
          parcelas,
          vencimento,
          cartaoNumero: so(cardNumero),
          cartaoMes: cardMes,
          cartaoAno: cardAno,
          cartaoCvv: so(cardCvv),
        },
      });
      // Dados sensíveis nunca permanecem em memória depois do envio.
      setCardNumero("");
      setCardCvv("");
      setResultado(r.charge);
      void recarregar();
      const s = r.charge.status;
      if (s === "aprovado" || s === "recebido") toast.success("Cobrança aprovada.");
      else if (s === "recusado") toast.error("Cobrança recusada.");
      else toast.message(ROTULO_STATUS[s] ?? s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao transmitir a cobrança.");
    } finally {
      setProcessando(false);
    }
  };

  const consultarNovamente = async (id: string) => {
    try {
      const atualizado = await reconsultar({ data: { chargeId: id } });
      setResultado((atual) => (atual?.id === id ? atualizado : atual));
      setLista((l) => l.map((c) => (c.id === id ? atualizado : c)));
      toast.success(`Status atual: ${ROTULO_STATUS[atualizado.status] ?? atualizado.status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao consultar.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cobrança no cartão</h1>
          <p className="text-sm text-muted-foreground">
            Transmissão direta ao ASAAS com auditoria completa. Não guardamos número completo nem CVV.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Venda</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Número da venda / reserva / orçamento</span>
            <input value={vendaRef} onChange={(e) => setVendaRef(e.target.value)} placeholder="PED-1234" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Descrição da cobrança</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} />
          </label>
        </div>

        <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Cliente</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">CEP</span>
            <div className="relative">
              <input value={cep} onChange={(e) => void buscarCep(e.target.value)} inputMode="numeric" className={campo} />
              {buscandoCep && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Cliente</span>
            <input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">CPF/CNPJ do cliente</span>
            <input value={clienteDoc} onChange={(e) => setClienteDoc(e.target.value)} inputMode="numeric" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">E-mail</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Celular</span>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="numeric" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Endereço</span>
            <input value={endereco} onChange={(e) => setEndereco(e.target.value)} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Número</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Complemento</span>
            <input value={complemento} onChange={(e) => setComplemento(e.target.value)} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Bairro</span>
            <input value={bairro} onChange={(e) => setBairro(e.target.value)} className={campo} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 text-sm">
              <span className="mb-1 block font-medium">Cidade</span>
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">UF</span>
              <input value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))} className={campo} />
            </label>
          </div>
        </div>

        <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Cartão</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nome do titular</span>
            <input value={titularNome} onChange={(e) => setTitularNome(e.target.value.toUpperCase())} autoComplete="off" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">CPF/CNPJ do titular</span>
            <input value={titularDoc} onChange={(e) => setTitularDoc(e.target.value)} inputMode="numeric" className={campo} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Número do cartão</span>
            <input
              value={cardNumero}
              onChange={(e) => setCardNumero(so(e.target.value).slice(0, 19).replace(/(.{4})/g, "$1 ").trim())}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000 0000 0000 0000"
              className={campo}
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Mês</span>
              <input value={cardMes} onChange={(e) => setCardMes(so(e.target.value).slice(0, 2))} inputMode="numeric" placeholder="09" className={campo} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Ano</span>
              <input value={cardAno} onChange={(e) => setCardAno(so(e.target.value).slice(0, 4))} inputMode="numeric" placeholder="2030" className={campo} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">CVV</span>
              <input value={cardCvv} onChange={(e) => setCardCvv(so(e.target.value).slice(0, 4))} inputMode="numeric" autoComplete="off" className={campo} />
            </label>
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> IP do atendente enviado automaticamente ao ASAAS.
            </span>
          </div>
        </div>

        <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Valores</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Valor total</span>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="12000,00" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Parcelas</span>
            <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className={campo}>
              {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Vencimento / 1ª parcela</span>
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
          </label>
        </div>
        {valorNumero > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {parcelas}x de {formatBRL(valorParcela)} — total {formatBRL(valorNumero)}
          </p>
        )}

        <div className="mt-6">
          <button
            onClick={enviar}
            disabled={processando}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            COBRAR
          </button>
          {processando && (
            <span className="ml-3 text-xs text-muted-foreground">
              Não feche a tela nem repita a cobrança — a tentativa nunca é reenviada automaticamente.
            </span>
          )}
        </div>

        {resultado && (
          <div className={`mt-6 rounded-xl border p-4 ${corStatus(resultado.status)}`}>
            <div className="text-xs font-bold uppercase tracking-widest">
              {ROTULO_STATUS[resultado.status] ?? resultado.status}
            </div>
            <div className="mt-1 text-sm text-foreground">
              {formatBRL(resultado.valor)} • {resultado.parcelas}x de {formatBRL(resultado.valor_parcela ?? resultado.valor / resultado.parcelas)}
              {resultado.asaas_payment_id ? ` • ${resultado.asaas_payment_id}` : ""}
            </div>
            {resultado.erro_mensagem && (
              <div className="mt-1 flex items-start gap-2 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5" /> {resultado.erro_mensagem}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/admin/cobranca-cartao/$id"
                params={{ id: resultado.id }}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                Abrir detalhes
              </Link>
              <button
                onClick={() => void consultarNovamente(resultado.id)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Consultar transação
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Transações</h2>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void recarregar(busca)}
              placeholder="Cliente, venda ou pay_..."
              className="rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm"
            />
          </div>
        </div>
        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
        ) : (
          <div className="space-y-2">
            {lista.map((c) => (
              <Link
                key={c.id}
                to="/admin/cobranca-cartao/$id"
                params={{ id: c.id }}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {c.cliente_nome} {c.venda_ref ? <span className="text-muted-foreground">• {c.venda_ref}</span> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatBRL(c.valor)} • {c.parcelas}x
                    {c.card_brand ? ` • ${c.card_brand}` : ""}
                    {c.card_last4 ? ` •••• ${c.card_last4}` : ""}
                    {c.asaas_payment_id ? ` • ${c.asaas_payment_id}` : ""}
                  </div>
                </div>
                {c.anticipation_status && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    ANTECIPAÇÃO: {c.anticipation_status}
                  </span>
                )}
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${corStatus(c.status)}`}>
                  {ROTULO_STATUS[c.status] ?? c.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
