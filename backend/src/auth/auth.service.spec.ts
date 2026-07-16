import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    orgId: 'org-1',
    email: 'a@veralogix.co.za',
    passwordHash: 'hashed',
    firstName: 'Andries',
    lastName: 'Liebenberg',
    isActive: true,
    ...overrides,
  } as User;
}

function setup(user: User | null) {
  const usersRepo = {
    findOne: jest.fn().mockResolvedValue(user),
  } as unknown as Repository<User>;
  const jwt = {
    signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
  } as unknown as JwtService;
  return { service: new AuthService(usersRepo, jwt), jwt };
}

describe('AuthService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('issues a token carrying the user id + org and strips the password hash', async () => {
    const { service, jwt } = setup(makeUser());
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const result = await service.login('a@veralogix.co.za', 'secret');

    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      orgId: 'org-1',
      email: 'a@veralogix.co.za',
    });
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe('a@veralogix.co.za');
  });

  it('rejects a wrong password with 401', async () => {
    const { service } = setup(makeUser());
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    await expect(service.login('a@veralogix.co.za', 'nope')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown email with 401 (no account enumeration)', async () => {
    const { service } = setup(null);
    await expect(service.login('ghost@x.co', 'secret')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an inactive user even with the right password', async () => {
    const { service } = setup(makeUser({ isActive: false }));
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    await expect(service.login('a@veralogix.co.za', 'secret')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns the org-scoped profile without the hash', async () => {
    const { service } = setup(makeUser());
    const profile = await service.profile('user-1', 'org-1');
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile.id).toBe('user-1');
  });
});
