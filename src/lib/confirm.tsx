import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOpts = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type Pending = ConfirmOpts & { resolve: (v: boolean) => void };

let listener: ((p: Pending) => void) | null = null;

/** Async in-app confirmation. Replaces window.confirm(). */
export function confirm(
  messageOrOpts: string | ConfirmOpts,
  extra?: ConfirmOpts,
): Promise<boolean> {
  const opts: ConfirmOpts =
    typeof messageOrOpts === "string"
      ? { description: messageOrOpts, ...(extra || {}) }
      : messageOrOpts;
  return new Promise<boolean>((resolve) => {
    if (!listener) {
      // Fallback if provider not mounted
      resolve(typeof window !== "undefined" ? window.confirm(opts.description || "Confirmar?") : false);
      return;
    }
    listener({ ...opts, resolve });
  });
}

/** Fire-and-forget confirm: runs onOk if the user confirms. */
export function confirmThen(
  messageOrOpts: string | ConfirmOpts,
  onOk: () => void,
  extra?: ConfirmOpts,
) {
  void confirm(messageOrOpts as any, extra).then((ok) => { if (ok) onOk(); });
}


export function ConfirmProvider() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    listener = (p) => setPending(p);
    return () => {
      listener = null;
    };
  }, []);

  const close = (result: boolean) => {
    if (pending) pending.resolve(result);
    setPending(null);
  };

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.title ?? "Confirmar"}</AlertDialogTitle>
          {pending?.description && (
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {pending?.cancelText ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={pending?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {pending?.confirmText ?? "OK"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
