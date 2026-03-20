using System.Globalization;
using System.Net;

namespace Recurvos.Infrastructure.Templates;

public static class InvoiceTemplateSupport
{
    private static readonly HashSet<string> SupportedCurrencies = new(StringComparer.OrdinalIgnoreCase)
    {
        "MYR",
        "USD",
        "SGD",
        "EUR"
    };

    public static string NormalizeCurrency(string? currency)
    {
        var normalized = string.IsNullOrWhiteSpace(currency) ? "MYR" : currency.Trim().ToUpperInvariant();
        return SupportedCurrencies.Contains(normalized) ? normalized : "MYR";
    }

    public static string FormatMoney(decimal amount, string currency) =>
        $"{NormalizeCurrency(currency)} {amount.ToString("#,##0.00", CultureInfo.InvariantCulture)}";

    public static string FormatAmount(decimal amount) =>
        amount.ToString("#,##0.00", CultureInfo.InvariantCulture);

    public static string Encode(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

    public static string? ToDataUrl(byte[]? bytes, string mimeType)
    {
        if (bytes is not { Length: > 0 })
        {
            return null;
        }

        return $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
    }

    public static string JoinNonEmpty(params string?[] values) =>
        string.Join("<br/>", values.Where(x => !string.IsNullOrWhiteSpace(x)).Select(Encode));
}
