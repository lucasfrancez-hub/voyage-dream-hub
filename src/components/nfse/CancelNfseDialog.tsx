import { useEffect, useState } from "react";
import { XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (justificativa: string) => void;
  numero?: string | number | null;
  loading?: boolean;
}

export function CancelNfseDialog({ open, onOpenChange, onConfirm, numero, loading }: Props) {
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);

  const trimmed = text.trim();
  const remaining = Math.max(0, 15 - trimmed.length);
  const valid = trimmed.length >= 15;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <DialogTitle>Cancelar NFS-e{numero ? ` #${numero}` : ""}</DialogTitle>
              <DialogDescription>Informe a justificativa (mínimo 15 caracteres).</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: discriminação incorreta do serviço prestado"
            rows={4}
            className="resize-none"
          />
          <div className="flex justify-between text-xs">
            <span className={valid ? "text-emerald-500" : "text-muted-foreground"}>
              {valid ? "✓ Justificativa válida" : `Faltam ${remaining} caracteres`}
            </span>
            <span className="text-muted-foreground">{trimmed.length} caracteres</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!valid || loading}
            onClick={() => onConfirm(trimmed)}
          >
            {loading ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
