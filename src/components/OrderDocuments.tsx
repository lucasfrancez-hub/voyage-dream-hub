import { useEffect, useRef, useState } from "react";
import { Paperclip, Upload, Trash2, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type FileEntry = { name: string; path: string; size?: number; created_at?: string };

export function OrderDocuments({ orderId, canManage = false }: { orderId: string; canManage?: boolean }) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data, error } = await supabase.storage
      .from("order-documents")
      .list(orderId, { sortBy: { column: "created_at", order: "desc" }, limit: 100 });
    if (error) {
      setFiles([]);
      return;
    }
    setFiles(
      (data ?? [])
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => ({
          name: f.name,
          path: `${orderId}/${f.name}`,
          size: (f.metadata as { size?: number } | null)?.size,
          created_at: f.created_at ?? undefined,
        })),
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${orderId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage
          .from("order-documents")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw error;
      }
      toast.success("Arquivo(s) anexado(s)");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDownload(path: string, name: string) {
    const { data, error } = await supabase.storage
      .from("order-documents")
      .createSignedUrl(path, 60, { download: name });
    if (error || !data) {
      toast.error(error?.message ?? "Não foi possível gerar link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function onDelete(path: string) {
    if (!window.confirm("Remover este arquivo?")) return;
    const { error } = await supabase.storage.from("order-documents").remove([path]);
    if (error) toast.error(error.message);
    else {
      toast.success("Arquivo removido");
      await load();
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-brand-orange" />
          Vouchers e contratos
          {files && <span className="text-xs text-muted-foreground font-normal">({files.length})</span>}
        </div>
        {canManage && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-orange/50 text-brand-orange px-3 py-1.5 text-xs font-semibold hover:bg-brand-orange/10 transition disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Enviando…" : "Anexar arquivo"}
            </button>
          </>
        )}
      </div>

      {files === null ? (
        <div className="mt-3 text-xs text-muted-foreground">Carregando…</div>
      ) : files.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">
          {canManage ? "Nenhum arquivo anexado ainda." : "Nenhum documento disponível."}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li
              key={f.path}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 text-brand-orange shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name.replace(/^\d+-/, "")}</div>
                <div className="text-[10px] text-muted-foreground">
                  {f.size ? `${Math.round(f.size / 1024)} KB` : ""}
                  {f.created_at ? ` · ${new Date(f.created_at).toLocaleString("pt-BR")}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDownload(f.path, f.name.replace(/^\d+-/, ""))}
                className="inline-flex items-center gap-1 text-xs text-brand-orange hover:opacity-80"
                title="Baixar"
              >
                <Download className="h-3.5 w-3.5" /> Baixar
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onDelete(f.path)}
                  className="inline-flex items-center gap-1 text-xs text-destructive hover:opacity-80"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
