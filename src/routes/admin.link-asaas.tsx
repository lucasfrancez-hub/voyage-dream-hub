import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Copy, ExternalLink, Loader2, QrCode, Barcode, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { criarCobrancaAsaas, type AsaasCobrancaResultado } from "@/lib/asaas-cobranca.functions";

export const Route = createFileRoute("/admin/link-asaas")({
  component: CobrancaAsaasPage,
  head: () => ({
    meta: [
      { title: "Cobrança ASAAS | VIA AIR" },
      {
        name: "description",
        content: "Preencha os dados da cobrança e transmita direto para o ASAAS: Pix, boleto e cartão.",
      },
      { property: "og:title", content: "Cobrança ASAAS | VIA AIR" },
      { property: "og:description", content: "Formulário interno da VIA AIR que envia a cobrança direto ao ASAAS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FORMAS = [
  { key: "PIX", label: "Pix", icon: QrCode },
  { key: "BOLETO", label: "Boleto", icon: Barcode },
  { key: "CREDIT_CARD", label: "Cartão", icon: CreditCard },
] as const;

type Forma = (typeof FORMAS)[number]["key"];

const hoje = () => new Date().toISOString().slice(0, 10);
const so = (v: string) => v.replace(/\D/g, "");

const campo = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";

function CobrancaAsaasPage() {
  const enviar = useServerFn(criarCobrancaAsaas);

  const [forma, setForma] = useState<Forma>("PIX");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hoje());
  const [parcelas, setParcelas] = useState(1);
  const [descricao, setDescricao] = useState("");
  const [referencia, setReferencia] = useState("");

  const [cardNome, setCardNome] = useState("");
  const [cardNumero, setCardNumero] = useState("");
  const [cardMes, setCardMes] = useState("");
  const [cardAno, setCardAno] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<AsaasCobrancaResultado | null>(null);

  const valorNumero = useMemo(() => Number(valor.replace(/\./g, "").replace(",", ".")) || 0, [valor]);

  const buscarCep = async (v: string) => {
    const digitos = so(v);
    setCep(v);
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`).then((x) => x.json());
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

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${rotulo} copiado.`);
    } catch {
      toast.error("Não consegui copiar.");
    }
  };

  const transmitir = async () => {
    if (nome.trim().length < 2) return toast.error("Informe o nome do cliente.");
    if (so(cpf).length < 11) return toast.error("Informe um CPF/CNPJ válido.");
    if (!email.includes("@")) return toast.error("Informe o e-mail do cliente.");
    if (so(cep).length !== 8) return toast.error("Informe o CEP.");
    if (!numero.trim()) return toast.error("Informe o número do endereço.");
    if (valorNumero <= 0) return toast.error("Informe o valor da cobrança.");
    if (forma === "CREDIT_CARD" && (so(cardNumero).length < 13 || !cardMes || !cardAno || !cardCvv || !cardNome))
      return toast.error("Preencha todos os dados do cartão.");

    setSalvando(true);
    try {
      const r = await enviar({
        data: {
          nome: nome.trim(),
          cpfCnpj: so(cpf),
          email: email.trim(),
          telefone: so(telefone) || null,
          cep: so(cep),
          endereco: endereco.trim() || null,
          numero: numero.trim(),
          complemento: complemento.trim() || null,
          bairro: bairro.trim() || null,
          cidade: cidade.trim() || null,
          estado: estado.trim().toUpperCase() || null,
          billingType: forma,
          valor: valorNumero,
          vencimento,
          parcelas: forma === "PIX" ? null : parcelas,
          descricao: descricao.trim() || null,
          referencia: referencia.trim() || null,
          cartaoTitular: forma === "CREDIT_CARD" ? cardNome.trim() : null,
          cartaoNumero: forma === "CREDIT_CARD" ? so(cardNumero) : null,
          cartaoMes: forma === "CREDIT_CARD" ? cardMes : null,
          cartaoAno: forma === "CREDIT_CARD" ? cardAno : null,
          cartaoCvv: forma === "CREDIT_CARD" ? cardCvv : null,
        },
      });
      setResultado(r);
      setCardNumero("");
      setCardCvv("");
      toast.success("Cobrança transmitida ao ASAAS.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao transmitir a cobrança.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cobrança ASAAS</h1>
          <p className="text-sm text-muted-foreground">
            Preenchemos aqui e transmitimos direto para o ASAAS — Pix, boleto ou cartão (sem link externo).
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-5 flex flex-wrap gap-2">
          {FORMAS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setForma(f.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                forma === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <f.icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          ))}
        </div>

        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Pagador</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">CEP</span>
            <div className="relative">
              <input value={cep} onChange={(e) => void buscarCep(e.target.value)} inputMode="numeric" placeholder="87700-000" className={campo} />
              {buscandoCep && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nome completo</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">CPF / CNPJ</span>
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">E-mail</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Celular</span>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="numeric" placeholder="44999999999" className={campo} />
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

        <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Cobrança</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Valor total</span>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="2500,00" className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{forma === "PIX" ? "Vencimento do Pix" : "Vencimento / 1ª parcela"}</span>
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
          </label>
          {forma !== "PIX" && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Parcelas</span>
              <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className={campo}>
                {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x{valorNumero > 0 ? ` de ${formatBRL(valorNumero / n)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block font-medium">Referência interna (pedido)</span>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="PED-1234" className={campo} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Descrição</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={campo} />
          </label>
        </div>

        {forma === "CREDIT_CARD" && (
          <>
            <h2 className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Cartão</h2>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <label className="text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">Nome impresso no cartão</span>
                <input value={cardNome} onChange={(e) => setCardNome(e.target.value.toUpperCase())} autoComplete="off" className={campo} />
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
            </div>
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={transmitir}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Transmitir para o ASAAS
          </button>
          {valorNumero > 0 && <span className="text-xs text-muted-foreground">Total: {formatBRL(valorNumero)}</span>}
        </div>
      </section>

      {resultado && (
        <section className="mt-6 rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Cobrança criada no ASAAS</span>
          </div>
          <div className="mt-2 text-sm">
            {formatBRL(resultado.value)}
            {resultado.installmentCount ? ` • ${resultado.installmentCount}x` : ""} • status {resultado.status}
          </div>

          {resultado.pixPayload && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground">Pix copia e cola</div>
              <div className="mt-1 break-all rounded-lg border border-border bg-background p-3 text-xs">{resultado.pixPayload}</div>
              <button
                onClick={() => copiar(resultado.pixPayload!, "Pix copia e cola")}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar Pix
              </button>
            </div>
          )}

          {resultado.identificationField && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground">Linha digitável</div>
              <div className="mt-1 break-all rounded-lg border border-border bg-background p-3 text-xs">{resultado.identificationField}</div>
              <button
                onClick={() => copiar(resultado.identificationField!, "Linha digitável")}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar linha digitável
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {resultado.invoiceUrl && (
              <a href={resultado.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                <ExternalLink className="h-3.5 w-3.5" /> Ver fatura
              </a>
            )}
            {resultado.bankSlipUrl && (
              <a href={resultado.bankSlipUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">
                <Barcode className="h-3.5 w-3.5" /> Abrir boleto
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
