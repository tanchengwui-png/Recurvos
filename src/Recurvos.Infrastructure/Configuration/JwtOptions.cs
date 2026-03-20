namespace Recurvos.Infrastructure.Configuration;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";
    public string Issuer { get; set; } = "Recurvos";
    public string Audience { get; set; } = "Recurvos";
    public string SecretKey { get; set; } = "super-secret-development-key-change-me";
    public int AccessTokenMinutes { get; set; } = 60;
    public int RefreshTokenDays { get; set; } = 14;
}
