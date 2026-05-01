const AppError = require('../utils/AppError');

const notFound = (req, res, next) => {
    next(new AppError(`Route not found: ${req.originalUrl}`, 404));
};

const errorHandler = (err, req, res, next) => {
    console.log("!!! SERVER ERROR DETECTED !!!", err);
    console.error('DEBUG ERROR:', err);
    console.error("❌ BACKEND ERROR:", {
        message: err.message,
        stack: err.stack,
        statusCode: err.statusCode
    });

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        success: false,
        status: err.status || 'error',
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
};

module.exports = {
    notFound,
    errorHandler
};