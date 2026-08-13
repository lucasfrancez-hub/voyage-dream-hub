/**
 * Divulgar promoção aérea — mesmo padrão do Command Center dos pacotes:
 * abas WhatsApp / Instagram, texto editável, preview da arte e botão para
 * alterar a arte (foto, logo, campos) abrindo o editor.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Instagram, Loader2, Pencil, Radio, RefreshCw, Send, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/packages/PackageSocialDialog";
import { buildPromoCard, renderPromoCard } from "@/lib/promo-card.functions";
import { listInstagramAccounts, publishInstagramFromUrl } from "@/lib/instagram/queries.functions";
import { listDestinos, enviarPacoteWhatsapp } from "@/lib/broadcast/broadcast.functions";
import { fetchProxiedImage } from "@/lib/image-proxy.functions";
import { enqueuePublish } from "@/lib/publish-queue";
import { promoInstagramText, promoWhatsappText, type PromoRow } from "@/lib/airfare-promo-text";
import type { PromoCardData, PromoCardFormat } from "@/lib/promo-card/card-data";

type Aba = "whatsapp" | "instagram";
type Destino = { id: string; nome: string | null; tipo: string; ativo?: boolean | null };

const SIZES: Record<PromoCardFormat, { w: number; h: number }> = {
  feed: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

function encode(data: PromoCardData) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

export function PromoSocialDialog({
  promo,
  open,
  onOpenChange,
  initialChannel = "whatsapp",
  onEditArt,
}: {
  promo: (PromoRow & { id: string }) | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialChannel?: Aba;
  onEditArt?: () => void;
}) {
  const build = useServerFn(buildPromoCard);
  const render = useServerFn(renderPromoCard);
  const accountsFn = useServerFn(listInstagramAccounts);
  const publish = useServerFn(publishInstagramFromUrl);
  const listDestinosFn = useServerFn(listDestinos);
  const enviarWaFn = useServerFn(enviarPacoteWhatsapp);
  const proxy = useServerFn(fetchProxiedImage);

  const [aba, setAba] = useState<Aba>(initialChannel);
  const [format, setFormat] = useState<PromoCardFormat>("feed");
  const [textoWa, setTextoWa] = useState("");
  const [textoIg, setTextoIg] = useState("");
  const [comLegenda, setComLegenda] = useState(true);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setAba(initialChannel);
  }, [open, initialChannel]);

  useEffect(() => {
    if (!open || !promo) return;
    setTextoWa(promoWhatsappText(promo));
    setTextoIg(promoInstagramText(promo));
  }, [open, promo]);

  useEffect(() => {
    if (!open) return;
    listDestinosFn()
      .then((r) =>
        setDestinos(
          ((r?.destinos ?? []) as Destino[]).filter((d) => d.ativo !== false && d.tipo !== "instagram_story"),
        ),
      )
      .catch(() => setDestinos([]));
  }, [open, listDestinosFn]);

  const cardQuery = useQuery({
    queryKey: ["promo-card", promo?.id],
    queryFn: () => build({ data: { id: promo!.id } }),
    enabled: open && !!promo,
  });
  const card = (cardQuery.data?.card ?? null) as PromoCardData | null;

  const { data: contas = [] } = useQuery({
    queryKey: ["ig-accounts"],
    queryFn: () => accountsFn(),
    enabled: open,
  });
  const contaViaAir = useMemo(
    () =>
      (contas as Array<{ id: string; username: string; is_default: boolean }>).find((c) =>
        /viaair/i.test(c.username),
      ) ?? (contas as Array<{ id: string; is_default: boolean }>).find((c) => c.is_default),
    [contas],
  );

  const size = SIZES[format];
  const scale = (format === "feed" ? 240 : 190) / size.w;
  const previewUrl = card ? `/api/public/promo-card?f=${format}&d=${encode(card)}` : "";

  const canais = destinos.filter((d) => d.tipo === "channel");
  const grupos = destinos.filter((d) => d.tipo !== "channel");

  function toggleDestino(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  /** Renderiza a arte e devolve JPEG base64 (para o WhatsApp). */
  async function arteBase64(f: PromoCardFormat) {
    if (!card) throw new Error("Card ainda carregando");
    const { url } = (await render({ data: { card, format: f } })) as { url: string };
    const image = await proxy({ data: { url } });
    if (!image.ok) throw new Error("Não foi possível baixar a arte gerada");
    const binary = atob(image.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: image.contentType.split(";")[0] || "image/png" });
    const jpeg = await (await import("@/lib/packages/to-jpeg")).blobToJpeg(blob);
    const buf = new Uint8Array(await jpeg.arrayBuffer());
    let bin = "";
    const chunk = 8192;
    for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    return btoa(bin);
  }

  function enviarWhatsapp() {
    if (!promo) return;
    if (selecionados.size === 0) return toast.error("Escolha ao menos um canal ou grupo");
    if (!textoWa.trim()) return toast.error("Escreva o texto antes de enviar");
    const ids = [...selecionados];
    const texto = textoWa.trim();
    const nomes = destinos.filter((d) => selecionados.has(d.id)).map((d) => d.nome ?? "destino");
    const titulo = `${promo.origin_iata} → ${promo.destination_iata}`;

    enqueuePublish({
      channel: "whatsapp",
      label: `WhatsApp — ${titulo}`,
      detail: nomes.join(", "),
      run: async () => {
        const imagem = await arteBase64("feed");
        const res = await enviarWaFn({ data: { destino_ids: ids, texto, imagem_base64: imagem } });
        if (res.falhas.length) {
          return `Enviado para ${res.enviados}. Falhou em: ${res.falhas.map((f) => f.nome).join(", ")}`;
        }
        return `Enviado para ${res.enviados} destino${res.enviados === 1 ? "" : "s"}`;
      },
    });
    toast.success("Adicionado à fila de publicação");
    onOpenChange(false);
  }

  function publicarInstagram() {
    if (!promo) return;
    if (!contaViaAir) return toast.error("Nenhuma conta do Instagram conectada");
    if (!card) return toast.error("Aguarde o card carregar");
    const caption = comLegenda && format === "feed" ? textoIg.trim() : undefined;
    const f = format;
    const titulo = `${promo.origin_iata} → ${promo.destination_iata}`;
    const cardSnapshot = card;

    enqueuePublish({
      channel: "instagram",
      label: `Instagram ${f === "feed" ? "Feed" : "Story"} — ${titulo}`,
      run: async () => {
        const { url } = (await render({ data: { card: cardSnapshot, format: f } })) as { url: string };
        await publish({
          data: {
            account_id: contaViaAir.id,
            media_type: f === "story" ? "story_image" : "feed_image",
            media_url: url,
            caption,
          },
        });
        return "Publicado";
      },
    });
    toast.success("Adicionado à fila de publicação");
    onOpenChange(false);
  }

  const abas: { key: Aba; label: string; icon: React.ReactNode }[] = [
    { key: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon className="h-3.5 w-3.5" /> },
    { key: "instagram", label: "Instagram", icon: <Instagram className="h-3.5 w-3.5" /> },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSelecionados(new Set());
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-brand-orange" />
            Divulgar promoção
          </DialogTitle>
          <DialogDescription className="truncate">
            {promo
              ? `${promo.origin_city ?? promo.origin_iata} → ${promo.destination_city ?? promo.destination_iata}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/30 p-1">
          {abas.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAba(a.key)}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                aba === a.key
                  ? "bg-background text-brand-orange shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>

        {/* Preview da arte */}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div
            className="relative shrink-0 overflow-hidden rounded-lg bg-black"
            style={{ width: size.w * scale, height: size.h * scale }}
          >
            {previewUrl ? (
              <iframe
                key={previewUrl}
                src={previewUrl}
                title="Preview da arte"
                scrolling="no"
                style={{
                  width: size.w,
                  height: size.h,
                  border: 0,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Arte {format === "feed" ? "Feed 4:5" : "Story 9:16"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(["feed", "story"] as PromoCardFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    format === f
                      ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "feed" ? "Feed 4:5" : "Story 9:16"}
                </button>
              ))}
            </div>
            {onEditArt ? (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onEditArt();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-foreground hover:border-brand-orange hover:text-brand-orange"
              >
                <Pencil className="h-3 w-3" /> Alterar arte / foto / logo
              </button>
            ) : null}
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Grupos do WhatsApp recebem a arte com o texto na legenda; canais recebem só o texto com o link.
            </p>
          </div>
        </div>

        {/* WhatsApp */}
        {aba === "whatsapp" && (
          <div className="space-y-4">
            <TextoBloco
              titulo="Texto para WhatsApp"
              valor={textoWa}
              onChange={setTextoWa}
              onRegerar={() => promo && setTextoWa(promoWhatsappText(promo))}
              onCopiar={() => copiar(textoWa)}
            />
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Publicar no WhatsApp
              </p>
              <ListaDestinos titulo="Canais" Icon={Radio} itens={canais} sel={selecionados} onToggle={toggleDestino} />
              <ListaDestinos titulo="Grupos" Icon={Users} itens={grupos} sel={selecionados} onToggle={toggleDestino} />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={enviarWhatsapp}
                  disabled={busy !== null || selecionados.size === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Enviar agora
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Instagram */}
        {aba === "instagram" && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Publicar no Instagram {contaViaAir ? "" : "(conecte uma conta)"}
              </p>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={comLegenda}
                  onChange={(e) => setComLegenda(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#E1306C]"
                />
                Publicar com legenda
                {format === "story" && (
                  <span className="text-[10px] text-muted-foreground">(story vai sempre sem legenda)</span>
                )}
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={publicarInstagram}
                  disabled={busy !== null || !card}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E1306C] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> Publicar agora
                </button>
              </div>
            </div>
            <TextoBloco
              titulo="Legenda do Instagram"
              valor={textoIg}
              onChange={setTextoIg}
              onRegerar={() => promo && setTextoIg(promoInstagramText(promo))}
              onCopiar={() => copiar(textoIg)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TextoBloco({
  titulo,
  valor,
  onChange,
  onRegerar,
  onCopiar,
}: {
  titulo: string;
  valor: string;
  onChange: (v: string) => void;
  onRegerar: () => void;
  onCopiar: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
          {titulo}
          <button
            type="button"
            onClick={onRegerar}
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground hover:border-brand-orange/40 hover:text-brand-orange"
            title="Restaurar o texto padrão"
          >
            <RefreshCw className="h-3 w-3" /> Regerar
          </button>
        </div>
        <button
          type="button"
          onClick={onCopiar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
        >
          <Copy className="h-3 w-3" /> Copiar texto
        </button>
      </div>
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[170px] w-full rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-brand-orange"
        placeholder="Escreva o texto…"
      />
    </div>
  );
}

function ListaDestinos({
  titulo,
  Icon,
  itens,
  sel,
  onToggle,
}: {
  titulo: string;
  Icon: React.ComponentType<{ className?: string }>;
  itens: Destino[];
  sel: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {titulo}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((d) => {
          const on = sel.has(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onToggle(d.id)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                on
                  ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.nome ?? "Sem nome"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
