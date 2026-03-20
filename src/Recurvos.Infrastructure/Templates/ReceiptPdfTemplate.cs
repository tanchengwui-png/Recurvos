using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Recurvos.Infrastructure.Templates;

public static class ReceiptPdfTemplate
{
    public static byte[] Render(
        string issuerName,
        string? issuerRegistrationNumber,
        string issuerEmail,
        string? issuerAddress,
        string customerName,
        string receiptNumber,
        string invoiceNumber,
        string description,
        decimal amount,
        string currency,
        string paymentMethod,
        DateTime paidAtUtc,
        string? transactionReference = null,
        decimal? balanceAfterPayment = null)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        var normalizedCurrency = InvoiceTemplateSupport.NormalizeCurrency(currency);

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
                            left.Item().Text(issuerName).FontSize(22).SemiBold().FontColor("#0F172A");
                            if (!string.IsNullOrWhiteSpace(issuerRegistrationNumber))
                            {
                                left.Item().Text($"Registration No: {issuerRegistrationNumber}");
                            }
                            if (!string.IsNullOrWhiteSpace(issuerEmail))
                            {
                                left.Item().Text(issuerEmail);
                            }
                            if (!string.IsNullOrWhiteSpace(issuerAddress))
                            {
                                left.Item().Text(issuerAddress);
                            }
                        });

                        row.ConstantItem(228).Element(container => SectionCard(container, card =>
                        {
                            card.Column(right =>
                            {
                                right.Spacing(10);
                                right.Item().AlignRight().Text("RECEIPT").FontSize(28).SemiBold().FontColor("#0F172A");
                                MetaRow(right, "Receipt No", receiptNumber);
                                MetaRow(right, "Invoice No", invoiceNumber);
                                MetaRow(right, "Paid On", paidAtUtc.ToString("dd MMM yyyy"));
                                MetaRow(right, "Currency", normalizedCurrency);
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
                                section.Item().Text("Received From").FontSize(10).SemiBold().FontColor("#64748B");
                                section.Item().Text(customerName).FontSize(13).SemiBold().FontColor("#0F172A");
                            });
                        }));

                        row.ConstantItem(228).Element(container => SectionCard(container, card =>
                        {
                            card.Column(summary =>
                            {
                                summary.Spacing(8);
                                summary.Item().Text("Summary").FontSize(10).SemiBold().FontColor("#64748B");
                                SummaryRow(summary, "Payment Method", paymentMethod);
                                SummaryRow(summary, "Invoice No", invoiceNumber);
                                if (!string.IsNullOrWhiteSpace(transactionReference))
                                {
                                    SummaryRow(summary, "Reference", transactionReference);
                                }
                                summary.Item().LineHorizontal(1).LineColor("#CBD5E1");
                                SummaryRow(summary, "Amount Received", InvoiceTemplateSupport.FormatMoney(amount, normalizedCurrency), true);
                                if (balanceAfterPayment.HasValue)
                                {
                                    SummaryRow(summary, "Balance", InvoiceTemplateSupport.FormatMoney(balanceAfterPayment.Value, normalizedCurrency));
                                }
                            });
                        }));
                    });

                    column.Item().Element(container => SectionCard(container, card =>
                    {
                        card.Column(section =>
                        {
                            section.Spacing(8);
                            section.Item().Text("Receipt Items").FontSize(10).SemiBold().FontColor("#64748B");
                            section.Item().Table(table =>
                            {
                                table.ColumnsDefinition(columns =>
                                {
                                    columns.RelativeColumn(4.2f);
                                    columns.RelativeColumn(2.0f);
                                    columns.RelativeColumn(1.8f);
                                });

                                table.Header(header =>
                                {
                                    HeaderCell(header, "Description");
                                    HeaderCell(header, "Payment Method");
                                    HeaderCell(header, "Amount", true);
                                });

                                BodyCell(table, description);
                                BodyCell(table, paymentMethod);
                                BodyCell(table, InvoiceTemplateSupport.FormatMoney(amount, normalizedCurrency), true);
                            });
                        });
                    }));

                    column.Item().PaddingTop(10).BorderTop(1).BorderColor("#D7E0EA").Column(footer =>
                    {
                        footer.Spacing(4);
                        footer.Item().Text("This is a system generated receipt.").FontSize(9).FontColor("#64748B");
                    });
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
            cell.AlignRight().Text(text).FontColor("#0F172A");
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
}
