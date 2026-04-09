import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { DevAuthGuard } from '../../common/auth/dev-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { RequestUser } from '../../common/auth/user.types';
import { AuditService } from '../../common/audit/audit.service';
import type { AppRequest } from '../../common/request/request.types';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @UseGuards(DevAuthGuard)
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: AppRequest,
  ) {
    if (dto.userId && dto.userId !== user.id) {
      this.audit.logHttp(req, {
        action: 'orders.create.denied_user_mismatch',
        targetType: 'user',
        targetId: dto.userId,
        outcome: 'denied',
        reason: 'Body userId does not match authenticated principal',
      });
      throw new ForbiddenException(
        'Body userId must match authenticated principal',
      );
    }

    try {
      const result = await this.ordersService.createOrder(
        {
          ...dto,
          userId: user.id,
        },
        idempotencyKey,
      );

      this.audit.logHttp(req, {
        action: result.reused ? 'orders.create.reused' : 'orders.create.accepted',
        targetType: 'order',
        targetId: result.order.id,
        outcome: 'success',
        reason: result.reused ? 'Idempotency key replay' : 'Order accepted',
      });

      return result;
    } catch (error) {
      this.audit.logHttp(req, {
        action: 'orders.create.failed',
        targetType: 'order',
        targetId: null,
        outcome: 'failure',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
