import DataLoader from 'dataloader';
import { In, Repository } from 'typeorm';
import { Product } from '../modules/products/product.entity';

/**
 * DataLoader for Product by id.
 * - batching: combines many `load(id)` calls into a single `WHERE id IN (...)` query
 * - caching: within a single GraphQL request only (DataLoader instance is created per request)
 */
export function createProductByIdLoader(repo: Repository<Product>) {
  return new DataLoader<string, Product | null>(async (ids) => {
    const uniqueIds = Array.from(new Set(ids));
    const products = await repo.findBy({ id: In(uniqueIds) });

    const map = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => map.get(id) ?? null);
  });
}
