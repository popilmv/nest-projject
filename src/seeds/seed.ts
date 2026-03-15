import 'dotenv/config';
import { AppDataSource } from '../database/data-source';
import { User } from '../modules/users/user.entity';
import { Product } from '../modules/products/product.entity';

async function run() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const productRepo = AppDataSource.getRepository(Product);

  // user seed (upsert по email)
  await userRepo
    .createQueryBuilder()
    .insert()
    .into(User)
    .values([{ email: 'demo@mail.com' }])
    .orIgnore() // relies on UNIQUE(email)
    .execute();
  const products = [
    { title: 'Product A', price: '10.00', stock: 5 },
    { title: 'Product B', price: '25.50', stock: 2 },
  ];

  for (const p of products) {
    // робимо idempotent seed через "insert if not exists"
    // для цього бажано мати UNIQUE(title) — якщо хочеш, додай unique в entity і regeneration migration
    const exists = await productRepo.findOne({ where: { title: p.title } });
    if (!exists) {
      await productRepo.save(productRepo.create(p));
    }
  }

  await AppDataSource.destroy();
  console.log('Seed done');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
