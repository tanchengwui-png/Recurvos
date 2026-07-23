using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddSubscriberAccountBillingProfile : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "BillingAddress", table: "SubscriberAccounts", type: "text", nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingContactName", table: "SubscriberAccounts", type: "character varying(200)", maxLength: 200, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingEmail", table: "SubscriberAccounts", type: "character varying(200)", maxLength: 200, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingPhone", table: "SubscriberAccounts", type: "character varying(50)", maxLength: 50, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingTaxIdNumber", table: "SubscriberAccounts", type: "character varying(100)", maxLength: 100, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingTaxIdType", table: "SubscriberAccounts", type: "character varying(50)", maxLength: 50, nullable: true);

        // One-time migration only: copy the initial account profile from the
        // linked company. Future company edits never update these account fields.
        migrationBuilder.Sql("""
            UPDATE "SubscriberAccounts" AS account
            SET "BillingContactName" = COALESCE(owner."FullName", company."Name"),
                "BillingEmail" = company."Email",
                "BillingPhone" = company."Phone",
                "BillingAddress" = NULLIF(BTRIM(company."Address"), '')
            FROM "Companies" AS company
            LEFT JOIN "Users" AS owner ON owner."Id" = company."SubscriberId"
            WHERE company."SubscriberAccountId" = account."Id"
              AND NOT company."IsPlatformAccount"
              AND account."BillingContactName" IS NULL
              AND account."BillingEmail" IS NULL
              AND account."BillingAddress" IS NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "BillingAddress", table: "SubscriberAccounts");
        migrationBuilder.DropColumn(name: "BillingContactName", table: "SubscriberAccounts");
        migrationBuilder.DropColumn(name: "BillingEmail", table: "SubscriberAccounts");
        migrationBuilder.DropColumn(name: "BillingPhone", table: "SubscriberAccounts");
        migrationBuilder.DropColumn(name: "BillingTaxIdNumber", table: "SubscriberAccounts");
        migrationBuilder.DropColumn(name: "BillingTaxIdType", table: "SubscriberAccounts");
    }
}
