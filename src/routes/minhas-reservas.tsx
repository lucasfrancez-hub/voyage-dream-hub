import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, LogOut, Hash, Calendar, CreditCard, MapPin, Hotel, Star, CheckCircle2, ChevronDown, Package as PackageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/TopBar";
import { formatBRL, formatDateRange } from "@/lib/format";
import { paymentMethodLabel, statusLabel } from "@/lib/order-labels";
import { FlightCard, type FlightInfo } from "@/components/FlightCard";
import { OrderDocuments } from "@/components/OrderDocuments";

export const Route = createFileRoute("/minhas-reservas")({
  head: () => ({
    meta: [
      { title: "Minhas reservas | Via Air" },
      { name: "description", content: "Acesse suas reservas e acompanhe o status dos seus pedidos Via Air." },
    ],
  }),
  component: MinhasReservas,
});

type Order = {
  id: string;
  created_at: string;
  status: string;
  full_name: string;
  email: string;
  phone: string;
  cpf: string | null;
  adults: number;
  children: number;
  payment_method: string;
  total_price: number;
  supplier_name: string | null;
  supplier_order_number: string | null;
  notes: string | null;
  package_id: string | null;
  package_snapshot: Record<string, unknown>;
};

type PackageMap = Record<string, Record<string, unknown>>;

function MinhasReservas() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <TopBar backLabel="Voltar ao site" />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold">Minhas reservas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe seus pedidos, voos, hospedagem e pagamentos.
          </p>
        </div>

        {checking ? (
          <div className="text-center py-16 text-muted-foreground">Carregando…</div>
        ) : email ? (
          <SignedInView email={email} />
        ) : (
          <SignInForm />
        )}
      </main>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          emailRedirectTo: `${window.location.origin}/minhas-reservas`,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Link de acesso enviado! Verifique seu e-mail.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar link");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Mail className="mx-auto h-10 w-10 text-brand-orange" />
        <h2 className="mt-4 text-xl font-semibold">Verifique seu e-mail</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Enviamos um link de acesso para <strong className="text-foreground">{email}</strong>.
          Clique nele para entrar em suas reservas.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-xs text-brand-orange hover:underline"
        >
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-orange/10 border border-brand-orange/30 flex items-center justify-center">
          <Mail className="h-5 w-5 text-brand-orange" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Acesse suas reservas</h2>
          <p className="text-xs text-muted-foreground">
            Informe o e-mail usado no pedido — enviaremos um link seguro para entrar.
          </p>
        </div>
      </div>

      <label className="mt-6 block text-xs uppercase tracking-wider text-muted-foreground">
        E-mail
      </label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="seu@email.com"
        className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-brand-orange"
      />
      <button
        type="submit"
        disabled={sending}
        className="mt-4 w-full rounded-full bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition"
      >
        {sending ? "Enviando…" : "Enviar link de acesso"}
      </button>
    </form>
  );
}

function SignedInView({ email }: { email: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [packagesById, setPackagesById] = useState<PackageMap>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ordersRes, packagesRes] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase
          .from("packages")
          .select("id,slug,title,destination,origin,going_date,return_date,nights,price_per_person,taxes,image_url,summary,itinerary,includes,hotel_name,hotel_stars,meal_plan,base_occupancy,outbound_flight,return_flight"),
      ]);
      if (cancelled) return;
      if (ordersRes.error) {
        setError(ordersRes.error.message);
      } else {
        setOrders((ordersRes.data ?? []) as Order[]);
      }
      if (!packagesRes.error && packagesRes.data) {
        const map: PackageMap = {};
        for (const p of packagesRes.data) map[(p as { id: string }).id] = p as Record<string, unknown>;
        setPackagesById(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Você saiu.");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="h-4 w-4" />
          <span>Entrou como <strong className="text-foreground">{email}</strong></span>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-brand-orange"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {!error && !orders && (
        <div className="text-center py-12 text-muted-foreground">Carregando pedidos…</div>
      )}
      {!error && orders && orders.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Nenhum pedido encontrado para este e-mail.
        </div>
      )}
      {orders && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((o) => <OrderCard key={o.id} order={o} pkg={o.package_id ? packagesById[o.package_id] : undefined} />)}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const snap = (o.package_snapshot ?? {}) as {
    title?: string;
    destination?: string;
    origin?: string;
    going_date?: string | null;
    return_date?: string | null;
    nights?: number | null;
    order_number?: string | null;
    hotel_name?: string | null;
    hotel_stars?: number | null;
    meal_plan?: string | null;
    itinerary?: string | null;
    summary?: string | null;
    includes?: string[] | null;
    outbound_flight?: FlightInfo | null;
    return_flight?: FlightInfo | null;
    boleto_capture?: Record<string, string> | null;
  };
  const st = statusLabel(o.status);
  const pm = paymentMethodLabel(o.payment_method);
  const displayOrderNumber = snap.order_number?.trim()
    ? snap.order_number.trim()
    : `#${(() => {
        const hex = o.id.replace(/-/g, "").slice(0, 12);
        const n = parseInt(hex, 16);
        return String(n % 100000000).padStart(8, "0");
      })()}`;
  const isBoleto = (o.payment_method ?? "").toLowerCase() === "boleto";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {new Date(o.created_at).toLocaleString("pt-BR")}
          </div>
          <div className="mt-1 font-semibold">{snap.title ?? "Pacote"}</div>
          {snap.destination && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {snap.destination}
            </div>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-mono font-semibold">
            <Hash className="h-3 w-3 text-muted-foreground" /> Pedido {displayOrderNumber}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-display font-bold text-brand-orange">
            {formatBRL(o.total_price)}
          </div>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.className}`}>
            {st.label}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <CreditCard className="h-4 w-4" /> Pagamento: <span className="text-foreground font-medium">{pm.label}</span>
      </div>

      {(snap.going_date || snap.return_date) && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {snap.nights ? `${snap.nights} noites · ` : ""}
          {formatDateRange(snap.going_date, snap.return_date)}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-orange hover:opacity-80"
      >
        <PackageIcon className="h-3.5 w-3.5" />
        {open ? "Ocultar detalhes" : "Ver detalhes da reserva"}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          {snap.hotel_name && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Hospedagem</div>
              <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center">
                  <Hotel className="h-5 w-5 text-brand-orange" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{snap.hotel_name}</span>
                    {snap.hotel_stars ? (
                      <span className="inline-flex">
                        {Array.from({ length: snap.hotel_stars }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  {snap.meal_plan && (
                    <div className="mt-1.5 text-xs text-muted-foreground">Regime: {snap.meal_plan}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(snap.outbound_flight || snap.return_flight) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Voos</div>
              <div className="grid md:grid-cols-2 gap-3">
                {snap.outbound_flight && (
                  <FlightCard flight={snap.outbound_flight} kind="outbound" adults={o.adults} />
                )}
                {snap.return_flight && (
                  <FlightCard flight={snap.return_flight} kind="return" adults={o.adults} />
                )}
              </div>
            </div>
          )}

          {snap.itinerary && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Roteiro</div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground leading-relaxed">
                {snap.itinerary}
              </pre>
            </div>
          )}

          {snap.includes && snap.includes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Incluso</div>
              <ul className="grid sm:grid-cols-2 gap-1 text-sm">
                {snap.includes.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isBoleto && snap.boleto_capture && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Boleto</div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
                {Object.entries(snap.boleto_capture).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground">{k}: </span>
                    <span className="font-medium text-foreground break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {o.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" /> Observações
              </div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap">{o.notes}</div>
            </div>
          )}

          <OrderDocuments orderId={o.id} />
        </div>
      )}
    </div>
  );
}
