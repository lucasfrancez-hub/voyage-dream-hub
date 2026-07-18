import { createFileRoute } from "@tanstack/react-router";
import { FinancialPage } from "@/components/financial/FinancialPage";

export const Route = createFileRoute("/admin/contas-receber")({
  component: () => <FinancialPage kind="receivable" />,
  head: () => ({ meta: [{ title: "Contas a receber — Admin" }] }),
});
