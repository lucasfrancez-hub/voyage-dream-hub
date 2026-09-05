/**
 * Pagamento com cartão no checkout da consolidadora (tela pública).
 *
 * Número e CVV são digitados em campos hospedados (Datatrans SecureFields) —
 * nunca tocam nosso servidor. O SecureFields devolve um transaction_id; com ele
 * buscamos o parcelamento e, se o banco pedir, exibimos o desafio 3DS
 * (Evervault/Rinne) dentro de um modal antes de emitir o pagamento.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Loader2, Lock, ShieldCheck } from "lucide-react";
import {
  passhubCartao3dsPublico,
  passhubCartaoEmitirPublico,
  passhubCartaoParcelasPublico,
} from "@/lib/passhub/passhub.functions";

declare global {
  interface Window {
    SecureFields?: new () => SecureFieldsInstance;
    Evervault?: new (teamId: string, appId: string) => EvervaultInstance;
  }
}

type SecureFieldsInstance = {
  initTokenize: (merchantId: string, fields: Record<string, string>, cfg?: unknown) => void;
  on: (event: string, cb: (data?: unknown) => void) => void;
  submit: () => void;
  destroy?: () => void;
};

type EvervaultInstance = {
  ui: {
    threeDSecure: (
      sessionId: string,
      opts: Record<string, unknown>,
    ) => {
      on: (event: string, cb: (e?: { message?: string }) => void) => void;
      mount: (el: HTMLElement) => void | Promise<void>;
      unmount?: () => void;
    };
  };
};

const MERCHANT_SECUREFIELDS = "3000032265";

function carregarScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

function deviceId(): string {
  try {
    const k = "ph-device-id";
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

type Parcela = { parcelas: number; valorParcela: number; total: number; rotulo: string };

export function PagamentoCartaoPasshub({ codigo }: { codigo: string }) {
  const parcelasFn = useServerFn(passhubCartaoParcelasPublico);
  const sessaoFn = useServerFn(passhubCartao3dsPublico);
  const emitirFn = useServerFn(passhubCartaoEmitirPublico);

  const sfRef = useRef<SecureFieldsInstance | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erroCampos, setErroCampos] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [numeroMasc, setNumeroMasc] = useState("");

  const [nome, setNome] = useState("");
  const [validade, setValidade] = useState("");
  const [cpf, setCpf] = useState("");
  const [etapa, setEtapa] = useState<"form" | "parcelas" | "desafio" | "fim">("form");
  const [processando, setProcessando] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [parcelaSel, setParcelaSel] = useState(1);
  const [resultado, setResultado] = useState<{ status: string; localizador: string | null } | null>(
    null,
  );
  const desafioRef = useRef<HTMLDivElement | null>(null);

  // Monta os campos hospedados do cartão
  useEffect(() => {
    let vivo = true;
    let tentativas = 0;
    const montar = async () => {
      try {
        await carregarScript("https://pay.datatrans.com/upp/payment/js/secure-fields-2.0.0.js");
        if (!vivo || !window.SecureFields) return;
        const sf = new window.SecureFields();
        sfRef.current = sf;
        sf.initTokenize(
          MERCHANT_SECUREFIELDS,
          { cardNumber: "#ph-sf-number", cvv: "#ph-sf-cvv" },
          {
            debug: false,
            styles: {
              "*": "font-size: 16px; padding: 0; line-height: 46px; color: #111827; outline: none; background: transparent;",
              "*::placeholder": "color: #9ca3af;",
            },
            paymentMethods: ["VIS", "ECA", "AMX", "DIN", "DIS", "JCB", "ELO", "HIP"],
          },
        );
        sf.on("ready", () => vivo && setPronto(true));
        // Espelha bandeira e dígitos no cartão ilustrado (sem expor o número).
        sf.on("change", (data?: unknown) => {
          if (!vivo) return;
          const campos = (data as { fields?: Record<string, { paymentMethod?: string[]; length?: number }> })
            ?.fields;
          const num = campos?.["cardNumber"];
          const marca = num?.paymentMethod?.[0];
          const mapa: Record<string, string> = {
            VIS: "Visa", ECA: "Mastercard", AMX: "Amex", DIN: "Diners",
            DIS: "Discover", JCB: "JCB", ELO: "Elo", HIP: "Hipercard",
          };
          setBandeira(marca ? (mapa[marca] ?? marca) : "");
          const n = num?.length ?? 0;
          setNumeroMasc(
            n ? Array.from({ length: Math.min(n, 16) }, () => "•").join("").replace(/(.{4})/g, "$1 ").trim() : "",
          );
        });
      } catch {
        if (vivo && tentativas++ < 3) setTimeout(montar, 1500);
        else if (vivo) setErroCampos("Campos do cartão não carregaram. Recarregue a página.");
      }
    };
    montar();
    return () => {
      vivo = false;
      try {
        sfRef.current?.destroy?.();
      } catch {
        /* ok */
      }
    };
  }, []);

  const validadePartes = () => {
    const m = /^(\d{2})\/?(\d{2,4})$/.exec(validade.replace(/\s/g, ""));
    return m ? { mes: m[1], ano: m[2] } : null;
  };

  const verParcelas = () => {
    if (!sfRef.current || !pronto) return;
    if (nome.trim().length < 3) return toast.error("Informe o nome impresso no cartão.");
    if (!validadePartes()) return toast.error("Validade inválida — use MM/AA.");
    setErroCampos("");
    setProcessando(true);

    const sf = sfRef.current;
    const onSucesso = async (data?: unknown) => {
      const tx = (data as { transactionId?: string } | undefined)?.transactionId;
      if (!tx) {
        setProcessando(false);
        return toast.error("Não foi possível validar o cartão. Confira os dados.");
      }
      setTransactionId(tx);
      const res = await parcelasFn({ data: { codigo, deviceId: deviceId(), transactionId: tx } });
      setProcessando(false);
      if (!res.ok) return toast.error(res.erro);
      if (!res.parcelas.length) {
        // Sem tabela de parcelas: segue à vista
        setParcelas([
          { parcelas: 1, valorParcela: res.valorOriginal ?? 0, total: res.valorOriginal ?? 0, rotulo: "À vista" },
        ]);
      } else {
        setParcelas(res.parcelas);
      }
      setParcelaSel(1);
      setEtapa("parcelas");
    };
    sf.on("success", onSucesso);
    sf.on("error", () => {
      setProcessando(false);
      toast.error("Cartão recusado na validação. Confira número e CVV.");
    });
    sf.submit();
  };

  const emitir = async (dados: {
    transactionId: string;
    nome: string;
    validadeMes: string;
    validadeAno: string;
    cpfTitular?: string;
    parcelas: number;
  }) => {
    const res = await emitirFn({ data: { codigo, deviceId: deviceId(), ...dados } });
    if (!res.ok) throw new Error(res.erro);
    if (!res.resultado.sucesso) {
      throw new Error(
        res.resultado.mensagem ||
          `Pagamento não aprovado (${res.resultado.status}). Tente outro cartão.`,
      );
    }
    setResultado({ status: res.resultado.status, localizador: res.resultado.localizador });
    setEtapa("fim");
  };

  const rodarDesafio = async (tds: { tdsSessionId: string; merchantId: string; ambiente: string }) => {
    // Config pública do merchant 3DS (mesma API que o checkout oficial usa)
    const base =
      tds.ambiente === "sandbox"
        ? "https://api-sandbox.rinne.com.br/core/v1"
        : "https://api.rinne.com.br/core/v1";
    const cfg = (await (
      await fetch(`${base}/merchants/${tds.merchantId}/public-settings`)
    ).json()) as { team_id: string; app_id: string };
    await carregarScript("https://js.evervault.com/v2");
    if (!window.Evervault) throw new Error("Autenticação do banco indisponível.");
    const ev = new window.Evervault(cfg.team_id, cfg.app_id);

    await new Promise<void>((resolve, reject) => {
      const alvo = desafioRef.current;
      if (!alvo) return reject(new Error("Tela do banco não abriu."));
      const el = ev.ui.threeDSecure(tds.tdsSessionId, {
        size: { width: "100%", height: "450px" },
        colorScheme: "light",
        theme: "clean",
      });
      el.on("success", () => resolve());
      el.on("failure", (e) =>
        reject(new Error(e?.message || "Autenticação não aprovada pelo banco.")),
      );
      el.on("error", (e) => reject(new Error(e?.message || "Erro na autenticação 3DS.")));
      el.mount(alvo);
    });
  };

  const pagar = async () => {
    const val = validadePartes();
    if (!val) return;
    const dados = {
      transactionId,
      nome: nome.trim(),
      validadeMes: val.mes,
      validadeAno: val.ano,
      cpfTitular: cpf.replace(/\D/g, "") || undefined,
      parcelas: parcelaSel,
    };
    setProcessando(true);
    try {
      const res = await sessaoFn({ data: { codigo, deviceId: deviceId(), ...dados } });
      if (!res.ok) throw new Error(res.erro);
      const r = res.resultado;
      if (r.acao === "bloqueado") throw new Error(r.motivo);
      if (r.acao === "desafio") {
        setEtapa("desafio");
        // espera o modal renderizar antes de montar o desafio
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        await rodarDesafio(r);
      }
      await emitir(dados);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao pagar");
      setEtapa("parcelas");
    } finally {
      setProcessando(false);
    }
  };

  if (etapa === "fim" && resultado) {
    return (
      <div className="w-full rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
        <p className="font-semibold text-emerald-800">Pagamento enviado com sucesso!</p>
        {resultado.localizador ? (
          <p className="mt-1 text-sm text-emerald-700">
            Localizador: <b>{resultado.localizador}</b>
          </p>
        ) : null}
        <p className="mt-2 text-xs text-emerald-600">
          A emissão dos bilhetes segue o prazo da reserva.
        </p>
      </div>
    );
  }

  const etapaAtual = etapa === "form" ? 1 : etapa === "parcelas" ? 2 : 3;

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
      {/* Cabeçalho com cartão ilustrado */}
      <div className="relative bg-gradient-to-br from-[#1b2430] via-[#141c26] to-[#0d1319] px-5 pb-6 pt-5">
        <div className="mb-4 flex items-center gap-2 text-white/90">
          <CreditCard className="h-4 w-4 text-brand-orange" />
          <span className="text-sm font-semibold">Pagar com cartão de crédito</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70">
            <Lock className="h-3 w-3" /> Ambiente seguro
          </span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
          <div className="flex items-start justify-between">
            <div className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-500/80" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/60">
              {bandeira || "cartão"}
            </span>
          </div>
          <div className="mt-5 font-mono text-lg tracking-[0.18em] text-white/85">
            {numeroMasc || "•••• •••• •••• ••••"}
          </div>
          <div className="mt-3 flex items-end justify-between text-[11px] uppercase text-white/50">
            <span className="truncate pr-3">{nome || "nome do titular"}</span>
            <span>{validade || "MM/AA"}</span>
          </div>
        </div>

        {/* Passos */}
        <div className="mt-4 flex items-center gap-2">
          {["Cartão", "Parcelas", "Confirmação"].map((rotulo, i) => (
            <div key={rotulo} className="flex flex-1 flex-col gap-1">
              <div
                className={`h-1 rounded-full ${
                  etapaAtual > i ? "bg-brand-orange" : "bg-white/15"
                }`}
              />
              <span
                className={`text-[10px] ${etapaAtual > i ? "text-white/80" : "text-white/35"}`}
              >
                {rotulo}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5">
      {etapa === "form" ? (
        <div className="space-y-3">
          {/* Campos hospedados — número e CVV não passam pelo nosso sistema */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Número do cartão
            </label>
            <div id="ph-sf-number" className="h-12 rounded-xl border border-input bg-white px-3" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Validade (MM/AA)
              </label>
              <input
                className="h-12 w-full rounded-xl border border-input bg-white px-3 text-base text-gray-900 outline-none focus:border-brand-orange"
                placeholder="12/28"
                inputMode="numeric"
                maxLength={5}
                value={validade}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setValidade(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">CVV</label>
              <div id="ph-sf-cvv" className="h-12 rounded-xl border border-input bg-white px-3" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nome impresso no cartão
            </label>
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-3 text-base uppercase text-gray-900 outline-none focus:border-brand-orange"
              placeholder="NOME COMO ESTÁ NO CARTÃO"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              CPF do titular (opcional)
            </label>
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-3 text-base text-gray-900 outline-none focus:border-brand-orange"
              placeholder="000.000.000-00"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>

          {erroCampos ? <p className="text-xs text-red-600">{erroCampos}</p> : null}

          <button
            type="button"
            onClick={verParcelas}
            disabled={!pronto || processando}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-orange text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {processando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {pronto ? "Ver parcelas" : "Carregando campos seguros…"}
          </button>
        </div>
      ) : null}

      {etapa === "parcelas" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Cartão validado. Escolha as parcelas:
          </p>
          <select
            className="h-12 w-full rounded-xl border border-input bg-white px-3 text-base text-gray-900 outline-none focus:border-brand-orange"
            value={parcelaSel}
            onChange={(e) => setParcelaSel(Number(e.target.value))}
          >
            {parcelas.map((p) => (
              <option key={p.parcelas} value={p.parcelas}>
                {p.rotulo}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={pagar}
            disabled={processando}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-orange text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Pagar {parcelas.find((p) => p.parcelas === parcelaSel)?.total ? brl(parcelas.find((p) => p.parcelas === parcelaSel)!.total) : ""}
          </button>
          <button
            type="button"
            onClick={() => setEtapa("form")}
            className="w-full text-center text-xs text-muted-foreground underline"
          >
            usar outro cartão
          </button>
        </div>
      ) : null}

      {etapa === "desafio" ? (
        <div className="space-y-3">
          <p className="text-center text-xs font-medium text-muted-foreground">
            Autenticação do seu banco — confirme no aplicativo ou com o código enviado.
          </p>
          <div ref={desafioRef} className="min-h-[450px] w-full overflow-hidden rounded-xl bg-white" />
          {processando ? (
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando confirmação do banco…
            </p>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}

