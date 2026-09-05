import { passhubPing } from "@/lib/passhub/client.server";
const r = await passhubPing();
console.log("PING:", r.ok, r.ok ? r.conta?.slice(0, 400) : r.erro);
