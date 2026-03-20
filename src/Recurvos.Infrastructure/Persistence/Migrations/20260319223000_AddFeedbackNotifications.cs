using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFeedbackNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FeedbackNotificationEmail",
                table: "company_invoice_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastPlatformResponseAtUtc",
                table: "FeedbackItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubscriberLastViewedAtUtc",
                table: "FeedbackItems",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_FeedbackItems_CompanyId_LastPlatformResponseAtUtc",
                table: "FeedbackItems",
                columns: new[] { "CompanyId", "LastPlatformResponseAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FeedbackItems_CompanyId_LastPlatformResponseAtUtc",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "FeedbackNotificationEmail",
                table: "company_invoice_settings");

            migrationBuilder.DropColumn(
                name: "LastPlatformResponseAtUtc",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "SubscriberLastViewedAtUtc",
                table: "FeedbackItems");
        }
    }
}
