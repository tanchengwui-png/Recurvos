using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Recurvos.Infrastructure.Templates;

public static class InvoicePdfTemplate
{
    public static byte[] Render(InvoiceTemplateModel model)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        var currency = InvoiceTemplateSupport.NormalizeCurrency(model.Currency);
        var paymentGatewayLink = !string.IsNullOrWhiteSpace(model.PaymentGatewayLink) ? model.PaymentGatewayLink : model.PaymentLink;
        var hasPaymentDetails =
            !string.IsNullOrWhiteSpace(model.BankName) ||
            !string.IsNullOrWhiteSpace(model.BankAccountName) ||
            !string.IsNullOrWhiteSpace(model.BankAccount) ||
            !string.IsNullOrWhiteSpace(paymentGatewayLink) ||
            !string.IsNullOrWhiteSpace(model.PaymentConfirmationLink);
        var hasPaymentQr = !string.IsNullOrWhiteSpace(model.PaymentQrDataUrl);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(42);
                page.DefaultTextStyle(x => x.FontSize(10).FontColor("#334155"));

                page.Content().Column(column =>
                {
                    column.Spacing(18);

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Column(left =>
                        {
                            left.Spacing(6);
                            if (model.LogoBytes is { Length: > 0 })
                            {
                                left.Item().Height(42).Width(160).Image(model.LogoBytes).FitArea();
                            }

                            left.Item().Text(model.IssuerName).FontSize(22).SemiBold().FontColor("#0F172A");
                            if (!string.IsNullOrWhiteSpace(model.IssuerRegistrationNumber))
                            {
                                left.Item().Text($"Registration No: {model.IssuerRegistrationNumber}");
                            }

                            if (!string.IsNullOrWhiteSpace(model.IssuerSstNumber))
                            {
                                left.Item().Text($"SST Registration No: {model.IssuerSstNumber}");
                            }

                            if (!string.IsNullOrWhiteSpace(model.IssuerEmail))
                            {
                                left.Item().Text(model.IssuerEmail);
                            }

                            if (!string.IsNullOrWhiteSpace(model.IssuerAddress))
                            {
                                left.Item().Text(model.IssuerAddress);
                            }
                        });

                        row.ConstantItem(228).Element(container => SectionCard(container, card =>
                        {
                            card.Column(right =>
                            {
                                right.Spacing(10);
                                right.Item().AlignRight().Text("INVOICE").FontSize(28).SemiBold().FontColor("#0F172A");
                                MetaRow(right, "Invoice No", model.InvoiceNumber);
                                MetaRow(right, "Invoice Date", model.InvoiceDateUtc.ToString("dd MMM yyyy"));
                                MetaRow(right, "Due Date", model.DueDateUtc.ToString("dd MMM yyyy"));
                                MetaRow(right, "Currency", currency);
                            });
                        }));
                    });

                    column.Item().Row(row =>
                    {
                        row.RelativeItem().Element(container => SectionCard(container, card =>
                        {
                            card.Column(section =>
                            {
                                section.Spacing(8);
                                section.Item().Text("Bill To").FontSize(10).SemiBold().FontColor("#64748B");
                                section.Item().Text(model.CustomerName).FontSize(13).SemiBold().FontColor("#0F172A");
                                AddLines(section, model.CustomerCompany, model.CustomerAddress);
                            });
                        }));

                        row.ConstantItem(228).Element(container => SectionCard(container, card =>
                        {
                            card.Column(summary =>
                            {
                                summary.Spacing(8);
                                summary.Item().Text("Summary").FontSize(10).SemiBold().FontColor("#64748B");
                                SummaryRow(summary, "Subtotal", InvoiceTemplateSupport.FormatAmount(model.Subtotal));
                                if (model.ShowTaxSection)
                                {
                                    SummaryRow(summary, model.TaxLabel ?? "Tax", InvoiceTemplateSupport.FormatAmount(model.TaxTotal));
                                }
                                summary.Item().LineHorizontal(1).LineColor("#CBD5E1");
                                SummaryRow(summary, "Total", InvoiceTemplateSupport.FormatAmount(model.AmountDue), true);
                            });
                        }));
                    });

                    column.Item().Element(container => SectionCard(container, card =>
                    {
                        card.Column(section =>
                        {
                            section.Spacing(8);
                            section.Item().Text("Invoice Items").FontSize(10).SemiBold().FontColor("#64748B");
                            section.Item().Table(table =>
                            {
                                table.ColumnsDefinition(columns =>
                                {
                                    columns.RelativeColumn(5.2f);
                                    columns.RelativeColumn(1.0f);
                                    columns.RelativeColumn(1.9f);
                                    columns.RelativeColumn(2.1f);
                                });

                                table.Header(header =>
                                {
                                    HeaderCell(header, "Description");
                                    HeaderCell(header, "Qty", true);
                                    HeaderCell(header, "Unit Price", true);
                                    HeaderCell(header, "Line Total", true);
                                });

                                foreach (var item in model.Items)
                                {
                                    BodyCell(table, item.Description);
                                    BodyCell(table, item.Quantity.ToString("0.##"), true);
                                    BodyCell(table, InvoiceTemplateSupport.FormatAmount(item.UnitPrice), true);
                                    BodyCell(table, InvoiceTemplateSupport.FormatAmount(item.LineTotal), true);
                                }
                            });
                        });
                    }));

