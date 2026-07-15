import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { listProtocolos, listProtocoloMessages } from "@/lib/chat/queries.functions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/chat/protocolos")({
  component: ProtocolosPage,
});

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  aberto: { label: "Aberto", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  encerrado_inatividade: {
    label: "Encerrado (inatividade)",
    className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  },
  encerrado_manual: {
    label: "Encerrado",
    className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  },
};

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function ProtocolosPage() {
  const listFn = useServerFn(listProtocolos);
  const [status, setStatus] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["protocolos", status, search],
    queryFn: () =>
      listFn({
        data: {
          status: status === "todos" ? undefined : (status as never),
          search: search || undefined,
        },
      }),
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-3">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número..."
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="aberto">Abertos</SelectItem>
            <SelectItem value="encerrado_inatividade">Encerrados por inatividade</SelectItem>
            <SelectItem value="encerrado_manual">Encerrados manualmente</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">{rows.length} protocolos</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nenhum protocolo encontrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-white/10 bg-[var(--chat-bg)] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-2 text-left">Número</th>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Abertura</th>
                <th className="px-4 py-2 text-left">Última atividade</th>
                <th className="px-4 py-2 text-left">Encerramento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS_LABEL[r.status] ?? { label: r.status, className: "" };
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
                  >
                    <td className="px-6 py-2 font-mono text-xs">{r.numero}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.cliente_nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.wa_phone}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={s.className}>{s.label}</Badge>
                    </td>
                    <td className="px-4 py-2 text-xs">{fmt(r.opened_at)}</td>
                    <td className="px-4 py-2 text-xs">{fmt(r.last_activity_at)}</td>
                    <td className="px-4 py-2 text-xs">{fmt(r.closed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ProtocoloDrawer id={selectedId} onClose={() => setSelectedId(null)} rows={rows} />
    </div>
  );
}

function ProtocoloDrawer({
  id,
  onClose,
  rows,
}: {
  id: string | null;
  onClose: () => void;
  rows: Array<{ id: string; numero: string; cliente_nome: string | null; wa_phone: string | null }>;
}) {
  const msgsFn = useServerFn(listProtocoloMessages);
  const proto = rows.find((r) => r.id === id) ?? null;
  const { data: msgs, isLoading } = useQuery({
    queryKey: ["protocolo-msgs", id],
    queryFn: () => msgsFn({ data: { protocolo_id: id! } }),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">
            Protocolo {proto?.numero ?? ""}
          </SheetTitle>
          {proto && (
            <div className="text-xs text-muted-foreground">
              {proto.cliente_nome ?? "—"} · {proto.wa_phone ?? ""}
            </div>
          )}
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-2 overflow-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (msgs ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Sem mensagens.</div>
          ) : (
            (msgs ?? []).map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.direction === "inbound"
                    ? "bg-white/5"
                    : "ml-8 bg-emerald-600/10 text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
