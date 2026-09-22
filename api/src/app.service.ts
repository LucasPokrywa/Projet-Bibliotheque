import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AppService {
  constructor(private readonly database: DatabaseService) {}

  trouverLivre(id: number) {
    return this.database.trouverLivre(id);
  }

  getHello(): string {
    return 'Hello World!';
  }
}
