import type { ReactNode } from "react";
import { StandardFormLayout } from "./StandardFormLayout";

type TransactionFormCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function TransactionFormCard({ title, description, children }: TransactionFormCardProps) {
  return <StandardFormLayout className="transaction-form-card">
    <header className="transaction-form-card-header">
      <h3>{title}</h3>
      <p>{description}</p>
    </header>
    {children}
  </StandardFormLayout>;
}
