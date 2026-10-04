export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: FieldError[]) => new AppError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Autenticação necessária') => new AppError(401, 'unauthorized', msg);
export const notFound = (what = 'Recurso') => new AppError(404, 'not_found', `${what} não encontrado(a)`);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);
