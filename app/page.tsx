import { ExpensesView } from "@/components/expenses-view";
import { ReadyGate } from "@/components/ready-gate";

export default function ExpensesPage() {
  return (
    <ReadyGate>
      <ExpensesView />
    </ReadyGate>
  );
}
