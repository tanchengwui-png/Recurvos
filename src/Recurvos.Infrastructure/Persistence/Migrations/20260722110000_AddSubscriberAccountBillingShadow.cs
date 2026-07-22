using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260722110000_AddSubscriberAccountBillingShadow")]
public partial class AddSubscriberAccountBillingShadow : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "BillingPackageCode", table: "SubscriberAccounts", type: "character varying(100)", maxLength: 100, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingPendingPackageCode", table: "SubscriberAccounts", type: "character varying(100)", maxLength: 100, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingStatus", table: "SubscriberAccounts", type: "character varying(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "BillingGracePeriodEndsAtUtc", table: "SubscriberAccounts", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "BillingCycleStartUtc", table: "SubscriberAccounts", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "BillingTrialEndsAtUtc", table: "SubscriberAccounts", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "BillingProjectionUpdatedAtUtc", table: "SubscriberAccounts", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "BillingValidatedAtUtc", table: "SubscriberAccounts", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingHealthStatus", table: "SubscriberAccounts", type: "character varying(40)", maxLength: 40, nullable: true);
        migrationBuilder.AddColumn<string>(name: "BillingHealthWarning", table: "SubscriberAccounts", type: "character varying(1000)", maxLength: 1000, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var column in new[] { "BillingHealthWarning", "BillingHealthStatus", "BillingValidatedAtUtc", "BillingProjectionUpdatedAtUtc", "BillingTrialEndsAtUtc", "BillingCycleStartUtc", "BillingGracePeriodEndsAtUtc", "BillingStatus", "BillingPendingPackageCode", "BillingPackageCode" })
            migrationBuilder.DropColumn(name: column, table: "SubscriberAccounts");
    }
}
