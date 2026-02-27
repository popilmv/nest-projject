import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/product.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileRecord } from './entities/file-record.entity';
import { S3Service } from './storage/s3.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecord, Product])],
  controllers: [FilesController],
  providers: [FilesService, S3Service],
})
export class FilesModule {}
