import { useState } from "react";
import { Users, ChevronDown, Minus, Plus, BedDouble, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type QuartoPax = { adultos: number; criancas: number; bebes: number };

export const QUARTO_PADRAO: QuartoPax = { adultos: 2, criancas: 0, bebes: 0 };

export function totalPax(quartos: QuartoPax[]) {
  return quartos.reduce(
    (acc, q) => ({
      adultos: acc.adultos + q.adultos,
      criancas: acc.criancas + q.criancas,
      bebes: acc.bebes + q.bebes,
    }),
    { adultos: 0, criancas: 0, bebes: 0 },
  );
}

const MAX_QUARTOS = 6;

function Contador({
  label,
  valor,
  min,
  max,
  onChange,
}: {
  label: string;
  valor: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label={`Diminuir ${label}`}
          disabled={valor <= min}
          onClick={() => onChange(valor - 1)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-6 text-center text-sm font-semibold">{valor}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label={`Aumentar ${label}`}
          disabled={valor >= max}
          onClick={() => onChange(valor + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Seletor de pessoas por quarto: clique no quarto desejado para alterar
 * adultos, crianças e bebês daquele quarto.
 */
export function RoomsPaxField({
  quartos,
  onChange,
  className,
}: {
  quartos: QuartoPax[];
  onChange: (quartos: QuartoPax[]) => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [quartoAtivo, setQuartoAtivo] = useState(0);
  const t = totalPax(quartos);
  const pessoas = t.adultos + t.criancas + t.bebes;

  function atualizar(indice: number, campo: keyof QuartoPax, valor: number) {
    onChange(quartos.map((q, i) => (i === indice ? { ...q, [campo]: valor } : q)));
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 text-sm font-medium transition hover:border-primary/60 " +
            (className ?? "")
          }
        >
          <span className="flex items-center gap-2 truncate">
            <Users className="h-4 w-4 text-muted-foreground" />
            {pessoas} pessoa{pessoas === 1 ? "" : "s"} • {quartos.length} quarto
            {quartos.length === 1 ? "" : "s"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[20rem] p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          Para alterar o número de pessoas do quarto, clique no quarto desejado.
        </p>

        <div className="space-y-2">
          {quartos.map((q, i) => {
            const ativo = i === quartoAtivo;
            const total = q.adultos + q.criancas + q.bebes;
            return (
              <div key={i} className="rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => setQuartoAtivo(ativo ? -1 : i)}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm " +
                    (ativo ? "font-semibold text-primary" : "")
                  }
                >
                  <span className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4 text-muted-foreground" /> Quarto {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {total} pessoa{total === 1 ? "" : "s"}
                  </span>
                </button>

                {ativo && (
                  <div className="border-t border-border/60 px-3 pb-2 pt-1">
                    <Contador
                      label="Adultos"
                      valor={q.adultos}
                      min={1}
                      max={9}
                      onChange={(v) => atualizar(i, "adultos", v)}
                    />
                    <Contador
                      label="Crianças"
                      valor={q.criancas}
                      min={0}
                      max={6}
                      onChange={(v) => atualizar(i, "criancas", v)}
                    />
                    <Contador
                      label="Bebês (colo)"
                      valor={q.bebes}
                      min={0}
                      max={4}
                      onChange={(v) => atualizar(i, "bebes", v)}
                    />
                    {quartos.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-8 w-full gap-1.5 text-destructive"
                        onClick={() => {
                          onChange(quartos.filter((_, idx) => idx !== i));
                          setQuartoAtivo(0);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover quarto
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={quartos.length >= MAX_QUARTOS}
            onClick={() => {
              onChange([...quartos, { ...QUARTO_PADRAO }]);
              setQuartoAtivo(quartos.length);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar quarto
          </Button>
          <Button type="button" size="sm" onClick={() => setAberto(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
