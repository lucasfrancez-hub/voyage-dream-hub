import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Copy, Trash2, ExternalLink, MousePointerClick } from "lucide-react";
import { toast } from "sonner";
import {
  listShortLinks,
  createShortLink,
  deleteShortLink,
} from "@/lib/short-links.functions";
import { confirm } from "@/lib/confirm";

export const Route = createFileRoute("/admin/encurtador")({
  component: EncurtadorPage,
});

function EncurtadorPage() {
  const qc = useQueryClient();
  const list = useServerFn(listShortLinks);
  const create = useServerFn(createShortLink);
  const remove = useServerFn(deleteShortLink);

  const { data = [], isLoading } = useQuery({
    queryKey: ["short-links"],
    queryFn: () => list(),
  });

  const [targetUrl, setTargetUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://pedidos.viaair.tur.br";

  const createMut = useMutation({
    mutationFn: (input: { target_url: string; slug?: string; label?: string }) =>
      create({ data: input }),
    onSuccess: (res) => {
      const url = `${origin}/l/${res.slug}`;
      try {
        navigator.clipboard.writeText(url);
      } catch {
        /* noop */
      }
      toast.success("Link criado e copiado");
      setTargetUrl("");
      setSlug("");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["short-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (s: string) => remove({ data: { slug: s } }),
    onSuccess: () => {
      toast.success("Link excluído");
      qc.invalidateQueries({ queryKey: ["short-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = targetUrl.trim();
    if (!url) return toast.error("Cole a URL de destino");
    try {
      new URL(url);
    } catch {
      return toast.error("URL inválida");
    }
    createMut.mutate({
      target_url: url,
      slug: slug.trim() || undefined,
      label: label.trim() || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-brand-orange/10 border border-brand-orange/30 flex items-center justify-center text-brand-orange">
          <Link2 className="h-5 w-5" />
        </div>
        <div>
          <div className="text-brand-orange text-[11px] uppercase tracking-widest font-semibold">
            Ferramenta interna
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-bold">Encurtador de URL</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gera links curtos <code>{origin}/l/xxxxxx</code> pra usar no WhatsApp, e-mail e stories.
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-3"
      >
        <Field label="URL de destino *">
          <input
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            className={cls}
            placeholder="https://pedidos.viaair.tur.br/pacotes/orlando-105"
          />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Slug (opcional)">
            <div className="flex items-stretch rounded-xl border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-brand-orange/40">
              <span className="px-3 flex items-center text-xs text-muted-foreground border-r border-border">
                /l/
              </span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                placeholder="orlando (deixe vazio pra gerar)"
                maxLength={60}
              />
            </div>
          </Field>
          <Field label="Rótulo interno (opcional)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={cls}
              placeholder="Ex.: campanha Instagram julho"
              maxLength={120}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 transition disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" /> Gerar link curto
          </button>
        </div>
      </form>

      <section className="mt-6 rounded-2xl border border-border bg-card">
        <div className="px-5 py-3 border-b border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Links criados
        </div>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : data.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Nenhum link ainda — crie o primeiro acima.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((row: any) => {
              const short = `${origin}/l/${row.slug}`;
              return (
                <li key={row.slug} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-semibold text-brand-orange">{short}</code>
                      {row.label && (
                        <span className="text-[10px] uppercase tracking-wider bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          {row.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">
                      → {row.target_url}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MousePointerClick className="h-3 w-3" /> {row.click_count} cliques
                      </span>
                      <span>criado {new Date(row.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(short);
                        toast.success("Copiado");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-brand-orange transition"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                    <a
                      href={short}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-brand-orange transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Excluir link?",
                          description: `O link ${short} deixará de funcionar.`,
                          confirmText: "Excluir",
                          destructive: true,
                        });
                        if (ok) deleteMut.mutate(row.slug);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-red-500 hover:border-red-500 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
