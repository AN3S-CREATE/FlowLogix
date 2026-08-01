import { isMongoRequiredForHealth } from './health-mongo.util';

describe('isMongoRequiredForHealth', () => {
  const prev = process.env.HEALTH_REQUIRE_MONGO;

  afterEach(() => {
    if (prev === undefined) delete process.env.HEALTH_REQUIRE_MONGO;
    else process.env.HEALTH_REQUIRE_MONGO = prev;
  });

  it('defaults to requiring mongo when unset', () => {
    delete process.env.HEALTH_REQUIRE_MONGO;
    expect(isMongoRequiredForHealth()).toBe(true);
  });

  it('treats false/0/no as optional', () => {
    process.env.HEALTH_REQUIRE_MONGO = 'false';
    expect(isMongoRequiredForHealth()).toBe(false);
    process.env.HEALTH_REQUIRE_MONGO = '0';
    expect(isMongoRequiredForHealth()).toBe(false);
    process.env.HEALTH_REQUIRE_MONGO = 'no';
    expect(isMongoRequiredForHealth()).toBe(false);
  });

  it('treats true/other as required', () => {
    process.env.HEALTH_REQUIRE_MONGO = 'true';
    expect(isMongoRequiredForHealth()).toBe(true);
    process.env.HEALTH_REQUIRE_MONGO = 'yes';
    expect(isMongoRequiredForHealth()).toBe(true);
  });
});
