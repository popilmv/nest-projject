import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Product')
export class ProductModel {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;
  /** price is stored as numeric in DB and returned as string by TypeORM; we expose it as String */
  @Field()
  price: string;
}
