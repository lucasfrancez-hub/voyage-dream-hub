import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listManualQueue,
  uploadManualBoardingPass,
  removeManualBoardingPass,
  resendBoardingPass,
} from "@/lib/checkin/checkin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  PlaneTakeoff,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/checkins")({
  head: () => ({ meta: [{ title: "Check-ins — VIA AIR" }] }),
  component: CheckinsPage,
});

const HOUR = 3600 * 1000;

function buildLatamBoardingPassUrl(opts: {
  locator: string;
  surname: string;
  tripPassengerId: string;
  segmentIndex: number;
}) {
  const p = new URLSearchParams({
    orderId: opts.locator.toUpperCase(),
    lastName: opts.surname.toLowerCase(),
    tripPassengerId: opts.tripPassengerId,
    segmentIndex: String(opts.segmentIndex),
    itineraryId: "1",
  });
  return `https://www.latamairlines.com/br/pt/cartao-de-embarque?${p.toString()}`;
}

function readFileAsBase64(file: File): Promise<{ base64: string; ext: "pdf" | "png" | "jpg"; contentType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string; // data:xxx;base64,....
      const base64 = result.split(",")[1] ?? "";
      const ct = file.type || "";
      const ext: "pdf" | "png" | "jpg" =
        ct.includes("png") || file.name.toLowerCase().endsWith(".png") ? "png"
        : ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g$/i.test(file.name) ? "jpg"
        : "pdf";
      const contentType = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
      resolve({ base64, ext, contentType });
    };
    reader.readAsDataURL(file);
  });
}

