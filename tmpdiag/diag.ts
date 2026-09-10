import { obterToken } from "../src/lib/integrations/oner/session.server";
import { salvarPagador } from "../src/lib/integrations/oner/payment.server";
const cartId = process.argv[2]!;
const token = await obterToken({} as any);
if (!token) { console.log("SEM TOKEN"); process.exit(0); }
const r = await salvarPagador(token, {
  cartId, firstName: "Teste", lastName: "Pagador", documentNumber: "39053344705",
  documentTypeId: 1, birthDate: "1990-01-01", email: "lucas@voeair.com",
  mobilePhone: "44999999999", mobilePhoneCountryCode: 55, countryId: 30,
  city: "Paranavai", stateOrProvice: "PR", street: "Rua Teste", neighborhood: "Centro",
  houseNumber: "100", complement: "", zipCode: "87701000",
});
console.log(JSON.stringify(r.call), (r.raw||"").slice(0,800));
