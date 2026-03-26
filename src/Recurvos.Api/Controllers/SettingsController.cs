using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.Features;
using Recurvos.Application.Settings;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/settings")]
public sealed class SettingsController(ISettingsService settingsService) : ControllerBase
{
    [HttpGet("feature-access")]
    public async Task<ActionResult<FeatureAccessDto>> GetFeatureAccess([FromServices] IFeatureEntitlementService featureEntitlementService, CancellationToken cancellationToken) =>
        Ok(await featureEntitlementService.GetCurrentAccessAsync(cancellationToken));

    [HttpGet("billing-readiness")]
    public async Task<ActionResult<BillingReadinessDto>> GetBillingReadiness([FromServices] IBillingReadinessService billingReadinessService, [FromQuery] Guid? companyId, CancellationToken cancellationToken) =>
        Ok(await billingReadinessService.GetAsync(companyId, cancellationToken));

    [HttpGet("invoice-settings")]
    public async Task<ActionResult<CompanyInvoiceSettingsDto>> GetInvoiceSettings([FromQuery] Guid? companyId, CancellationToken cancellationToken) =>
        Ok(await settingsService.GetCompanyInvoiceSettingsAsync(companyId, cancellationToken));

    [HttpPut("invoice-settings")]
    [Authorize(Policy = "OwnerOnly")]
    public async Task<ActionResult<CompanyInvoiceSettingsDto>> UpdateInvoiceSettings([FromQuery] Guid? companyId, UpdateCompanyInvoiceSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdateCompanyInvoiceSettingsAsync(companyId, request, cancellationToken));

