namespace Recurvos.Infrastructure.Configuration;

public sealed class WhatsAppWebJsOptions
{
    public const string SectionName = "WhatsAppWebJs";

    public string BaseUrl { get; set; } = "http://localhost:3011/api";
    public string? AccessToken { get; set; }
}
