import { createServerFn } from "@tanstack/react-start";
import { submitCheckoutOrderHandler, validateCheckoutOrderInput } from "./checkout-order.server";

export const submitCheckoutOrder = createServerFn({ method: "POST" })
  .inputValidator(validateCheckoutOrderInput)
  .handler(submitCheckoutOrderHandler);