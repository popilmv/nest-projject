import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { DataSource } from 'typeorm';

import { Product } from '../modules/products/product.entity';
import { createProductByIdLoader } from '../loaders/product-by-id.loader';

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => ({
        path: '/graphql',
        playground: true,
        sortSchema: true,
        autoSchemaFile: true,
        context: ({ req }) => {
          // IMPORTANT: create loaders per request (batched + cached only within one GraphQL request)
          const productRepo = dataSource.getRepository(Product);
          return {
            req,
            loaders: {
              productById: createProductByIdLoader(productRepo),
            },
          };
        },
      }),
    }),
  ],
})
export class AppGraphqlModule {}
