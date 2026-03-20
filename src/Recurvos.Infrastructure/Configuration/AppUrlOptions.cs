namespace Recurvos.Infrastructure.Configuration;

public sealed class AppUrlOptions
{
    public const string SectionName = "AppUrls";
    public string ApiBaseUrl { get; set; } = "http://localhost:7001";
    public string WebBaseUrl { get; set; } = "http://localhost:5173";
}
