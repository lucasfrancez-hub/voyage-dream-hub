import { enviarPassageiros, lerCarrinho } from "../../src/lib/integrations/oner/checkout.server";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
const cartId = "898ef220-d3af-4179-9506-759b484052f5";
const token = (await tokenAtual())!;
const r = await enviarPassageiros(cartId, [{
  firstName: "LUCAS",
  lastName: "FRANCEZ",
  documentNumber: "07250027948",
  documentTypeId: 1,
  dateOfBirth: "1998-04-09",
  gender: 1,
  nationalityCountryId: 30,
  passengerTypeCode: "ADT",
  typeCode: "ADT",
  title: "MR",
  contact: { emailAddress: "lucas@voeair.com", ddi: 55, phoneNumber: "44999093642" },
}], token);
console.log("envio", r.ok, r.call.status); console.log(String(r.call.message));
const c = await lerCarrinho(cartId, token);
console.log("passageirosPersistidos", c.resumo?.passageirosPersistidos, "total", c.resumo?.total);
