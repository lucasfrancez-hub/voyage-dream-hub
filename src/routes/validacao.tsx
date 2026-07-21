import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, Search } from "lucide-react";
import { verifyProtocolHash } from "@/lib/protocolo-verify.functions";

type SearchParams = { codigo?: string };

export const Route = createFileRoute("/validacao")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    codigo: typeof s.codigo === "string" ? s.codigo : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Validar protocolo — VIA AIR" },
      {
        name: "description",
        content:
          "Verifique a autenticidade de um protocolo de atendimento emitido pela VIA AIR informando o código de verificação SHA-256.",
      },
      { property: "og:title", content: "Validar protocolo — VIA AIR" },
      {
        property: "og:description",
        content: "Confira se um documento de atendimento da VIA AIR é autêntico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ValidacaoPage,
});

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

type Result =
  | { valid: true; numero: string | null; contact_name: string | null; contact_phone: string | null; message_count: number; opened_at: string | null; closed_at: string | null; generated_at: string; generated_by: string | null }
  | { valid: false };

function ValidacaoPage() {
  const { codigo } = Route.useSearch();
  const verifyFn = useServerFn(verifyProtocolHash);
  const [hash, setHash] = useState(codigo ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await verifyFn({ data: { hash: clean } });
      setResult(r as Result);
    } catch (e) {
      setError((e as Error).message || "Erro ao validar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (codigo) submit(codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <ShieldCheck className="h-5 w-5 text-[#F26B1F]" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              VIA AIR
            </div>
            <h1 className="text-lg font-semibold text-slate-800">
              Validação de protocolo
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">
            Informe o <strong>código de verificação (SHA-256)</strong> que consta
            no rodapé do documento do protocolo para confirmar a autenticidade
            do atendimento.
          </p>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              submit(hash);
            }}
          >
            <input
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-sm focus:border-[#F26B1F] focus:outline-none focus:ring-1 focus:ring-[#F26B1F]"
              placeholder="cole aqui o código SHA-256 (64 caracteres)"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={loading || !hash.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#F26B1F] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#d95c17] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Validar
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {result && result.valid && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5" />
                <div className="font-semibold">Documento autêntico</div>
              </div>
              <p className="mt-1 text-xs text-emerald-700">
                Este código foi registrado nos sistemas da VIA AIR e corresponde
                a um protocolo de atendimento válido.
              </p>
              <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                <Field label="Protocolo" value={result.numero ? `#${result.numero}` : "—"} mono />
                <Field label="Contato" value={result.contact_name ?? "—"} />
                <Field label="WhatsApp" value={result.contact_phone ?? "—"} />
                <Field label="Mensagens" value={String(result.message_count ?? 0)} />
                <Field label="Aberto em" value={fmtDateTime(result.opened_at)} />
                <Field label="Fechado em" value={fmtDateTime(result.closed_at)} />
                <Field label="Documento gerado em" value={fmtDateTime(result.generated_at)} />
                <Field label="Gerado por" value={result.generated_by ?? "—"} />
              </div>
            </div>
          )}

          {result && !result.valid && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-red-800">
                <XCircle className="h-5 w-5" />
                <div className="font-semibold">Código não encontrado</div>
              </div>
              <p className="mt-1 text-xs text-red-700">
                Não localizamos nenhum protocolo com este código. Confira se
                copiou o valor completo (64 caracteres) ou solicite o documento
                original ao atendente.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Documento eletrônico VIA AIR · verificação por hash criptográfico
          SHA-256
        </p>
      </main>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={mono ? "font-mono text-sm text-slate-800" : "text-sm text-slate-800"}>
        {value}
      </div>
    </div>
  );
}
