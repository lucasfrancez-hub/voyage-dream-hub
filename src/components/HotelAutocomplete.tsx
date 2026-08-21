import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Star, Radio, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchTripAdvisorHotels, getTripAdvisorHotelDetails, getTripAdvisorHotelByUrl, parseTripAdvisorUrl, type TAHotelSuggestion, type TAHotelDetails } from "@/lib/tripadvisor.functions";

export type HotelSelection = TAHotelDetails;

type Mode = "live" | "manual";

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (hotel: HotelSelection) => void;
  placeholder?: string;
  photoLimit?: number;
  disabled?: boolean;
  /** Modo inicial. Padrão: null (usuário escolhe antes de digitar). */
  initialMode?: Mode | null;
  /** Modo controlado (opcional). Se informado, sobrepõe o estado interno. */
  mode?: Mode | null;
  onModeChange?: (mode: Mode | null) => void;
  /**
   * Nome já preenchido (importação): vincula sozinho ao melhor resultado do
   * TripAdvisor, sem precisar clicar na lista. O nome digitado é preservado.
   */
  autoSelect?: boolean;
};

/** "Makai Aracaju" x "Makai" → considera o mesmo hotel. */
function nomeBate(a: string, b: string) {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x) || x.includes(y) || y.includes(x);
}

