// Centralized error handler. Never leaks stack traces, database internals,
// or secrets to the client — only a safe, generic message plus a code the
// frontend can branch on.
export function notFound(req, res) {
  res.status(404).json({ message: 'Route not found.' });
}

export function errorHandler(err, req, res, _next) {
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  }

  let status = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  // Always log error details so backend logs on Render / local terminal show exact stack
  console.error('[API Error]', {
    method: req.method,
    url: req.originalUrl,
    status,
    message: err.message,
    name: err.name,
    stack: err.stack,
  });

  let message = err.message;
  let code = err.code;

  if (err.name === 'ZodError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = err.errors?.map((e) => `${e.path.join('.') || 'field'}: ${e.message}`).join(', ') || 'Validation error';
  } else if (err.name === 'MulterError') {
    status = 400;
    code = err.code || 'UPLOAD_ERROR';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = err.message && err.message !== 'File too large'
        ? err.message
        : 'File size is too large (maximum allowed size is 5MB for screenshots). Please choose a smaller image.';
    } else {
      message = `Upload error: ${err.message}`;
    }
  } else if (err.type === 'entity.too.large' || status === 413) {
    status = 413;
    code = code || 'PAYLOAD_TOO_LARGE';
    message = 'Image or payload size is too large. Please upload smaller or compressed images.';
  } else if (status === 500 && isProd && !err.isCustomError) {
    message = 'Something went wrong on the server. Please try again.';
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
