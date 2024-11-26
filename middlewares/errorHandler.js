export const errorHandler = (err, req, res, next) => {
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    let message = err.message;
    let statusCode = err.statusCode || 500;
    
    if (err.message.includes('duplicate') && err.message.includes('title')) {
        message = 'The title of the post already exists. Please, type different one.'
    }

    res.status(statusCode).render('error.ejs', {
        message: message || 'Something went wrong!',
        statusCode
    });
};