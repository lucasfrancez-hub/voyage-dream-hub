/**
 * Editor dos dados de passageiros da reserva.
 * A consolidadora só devolve o nome; nome completo, documento e nascimento
 * são os que preenchemos aqui (ou na hora da reserva).
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Lock, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { passhubSalvarPassageiros } from "@/lib/passhub/passhub.functions";
import type { PassHubReservaPax } from "@/lib/passhub/types";

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "--";

const dataBR = (iso: string) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

type Linha = {
  nome: string;
  documentoTipo: string;
  documento: string;
  nascimento: string;
  tipo: string;
  /** Passageiro já existente na reserva: o nome não pode mais ser alterado. */
  travado: boolean;
};

export function PassageirosEditor({
  localizador,
  passageiros,
  onSalvo,
}: {
  localizador: string;
  passageiros: PassHubReservaPax[];
  onSalvo: (lista: PassHubReservaPax[]) => void;
}) {
  const salvarFn = useServerFn(passhubSalvarPassageiros);
  const [editando, setEditando] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    passageiros.length
      ? passageiros.map((p) => ({
          nome: p.nome,
          documentoTipo: p.documentoTipo || "cpf",
          documento: p.documento || "",
          nascimento: p.nascimento || "",
          tipo: p.tipo || "ADT",
          travado: Boolean(p.nome?.trim()),
        }))
      : [
          {
            nome: "",
            documentoTipo: "cpf",
            documento: "",
            nascimento: "",
            tipo: "ADT",
            travado: false,
          },
        ],
  );

  const atualizar = (i: number, campo: keyof Linha, valor: string) =>
    setLinhas((atual) => atual.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          localizador,
          passageiros: linhas
            .filter((l) => l.nome.trim())
            .map((l) => ({
              nome: l.nome.trim().toUpperCase(),
              documentoTipo: l.documentoTipo === "passport" ? "passport" : "cpf",
              documento: l.documento.trim(),
              nascimento: l.nascimento || null,
              tipo: l.tipo || "ADT",
            })),
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.erro);
      onSalvo(res.passageiros);
      setEditando(false);
      toast.success("Passageiros atualizados");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#9fb4c6]">
          <Users className="h-4 w-4 text-[#8ce0b6]" /> Passageiros
        </h3>
        {!editando && (
          <button type="button" className="cons-btn !px-3 !py-1.5" onClick={() => setEditando(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar dados
          </button>
        )}
      </div>

      {editando ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          {linhas.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_110px_minmax(0,1fr)_150px_90px_auto]">
              {l.travado ? (
                <div
                  className="cons-field flex items-center gap-2 opacity-70"
                  title="Nome do passageiro não pode ser alterado após a reserva"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0 text-[#9fb4c6]" />
                  <span className="truncate text-[13px] font-bold uppercase">{l.nome}</span>
                </div>
              ) : (
                <input
                  className="cons-field"
                  placeholder="Nome completo"
                  value={l.nome}
                  onChange={(e) => atualizar(i, "nome", e.target.value)}
                />
              )}
              <select
                className="cons-field"
                value={l.documentoTipo}
                onChange={(e) => atualizar(i, "documentoTipo", e.target.value)}
              >
                <option value="cpf">CPF</option>
                <option value="passport">Passaporte</option>
              </select>
              <input
                className="cons-field"
                placeholder="Documento"
                value={l.documento}
                onChange={(e) => atualizar(i, "documento", e.target.value)}
              />
              <input
                className="cons-field"
                type="date"
                value={l.nascimento}
                onChange={(e) => atualizar(i, "nascimento", e.target.value)}
              />
              <select
                className="cons-field"
                value={l.tipo}
                onChange={(e) => atualizar(i, "tipo", e.target.value)}
              >
                <option value="ADT">ADT</option>
                <option value="CHD">CHD</option>
                <option value="INF">INF</option>
              </select>
              {l.travado ? (
                <span
                  className="grid h-full min-h-[38px] w-9 place-items-center rounded-xl border border-white/5 text-[#5f7484]"
                  title="Passageiro já reservado — não pode ser removido"
                >
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <button
                  type="button"
                  className="cons-btn !px-2"
                  onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}
                  title="Remover passageiro"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <p className="text-[11px] cons-muted">
            O nome do passageiro fica bloqueado após a reserva — só documento, nascimento e tipo
            podem ser ajustados.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cons-btn"
              onClick={() =>
                setLinhas((a) => [
                  ...a,
                  {
                    nome: "",
                    documentoTipo: "cpf",
                    documento: "",
                    nascimento: "",
                    tipo: "ADT",
                    travado: false,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Adicionar passageiro
            </button>
            <button
              type="button"
              className="cons-btn cons-btn-primary"
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending}
            >
              {salvar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Salvar passageiros
            </button>
            <button type="button" className="cons-btn" onClick={() => setEditando(false)}>
              <X className="h-4 w-4" /> Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="w-full min-w-[560px] text-left">
            <thead className="border-b border-white/5 bg-white/[0.04]">
              <tr>
                <th className="px-5 py-3 cons-lab">Nome completo</th>
                <th className="px-5 py-3 text-center cons-lab">Documento</th>
                <th className="px-5 py-3 text-center cons-lab">Nascimento</th>
                <th className="px-5 py-3 text-right cons-lab">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {passageiros.map((p, i) => (
                <tr key={i}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#8ce0b6]/10 text-[11px] font-black text-[#8ce0b6]">
                        {iniciais(p.nome)}
                      </span>
                      <span className="text-[13px] font-bold uppercase">{p.nome}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center text-[13px]">
                    {p.documento ? (
                      <>
                        <span className="cons-muted mr-1 text-[11px] uppercase">
                          {p.documentoTipo === "passport" ? "Pass." : "CPF"}
                        </span>
                        <b>{p.documento}</b>
                      </>
                    ) : (
                      <span className="cons-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center text-[13px] font-bold">
                    {p.nascimento ? (
                      dataBR(p.nascimento)
                    ) : (
                      <span className="cons-muted font-normal">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-[12px] cons-muted uppercase">
                    {p.tipo || "ADT"}
                  </td>
                </tr>
              ))}
              {passageiros.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-[13px] cons-muted">
                    Sem passageiros informados — use “Editar dados”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
