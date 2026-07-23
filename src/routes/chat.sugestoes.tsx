import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Loader2, Check, X, ExternalLink, MapPin, Clock, Calendar, Megaphone, Instagram, MessageCircle } from "lucide-react";
import {
  listSuggestions,
  aprovarSuggestion,
  descartarSuggestion,
} from "@/lib/broadcast/suggestions.functions";
import { confirm } from "@/lib/confirm";

export const Route = createFileRoute("/chat/sugestoes")({
  ssr: false,
  component: SugestoesPage,
  head: () => ({
    meta: [
      { title: "Sugestões IA — VIA AIR Chat" },
      { name: "description", content: "Sugestões automáticas de rotas quentes por origem, geradas pela IA pra aprovação." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type PackageMini = {
  id: string;
  slug: string;
  title: string;
  image_url: string | null;
  price_per_person: number;
  going_date: string | null;
  nights: number | null;
};

type Suggestion = {
  id: string;
  origin: string;
  destination: string;
  package_id: string | null;
  suggested_channels: string[];
  suggested_time: string | null;
  suggested_day: string | null;
  reasoning: string | null;
  status: "pending" | "approved" | "dismissed";
  campaign_id: string | null;
  created_at: string;
  packages: PackageMini | null;
};

const CHANNEL_META: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle, color: "bg-green-500/10 text-green-700 border-green-200" },
  instagram_feed: { label: "Feed Instagram", icon: Instagram, color: "bg-pink-500/10 text-pink-700 border-pink-200" },
  instagram_story: { label: "Story Instagram", icon: Instagram, color: "bg-purple-500/10 text-purple-700 border-purple-200" },
};

function SugestoesPage() {
  const list = useServerFn(listSuggestions);
  const gerar = useServerFn(gerarSuggestions);
  const aprovar = useServerFn(aprovarSuggestion);
  const descartar = useServerFn(descartarSuggestion);
  const [generating, setGenerating] = useState(false);

  const q = useQuery({
    queryKey: ["broadcast-suggestions"],
    queryFn: () => list(),
  });

  const suggestions = (q.data?.suggestions ?? []) as unknown as Suggestion[];
  const pending = suggestions.filter((s) => s.status === "pending");
  const approved = suggestions.filter((s) => s.status === "approved");

  async function handleGerar() {
    setGenerating(true);
    try {
      const res = await gerar();
      toast.success(res.message || `${res.created} sugestões geradas`);
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar sugestões");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAprovar(id: string) {
    const ok = await confirm({
      title: "Aprovar sugestão?",
      description: "Vou criar uma campanha rascunho no Broadcast já com a mensagem inicial e horário sugerido. Você ainda escolhe os destinos (grupo, canal, story) antes de enviar.",
      confirmText: "Aprovar e criar rascunho",
    });
    if (!ok) return;
    try {
      await aprovar({ data: { id } });
      toast.success("Rascunho criado em Broadcast");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aprovar");
    }
  }

  async function handleDescartar(id: string) {
    const ok = await confirm({
      title: "Descartar sugestão?",
      description: "Ela some da lista. Você pode gerar novas depois.",
      confirmText: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await descartar({ data: { id } });
      toast.success("Descartada");
      await q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao descartar");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Sugestões de campanhas
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            A IA analisa seus pacotes ativos, sazonalidade e origens cadastradas pra sugerir o que postar essa semana — em qual canal e horário. Você aprova, ela vira rascunho em Broadcast.
          </p>
        </div>
        <button
          onClick={handleGerar}
          disabled={generating}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Analisando pacotes…" : "Gerar sugestões agora"}
        </button>
      </div>

      {/* Loading */}
      {q.isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!q.isLoading && pending.length === 0 && approved.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Sparkles className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Nenhuma sugestão ainda</p>
          <p className="mt-1 text-xs text-slate-500">Clique em "Gerar sugestões agora" pra IA analisar seus pacotes.</p>
        </div>
      )}

      {/* Pendentes */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Aguardando aprovação · {pending.length}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onApprove={() => handleAprovar(s.id)}
                onDismiss={() => handleDescartar(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Aprovadas recentes */}
      {approved.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Aprovadas recentemente · {approved.length}
          </h2>
          <div className="space-y-2">
            {approved.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Check className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="truncate text-slate-700">
                    <span className="font-medium">{s.origin} → {s.destination}</span>
                    {s.packages && <span className="ml-2 text-slate-500">· {s.packages.title}</span>}
                  </span>
                </div>
                {s.campaign_id && (
                  <a
                    href="/chat/broadcast"
                    className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700"
                  >
                    Ver em Broadcast <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  onApprove,
  onDismiss,
}: {
  suggestion: Suggestion;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const pkg = s.packages;
  const channels = s.suggested_channels || [];

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Capa do pacote */}
      {pkg?.image_url && (
        <div className="relative h-32 w-full overflow-hidden bg-slate-100">
          <img src={pkg.image_url} alt={pkg.title} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3">
            <div className="flex items-center gap-1 text-xs font-medium text-white/90">
              <MapPin className="h-3 w-3" />
              {s.origin} → {s.destination}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-4">
        {!pkg?.image_url && (
          <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <MapPin className="h-3 w-3" />
            {s.origin} → {s.destination}
          </div>
        )}

        {pkg && (
          <div>
            <p className="text-sm font-semibold text-slate-900 line-clamp-2">{pkg.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              R$ {Number(pkg.price_per_person).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}/pessoa
              {pkg.nights && ` · ${pkg.nights} noites`}
              {pkg.going_date && ` · ${new Date(pkg.going_date).toLocaleDateString("pt-BR")}`}
            </p>
          </div>
        )}

        {s.reasoning && (
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs italic text-orange-900">"{s.reasoning}"</p>
        )}

        {/* Canais + horário */}
        <div className="flex flex-wrap items-center gap-2">
          {channels.map((c) => {
            const meta = CHANNEL_META[c] ?? { label: c, icon: Megaphone, color: "bg-slate-100 text-slate-700 border-slate-200" };
            const Icon = meta.icon;
            return (
              <span key={c} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {s.suggested_day && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {s.suggested_day}
            </span>
          )}
          {s.suggested_time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {s.suggested_time}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            onClick={onApprove}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700"
          >
            <Check className="h-3.5 w-3.5" /> Aprovar
          </button>
          <button
            onClick={onDismiss}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" /> Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
