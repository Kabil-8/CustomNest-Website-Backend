// Centralized error handler. Never leaks stack traces, database internals,
// or secrets to the client — only a safe, generic message plus a code the
// frontend can branch on.
export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

export function errorHandler(err, req, res, _next) {
  let status = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    console.error(err);
  }

  let message = err.message;
  let code = err.code;

  if (err.type === 'entity.too.large' || status === 413) {
    status = 413;
    code = code || 'PAYLOAD_TOO_LARGE';
    message = 'Image or payload size is too large. Please upload smaller or compressed images.';
  } else if (status === 500 && isProd) {
    message = 'Something went wrong. Please try again.';
  }

  res.status(status).json({
    message,
    code,
  });
}

export class AppError extends Error {
  constructor(message, statusCode = 400, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
