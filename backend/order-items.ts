import type { OrderItem } from '../src/types';
import { HttpError } from './database';

type CatalogProduct = { id: string; tenantSlug: string; name: string; isAvailable: boolean; priceCents: number; optionGroups: unknown };

export function priceOrderItems(items: unknown[], checkoutProducts: CatalogProduct[], tenant: { slug: string }) {
  let subtotalCents = 0;
  const validatedItems: OrderItem[] = [];
  for (const input of items) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Item invÃ¡lido.');
    const item = input as Record<string, unknown>;
    const catalogProduct = checkoutProducts.find(
      (p) => p.id === item.productId && p.tenantSlug?.toLowerCase() === tenant.slug.toLowerCase()
    );
    if (!catalogProduct || catalogProduct.isAvailable === false) {
      throw new HttpError(409, 'Um item do carrinho nÃ£o existe ou nÃ£o estÃ¡ disponÃ­vel.');
    }
    const unitPriceCents = Math.max(0, Number(catalogProduct.priceCents) || 0);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, `Quantidade invÃ¡lida para ${catalogProduct.name}.`);
    }

    let optionsTotalCents = 0;
    const validatedOptions: OrderItem['selectedOptions'] = [];
    const requestedOptions = Array.isArray(item.selectedOptions) ? item.selectedOptions : [];
    if (requestedOptions.some((option: unknown) => !option || typeof option !== 'object' || Array.isArray(option))) {
      throw new HttpError(400, 'Adicional invÃ¡lido.');
    }
    const optionGroups = Array.isArray(catalogProduct.optionGroups) ? catalogProduct.optionGroups : [];
    for (const group of optionGroups) {
      const selectedIds = Array.from(
        new Set(
          requestedOptions
            .filter((option: any) => String(option.groupId || '') === String(group.id))
            .map((option: any) => String(option.itemId || ''))
            .filter(Boolean)
        )
      );
      const minSelections = Math.max(group.required ? 1 : 0, Number(group.minSelections) || 0);
      const maxSelections = Math.max(minSelections, Number(group.maxSelections) || group.items?.length || 1);
      if (selectedIds.length < minSelections || selectedIds.length > maxSelections) {
        throw new HttpError(400, `SeleÃ§Ã£o invÃ¡lida no grupo ${group.name}.`);
      }
      for (const selectedId of selectedIds) {
        const matchedOption = Array.isArray(group.items)
          ? group.items.find((option: any) => String(option.id) === selectedId)
          : undefined;
        if (!matchedOption) {
          throw new HttpError(400, `OpÃ§Ã£o invÃ¡lida no produto ${catalogProduct.name}.`);
        }
        const optionPriceCents = Math.max(0, Number(matchedOption.priceCents) || 0);
        optionsTotalCents += optionPriceCents;
        validatedOptions.push({
          groupId: String(group.id),
          groupName: String(group.name || '').slice(0, 80),
          itemId: String(matchedOption.id),
          itemName: String(matchedOption.name || '').slice(0, 100),
          priceCents: optionPriceCents,
        });
      }
    }
    if (requestedOptions.length !== validatedOptions.length) {
      throw new HttpError(400, `HÃ¡ opÃ§Ãµes desconhecidas no produto ${catalogProduct.name}.`);
    }

    const calculatedItemTotal = (unitPriceCents + optionsTotalCents) * quantity;
    subtotalCents += calculatedItemTotal;
    if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 2147483647) {
      throw new HttpError(400, 'Total acima do limite permitido.');
    }
    validatedItems.push({
      productId: String(catalogProduct.id),
      productName: String(catalogProduct.name).slice(0, 100),
      unitPriceCents,
      quantity,
      selectedOptions: validatedOptions,
      notes: item.notes ? String(item.notes).trim().slice(0, 300) : undefined,
      totalCents: calculatedItemTotal,
    });
  }
  return { subtotalCents, validatedItems };
}
