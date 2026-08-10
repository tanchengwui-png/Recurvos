using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260808170000_AddCustomerCompanyAssignments")]
    public partial class AddCustomerCompanyAssignments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CompanyIdsJson",
                table: "Customers",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            // Legacy contacts were owned by a subscriber rather than a single
            // accounting workspace. Preserve their existing visibility by assigning
            // them to every workspace billed to that subscriber. The fallbacks keep
            // older user-owned and platform records visible without dropping data.
            migrationBuilder.Sql("""
                UPDATE "Customers" customer
                SET "CompanyIdsJson" = COALESCE(
                    (
                        SELECT jsonb_agg(company."Id"::text ORDER BY company."CreatedAtUtc")::text
                        FROM "Companies" company
                        WHERE company."SubscriberId" = customer."SubscriberId"
                    ),
                    (
                        SELECT jsonb_build_array(user_record."CompanyId"::text)::text
                        FROM "Users" user_record
                        WHERE user_record."Id" = customer."SubscriberId"
                          AND user_record."CompanyId" IS NOT NULL
                    ),
                    (
                        SELECT jsonb_build_array(platform_company."Id"::text)::text
                        FROM "Companies" platform_company
                        WHERE platform_company."IsPlatformAccount"
                        ORDER BY platform_company."CreatedAtUtc"
                        LIMIT 1
                    ),
                    '[]'
                );
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CompanyIdsJson", table: "Customers");
        }
    }
}
