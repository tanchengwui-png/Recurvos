namespace Recurvos.Application.Abstractions;

public interface IInvoiceStorage
{
    Task<string> SaveInvoicePdfAsync(Guid companyId, string invoiceNumber, byte[] content, CancellationToken cancellationToken = default);
}
