import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plug, PlugZap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  conectarCompreFacil,
  statusConexaoCompreFacil,
} from "@/lib/comprefacil/conexao.functions";

type Estado = {
  conectado: boolean;
  expiraEm: string | null;
  agenciaId: string | null;
};

/**
 * Mostra se a sessão da CompreFácil está ativa e permite reconectar.
 * Enquanto a tela estiver aberta, revalida a cada minuto e reconecta sozinho
 * quando a sessão cai (o código 2FA é lido automaticamente no servidor).
 */
export function ConexaoCompreFacil() {
  const status = useServerFn(statusConexaoCompreFacil);
  const conectar = useServerFn(conectarCompreFacil);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const autoTentado = useRef(false);

  async function verificar(): Promise<Estado | null> {
    try {
      const r = (await status()) as Estado;
      setEstado(r);
      return r;
    } catch {
      return null;
    } finally {
      setCarregando(false);
    }
  }

  async function reconectar(manual: boolean) {
    setConectando(true);
    try {
      const r = (await conectar()) as Estado & { ok: boolean; mensagem: string | null };
      setEstado({ conectado: r.conectado, expiraEm: r.expiraEm, agenciaId: r.agenciaId });
      if (r.ok) {
        if (manual) toast.success("Conectado na CompreFácil.");
      } else {
        toast.error(r.mensagem ?? "Não foi possível conectar na CompreFácil.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conectar na CompreFácil.");
    } finally {
      setConectando(false);
    }
  }

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await verificar();
      if (!vivo) return;
      // reconexão automática silenciosa quando a sessão não está ativa
      if (r && !r.conectado && !autoTentado.current) {
        autoTentado.current = true;
        void reconectar(false);
      }
    })();
    const t = setInterval(() => {
      void (async () => {
        const r = await verificar();
        if (r && !r.conectado && !conectando) void reconectar(false);
      })();
    }, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conectado = Boolean(estado?.conectado);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className={
          conectado
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }
      >
        {carregando || conectando ? (
          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
        ) : conectado ? (
          <PlugZap className="mr-1.5 h-3 w-3" />
        ) : (
          <Plug className="mr-1.5 h-3 w-3" />
        )}
        {conectando
          ? "Conectando…"
          : conectado
            ? "CompreFácil conectada"
            : "CompreFácil desconectada"}
      </Badge>
      {estado?.expiraEm && conectado ? (
        <span className="text-xs text-muted-foreground">
          sessão até {new Date(estado.expiraEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant={conectado ? "outline" : "default"}
        onClick={() => void reconectar(true)}
        disabled={conectando}
      >
        {conectando ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-1.5 h-4 w-4" />
        )}
        {conectado ? "Reconectar" : "Conectar"}
      </Button>
    </div>
  );
}
