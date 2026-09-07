namespace Recurvos.Application.MasterData;

public sealed record MyInvoisTaxTypeDto(string Code, string Description);

/// <summary>
/// Official LHDN MyInvois tax type codes. Keep this catalog aligned with
/// https://sdk.myinvois.hasil.gov.my/codes/tax-types/.
/// </summary>
public static class MyInvoisTaxTypeCatalog
{
    public static readonly IReadOnlyList<MyInvoisTaxTypeDto> All =
    [
        new("01", "Sales Tax"),
        new("02", "Service Tax"),
        new("03", "Tourism Tax"),
        new("04", "High-Value Goods Tax"),
        new("05", "Sales Tax on Low Value Goods"),
        new("06", "Not Applicable"),
        new("E", "Tax exemption (where applicable)"),
    ];

    public static bool IsSupported(string? code) =>
        string.IsNullOrWhiteSpace(code) || All.Any(item => string.Equals(item.Code, code, StringComparison.OrdinalIgnoreCase));
}
