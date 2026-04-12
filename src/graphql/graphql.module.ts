import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver } from '@nestjs/apollo';
import { join } from 'path';
import { DataSource } from 'typeorm';

import { Product } from '../modules/products/product.entity';
import { createProductByIdLoader } from '../loaders/product-by-id.loader';

@Module({
  imports: [
    GraphQLModule.forRootAsync({
      driver: ApolloDriver,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => {
        const isProd = process.env.NODE_ENV === 'production';

        return {
          path: '/graphql',
          playground: !isProd,
          sortSchema: true,
          autoSchemaFile: isProd ? true : join(process.cwd(), 'schema.gql'),
          context: ({ req }: { req: any }) => {
            const productRepo = dataSource.getRepository(Product);

            return {
              req,
              loaders: {
                productById: createProductByIdLoader(productRepo),
              },
            };
          },
        };
      },
    }),
  ],
})
export class AppGraphqlModule {}