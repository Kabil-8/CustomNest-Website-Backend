// Centralized error handler. Never leaks stack traces, database internals,
// or secrets to the client — only a safe, generic message plus a code the
// frontend can branch on.
export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

export function errorHandler(err, req, res, _next) {
  const status = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    console.error(err);
  }

  res.status(status).json({
    message: status === 500 && isProd ? 'Something went wrong. Please try again.' : err.message,
    code: err.code,
  });
}

export class AppError extends Error {
  constructor(message, statusCode = 400, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
