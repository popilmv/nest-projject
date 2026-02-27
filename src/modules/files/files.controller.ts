import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../common/auth/dev-auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { RequestUser } from '../../common/auth/user.types';
import { CompleteFileDto } from './dto/complete-file.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { FilesService } from './files.service';

@Controller('files')
@UseGuards(DevAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('presign')
  presign(@CurrentUser() user: RequestUser, @Body() dto: PresignFileDto) {
    return this.files.presign(user, dto);
  }

  @Post('complete')
  complete(@CurrentUser() user: RequestUser, @Body() dto: CompleteFileDto) {
    return this.files.complete(user, dto);
  }

  @Get(':id')
  getUrl(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.files.getFileUrl(user, id);
  }
}
