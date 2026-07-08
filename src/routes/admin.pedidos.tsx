import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";

export const Route = createFileRoute("/admin/pedidos")({
  component: AdminOrders,
});

function AdminOrders() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-display font-bold">Pedidos</h1>
      <p className="text-sm text-muted-foreground">
        {orders?.length ?? 0} reserva(s) recebida(s)
      </p>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="text-center text-muted-foreground py-8">Carregando…</div>
        )}
        {!isLoading && orders?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Nenhum pedido ainda.
          </div>
        )}
        {orders?.map((o) => {
          const snap = (o.package_snapshot ?? {}) as { title?: string; destination?: string };
          return (
            <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("pt-BR")}
                  </div>
                  <div className="mt-1 font-semibold">{snap.title ?? "Pacote"}</div>
                  <div className="text-xs text-muted-foreground">{snap.destination}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-lg font-display font-bold text-brand-orange">
                    {formatBRL(o.total_price)}
                  </div>
                  <span
                    className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      o.payment_method === "credit_card"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-emerald-500/10 text-emerald-500"
                    }`}
                  >
                    {o.payment_method === "credit_card" ? "Cartão" : "Pix / WhatsApp"}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm border-t border-border pt-4">
                <InfoLine icon={User} value={o.full_name} />
                <InfoLine icon={Mail} value={o.email} />
                <InfoLine icon={Phone} value={o.phone} />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {o.adults} adulto(s){o.children ? ` · ${o.children} criança(s)` : ""}
                {o.cpf ? ` · CPF ${o.cpf}` : ""}
              </div>
              {o.notes && (
                <div className="mt-3 text-sm rounded-lg bg-muted/40 p-3">{o.notes}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoLine({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-brand-orange" />
      <span className="text-foreground truncate">{value}</span>
    </div>
  );
}
