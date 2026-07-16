import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { JwtPayload } from './auth-user';

/** The public shape of a user — never leaks the password hash. */
export type SafeUser = Omit<User, 'passwordHash'>;

export interface LoginResult {
  accessToken: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Verify email + password and issue a JWT carrying the user's id and org.
   * The org travels *in the signed token*, so downstream tenant scoping can't
   * be spoofed by the client. Failures are deliberately indistinguishable
   * (same 401) so the endpoint can't be used to enumerate accounts.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.usersRepo.findOne({ where: { email } });
    const ok =
      user !== null &&
      user.isActive &&
      (await bcrypt.compare(password, user.passwordHash));
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      orgId: user.orgId,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: this.strip(user) };
  }

  /** Load the current principal's profile (org-scoped), minus the hash. */
  async profile(userId: string, orgId: string): Promise<SafeUser> {
    const user = await this.usersRepo.findOne({ where: { id: userId, orgId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return this.strip(user);
  }

  private strip(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
