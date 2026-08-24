import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { modulosPorGrupo, MODULO_KEYS } from "@/lib/permissions/modules";
import { listarModulosUsuario, salvarModulosUsuario } from "@/lib/permissions/permissions.functions";

export function ModulosUsuarioDialog({
  usuario,
  onFechar,
}: {
  usuario: { id: string; email: string; fullName: string | null } | null;
  onFechar: () => void;
}) {
  const listar = useServerFn(listarModulosUsuario);
  const salvar = useServerFn(salvarModulosUsuario);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const q = useQuery({
    queryKey: ["modulos-usuario", usuario?.id],
    queryFn: () => listar({ data: { userId: usuario!.id } }),
    enabled: !!usuario,
  });

  useEffect(() => {
    if (q.data) setSelecionados(q.data);
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () => salvar({ data: { userId: usuario!.id, modulos: selecionados } }),
    onSuccess: () => {
      toast.success("Módulos atualizados");
      onFechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  function alternar(key: string) {
    setSelecionados((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  return (
    <Dialog open={!!usuario} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Módulos liberados</DialogTitle>
          <DialogDescription>
            {usuario?.fullName || usuario?.email} — marque os menus que este usuário pode acessar.
            Admin e gestor enxergam tudo automaticamente.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelecionados([...MODULO_KEYS])}
                className="rounded-full border border-border px-3 py-1 text-xs hover:border-brand-orange"
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={() => setSelecionados([])}
                className="rounded-full border border-border px-3 py-1 text-xs hover:border-brand-orange"
              >
                Limpar
              </button>
            </div>
            {modulosPorGrupo().map((g) => (
              <div key={g.grupo}>
                <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-orange">
                  {g.grupo}
                </h3>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {g.modulos.map((m) => {
                    const on = selecionados.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => alternar(m.key)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition ${
                          on
                            ? "border-brand-orange/60 bg-brand-orange/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-brand-orange/40"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on ? "border-brand-orange bg-brand-orange text-white" : "border-border"
                          }`}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:border-brand-orange"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={mut.isPending}
            onClick={() => mut.mutate()}
            className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Salvar módulos ({selecionados.length})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
