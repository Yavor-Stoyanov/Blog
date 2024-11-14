import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import pg from "pg";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env from "dotenv";
import multer from "multer";
import path from 'path';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/images/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({ storage: storage });
const app = express();
const PORT = 3000;
const saltRounds = 12;
env.config();

let cachedWeather;
let lastFetchTime;
const apiKey = process.env.WHEATER_API;

const db = new pg.Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, // option is to save the session to the database
    saveUninitialized: false,
    cookie: {
        maxAge: 12 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    if (req.isAuthenticated() || req.path === '/login' || req.path === '/register') {
        res.locals.user = req.user;
        return next();
    }
    res.redirect('/login');
});

async function fetchWeather() {
    const currentTime = new Date().getTime();
    if (!lastFetchTime || currentTime - lastFetchTime > 60 * 60 * 1000) {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=42.698334&lon=23.319941&units=metric&lang=bg&appid=${apiKey}`;
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
};

app.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM posts ORDER BY created_at DESC');
        console.log(result.rows)
        res.locals.posts = result.rows;
        
        const weather = await fetchWeather();
        res.locals.weather = weather;
    
        res.render('index.ejs', {
            headerLinks: [
                { text: 'Add Post', url: '/add-post' },
                { text: 'Logout', url: '/logout' }
            ]
        });
    } catch (error) {
        
    }

});

app.get('/register', (req, res) => {
    res.render('register.ejs');
});

app.get('/login', (req, res) => {
    res.render('login.ejs');
});

app.get('/profile', (req, res) => {
    res.render('profile.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Add Post', url: '/add' },
            { text: 'Logout', url: '/logout' }
        ]
    });
});

app.get('/add-post', (req, res) => {
    res.render('add-post.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Logout', url: '/logout' }
        ]
    });
});

app.get('/view-post/:id', (req, res) => {
    const postId = req.params.id;
    res.render('view-post.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Logout', url: '/logout' }
        ]
    });
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).send("Грешка при излизане.");
        }

        req.session.destroy((err) => {
            if (err) {
                return res.status(500).send("Грешка при изтриване на сесията.");
            }
            res.clearCookie("connect.sid");
            res.redirect("/login");
        });
    });
});

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
                    console.error('Error hashing password', err);
                } else {
                    const result = await db.query(
                        'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
                        [username, email, hash]
                    );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        if (err) { throw err; }
                        res.redirect('/');
                    });
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

app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login'
}));

app.post('/add-post', upload.single('image'), async (req, res, next) => {
    const { title, content } = req.body;
    const filename = req.file.filename;
    const userId = req.user.id;

    try {
        const result = await db.query(
            'INSERT INTO posts (title, content, user_id, filename) VALUES ($1, $2, $3, $4)',
            [title, content, userId, filename]);
    } catch (error) {
        next(error);
    }
    res.redirect('/');
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

passport.use(new Strategy({ usernameField: 'email' }, async function verify(email, password, cb) {
    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {

            const user = result.rows[0];
            const storedHashedPass = user.password_hash;

            bcrypt.compare(password, storedHashedPass, (err, result) => {
                if (err) {
                    return cb(err);
                } else {
                    if (result) {
                        return cb(null, user);
                    } else {
                        return cb(null, false);
                    }
                }
            });
        } else {
            return cb('User not found');
        }
    } catch (error) {
        return cb(error);
    }
}));

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(PORT, () => {
    console.log(`Server listening on port: ${PORT}`);
});