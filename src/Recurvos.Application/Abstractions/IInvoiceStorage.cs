namespace Recurvos.Application.Abstractions;

public interface IInvoiceStorage
{
    Task<string> SaveInvoicePdfAsync(Guid companyId, string invoiceNumber, byte[] content, CancellationToken cancellationToken = default);
    Task<string> SaveDocumentPdfAsync(Guid companyId, string documentNumber, byte[] content, CancellationToken cancellationToken = default);
}
