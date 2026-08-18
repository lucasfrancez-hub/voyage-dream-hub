import { resolveRef, trpc } from "../src/lib/quotes/infotravel-api.server";
const ref: any = resolveRef(process.argv[2]!);
const booking: any = await trpc<any>(ref, "main.getBooking", { companyCode: ref.companyCode, bookingId: ref.bookingId, ...(ref.bookingIndex != null ? { bookingIndex: ref.bookingIndex } : {}), clientUrl: ref.clientUrl });
console.log("bookingAmount", JSON.stringify(booking?.bookingAmount));
const pkgs = booking.bookingPackages ?? [];
for (const p of pkgs) {
  const keys = Object.keys(p).filter(k => /amount|total|value|price|fare|tax/i.test(k));
  console.log("---", p.id, JSON.stringify(Object.fromEntries(keys.map(k=>[k,p[k]]))).slice(0,600));
}
