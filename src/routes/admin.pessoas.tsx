import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, Search, User, Building2, Mail, Phone, Loader2, Trash2 } from "lucide-react";
import { listPeople, deletePerson, type PersonRow } from "@/lib/people.functions";
import { confirm } from "@/lib/confirm";
import { PersonEditorDialog } from "@/components/PersonEditorDialog";

export const Route = createFileRoute("/admin/pessoas")({
  component: PeoplePage,
  head: () => ({ meta: [{ title: "Pessoas — Admin" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
  }),
});

function PeoplePage() {
  const list = useServerFn(listPeople);
  const del = useServerFn(deletePerson);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-people"], queryFn: () => list() });
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Pessoa excluída");
      qc.invalidateQueries({ queryKey: ["admin-people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<"all" | "PF" | "PJ">("all");
  const [editingId, setEditingId] = useState<string | null>(search.edit ?? null);

  // sync from URL (?edit=id)
  useMemo(() => {
    if (search.edit && search.edit !== editingId) setEditingId(search.edit);
  }, [search.edit]);

  function openEditor(id: string | null) {
    setEditingId(id);
    navigate({ search: (s) => ({ ...s, edit: id ?? undefined }), replace: true });
  }
  function closeEditor() {
    setEditingId(null);
    navigate({ search: (s) => ({ ...s, edit: undefined }), replace: true });
  }

  const filtered = useMemo(() => {
    const rows = (q.data ?? []) as PersonRow[];
    const t = term.trim().toLowerCase();
    const d = t.replace(/\D+/g, "");
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!t) return true;
      const hay = [r.name, r.legal_name, r.email, r.phone, r.mobile_phone, r.city]
        .filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(t)) return true;
      if (d && ((r.cpf ?? "").replace(/\D+/g, "").includes(d) || (r.cnpj ?? "").replace(/\D+/g, "").includes(d))) return true;
      return false;
    });
  }, [q.data, term, kind]);

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
            <Users className="h-4 w-4" /> Cadastro
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Pessoas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Base única de clientes e passageiros — PF e PJ.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor("novo")}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo cadastro
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por nome, CPF/CNPJ, e-mail, telefone…"
              className="w-full rounded-full border border-border bg-background pl-9 pr-4 py-2 text-sm"
            />
          </div>
          <div className="inline-flex rounded-full border border-border p-1 text-xs">
            {(["all", "PF", "PJ"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1 rounded-full transition ${
                  kind === k ? "bg-brand-orange text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {k === "all" ? "Todos" : k}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "…" : `${filtered.length} pessoa(s)`}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card overflow-hidden">
        {q.isLoading ? (
          <div className="p-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : q.isError ? (
          <div className="p-10 text-sm text-destructive text-center">
            Erro ao carregar cadastro.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-sm text-muted-foreground text-center">
            Nenhuma pessoa cadastrada ainda. Clique em "Novo cadastro" para começar.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id} className="relative group">
                <button
                  type="button"
                  onClick={() => openEditor(p.id)}
                  className="w-full text-left grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-5 py-3 hover:bg-muted/30 transition"
                >
                  <div className="h-10 w-10 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center">
                    {p.kind === "PJ" ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{p.name}</span>
                      <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                        {p.kind}
                      </span>
                      <span className="text-[10px] text-muted-foreground">#{p.code}</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
                      {p.cpf && <span>CPF {p.cpf}</span>}
                      {p.cnpj && <span>CNPJ {p.cnpj}</span>}
                      {p.email && (
                        <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {p.email}</span>
                      )}
                      {(p.mobile_phone ?? p.phone) && (
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {p.mobile_phone ?? p.phone}</span>
                      )}
                      {p.city && <span>{p.city}{p.state ? `/${p.state}` : ""}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.updated_at).toLocaleDateString("pt-BR")}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const ok = await confirm({
                        title: "Excluir pessoa?",
                        description: `Tem certeza que deseja excluir "${p.name}"? Esta ação não pode ser desfeita.`,
                        confirmText: "Excluir",
                        destructive: true,
                      });
                      if (ok) delMut.mutate(p.id);
                    }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PersonEditorDialog
        personId={editingId}
        open={editingId !== null}
        onOpenChange={(v) => { if (!v) closeEditor(); }}
      />
    </div>
  );
}
