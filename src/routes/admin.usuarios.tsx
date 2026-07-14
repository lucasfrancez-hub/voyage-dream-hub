import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Trash2, ShieldCheck, Loader2, Check, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  setAdminUserRole,
  setAdminUserFullName,
  resendUserPassword,
  type AdminRole,
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
  const setName = useServerFn(setAdminUserFullName);
  const resendPwd = useServerFn(resendUserPassword);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
  });

  const createMut = useMutation({
    mutationFn: (input: { email: string; password: string; role: AdminRole; fullName?: string; agencyName?: string }) =>
      create({ data: input }),
    onSuccess: () => {
      toast.success("Usuário criado");
      setEmail("");
      setPassword("");
      setFullName("");
      setAgencyName("");
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
    mutationFn: (input: { userId: string; role: AdminRole }) =>
      setRole({ data: input }),
    onSuccess: () => {
      toast.success("Permissão atualizada");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const nameMut = useMutation({
    mutationFn: (input: { userId: string; fullName: string }) =>
      setName({ data: input }),
    onSuccess: () => {
      toast.success("Nome atualizado");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar nome"),
  });
  const resendMut = useMutation({
    mutationFn: (email: string) => resendPwd({ data: { email } }),
    onSuccess: () => toast.success("E-mail de redefinição de senha enviado"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao reenviar"),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [role, setNewRole] = useState<AdminRole>("user");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || password.length < 8) {
      toast.error("Informe e-mail e senha com ao menos 8 caracteres");
      return;
    }
    if (role === "partner" && !agencyName.trim()) {
      toast.error("Informe o nome da empresa do terceiro");
      return;
    }
    createMut.mutate({
      email,
      password,
      role,
      fullName: fullName.trim() || undefined,
      agencyName: role === "partner" ? agencyName.trim() : undefined,
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-10">
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
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="block text-xs text-muted-foreground mb-1.5">Nome completo</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={cls}
              placeholder="Ex.: Lucas Silva"
            />
          </label>
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
            <select value={role} onChange={(e) => setNewRole(e.target.value as AdminRole)} className={cls}>
              <option value="user">Operador</option>
              <option value="admin">Admin</option>
              <option value="partner">Terceiro (agência parceira)</option>
            </select>
          </label>
          {role === "partner" && (
            <label className="block sm:col-span-2">
              <span className="block text-xs text-muted-foreground mb-1.5">
                Nome da empresa (aparecerá nos vouchers do terceiro)
              </span>
              <input
                type="text"
                required
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                className={cls}
                placeholder="Ex.: Zonet Viagens"
              />
            </label>
          )}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition disabled:opacity-60"
            >
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Criar
            </button>
          </div>
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
            <UserRow
              key={u.id}
              user={u}
              savingName={nameMut.isPending && nameMut.variables?.userId === u.id}
              onSaveName={(name) => nameMut.mutate({ userId: u.id, fullName: name })}
              onChangeRole={(r) => roleMut.mutate({ userId: u.id, role: r })}
              onDelete={() => {
                if (confirm(`Remover ${u.email}?`)) delMut.mutate(u.id);
              }}
            />
          ))}
          {usersQuery.data?.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Nenhum usuário ainda.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function UserRow({
  user,
  savingName,
  onSaveName,
  onChangeRole,
  onDelete,
}: {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    createdAt: string;
    lastSignInAt: string | null;
    role: AdminRole;
  };
  savingName: boolean;
  onSaveName: (name: string) => void;
  onChangeRole: (r: AdminRole) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(user.fullName ?? "");
  useEffect(() => {
    setName(user.fullName ?? "");
  }, [user.fullName]);
  const dirty = name.trim() !== (user.fullName ?? "").trim();

  return (
    <div className="p-4 grid gap-3 md:grid-cols-[1.4fr_1fr_auto_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
          />
          {dirty && (
            <button
              type="button"
              disabled={savingName}
              onClick={() => onSaveName(name.trim())}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-orange px-3 py-1.5 text-xs font-medium text-brand-orange hover:bg-brand-orange/10 disabled:opacity-60"
            >
              {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </button>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {user.email} · Criado em {new Date(user.createdAt).toLocaleDateString("pt-BR")}
          {user.lastSignInAt
            ? ` · Último acesso ${new Date(user.lastSignInAt).toLocaleString("pt-BR")}`
            : " · Nunca acessou"}
        </div>
      </div>
      <select
        value={user.role}
        onChange={(e) => onChangeRole(e.target.value as AdminRole)}
        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
      >
        <option value="user">Operador</option>
        <option value="admin">Admin</option>
        <option value="partner">Terceiro</option>
      </select>
      {user.role === "admin" ? (
        <span className="inline-flex items-center gap-1 text-xs text-brand-orange">
          <ShieldCheck className="h-3.5 w-3.5" /> Admin
        </span>
      ) : user.role === "partner" ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          Terceiro
        </span>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive transition"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remover
      </button>
    </div>
  );
}

const cls =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-orange/40";
