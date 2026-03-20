using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Recurvos.Domain.Entities;

namespace Recurvos.Infrastructure.Persistence.Configurations;

public sealed class ProductPlanConfiguration : IEntityTypeConfiguration<ProductPlan>
{
    public void Configure(EntityTypeBuilder<ProductPlan> builder)
    {
        builder.ToTable("product_plans");
        builder.Property(x => x.PlanName).HasMaxLength(150).IsRequired();
        builder.Property(x => x.PlanCode).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        builder.Property(x => x.BillingType).HasConversion<string>();
        builder.Property(x => x.IntervalUnit).HasConversion<string>();
        builder.Property(x => x.TaxBehavior).HasConversion<string>();
        builder.Property(x => x.UnitAmount).HasPrecision(18, 2);
        builder.Property(x => x.SetupFeeAmount).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.CompanyId, x.PlanCode }).IsUnique();
        builder.HasIndex(x => x.ProductId);
    }
}
