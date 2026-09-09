import { onerFetch } from "../../src/lib/integrations/oner/client.server";
import { ONER_API } from "../../src/lib/integrations/oner/config";
import { tokenAtual } from "../../src/lib/integrations/oner/session.server";
const cartId = "898ef220-d3af-4179-9506-759b484052f5";
const token = (await tokenAtual())!;
const pax = {
  firstName: "LUCAS", lastName: "FRANCEZ", documentNumber: "07250027948", documentTypeId: 1,
  dateOfBirth: "1998-04-09T00:00:00", gender: 1, nationalityCountryId: 30,
  passengerTypeCode: "ADT", typeCode: "ADT", title: "MR",
  contact: { emailAddress: "lucas@voeair.com", ddi: 55, phoneNumber: "44999093642" },
};
const r = await onerFetch(`${ONER_API}/api/booking/flight/passenger/${cartId}`, { method: "PUT", body: { cartId, passengers: [pax] }, token });
console.log(r.call.status);
console.log(r.raw.slice(0, 3000));
