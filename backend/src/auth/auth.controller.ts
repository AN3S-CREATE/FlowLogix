import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService, LoginResult, SafeUser } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Exchange email + password for a bearer token. */
  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.email, dto.password);
  }

  /** The authenticated principal's own profile. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<SafeUser> {
    return this.authService.profile(user.userId, user.orgId);
  }
}
