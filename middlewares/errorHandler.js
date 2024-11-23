export const errorHandler = (err, req, res, next) => {
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);

    const statusCode = err.statusCode || 500; // Задава статус код по подразбиране

    // Рендерира страницата за грешки
    res.status(statusCode).render('error.ejs', {
        title: 'Error', // Заглавие на страницата
        message: err.message || 'Something went wrong!', // Съобщение за потребителя
        statusCode // Статус код за информация
    });
};