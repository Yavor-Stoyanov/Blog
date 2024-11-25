export const errorHandler = (err, req, res, next) => {
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);

    const statusCode = err.statusCode || 500;

    res.status(statusCode).render('error.ejs', {
        title: 'Error',
        message: err.message || 'Something went wrong!',
        statusCode
    });
};