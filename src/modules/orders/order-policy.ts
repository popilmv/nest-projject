import {
  ConflictError,
  NotFoundError,
} from '../../common/errors/http-exception';

export type OrderItemInput = {
  productId: string;
  quantity: number;
};

export type ProductSnapshot = {
  id: string;
  price: string | number;
  stock: number;
};

export type OrderPlan = {
  amountCents: number;
  quantityByProductId: Map<string, number>;
};

export function aggregateItemQuantities(
  items: OrderItemInput[],
): Map<string, number> {
  const quantityByProductId = new Map<string, number>();

  for (const item of items) {
    quantityByProductId.set(
      item.productId,
      (quantityByProductId.get(item.productId) ?? 0) + item.quantity,
    );
  }

  return quantityByProductId;
}

export function buildOrderPlan(
  products: ProductSnapshot[],
  items: OrderItemInput[],
): OrderPlan {
  const quantityByProductId = aggregateItemQuantities(items);
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );

  const missing = [...quantityByProductId.keys()].filter(
    (productId) => !productsById.has(productId),
  );

  if (missing.length > 0) {
    throw new NotFoundError('Some products not found', { missing });
  }

  let amountCents = 0;

  for (const [productId, quantity] of quantityByProductId.entries()) {
    const product = productsById.get(productId)!;

    if (product.stock < quantity) {
      throw new ConflictError('Insufficient product stock', {
        productId,
        requested: quantity,
        available: product.stock,
      });
    }

    amountCents += Math.round(Number(product.price) * 100) * quantity;
  }

  return { amountCents, quantityByProductId };
}
