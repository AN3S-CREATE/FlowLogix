import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildAppDataSourceOptions } from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildAppDataSourceOptions({
          POSTGRES_HOST: configService.get<string>('POSTGRES_HOST'),
          POSTGRES_PORT: configService.get<string>('POSTGRES_PORT'),
          POSTGRES_DB: configService.get<string>('POSTGRES_DB'),
          APP_DB_USER: configService.get<string>('APP_DB_USER'),
          APP_DB_PASSWORD: configService.get<string>('APP_DB_PASSWORD'),
        } as NodeJS.ProcessEnv),
    }),
  ],
})
export class DatabaseModule {}
