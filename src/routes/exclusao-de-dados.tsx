import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import viaAirLogo from "@/assets/viaair-logo.png.asset.json";

export const Route = createFileRoute("/exclusao-de-dados")({
  component: DataDeletionPage,
  head: () => ({
    meta: [
      { title: "Exclusão de Dados — VIA AIR" },
      { name: "description", content: "Solicite a exclusão completa dos seus dados pessoais na VIA AIR." },
      { property: "og:title", content: "Exclusão de Dados — VIA AIR" },
      { property: "og:description", content: "Como solicitar exclusão de dados pessoais na VIA AIR." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://pedidos.viaair.tur.br/exclusao-de-dados" },
    ],
    links: [{ rel: "canonical", href: "https://pedidos.viaair.tur.br/exclusao-de-dados" }],
  }),
});

function DataDeletionPage() {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const subject = encodeURIComponent("Exclusão de dados — LGPD");
  const body = encodeURIComponent(
    `Solicito a exclusão dos meus dados pessoais, nos termos da LGPD (Lei 13.709/2018).\n\n` +
    `Nome: ${name}\nE-mail: ${email}\nTelefone/WhatsApp: ${phone}\n\n` +
    `Motivo (opcional): ${reason}\n\n` +
    `Estou ciente de que dados exigidos por obrigação legal ou fiscal podem ser mantidos pelo período obrigatório.`
  );
  const mailto = `mailto:privacidade@viaair.tur.br?subject=${subject}&body=${body}`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-800">
      <a href="/" className="mb-8 inline-block">
        <img src={viaAirLogo.url} alt="VIA AIR" className="h-10 w-auto" />
      </a>

      <h1 className="mb-2 text-3xl font-bold text-slate-900">Exclusão de Dados Pessoais</h1>
      <p className="mb-8 text-sm text-slate-500">
        Solicite a remoção dos seus dados pessoais dos nossos sistemas, conforme a LGPD.
      </p>

      <section className="space-y-4 text-[15px] leading-relaxed">
        <p>
          A VIA AIR respeita o seu direito de solicitar a exclusão dos seus dados pessoais a
          qualquer momento. Preencha o formulário abaixo — ele abrirá seu cliente de e-mail com a
          solicitação pronta para envio ao nosso Encarregado (DPO).
        </p>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Atenção: dados vinculados a contratos ativos, pagamentos e obrigações fiscais serão
          mantidos pelo período legal exigido (até 5 anos, conforme o art. 16 da LGPD).
        </p>
      </section>

      {!sent ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = mailto;
            setSent(true);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Nome completo</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">E-mail cadastrado</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Telefone / WhatsApp</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Motivo (opcional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 focus:border-[#F26B1F]/50 focus:bg-white focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-[#F26B1F] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Enviar solicitação de exclusão
          </button>
          <p className="text-center text-xs text-slate-500">
            Ou envie diretamente para{" "}
            <a href="mailto:privacidade@viaair.tur.br" className="text-[#F26B1F] hover:underline">
              privacidade@viaair.tur.br
            </a>
          </p>
        </form>
      ) : (
        <div className="mt-8 rounded-md border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-sm text-emerald-800">
            Solicitação encaminhada. Responderemos em até <strong>15 dias úteis</strong> no e-mail
            informado, conforme prazo estabelecido pela LGPD.
          </p>
        </div>
      )}
    </main>
  );
}
