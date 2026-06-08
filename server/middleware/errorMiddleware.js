export const notFound = (req, res, next) => {
  res.status(404).json({ message: `Not Found - ${req.originalUrl}` });
};

export const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);
  const response = { message: err.message };
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }
  res.json(response);
};
