import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import pg from "pg";
import PgSession from "connect-pg-simple";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env from "dotenv";
import multer from "multer";
import path from 'path';
import { errorHandler } from "./middlewares/errorHandler.js";
import { inexistentPage } from "./middlewares/404.js";

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
    connectionString: process.env.DATABASE_URL,
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

const PgSessionStore = PgSession(session);

app.use(session({
    store: new PgSessionStore({
        pool: db,
        tableName: 'sessions'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 12 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
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
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=42.698334&lon=23.319941&units=metric&lang=en&appid=${apiKey}`;
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

app.get('/', async (req, res, next) => {
    try {
        const result = await db.query('SELECT posts.*, users.username FROM posts INNER JOIN users ON posts.user_id = users.id ORDER BY posts.created_at DESC');
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
        next(error);
    }
});

app.get('/register', (req, res) => {
    res.render('register.ejs', {
        headerLinks: [
            { text: 'Login', url: '/login' }
        ]
    });
});

app.get('/login', (req, res) => {
    res.render('login.ejs', {
        headerLinks: [
            { text: 'Register', url: '/register' }
        ]
    });
});

// app.get('/profile', (req, res) => {
//     res.render('profile.ejs', {
//         headerLinks: [
//             { text: 'Home', url: '/' },
//             { text: 'Add Post', url: '/add' },
//             { text: 'Logout', url: '/logout' }
//         ]
//     });
// });

app.get('/add-post', (req, res) => {
    res.render('add-post.ejs', {
        headerLinks: [
            { text: 'Home', url: '/' },
            { text: 'Logout', url: '/logout' }
        ]
    });
});

app.get('/view-post/:id', async (req, res, next) => {
    const postId = req.params.id;

    try {
        const result = await db.query('SELECT * FROM posts WHERE id = $1', [postId]);
        
        res.locals.post = result.rows[0];
        
        res.render('view-post.ejs', {
            headerLinks: [
                { text: 'Home', url: '/' },
                { text: 'Logout', url: '/logout' }
            ]
        });
    } catch (error) {
        next(error);
    }
});

app.get('/edit-post/:id', async (req, res, next) => {
    try {
        const { rows } = await db.query('SELECT * FROM posts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        
        if (rows.length != 0) {
            res.locals.post = rows[0];
            res.render('edit-post.ejs', {
                headerLinks: [
                    { text: 'Home', url: '/' },
                    { text: 'Logout', url: '/logout' }
                ]
            });
        } else {
            return res.status(403).json({ error: 'Unauthorized to edit this post' });
        };
    } catch (error) {
        next(error);
    }
});

app.get('/delete-post/:id', async (req, res, next) => {
    try {
        await db.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        res.redirect('/');
    } catch (error) {
        next(error);
    }
});

app.get('/logout', (req, res, next) => {
    req.logout((error) => {
        if (error) return next(error);

        req.session.destroy((error) => {
            if (error) return next(error);
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
    const filename = req.file?.filename;
    const userId = req.user.id;
    
    try {
        await db.query(
            'INSERT INTO posts (title, content, user_id, filename) VALUES ($1, $2, $3, $4)',
            [title, content, userId, filename || 'default_image.jpg']
        );
    } catch (error) {
        next(error);
    }
    res.redirect('/');
});

app.post('/edit-post/:id', upload.single('image'), async (req, res, next) => {
    const postId = req.params.id;
    const filename = req.file?.filename;
    const values = filename
        ? [req.body.title, req.body.content, filename, postId]
        : [req.body.title, req.body.content, postId];

    const query = `
        UPDATE posts
        SET title = $1, content = $2${filename ? ', filename = $3' : ''}
        WHERE id = $${filename ? 4 : 3}
    `;

    try {
        await db.query(query, values);
        res.redirect(`/view-post/${postId}`);
    } catch (error) {
        next(error);
    }
});

passport.use(new Strategy({ usernameField: 'email' }, async function verify(email, password, cb) {
    try {
        const result = await db.query('SELECT * FROM users WHERE username=toto', [email]);

        if (result.rows.length > 0) {

            const user = result.rows[0];
         //   const storedHashedPass = '$2b$12$Ou47yZELXqJ4pFRL82Dbpe5/w0aLW3FiLEJZ63WHD3Zl69baVgsfG';//user.password_hash;
            return cb(null, user);

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

app.use(inexistentPage);

app.use(errorHandler);

app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

app.listen(PORT, () => {
    console.log(`Server listening on port: ${PORT}`);
});