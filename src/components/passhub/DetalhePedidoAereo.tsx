/**
 * Detalhe de uma reserva aérea que veio de um PEDIDO, com o mesmo visual da
 * tela de reservas da consolidadora — para conferir o itinerário e emitir o
 * comprovante (plano de viagem) sem sair da tela de Reservas.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Luggage,
  Plane,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getOrderDetail } from "@/lib/orders.functions";
import { pedidoParaComprovante } from "@/lib/orders/plano-viagem";
import { abrirDocumento } from "@/lib/docs/abrir";
import { BadgeCia } from "@/components/passhub/ResultadosPassHub";
import { nomeProprio } from "@/components/passhub/ComprovanteReserva";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const dataHora = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const dataCurta = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const hora = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

export function DetalhePedidoAereo({
  orderId,
  onVoltar,
}: {
  orderId: string;
  onVoltar: () => void;
}) {
  const navigate = useNavigate();
  const buscar = useServerFn(getOrderDetail);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedido-reserva-aerea", orderId],
    queryFn: () => buscar({ data: { id: orderId } }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-[13px] cons-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando reserva do pedido…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="cons-card p-4 text-[13px] text-[#ffd6d6]">
        {error instanceof Error ? error.message : "Não foi possível abrir esse pedido."}
      </div>
    );
  }

  const dados = pedidoParaComprovante(data);
  const emitido = dados.emitido;
  const pagos = data.payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-black tracking-tight">
            Reserva {dados.localizador || "—"}
          </h1>
          <p className="text-[13px] cons-muted">
            {dados.origem || "—"} → {dados.destino || "—"} · Pedido {data.order.orderNumber}
            {data.order.fullName ? ` · ${nomeProprio(data.order.fullName)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`cons-status ${emitido ? "cons-status-ok" : "cons-status-res"}`}>
            {emitido ? "EMITIDA" : "RESERVADA"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="cons-btn !px-3 !py-1.5 inline-flex items-center gap-2">
                <FileText className="h-4 w-4" /> Plano de viagem
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[120] min-w-[180px]">
              <DropdownMenuItem
                className="flex w-full cursor-pointer items-center gap-2"
                onClick={() => void abrirDocumento("pedido", orderId)}
              >
                <FileText className="h-4 w-4" /> Com valor total
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex w-full cursor-pointer items-center gap-2"
                onClick={() => void abrirDocumento("pedido", orderId, { semValores: true })}
              >
                <FileText className="h-4 w-4" /> Sem valor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className="cons-btn"
            onClick={() => navigate({ to: "/admin/pedidos/$id", params: { id: orderId } })}
          >
            <ExternalLink className="h-4 w-4" /> Abrir pedido
          </button>
          <button type="button" className="cons-btn" onClick={onVoltar}>
            <ArrowLeft className="h-4 w-4" /> Voltar para reservas
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="cons-card p-4 md:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Localizador</div>
              <div className="font-mono text-[20px] font-black tracking-widest">
                {dados.localizador || "—"}
              </div>
              <div className="text-[12px] cons-muted">
                {data.order.supplierName || "pedido interno"}
              </div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Loc. companhia</div>
              <div className="font-mono text-[18px] font-black">
                {dados.localizadorCompanhia || "—"}
              </div>
              <div className="text-[12px] cons-muted">{dados.companhia || "—"}</div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Pedido</div>
              <div className="text-[16px] font-black">{data.order.orderNumber}</div>
              <div className="text-[12px] cons-muted">{data.order.status || "—"}</div>
            </div>
            <div className="cons-box p-4">
              <div className="cons-lab mb-2">Criação</div>
              <div className="text-[16px] font-black">{dataHora(data.order.createdAt)}</div>
              <div className="text-[12px] cons-muted">
                {nomeProprio(data.order.sellerName ?? "") || "VIA AIR"}
              </div>
            </div>
          </div>

          <div className="cons-dot my-5" />

          <h3 className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#9fb4c6]">
            <Plane className="h-4 w-4 text-[#77b8ff]" /> Trechos da viagem
          </h3>
          <div className="space-y-4">
            {dados.grupos.length === 0 && (
              <div className="cons-box p-4 text-[13px] cons-muted">
                Esse pedido ainda não tem trechos aéreos cadastrados.
              </div>
            )}
            {dados.grupos.map((g, i) => {
              const primeiro = g.voos[0];
              const ultimo = g.voos[g.voos.length - 1];
              return (
                <div
                  key={`${g.titulo}-${i}`}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-colors hover:border-white/20"
                >
                  <div className="p-5">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <BadgeCia codigo={primeiro?.companhia || dados.companhia} grande />
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#77b8ff]">
                            {g.titulo} · Voo {primeiro?.numeroVoo || "—"}
                            {g.voos.length > 1 ? ` · +${g.voos.length - 1} conexão(ões)` : ""}
                          </div>
                          <div className="text-[17px] font-black">
                            {primeiro?.origem || "—"} <span className="mx-1 cons-muted">→</span>{" "}
                            {ultimo?.destino || "—"}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="cons-lab">Duração</div>
                        <div className="text-[13px] font-bold">
                          {primeiro?.duracao || ultimo?.duracao || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 px-1">
                      <div className="min-w-0">
                        <div className="text-[26px] font-black leading-none">
                          {hora(primeiro?.partida)}
                        </div>
                        <div className="mt-1 text-[13px] font-bold cons-muted">
                          {primeiro?.origem}
                        </div>
                        <div className="text-[11px] cons-muted">{dataCurta(primeiro?.partida)}</div>
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <span className="h-px flex-1 border-t border-dashed border-white/10" />
                        <span className="rounded-full bg-white/10 p-1.5">
                          <Plane className="h-3 w-3 rotate-90 text-[#77b8ff]" />
                        </span>
                        <span className="h-px flex-1 border-t border-dashed border-white/10" />
                      </div>
                      <div className="min-w-0 text-right">
                        <div className="text-[26px] font-black leading-none">
                          {hora(ultimo?.chegada)}
                        </div>
                        <div className="mt-1 text-[13px] font-bold cons-muted">
                          {ultimo?.destino}
                        </div>
                        <div className="text-[11px] cons-muted">{dataCurta(ultimo?.chegada)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap divide-x divide-white/5 border-t border-white/5 bg-white/[0.03]">
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="cons-lab">Classe</span>
                      <span className="text-[12px] font-bold text-[#bfe0ff]">
                        {primeiro?.familiaTarifaria || primeiro?.classe || "—"}
                      </span>
                    </div>
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="cons-lab">Bagagem</span>
                      <span className="flex items-center gap-1 text-[12px] font-bold text-[#8ce0b6]">
                        <Luggage className="h-3 w-3" />
                        {primeiro?.bagagem?.despachada
                          ? `${primeiro.bagagem.despachadaQtd || 1} despachada(s)`
                          : "somente mão"}
                      </span>
                    </div>
                    <div className="flex flex-1 items-center gap-2 px-4 py-3">
                      <span className="cons-lab">Voos</span>
                      <span className="text-[12px] font-bold">
                        {g.voos.map((v) => v.numeroVoo).filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cons-dot my-5" />

          <h3 className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#9fb4c6]">
            <Users className="h-4 w-4 text-[#77b8ff]" /> Passageiros
          </h3>
          <div className="space-y-2">
            {dados.passageiros.length === 0 && (
              <div className="cons-box p-4 text-[13px] cons-muted">
                Nenhum passageiro cadastrado nesse pedido.
              </div>
            )}
            {dados.passageiros.map((p, i) => (
              <div
                key={`${p.nome}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-[14px] font-bold">{nomeProprio(p.nome)}</div>
                  <div className="text-[12px] cons-muted">
                    {p.tipo || "ADT"}
                    {p.documento ? ` · ${p.documentoTipo || "Documento"} ${p.documento}` : ""}
                    {p.nascimento ? ` · ${dataCurta(p.nascimento)}` : ""}
                  </div>
                </div>
                {p.bilhete ? (
                  <div className="text-right">
                    <div className="cons-lab">Bilhete</div>
                    <div className="font-mono text-[14px] font-black">{p.bilhete}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="cons-card p-4">
            <h3 className="mb-2 text-[15px] font-bold">Resumo financeiro</h3>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Total do pedido</span>
              <b>{brl(data.order.totalPrice ?? 0)}</b>
            </div>
            <div className="flex justify-between border-b border-dotted border-white/10 py-2 text-[13px]">
              <span className="cons-muted">Recebido</span>
              <b>{brl(pagos)}</b>
            </div>
            <div className="cons-dot my-2" />
            <div className="cons-lab">Em aberto</div>
            <div className="text-[28px] font-black">
              {brl(Math.max(0, (data.order.totalPrice ?? 0) - pagos))}
            </div>
          </div>

          {dados.outrasReservas?.length ? (
            <div className="cons-card p-4">
              <h3 className="mb-2 text-[15px] font-bold">Outros serviços</h3>
              <div className="space-y-2">
                {dados.outrasReservas.map((o, i) => (
                  <div key={`${o.titulo}-${i}`} className="cons-box p-3">
                    <div className="cons-lab">{o.tipo}</div>
                    <div className="text-[14px] font-bold">{o.titulo}</div>
                    {o.periodo ? <div className="text-[12px] cons-muted">{o.periodo}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default DetalhePedidoAereo;
