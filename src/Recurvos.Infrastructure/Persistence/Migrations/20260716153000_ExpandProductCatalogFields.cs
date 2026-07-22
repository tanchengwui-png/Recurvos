using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260716153000_ExpandProductCatalogFields")]
public partial class ExpandProductCatalogFields : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Barcode",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "BaseUnitLabel",
            table: "products",
            type: "character varying(50)",
            maxLength: 50,
            nullable: false,
            defaultValue: "Unit");

        migrationBuilder.AddColumn<string>(
            name: "BinLocation",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ExpenseAccount",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<Guid>(
            name: "ExpenseAccountId",
            table: "products",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "HasMultipleUoms",
            table: "products",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "ImagePath",
            table: "products",
            type: "character varying(500)",
            maxLength: 500,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "IncomeAccount",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<Guid>(
            name: "IncomeAccountId",
            table: "products",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "InventoryAccount",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<Guid>(
            name: "InventoryAccountId",
            table: "products",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "IsBuying",
            table: "products",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<bool>(
            name: "IsSelling",
            table: "products",
            type: "boolean",
            nullable: false,
            defaultValue: true);

        migrationBuilder.AddColumn<decimal>(
            name: "OpeningCost",
            table: "products",
            type: "numeric(18,2)",
            precision: 18,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "OpeningQuantity",
            table: "products",
            type: "numeric(18,2)",
            precision: 18,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "PreferredSupplierName",
            table: "products",
            type: "character varying(200)",
            maxLength: 200,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<Guid>(
            name: "PreferredSupplierId",
            table: "products",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "ProductGroupsJson",
            table: "products",
            type: "character varying(8000)",
            maxLength: 8000,
            nullable: false,
            defaultValue: "[]");

        migrationBuilder.AddColumn<string>(
            name: "PurchaseDescription",
            table: "products",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "PurchasePrice",
            table: "products",
            type: "numeric(18,2)",
            precision: 18,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "PurchaseTaxCode",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<Guid>(
            name: "PurchaseTaxCodeId",
            table: "products",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "ReorderLevel",
            table: "products",
            type: "numeric(18,2)",
            precision: 18,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "SalesDescription",
            table: "products",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "SalesPrice",
            table: "products",
            type: "numeric(18,2)",
            precision: 18,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "SalesTaxCode",
            table: "products",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<Guid>(
            name: "SalesTaxCodeId",
            table: "products",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<bool>(
            name: "TrackInventory",
            table: "products",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<string>(
            name: "UomConversionsJson",
            table: "products",
            type: "character varying(8000)",
            maxLength: 8000,
            nullable: false,
            defaultValue: "[]");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Barcode", table: "products");
        migrationBuilder.DropColumn(name: "BaseUnitLabel", table: "products");
        migrationBuilder.DropColumn(name: "BinLocation", table: "products");
        migrationBuilder.DropColumn(name: "ExpenseAccount", table: "products");
        migrationBuilder.DropColumn(name: "ExpenseAccountId", table: "products");
        migrationBuilder.DropColumn(name: "HasMultipleUoms", table: "products");
        migrationBuilder.DropColumn(name: "ImagePath", table: "products");
        migrationBuilder.DropColumn(name: "IncomeAccount", table: "products");
        migrationBuilder.DropColumn(name: "IncomeAccountId", table: "products");
        migrationBuilder.DropColumn(name: "InventoryAccount", table: "products");
        migrationBuilder.DropColumn(name: "InventoryAccountId", table: "products");
        migrationBuilder.DropColumn(name: "IsBuying", table: "products");
        migrationBuilder.DropColumn(name: "IsSelling", table: "products");
        migrationBuilder.DropColumn(name: "OpeningCost", table: "products");
        migrationBuilder.DropColumn(name: "OpeningQuantity", table: "products");
        migrationBuilder.DropColumn(name: "PreferredSupplierId", table: "products");
        migrationBuilder.DropColumn(name: "PreferredSupplierName", table: "products");
        migrationBuilder.DropColumn(name: "ProductGroupsJson", table: "products");
        migrationBuilder.DropColumn(name: "PurchaseDescription", table: "products");
        migrationBuilder.DropColumn(name: "PurchasePrice", table: "products");
        migrationBuilder.DropColumn(name: "PurchaseTaxCode", table: "products");
        migrationBuilder.DropColumn(name: "PurchaseTaxCodeId", table: "products");
        migrationBuilder.DropColumn(name: "ReorderLevel", table: "products");
        migrationBuilder.DropColumn(name: "SalesDescription", table: "products");
        migrationBuilder.DropColumn(name: "SalesPrice", table: "products");
        migrationBuilder.DropColumn(name: "SalesTaxCode", table: "products");
        migrationBuilder.DropColumn(name: "SalesTaxCodeId", table: "products");
        migrationBuilder.DropColumn(name: "TrackInventory", table: "products");
        migrationBuilder.DropColumn(name: "UomConversionsJson", table: "products");
    }
}
