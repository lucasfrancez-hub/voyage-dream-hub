import { resolveRef, trpc } from "../../src/lib/quotes/infotravel-api.server";
const url = "https://premium.infotravel.com.br/orcamento-web/pt/link?token=Q0FUSSB8IDU5NjQwNDggfCAxNkNGQkZENkY2MjVFQzc3OTREODUzQUQ5NDY5MDYxRQ==";
const ref = resolveRef(url);
const b: any = await trpc(ref, "main.getBooking", { companyCode: ref.companyCode, bookingId: ref.bookingId, ...(ref.bookingIndex != null ? { bookingIndex: ref.bookingIndex } : {}), clientUrl: ref.clientUrl });
for (const [i, p] of (b.bookingPackages ?? []).entries()) {
  console.log("=== pkg", i + 1);
  for (const bh of p.bookingHotels ?? []) for (const r of bh.rooms ?? []) console.log("room names", JSON.stringify(r.names), "adults", r.adults, "children", r.children, "ages", JSON.stringify(r.childrenAges ?? r.ages));
  for (const bf of p.bookingFlights ?? []) console.log("flight travellers", JSON.stringify(bf.travellers ?? bf.names), "keys", Object.keys(bf).join(","));
}
