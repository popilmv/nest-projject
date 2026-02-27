import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsDateString } from 'class-validator';
import { GqlOrderStatus } from '../models/order-status.enum';

@InputType()
export class OrdersFilterInput {
  @Field(() => GqlOrderStatus, { nullable: true })
  @IsOptional()
  status?: GqlOrderStatus;

  // ISO string is easiest for HW; if you want proper DateTime scalar later, swap type.
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
