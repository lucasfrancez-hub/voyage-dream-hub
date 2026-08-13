/**
 * Preview + edição dos cards aprovados de promoção aérea (Feed 4:5 / Story 9:16).
 * Todos os campos são editáveis antes de gerar a arte; o preview usa o mesmo
 * HTML aprovado renderizado em /api/public/promo-card.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Image as ImageIcon,
  Instagram,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";

import { toast } from "sonner";
import {
  buildPromoCard,
  listDestinationPhotos,
  renderPromoCard,
} from "@/lib/promo-card.functions";
import { listInstagramAccounts, publishInstagramFromUrl } from "@/lib/instagram/queries.functions";
import type { PromoCardData, PromoCardFormat, PromoLogoVariant } from "@/lib/promo-card/card-data";
import { promoInstagramText, promoWhatsappText, type PromoRow } from "@/lib/airfare-promo-text";

function encode(data: PromoCardData) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

const SIZES: Record<PromoCardFormat, { w: number; h: number }> = {
  feed: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}

export function PromoArtDialog({ promo, onClose }: { promo: PromoRow & { id: string }; onClose: () => void }) {
  const build = useServerFn(buildPromoCard);
  const photos = useServerFn(listDestinationPhotos);
  const render = useServerFn(renderPromoCard);
  const accountsFn = useServerFn(listInstagramAccounts);
  const publish = useServerFn(publishInstagramFromUrl);

  const [card, setCard] = useState<PromoCardData | null>(null);
  const [fotos, setFotos] = useState<Array<{ url: string; thumb: string; author: string }>>([]);
  const [format, setFormat] = useState<PromoCardFormat>("feed");
  const [arte, setArte] = useState<Record<PromoCardFormat, string | null>>({ feed: null, story: null });
  const [editando, setEditando] = useState(false);


  const inicial = useQuery({
    queryKey: ["promo-card", promo.id],
    queryFn: () => build({ data: { id: promo.id } }),
  });

  useEffect(() => {
    if (inicial.data && !card) {
      setCard(inicial.data.card as PromoCardData);
      setFotos(inicial.data.fotos as never);
    }
  }, [inicial.data, card]);

  const { data: contas = [] } = useQuery({ queryKey: ["ig-accounts"], queryFn: () => accountsFn() });
  const contaViaAir = useMemo(
    () =>
      (contas as Array<{ id: string; username: string; is_default: boolean }>).find((c) =>
        /viaair/i.test(c.username),
      ) ?? (contas as Array<{ id: string; is_default: boolean }>).find((c) => c.is_default),
    [contas],
  );

  const set = <K extends keyof PromoCardData>(k: K, v: PromoCardData[K]) =>
    setCard((c) => (c ? { ...c, [k]: v } : c));

  const previewUrl = card ? `/api/public/promo-card?f=${format}&d=${encode(card)}` : "";
  const size = SIZES[format];
  const scale = format === "feed" ? 380 / size.w : 320 / size.w;

  const gerar = useMutation({
    mutationFn: async (f: PromoCardFormat) => {
      if (!card) throw new Error("Sem dados");
      return (await render({ data: { card, format: f } })) as { url: string };
    },
    onSuccess: (r, f) => {
      setArte((a) => ({ ...a, [f]: r.url }));
      toast.success(`Arte ${f === "feed" ? "Feed" : "Story"} gerada`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publicar = useMutation({
    mutationFn: async () => {
      if (!contaViaAir) throw new Error("Nenhuma conta do Instagram conectada");
      let url = arte[format];
      if (!url) url = ((await render({ data: { card: card!, format } })) as { url: string }).url;
      setArte((a) => ({ ...a, [format]: url }));
      return await publish({
        data: {
          account_id: contaViaAir.id,
          media_type: format === "story" ? "story_image" : "feed_image",
          media_url: url!,
          caption: promoInstagramText(promo),
        },
      });
    },
    onSuccess: () => toast.success("Publicado no Instagram"),
    onError: (e: Error) => toast.error(e.message),
  });

  const whatsapp = useMutation({
    mutationFn: async () => {
      let url = arte.feed;
      if (!url) url = ((await render({ data: { card: card!, format: "feed" } })) as { url: string }).url;
      setArte((a) => ({ ...a, feed: url }));
      return url!;
    },
    onSuccess: (url) => {
      const texto = `${promoWhatsappText(promo)}\n\n${url}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const buscarFotos = useMutation({
    mutationFn: (q: string) => photos({ data: { query: q } }),
    onSuccess: (r) => setFotos(r as never),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-2xl">
      <div className="my-6 w-full max-w-6xl overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-orange/10 p-2.5">
              <ImageIcon className="h-5 w-5 text-brand-orange" />
            </span>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">Gerar arte de promoção</h2>
              <p className="text-[11px] text-muted-foreground">
                {promo.origin_city ?? promo.origin_iata} → {promo.destination_city ?? promo.destination_iata} •{" "}
                {promo.origin_iata}–{promo.destination_iata}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-foreground/5">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {!card ? (
          <p className="py-24 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Montando o card…
          </p>
        ) : (
          <div className={`grid ${editando ? "lg:grid-cols-[1fr_400px]" : "grid-cols-1"}`}>
            {/* Palco do preview */}
            <div className="flex flex-col items-center gap-6 bg-background/60 p-8">
              <div className="flex w-full max-w-[460px] items-center justify-between gap-3">
                <div className="flex rounded-xl border border-border/60 bg-card/60 p-1">
                  {(["feed", "story"] as PromoCardFormat[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                        format === f ? "bg-brand-orange text-white shadow-lg shadow-brand-orange/20" : "text-muted-foreground"
                      }`}
                    >
                      {f === "feed" ? "Feed 4:5" : "Story 9:16"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setEditando((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                    editando
                      ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                      : "border-border/60 hover:bg-foreground/5"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5 text-brand-orange" />
                  {editando ? "Fechar edição" : "Alterar"}
                </button>
              </div>

              <div
                className="overflow-hidden rounded-2xl border border-border/60 bg-black shadow-[0_40px_100px_rgba(0,0,0,0.5)]"
                style={{ width: size.w * scale, height: size.h * scale }}
              >
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  title="Preview do card"
                  scrolling="no"
                  style={{
                    width: size.w,
                    height: size.h,
                    border: 0,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                />
              </div>

              <div className="flex w-full max-w-[520px] flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => gerar.mutate("feed")}
                  disabled={gerar.isPending}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-xs font-bold hover:bg-foreground/5 disabled:opacity-50"
                >
                  {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  Gerar Feed
                </button>
                <button
                  type="button"
                  onClick={() => gerar.mutate("story")}
                  disabled={gerar.isPending}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-xs font-bold hover:bg-foreground/5 disabled:opacity-50"
                >
                  <ImageIcon className="h-4 w-4" /> Gerar Story
                </button>
                <button
                  type="button"
                  onClick={() => publicar.mutate()}
                  disabled={publicar.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-orange/20 disabled:opacity-60"
                >
                  {publicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
                  Publicar Instagram
                </button>
                <button
                  type="button"
                  onClick={() => whatsapp.mutate()}
                  disabled={whatsapp.isPending}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-xs font-bold hover:bg-foreground/5 disabled:opacity-50"
                >
                  {whatsapp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  Enviar WhatsApp
                </button>
              </div>
              {arte[format] ? (
                <a
                  href={arte[format]!}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-primary underline"
                >
                  Abrir PNG {format === "feed" ? "1080×1350" : "1080×1920"}
                </a>
              ) : null}
            </div>

            {/* Campos editáveis */}
            {editando ? (
            <div className="max-h-[80vh] space-y-4 overflow-y-auto border-l border-border/50 bg-card/60 p-5">

              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Destino (grande)" value={card.destination} onChange={(v) => set("destination", v.toUpperCase())} />
                <Field label="Cidade origem" value={card.origin} onChange={(v) => set("origin", v)} />
                <Field label="Cidade destino" value={card.destinationCity} onChange={(v) => set("destinationCity", v)} />
                <Field label="IATA origem" value={card.originIata} onChange={(v) => set("originIata", v.toUpperCase())} />
                <Field label="IATA destino" value={card.destinationIata} onChange={(v) => set("destinationIata", v.toUpperCase())} />
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipo</span>
                  <select
                    value={card.tripType}
                    onChange={(e) => set("tripType", e.target.value as PromoCardData["tripType"])}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-sm"
                  >
                    <option value="ida-e-volta">Ida e volta</option>
                    <option value="somente-ida">Somente ida</option>
                  </select>
                </label>
                <Field label="Ida" value={card.departureDate} onChange={(v) => set("departureDate", v)} />
                <Field label="Volta" value={card.returnDate ?? ""} onChange={(v) => set("returnDate", v || null)} />
                <Field label="Companhia" value={card.airline} onChange={(v) => set("airline", v)} />
                <Field label="IATA companhia" value={card.airlineIata ?? ""} onChange={(v) => set("airlineIata", v || null)} />
                <Field label="Logo companhia (URL)" value={card.airlineLogo ?? ""} onChange={(v) => set("airlineLogo", v || null)} />
                <Field label="Bagagem" value={card.baggage} onChange={(v) => set("baggage", v)} />
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Logo da Via Air
                  </span>
                  <select
                    value={card.logoVariant ?? "color"}
                    onChange={(e) => set("logoVariant", e.target.value as PromoLogoVariant)}
                    className="mt-1 w-full rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-sm"
                  >
                    <option value="color">Colorida</option>
                    <option value="white">Branca</option>
                    <option value="black">Preta</option>
                  </select>
                </label>
                <Field
                  label="Tarifa encontrada em"
                  type="date"
                  value={(card.fareFoundAt ?? "").slice(0, 10)}
                  onChange={(v) => set("fareFoundAt", v || null)}
                />
                <Field label="Valor total" type="number" value={card.totalPrice} onChange={(v) => set("totalPrice", Number(v))} />
                <Field
                  label="Parcelas sem juros"
                  type="number"
                  value={card.interestFreeInstallments}
                  onChange={(v) => set("interestFreeInstallments", Math.max(1, Number(v)))}
                />
                <Field
                  label="Valor parcela sem juros"
                  type="number"
                  value={card.interestFreeInstallmentValue}
                  onChange={(v) => set("interestFreeInstallmentValue", Number(v))}
                />
                <Field
                  label="Maior parcelamento"
                  type="number"
                  value={card.extendedInstallments ?? ""}
                  onChange={(v) => set("extendedInstallments", v ? Number(v) : null)}
                />
                <Field
                  label="Valor parcela maior prazo"
                  type="number"
                  value={card.extendedInstallmentValue ?? ""}
                  onChange={(v) => set("extendedInstallmentValue", v ? Number(v) : null)}
                />
                <label className="flex items-end gap-2 pb-1 text-xs font-semibold text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={card.pixOnly}
                    onChange={(e) => set("pixOnly", e.target.checked)}
                  />
                  Somente Pix / à vista
                </label>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Fotografia do destino
                  </span>
                  <button
                    type="button"
                    onClick={() => buscarFotos.mutate(card.destinationCity)}
                    disabled={buscarFotos.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-bold hover:bg-foreground/5"
                  >
                    {buscarFotos.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Buscar fotos reais
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {fotos.map((f) => (
                    <button
                      key={f.url}
                      type="button"
                      onClick={() => set("destinationImage", f.url)}
                      title={f.author}
                      className={`overflow-hidden rounded-lg border ${
                        card.destinationImage === f.url ? "border-brand-orange" : "border-border/50"
                      }`}
                    >
                      <img src={f.thumb || f.url} alt={f.author} className="h-16 w-full object-cover" />
                    </button>
                  ))}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field
                    label="URL da foto"
                    value={card.destinationImage ?? ""}
                    onChange={(v) => set("destinationImage", v || null)}
                  />
                  <Field
                    label="Enquadramento (object-position)"
                    value={card.imagePosition ?? "50% 45%"}
                    onChange={(v) => set("imagePosition", v)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
