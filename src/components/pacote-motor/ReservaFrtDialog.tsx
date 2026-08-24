import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reservarPacoteFRT } from "@/lib/comprefacil/reserva.functions";
import type { HotelPacote, OcupacaoQuarto } from "@/lib/pacote-motor/mapear";
import type { PassHubOferta } from "@/lib/passhub/types";

const EMAIL_PADRAO = "lucas@voeair.com";
const TELEFONE_PADRAO = "(44) 99909-3642";

type Pax = {
  nome: string;
  sobrenome: string;
  nascimento: string;
  cpf: string;
  sexo: "M" | "F";
  tipo: 0 | 1 | 2;
  quarto: number;
};

/** Monta a lista de passageiros a partir da distribuição pesquisada. */
function paxIniciais(quartos: OcupacaoQuarto[]): Pax[] {
  const lista: Pax[] = [];
  quartos.forEach((q, i) => {
    const base = { nome: "", sobrenome: "", nascimento: "", cpf: "", sexo: "M" as const, quarto: i + 1 };
    for (let a = 0; a < q.adultos; a++) lista.push({ ...base, tipo: 0 });
    for (let c = 0; c < q.criancas; c++) lista.push({ ...base, tipo: 1 });
    for (let b = 0; b < q.bebes; b++) lista.push({ ...base, tipo: 2 });
  });
  return lista.length ? lista : [{ nome: "", sobrenome: "", nascimento: "", cpf: "", sexo: "M", tipo: 0, quarto: 1 }];
}

const rotulo = (p: Pax, i: number) =>
  `${p.tipo === 0 ? "Adulto" : p.tipo === 1 ? "Criança" : "Bebê"} ${i + 1} • Quarto ${p.quarto}`;

/**
 * Reserva de verdade na operadora (CompreFácil/FRT) direto do portal:
 * cria o orçamento, vincula a consultora, grava os passageiros e emite o PNR.
 */
export function ReservaFrtDialog({
  aberto,
  onFechar,
  voo,
  hotel,
  quartoId,
  quartos,
}: {
  aberto: boolean;
  onFechar: () => void;
  voo: PassHubOferta | null;
  hotel: HotelPacote | null;
  quartoId: string | null;
  quartos: OcupacaoQuarto[];
}) {
  const reservar = useServerFn(reservarPacoteFRT);
  const [pax, setPax] = useState<Pax[]>(() => paxIniciais(quartos));
  const [email, setEmail] = useState(EMAIL_PADRAO);
  const [telefone, setTelefone] = useState(TELEFONE_PADRAO);

  const quartoIndice = useMemo(() => {
    if (!hotel) return null;
    const i = hotel.quartos.findIndex((q) => q.id === quartoId);
    return i >= 0 ? i : 0;
  }, [hotel, quartoId]);

  const m = useMutation({
    mutationFn: () =>
      reservar({
        data: {
          aereo:
            voo?.buscaToken && voo.buscaIndice !== undefined
              ? { token: voo.buscaToken, indice: voo.buscaIndice }
              : null,
          hotel:
            hotel?.buscaToken && hotel.buscaIndice !== undefined
              ? { token: hotel.buscaToken, indice: hotel.buscaIndice, quartoIndice }
              : null,
          quartos: quartos.map((q) => ({
            adultos: q.adultos,
            criancas: q.criancas ?? 0,
            bebes: q.bebes ?? 0,
            idades: q.idades ?? [],
          })),

          passageiros: pax.map((p) => ({
            nome: p.nome,
            sobrenome: p.sobrenome,
            nascimento: p.nascimento || null,
            cpf: p.cpf || null,
            sexo: p.sexo,
            email,
            telefone,
            tipo: p.tipo,
            quarto: p.quarto,
          })),
        },
      }),
  });

  const r = m.data as
    | {
        ok: boolean;
        orcamentoId: number | null;
        localizadorAereo: string | null;
        localizadorHotel: string | null;
        limiteEmissao: string | null;
        passos: { passo: string; ok: boolean; detalhe?: string | null }[];
      }
    | undefined;

  const podeReservar =
    pax.every((p) => p.nome.trim() && p.sobrenome.trim() && p.nascimento && p.cpf.replace(/\D/g, "").length === 11) &&
    (Boolean(voo?.buscaToken) || Boolean(hotel?.buscaToken));


  function alterar(i: number, campo: keyof Pax, valor: string) {
    setPax((atual) => atual.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)));
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reservar na operadora</DialogTitle>
        </DialogHeader>

        {!r && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              Consultora: <strong className="text-foreground">Ana Beatriz</strong>
              {voo ? ` • Aéreo ${voo.ida.origem}–${voo.ida.destino}` : ""}
              {hotel ? ` • ${hotel.nome}` : ""}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>E-mail de contato</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
            </div>

            <div className="space-y-4">
              {pax.map((p, i) => (
                <div key={i} className="rounded-xl border border-border/60 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {rotulo(p, i)}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input value={p.nome} onChange={(e) => alterar(i, "nome", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sobrenome</Label>
                      <Input value={p.sobrenome} onChange={(e) => alterar(i, "sobrenome", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nascimento</Label>
                      <Input type="date" value={p.nascimento} onChange={(e) => alterar(i, "nascimento", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CPF</Label>
                      <Input value={p.cpf} onChange={(e) => alterar(i, "cpf", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" disabled={!podeReservar || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reservando na operadora…
                </>
              ) : (
                "Confirmar reserva"
              )}
            </Button>
            {!voo?.buscaToken && !hotel?.buscaToken && (
              <p className="text-xs text-destructive">Pesquise novamente: a busca expirou e não pode ser reservada.</p>
            )}
          </div>
        )}

        {r && (
          <div className="space-y-4">
            <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
              <p>
                Orçamento na operadora: <strong>{r.orcamentoId ?? "—"}</strong>
              </p>
              <p>
                Localizador aéreo: <strong>{r.localizadorAereo ?? "—"}</strong>
              </p>
              <p>
                Localizador hospedagem: <strong>{r.localizadorHotel ?? "—"}</strong>
              </p>
              {r.limiteEmissao && (
                <p>
                  Limite de emissão: <strong>{r.limiteEmissao}</strong>
                </p>
              )}
            </div>
            <ul className="space-y-2">
              {r.passos.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {p.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <span>
                    <strong>{p.passo}</strong>
                    {p.detalhe ? <span className="text-muted-foreground"> — {p.detalhe}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
