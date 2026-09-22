import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import type { ProblemDetailsDto } from './problem-details.dto.js';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    if (response.headersSent) return;

    // Express/body-parser peut lever une erreur HTTP hors de la hiérarchie Nest.
    const external = exception as {
      statusCode?: unknown;
      message?: unknown;
    } | null;
    const externalStatus = external?.statusCode;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : typeof externalStatus === 'number' &&
            Number.isInteger(externalStatus) &&
            externalStatus >= 400 &&
            externalStatus <= 599
          ? externalStatus
          : 500;
    const title = STATUS_CODES[status] ?? 'HTTP Error';
    let detail = title;
    let errors: string[] | undefined;

    if (
      status === 500 ||
      (status >= 500 && !(exception instanceof HttpException))
    ) {
      detail = 'Une erreur interne est survenue.';
      // Ne pas journaliser le corps, les identifiants ou les paramètres SQL.
      this.logger.error(
        'Erreur interne lors du traitement de la requête HTTP.',
      );
    } else if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        detail = payload;
      } else {
        const data = payload as Record<string, unknown>;
        if (Array.isArray(data.message)) {
          errors = data.message.filter(
            (message): message is string => typeof message === 'string',
          );
          detail = 'Les données envoyées sont invalides.';
        } else if (typeof data.message === 'string') {
          detail = data.message;
        } else if (typeof data.error === 'string') {
          // Notamment le message JSON renvoyé par le programme Python.
          detail = data.error;
        }
      }
    }

    const problem: ProblemDetailsDto = {
      type: 'about:blank',
      title,
      status,
      detail,
      // Les paramètres de recherche peuvent contenir des informations sensibles.
      instance: request.originalUrl.split('?')[0],
      ...(errors?.length ? { errors } : {}),
    };
    response.status(status).type('application/problem+json').json(problem);
  }
}
