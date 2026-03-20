namespace Recurvos.Infrastructure.Configuration;

public sealed class BillplzOptions
{
    public const string SectionName = "Billplz";
    public const string SandboxBaseUrl = "https://www.billplz-sandbox.com";
    public string ApiKey { get; set; } = string.Empty;
    public string CollectionId { get; set; } = string.Empty;
    public string XSignatureKey { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = SandboxBaseUrl;
    public bool RequireSignatureVerification { get; set; } = true;
}
