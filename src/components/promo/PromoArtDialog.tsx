/**
 * Preview + edição dos cards aprovados de promoção aérea (Feed 4:5 / Story 9:16).
 * Todos os campos são editáveis antes de gerar a arte; o preview usa o mesmo
 * HTML aprovado renderizado em /api/public/promo-card.
 */
import { cityLabel } from "@/lib/iata-lookup";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Instagram,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Pencil,
  Check,
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

const inputCls =
  "mt-1.5 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand-orange/70 focus:ring-2 focus:ring-brand-orange/20";
const labelCls = "block text-[11px] font-medium text-muted-foreground";

function Field({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      <input
        type={type}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/80">{title}</h3>
      {children}
    </section>
  );
}

export function PromoArtDialog({
  promo,
  onClose,
  onDivulgar,
  startEditing,
  onDone,
}: {
  promo: PromoRow & { id: string };
  onClose: () => void;
  onDivulgar?: (canal: "whatsapp" | "instagram") => void;
  /** abre já no modo de edição */
  startEditing?: boolean;
  /** ao confirmar a edição, volta para a tela de divulgação */
  onDone?: () => void;
}) {
  const build = useServerFn(buildPromoCard);
  const photos = useServerFn(listDestinationPhotos);
  const render = useServerFn(renderPromoCard);
  const accountsFn = useServerFn(listInstagramAccounts);
  const publish = useServerFn(publishInstagramFromUrl);

  const [card, setCard] = useState<PromoCardData | null>(null);
  const [fotos, setFotos] = useState<Array<{ url: string; thumb: string; author: string }>>([]);
  const [format, setFormat] = useState<PromoCardFormat>("feed");
  const [arte, setArte] = useState<Record<PromoCardFormat, string | null>>({ feed: null, story: null });
  const [editando, setEditando] = useState(!!startEditing);


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

  // Persiste as alterações da arte para que a divulgação use a versão editada.
  const qc = useQueryClient();
  const salvarOverrides = useServerFn(savePromoCardOverrides);
  const [salvando, setSalvando] = useState(false);

  async function confirmarEdicao() {
    if (card) {
      setSalvando(true);
      try {
        await salvarOverrides({ data: { id: promo.id, card } });
        qc.setQueryData(["promo-card", promo.id], (old: any) =>
          old ? { ...old, card, editado: true } : old,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar a arte");
        setSalvando(false);
        return;
      }
      setSalvando(false);
    }
    if (onDone) onDone();
    else setEditando(false);
  }

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

  const outroFormato: PromoCardFormat = format === "feed" ? "story" : "feed";
  const copiarLink = async () => {
    let url = arte[format];
    if (!url) {
      try {
        url = ((await render({ data: { card: card!, format } })) as { url: string }).url;
        setArte((a) => ({ ...a, [format]: url }));
      } catch (e) {
        toast.error((e as Error).message);
        return;
      }
    }
    await navigator.clipboard.writeText(url!);
    toast.success("Link da arte copiado");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-2xl">
      <div
        className={`my-6 w-full overflow-hidden rounded-[32px] border border-border/70 bg-card/95 shadow-2xl ${
          editando ? "max-w-5xl" : "max-w-[420px]"
        }`}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-brand-orange/15 p-2">
              <ImageIcon className="h-4 w-4 text-brand-orange" />
            </span>
            <div className="leading-tight">
              <h2 className="text-[11px] font-black uppercase tracking-[0.1em]">Gerar arte</h2>
              <p className="text-[10px] text-muted-foreground">
                {promo.origin_iata} → {promo.destination_iata} •{" "}
                {cityLabel(promo.destination_iata, promo.destination_city)}
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
            {/* Palco do preview — retângulo justo */}
            <div className="flex flex-col">
              <div className="group relative w-full bg-black">
                <div
                  className="relative mx-auto overflow-hidden"
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

                {/* Setinhas discretas para alternar formato */}
                <button
                  type="button"
                  onClick={() => setFormat(outroFormato)}
                  title={outroFormato === "feed" ? "Feed 4:5" : "Story 9:16"}
                  className="absolute left-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 hover:bg-black/60"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setFormat(outroFormato)}
                  title={outroFormato === "feed" ? "Feed 4:5" : "Story 9:16"}
                  className="absolute right-4 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white opacity-0 backdrop-blur-md transition group-hover:opacity-100 hover:bg-black/60"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <span className="absolute left-6 top-6 z-20 rounded-full bg-brand-orange px-3 py-1 text-[9px] font-black tracking-widest text-white">
                  {format === "feed" ? "FEED 4:5" : "STORY 9:16"}
                </span>

                <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
                  {editando && onDone ? (
                    <button
                      type="button"
                      onClick={onDone}
                      className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-5 py-2.5 text-[10px] font-bold text-white shadow-xl transition hover:brightness-110"
                    >
                      <Check className="h-3.5 w-3.5" />
                      OK — VOLTAR PARA DIVULGAR
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditando((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-5 py-2.5 text-[10px] font-bold text-white shadow-xl backdrop-blur-xl transition hover:bg-black"
                    >
                      <Pencil className="h-3.5 w-3.5 text-brand-orange" />
                      {editando ? "FECHAR EDIÇÃO" : "ALTERAR ARTE"}
                    </button>
                  )}
                </div>
              </div>

              {/* Ações — só ícones redondos */}
              <div className="flex flex-col items-center gap-5 px-8 py-7">
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    title="Divulgar no WhatsApp"
                    onClick={() => (onDivulgar ? onDivulgar("whatsapp") : whatsapp.mutate())}
                    disabled={whatsapp.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-[#25D366]/20 bg-[#25D366]/10 text-[#25D366] shadow-lg transition hover:scale-110 hover:bg-[#25D366] hover:text-white active:scale-95 disabled:opacity-60"
                  >
                    {whatsapp.isPending && !onDivulgar ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <MessageCircle className="h-6 w-6" />
                    )}
                  </button>
                  <button
                    type="button"
                    title="Divulgar no Instagram"
                    onClick={() => (onDivulgar ? onDivulgar("instagram") : publicar.mutate())}
                    disabled={publicar.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-[#E1306C]/20 bg-[#E1306C]/10 text-[#E1306C] shadow-lg transition hover:scale-110 hover:bg-[#E1306C] hover:text-white active:scale-95 disabled:opacity-60"
                  >
                    {publicar.isPending && !onDivulgar ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Instagram className="h-6 w-6" />
                    )}
                  </button>

                  <button
                    type="button"
                    title="Copiar link da arte"
                    onClick={copiarLink}
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-foreground/5 text-muted-foreground shadow-lg transition hover:scale-110 hover:bg-foreground/10 hover:text-foreground active:scale-95"
                  >
                    <LinkIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    title={`Gerar e baixar ${format === "feed" ? "Feed 1080×1350" : "Story 1080×1920"}`}
                    onClick={() => gerar.mutate(format)}
                    disabled={gerar.isPending}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange text-white shadow-[0_0_20px_rgba(242,107,31,0.4)] transition hover:scale-110 hover:brightness-110 active:scale-95 disabled:opacity-60"
                  >
                    {gerar.isPending ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Download className="h-6 w-6" />
                    )}
                  </button>
                </div>

                {arte[format] ? (
                  <a
                    href={arte[format]!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary underline"
                  >
                    Abrir PNG {format === "feed" ? "1080×1350" : "1080×1920"}
                  </a>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-brand-orange/50" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Publicação instantânea
                    </span>
                    <span className="h-1 w-1 rounded-full bg-brand-orange/50" />
                  </div>
                )}
              </div>
            </div>


            {/* Campos editáveis */}
            {editando ? (
              <div className="flex max-h-[80vh] flex-col border-l border-border/50 bg-card/60">
                <div className="flex-1 space-y-7 overflow-y-auto p-6">
                  <Section title="Informações da rota">
                    <div className="grid grid-cols-12 gap-3">
                      <Field
                        className="col-span-8"
                        label="Destino principal"
                        value={card.destination}
                        onChange={(v) => set("destination", v.toUpperCase())}
                      />
                      <Field
                        className="col-span-4"
                        label="IATA destino"
                        value={card.destinationIata}
                        onChange={(v) => set("destinationIata", v.toUpperCase())}
                      />
                      <Field
                        className="col-span-6"
                        label="Cidade origem"
                        value={card.origin}
                        onChange={(v) => set("origin", v)}
                      />
                      <Field
                        className="col-span-6"
                        label="Cidade destino"
                        value={card.destinationCity}
                        onChange={(v) => set("destinationCity", v)}
                      />
                      <Field
                        className="col-span-4"
                        label="IATA origem"
                        value={card.originIata}
                        onChange={(v) => set("originIata", v.toUpperCase())}
                      />
                      <label className="col-span-8 block">
                        <span className={labelCls}>Tipo de voo</span>
                        <select
                          value={card.tripType}
                          onChange={(e) => set("tripType", e.target.value as PromoCardData["tripType"])}
                          className={inputCls}
                        >
                          <option value="ida-e-volta">Ida e volta</option>
                          <option value="somente-ida">Somente ida</option>
                        </select>
                      </label>
                    </div>
                  </Section>

                  <Section title="Detalhes da viagem">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Data de ida" value={card.departureDate} onChange={(v) => set("departureDate", v)} />
                      <Field
                        label="Data de volta"
                        value={card.returnDate ?? ""}
                        onChange={(v) => set("returnDate", v || null)}
                      />
                      <Field
                        className="col-span-2"
                        label="Companhia aérea"
                        value={card.airline}
                        onChange={(v) => set("airline", v)}
                      />
                      <Field
                        label="IATA companhia"
                        value={card.airlineIata ?? ""}
                        onChange={(v) => set("airlineIata", v || null)}
                      />
                      <Field label="Bagagem" value={card.baggage} onChange={(v) => set("baggage", v)} />
                      <Field
                        className="col-span-2"
                        label="Logo da companhia (URL)"
                        value={card.airlineLogo ?? ""}
                        onChange={(v) => set("airlineLogo", v || null)}
                      />
                    </div>
                  </Section>

                  <Section title="Preços e tarifas">
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="Tarifa encontrada em"
                        type="date"
                        value={(card.fareFoundAt ?? "").slice(0, 10)}
                        onChange={(v) => set("fareFoundAt", v || null)}
                      />
                      <label className="flex items-end pb-2">
                        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={card.pixOnly}
                            onChange={(e) => set("pixOnly", e.target.checked)}
                            className="h-4 w-4 accent-[var(--brand-orange,#F26B1F)]"
                          />
                          Somente Pix / à vista
                        </span>
                      </label>
                      <div className="col-span-2 grid grid-cols-2 gap-3 rounded-xl border border-brand-orange/20 bg-brand-orange/5 p-4">
                        <Field
                          className="col-span-2"
                          label="Valor total"
                          type="number"
                          value={card.totalPrice}
                          onChange={(v) => set("totalPrice", Number(v))}
                        />
                        <Field
                          label="Parcelas sem juros"
                          type="number"
                          value={card.interestFreeInstallments}
                          onChange={(v) => set("interestFreeInstallments", Math.max(1, Number(v)))}
                        />
                        <Field
                          label="Valor da parcela"
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
                          label="Parcela maior prazo"
                          type="number"
                          value={card.extendedInstallmentValue ?? ""}
                          onChange={(v) => set("extendedInstallmentValue", v ? Number(v) : null)}
                        />
                      </div>
                    </div>
                  </Section>

                  <Section title="Galeria e identidade">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={labelCls}>Fotografia do destino</span>
                        <button
                          type="button"
                          onClick={() => buscarFotos.mutate(card.destinationCity)}
                          disabled={buscarFotos.isPending}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[10px] font-bold uppercase tracking-wide hover:bg-foreground/5"
                        >
                          {buscarFotos.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Buscar fotos reais
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {fotos.map((f) => (
                          <button
                            key={f.url}
                            type="button"
                            onClick={() => set("destinationImage", f.url)}
                            title={f.author}
                            className={`overflow-hidden rounded-lg border-2 transition ${
                              card.destinationImage === f.url
                                ? "border-brand-orange"
                                : "border-transparent opacity-70 hover:opacity-100"
                            }`}
                          >
                            <img src={f.thumb || f.url} alt={f.author} className="aspect-square w-full object-cover" />
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          className="col-span-2"
                          label="URL da foto"
                          value={card.destinationImage ?? ""}
                          onChange={(v) => set("destinationImage", v || null)}
                        />
                        <Field
                          label="Enquadramento"
                          value={card.imagePosition ?? "50% 45%"}
                          onChange={(v) => set("imagePosition", v)}
                        />
                        <label className="block">
                          <span className={labelCls}>Logo da Via Air</span>
                          <select
                            value={card.logoVariant ?? "color"}
                            onChange={(e) => set("logoVariant", e.target.value as PromoLogoVariant)}
                            className={inputCls}
                          >
                            <option value="color">Colorida</option>
                            <option value="white">Branca</option>
                            <option value="black">Preta</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </Section>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border/50 bg-card/80 p-4">
                  <button
                    type="button"
                    onClick={() => (onDone ? onDone() : setEditando(false))}
                    className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    Fechar edição
                  </button>
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={confirmarEdicao}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-orange px-5 py-2 text-xs font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                  >
                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {onDone ? "OK, voltar para divulgar" : "OK"}
                  </button>
                </div>
              </div>
            ) : null}

          </div>
        )}
      </div>
    </div>
  );
}
