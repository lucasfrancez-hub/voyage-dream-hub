import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  setAdminUserRole,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/admin/usuarios")({
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminUsers);
  const create = useServerFn(createAdminUser);
  const del = useServerFn(deleteAdminUser);
  const setRole = useServerFn(setAdminUserRole);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (input: { email: string; password: string; role: "admin" | "user" }) =>
      create({ data: input }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setEmail("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar"),
  });

  const delMut = useMutation({
    mutationFn: (userId: string) => del({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
  });

  const roleMut = useMutation({
    mutationFn: (input: { userId: string; role: "admin" | "user" }) =>
      setRole({ data: input }),
    onSuccess: () => {
      toast.success("Permissão atualizada");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setNewRole] = useState<"admin" | "user">("user");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 8) {
      toast.error("Informe e-mail e senha com ao menos 8 caracteres");
      return;
    }
    createMut.mutate({ email, password, role });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center gap-2 text-brand-orange text-xs uppercase tracking-widest">
        <Users className="h-4 w-4" /> Usuários internos
      </div>
      <h1 className="mt-1 font-display text-3xl font-bold">Equipe com acesso ao painel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Apenas o gestor cria e gerencia contas. Novos usuários já entram com o e-mail confirmado.
      </p>

      <section className="mt-6 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-brand-orange" /> Criar novo usuário
        </h2>
        <form onSubmit={submit} className="mt-4 grid sm:grid-cols-[1fr_1fr_140px_auto] gap-3 items-end">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1.5">E-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cls}
              placeholder="pessoa@voeair.com"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1.5">Senha temporária</span>
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cls}
              placeholder="mín. 8 caracteres"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1.5">Permissão</span>
            <select value={role} onChange={(e) => setNewRole(e.target.value as any)} className={cls}>
              <option value="user">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-60"
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Criar
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card">
        <div className="p-4 border-b border-border font-semibold">Usuários existentes</div>
        {usersQuery.isLoading && (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        )}
        {usersQuery.isError && (
          <div className="p-6 text-sm text-destructive">Não foi possível carregar usuários.</div>
        )}
        <div className="divide-y divide-border">
          {(usersQuery.data ?? []).map((u) => (
            <div key={u.id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{u.email}</div>
                <div className="text-xs text-muted-foreground">
                  Criado em {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  {u.lastSignInAt
                    ? ` · Último acesso ${new Date(u.lastSignInAt).toLocaleString("pt-BR")}`
                    : " · Nunca acessou"}
                </div>
              </div>
              <select
                value={u.role}
                onChange={(e) =>
                  roleMut.mutate({ userId: u.id, role: e.target.value as "admin" | "user" })
                }
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
              >
                <option value="user">Operador</option>
                <option value="admin">Admin</option>
              </select>
              {u.role === "admin" && (
                <span className="inline-flex items-center gap-1 text-xs text-brand-orange">
                  <ShieldCheck className="h-3.5 w-3.5" /> Admin
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remover ${u.email}?`)) delMut.mutate(u.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive transition"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </button>
            </div>
          ))}
          {usersQuery.data?.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Nenhum usuário ainda.</div>
          )}
        </div>
      </section>
    </div>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";
