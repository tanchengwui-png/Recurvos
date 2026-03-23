using System.Net;

namespace Recurvos.Infrastructure.Templates;

public static class EmailTemplateRenderer
{
    public static string RenderActionEmail(
        string eyebrow,
        string title,
        string intro,
        string actionLabel,
        string actionUrl,
        IReadOnlyList<string> bulletPoints,
        string footerNote)
    {
        var encodedEyebrow = Encode(eyebrow);
        var encodedTitle = Encode(title);
        var encodedIntro = Encode(intro);
        var encodedActionLabel = Encode(actionLabel);
        var encodedFooterNote = Encode(footerNote);
        var safeUrl = Encode(actionUrl);
        var bullets = string.Join(string.Empty, bulletPoints.Select(item => $"<li>{Encode(item)}</li>"));

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{encodedTitle}}</title>
        </head>
        <body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7;padding:20px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
                  <tr>
                    <td style="padding:22px 28px;background:#f97316;background-image:linear-gradient(135deg,#f97316,#fb7185);color:#ffffff;">
                      <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.88;font-weight:700;color:#ffffff;">{{encodedEyebrow}}</div>
                      <div style="font-size:28px;line-height:1.15;font-weight:700;margin-top:8px;color:#ffffff;">{{encodedTitle}}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 28px 28px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">{{encodedIntro}}</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                        <tr>
                          <td style="padding:20px 22px;">
                            <a href="{{safeUrl}}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">{{encodedActionLabel}}</a>
                            <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#64748b;">If the button does not work, copy and paste this link into your browser:</p>
                            <p style="margin:8px 0 0;font-size:13px;line-height:1.7;word-break:break-all;">
                              <a href="{{safeUrl}}" style="color:#ea580c;text-decoration:none;">{{safeUrl}}</a>
                            </p>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:18px 20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
                        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c;font-weight:700;margin-bottom:10px;">Before you continue</div>
                        <ul style="margin:0;padding-left:20px;color:#7c2d12;font-size:14px;line-height:1.7;">
                          {{bullets}}
                        </ul>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">{{encodedFooterNote}}</p>
                      <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#94a3b8;">Recurvos Billing Platform</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """;
    }

    public static string RenderInvoiceEmail(
        string issuerName,
        string customerName,
        string invoiceNumber,
        string amountDue,
        string dueDateLabel,
        string? paymentUrl,
        bool isReminder)
    {
        var title = isReminder ? $"Payment reminder for {invoiceNumber}" : $"Invoice {invoiceNumber}";
        var intro = isReminder
            ? $"Hi {customerName}, this is a reminder that invoice {invoiceNumber} from {issuerName} is still outstanding."
            : $"Hi {customerName}, {issuerName} has issued invoice {invoiceNumber}.";
        var isPaymentConfirmationLink = !string.IsNullOrWhiteSpace(paymentUrl)
            && paymentUrl.Contains("/payment-confirmation", StringComparison.OrdinalIgnoreCase);
        var actionLabel = string.IsNullOrWhiteSpace(paymentUrl)
            ? "View invoice details"
            : isPaymentConfirmationLink
                ? "Confirm payment"
                : "Pay invoice";
        var safePaymentUrl = string.IsNullOrWhiteSpace(paymentUrl) ? null : Encode(paymentUrl);
        var encodedTitle = Encode(title);
        var encodedIntro = Encode(intro);
        var encodedIssuerName = Encode(issuerName);
        var encodedInvoiceNumber = Encode(invoiceNumber);
        var encodedAmountDue = Encode(amountDue);
        var encodedDueDate = Encode(dueDateLabel);
        var encodedCustomerName = Encode(customerName);
        var encodedActionLabel = Encode(actionLabel);
        var encodedReminderLabel = Encode(isReminder ? "Payment reminder" : "Invoice delivery");
        var ctaBlock = safePaymentUrl is null
            ? """
                            <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">No payment link is included yet. Please contact the issuer if you need an online payment option.</p>
              """
            : $$"""
                            <a href="{{safePaymentUrl}}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;">{{encodedActionLabel}}</a>
                            <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#64748b;">If the button does not work, copy and paste this link into your browser:</p>
                            <p style="margin:8px 0 0;font-size:13px;line-height:1.7;word-break:break-all;">
                              <a href="{{safePaymentUrl}}" style="color:#ea580c;text-decoration:none;">{{safePaymentUrl}}</a>
                            </p>
              """;

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{encodedTitle}}</title>
        </head>
        <body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7;padding:20px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
                  <tr>
                    <td style="padding:22px 28px;background:#0f172a;background-image:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;">
                      <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.88;font-weight:700;color:#ffffff;">{{encodedReminderLabel}}</div>
                      <div style="font-size:28px;line-height:1.15;font-weight:700;margin-top:8px;color:#ffffff;">{{encodedTitle}}</div>
                      <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#e2e8f0;">From {{encodedIssuerName}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 28px 28px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">{{encodedIntro}}</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                        <tr>
                          <td style="padding:20px 22px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                              <tr>
                                <td style="padding:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Invoice</td>
                                <td align="right" style="padding:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">{{encodedInvoiceNumber}}</td>
                              </tr>
                              <tr>
                                <td style="padding:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Amount due</td>
                                <td align="right" style="padding:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">{{encodedAmountDue}}</td>
                              </tr>
                              <tr>
                                <td style="padding:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Due date</td>
                                <td align="right" style="padding:0;font-size:15px;color:#334155;">{{encodedDueDate}}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:18px 20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;margin-bottom:20px;">
                        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c;font-weight:700;margin-bottom:10px;">For {{encodedCustomerName}}</div>
                        <p style="margin:0;font-size:14px;line-height:1.7;color:#7c2d12;">{{Encode(isPaymentConfirmationLink ? "Please review the invoice details and submit your payment confirmation after you have paid by bank transfer or another manual method." : "Please review the invoice details and arrange payment by the due date shown above.")}}</p>
                      </div>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;">
                        <tr>
                          <td style="padding:20px 22px;">
                            {{ctaBlock}}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">This message was sent by {{encodedIssuerName}} through the Recurvos billing platform.</p>
                      <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#94a3b8;">Recurvos Billing Platform</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """;
    }

    public static string RenderCreditNoteEmail(
        string issuerName,
        string customerName,
        string originalInvoiceNumber,
        string creditNoteNumber,
        string creditAmount,
        string newOutstandingAmount,
        string issuedDateLabel)
    {
        var encodedTitle = Encode($"Credit note for {originalInvoiceNumber}");
        var encodedIssuerName = Encode(issuerName);
        var encodedCustomerName = Encode(customerName);
        var encodedOriginalInvoiceNumber = Encode(originalInvoiceNumber);
        var encodedCreditNoteNumber = Encode(creditNoteNumber);
        var encodedCreditAmount = Encode(creditAmount);
        var encodedNewOutstandingAmount = Encode(newOutstandingAmount);
        var encodedIssuedDate = Encode(issuedDateLabel);

        return $$"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{{encodedTitle}}</title>
        </head>
        <body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7;padding:20px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
                  <tr>
                    <td style="padding:22px 28px;background:#0f172a;background-image:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;">
                      <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.88;font-weight:700;color:#ffffff;">Credit note issued</div>
                      <div style="font-size:28px;line-height:1.15;font-weight:700;margin-top:8px;color:#ffffff;">{{encodedTitle}}</div>
                      <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#e2e8f0;">From {{encodedIssuerName}}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 28px 28px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#334155;">Hi {{encodedCustomerName}}, {{encodedIssuerName}} has issued a credit note for invoice {{encodedOriginalInvoiceNumber}}. The credit note PDF is attached to this email.</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
                        <tr>
                          <td style="padding:20px 22px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                              <tr>
                                <td style="padding:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Original invoice</td>
                                <td align="right" style="padding:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">{{encodedOriginalInvoiceNumber}}</td>
                              </tr>
                              <tr>
                                <td style="padding:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Credit note ref</td>
                                <td align="right" style="padding:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">{{encodedCreditNoteNumber}}</td>
                              </tr>
                              <tr>
                                <td style="padding:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Credit amount</td>
                                <td align="right" style="padding:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">{{encodedCreditAmount}}</td>
                              </tr>
                              <tr>
                                <td style="padding:0 0 12px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">New outstanding</td>
                                <td align="right" style="padding:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">{{encodedNewOutstandingAmount}}</td>
                              </tr>
                              <tr>
                                <td style="padding:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Issued date</td>
                                <td align="right" style="padding:0;font-size:15px;color:#334155;">{{encodedIssuedDate}}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      <div style="padding:18px 20px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;">
                        <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c;font-weight:700;margin-bottom:10px;">Attached document</div>
                        <p style="margin:0;font-size:14px;line-height:1.7;color:#7c2d12;">Please keep this credit note for your records. It adjusts invoice {{encodedOriginalInvoiceNumber}} and leaves a new outstanding balance of {{encodedNewOutstandingAmount}}.</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;">This message was sent by {{encodedIssuerName}} through the Recurvos billing platform.</p>
                      <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#94a3b8;">Recurvos Billing Platform</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """;
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
