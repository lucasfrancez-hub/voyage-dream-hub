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
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  Send,
  Trash2,
  ArrowRight,
  Lock,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/checkins")({
  head: () => ({ meta: [{ title: "Check-ins — VIA AIR" }] }),
  component: CheckinsPage,
});

const HOUR = 3600 * 1000;
type Tab = "todo" | "upcoming" | "done";

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
      const result = reader.result as string;
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
  const [tab, setTab] = useState<Tab>("todo");

  const q = useQuery({
    queryKey: ["manual-checkins"],
    queryFn: () => load(),
    refetchInterval: 60_000,
  });

  const groups = (q.data ?? []) as Array<any>;

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
    const SEVEN_DAYS = 7 * 24 * HOUR;
    const now = Date.now();
    for (const g of groups) {
      const paxCount = g.passengers.length;
      const isReady = g.segments.every((s: any) =>
        s.checkin?.boarding_passes && (s.checkin.boarding_passes as any[]).length >= paxCount,
      );
      if (isReady) { done.push(g); continue; }
      const openSegs: any[] = [];
      const upcomingSegs: any[] = [];
      for (const s of g.segments) {
        const paxDone =
          Array.isArray(s.checkin?.boarding_passes) &&
          (s.checkin.boarding_passes as any[]).length >= paxCount;
        if (paxDone) continue;
        if (s.checkin || isWithinWindow(s)) { openSegs.push(s); continue; }
        const dep = s.departure_at ? new Date(s.departure_at).getTime() : 0;
        if (dep && dep - now <= SEVEN_DAYS && dep - now > 0) upcomingSegs.push(s);
      }
      if (openSegs.length > 0) todo.push({ ...g, segments: openSegs });
      if (upcomingSegs.length > 0) upcoming.push({ ...g, segments: upcomingSegs });
    }
    return [todo, upcoming, done];
  }, [groups]);

  const totalToUpload = useMemo(() => {
    let n = 0;
    for (const g of aFazer) {
      for (const s of g.segments) {
        const done =
          Array.isArray(s.checkin?.boarding_passes)
            ? (s.checkin.boarding_passes as any[]).length
            : 0;
        n += Math.max(0, g.passengers.length - done);
      }
    }
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

  const current = tab === "todo" ? aFazer : tab === "upcoming" ? proximos : prontos;
  const emptyLabel =
    tab === "todo" ? "Nada pendente na janela. 🎉"
    : tab === "upcoming" ? "Nenhum voo previsto nos próximos 7 dias."
    : "Nada concluído ainda.";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border/60 pb-6 mb-6 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
              <span className="w-1.5 h-7 bg-brand-orange rounded-full shrink-0" />
              Fila de Check-ins
            </h1>
            <p className="text-muted-foreground text-sm">Gerencie cartões de embarque e envio para o WhatsApp dos passageiros.</p>
          </div>
          <nav className="flex gap-1 bg-card/50 p-1 rounded-xl border border-border/60 shrink-0">
            <TabBtn active={tab === "todo"} onClick={() => setTab("todo")} label="A fazer agora" count={aFazer.length} />
            <TabBtn active={tab === "upcoming"} onClick={() => setTab("upcoming")} label="Próximos" count={proximos.length} />
            <TabBtn active={tab === "done"} onClick={() => setTab("done")} label="Concluídos" count={prontos.length} />
          </nav>
        </div>

        {/* Content */}
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground py-16 text-center">Carregando…</div>
        ) : current.length === 0 ? (
          <div className="p-12 rounded-xl border border-dashed border-border/60 bg-card/20 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {current.flatMap((g) => {
              // Une trechos em conexão (dest[i] == origin[i+1]) num único card.
              // O card ancora no primeiro trecho (upload e checkin ficam nele),
              // mas exibe origem do primeiro e destino do último.
              const segs = [...g.segments].sort(
                (a: any, b: any) => new Date(a.departure_at || 0).getTime() - new Date(b.departure_at || 0).getTime(),
              );
              const journeys: any[] = [];
              let cur: any[] = [];
              for (const s of segs) {
                if (cur.length === 0) { cur.push(s); continue; }
                const prev = cur[cur.length - 1];
                const sameChain =
                  prev.destination && s.origin &&
                  String(prev.destination).toUpperCase() === String(s.origin).toUpperCase();
                if (sameChain) cur.push(s);
                else { journeys.push(cur); cur = [s]; }
              }
              if (cur.length) journeys.push(cur);
              return journeys.map((chain) => {
                const first = chain[0];
                const last = chain[chain.length - 1];
                const merged = {
                  ...first,
                  destination: last.destination,
                  connections: chain.length > 1 ? chain.slice(1).map((s: any) => s.origin) : [],
                };
                return (
                  <SegmentCard
                    key={`${tab}-${g.key}-${first.order_item_id}`}
                    group={g}
                    seg={merged}
                    variant={tab}
                    busyKey={busyKey}
                    sendingId={sendingId}
                    onUpload={handleUpload}
                    onRemove={handleRemove}
                    onSend={handleSend}
                  />
                );
              });
            })}
          </div>
        )}

        {/* Footer stats */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
          <FooterStat label="Cartões faltando" value={totalToUpload} accent="foreground" />
          <FooterStat label="Reservas na janela" value={aFazer.length} accent="orange" />
          <FooterStat label="Próximos 7 dias" value={proximos.length} accent="muted" />
          <FooterStat label="Concluídos" value={prontos.length} accent="emerald" />
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-lg transition-colors ${
        active ? "bg-brand-orange text-white" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span
        className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
          active ? "bg-white/20" : "bg-muted/60"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FooterStat({ label, value, accent }: { label: string; value: number; accent: "orange" | "emerald" | "muted" | "foreground" }) {
  const cls =
    accent === "orange" ? "text-brand-orange"
    : accent === "emerald" ? "text-emerald-500"
    : accent === "muted" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className="bg-card/40 p-4 rounded-xl border border-border/60">
      <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}

function SegmentCard({
  group, seg, variant, busyKey, sendingId, onUpload, onRemove, onSend,
}: {
  group: any;
  seg: any;
  variant: Tab;
  busyKey: string | null;
  sendingId: string | null;
  onUpload: (a: any) => void;
  onRemove: (checkinId: string, passengerIndex: number) => void;
  onSend: (checkinId: string) => void;
}) {
  const paxCount = group.passengers.length;
  const uploaded: any[] = Array.isArray(seg.checkin?.boarding_passes) ? seg.checkin.boarding_passes : [];
  const uploadedIdx = new Set(uploaded.map((p) => p.passenger_index));
  const ready = uploadedIdx.size >= paxCount;
  const alreadySent = !!seg.checkin?.delivered_wa_at;
  const dep = seg.departure_at ? new Date(seg.departure_at) : null;
  const hoursTo = dep ? Math.round((dep.getTime() - Date.now()) / HOUR) : null;

  const status =
    variant === "done" ? { text: "Concluído", tone: "emerald" as const }
    : variant === "upcoming" ? { text: hoursTo != null ? `Abre em ~${Math.max(0, hoursTo - 24)}h` : "Aguardando", tone: "muted" as const }
    : { text: "Janela aberta", tone: "orange" as const };

  const borderCls =
    status.tone === "orange" ? "border-l-4 border-l-brand-orange border-y border-r border-border/60"
    : status.tone === "emerald" ? "border-l-4 border-l-emerald-500 border-y border-r border-border/60"
    : "border border-border/60";
  const pillCls =
    status.tone === "orange" ? "bg-brand-orange/10 text-brand-orange"
    : status.tone === "emerald" ? "bg-emerald-500/10 text-emerald-500"
    : "bg-muted text-muted-foreground";

  return (
    <div className={`bg-card/40 ${borderCls} rounded-xl overflow-hidden shadow-lg transition-all hover:translate-x-0.5`}>
      <div className="flex flex-col md:flex-row">
        {/* LEFT — flight summary */}
        <div className="p-5 md:w-72 shrink-0 bg-card/30 md:border-r border-border/60 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${pillCls}`}>
                {status.text}
              </span>
              {alreadySent && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-sky-500/10 text-sky-500">
                  Enviado
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mb-1 min-w-0">
              <span className="text-xl font-bold text-foreground truncate">{seg.origin ?? "?"}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xl font-bold text-foreground truncate">{seg.destination ?? "?"}</span>
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              {(seg.airline_label || seg.airline || "Voo")} {seg.flight_number || ""}
              {dep && (
                <> · {dep.toLocaleString("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" })}</>
              )}
              {hoursTo != null && variant !== "done" && ` · em ${hoursTo}h`}
            </div>
            {group.order && (
              <div className="mt-3">
                <Link
                  to="/admin/pedidos/$id"
                  params={{ id: group.order.id }}
                  className="text-xs text-brand-orange/90 hover:text-brand-orange hover:underline font-semibold"
                >
                  Pedido #{group.order.order_number ?? group.order.id.slice(0, 8)}
                </Link>
                {group.order.full_name && (
                  <div className="text-[11px] text-muted-foreground truncate">{group.order.full_name}</div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase text-muted-foreground font-bold">Localizador</div>
              <div className="font-mono text-foreground text-sm truncate">{group.locator}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-muted-foreground font-bold">Progresso</div>
              <div className={`text-sm font-bold ${ready ? "text-emerald-500" : "text-brand-orange"}`}>
                {uploaded.length}/{paxCount} <span className="text-muted-foreground font-normal">anexados</span>
              </div>
            </div>
          </div>

          {ready && seg.checkin?.id && (
            <Button
              size="sm"
              onClick={() => onSend(seg.checkin.id)}
              disabled={sendingId === seg.checkin.id}
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white w-full"
            >
              {sendingId === seg.checkin.id
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Send className="h-3.5 w-3.5 mr-1.5" />}
              {alreadySent ? "Reenviar WhatsApp" : "Enviar WhatsApp"}
            </Button>
          )}
        </div>

        {/* RIGHT — passenger grid */}
        <div className="flex-1 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.passengers.map((pax: any) => {
              const rowKey = `${seg.order_item_id}:${pax.index}`;
              const existing = uploaded.find((p) => p.passenger_index === pax.index);
              const disabled = variant === "upcoming" && !seg.checkin;
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
                <PassengerChip
                  key={rowKey}
                  rowKey={rowKey}
                  pax={pax}
                  existing={existing}
                  openUrl={openUrl}
                  disabled={disabled}
                  busy={busyKey === rowKey || busyKey === `${seg.checkin?.id}:${pax.index}:rm`}
                  onFile={(file) => onUpload({ key: rowKey, orderItemId: seg.order_item_id, passengerIndex: pax.index, file, totalPax: paxCount, uploadedBefore: uploaded.length, checkinIdBefore: seg.checkin?.id ?? null, alreadySent })}
                  onRemove={() => seg.checkin?.id && onRemove(seg.checkin.id, pax.index)}
                  checkinId={seg.checkin?.id ?? null}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PassengerChip({
  rowKey, pax, existing, openUrl, disabled, busy, onFile, onRemove, checkinId,
}: {
  rowKey: string;
  pax: any;
  existing: any | undefined;
  openUrl: string;
  disabled: boolean;
  busy: boolean;
  onFile: (f: File) => void;
  onRemove: () => void;
  checkinId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = pax.full_name || `Passageiro ${pax.index}`;
  const isDone = !!existing;

  const borderCls = isDone
    ? "border-emerald-500/25 bg-emerald-500/[0.04]"
    : disabled
      ? "border-border/40 bg-background/40 opacity-60"
      : "border-border/60 bg-background/40 hover:border-brand-orange/50";

  return (
    <div className={`flex items-center justify-between gap-2 p-3 rounded-lg border transition-all ${borderCls}`}>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-foreground truncate" title={label}>{label}</span>
        <span className={`text-[10px] uppercase font-bold tracking-tight ${
          isDone ? "text-emerald-500" : disabled ? "text-muted-foreground" : "text-muted-foreground italic"
        }`}>
          {isDone ? "Check-in OK" : disabled ? "Fora da janela" : "Aguardando anexo"}
        </span>
      </div>
      <div className="flex gap-1 shrink-0">
        {isDone && checkinId ? (
          <>
            <a href={`/api/public/bp/${checkinId}?pax=${pax.index}`} target="_blank" rel="noreferrer" title="Baixar cartão">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-500 hover:bg-emerald-500/10">
                <Download className="h-4 w-4" />
              </Button>
            </a>
            <Button
              size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
              onClick={onRemove} disabled={busy} title="Remover anexo"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <div title="Anexado" className="p-2 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </>
        ) : (
          <>
            <a href={openUrl} target="_blank" rel="noreferrer" title="Abrir check-in no site da companhia">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy || disabled}
              title={disabled ? "Fora da janela de check-in" : "Anexar cartão"}
              className={`h-8 w-8 p-0 ${
                disabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-brand-orange/20 hover:bg-brand-orange text-brand-orange hover:text-white"
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                : disabled ? <Lock className="h-4 w-4" />
                : <FileUp className="h-4 w-4" />}
            </Button>
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
          </>
        )}
      </div>
    </div>
  );
}
