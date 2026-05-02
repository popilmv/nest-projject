import 'dotenv/config';
import { AppDataSource } from '../database/data-source';
import { Product } from '../modules/products/product.entity';
import { User } from '../modules/users/user.entity';

const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_A_ID = '10000000-0000-0000-0000-000000000001';
const PRODUCT_B_ID = '10000000-0000-0000-0000-000000000002';

async function run() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const productRepo = AppDataSource.getRepository(Product);

  await userRepo.save(
    userRepo.create({
      id: DEMO_USER_ID,
      email: 'demo@mail.com',
    }),
  );

  const products = [
    {
      id: PRODUCT_A_ID,
      title: 'Product A',
      price: '10.00',
      stock: 5,
      imageFileId: null,
    },
    {
      id: PRODUCT_B_ID,
      title: 'Product B',
      price: '25.50',
      stock: 2,
      imageFileId: null,
    },
  ];

  for (const product of products) {
    await productRepo.save(productRepo.create(product));
  }

  await AppDataSource.destroy();
  console.log('Seed done');
  console.log(`Demo user id: ${DEMO_USER_ID}`);
  console.log(`Demo product ids: ${PRODUCT_A_ID}, ${PRODUCT_B_ID}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
