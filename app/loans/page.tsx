import type { Metadata } from "next";
import { LoansView } from "@/components/loans-view";
import { ReadyGate } from "@/components/ready-gate";

export const metadata: Metadata = { title: "Loans · Ledger" };

export default function LoansPage() {
  return (
    <ReadyGate>
      <LoansView />
    </ReadyGate>
  );
}