export function HotelAutocomplete({ value, onChangeText, onSelect, placeholder, photoLimit = 5, disabled, initialMode = null, mode: modeProp, onModeChange, autoSelect = false }: Props) {
  const search = useServerFn(searchTripAdvisorHotels);
  const details = useServerFn(getTripAdvisorHotelDetails);
  const [internalMode, setInternalMode] = useState<Mode | null>(initialMode ?? (value?.trim() ? "manual" : null));
  const mode = modeProp !== undefined ? modeProp : internalMode;
  const setMode = (m: Mode | null) => {
    if (modeProp === undefined) setInternalMode(m);
    onModeChange?.(m);
  };
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TAHotelSuggestion[]>([]);
  const [fetchingId, setFetchingId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef<string>("");
  const suppressRef = useRef(false);

  // Link do TripAdvisor colado: busca direto pelo link (não gasta a busca da API).
  const byUrl = useServerFn(getTripAdvisorHotelByUrl);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const urlInfo = parseTripAdvisorUrl(value || "");
  const lastUrlRef = useRef<string>("");
  // Último nome digitado/salvo antes de colar o link — deve ser preservado.
  const prevNameRef = useRef<string>(parseTripAdvisorUrl(value || "").url ? "" : (value || "").trim());

  useEffect(() => {
    const v = (value || "").trim();
    if (v && !parseTripAdvisorUrl(v).url) prevNameRef.current = v;
  }, [value]);

  async function pickByUrl(link: string) {
    if (!link || loadingUrl) return;
    lastUrlRef.current = link;
    setLoadingUrl(true);
    setErro(null);
    try {
      const full = await byUrl({ data: { url: link, photoLimit } });
      suppressRef.current = true;
      const nomeAnterior = prevNameRef.current;
      onSelect(nomeAnterior ? { ...full, name: nomeAnterior } : full);
      setOpen(false);
      setItems([]);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível ler esse link do TripAdvisor.");
    } finally {
      setLoadingUrl(false);
    }
  }


  useEffect(() => {
    const link = urlInfo.url;
    if (!link || link === lastUrlRef.current) return;
    const t = setTimeout(() => { void pickByUrl(link); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInfo.url]);

  useEffect(() => {
    if (mode !== "live") { setItems([]); setOpen(false); return; }
    if (suppressRef.current) { suppressRef.current = false; return; }
    const q = (value || "").trim();
    if (parseTripAdvisorUrl(q).locationId) { setItems([]); setOpen(false); return; }
    if (q.length < 3) { setItems([]); setOpen(false); return; }
    if (q === lastQueryRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      setErro(null);
      try {
        const r = await search({ data: { query: q } });
        setItems(r);
        // Nome já veio preenchido (importação): vincula sozinho ao melhor
        // resultado, mantendo o nome original do documento.
        const auto = autoSelect && !autoDoneRef.current ? r.find((it) => nomeBate(it.name, q)) ?? r[0] : null;
        if (auto) {
          autoDoneRef.current = true;
          setOpen(false);
          void pick(auto, true);
        } else {
          setOpen(true);
        }
      } catch (e) {
        console.error(e);
        setErro(
          String((e as Error)?.message || "").includes("TRIPADVISOR_RATE_LIMIT")
            ? "Limite de consultas do TripAdvisor atingido. Aguarde alguns minutos, cole o link do hotel ou use o modo Manual."
            : "Não foi possível consultar o TripAdvisor agora.",
        );
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value, search, mode]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pick(item: TAHotelSuggestion) {
    setFetchingId(item.location_id);
    try {
      const full = await details({ data: { locationId: item.location_id, photoLimit } });
      // O endpoint de busca costuma trazer a nota (ex.: 4,1), enquanto o de
      // detalhes pode omiti-la. Preserve a nota exibida na sugestão para que
      // o formulário sempre consiga preencher as estrelas automaticamente.
      const selected: HotelSelection = {
        ...full,
        name: full.name || item.name,
        address: full.address ?? item.address,
        city: full.city ?? item.city,
        country: full.country ?? item.country,
        latitude: full.latitude ?? item.latitude,
        longitude: full.longitude ?? item.longitude,
        rating: full.rating ?? item.rating,
        tripadvisor_url: full.tripadvisor_url ?? item.tripadvisor_url,
      };
      suppressRef.current = true;
      onSelect(selected);
      setOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingId(null);
    }
  }

  async function forceSearch() {
    const q = (value || "").trim();
    if (q.length < 3) return;
    setLoading(true);
    setErro(null);
    try {
      lastQueryRef.current = q;
      const r = await search({ data: { query: q, force: true } });
      setItems(r);
      setOpen(true);
    } catch (e) {
      console.error(e);
      setErro(
        String((e as Error)?.message || "").includes("TRIPADVISOR_RATE_LIMIT")
          ? "Limite de consultas do TripAdvisor atingido. Aguarde alguns minutos, cole o link do hotel ou use o modo Manual."
          : "Não foi possível consultar o TripAdvisor agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Antes de escolher o modo, mostra os dois botões.
  if (mode === null) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Como deseja preencher o hotel?</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("live")}
            className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left hover:border-brand-orange hover:bg-brand-orange/5 transition"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio className="h-4 w-4 text-brand-orange" /> TripAdvisor
            </div>
            <div className="text-[11px] text-muted-foreground">Busca automática por nome. Puxa endereço, estrelas e fotos.</div>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("manual")}
            className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left hover:border-brand-orange hover:bg-brand-orange/5 transition"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Pencil className="h-4 w-4 text-brand-orange" /> Manual
            </div>
            <div className="text-[11px] text-muted-foreground">Preenche tudo à mão, sem consultar a API.</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
          {mode === "live" ? <><Radio className="h-3 w-3 text-brand-orange" /> TripAdvisor</> : <><Pencil className="h-3 w-3 text-brand-orange" /> Manual</>}
        </span>
        <button
          type="button"
          onClick={() => { setMode(null); setItems([]); setOpen(false); }}
          className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          trocar
        </button>
      </div>
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => onChangeText(e.target.value)}
        onFocus={() => { if (mode === "live" && items.length > 0) setOpen(true); }}
        placeholder={placeholder ?? (mode === "live" ? "Digite o nome do hotel (busca no TripAdvisor)" : "Digite o nome do hotel")}
        autoComplete="off"
      />
      {urlInfo.locationId != null && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border bg-popover px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {loadingUrl && <Loader2 className="h-3 w-3 animate-spin" />}
            {loadingUrl ? "Lendo o hotel pelo link do TripAdvisor…" : (erro ?? "Link do TripAdvisor detectado.")}
          </span>
          {!loadingUrl && (
            <button
              type="button"
              onClick={() => {
                const link = urlInfo.url;
                if (!link) return;
                lastUrlRef.current = "";
                void pickByUrl(link);
              }}
              className="shrink-0 text-brand-orange underline underline-offset-2 hover:opacity-80"
            >
              Buscar pelo link
            </button>
          )}
        </div>
      )}
      {mode === "live" && loading && (
        <div className="absolute right-2 top-9 -translate-y-1/2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      )}
      {mode === "live" && !loading && urlInfo.locationId == null && (value || "").trim().length >= 3 && items.length === 0 && (
        <div className={`mt-1 flex items-center justify-between gap-2 rounded-md border bg-popover px-3 py-2 text-[11px] ${erro ? "border-destructive/50 text-destructive" : "text-muted-foreground"}`}>
          <span>{erro ?? "Nenhum hotel encontrado. Tente o nome sem palavras extras ou cole o link do TripAdvisor."}</span>
          <button
            type="button"
            onClick={forceSearch}
            className="shrink-0 text-brand-orange underline underline-offset-2 hover:opacity-80"
          >
            Forçar busca
          </button>
        </div>
      )}
      {mode === "live" && open && items.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-y-auto">
          {items.map((it) => (
            <button
              type="button"
              key={it.location_id}
              onClick={() => pick(it)}
              disabled={fetchingId === it.location_id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground border-b last:border-b-0 flex items-start gap-2 disabled:opacity-60"
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-orange" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{it.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {[it.city, it.country].filter(Boolean).join(" · ") || it.address || "—"}
                </div>
              </div>
              {it.rating ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500">
                  <Star className="h-3 w-3 fill-current" /> {it.rating.toFixed(1)}
                </span>
              ) : null}
              {fetchingId === it.location_id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t flex items-center justify-between gap-2">
            <span>Não encontrou? Cole o link do TripAdvisor do hotel ou troque para "Manual".</span>
            <button
              type="button"
              onClick={forceSearch}
              className="shrink-0 text-brand-orange underline underline-offset-2 hover:opacity-80"
            >
              Forçar busca
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
