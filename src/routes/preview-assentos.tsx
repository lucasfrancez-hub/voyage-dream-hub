// Página interna: gera 3 modelos de voucher com assentos para escolha visual.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { OrderDetail, OrderItem, OrderPassenger } from "@/lib/orders.functions";
import { generateVoucher, type SeatStyle } from "@/lib/voucher-pdf";

export const Route = createFileRoute("/preview-assentos")({
  component: PreviewAssentos,
  head: () => ({
    meta: [
      { title: "Modelos de assento no voucher — VIA AIR" },
      { name: "description", content: "Comparação de três modelos de exibição de assentos no voucher VIA AIR." },
      { property: "og:title", content: "Modelos de assento no voucher — VIA AIR" },
      { property: "og:description", content: "Comparação de três modelos de exibição de assentos no voucher." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const pax = (id: string, name: string, cpf: string, birth: string): OrderPassenger => ({
  id, order_id: "o1", full_name: name, passenger_type: "ADT", birth_date: birth,
  cpf, document: null, ticket_number: null, tickets: {}, sort_order: 0,
  doc_type: "cpf", passport_number: null, passport_issue_date: null, passport_expiry_date: null,
});

const P1 = pax("p1", "LUCAS FRANCEZ MARTINS", "123.456.789-00", "1990-04-12");
const P2 = pax("p2", "MARIANA SOUZA LIMA", "987.654.321-00", "1992-09-03");

const flight = (
  id: string, order: number, from: string, fromCity: string, to: string, toCity: string,
  dep: string, arr: string, airline: string, flightNo: string,
  direction: "outbound" | "return", seats: Record<string, string>,
): OrderItem => ({
  id, order_id: "o1", kind: "flight", status: "confirmed",
  title: `${from} → ${to}`, supplier_locator: "ABC123", sort_order: order,
  details: {
    from_iata: from, to_iata: to, from_city: fromCity, to_city: toCity,
    depart_at: dep, arrive_at: arr, airline, flight_number: flightNo,
    cabin_class: "Econômica", direction, seats,
    carrier_locator: "ABC123", import_group_id: "grp1",
    ticket_number: "957123456789",
  } as unknown as OrderItem["details"],
});

const detail: OrderDetail = {
  order: {
    id: "o1", orderNumber: "12345", createdAt: "2026-08-01T12:00:00Z", status: "confirmado",
    fullName: "LUCAS FRANCEZ MARTINS", email: "lucas@exemplo.com", phone: "(44) 99999-0000",
    cpf: "123.456.789-00", cnpj: null, birthDate: "1990-04-12", payerBirthDate: null,
    adults: 2, children: 0, totalPrice: 8200, expectedTotal: null, paymentMethod: "pix",
    notes: null, travelReason: null, coupon: null, notesLog: [], travelReasonLog: [],
    supplierName: null, supplierOrderNumber: null, supplierLogoUrl: null, airlineLocator: "ABC123",
    packageSnapshot: null as unknown as OrderDetail["order"]["packageSnapshot"],
    tripTitle: "ORLANDO 2026", sellerName: "Camila", sellerEmail: null, sellerPhone: null,
    payerFullName: null, payerCpf: null, payerIeRg: null, payerEmail: null, payerPhone: null,
    payerZip: null, payerAddress: null, payerNumber: null, payerDistrict: null,
    payerCity: null, payerState: null, personId: null,
  },
  passengers: [P1, P2],
  items: [
    flight("i1", 0, "CWB", "Curitiba", "GRU", "São Paulo", "2026-11-10T06:30:00", "2026-11-10T07:45:00", "LATAM", "LA3421", "outbound", { p1: "12A", p2: "12B" }),
    flight("i2", 1, "GRU", "São Paulo", "MCO", "Orlando", "2026-11-10T21:15:00", "2026-11-11T06:05:00", "LATAM", "LA8180", "outbound", { p1: "30H", p2: "30J" }),
    flight("i3", 2, "MCO", "Orlando", "GRU", "São Paulo", "2026-11-22T21:40:00", "2026-11-23T07:30:00", "LATAM", "LA8181", "return", { p1: "22C", p2: "22D" }),
    flight("i4", 3, "GRU", "São Paulo", "CWB", "Curitiba", "2026-11-23T10:10:00", "2026-11-23T11:20:00", "LATAM", "LA3428", "return", { p1: "9E", p2: "9F" }),
  ],
  financials: [],
  payments: [],
  itemPassengers: { i1: ["p1", "p2"], i2: ["p1", "p2"], i3: ["p1", "p2"], i4: ["p1", "p2"] },
};

const MODELOS: { style: SeatStyle; nome: string; desc: string }[] = [
  { style: "tabela", nome: "Modelo 1 — Coluna na tabela de passageiros", desc: "Assentos numa coluna própria (12A / 30H / 22C / 9E) com legenda da ordem dos trechos." },
  { style: "voo", nome: "Modelo 2 — Dentro do card do voo", desc: "Cada trecho mostra os assentos dos passageiros logo abaixo dos horários." },
  { style: "bloco", nome: "Modelo 3 — Bloco ASSENTOS MARCADOS", desc: "Seção própria em matriz: passageiro nas linhas, trechos nas colunas." },
];

function PreviewAssentos() {
  const [urls, setUrls] = useState<{ nome: string; desc: string; url: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: { nome: string; desc: string; url: string }[] = [];
      for (const m of MODELOS) {
        const blob = await generateVoucher(detail, "pt", m.style);
        out.push({ nome: m.nome, desc: m.desc, url: URL.createObjectURL(blob) });
      }
      if (alive) setUrls(out);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="text-xl font-bold text-foreground">Assentos no voucher — 3 modelos</h1>
      <div id="pdf-links" className="mt-4 grid gap-6">
        {urls.map((u) => (
          <section key={u.nome}>
            <h2 className="text-sm font-semibold text-foreground">{u.nome}</h2>
            <p className="text-xs text-muted-foreground">{u.desc}</p>
            <a className="text-xs text-primary underline" href={u.url} data-pdf={u.nome} target="_blank" rel="noreferrer">Abrir PDF</a>
            <iframe title={u.nome} src={u.url} className="mt-2 h-[900px] w-full rounded-lg border" />
          </section>
        ))}
      </div>
    </main>
  );
}
