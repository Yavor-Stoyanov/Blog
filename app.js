import express from "express";
import axios from "axios";

const app = express();
const PORT = 3000;
let cachedWeather;
let lastFetchTime;

app.use(express.static('public'));

async function fetchWeather() {
    const currentTime = new Date().getTime();
    if (!lastFetchTime || currentTime - lastFetchTime > 15 * 60 * 1000) {
        const url = 'https://api.openweathermap.org/data/2.5/weather?lat=42.698334&lon=23.319941&units=metric&lang=bg&appid=54e3f85ed731175621163b6963ad1bba';
        try {
            const responce = await axios.get(url);
            cachedWeather = responce.data;
            lastFetchTime = currentTime;
        } catch (error) {
            console.error('Error fetching weather:', error.message);
            cachedWeather = null;
        }
    }
    return cachedWeather;
}

app.get('/', async (req, res, next) => {
    try {
        const weather = await fetchWeather();
        res.locals.weather = weather || { error: 'Weather data unavailable' };

    } catch (error) {

    }

    try {
        res.render('index.ejs', {
            headerLinks: [
                { text: 'Login', url: '/login' },
                { text: 'Register', url: '/register' },
                { text: 'Contact', url: '/contact' }
            ]
        });
    } catch (error) {
        next(error);
    }
});

app.get('/register', (req, res, next) => {
    try {
        res.render('register.ejs', {
            headerLinks: [
                { text: 'Home', url: '/' },
                { text: 'Login', url: '/login' }
            ]
        });
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