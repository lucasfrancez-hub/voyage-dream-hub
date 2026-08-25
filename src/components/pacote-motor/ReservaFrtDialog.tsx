import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { formatarPrazoPagamento } from "@/lib/comprefacil/prazo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reservarPacoteFRT } from "@/lib/comprefacil/reserva.functions";
import { CancelarReservaFrt } from "@/components/pacote-motor/CancelarReservaFrt";

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
  /** idade pesquisada — a operadora exige para criança/bebê */
  idade: number | null;
  quarto: number;
};

/** Monta a lista de passageiros a partir da distribuição pesquisada. */
function paxIniciais(quartos: OcupacaoQuarto[]): Pax[] {
  const lista: Pax[] = [];
  quartos.forEach((q, i) => {
    const base = {
      nome: "",
      sobrenome: "",
      nascimento: "",
      cpf: "",
      sexo: "M" as const,
      quarto: i + 1,
      idade: null as number | null,
    };
    const idades = q.idades ?? [];
    for (let a = 0; a < q.adultos; a++) lista.push({ ...base, tipo: 0 });
    for (let c = 0; c < q.criancas; c++) lista.push({ ...base, tipo: 1, idade: idades[c] ?? null });
    for (let b = 0; b < q.bebes; b++) lista.push({ ...base, tipo: 2, idade: 0 });
  });
  return lista.length
    ? lista
    : [{ nome: "", sobrenome: "", nascimento: "", cpf: "", sexo: "M", tipo: 0, idade: null, quarto: 1 }];
}

/** Idade em anos completos a partir da data de nascimento. */
function idadeDe(nascimento: string): number | null {
  if (!nascimento) return null;
  const d = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos >= 0 ? anos : null;
}

const rotulo = (p: Pax, i: number) =>
  `${p.tipo === 0 ? "Adulto" : p.tipo === 1 ? "Criança" : "Bebê"} ${i + 1} • Quarto ${p.quarto}${
    p.tipo !== 0 && p.idade != null ? ` • ${p.idade} ano(s) na pesquisa` : ""
  }`;


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
            idade: idadeDe(p.nascimento) ?? p.idade,
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
        prazoPagamento: string | null;
        passos: { passo: string; ok: boolean; detalhe?: string | null }[];
      }
    | undefined;

  // Crianças/bebês: a idade tem que bater com a pesquisada, senão a operadora recusa a reserva.
  const alertasIdade = pax
    .map((p, i) => {
      if (p.tipo === 0 || p.idade == null || !p.nascimento) return null;
      const real = idadeDe(p.nascimento);
      return real != null && real !== p.idade
        ? `${rotulo(p, i)}: nascimento indica ${real} ano(s), mas a busca foi feita com ${p.idade}.`
        : null;
    })
    .filter(Boolean) as string[];

  // A cia aérea recusa reservas com o mesmo CPF em mais de um passageiro.
  const cpfsDuplicados = (() => {
    const contagem = new Map<string, number>();
    for (const p of pax) {
      const c = p.cpf.replace(/\D/g, "");
      if (c.length === 11) contagem.set(c, (contagem.get(c) ?? 0) + 1);
    }
    return [...contagem.entries()].filter(([, n]) => n > 1).map(([c]) => c);
  })();

  const podeReservar =
    cpfsDuplicados.length === 0 &&
    pax.every(
      (p) =>
        p.nome.trim() &&
        p.sobrenome.trim() &&
        p.nascimento &&
        p.cpf.replace(/\D/g, "").length === 11,
    ) &&
    alertasIdade.length === 0 &&
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
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input value={p.nome} onChange={(e) => alterar(i, "nome", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sobrenome</Label>
                      <Input value={p.sobrenome} onChange={(e) => alterar(i, "sobrenome", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CPF</Label>
                      <Input value={p.cpf} onChange={(e) => alterar(i, "cpf", e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gênero</Label>
                      <select
                        value={p.sexo}
                        onChange={(e) => alterar(i, "sexo", e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="M">Masculino</option>
                        <option value="F">Feminino</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nascimento</Label>
                      <Input type="date" value={p.nascimento} onChange={(e) => alterar(i, "nascimento", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {alertasIdade.length > 0 && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {alertasIdade.map((a, i) => (
                  <p key={i}>{a}</p>
                ))}
                <p className="mt-1">Corrija a data de nascimento ou refaça a busca com a idade correta.</p>
              </div>
            )}



            {cpfsDuplicados.length > 0 && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                Cada passageiro precisa de um CPF diferente — a companhia aérea recusa a reserva com documentos
                repetidos. Corrija o CPF antes de continuar.
              </div>
            )}

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

        {r && (() => {
          const passoDe = (re: RegExp) => r.passos.filter((p) => re.test(p.passo)).slice(-1)[0] ?? null;
          const pAereo = passoDe(/a[ée]reo/i);
          const pHotel = passoDe(/hospedagem|hotel/i);
          const linha = (
            rotuloItem: string,
            existe: boolean,
            localizador: string | null,
            passo: { ok: boolean; detalhe?: string | null } | null,
          ) => {
            if (!existe) return null;
            const okItem = Boolean(localizador) || Boolean(passo?.ok);
            return (
              <div className="flex items-start gap-2 text-sm">
                {okItem ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>
                  <strong>
                    {rotuloItem} {okItem ? "reservado" : "não reservado"}
                  </strong>
                  {okItem && localizador ? (
                    <> — localizador <strong className="tabular-nums">{localizador}</strong></>
                  ) : null}
                  {!okItem && passo?.detalhe ? (
                    <span className="text-muted-foreground"> — {passo.detalhe}</span>
                  ) : null}
                </span>
              </div>
            );
          };

          return (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-sm">
                  Pacote criado na operadora — ID FRT <strong className="tabular-nums">{r.orcamentoId ?? "—"}</strong>
                </p>
                {linha("Aéreo", Boolean(voo), r.localizadorAereo, pAereo)}
                {linha("Hospedagem", Boolean(hotel), r.localizadorHotel, pHotel)}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                  {r.limiteEmissao && <span>Limite de emissão: {r.limiteEmissao}</span>}
                  {r.prazoPagamento && (
                    <span className="text-amber-600 dark:text-amber-400">
                      Prazo de pagamento: {formatarPrazoPagamento(r.prazoPagamento)}
                    </span>
                  )}
                </div>
              </div>

              <details className="rounded-xl border border-border/60 p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ver detalhes técnicos
                </summary>
                <ul className="mt-2 space-y-2">
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
              </details>

              {r.orcamentoId ? <CancelarReservaFrt orcamentoId={r.orcamentoId} /> : null}
              <Button variant="outline" className="w-full" onClick={onFechar}>
                Fechar
              </Button>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
