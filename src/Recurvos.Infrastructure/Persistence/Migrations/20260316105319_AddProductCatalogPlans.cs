using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    public partial class AddProductCatalogPlans : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SubscriptionItems_Prices_PriceId",
                table: "SubscriptionItems");

            migrationBuilder.DropForeignKey(
                name: "FK_Prices_Products_ProductId",
                table: "Prices");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Products",
                table: "Products");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Prices",
                table: "Prices");

            migrationBuilder.RenameTable(
                name: "Products",
                newName: "products");

            migrationBuilder.RenameTable(
                name: "Prices",
                newName: "product_plans");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "product_plans",
                newName: "PlanName");

            migrationBuilder.RenameColumn(
                name: "PriceId",
                table: "SubscriptionItems",
                newName: "ProductPlanId");

            migrationBuilder.RenameIndex(
                name: "IX_SubscriptionItems_PriceId",
                table: "SubscriptionItems",
                newName: "IX_SubscriptionItems_ProductPlanId");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "products",
                type: "character varying(150)",
                maxLength: 150,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "products",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "PlanName",
                table: "product_plans",
                type: "character varying(150)",
                maxLength: 150,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "products",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "products",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "IsSubscriptionProduct",
                table: "products",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "BillingType",
                table: "product_plans",
                type: "text",
                nullable: false,
                defaultValue: "Recurring");

            migrationBuilder.AddColumn<int>(
                name: "IntervalCount",
                table: "product_plans",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "IntervalUnit",
                table: "product_plans",
                type: "text",
                nullable: false,
                defaultValue: "Month");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "product_plans",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefault",
                table: "product_plans",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PlanCode",
                table: "product_plans",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "product_plans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "SetupFeeAmount",
                table: "product_plans",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "TaxBehavior",
                table: "product_plans",
                type: "text",
                nullable: false,
                defaultValue: "Unspecified");

            migrationBuilder.AddColumn<int>(
                name: "TrialDays",
                table: "product_plans",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddPrimaryKey(
                name: "PK_products",
                table: "products",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_product_plans",
                table: "product_plans",
                column: "Id");

            migrationBuilder.Sql("""
                UPDATE products
                SET "Code" = LEFT(UPPER(REGEXP_REPLACE("Name", '[^A-Za-z0-9]+', '-', 'g')), 50),
                    "IsSubscriptionProduct" = true
                WHERE "Code" = '';
                """);

            migrationBuilder.Sql("""
                UPDATE product_plans
                SET "BillingType" = 'Recurring',
                    "IntervalCount" = 1,
                    "IntervalUnit" = CASE
                        WHEN "BillingInterval" = 1 THEN 'Month'
                        WHEN "BillingInterval" = 3 THEN 'Quarter'
                        WHEN "BillingInterval" = 12 THEN 'Year'
                        ELSE 'Month'
                    END,
                    "IsActive" = true,
                    "PlanCode" = LEFT(UPPER(REGEXP_REPLACE("PlanName", '[^A-Za-z0-9]+', '-', 'g')), 50),
                    "TaxBehavior" = 'Unspecified'
                WHERE "PlanCode" = '';
                """);

            migrationBuilder.Sql("""
                UPDATE product_plans target
                SET "IsDefault" = true
                FROM (
                    SELECT "Id"
                    FROM (
                        SELECT "Id",
                               ROW_NUMBER() OVER (PARTITION BY "ProductId" ORDER BY "UnitAmount", "CreatedAtUtc") AS rn
                        FROM product_plans
                    ) ranked
                    WHERE ranked.rn = 1
                ) defaults
                WHERE target."Id" = defaults."Id";
                """);

            migrationBuilder.DropColumn(
                name: "BillingInterval",
                table: "product_plans");

            migrationBuilder.CreateIndex(
                name: "IX_products_CompanyId_Code",
                table: "products",
                columns: new[] { "CompanyId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_product_plans_CompanyId_PlanCode",
                table: "product_plans",
                columns: new[] { "CompanyId", "PlanCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_product_plans_ProductId",
                table: "product_plans",
                column: "ProductId");

            migrationBuilder.AddForeignKey(
                name: "FK_product_plans_products_ProductId",
                table: "product_plans",
                column: "ProductId",
                principalTable: "products",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SubscriptionItems_product_plans_ProductPlanId",
                table: "SubscriptionItems",
                column: "ProductPlanId",
                principalTable: "product_plans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_product_plans_products_ProductId",
                table: "product_plans");

            migrationBuilder.DropForeignKey(
                name: "FK_SubscriptionItems_product_plans_ProductPlanId",
                table: "SubscriptionItems");

            migrationBuilder.DropPrimaryKey(
                name: "PK_products",
                table: "products");

            migrationBuilder.DropPrimaryKey(
                name: "PK_product_plans",
                table: "product_plans");

            migrationBuilder.DropIndex(
                name: "IX_products_CompanyId_Code",
                table: "products");

            migrationBuilder.DropIndex(
                name: "IX_product_plans_CompanyId_PlanCode",
                table: "product_plans");

            migrationBuilder.DropIndex(
                name: "IX_product_plans_ProductId",
                table: "product_plans");

            migrationBuilder.AddColumn<int>(
                name: "BillingInterval",
                table: "product_plans",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.Sql("""
                UPDATE product_plans
                SET "BillingInterval" = CASE
                    WHEN "IntervalUnit" = 'Quarter' THEN 3
                    WHEN "IntervalUnit" = 'Year' THEN 12
                    ELSE 1
                END;
                """);

            migrationBuilder.DropColumn(name: "Category", table: "products");
            migrationBuilder.DropColumn(name: "Code", table: "products");
            migrationBuilder.DropColumn(name: "IsSubscriptionProduct", table: "products");
            migrationBuilder.DropColumn(name: "BillingType", table: "product_plans");
            migrationBuilder.DropColumn(name: "IntervalCount", table: "product_plans");
            migrationBuilder.DropColumn(name: "IntervalUnit", table: "product_plans");
            migrationBuilder.DropColumn(name: "IsActive", table: "product_plans");
            migrationBuilder.DropColumn(name: "IsDefault", table: "product_plans");
            migrationBuilder.DropColumn(name: "PlanCode", table: "product_plans");
            migrationBuilder.DropColumn(name: "SortOrder", table: "product_plans");
            migrationBuilder.DropColumn(name: "SetupFeeAmount", table: "product_plans");
            migrationBuilder.DropColumn(name: "TaxBehavior", table: "product_plans");
            migrationBuilder.DropColumn(name: "TrialDays", table: "product_plans");

            migrationBuilder.RenameTable(
                name: "products",
                newName: "Products");

            migrationBuilder.RenameTable(
                name: "product_plans",
                newName: "Prices");

            migrationBuilder.RenameColumn(
                name: "PlanName",
                table: "Prices",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "ProductPlanId",
                table: "SubscriptionItems",
                newName: "PriceId");

            migrationBuilder.RenameIndex(
                name: "IX_SubscriptionItems_ProductPlanId",
                table: "SubscriptionItems",
                newName: "IX_SubscriptionItems_PriceId");

            migrationBuilder.AlterColumn<string>(
                name: "Description",
                table: "Products",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(1000)",
                oldMaxLength: 1000,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Products",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(150)",
                oldMaxLength: 150);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "Prices",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(150)",
                oldMaxLength: 150);

            migrationBuilder.AddPrimaryKey(
                name: "PK_Products",
                table: "Products",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Prices",
                table: "Prices",
                column: "Id");

            migrationBuilder.CreateIndex(
                name: "IX_Prices_ProductId",
                table: "Prices",
                column: "ProductId");

            migrationBuilder.AddForeignKey(
                name: "FK_Prices_Products_ProductId",
                table: "Prices",
                column: "ProductId",
                principalTable: "Products",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_SubscriptionItems_Prices_PriceId",
                table: "SubscriptionItems",
                column: "PriceId",
                principalTable: "Prices",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
