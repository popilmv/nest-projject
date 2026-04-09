import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../common/auth/dev-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { RequestUser } from '../../common/auth/user.types';
import { CompleteFileDto } from './dto/complete-file.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { FilesService } from './files.service';
import { AuditService } from '../../common/audit/audit.service';
import type { AppRequest } from '../../common/request/request.types';

@Controller('files')
@UseGuards(DevAuthGuard)
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  @Post('presign')
  async presign(
    @CurrentUser() user: RequestUser,
    @Body() dto: PresignFileDto,
    @Req() req: AppRequest,
  ) {
    try {
      const result = await this.files.presign(user, dto);
      this.audit.logHttp(req, {
        action: 'files.presign.succeeded',
        targetType: dto.entityType,
        targetId: dto.entityId,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.audit.logHttp(req, {
        action: 'files.presign.failed',
        targetType: dto.entityType,
        targetId: dto.entityId,
        outcome: 'failure',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  @Post('complete')
  async complete(
    @CurrentUser() user: RequestUser,
    @Body() dto: CompleteFileDto,
    @Req() req: AppRequest,
  ) {
    try {
      const result = await this.files.complete(user, dto);
      this.audit.logHttp(req, {
        action: 'files.complete.succeeded',
        targetType: 'file',
        targetId: dto.fileId,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.audit.logHttp(req, {
        action: 'files.complete.failed',
        targetType: 'file',
        targetId: dto.fileId,
        outcome: 'failure',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  @Get(':id')
  async getUrl(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Req() req: AppRequest,
  ) {
    try {
      const result = await this.files.getFileUrl(user, id);
      this.audit.logHttp(req, {
        action: 'files.read_url.issued',
        targetType: 'file',
        targetId: id,
        outcome: 'success',
      });
      return result;
    } catch (error) {
      this.audit.logHttp(req, {
        action: 'files.read_url.failed',
        targetType: 'file',
        targetId: id,
        outcome: 'failure',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