                    if (hasPaymentDetails || hasPaymentQr)
                    {
                        column.Item().Element(container => SectionCard(container, card =>
                        {
                            card.Column(payment =>
                            {
                                payment.Spacing(8);
                                payment.Item().Text("Payment").FontSize(10).SemiBold().FontColor("#64748B");
                                payment.Item().Row(row =>
                                {
                                    if (hasPaymentDetails)
                                    {
                                        row.RelativeItem().PaddingRight(hasPaymentQr ? 14 : 0).Column(details =>
                                        {
                                            details.Spacing(8);
                                            AddPaymentDetail(details, "Bank", model.BankName);
                                            AddPaymentDetail(details, "Account Name", model.BankAccountName);
                                            AddPaymentDetail(details, "Account No", model.BankAccount);
                                            AddPaymentDetail(details, "Pay Online", paymentGatewayLink);
                                            AddPaymentDetail(details, "After Payment", string.IsNullOrWhiteSpace(model.PaymentConfirmationLink)
                                                ? null
                                                : "Once payment is completed, click the confirmation link below to upload your proof of payment.");
                                            AddPaymentDetail(details, "Payment Confirmation", model.PaymentConfirmationLink, "Open payment confirmation page", true);
                                        });
                                    }
                                    else
                                    {
                                        row.RelativeItem();
                                    }

                                    if (hasPaymentQr)
                                    {
                                        row.ConstantItem(92).PaddingTop(4).Element(container =>
                                        {
                                            container.Border(1).BorderColor("#D7E0EA").Background("#FCFDFE").Padding(5).AlignCenter().AlignMiddle().Height(92).Element(inner =>
                                            {
                                                var qrBytes = ExtractDataUrlBytes(model.PaymentQrDataUrl!);
                                                if (qrBytes is { Length: > 0 })
                                                {
                                                    inner.Image(qrBytes).FitArea();
                                                }
                                            });
                                        });
                                    }
                                });
                            });
                        }));
                    }

                    if (!string.IsNullOrWhiteSpace(model.Notes) || model.SystemGeneratedFlag)
                    {
                        column.Item().PaddingTop(10).BorderTop(1).BorderColor("#D7E0EA").Column(footer =>
                        {
                            footer.Spacing(4);
                            if (!string.IsNullOrWhiteSpace(model.Notes))
                            {
                                footer.Item().Text(model.Notes).FontSize(9).FontColor("#64748B");
                            }

                            if (model.SystemGeneratedFlag)
                            {
                                footer.Item().Text("This is a system generated invoice.").FontSize(9).FontColor("#64748B");
                            }
                        });
                    }
                });
            });
        }).GeneratePdf();
    }

    private static void MetaRow(ColumnDescriptor column, string label, string value)
    {
        column.Item().Row(row =>
        {
            row.ConstantItem(86).AlignLeft().Text(label).FontSize(9).FontColor("#64748B");
            row.RelativeItem().AlignRight().Text(value).SemiBold().FontColor("#0F172A");
        });
    }

    private static void AddLines(ColumnDescriptor column, params string?[] values)
    {
        foreach (var value in values.Where(x => !string.IsNullOrWhiteSpace(x)))
        {
            column.Item().Text(value);
        }
    }

    private static void AddPaymentDetail(
        ColumnDescriptor column,
        string label,
        string? value,
        string? displayValue = null,
        bool isHyperlink = false)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        column.Item().Row(row =>
        {
            row.ConstantItem(102).Text(label).FontSize(9).FontColor("#64748B");
            if (isHyperlink)
            {
                row.RelativeItem().Text(text =>
                {
                    text.Hyperlink(displayValue ?? value, value).FontColor(Colors.Blue.Darken2).Underline();
                });
                return;
            }

            row.RelativeItem().Text(displayValue ?? value).FontColor("#0F172A");
        });
    }

    private static void HeaderCell(TableCellDescriptor header, string text, bool alignRight = false)
    {
        var cell = header.Cell().Background("#F8FAFC").BorderBottom(1).BorderColor("#CBD5E1").PaddingVertical(10).PaddingHorizontal(8);
        if (alignRight)
        {
            cell.AlignRight().Text(text).FontSize(9).SemiBold().FontColor("#64748B");
            return;
        }

        cell.Text(text).FontSize(9).SemiBold().FontColor("#64748B");
    }

    private static void BodyCell(TableDescriptor table, string text, bool alignRight = false)
    {
        var cell = table.Cell().BorderBottom(1).BorderColor("#E2E8F0").PaddingVertical(12).PaddingHorizontal(8);
        if (alignRight)
        {
            cell.AlignRight().Text(text).FontColor("#0F172A").FontFamily("Courier New");
            return;
        }

        cell.Text(text).FontColor("#0F172A");
    }

    private static void SummaryRow(ColumnDescriptor column, string label, string value, bool emphasize = false)
    {
        column.Item().Row(row =>
        {
            var left = row.RelativeItem().Text(label).FontColor("#0F172A");
            var right = row.RelativeItem().AlignRight().Text(value).FontColor("#0F172A").FontFamily("Courier New");
            if (emphasize)
            {
                left.SemiBold();
                right.SemiBold();
            }
        });
    }

    private static void SectionCard(IContainer container, Action<IContainer> content)
    {
        content(container
            .Border(1)
            .BorderColor("#D7E0EA")
            .Background("#FCFDFE")
            .Padding(14));
    }

    private static byte[]? ExtractDataUrlBytes(string dataUrl)
    {
        var markerIndex = dataUrl.IndexOf("base64,", StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return null;
        }

        var base64 = dataUrl[(markerIndex + "base64,".Length)..];
        return Convert.FromBase64String(base64);
    }
}
