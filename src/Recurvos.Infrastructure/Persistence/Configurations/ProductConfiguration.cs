using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Recurvos.Domain.Entities;

namespace Recurvos.Infrastructure.Persistence.Configurations;

public sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products");
        builder.Property(x => x.Name).HasMaxLength(150).IsRequired();
        builder.Property(x => x.Code).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(1000);
        builder.Property(x => x.Barcode).HasMaxLength(100);
        builder.Property(x => x.Category).HasMaxLength(100);
        builder.Property(x => x.ProductGroupsJson).HasMaxLength(8000).IsRequired();
        builder.Property(x => x.BinLocation).HasMaxLength(100);
        builder.Property(x => x.ImagePath).HasMaxLength(500);
        builder.Property(x => x.InventoryAccount).HasMaxLength(100);
        builder.Property(x => x.ReorderLevel).HasPrecision(18, 2);
        builder.Property(x => x.OpeningQuantity).HasPrecision(18, 2);
        builder.Property(x => x.OpeningCost).HasPrecision(18, 2);
        builder.Property(x => x.SalesPrice).HasPrecision(18, 2);
        builder.Property(x => x.SalesTaxCode).HasMaxLength(100);
        builder.Property(x => x.IncomeAccount).HasMaxLength(100);
        builder.Property(x => x.SalesDescription).HasMaxLength(2000);
        builder.Property(x => x.PurchasePrice).HasPrecision(18, 2);
        builder.Property(x => x.PurchaseTaxCode).HasMaxLength(100);
        builder.Property(x => x.ExpenseAccount).HasMaxLength(100);
        builder.Property(x => x.PreferredSupplierName).HasMaxLength(200);
        builder.Property(x => x.PurchaseDescription).HasMaxLength(2000);
        builder.Property(x => x.BaseUnitLabel).HasMaxLength(50).IsRequired();
        builder.Property(x => x.UomConversionsJson).HasMaxLength(8000).IsRequired();
        builder.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
        builder.HasMany(x => x.Plans)
            .WithOne(x => x.Product)
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
