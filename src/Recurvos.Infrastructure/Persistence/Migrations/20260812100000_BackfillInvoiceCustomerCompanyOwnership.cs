using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

/// <summary>
/// Restores a contact's workspace only when its existing invoice history proves
/// a single, unambiguous owner. Contacts with no invoice history or invoices in
/// multiple workspaces remain quarantined for manual review.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20260812100000_BackfillInvoiceCustomerCompanyOwnership")]
public partial class BackfillInvoiceCustomerCompanyOwnership : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            WITH "InvoiceCustomerOwnership" AS (
                SELECT i."CustomerId", MIN(i."CompanyId"::text)::uuid AS "CompanyId"
                FROM "Invoices" i
                INNER JOIN "Customers" c ON c."Id" = i."CustomerId"
                WHERE c."CompanyId" IS NULL
                GROUP BY i."CustomerId"
                HAVING COUNT(DISTINCT i."CompanyId") = 1
            )
            UPDATE "Customers" c
            SET "CompanyId" = ownership."CompanyId"
            FROM "InvoiceCustomerOwnership" ownership
            WHERE c."Id" = ownership."CustomerId";
            """);

        migrationBuilder.Sql("""
            DELETE FROM "LegacyCustomerOwnershipIssues" issue
            USING "Customers" c
            WHERE issue."CustomerId" = c."Id"
              AND c."CompanyId" IS NOT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Ownership inferred from invoice history is intentionally retained.
    }
}
