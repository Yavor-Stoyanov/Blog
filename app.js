import express from "express";

const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/', (req, res, next) => {
    try {
        res.render('index.ejs');
    } catch (error) {
        next(error);
    }
});

app.get('/register', (req, res, next) => {
    try {
        res.render('register.ejs');
    } catch (error) {
        next(error);
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);

    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on port: ${PORT}`);
});