import { useEffect, useRef, useState } from "react";
import { Copy, ImageDown, Loader2, RefreshCw, Send, Smartphone, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCurationCopy } from "@/lib/packages/curate.functions";
import { fetchProxiedImage } from "@/lib/image-proxy.functions";
import { publishPackageArtToInstagram } from "@/lib/instagram/queries.functions";
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

type AnyPkg = Record<string, any>;

export function PackageSocialDialog({
  pkg,
  open,
  onOpenChange,
  initialChannel,
}: {
  pkg: AnyPkg | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialChannel?: "whatsapp" | "instagram";
}) {
  const generateFn = useServerFn(generateCurationCopy);
  const fetchImageFn = useServerFn(fetchProxiedImage);
  const [loading, setLoading] = useState<"whatsapp" | "instagram" | "feed" | "story" | null>(null);
  const [output, setOutput] = useState<{ channel: "whatsapp" | "instagram"; text: string } | null>(
    null,
  );
  const [shareFile, setShareFile] = useState<File | null>(null);

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

  async function handleGenerate(channel: "whatsapp" | "instagram") {
    if (!pkg) return;
    setLoading(channel);
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
              services: (pkg.services ?? null) as any,
            },
          ],
          baseUrl,
        },
      });
      setShareFile(await prepareShareFile());
      setOutput({ channel, text: res.text });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar texto");
    } finally {
      setLoading(null);
    }
  }

  async function copyText() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output.text);
      toast.success("Texto copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function copyImage() {
    if (!shareFile) {
      toast.error("Cadastre a URL da imagem de capa antes.");
      return;
    }
    try {
      const pngBlob =
        shareFile.type === "image/png"
          ? shareFile
          : await (async () => {
              const bmp = await createImageBitmap(shareFile);
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

  async function downloadArt(kind: "feed" | "story") {
    if (!pkg?.image_url) {
      toast.error("Cadastre a URL da imagem de capa do pacote antes de gerar a arte.");
      return;
    }
    setLoading(kind);
    try {
      let delivery: "downloaded" | "shared" | "cancelled";
      if (kind === "feed") {
        const { generatePackageFeedArt } = await import("@/lib/packages/feed-art");
        delivery = await generatePackageFeedArt(pkg as any);
      } else {
        const { generatePackageStoryArt } = await import("@/lib/packages/story-art");
        delivery = await generatePackageStoryArt(pkg as any);
      }
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
      setLoading(null);
    }
  }

  const autoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !pkg) return;
    const key = `${pkg.id}:${initialChannel ?? ""}`;
    if (!initialChannel || autoKey.current === key) return;
    autoKey.current = key;
    void handleGenerate(initialChannel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id, initialChannel]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setOutput(null);
          setShareFile(null);
          autoKey.current = null;
        }
      }}
    >

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-brand-orange" />
            Divulgar pacote
          </DialogTitle>
          <DialogDescription className="truncate">{pkg?.title}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
              Gerar texto:
            </span>
            <button
              type="button"
              title="Gerar legenda para WhatsApp"
              onClick={() => handleGenerate("whatsapp")}
              disabled={loading !== null}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366] ring-1 ring-[#25D366]/20 transition-all hover:bg-[#25D366] hover:text-white disabled:opacity-60"
            >
              {loading === "whatsapp" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <WhatsAppIcon />
              )}
            </button>
            <button
              type="button"
              title="Gerar legenda para Instagram"
              onClick={() => handleGenerate("instagram")}
              disabled={loading !== null}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E1306C]/10 text-[#E1306C] ring-1 ring-[#E1306C]/20 transition-all hover:bg-[#E1306C] hover:text-white disabled:opacity-60"
            >
              {loading === "instagram" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <InstagramIcon />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">
              Arte:
            </span>
            <button
              type="button"
              onClick={() => downloadArt("feed")}
              disabled={loading !== null}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:border-brand-orange/40 hover:text-brand-orange disabled:opacity-60"
            >
              {loading === "feed" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ImageDown className="h-3 w-3" />
              )}
              FEED 3:4
            </button>
            <button
              type="button"
              onClick={() => downloadArt("story")}
              disabled={loading !== null}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:border-brand-orange/40 hover:text-brand-orange disabled:opacity-60"
            >
              {loading === "story" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Smartphone className="h-3 w-3" />
              )}
              STORY 9:16
            </button>
          </div>
        </div>

        {output && (
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Texto para {output.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
                <button
                  type="button"
                  onClick={() => handleGenerate(output.channel)}
                  disabled={loading !== null}
                  className="ml-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground hover:border-brand-orange/40 hover:text-brand-orange disabled:opacity-60"
                  title="Regerar com a IA"
                >
                  {loading === output.channel ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Regerar
                </button>
              </div>
              <div className="flex items-center gap-2">
                {shareFile && (
                  <button
                    type="button"
                    onClick={copyImage}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
                    title="Copiar foto do pacote"
                  >
                    <ImageDown className="h-3 w-3" /> Copiar foto
                  </button>
                )}
                <button
                  type="button"
                  onClick={copyText}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground hover:border-brand-orange hover:text-brand-orange"
                >
                  <Copy className="h-3 w-3" /> Copiar texto
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={output.text}
              className="min-h-[200px] w-full rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-foreground"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
