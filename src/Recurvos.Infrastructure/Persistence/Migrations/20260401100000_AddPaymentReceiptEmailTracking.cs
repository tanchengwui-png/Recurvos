using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Recurvos.Infrastructure.Persistence.Migrations;

public partial class AddPaymentReceiptEmailTracking : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateTime>(
            name: "ReceiptEmailedAtUtc",
            table: "Payments",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "ReceiptEmailedAtUtc",
            table: "Payments");
    }
}
