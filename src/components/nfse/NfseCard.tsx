import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, RefreshCw, Send, XCircle, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  emitirNfse, consultarNfse, cancelarNfse, listNfseByOrder,
} from "@/lib/nfse.functions";
import { getPerson } from "@/lib/people.functions";
import type { OrderDetail } from "@/lib/orders.functions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const IATA_CITY: Record<string, string> = {
  GRU: "São Paulo", CGH: "São Paulo", VCP: "Campinas", GIG: "Rio de Janeiro", SDU: "Rio de Janeiro",
  BSB: "Brasília", CNF: "Belo Horizonte", CWB: "Curitiba", POA: "Porto Alegre", FLN: "Florianópolis",
  SSA: "Salvador", REC: "Recife", FOR: "Fortaleza", NAT: "Natal", MCZ: "Maceió", BEL: "Belém",
  MAO: "Manaus", VIX: "Vitória", CGB: "Cuiabá", CGR: "Campo Grande", GYN: "Goiânia",
  MCO: "Orlando", MIA: "Miami", JFK: "Nova York", EWR: "Nova York", LGA: "Nova York",
  LAX: "Los Angeles", SFO: "São Francisco", LAS: "Las Vegas",
  LIS: "Lisboa", OPO: "Porto", MAD: "Madri", BCN: "Barcelona", CDG: "Paris", ORY: "Paris",
  LHR: "Londres", LGW: "Londres", FCO: "Roma", MXP: "Milão", AMS: "Amsterdã", FRA: "Frankfurt",
  EZE: "Buenos Aires", AEP: "Buenos Aires", SCL: "Santiago", LIM: "Lima",
  BOG: "Bogotá", MEX: "Cidade do México", CUN: "Cancún",
  DXB: "Dubai", DOH: "Doha", IST: "Istambul",
};
const cityOf = (iata: string) => IATA_CITY[String(iata || "").toUpperCase().trim()] || String(iata || "").toUpperCase().trim();

function fmtBR(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}`;
  return null;
}

function buildAutoDescricao(detail: OrderDetail): string {
  const items = detail.items.filter((i) => i.status !== "cancelled");
  const flights = items.filter((i) => i.kind === "flight");
  const hotels = items.filter((i) => i.kind === "hotel");
  const others = items.filter((i) => i.kind !== "flight" && i.kind !== "hotel");

  const parts: string[] = [];
  if (flights.length) parts.push("Aéreo");
  if (hotels.length) parts.push("Hotel");
  if (others.length) parts.push("Serviço");
  const tipos = parts.join(" + ") || "Serviços de viagem";

  // Destino
  let destino: string | null = null;
  if (flights.length) {
    const segs = flights
      .map((f) => {
        const d = (f.details ?? {}) as Record<string, unknown>;
        return {
          orig: String(d.origin ?? d.from ?? d.origin_code ?? "").toUpperCase(),
          dest: String(d.destination ?? d.to ?? d.destination_code ?? "").toUpperCase(),
          depart: String(d.depart_at ?? d.departure_at ?? d.departure ?? ""),
        };
      })
      .filter((s) => s.orig && s.dest)
      .sort((a, b) => (a.depart < b.depart ? -1 : 1));
    if (segs.length) {
      const first = segs[0].orig;
      const last = segs[segs.length - 1].dest;
      if (first === last && segs.length > 1) {
        const mid = Math.max(0, Math.floor(segs.length / 2) - 1);
        destino = cityOf(segs[mid]?.dest || segs[0].dest);
      } else {
        destino = cityOf(last);
      }
    }
  }
  if (!destino && hotels.length) {
    const d = (hotels[0].details ?? {}) as Record<string, unknown>;
    const c = String(d.city ?? d.cidade ?? d.destination ?? "").trim();
    if (c) destino = c;
  }

  // Datas: ida (mais antiga) e volta (mais recente)
  const dates: string[] = [];
  flights.forEach((f) => {
    const d = (f.details ?? {}) as Record<string, unknown>;
    const v = String(d.depart_at ?? d.departure_at ?? d.departure ?? "");
    if (v) dates.push(v.slice(0, 10));
  });
  hotels.forEach((h) => {
    const d = (h.details ?? {}) as Record<string, unknown>;
    const ci = String(d.check_in ?? d.checkin ?? "");
    const co = String(d.check_out ?? d.checkout ?? "");
    if (ci) dates.push(ci.slice(0, 10));
    if (co) dates.push(co.slice(0, 10));
  });
  dates.sort();
  const ida = fmtBR(dates[0]);
  const volta = fmtBR(dates[dates.length - 1]);
  const periodo = ida && volta && ida !== volta ? `${ida} a ${volta}` : (ida || "");

  const cabecalho = [tipos, destino, periodo].filter(Boolean).join(" - ");

  const pax = detail.passengers.map((p) => p.full_name.trim()).filter(Boolean);
  const linhaPax = pax.length
    ? (pax.length === 1 ? `Passageiro: ${pax[0]}` : `Passageiros:\n- ${pax.join("\n- ")}`)
    : "";

  return [cabecalho || `Serviços de agenciamento de viagens — pedido #${detail.order.orderNumber}`, linhaPax]
    .filter(Boolean)
    .join("\n\n");
}


