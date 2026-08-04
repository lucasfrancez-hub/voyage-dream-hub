import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/confirm";
import { listarLinksChat, criarLinkChat, removerLinkChat } from "@/lib/chat/device-session.functions";

type LinkApp = { id: string; token: string; nome: string; ativo: boolean; last_seen_at: string | null };

export function AppNoCelularCard() {
  const carregar = useServerFn(listarLinksChat);
  const criar = useServerFn(criarLinkChat);
  const remover = useServerFn(removerLinkChat);

  const [links, setLinks] = useState<LinkApp[]>([]);
  const [nome, setNome] = useState("");
  const [pin, setPin] = useState("");
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const r = (await carregar()) as { links: LinkApp[] };
      setLinks(r.links);
    } catch {
      /* sem acesso */
    }
  }, [carregar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const base = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">App no celular</h2>
      <p className="mb-3 text-xs text-slate-500">
        Link secreto (sem login) para adicionar à tela de início. Protegido por PIN de 4 números e válido por 30 dias
        a cada uso.
      </p>

      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-slate-900">{l.nome}</span>
              <button
                type="button"
                aria-label="Copiar link"
                onClick={() => {
                  void navigator.clipboard.writeText(`${base}/chat/app/${l.token}`);
                  toast.success("Link copiado.");
                }}
              >
                <Copy className="h-4 w-4 text-slate-400 hover:text-primary" />
              </button>
              <button
                type="button"
                aria-label="Remover link"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Remover este link?",
                    description: "Quem já instalou o app com ele perde o acesso.",
                  });
                  if (!ok) return;
                  await remover({ data: { id: l.id } });
                  toast.success("Link removido.");
                  void recarregar();
                }}
              >
                <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
              </button>
            </div>
            <p className="mt-1 break-all text-[11px] text-slate-500">{`${base}/chat/app/${l.token}`}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="break-all text-[11px] text-slate-500">{`${base}/admin/app/${l.token}`}</span>
              <button
                type="button"
                aria-label="Copiar link do Admin"
                onClick={() => {
                  void navigator.clipboard.writeText(`${base}/admin/app/${l.token}`);
                  toast.success("Link do Admin copiado.");
                }}
              >
                <Copy className="h-4 w-4 text-slate-400 hover:text-primary" />
              </button>
            </div>

          </li>
        ))}
        {links.length === 0 && <p className="text-xs text-slate-500">Nenhum link criado ainda.</p>}
      </ul>

      <div className="mt-3 space-y-2">
        <Input placeholder="Nome (ex.: iPhone do Lucas)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Input
          placeholder="PIN de 4 números"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
        <Button
          size="sm"
          className="w-full"
          disabled={salvando || pin.length !== 4}
          onClick={async () => {
            setSalvando(true);
            try {
              await criar({ data: { nome: nome.trim() || undefined, pin } });
              setNome("");
              setPin("");
              toast.success("Link do app criado.");
              void recarregar();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível criar o link.");
            } finally {
              setSalvando(false);
            }
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Criar link do app
        </Button>
      </div>
    </section>
  );
}
