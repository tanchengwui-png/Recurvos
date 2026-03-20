using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExpandCompanyWhatsAppTemplateLength : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ALTER COLUMN "WhatsAppTemplate" TYPE character varying(2000);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE company_invoice_settings
                ALTER COLUMN "WhatsAppTemplate" TYPE character varying(100);
                """);
        }
    }
}
