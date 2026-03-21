using System.Text;

namespace Recurvos.Infrastructure.Templates;

public static class InvoiceHtmlTemplateRenderer
{
    public static string Render(InvoiceTemplateModel model)
    {
        var currency = InvoiceTemplateSupport.NormalizeCurrency(model.Currency);
        var paymentGatewayLink = !string.IsNullOrWhiteSpace(model.PaymentGatewayLink) ? model.PaymentGatewayLink : model.PaymentLink;
        var hasPaymentDetails =
            !string.IsNullOrWhiteSpace(model.BankName) ||
            !string.IsNullOrWhiteSpace(model.BankAccountName) ||
            !string.IsNullOrWhiteSpace(model.BankAccount) ||
            !string.IsNullOrWhiteSpace(paymentGatewayLink) ||
            !string.IsNullOrWhiteSpace(model.PaymentConfirmationLink);
        var hasPaymentQr = !string.IsNullOrWhiteSpace(model.PaymentQrDataUrl);
        var builder = new StringBuilder();

        builder.Append(
            """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Invoice</title>
                <style>
                    :root { color-scheme: light; }
                    * { box-sizing: border-box; }
                    body { margin: 0; padding: 24px; background: #eef2f7; color: #0f172a; font-family: "Segoe UI", Arial, sans-serif; }
                    .sheet { width: 210mm; min-height: 297mm; max-width: 100%; margin: 0 auto; background: #ffffff; padding: 18mm 16mm; box-shadow: 0 14px 38px rgba(15, 23, 42, 0.08); }
                    .header { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; }
                    .issuer { max-width: 55%; }
                    .issuer img { max-width: 180px; max-height: 56px; margin-bottom: 18px; object-fit: contain; display: block; }
                    .issuer-name { font-size: 26px; font-weight: 700; line-height: 1.2; margin-bottom: 10px; }
                    .issuer-meta { color: #475569; line-height: 1.7; }
                    .invoice-meta { min-width: 240px; text-align: right; border: 1px solid #dbe3ef; background: #fcfdfe; border-radius: 16px; padding: 16px 18px; }
                    .title { font-size: 34px; font-weight: 800; letter-spacing: 0.08em; margin: 0 0 20px; }
                    .meta-row { display: grid; grid-template-columns: 110px 1fr; gap: 10px; margin-bottom: 10px; }
                    .meta-label { color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; text-align: left; }
                    .meta-value { font-weight: 600; }
                    .section { margin-top: 26px; }
                    .section-title { margin: 0 0 12px; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em; }
                    .split { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 28px; align-items: start; }
                    .card { border: 1px solid #dbe3ef; border-radius: 16px; background: #fcfdfe; padding: 16px 18px; }
                    .bill-to { line-height: 1.7; }
                    .bill-to-name { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                    thead th { text-align: left; padding: 12px 10px; border-bottom: 1px solid #cbd5e1; color: #64748b; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; background: #f8fafc; }
                    tbody td { padding: 14px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                    th.num, td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
                    .totals { width: 100%; }
                    .total-row { display: flex; justify-content: space-between; gap: 14px; padding: 8px 0; }
                    .total-row.final { margin-top: 8px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 16px; font-weight: 700; }
                    .total-row span:last-child, .meta-value { font-variant-numeric: tabular-nums; }
                    .payment { display: grid; grid-template-columns: minmax(0, 1fr) 108px; gap: 18px; align-items: start; }
                    .payment-details { display: grid; gap: 8px; }
                    .payment-row { display: grid; grid-template-columns: 92px 1fr; gap: 14px; }
                    .payment-label { color: #64748b; font-size: 12px; }
                    .payment-value { color: #0f172a; line-height: 1.6; word-break: break-word; }
                    .payment-qr { width: 108px; height: 108px; border: 1px solid #dbe3ef; display: flex; align-items: center; justify-content: center; overflow: hidden; }
                    .payment-qr img { width: 100%; height: 100%; object-fit: contain; }
                    .footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #dbe3ef; color: #64748b; font-size: 12px; line-height: 1.7; }
                    .footer p { margin: 0 0 6px; }
                    @media print {
                        body { background: #ffffff; padding: 0; }
                        .sheet { width: auto; min-height: auto; box-shadow: none; padding: 0; }
                    }
                    @media (max-width: 820px) {
                        body { padding: 12px; }
                        .sheet { padding: 20px; }
                        .header, .payment, .split { display: block; }
                        .invoice-meta { margin-top: 24px; text-align: left; }
                        .meta-row { grid-template-columns: 120px 1fr; }
                        .issuer { max-width: none; }
                        .payment-qr { margin-top: 18px; }
                    }
                </style>
            </head>
            <body>
            """
        );

        builder.Append("""<article class="sheet">""");
        builder.Append("""<header class="header">""");
        builder.Append("""<div class="issuer">""");
        if (!string.IsNullOrWhiteSpace(model.LogoDataUrl))
        {
            builder.Append($"""<img src="{InvoiceTemplateSupport.Encode(model.LogoDataUrl)}" alt="Company logo" />""");
        }

        builder.Append($"""<div class="issuer-name">{InvoiceTemplateSupport.Encode(model.IssuerName)}</div>""");
        builder.Append($"""<div class="issuer-meta">{InvoiceTemplateSupport.JoinNonEmpty(
            model.IssuerRegistrationNumber is null ? null : $"Registration No: {model.IssuerRegistrationNumber}",
            model.IssuerSstNumber is null ? null : $"SST Registration No: {model.IssuerSstNumber}",
            model.IssuerEmail,
            model.IssuerAddress)}</div>""");
        builder.Append("</div>");

        builder.Append("""<div class="invoice-meta">""");
        builder.Append("""<h1 class="title">INVOICE</h1>""");
        AppendMeta(builder, "Invoice No", model.InvoiceNumber);
        AppendMeta(builder, "Invoice Date", model.InvoiceDateUtc.ToString("dd MMM yyyy"));
        AppendMeta(builder, "Due Date", model.DueDateUtc.ToString("dd MMM yyyy"));
        AppendMeta(builder, "Currency", currency);
        builder.Append("</div>");
        builder.Append("</header>");

        builder.Append("""<section class="section split">""");
        builder.Append("""<div class="card"><h2 class="section-title">Bill To</h2><div class="bill-to">""");
        builder.Append($"""<div class="bill-to-name">{InvoiceTemplateSupport.Encode(model.CustomerName)}</div>""");
        builder.Append($"""<div>{InvoiceTemplateSupport.JoinNonEmpty(model.CustomerCompany, model.CustomerAddress)}</div>""");
        builder.Append("""</div></div>""");
        builder.Append("""<div class="card"><h2 class="section-title">Summary</h2><div class="totals">""");
        AppendTotal(builder, "Subtotal", InvoiceTemplateSupport.FormatAmount(model.Subtotal));
        if (model.ShowTaxSection)
        {
            AppendTotal(builder, model.TaxLabel ?? "Tax", InvoiceTemplateSupport.FormatAmount(model.TaxTotal));
        }
        AppendTotal(builder, "Total", InvoiceTemplateSupport.FormatAmount(model.AmountDue), true);
        builder.Append("""</div></div></section>""");

        builder.Append("""<section class="section card"><h2 class="section-title">Invoice Items</h2><table><thead><tr>""");
        builder.Append("""<th>Description</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th>""");
        builder.Append("</tr></thead><tbody>");
        foreach (var item in model.Items)
        {
            builder.Append("<tr>");
            builder.Append($"""<td>{InvoiceTemplateSupport.Encode(item.Description)}</td>""");
            builder.Append($"""<td class="num">{item.Quantity:0.##}</td>""");
            builder.Append($"""<td class="num">{InvoiceTemplateSupport.FormatAmount(item.UnitPrice)}</td>""");
            builder.Append($"""<td class="num">{InvoiceTemplateSupport.FormatAmount(item.LineTotal)}</td>""");
            builder.Append("</tr>");
        }
        builder.Append("</tbody></table></section>");

        if (hasPaymentDetails || hasPaymentQr)
        {
            builder.Append("""<section class="section card">""");
            builder.Append("""<h2 class="section-title">Payment</h2>""");
            builder.Append("""<div class="payment">""");
            if (hasPaymentDetails)
            {
                builder.Append("""<div class="payment-details">""");
                AppendPaymentDetail(builder, "Bank", model.BankName);
                AppendPaymentDetail(builder, "Account Name", model.BankAccountName);
                AppendPaymentDetail(builder, "Account No", model.BankAccount);
                AppendPaymentDetail(builder, "Pay Online", paymentGatewayLink);
                AppendPaymentDetail(builder, "After Payment", string.IsNullOrWhiteSpace(model.PaymentConfirmationLink)
                    ? null
                    : "Once payment is completed, click the confirmation link below to upload your proof of payment.");
                AppendPaymentDetail(builder, "Payment Confirmation", model.PaymentConfirmationLink);
                builder.Append("</div>");
            }
            else
            {
                builder.Append("""<div></div>""");
            }

            if (hasPaymentQr)
            {
                builder.Append("""<div class="payment-qr">""");
                builder.Append($"""<img src="{InvoiceTemplateSupport.Encode(model.PaymentQrDataUrl!)}" alt="Payment QR" />""");
                builder.Append("</div>");
            }
            builder.Append("</div></section>");
        }

        builder.Append("""<footer class="footer">""");
        if (!string.IsNullOrWhiteSpace(model.Notes))
        {
            builder.Append($"""<p>{InvoiceTemplateSupport.Encode(model.Notes)}</p>""");
        }
        if (model.SystemGeneratedFlag)
        {
            builder.Append("""<p>This is a system generated invoice.</p>""");
        }
        builder.Append("</footer></article></body></html>");

        return builder.ToString();
    }

    private static void AppendMeta(StringBuilder builder, string label, string value)
    {
        builder.Append("""<div class="meta-row">""");
        builder.Append($"""<div class="meta-label">{InvoiceTemplateSupport.Encode(label)}</div>""");
        builder.Append($"""<div class="meta-value">{InvoiceTemplateSupport.Encode(value)}</div>""");
        builder.Append("</div>");
    }

    private static void AppendTotal(StringBuilder builder, string label, string value, bool final = false)
    {
        builder.Append($"""<div class="total-row{(final ? " final" : string.Empty)}">""");
        builder.Append($"""<span>{InvoiceTemplateSupport.Encode(label)}</span>""");
        builder.Append($"""<span>{InvoiceTemplateSupport.Encode(value)}</span>""");
        builder.Append("</div>");
    }

    private static void AppendPaymentDetail(StringBuilder builder, string label, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        builder.Append("""<div class="payment-row">""");
        builder.Append($"""<div class="payment-label">{InvoiceTemplateSupport.Encode(label)}</div>""");
        builder.Append($"""<div class="payment-value">{InvoiceTemplateSupport.Encode(value)}</div>""");
        builder.Append("</div>");
    }
}
