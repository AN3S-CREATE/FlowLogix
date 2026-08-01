import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * JWT authentication. Registers `JwtAuthGuard` as a global guard (APP_GUARD),
 * so every HTTP route is protected unless `@Public()`. The signing secret and
 * token lifetime come from config (JWT_SECRET / JWT_EXPIRES_IN).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        const isProd = config.get<string>('NODE_ENV') === 'production';
        // Never boot production on the dev default — fail fast instead.
        if (isProd && (!secret || secret === 'dev-insecure-secret')) {
          throw new Error(
            'JWT_SECRET must be set to a secure value in production',
          );
        }
        // jsonwebtoken@9 types `expiresIn` as `number | StringValue` (ms branded
        // template), not a plain string — cast the env default accordingly.
        const expiresIn = config.get<string>(
          'JWT_EXPIRES_IN',
          '1h',
        ) as StringValue;
        return {
          secret: secret || 'dev-insecure-secret',
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
