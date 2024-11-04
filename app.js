import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import bcrypt from 'bcrypt';
import pg from 'pg';
import session from "express-session";
import passport from "passport";

const app = express();
const PORT = 3000;
const saltRounds = 12;
let cachedWeather;
let lastFetchTime;

const db = new pg.Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'blog',
    password: 'k7F^Bj83a#cDs@iA5L',
    port: 5432
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'useEncryptedValueFrom.envFile',
    resave: false, // option is to save the session to the database,
    saveUninitialized: true
}));
// passport is after session
app.use(passport.initialize());
app.use(passport.session());

async function fetchWeather() {
    const currentTime = new Date().getTime();
    if (!lastFetchTime || currentTime - lastFetchTime > 60 * 60 * 1000) {
        const url = 'https://api.openweathermap.org/data/2.5/weather?lat=42.698334&lon=23.319941&units=metric&lang=bg&appid=54e3f85ed731175621163b6963ad1bba';
        try {
            const response = await axios.get(url);
            cachedWeather = response.data;
            lastFetchTime = currentTime;
        } catch (error) {
            console.error(error.stack);
            cachedWeather = null;
        }
    }
    return cachedWeather;
}

app.get('/', async (req, res) => {
    const weather = await fetchWeather();

    res.locals.weather = weather;

    res.render('index.ejs', {
        headerLinks: [
            { text: 'Login', url: '/login' },
            { text: 'Register', url: '/register' },
            { text: 'Contact', url: '/contact' }
        ]
    });
});

app.get('/register', (req, res) => {
    res.render('register.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Login', url: '/login' }
        ]
    });
});

app.get('/login', (req, res) => {
    res.render('login.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Register', url: '/register' }
        ]
    });
});

app.get('/profile', (req, res) => {
    res.render('profile.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Add article', url: '/add' },
            { text: 'Logout', url: '/logout' }
        ]
    });
});

app.get('/article', (req, res) => {
    res.render('article.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Add article', url: '/add' },
            { text: 'Logout', url: '/logout' }
        ]
    });
})

app.post('/register', async (req, res, next) => {
    const { username, email, password, repeatPassword } = req.body;

    try {
        const result = await db.query('SELECT email FROM users WHERE email = $1', [email]);

        if (result.rows.length == 0) {
            if (password !== repeatPassword) {
                return res.render('register.ejs', {
                    headerLinks: [
                        { text: 'Home', url: '/' },
                        { text: 'Login', url: '/login' }
                    ],
                    error: 'Passwords don\'t match.'
                })
            }

            //create logic to send mail to ensure it's real
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    //err logic
                } else {
                    await db.query('INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
                        [username, email, hash]);
                    res.redirect('/profile');
                }
            });
        } else {
            // login as alternative
            return res.render('register.ejs', {
                headerLinks: [
                    { text: 'Home', url: '/' },
                    { text: 'Login', url: '/login' }
                ],
                error: 'Email already exists.'
            })
        }
    } catch (error) {
        next(error);
    }
});

app.post('/login', async (req, res, next) => {
    const loginPass = req.body.password;
    const loginEmail = req.body.email;

    try {
        const result = await db.query('SELECT email, password_hash FROM users WHERE email = $1', [loginEmail]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPass = user.password_hash;

            bcrypt.compare(loginPass, storedHashedPass, (err, result) => {
                if (err) {
                    //error comparing passwords
                } else {
                    if (result) {
                        res.redirect('/profile');
                    } else {
                        // inform for incorrect password
                    }
                }
            });
        } else {
            // logic for non existent user
        }
    } catch (error) {
        next(error);
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);

    res.status(err.statusCode).json({
        success: false,
        message: err.message
    });

    //res.render('error.ejs', {
    //     message: err.message || 'Internal Server Error'
    // });
});

app.listen(PORT, () => {
    console.log(`Server listening on port: ${PORT}`);
});