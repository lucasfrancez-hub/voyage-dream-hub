/**
 * Painel de Stickers — biblioteca da VIA AIR + favoritos.
 * Cada sticker entra na timeline como um clipe de texto (glifo grande),
 * então é editável, animável e não depende de arquivo externo.
 */
import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { PainelShell, Chips, Grade, Vazio } from "./panel-kit";
import type { TextStyle } from "@/lib/editair/types";

type Sticker = { id: string; glifo: string; nome: string; grupo: Grupo };
type Grupo = "viaair" | "destaque" | "reacoes" | "setas";

const STICKERS: Sticker[] = [
  { id: "aviao", glifo: "✈️", nome: "Avião", grupo: "viaair" },
  { id: "mala", glifo: "🧳", nome: "Bagagem", grupo: "viaair" },
  { id: "passaporte", glifo: "🛂", nome: "Passaporte", grupo: "viaair" },
  { id: "praia", glifo: "🏖️", nome: "Praia", grupo: "viaair" },
  { id: "hotel", glifo: "🏨", nome: "Hotel", grupo: "viaair" },
  { id: "mapa", glifo: "🗺️", nome: "Mapa", grupo: "viaair" },
  { id: "ticket", glifo: "🎫", nome: "Bilhete", grupo: "viaair" },
  { id: "sol", glifo: "☀️", nome: "Sol", grupo: "viaair" },

  { id: "promo", glifo: "🔥", nome: "Promo", grupo: "destaque" },
  { id: "desconto", glifo: "💸", nome: "Desconto", grupo: "destaque" },
  { id: "estrela", glifo: "⭐", nome: "Destaque", grupo: "destaque" },
  { id: "alerta", glifo: "⚠️", nome: "Atenção", grupo: "destaque" },
  { id: "novo", glifo: "🆕", nome: "Novo", grupo: "destaque" },
  { id: "relogio", glifo: "⏰", nome: "Últimas horas", grupo: "destaque" },
  { id: "pin", glifo: "📍", nome: "Local", grupo: "destaque" },
  { id: "calendario", glifo: "📅", nome: "Data", grupo: "destaque" },

  { id: "check", glifo: "✅", nome: "Confirmado", grupo: "reacoes" },
  { id: "joia", glifo: "👍", nome: "Joia", grupo: "reacoes" },
  { id: "coracao", glifo: "❤️", nome: "Amei", grupo: "reacoes" },
  { id: "festa", glifo: "🎉", nome: "Festa", grupo: "reacoes" },
  { id: "olhos", glifo: "👀", nome: "Olha isso", grupo: "reacoes" },
  { id: "risada", glifo: "😂", nome: "Risada", grupo: "reacoes" },
  { id: "uau", glifo: "😍", nome: "Uau", grupo: "reacoes" },
  { id: "pensando", glifo: "🤔", nome: "Pensando", grupo: "reacoes" },

  { id: "seta-dir", glifo: "➡️", nome: "Direita", grupo: "setas" },
  { id: "seta-esq", glifo: "⬅️", nome: "Esquerda", grupo: "setas" },
  { id: "seta-cima", glifo: "⬆️", nome: "Cima", grupo: "setas" },
  { id: "seta-baixo", glifo: "⬇️", nome: "Baixo", grupo: "setas" },
  { id: "swipe", glifo: "👆", nome: "Arrasta", grupo: "setas" },
  { id: "toque", glifo: "👉", nome: "Aponta", grupo: "setas" },
  { id: "balao", glifo: "💬", nome: "Balão", grupo: "setas" },
  { id: "ideia", glifo: "💡", nome: "Ideia", grupo: "setas" },
];

const GRUPOS = [
  { id: "viaair" as const, nome: "VIA AIR" },
  { id: "destaque" as const, nome: "Destaque" },
  { id: "reacoes" as const, nome: "Reações" },
  { id: "setas" as const, nome: "Setas" },
];

const CHAVE_FAV = "editair:stickers:favoritos";

function lerFav(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FAV) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function StickersPanel({
  onInserir,
}: {
  onInserir: (texto: string, estilo: Partial<TextStyle>, rotulo: string) => void;
}) {
  const [grupo, setGrupo] = useState<Grupo | "fav">("viaair");
  const [busca, setBusca] = useState("");
  const [fav, setFav] = useState<string[]>(() => (typeof localStorage === "undefined" ? [] : lerFav()));

  const alternarFav = (id: string) => {
    setFav((f) => {
      const p = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem(CHAVE_FAV, JSON.stringify(p));
      } catch {
        /* ignora */
      }
      return p;
    });
  };

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return STICKERS.filter((s) => (grupo === "fav" ? fav.includes(s.id) : s.grupo === grupo)).filter(
      (s) => !q || s.nome.toLowerCase().includes(q),
    );
  }, [grupo, busca, fav]);

  return (
    <PainelShell titulo="Stickers" contagem={`${STICKERS.length} itens`}>
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar sticker"
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-[11px] outline-none focus:border-[#F26B1F]/60"
        />
      </div>

      <Chips
        itens={[{ id: "fav" as const, nome: "★" }, ...GRUPOS]}
        valor={grupo}
        onChange={(v) => setGrupo(v as Grupo | "fav")}
      />

      {lista.length === 0 ? (
        <Vazio>{grupo === "fav" ? "Nenhum favorito ainda — toque na estrela de um sticker." : "Nada encontrado."}</Vazio>
      ) : (
        <Grade cols={3}>
          {lista.map((s) => (
            <div key={s.id} className="group relative">
              <button
                onClick={() =>
                  onInserir(
                    s.glifo,
                    { fontSize: 140, stroke: 0, shadow: 12, background: "none", animacao: "pop" },
                    s.nome,
                  )
                }
                title={`Inserir ${s.nome}`}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] transition hover:-translate-y-0.5 hover:border-[#F26B1F]/60 hover:bg-[#F26B1F]/[0.08]"
              >
                <span className="text-2xl leading-none transition-transform group-hover:scale-110">{s.glifo}</span>
                <span className="px-1 text-center text-[9px] leading-tight text-white/50">{s.nome}</span>
              </button>
              <button
                onClick={() => alternarFav(s.id)}
                title="Favoritar"
                className="absolute right-1 top-1 rounded p-0.5 opacity-0 transition group-hover:opacity-100"
              >
                <Star className={`h-3 w-3 ${fav.includes(s.id) ? "fill-[#F26B1F] text-[#F26B1F]" : "text-white/50"}`} />
              </button>
            </div>
          ))}
        </Grade>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-white/30">
        O sticker entra como camada de texto no playhead — dá para redimensionar, animar e adicionar keyframes normalmente.
      </p>
    </PainelShell>
  );
}
