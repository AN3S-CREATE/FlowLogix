import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'logixflow-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