function CheckinsPage() {
  const load = useServerFn(listManualQueue);
  const upload = useServerFn(uploadManualBoardingPass);
  const remove = useServerFn(removeManualBoardingPass);
  const resend = useServerFn(resendBoardingPass);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["manual-checkins"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  const groups = (q.data ?? []) as Array<any>;

  // Janela de check-in por trecho:
  // - Internacional: 24h
  // - Nacional LATAM/GOL/AZUL: 24h
  // - Nacional demais companhias: 48h
  function windowHoursFor(seg: any): number {
    const airline = String(seg.airline || "").toUpperCase();
    const isIntl = !!seg.is_intl;
    if (isIntl) return 24;
    if (airline === "LATAM" || airline === "GOL" || airline === "AZUL") return 24;
    return 48;
  }
  function isWithinWindow(seg: any): boolean {
    const dep = seg.departure_at ? new Date(seg.departure_at).getTime() : 0;
    if (!dep) return false;
    const hoursTo = (dep - Date.now()) / HOUR;
    return hoursTo <= windowHoursFor(seg) && hoursTo > -6;
  }

  const [aFazer, proximos, prontos] = useMemo(() => {
    const todo: any[] = [];
    const upcoming: any[] = [];
    const done: any[] = [];
    for (const g of groups) {
      const paxCount = g.passengers.length;
      const isReady = g.segments.every((s: any) =>
        s.checkin?.boarding_passes && (s.checkin.boarding_passes as any[]).length >= paxCount,
      );
      if (isReady) { done.push(g); continue; }
      // "A fazer" = pelo menos um segmento dentro da janela (ou já iniciado)
      const anyOpen = g.segments.some((s: any) => s.checkin || isWithinWindow(s));
      if (anyOpen) todo.push(g); else upcoming.push(g);
    }
    return [todo, upcoming, done];
  }, [groups]);

  const totalToUpload = useMemo(() => {
    let n = 0;
    for (const g of aFazer) n += g.segments.length * g.passengers.length;
    return n;
  }, [aFazer]);


  async function handleUpload(args: {
    key: string;
    orderItemId: string;
    passengerIndex: number;
    file: File;
    totalPax: number;
    uploadedBefore: number;
    checkinIdBefore: string | null;
    alreadySent: boolean;
  }) {
    setBusyKey(args.key);
    try {
      const { base64, ext, contentType } = await readFileAsBase64(args.file);
      const res: any = await upload({ data: { orderItemId: args.orderItemId, passengerIndex: args.passengerIndex, fileBase64: base64, ext, contentType } });
      toast.success("Cartão anexado");
      const willBeReady = args.uploadedBefore + 1 >= args.totalPax;
      const checkinId = res?.checkinId ?? args.checkinIdBefore;
      await q.refetch();
      if (willBeReady && checkinId && !args.alreadySent) {
        toast.message("Enviando pro WhatsApp…");
        await handleSend(checkinId);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no upload");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(checkinId: string, passengerIndex: number) {
    const key = `${checkinId}:${passengerIndex}:rm`;
    setBusyKey(key);
    try {
      await remove({ data: { checkinId, passengerIndex } });
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSend(checkinId: string) {
    setSendingId(checkinId);
    try {
      const res = await resend({ data: { checkinId } });
      const r = (res as any).report as {
        attempted: number; delivered: number;
        skippedNoPhone: Array<{ name: string }>; failed: Array<{ name: string; error: string }>;
        usedOrderFallback: boolean;
      } | undefined;
      if (!r || r.delivered === 0) {
        const noPhone = r?.skippedNoPhone.map((p) => p.name).join(", ");
        const failed = r?.failed.map((p) => `${p.name}: ${p.error}`).join(" · ");
        toast.error(
          noPhone
            ? `Nenhum passageiro tem WhatsApp cadastrado (${noPhone}). Adicione o número em "Passageiros".`
            : failed || "Envio falhou",
        );
      } else {
        toast.success(
          `Cartão enviado (${r.delivered}/${r.attempted + r.skippedNoPhone.length})${r.usedOrderFallback ? " · usou telefone do pedido" : ""}`,
        );
        q.refetch();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between gap-2 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <PlaneTakeoff className="h-6 w-6 text-brand-orange" />
          <h1 className="text-2xl font-bold tracking-tight">Check-ins de voo</h1>
        </div>
      </header>

      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Fluxo manual passo a passo. Para cada reserva próxima, abra o cartão de embarque de cada
        passageiro no site da companhia, baixe o PDF/imagem, anexe aqui e envie para o WhatsApp do cliente.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Reservas a fazer" value={aFazer.length} tone="warning" />
        <StatCard icon={<FileUp className="h-4 w-4" />} label="Cartões faltando" value={totalToUpload} tone="muted" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Prontos p/ enviar" value={prontos.length} tone="success" />
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}

      <div className="space-y-10">


        <Section
          title="A fazer"
          subtitle="Reservas com pelo menos um trecho já na janela de check-in (48h nacional, 24h LATAM/GOL/AZUL e internacional)."
          empty="Nada pendente na janela. 🎉"
          count={aFazer.length}
        >
          {aFazer.map((g) => (
            <BookingCard
              key={g.key}
              group={g}
              busyKey={busyKey}
              sendingId={sendingId}
              onUpload={handleUpload}
              onRemove={handleRemove}
              onSend={handleSend}
            />
          ))}
        </Section>

        <Section
          title="Próximos check-ins"
          subtitle="Reservas dos próximos 7 dias que ainda não entraram na janela de check-in."
          empty="Nada previsto."
          count={proximos.length}
        >
          {proximos.map((g) => (
            <BookingCard
              key={g.key}
              group={g}
              busyKey={busyKey}
              sendingId={sendingId}
              onUpload={handleUpload}
              onRemove={handleRemove}
              onSend={handleSend}
            />
          ))}
        </Section>

        <Section
          title="Prontos"
          subtitle="Cartões anexados. Clique em enviar para disparar no WhatsApp dos passageiros."
          empty="Nada por aqui ainda."
          count={prontos.length}
        >
          {prontos.map((g) => (
            <BookingCard
              key={g.key}
              group={g}
              busyKey={busyKey}
              sendingId={sendingId}
              onUpload={handleUpload}
              onRemove={handleRemove}
              onSend={handleSend}
            />
          ))}
        </Section>

      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "muted" | "warning" | "success" }) {
  const toneMap = {
    muted: "text-muted-foreground",
    warning: "text-brand-orange font-semibold",
    success: "text-emerald-500",
  } as const;
  return (
    <Card className="p-4 bg-card/40 border-border/60 rounded-xl">
      <div className={`flex items-center gap-2 text-[11px] uppercase tracking-wider ${toneMap[tone]}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </Card>
  );
}

function Section({
  title, subtitle, empty, count, children,
}: { title: string; subtitle?: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground font-mono">{count}</span>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
      {count === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-border/60 bg-card/20 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="space-y-4">{children}</div>
      )}
    </section>
  );
}

function BookingCard({
  group, busyKey, sendingId, onUpload, onRemove, onSend,
}: {
  group: any;
  busyKey: string | null;
  sendingId: string | null;
  onUpload: (a: { key: string; orderItemId: string; passengerIndex: number; file: File; totalPax: number; uploadedBefore: number; checkinIdBefore: string | null; alreadySent: boolean }) => void;
  onRemove: (checkinId: string, passengerIndex: number) => void;
  onSend: (checkinId: string) => void;
}) {
  const paxCount = group.passengers.length;
  return (
    <Card className="p-5 bg-card/30 border-border/60 rounded-xl">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-mono rounded uppercase tracking-wider">
              LOC {group.locator}
            </span>
            <span className="text-xs text-muted-foreground">{paxCount} pax</span>
          </div>
          {group.order && (
            <div className="mt-2 text-sm">
              <Link
                to="/admin/pedidos/$id"
                params={{ id: group.order.id }}
                className="text-brand-orange/90 hover:text-brand-orange hover:underline font-semibold"
              >
                Pedido #{group.order.order_number ?? group.order.id.slice(0, 8)} — {group.order.full_name ?? ""}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {group.segments.map((seg: any) => {
          const dep = seg.departure_at ? new Date(seg.departure_at) : null;
          const hoursTo = dep ? Math.round((dep.getTime() - Date.now()) / HOUR) : null;
          const uploaded: any[] = Array.isArray(seg.checkin?.boarding_passes) ? seg.checkin.boarding_passes : [];
          const uploadedIdx = new Set(uploaded.map((p) => p.passenger_index));
          const ready = uploadedIdx.size >= paxCount;
          const alreadySent = !!seg.checkin?.delivered_wa_at;
          return (
            <div key={seg.order_item_id} className="border border-border/50 rounded-lg p-4 bg-background/30">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div>
                  <div className="font-semibold text-sm">
                    {seg.airline_label || seg.airline || "Voo"} {seg.flight_number || ""} · {seg.origin ?? "?"} → {seg.destination ?? "?"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dep ? dep.toLocaleString("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" }) : "Sem horário"}
                    {hoursTo != null && ` · em ${hoursTo}h`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ready ? (
                    <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 border">
                      Pronto ({uploaded.length}/{paxCount})
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10">
                      {uploaded.length}/{paxCount} anexados
                    </Badge>
                  )}
                  {alreadySent && (
                    <Badge variant="outline" className="border-sky-500/30 text-sky-500 bg-sky-500/10">
                      Enviado
                    </Badge>
                  )}
                  {ready && seg.checkin?.id && (
                    <Button
                      size="sm"
                      onClick={() => onSend(seg.checkin.id)}
                      disabled={sendingId === seg.checkin.id}
                      className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {sendingId === seg.checkin.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Send className="h-3.5 w-3.5 mr-1.5" />}
                      {alreadySent ? "Reenviar" : "Enviar WhatsApp"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {group.passengers.map((pax: any) => {
                  const rowKey = `${seg.order_item_id}:${pax.index}`;
                  const existing = uploaded.find((p) => p.passenger_index === pax.index);
                  const openUrl = seg.airline === "LATAM"
                    ? buildLatamBoardingPassUrl({
                        locator: group.locator,
                        surname: group.surname,
                        tripPassengerId: pax.trip_passenger_id,
                        segmentIndex: seg.segment_index,
                      })
                    : (seg.airline === "GOL"
                      ? `https://q.voegol.com.br/CheckinWeb/Home/Index?pnr=${encodeURIComponent(group.locator)}&lastName=${encodeURIComponent(group.surname)}`
                      : seg.airline === "AZUL"
                        ? `https://checkin.voeazul.com.br/?pnr=${encodeURIComponent(group.locator)}&lastName=${encodeURIComponent(group.surname)}`
                        : `https://www.google.com/search?q=${encodeURIComponent(`check-in ${seg.airline_label || ""} ${group.locator}`)}`);

                  return (
                    <PassengerRow
                      key={rowKey}
                      rowKey={rowKey}
                      pax={pax}
                      existing={existing}
                      openUrl={openUrl}
                      busy={busyKey === rowKey || busyKey === `${seg.checkin?.id}:${pax.index}:rm`}
                      onFile={(file) => onUpload({ key: rowKey, orderItemId: seg.order_item_id, passengerIndex: pax.index, file, totalPax: paxCount, uploadedBefore: uploaded.length, checkinIdBefore: seg.checkin?.id ?? null, alreadySent })}
                      onRemove={() => seg.checkin?.id && onRemove(seg.checkin.id, pax.index)}
                      checkinId={seg.checkin?.id ?? null}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PassengerRow({
  rowKey, pax, existing, openUrl, busy, onFile, onRemove, checkinId,
}: {
  rowKey: string;
  pax: any;
  existing: any | undefined;
  openUrl: string;
  busy: boolean;
  onFile: (f: File) => void;
  onRemove: () => void;
  checkinId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = pax.full_name || `Passageiro ${pax.index}`;
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 rounded-md bg-card/40 border border-border/40">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
          {pax.trip_passenger_id} · pax {pax.index}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <a href={openUrl} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline" className="h-8">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Abrir cartão
          </Button>
        </a>
        {existing && checkinId ? (
          <>
            <a href={`/api/public/bp/${checkinId}?pax=${pax.index}`} target="_blank" rel="noreferrer" title="Baixar cartão anexado">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Download className="h-4 w-4" /></Button>
            </a>
            <Button
              size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive"
              onClick={onRemove} disabled={busy} title="Remover anexo"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 border">Anexado</Badge>
          </>
        ) : (
          <Button
            size="sm"
            variant="default"
            className="h-8 bg-brand-orange hover:bg-brand-orange/90 text-white"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5 mr-1.5" />}
            Anexar cartão
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
