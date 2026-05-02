import { ConflictError, NotFoundError } from '../../common/errors/http-exception';
import { buildOrderPlan } from './order-policy';

describe('order policy', () => {
  it('calculates total amount in cents and aggregates duplicate product quantities', () => {
    const plan = buildOrderPlan(
      [
        { id: 'p1', price: '10.00', stock: 5 },
        { id: 'p2', price: '25.50', stock: 2 },
      ],
      [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
        { productId: 'p1', quantity: 1 },
      ],
    );

    expect(plan.amountCents).toBe(5550);
    expect(plan.quantityByProductId.get('p1')).toBe(3);
    expect(plan.quantityByProductId.get('p2')).toBe(1);
  });

  it('rejects order when requested quantity exceeds stock', () => {
    expect(() =>
      buildOrderPlan(
        [{ id: 'p1', price: '10.00', stock: 1 }],
        [{ productId: 'p1', quantity: 2 }],
      ),
    ).toThrow(ConflictError);
  });

  it('rejects order with missing product', () => {
    expect(() =>
      buildOrderPlan(
        [{ id: 'p1', price: '10.00', stock: 5 }],
        [{ productId: 'missing', quantity: 1 }],
      ),
    ).toThrow(NotFoundError);
  });
});
