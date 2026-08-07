import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ImageDown,
  Loader2,
  RefreshCw,
  Radio,
  Send,
  Smartphone,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCurationCopy } from "@/lib/packages/curate.functions";
import { fetchProxiedImage } from "@/lib/image-proxy.functions";
import { publishPackageArtToInstagram } from "@/lib/instagram/queries.functions";
import { listDestinos, enviarPacoteWhatsapp } from "@/lib/broadcast/broadcast.functions";
import { confirm } from "@/lib/confirm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412 0 6.556-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.29-4.143c1.589.943 3.385 1.44 5.217 1.441 5.485 0 9.95-4.466 9.95-9.95 0-2.657-1.034-5.155-2.91-7.031s-4.375-2.91-7.031-2.91c-5.485 0-9.95 4.466-9.95 9.951 0 1.913.546 3.782 1.582 5.39l-1.04 3.797 3.892-1.021zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPkg = Record<string, any>;
type Aba = "whatsapp" | "instagram" | "arte";
type Destino = { id: string; nome: string | null; tipo: string; ativo?: boolean | null };

async function blobToBase64(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < buffer.length; i += chunk) binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  return btoa(binary);
}

export function PackageSocialDialog({
  pkg,
  open,
  onOpenChange,
  initialChannel,
}: {
  pkg: AnyPkg | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialChannel?: Aba;
}) {
  const generateFn = useServerFn(generateCurationCopy);
  const fetchImageFn = useServerFn(fetchProxiedImage);
  const publishArtFn = useServerFn(publishPackageArtToInstagram);
  const listDestinosFn = useServerFn(listDestinos);
  const enviarWaFn = useServerFn(enviarPacoteWhatsapp);

  const [aba, setAba] = useState<Aba>(initialChannel ?? "whatsapp");
  const [busy, setBusy] = useState<string | null>(null);

  // Textos por canal (editáveis)
  const [textoWa, setTextoWa] = useState("");
  const [textoIg, setTextoIg] = useState("");
  const [shareFile, setShareFile] = useState<File | null>(null);

  // WhatsApp
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Instagram
  const [formatoIg, setFormatoIg] = useState<"feed" | "story">("feed");
  const [comLegenda, setComLegenda] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAba(initialChannel ?? "whatsapp");
  }, [open, initialChannel]);

  useEffect(() => {
    if (!open) return;
    listDestinosFn()
      .then((r) => setDestinos(((r?.destinos ?? []) as Destino[]).filter((d) => d.ativo !== false && d.tipo !== "instagram_story")))
      .catch(() => setDestinos([]));
  }, [open, listDestinosFn]);

  async function prepareShareFile() {
    if (!pkg?.image_url) return null;
    try {
      const image = await fetchImageFn({ data: { url: pkg.image_url } });
      if (!image.ok) return null;
      const mime = image.contentType.split(";")[0] || "image/jpeg";
      const binary = atob(image.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const extension = mime === "image/jpeg" ? "jpg" : (mime.split("/")[1] || "jpg").split("+")[0];
      return new File([bytes], `${pkg.slug}.${extension}`, { type: mime });
    } catch {
      return null;
    }
  }

  async function gerarTexto(channel: "whatsapp" | "instagram") {
    if (!pkg) return;
    setBusy(`gerar-${channel}`);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await generateFn({
        data: {
          channel,
          groupTitle: pkg.title,
          groupReason: pkg.destination ?? "",
          packageId: pkg.id,
          packages: [
            {
              title: pkg.title,
              destination: pkg.destination,
              origin: pkg.origin ?? null,
              going_date: pkg.going_date ?? null,
              return_date: pkg.return_date ?? null,
              nights: pkg.nights ?? null,
              price_per_person: Number(pkg.price_per_person) || 0,
              base_occupancy: pkg.base_occupancy ?? 2,
              hotel_name: pkg.hotel_name ?? null,
              hotel_stars: pkg.hotel_stars ?? null,
              meal_plan: pkg.meal_plan ?? null,
              slug: pkg.slug,
              supplier_name: pkg.supplier_name ?? null,
              flexible_dates: !!pkg.flexible_dates,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              services: (pkg.services ?? null) as any,
            },
          ],
          baseUrl,
        },
      });
      if (channel === "whatsapp") {
        setTextoWa(res.text);
        setShareFile(await prepareShareFile());
      } else {
        setTextoIg(res.text);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar texto");
    } finally {
      setBusy(null);
    }
  }

  // Gera o texto automaticamente na primeira abertura de cada aba
  const autoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !pkg || aba === "arte") return;
    const key = `${pkg.id}:${aba}`;
    if (autoKey.current === key) return;
    const jaTem = aba === "whatsapp" ? textoWa : textoIg;
    if (jaTem) return;
    autoKey.current = key;
    void gerarTexto(aba);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id, aba]);

  async function copiarTexto(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function copiarFoto() {
    const file = shareFile ?? (await prepareShareFile());
    if (!file) {
      toast.error("Cadastre a URL da imagem de capa antes.");
      return;
    }
    setShareFile(file);
    try {
      const pngBlob =
        file.type === "image/png"
          ? file
          : await (async () => {
              const bmp = await createImageBitmap(file);
              const canvas = document.createElement("canvas");
              canvas.width = bmp.width;
              canvas.height = bmp.height;
              canvas.getContext("2d")!.drawImage(bmp, 0, 0);
              return await new Promise<Blob>((resolve, reject) =>
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
              );
            })();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      toast.success("Foto copiada — cole (Cmd/Ctrl+V) no chat");
    } catch {
      toast.error("Não foi possível copiar a foto");
    }
  }

  async function baixarArte(kind: "feed" | "story") {
    if (!pkg?.image_url) {
      toast.error("Cadastre a URL da imagem de capa do pacote antes de gerar a arte.");
      return;
    }
    setBusy(`baixar-${kind}`);
    try {
      const delivery =
        kind === "feed"
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (await import("@/lib/packages/feed-art")).generatePackageFeedArt(pkg as any)
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (await import("@/lib/packages/story-art")).generatePackageStoryArt(pkg as any);
      toast.success(
        delivery === "shared"
          ? "Arte pronta para salvar ou compartilhar!"
          : delivery === "cancelled"
            ? "Compartilhamento cancelado."
            : kind === "feed"
              ? "Arte Feed (3:4) baixada!"
              : "Arte Story (9:16) baixada!",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar a arte");
    } finally {
      setBusy(null);
    }
  }

  /** Gera a arte do formato pedido e devolve JPEG em base64. */
  async function arteBase64(kind: "feed" | "story") {
    const blob =
      kind === "feed"
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (await import("@/lib/packages/feed-art")).renderPackageFeedArtBlob(pkg as any)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (await import("@/lib/packages/story-art")).renderPackageStoryArtBlob(pkg as any);
    return await blobToBase64(await (await import("@/lib/packages/to-jpeg")).blobToJpeg(blob));
  }

  async function enviarWhatsapp() {
    if (!pkg) return;
    if (selecionados.size === 0) {
      toast.error("Escolha ao menos um canal ou grupo");
      return;
    }
    if (!textoWa.trim()) {
      toast.error("Gere ou escreva o texto antes de enviar");
      return;
    }
    const nomes = destinos.filter((d) => selecionados.has(d.id)).map((d) => d.nome ?? "destino");
    const ok = await confirm({
      title: "Enviar no WhatsApp agora?",
      description: `A arte (feed 1080×1440) e o texto vão para: ${nomes.join(", ")}. Canais recebem só o texto com o link.`,
      confirmText: "Enviar agora",
    });
    if (!ok) return;

    setBusy("enviar-wa");
    try {
      const imagem = pkg.image_url ? await arteBase64("feed") : null;
      const res = await enviarWaFn({
        data: {
          destino_ids: [...selecionados],
          texto: textoWa.trim(),
          slug: typeof pkg.slug === "string" ? pkg.slug : undefined,
          imagem_base64: imagem,
        },
      });
      if (res.falhas.length) {
        toast.warning(`Enviado para ${res.enviados}. Falhou em: ${res.falhas.map((f) => f.nome).join(", ")}`);
      } else {
        toast.success(`Enviado para ${res.enviados} destino${res.enviados === 1 ? "" : "s"}!`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar no WhatsApp");
    } finally {
      setBusy(null);
    }
  }

  async function publicarInstagram() {
    if (!pkg?.image_url) {
      toast.error("Cadastre a URL da imagem de capa do pacote antes de publicar.");
      return;
    }
    const caption = comLegenda ? textoIg.trim() : undefined;
    if (comLegenda && !caption) {
      toast.error("Escreva ou gere a legenda antes de publicar.");
      return;
    }
    const ok = await confirm({
      title: formatoIg === "feed" ? "Publicar no feed?" : "Publicar no story?",
      description:
        formatoIg === "feed"
          ? `A arte 3:4 será publicada agora no feed do Instagram da VIA AIR${caption ? " com a legenda abaixo" : " sem legenda"}.`
          : "A arte 9:16 será publicada agora nos stories do Instagram da VIA AIR.",
      confirmText: "Publicar agora",
    });
    if (!ok) return;

    setBusy("publicar-ig");
    try {
      const res = await publishArtFn({
        data: {
          media_type: formatoIg === "feed" ? "feed_image" : "story_image",
          image_base64: await arteBase64(formatoIg),
          caption: formatoIg === "feed" ? caption : undefined,
          package_id: typeof pkg.id === "string" ? pkg.id : undefined,
          slug: typeof pkg.slug === "string" ? pkg.slug : undefined,
        },
      });
      toast.success(formatoIg === "feed" ? "Publicado no feed!" : "Publicado nos stories!", {
        action: res.permalink
          ? { label: "Ver post", onClick: () => window.open(res.permalink!, "_blank") }
          : undefined,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao publicar no Instagram");
    } finally {
      setBusy(null);
    }
  }

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

  const abas: { key: Aba; label: string; icon: React.ReactNode }[] = [
    { key: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon className="h-3.5 w-3.5" /> },
    { key: "instagram", label: "Instagram", icon: <InstagramIcon className="h-3.5 w-3.5" /> },
    { key: "arte", label: "Arte", icon: <Download className="h-3.5 w-3.5" /> },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setTextoWa("");
          setTextoIg("");
          setShareFile(null);
          setSelecionados(new Set());
          autoKey.current = null;
        }
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-brand-orange" />
            Divulgar pacote
          </DialogTitle>
          <DialogDescription className="truncate">{pkg?.title}</DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/30 p-1">
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

        {/* ── WhatsApp ── */}
        {aba === "whatsapp" && (
          <div className="space-y-4">
            <TextoBloco
              titulo="Texto para WhatsApp"
              valor={textoWa}
              onChange={setTextoWa}
              gerando={busy === "gerar-whatsapp"}
              onRegerar={() => gerarTexto("whatsapp")}
              onCopiarTexto={() => copiarTexto(textoWa)}
              onCopiarFoto={copiarFoto}
            />

            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Publicar no WhatsApp
              </p>
              <ListaDestinos titulo="Canais" Icon={Radio} itens={canais} sel={selecionados} onToggle={toggleDestino} />
              <ListaDestinos titulo="Grupos" Icon={Users} itens={grupos} sel={selecionados} onToggle={toggleDestino} />
              <p className="text-[10px] text-muted-foreground">
                Grupos recebem a arte de feed (1080×1440) com o texto na legenda. Canais recebem só o texto com o link.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={enviarWhatsapp}
                  disabled={busy !== null || selecionados.size === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "enviar-wa" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar agora
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Instagram ── */}
        {aba === "instagram" && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Publicar no Instagram
              </p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "feed" as const, label: "Feed", hint: "Arte 3:4" },
                  { key: "story" as const, label: "Story", hint: "Arte 9:16" },
                ]).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFormatoIg(f.key)}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      formatoIg === f.key ? "border-[#E1306C] bg-[#E1306C]/10" : "border-border hover:border-[#E1306C]/40"
                    }`}
                  >
                    <span className="block text-xs font-bold">{f.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{f.hint}</span>
                  </button>
                ))}
                <div
                  className="rounded-xl border border-dashed border-border px-3 py-2 text-left opacity-60"
                  title="Reels precisa de vídeo — use Disparos › Nova campanha › Instagram"
                >
                  <span className="block text-xs font-bold">Reels</span>
                  <span className="block text-[10px] text-muted-foreground">Precisa de vídeo</span>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={comLegenda}
                  onChange={(e) => setComLegenda(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#E1306C]"
                />
                Publicar com legenda
                {formatoIg === "story" && (
                  <span className="text-[10px] text-muted-foreground">(story vai sempre sem legenda)</span>
                )}
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={publicarInstagram}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#E1306C] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "publicar-ig" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Publicar agora
                </button>
              </div>
            </div>

            <TextoBloco
              titulo="Legenda do Instagram"
              valor={textoIg}
              onChange={setTextoIg}
              gerando={busy === "gerar-instagram"}
              onRegerar={() => gerarTexto("instagram")}
              onCopiarTexto={() => copiarTexto(textoIg)}
            />
          </div>
        )}

        {/* ── Arte ── */}
        {aba === "arte" && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Baixar arte</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => baixarArte("feed")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] font-bold text-foreground hover:border-brand-orange hover:text-brand-orange disabled:opacity-60"
              >
                {busy === "baixar-feed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageDown className="h-3.5 w-3.5" />}
                FEED 3:4
              </button>
              <button
                type="button"
                onClick={() => baixarArte("story")}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] font-bold text-foreground hover:border-brand-orange hover:text-brand-orange disabled:opacity-60"
              >
                {busy === "baixar-story" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                STORY 9:16
              </button>
              <button
                type="button"
                onClick={copiarFoto}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] font-bold text-foreground hover:border-brand-orange hover:text-brand-orange"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar foto
              </button>
            </div>
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
  gerando,
  onRegerar,
  onCopiarTexto,
  onCopiarFoto,
}: {
  titulo: string;
  valor: string;
  onChange: (v: string) => void;
  gerando: boolean;
  onRegerar: () => void;
  onCopiarTexto: () => void;
  onCopiarFoto?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
          {titulo}
          <button
            type="button"
            onClick={onRegerar}
            disabled={gerando}
            className="ml-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground hover:border-brand-orange/40 hover:text-brand-orange disabled:opacity-60"
            title="Gerar de novo com a IA"
          >
            {gerando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Regerar
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onCopiarFoto && (
            <button
              type="button"
              onClick={onCopiarFoto}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
            >
              <ImageDown className="h-3 w-3" /> Copiar foto
            </button>
          )}
          <button
            type="button"
            onClick={onCopiarTexto}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
          >
            <Copy className="h-3 w-3" /> Copiar texto
          </button>
        </div>
      </div>
      <textarea
        value={gerando && !valor ? "Gerando com a IA…" : valor}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[180px] w-full rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-brand-orange"
        placeholder="Escreva ou gere o texto com a IA…"
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
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                on
                  ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]"
                  : "border-border text-muted-foreground hover:border-[#25D366]/40"
              }`}
            >
              {on && <Check className="h-3 w-3" />}
              {d.nome ?? "sem nome"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
