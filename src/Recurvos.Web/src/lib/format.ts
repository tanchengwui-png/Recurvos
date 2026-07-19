export function formatCurrency(amount: number, currency = "MYR") {
  const normalizedCurrency = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency.trim())
    ? currency.trim().toUpperCase()
    : "MYR";

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
