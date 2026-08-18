import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { FormPageBody } from "./FormPageBody";
import { StandardFormLayout } from "./StandardFormLayout";

type TransactionFormCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function TransactionFormCard({ title, description, children }: TransactionFormCardProps) {
  const sections = Children.toArray(children);
  const lastChild = sections.at(-1);
  const isActionFooter = isValidElement<{ className?: string }>(lastChild)
    && typeof lastChild.props.className === "string"
    && lastChild.props.className.includes("contact-page-actions");
  const formContent = isActionFooter ? sections.slice(0, -1) : sections;

  return (
    <FormPageBody className="transaction-form-page-body">
      <StandardFormLayout className="transaction-form-card">
        <header className="transaction-form-card-header">
          <h3>{title}</h3>
          <p>{description}</p>
        </header>
        <div className="form-page-content">{formContent}</div>
      </StandardFormLayout>
      {isActionFooter ? <div className="form-action-footer-boundary transaction-form-action-footer">{cloneElement(lastChild)}</div> : null}
    </FormPageBody>
  );
}
