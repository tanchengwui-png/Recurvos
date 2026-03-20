export const packageFeatureIntro = "Includes:";

export const packageTrustIntro = "Good to know:";

export type PackageMarketingContent = {
  fit: string;
  lead: string;
  highlights: string[];
  note: string;
  cta: string;
};

const packageMarketingContentByCode: Record<string, PackageMarketingContent> = {
  starter: {
    fit: "Best for smaller teams getting recurring billing in place for the first time.",
    lead: "A practical entry package for small businesses that want recurring billing in place without paying for advanced finance tooling too early.",
    highlights: [
      "1 billing profile, unlimited products and plans, and up to 500 customers.",
      "Auto invoices, invoice emails, WhatsApp copy message, and payment proof upload.",
      "A lower-cost starting point for clean recurring billing basics.",
    ],
    note: "Use this when you want to start billing properly first, then upgrade later as your collection workflow grows.",
    cta: "Start with Basic",
  },
  growth: {
    fit: "Best for growing businesses that need stronger follow-up and customer capacity.",
    lead: "Built for growing teams that need stronger reminder workflows, more customer capacity, and better WhatsApp handling without jumping to a full premium setup.",
    highlights: [
      "3 billing profiles, unlimited products and plans, and up to 5,000 customers.",
      "Adds click-to-send WhatsApp reminders and configurable WhatsApp content.",
      "A stronger day-to-day package for active billing and follow-up work.",
    ],
    note: "This is the strongest all-round package for businesses that have outgrown basic billing but do not need premium finance controls yet.",
    cta: "Choose Growth",
  },
  premium: {
    fit: "Best for serious billing operations that need collection control and finance exports.",
    lead: "A full operational package for businesses that want stronger collection control, payment links, finance exports, and higher WhatsApp sending capacity.",
    highlights: [
      "Up to 5 billing profiles, unlimited products and plans, and 50,000 customers.",
      "Adds WhatsApp auto-send, payment links, customer payment proof upload, and gateway setup.",
      "Includes finance CSV exports for invoices, payments, refunds, and credit notes.",
    ],
    note: "Choose this when billing volume is higher and you want the software to support both collections and finance operations more seriously.",
    cta: "Choose Premium",
  },
};

const defaultPackageMarketingContent: PackageMarketingContent = {
  fit: "Choose the package that matches your current billing stage.",
  lead: "A practical recurring billing package for teams that want a cleaner way to invoice, collect, and manage subscribers.",
  highlights: [
    "Choose the package that matches your current billing stage.",
    "Move up later when your operations become more complex.",
    "Keep your customer and billing workflow in one place.",
  ],
  note: "You can always review and adjust your package as your business grows.",
  cta: "Choose package",
};

export function getPackageMarketingContent(code: string): PackageMarketingContent {
  return packageMarketingContentByCode[code.toLowerCase()] ?? defaultPackageMarketingContent;
}

export function getPackageDisplayName(code: string, fallbackName?: string): string {
  return code.trim().toLowerCase() === "starter" ? "Basic" : (fallbackName || code);
}

export const packageTrustSummary = [
  "Start lean today and upgrade only when your billing operation grows.",
  "Keep your customer and invoice data in your own hands from day one.",
  "Move in without lock-in and take your billing records with you when needed.",
];

export type PackageFeatureDefinition = {
  value: string;
  label: string;
  description: string;
  category: "Core billing" | "Notifications" | "Payments" | "Finance";
};

export const packageFeatureDefinitions: PackageFeatureDefinition[] = [
  {
    value: "Customer management",
    label: "Customer management",
    description: "Create and manage customer records for billing.",
    category: "Core billing",
  },
  {
    value: "Manual invoices",
    label: "Manual invoices",
    description: "Create one-off invoices manually.",
    category: "Core billing",
  },
  {
    value: "Auto invoice",
    label: "Auto invoices",
    description: "Generate recurring invoices automatically from subscriptions.",
    category: "Core billing",
  },
  {
    value: "Basic reports",
    label: "Basic reports",
    description: "Use the dashboard and basic billing summaries.",
    category: "Finance",
  },
  {
    value: "Auto invoice notification (Email)",
    label: "Invoice emails",
    description: "Send invoices and billing reminder emails to customers.",
    category: "Notifications",
  },
  {
    value: "Auto invoice notification (WhatsApp)",
    label: "Invoice WhatsApp messages",
    description: "Send invoice and billing reminder messages through WhatsApp.",
    category: "Notifications",
  },
  {
    value: "Payment reminders",
    label: "Payment reminders",
    description: "Use reminder timing rules for overdue or upcoming invoices.",
    category: "Notifications",
  },
  {
    value: "Generate WhatsApp friendly reminder (Copy and Paste)",
    label: "WhatsApp copy message",
    description: "Generate a WhatsApp reminder message for copy and paste.",
    category: "Notifications",
  },
  {
    value: "Generate WhatsApp friendly reminder (Browser copy and paste, click send to send)",
    label: "WhatsApp click-to-send",
    description: "Open the reminder directly in WhatsApp Web or app with a click-to-send link.",
    category: "Notifications",
  },
  {
    value: "Configurable WhatsApp",
    label: "Configurable WhatsApp",
    description: "Let the subscriber edit their WhatsApp reminder settings and wording.",
    category: "Notifications",
  },
  {
    value: "Payment tracking",
    label: "Payment tracking",
    description: "Record payments, reversals, refunds, and receipts.",
    category: "Payments",
  },
  {
    value: "Generate payment link",
    label: "Payment links",
    description: "Generate payment links from the configured gateway, such as Billplz.",
    category: "Payments",
  },
  {
    value: "Payment record screen for customer to upload their payment",
    label: "Customer payment proof upload",
    description: "Allow customers to upload their payment proof from the public payment screen.",
    category: "Payments",
  },
  {
    value: "Finance exports",
    label: "Finance exports",
    description: "Export invoices, payments, refunds, and credit notes to CSV.",
    category: "Finance",
  },
  {
    value: "Payment gateway configuration",
    label: "Payment gateway setup",
    description: "Use and manage payment gateway settings for payment links and callbacks.",
    category: "Payments",
  },
];
