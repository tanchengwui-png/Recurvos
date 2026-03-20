using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Recurvos.Domain.Entities;

namespace Recurvos.Infrastructure.Persistence.Configurations;

public sealed class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> builder)
    {
        builder.Property(x => x.UnitPrice).HasPrecision(18, 2);
        builder.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        builder.Property(x => x.IntervalUnit).HasConversion<string>().HasMaxLength(20).IsRequired();
        builder.Property(x => x.Quantity).HasDefaultValue(1).IsRequired();
        builder.Property(x => x.Notes).HasMaxLength(1000);
        builder.Property(x => x.UpdatedAtUtc).IsRequired();
    }
}
