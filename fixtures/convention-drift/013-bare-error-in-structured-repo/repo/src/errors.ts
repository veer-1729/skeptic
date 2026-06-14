export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
  }
}

export function toErrorResponse(err: AppError) {
  return { error: { code: err.code, message: err.message } };
}
