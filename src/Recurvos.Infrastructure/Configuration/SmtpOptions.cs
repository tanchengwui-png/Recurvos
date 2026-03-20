namespace Recurvos.Infrastructure.Configuration;

public sealed class SmtpOptions
{
    public const string SectionName = "Smtp";
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 1025;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = "noreply@recurvos.local";
    public string FromName { get; set; } = "Recurvos";
    public bool UseSsl { get; set; }
}
