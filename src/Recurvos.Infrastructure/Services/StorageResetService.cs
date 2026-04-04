using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Recurvos.Infrastructure.Configuration;

namespace Recurvos.Infrastructure.Services;

public sealed class StorageResetService(
    IHostEnvironment environment,
    IOptions<StorageOptions> storageOptions,
    IOptions<WhatsAppWebJsOptions> whatsAppOptions)
{
    private readonly IHostEnvironment _environment = environment;
    private readonly StorageOptions _storageOptions = storageOptions.Value;
    private readonly WhatsAppWebJsOptions _whatsAppOptions = whatsAppOptions.Value;

    public void ClearAll()
    {
        var invoiceRoot = StoragePathResolver.Resolve(_environment, _storageOptions.InvoiceDirectory);
        var storageRoot = Directory.GetParent(invoiceRoot)?.FullName ?? Path.Combine(_environment.ContentRootPath, "storage");

        ClearDirectory(invoiceRoot);
        ClearDirectory(Path.Combine(storageRoot, "emails"));
        ClearDirectory(StoragePathResolver.Resolve(_environment, _storageOptions.PaymentProofDirectory));
        ClearDirectory(StoragePathResolver.Resolve(_environment, _storageOptions.CompanyLogoDirectory));
        ClearDirectory(StoragePathResolver.Resolve(_environment, _storageOptions.PaymentQrDirectory));
        ClearDirectory(StoragePathResolver.Resolve(_environment, _storageOptions.FeedbackAttachmentDirectory));
        ClearDirectory(StoragePathResolver.Resolve(_environment, _whatsAppOptions.SessionDirectory));
    }

    private static void ClearDirectory(string path)
    {
        if (!Directory.Exists(path))
        {
            return;
        }

        foreach (var file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
        {
            File.Delete(file);
        }

        foreach (var directory in Directory.GetDirectories(path, "*", SearchOption.AllDirectories).OrderByDescending(x => x.Length))
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: false);
            }
        }
    }
}
