using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Recurvos.Application.MasterData;

namespace Recurvos.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/master-data")]
public sealed class MasterDataController(IMasterDataService masterDataService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<MasterDataSnapshotDto>> Get(CancellationToken cancellationToken) =>
        Ok(await masterDataService.GetSnapshotAsync(cancellationToken));

    [HttpGet("myinvois-tax-types")]
    public ActionResult<IReadOnlyList<MyInvoisTaxTypeDto>> ListMyInvoisTaxTypes() =>
        Ok(MyInvoisTaxTypeCatalog.All);

    [HttpGet("warehouses")]
    public async Task<ActionResult<IReadOnlyCollection<WarehouseDto>>> ListWarehouses([FromQuery] MasterDataQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListWarehousesAsync(request, cancellationToken));

    [HttpGet("warehouses/{id:guid}")]
    public async Task<ActionResult<WarehouseDto>> GetWarehouse(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetWarehouseAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("warehouses")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<WarehouseDto>> CreateWarehouse(WarehouseUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreateWarehouseAsync(request, cancellationToken));

    [HttpPut("warehouses/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<WarehouseDto>> UpdateWarehouse(Guid id, WarehouseUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdateWarehouseAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("warehouses/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteWarehouse(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeleteWarehouseAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("accounts")]
    public async Task<ActionResult<IReadOnlyCollection<AccountDto>>> ListAccounts([FromQuery] AccountQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListAccountsAsync(request, cancellationToken));

    [HttpGet("accounts/{id:guid}")]
    public async Task<ActionResult<AccountDto>> GetAccount(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetAccountAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("accounts")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<AccountDto>> CreateAccount(AccountUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreateAccountAsync(request, cancellationToken));

    [HttpPut("accounts/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<AccountDto>> UpdateAccount(Guid id, AccountUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdateAccountAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("accounts/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteAccount(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeleteAccountAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("tax-codes")]
    public async Task<ActionResult<IReadOnlyCollection<TaxCodeDto>>> ListTaxCodes([FromQuery] TaxCodeQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListTaxCodesAsync(request, cancellationToken));

    [HttpGet("tax-codes/{id:guid}")]
    public async Task<ActionResult<TaxCodeDto>> GetTaxCode(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetTaxCodeAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("tax-codes")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<TaxCodeDto>> CreateTaxCode(TaxCodeUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreateTaxCodeAsync(request, cancellationToken));

    [HttpPut("tax-codes/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<TaxCodeDto>> UpdateTaxCode(Guid id, TaxCodeUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdateTaxCodeAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("tax-codes/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteTaxCode(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeleteTaxCodeAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("payment-terms")]
    public async Task<ActionResult<IReadOnlyCollection<PaymentTermDto>>> ListPaymentTerms([FromQuery] MasterDataQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListPaymentTermsAsync(request, cancellationToken));

    [HttpGet("payment-terms/{id:guid}")]
    public async Task<ActionResult<PaymentTermDto>> GetPaymentTerm(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetPaymentTermAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("payment-terms")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PaymentTermDto>> CreatePaymentTerm(PaymentTermUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreatePaymentTermAsync(request, cancellationToken));

    [HttpPut("payment-terms/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PaymentTermDto>> UpdatePaymentTerm(Guid id, PaymentTermUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdatePaymentTermAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("payment-terms/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeletePaymentTerm(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeletePaymentTermAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("currencies")]
    public async Task<ActionResult<IReadOnlyCollection<CurrencyDefinitionDto>>> ListCurrencies([FromQuery] MasterDataQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListCurrenciesAsync(request, cancellationToken));

    [HttpGet("currencies/{id:guid}")]
    public async Task<ActionResult<CurrencyDefinitionDto>> GetCurrency(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetCurrencyAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("currencies")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CurrencyDefinitionDto>> CreateCurrency(CurrencyDefinitionUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreateCurrencyAsync(request, cancellationToken));

    [HttpPut("currencies/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<CurrencyDefinitionDto>> UpdateCurrency(Guid id, CurrencyDefinitionUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdateCurrencyAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("currencies/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteCurrency(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeleteCurrencyAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("product-categories")]
    public async Task<ActionResult<IReadOnlyCollection<ProductCategoryDto>>> ListProductCategories([FromQuery] MasterDataQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListProductCategoriesAsync(request, cancellationToken));

    [HttpGet("product-categories/{id:guid}")]
    public async Task<ActionResult<ProductCategoryDto>> GetProductCategory(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetProductCategoryAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("product-categories")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductCategoryDto>> CreateProductCategory(ProductCategoryUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreateProductCategoryAsync(request, cancellationToken));

    [HttpPut("product-categories/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<ProductCategoryDto>> UpdateProductCategory(Guid id, ProductCategoryUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdateProductCategoryAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("product-categories/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeleteProductCategory(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeleteProductCategoryAsync(id, cancellationToken) ? NoContent() : NotFound();

    [HttpGet("price-levels")]
    public async Task<ActionResult<IReadOnlyCollection<PriceLevelDto>>> ListPriceLevels([FromQuery] MasterDataQueryRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.ListPriceLevelsAsync(request, cancellationToken));

    [HttpGet("price-levels/{id:guid}")]
    public async Task<ActionResult<PriceLevelDto>> GetPriceLevel(Guid id, CancellationToken cancellationToken)
    {
        var result = await masterDataService.GetPriceLevelAsync(id, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpPost("price-levels")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PriceLevelDto>> CreatePriceLevel(PriceLevelUpsertRequest request, CancellationToken cancellationToken) =>
        Ok(await masterDataService.CreatePriceLevelAsync(request, cancellationToken));

    [HttpPut("price-levels/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<ActionResult<PriceLevelDto>> UpdatePriceLevel(Guid id, PriceLevelUpsertRequest request, CancellationToken cancellationToken)
    {
        var result = await masterDataService.UpdatePriceLevelAsync(id, request, cancellationToken);
        return result is null ? NotFound() : Ok(result);
    }

    [HttpDelete("price-levels/{id:guid}")]
    [Authorize(Policy = "ManageBilling")]
    public async Task<IActionResult> DeletePriceLevel(Guid id, CancellationToken cancellationToken) =>
        await masterDataService.DeletePriceLevelAsync(id, cancellationToken) ? NoContent() : NotFound();
}
