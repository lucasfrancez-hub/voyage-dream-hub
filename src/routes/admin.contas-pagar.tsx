import { createFileRoute } from "@tanstack/react-router";
import { FinancialPage } from "@/components/financial/FinancialPage";

export const Route = createFileRoute("/admin/contas-pagar")({
  component: () => <FinancialPage kind="payable" />,
  head: () => ({ meta: [{ title: "Contas a pagar — Admin" }] }),
});
