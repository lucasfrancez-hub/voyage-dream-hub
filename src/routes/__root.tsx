import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/lib/confirm";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

const STALE_CODE_PATTERNS = [
  "Invalid server function ID",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
];

function isStaleCodeError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  return STALE_CODE_PATTERNS.some((p) => msg.includes(p));
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [autoRecovering, setAutoRecovering] = useState(false);

  const atualizarAplicativo = async () => {
    if (typeof window === "undefined") return;
    if ("caches" in window) {
      const nomes = await window.caches.keys().catch(() => []);
      await Promise.all(nomes.map((nome) => window.caches.delete(nome)));
    }
    const url = new URL(window.location.href);
    url.searchParams.set("atualizar", Date.now().toString());
    window.location.replace(url.toString());
  };

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });

    // Auto-recover from stale-code / stale-chunk errors (e.g. old tab after a deploy).
    // Only try once per session to avoid infinite reload loops.
    if (typeof window === "undefined") return;
    if (!isStaleCodeError(error)) return;
    const key = "__viaair_stale_reload__";
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // sessionStorage may be unavailable; skip auto-reload rather than loop.
      return;
    }
    setAutoRecovering(true);
    const t = setTimeout(() => {
      window.location.reload();
    }, 300);
    return () => clearTimeout(t);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {autoRecovering ? "Atualizando…" : "Não foi possível abrir esta página"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {autoRecovering
            ? "Detectamos uma versão desatualizada e estamos atualizando pra você."
            : "O aplicativo pode estar com uma versão antiga salva. Atualize para carregar a versão mais recente."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => void atualizarAplicativo()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Atualizar aplicativo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) => {
    // Apps isolados (Agenda e Chat) declaram o próprio manifest/ícone.
    // O manifest do site não pode aparecer antes deles, senão o
    // "Adicionar à tela de início" abre a home dos pacotes com o ícone do site.
    const pathname = matches[matches.length - 1]?.pathname ?? "";
    const appIsolado = pathname.startsWith("/agenda/") || pathname === "/chat" || pathname.startsWith("/chat/");

    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
        { title: "Via Air — Agência de viagens, passagens e pacotes" },
        { name: "description", content: "Via Air: passagens aéreas, pacotes, hotéis, cruzeiros e experiências personalizadas com atendimento humano." },
        { property: "og:title", content: "Via Air — Agência de viagens, passagens e pacotes" },
        { property: "og:description", content: "Via Air: passagens aéreas, pacotes, hotéis, cruzeiros e experiências personalizadas com atendimento humano." },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "https://pedidos.viaair.tur.br/" },
        { property: "og:site_name", content: "Via Air" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Via Air — Agência de viagens, passagens e pacotes" },
        { name: "twitter:description", content: "Via Air: passagens aéreas, pacotes, hotéis, cruzeiros e experiências personalizadas com atendimento humano." },
        { name: "google-site-verification", content: "_pcjKMoEJrMBzUL75rH0k8Dy_fMqOnaIZ4D49f4v42I" },
        ...(appIsolado
          ? []
          : [
              { name: "theme-color", content: "#0F172A" },
              { name: "apple-mobile-web-app-title", content: "VIA AIR" },
            ]),
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "mobile-web-app-capable", content: "yes" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
        ...(appIsolado
          ? []
          : [
              { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
              { rel: "manifest", href: "/manifest.webmanifest" },
            ]),
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" },
      ],
    };
  },


  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <HeadContent />
      </head>
      <body className="notranslate">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;
    void import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event === "SIGNED_OUT") {
          queryClient.cancelQueries();
          queryClient.clear();
        } else {
          queryClient.invalidateQueries();
        }
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => {
      mounted = false;
      unsub?.();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-right" />
      <ConfirmProvider />
    </QueryClientProvider>

  );
}

