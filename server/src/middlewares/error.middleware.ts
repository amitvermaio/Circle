import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFound: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.originalUrl} was not found`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
  const message = statusCode >= 500 ? "Internal server error" : error.message;

  response.status(statusCode).json({
    success: false,
    error: {
      code: error.code ?? "INTERNAL_SERVER_ERROR",
      message,
    },
  });
};
