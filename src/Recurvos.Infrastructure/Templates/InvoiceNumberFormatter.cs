using System.Globalization;

namespace Recurvos.Infrastructure.Templates;

public static class InvoiceNumberFormatter
{
    private const string DefaultPattern = "{PREFIX}-{YYYY}-{SEQPAD}";

    public static string Format(DateTime invoiceDateUtc, int sequence, string? customPattern = null, string prefix = "INV", int padding = 6)
    {
        var pattern = string.IsNullOrWhiteSpace(customPattern) ? DefaultPattern : customPattern.Trim();
        var normalizedPrefix = prefix.TrimEnd('-');
        var paddedSequence = sequence.ToString().PadLeft(Math.Max(1, padding), '0');

        return pattern
            .Replace("{PREFIX}", normalizedPrefix, StringComparison.Ordinal)
            .Replace("{YYYY}", invoiceDateUtc.Year.ToString("0000", CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{YY}", (invoiceDateUtc.Year % 100).ToString("00", CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{MM}", invoiceDateUtc.Month.ToString("00", CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{SEQPAD}", paddedSequence, StringComparison.Ordinal)
            .Replace("{SEQ6}", sequence.ToString("000000", CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{SEQ}", sequence.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);
    }
}
