import { importInfotravelQuote } from "../../src/lib/quotes/infotravel-api.server";
const url = "https://premium.infotravel.com.br/orcamento-web/pt/link?token=Q0FUSSB8IDU5NjQwNDggfCAxNkNGQkZENkY2MjVFQzc3OTREODUzQUQ5NDY5MDYxRQ==";
const r = await importInfotravelQuote(url);
console.log("PAX", JSON.stringify(r.normalized.passengers));
