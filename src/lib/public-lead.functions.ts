import { createServerFn } from "@tanstack/react-start";
import { createPublicFlightLeadHandler, publicFlightLeadInput } from "@/lib/public-lead.server";

export const createPublicFlightLead = createServerFn({ method: "POST" })
  .inputValidator((data) => publicFlightLeadInput.parse(data))
  .handler(createPublicFlightLeadHandler);
