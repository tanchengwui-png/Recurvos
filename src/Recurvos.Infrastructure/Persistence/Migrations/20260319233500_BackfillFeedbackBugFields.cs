using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BackfillFeedbackBugFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActualResult",
                table: "FeedbackItems",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BrowserInfo",
                table: "FeedbackItems",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExpectedResult",
                table: "FeedbackItems",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PageUrl",
                table: "FeedbackItems",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotContentType",
                table: "FeedbackItems",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotFileName",
                table: "FeedbackItems",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScreenshotPath",
                table: "FeedbackItems",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StepsToReproduce",
                table: "FeedbackItems",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ActualResult",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "BrowserInfo",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "ExpectedResult",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "PageUrl",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "ScreenshotContentType",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "ScreenshotFileName",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "ScreenshotPath",
                table: "FeedbackItems");

            migrationBuilder.DropColumn(
                name: "StepsToReproduce",
                table: "FeedbackItems");
        }
    }
}
