import { obterToken } from "../src/lib/integrations/oner/session.server";
import { onerFetch } from "../src/lib/integrations/oner/client.server";
import { ONER_API } from "../src/lib/integrations/oner/config";
const cartId = process.argv[2]!;
const token = (await obterToken({} as any))!;
const base:any = { name:"Teste Pagador", firstName:"Teste", lastName:"Pagador", birthDate:"1990-01-01", cartId,
 documentNumber:"39053344705", documentTypeId:1, email:"lucas@voeair.com", mobilePhone:"44999999999",
 mobilePhoneCountryCode:55, country:{id:30}, city:"Paranavai", stateOrProvice:"PR", street:"Rua Teste",
 neighborhood:"Centro", houseNumber:"100", complement:"", zipCode:"87701000", acceptOptIn:false,
 notUpdateAddress:false, purchaseForCustomer:true };
const v:Record<string,any> = {
  falseSimples: {...base, purchaseForCustomer:false},
  trueComCliente: {...base, clientEmail:"lucas@voeair.com", clientDocumentNumber:"39053344705", clientDocumentTypeId:1},
  trueComClient: {...base, client:{ email:"lucas@voeair.com", documentNumber:"39053344705", documentTypeId:1, name:"Teste Pagador" }},
};
for (const [n,b] of Object.entries(v)) {
  const r = await onerFetch(`${ONER_API}/api/client/save-as-payer`, { token, method:"POST", body:b });
  console.log(n, r.call.status, (r.call.message||(r.raw||"")).slice(0,160));
}
