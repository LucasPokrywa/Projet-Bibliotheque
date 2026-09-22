import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { AppService } from '../app.service.js';

@ApiTags('Accueil')
@Controller('v1')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Message d’accueil de l’API' })
  @ApiOkResponse({ schema: { type: 'string', example: 'Hello World!' } })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
