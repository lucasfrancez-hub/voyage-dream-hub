import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Instagram, Loader2, Send, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/lib/confirm";
import { uploadBroadcastMedia } from "@/lib/broadcast/broadcast.functions";
import { listInstagramAccounts, publishInstagramFromUrl } from "@/lib/instagram/queries.functions";

type Conta = {
  id: string;
  username: string | null;
  display_name: string | null;
  profile_picture_url: string | null;
  active: boolean | null;
  is_default: boolean | null;
};

type Formato = "reels_video" | "feed_image" | "story_video" | "story_image";

const FORMATOS: { key: Exclude<Formato, "story_image">; label: string; hint: string }[] = [
  { key: "reels_video", label: "Reels", hint: "Vídeo 9:16 · até 90s · com legenda" },
  { key: "feed_image", label: "Publicação", hint: "Imagem no feed · com legenda" },
  { key: "story_video", label: "Story", hint: "Vídeo ou imagem · 24h · sem legenda" },
];

export function InstagramPostTab({ embedded = false }: { embedded?: boolean } = {}) {
  const carregarContas = useServerFn(listInstagramAccounts);
  const doUpload = useServerFn(uploadBroadcastMedia);
  const doPublish = useServerFn(publishInstagramFromUrl);

  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<string>("");
  const [formato, setFormato] = useState<Exclude<Formato, "story_image">>("reels_video");
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [mediaTipo, setMediaTipo] = useState<"video" | "image" | null>(null);
  const [mediaNome, setMediaNome] = useState<string>("");
  const [legenda, setLegenda] = useState("");
  const [uploading, setUploading] = useState(false);
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    carregarContas()
      .then((rows) => {
        const ativas = (rows as Conta[]).filter((c) => c.active !== false);
        setContas(ativas);
        const viaair = ativas.find((c) => (c.username ?? "").toLowerCase().includes("viaair"));
        setContaId((prev) => prev || viaair?.id || ativas[0]?.id || "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Falha ao carregar contas"));
  }, [carregarContas]);

  const usaLegenda = formato === "reels_video" || formato === "feed_image";
  const accept = formato === "feed_image" ? "image/*" : formato === "reels_video" ? "video/*" : "video/*,image/*";

  const tipoFinal: Formato = useMemo(() => {
    if (formato === "story_video" && mediaTipo === "image") return "story_image";
    return formato;
  }, [formato, mediaTipo]);

  async function handleFile(file: File) {
    const ehVideo = file.type.startsWith("video/");
    if (formato === "feed_image" && ehVideo) {
      toast.error("Para publicação no feed envie uma imagem");
      return;
    }
    if (formato === "reels_video" && !ehVideo) {
      toast.error("Reels precisa de um vídeo");
      return;
    }
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      const r = await doUpload({
        data: { filename: file.name, contentType: file.type || "application/octet-stream", dataBase64: btoa(bin) },
      });
      setMediaUrl(r.url);
      setMediaTipo(ehVideo ? "video" : "image");
      setMediaNome(file.name);
      toast.success("Arquivo enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function publicar() {
    if (!contaId) return toast.error("Escolha a conta");
    if (!mediaUrl) return toast.error("Envie o arquivo primeiro");
    const conta = contas.find((c) => c.id === contaId);
    const nomeFormato = FORMATOS.find((f) => f.key === formato)?.label ?? "";
    const ok = await confirm({
      title: `Publicar ${nomeFormato} agora?`,
      description: `Será publicado imediatamente em @${conta?.username ?? "conta"}.`,
    });
    if (!ok) return;
    setPublicando(true);
    try {
      const res = await doPublish({
        data: {
          account_id: contaId,
          media_type: tipoFinal,
          media_url: mediaUrl,
          caption: usaLegenda && legenda.trim() ? legenda.trim() : undefined,
        },
      });
      toast.success(res?.permalink ? "Publicado no Instagram!" : "Publicado!");
      setMediaUrl("");
      setMediaTipo(null);
      setMediaNome("");
      setLegenda("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao publicar");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <div className={embedded ? "" : "max-w-3xl space-y-6"}>
      <div className={embedded ? "space-y-5" : "rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5"}>
        {!embedded && (
          <div className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-brand-orange" />
            <h2 className="text-sm font-bold uppercase tracking-tight">Publicar no Instagram</h2>
          </div>
        )}


        {/* Conta */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Conta</p>
          <div className="flex flex-wrap gap-2">
            {contas.map((c) => (
              <button
                key={c.id}
                onClick={() => setContaId(c.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                  contaId === c.id
                    ? "border-brand-orange bg-brand-orange/10 text-foreground"
                    : "border-border hover:border-brand-orange/40 text-muted-foreground"
                }`}
              >
                {c.profile_picture_url ? (
                  <img src={c.profile_picture_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <Instagram className="h-4 w-4" />
                )}
                <span className="font-medium">@{c.username ?? "conta"}</span>
              </button>
            ))}
            {contas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conta conectada.</p>
            )}
          </div>
        </div>

        {/* Formato */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Formato</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMATOS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setFormato(f.key);
                  setMediaUrl("");
                  setMediaTipo(null);
                  setMediaNome("");
                }}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  formato === f.key
                    ? "border-brand-orange bg-brand-orange/10"
                    : "border-border hover:border-brand-orange/40"
                }`}
              >
                <span className="block text-sm font-bold">{f.label}</span>
                <span className="block text-[11px] text-muted-foreground">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Arquivo */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Arquivo</p>
          {mediaUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              {mediaTipo === "video" ? (
                <video src={mediaUrl} className="h-24 w-16 rounded-lg object-cover" muted playsInline controls />
              ) : (
                <img src={mediaUrl} alt="" className="h-24 w-16 rounded-lg object-cover" />
              )}
              <span className="flex-1 truncate text-sm text-muted-foreground">{mediaNome}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setMediaUrl("");
                  setMediaTipo(null);
                  setMediaNome("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:border-brand-orange/60 hover:text-foreground ${
                uploading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Enviando…" : "Escolher arquivo (até 25MB)"}
              <input
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (f) void handleFile(f);
                }}
              />
            </label>
          )}
        </div>

        {/* Legenda */}
        {usaLegenda && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Legenda</p>
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              rows={5}
              maxLength={2200}
              placeholder="Escreva a legenda do post…"
              className="w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-brand-orange"
            />
            <p className="text-right text-[11px] text-muted-foreground tabular-nums">{legenda.length}/2200</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={publicar} disabled={publicando || uploading || !mediaUrl || !contaId} className="gap-2">
            {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {publicando ? "Publicando…" : "Publicar agora"}
          </Button>
        </div>
        {publicando && formato !== "feed_image" && (
          <p className="text-[11px] text-muted-foreground">
            Vídeos podem levar alguns minutos para o Instagram processar. Não feche a página.
          </p>
        )}
      </div>
    </div>
  );
}