    [HttpPost("invoice-settings/payment-gateway/test")]
    [Authorize(Policy = "OwnerOnly")]
    public async Task<ActionResult<CompanyPaymentGatewayTestResultDto>> TestCompanyPaymentGateway([FromQuery] Guid? companyId, TestCompanyPaymentGatewayRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.TestCompanyPaymentGatewayAsync(companyId, request, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("platform-whatsapp")]
    public async Task<ActionResult<PlatformWhatsAppSettingsDto>> GetPlatformWhatsApp(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetPlatformWhatsAppSettingsAsync(cancellationToken));

    [HttpPut("platform-whatsapp")]
    public async Task<ActionResult<PlatformWhatsAppSettingsDto>> UpdatePlatformWhatsApp(UpdatePlatformWhatsAppSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformWhatsAppSettingsAsync(request, cancellationToken));

    [HttpPost("platform-whatsapp/session/connect")]
    public async Task<ActionResult<PlatformWhatsAppSettingsDto>> ConnectPlatformWhatsAppSession(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.ConnectPlatformWhatsAppSessionAsync(cancellationToken));
        }
        catch (UnauthorizedAccessException)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only platform owners can connect WhatsApp sessions.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("platform-whatsapp/session/disconnect")]
    public async Task<ActionResult<PlatformWhatsAppSettingsDto>> DisconnectPlatformWhatsAppSession(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.DisconnectPlatformWhatsAppSessionAsync(cancellationToken));
        }
        catch (UnauthorizedAccessException)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only platform owners can disconnect WhatsApp sessions.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("platform-whatsapp/session/refresh")]
    public async Task<ActionResult<PlatformWhatsAppSettingsDto>> RefreshPlatformWhatsAppSession(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.RefreshPlatformWhatsAppSessionAsync(cancellationToken));
        }
        catch (UnauthorizedAccessException)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only platform owners can refresh WhatsApp sessions.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpPost("platform-whatsapp/test-message")]
    public async Task<ActionResult<PlatformWhatsAppTestMessageResultDto>> SendPlatformWhatsAppTestMessage(PlatformWhatsAppTestMessageRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.SendPlatformWhatsAppTestMessageAsync(request, cancellationToken));
        }
        catch (UnauthorizedAccessException)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only platform owners can send WhatsApp test messages.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("platform-feedback")]
    public async Task<ActionResult<PlatformFeedbackSettingsDto>> GetPlatformFeedback(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetPlatformFeedbackSettingsAsync(cancellationToken));

    [HttpPut("platform-feedback")]
    public async Task<ActionResult<PlatformFeedbackSettingsDto>> UpdatePlatformFeedback(UpdatePlatformFeedbackSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformFeedbackSettingsAsync(request, cancellationToken));

    [HttpGet("platform-issuer")]
    public async Task<ActionResult<PlatformIssuerSettingsDto>> GetPlatformIssuer([FromQuery] string environment = "staging", CancellationToken cancellationToken = default) =>
        Ok(await settingsService.GetPlatformIssuerSettingsAsync(environment, cancellationToken));

    [HttpPut("platform-issuer")]
    public async Task<ActionResult<PlatformIssuerSettingsDto>> UpdatePlatformIssuer(UpdatePlatformIssuerSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformIssuerSettingsAsync(request, cancellationToken));

    [HttpGet("platform-document-numbering")]
    public async Task<ActionResult<PlatformDocumentNumberingSettingsDto>> GetPlatformDocumentNumbering(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetPlatformDocumentNumberingSettingsAsync(cancellationToken));

    [HttpPut("platform-document-numbering")]
    public async Task<ActionResult<PlatformDocumentNumberingSettingsDto>> UpdatePlatformDocumentNumbering(UpdatePlatformDocumentNumberingSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformDocumentNumberingSettingsAsync(request, cancellationToken));

    [HttpGet("platform-runtime-profile")]
    public async Task<ActionResult<PlatformRuntimeProfileDto>> GetPlatformRuntimeProfile(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetPlatformRuntimeProfileAsync(cancellationToken));

    [HttpPut("platform-runtime-profile")]
    public async Task<ActionResult<PlatformRuntimeProfileDto>> UpdatePlatformRuntimeProfile(UpdatePlatformRuntimeProfileRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformRuntimeProfileAsync(request, cancellationToken));

    [HttpGet("platform-smtp")]
    public async Task<ActionResult<PlatformSmtpSettingsDto>> GetPlatformSmtp([FromQuery] string environment = "staging", CancellationToken cancellationToken = default) =>
        Ok(await settingsService.GetPlatformSmtpSettingsAsync(environment, cancellationToken));

    [HttpPut("platform-smtp")]
    public async Task<ActionResult<PlatformSmtpSettingsDto>> UpdatePlatformSmtp(UpdatePlatformSmtpSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformSmtpSettingsAsync(request, cancellationToken));

    [HttpPost("platform-smtp/test")]
    public async Task<ActionResult<PlatformSmtpTestResultDto>> TestPlatformSmtp(UpdatePlatformSmtpSettingsRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.TestPlatformSmtpAsync(request, cancellationToken));
        }
        catch (UnauthorizedAccessException)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only platform owners can test SMTP settings.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("platform-billplz")]
    public async Task<ActionResult<PlatformBillplzSettingsDto>> GetPlatformBillplz([FromQuery] string environment = "staging", CancellationToken cancellationToken = default) =>
        Ok(await settingsService.GetPlatformBillplzSettingsAsync(environment, cancellationToken));

    [HttpPut("platform-billplz")]
    public async Task<ActionResult<PlatformBillplzSettingsDto>> UpdatePlatformBillplz(UpdatePlatformBillplzSettingsRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformBillplzSettingsAsync(request, cancellationToken));

    [HttpPost("platform-billplz/test")]
    public async Task<ActionResult<PlatformBillplzTestResultDto>> TestPlatformBillplz(UpdatePlatformBillplzSettingsRequest request, CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await settingsService.TestPlatformBillplzAsync(request, cancellationToken));
        }
        catch (UnauthorizedAccessException)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only platform owners can test Billplz settings.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("platform-upload-policy")]
    public async Task<ActionResult<PlatformUploadPolicyDto>> GetPlatformUploadPolicy(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetPlatformUploadPolicyAsync(cancellationToken));

    [HttpPut("platform-upload-policy")]
    public async Task<ActionResult<PlatformUploadPolicyDto>> UpdatePlatformUploadPolicy(UpdatePlatformUploadPolicyRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdatePlatformUploadPolicyAsync(request, cancellationToken));

    [HttpGet("upload-policy")]
    public async Task<ActionResult<PlatformUploadPolicyDto>> GetCurrentUploadPolicy(CancellationToken cancellationToken) =>
        Ok(await settingsService.GetCurrentUploadPolicyAsync(cancellationToken));

    [HttpGet("invoice-settings/payment-qr")]
    public async Task<IActionResult> GetPaymentQr([FromQuery] Guid? companyId, CancellationToken cancellationToken)
    {
        var file = await settingsService.GetPaymentQrAsync(companyId, cancellationToken);
        return file is null ? NotFound() : File(file.Content, file.ContentType, file.FileName);
    }

    [HttpPost("invoice-settings/payment-qr")]
    [Authorize(Policy = "OwnerOnly")]
    [RequestSizeLimit(5_000_000)]
    public async Task<ActionResult<CompanyInvoiceSettingsDto>> UploadPaymentQr([FromQuery] Guid? companyId, IFormFile file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Please choose a QR image to upload.");
        }

        if (file.Length > 5_000_000)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Payment QR exceeds the platform maximum upload size.");
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var settings = await settingsService.UploadPaymentQrAsync(companyId, stream, file.FileName, cancellationToken);
            return settings is null ? NotFound() : Ok(settings);
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: exception.Message);
        }
    }

    [HttpGet("dunning-rules")]
    public async Task<ActionResult<IReadOnlyCollection<DunningRuleDto>>> GetDunningRules([FromQuery] Guid? companyId, CancellationToken cancellationToken) =>
        Ok(await settingsService.GetDunningRulesAsync(companyId, cancellationToken));

    [HttpPut("dunning-rules")]
    [Authorize(Policy = "OwnerOnly")]
    public async Task<ActionResult<IReadOnlyCollection<DunningRuleDto>>> UpdateDunningRules([FromQuery] Guid? companyId, UpdateDunningRulesRequest request, CancellationToken cancellationToken) =>
        Ok(await settingsService.UpdateDunningRulesAsync(companyId, request, cancellationToken));

    [HttpGet("reminder-history")]
    public async Task<ActionResult<ReminderHistoryPageDto>> GetReminderHistory([FromQuery] Guid? companyId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default) =>
        Ok(await settingsService.GetReminderHistoryAsync(companyId, page, pageSize, cancellationToken));
}