function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    processando: { label: "Processando", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    autorizado: { label: "Autorizado", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    cancelando: { label: "Cancelando", cls: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
    cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
    erro: { label: "Erro", cls: "bg-red-500/15 text-red-700 border-red-500/30" },
  };
  const x = map[s] ?? map.processando;
  return <Badge variant="outline" className={x.cls}>{x.label}</Badge>;
}

export function NfseCard({ detail }: { detail: OrderDetail }) {
  const { order } = detail;
  const qc = useQueryClient();
  const listFn = useServerFn(listNfseByOrder);
  const emitFn = useServerFn(emitirNfse);
  const consultFn = useServerFn(consultarNfse);
  const cancelFn = useServerFn(cancelarNfse);
  const getPersonFn = useServerFn(getPerson);

  const key = ["nfse", order.id] as const;
  const { data: emissoes = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { orderId: order.id } }),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((e) => e.status === "processando" || e.status === "cancelando")
        ? 8000 : false,
  });

  const personId = order.personId ?? null;
  const { data: personData } = useQuery({
    queryKey: ["nfse-person", personId],
    queryFn: () => getPersonFn({ data: { id: personId! } }),
    enabled: !!personId,
    staleTime: 60_000,
  });

  const [open, setOpen] = useState(false);
  const defaultDisc = buildAutoDescricao(detail);
  const [form, setForm] = useState({
    razaoSocial: "",
    cpfCnpj: "",
    email: "",
    phone: "",
    valor: String(order.totalPrice ?? 0),
    discriminacao: defaultDisc,
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });

  const buildInitialForm = () => {
    const p = personData?.person as Record<string, unknown> | undefined;
    const pStr = (k: string) => (p ? String(p[k] ?? "") : "");
    const primaryPhone = personData?.phones?.find((x) => x.is_primary)?.number
      ?? personData?.phones?.[0]?.number ?? "";
    const primaryEmail = personData?.emails?.find((x) => x.is_primary)?.address
      ?? personData?.emails?.[0]?.address ?? "";

    const pf = pStr("cpf");
    const pj = pStr("cnpj");
    const doc = pj || pf || order.payerCpf || order.cpf || "";
    const nome = pStr("legal_name") || pStr("name") || order.payerFullName || order.fullName || "";

    return {
      razaoSocial: nome,
      cpfCnpj: doc,
      email: primaryEmail || pStr("email") || order.payerEmail || order.email || "",
      phone: primaryPhone || pStr("mobile_phone") || pStr("phone") || order.payerPhone || "",
      valor: String(order.totalPrice ?? 0),
      discriminacao: defaultDisc,
      cep: pStr("zip") || order.payerZip || "",
      logradouro: pStr("address") || order.payerAddress || "",
      numero: pStr("number") || order.payerNumber || "",
      complemento: pStr("complement") || "",
      bairro: pStr("district") || order.payerDistrict || "",
      cidade: pStr("city") || order.payerCity || "",
      uf: pStr("state") || order.payerState || "",
    };
  };

  const openDialog = () => {
    setForm(buildInitialForm());
    setOpen(true);
  };

  // Se a pessoa carregar depois de abrir, repopula
  useEffect(() => {
    if (open && personData) setForm(buildInitialForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personData]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ orderId?: string }>;
      if (ce.detail?.orderId && ce.detail.orderId !== order.id) return;
      openDialog();
      document.getElementById("nfse-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("nfse:open-emit", handler as EventListener);
    return () => window.removeEventListener("nfse:open-emit", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, personData]);

  const emitMut = useMutation({
    mutationFn: async () => {
      const valor = Number(form.valor.replace(",", "."));
      if (!valor || valor <= 0) throw new Error("Valor inválido");
      if (!form.razaoSocial.trim()) throw new Error("Nome/Razão social é obrigatório");
      const doc = form.cpfCnpj.replace(/\D/g, "");
      if (doc.length !== 11 && doc.length !== 14) throw new Error("CPF ou CNPJ inválido");
      return emitFn({
        data: {
          orderId: order.id,
          valorServicos: valor,
          discriminacao: form.discriminacao.trim(),
          tomador: {
            razaoSocial: form.razaoSocial.trim(),
            cpfCnpj: doc,
            email: form.email.trim() || null,
            endereco: {
              logradouro: form.logradouro.trim() || null,
              numero: form.numero.trim() || null,
              complemento: form.complemento.trim() || null,
              bairro: form.bairro.trim() || null,
              uf: (form.uf.trim() || null)?.toUpperCase() ?? null,
              cep: form.cep.replace(/\D/g, "") || null,
            },
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("NFS-e enviada para processamento");
      setOpen(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });


  const consultMut = useMutation({
    mutationFn: (id: string) => consultFn({ data: { id } }),
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const cancelMut = useMutation({
    mutationFn: (v: { id: string; justificativa: string }) => cancelFn({ data: v }),
    onSuccess: () => { toast.success("Cancelamento solicitado"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div id="nfse-card" className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Nota Fiscal de Serviço (NFS-e)
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Emissão via Focus NFe · Paranavaí/PR · ISS 4% · Item 9.02
          </div>
        </div>
        <Button size="sm" onClick={openDialog}>
          <Send className="h-3.5 w-3.5 mr-1.5" /> Emitir NFS-e
        </Button>
      </div>

      {isLoading && <div className="mt-3 text-xs text-muted-foreground">Carregando…</div>}

      {emissoes.length > 0 && (
        <div className="mt-3 space-y-2">
          {emissoes.map((e) => (
            <div key={e.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {statusBadge(e.status)}
                  {e.numero_nfse && <span className="font-medium">Nº {e.numero_nfse}</span>}
                  <span className="text-muted-foreground truncate">{brl(Number(e.valor_servicos))}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2"
                    disabled={consultMut.isPending}
                    onClick={() => consultMut.mutate(e.id)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  {e.url_pdf && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                      <a href={e.url_pdf} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {e.status === "autorizado" && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600"
                      onClick={() => {
                        const j = window.prompt("Justificativa do cancelamento (mín. 15 caracteres):");
                        if (j && j.trim().length >= 15) cancelMut.mutate({ id: e.id, justificativa: j.trim() });
                        else if (j !== null) toast.error("Justificativa muito curta");
                      }}>
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {e.codigo_verificacao && (
                <div className="text-muted-foreground">
                  Cód. verificação: <span className="font-mono">{e.codigo_verificacao}</span>
                </div>
              )}
              {e.status === "erro" && (
                <div className="text-red-600 flex items-start gap-1">
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{(e.focus_response as { mensagem?: string } | null)?.mensagem || "Verifique os dados fiscais"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir NFS-e</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tomador</div>
              <div>
                <Label>Nome / Razão social</Label>
                <Input value={form.razaoSocial} onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CPF ou CNPJ</Label>
                  <Input value={form.cpfCnpj} onChange={(e) => setForm((f) => ({ ...f, cpfCnpj: e.target.value }))} />
                </div>
                <div>
                  <Label>Valor dos serviços (R$)</Label>
                  <Input value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>E-mail (opcional)</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Telefone (opcional)</Label>
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Endereço</div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>CEP</Label>
                  <Input value={form.cep} onChange={(e) => setForm((f) => ({ ...f, cep: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={form.logradouro} onChange={(e) => setForm((f) => ({ ...f, logradouro: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Número</Label>
                  <Input value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Complemento</Label>
                  <Input value={form.complemento} onChange={(e) => setForm((f) => ({ ...f, complemento: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.bairro} onChange={(e) => setForm((f) => ({ ...f, bairro: e.target.value }))} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.cidade} onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input maxLength={2} value={form.uf} onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))} />
                </div>
              </div>
            </div>

            <div>
              <Label>Discriminação do serviço</Label>
              <Textarea rows={8} className="font-mono text-xs" value={form.discriminacao} onChange={(e) => setForm((f) => ({ ...f, discriminacao: e.target.value }))} />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              ISS calculado: <b>{brl(Number(form.valor.replace(",", ".") || 0) * 0.04)}</b> · Item 9.02 · Paranavaí/PR
              {personId && personData && (
                <span className="ml-2 text-emerald-600">· Dados do tomador carregados do cadastro</span>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => emitMut.mutate()} disabled={emitMut.isPending}>
              {emitMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Emitir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
