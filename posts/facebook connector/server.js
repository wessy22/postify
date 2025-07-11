const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

// קריאת הגדרות מקבצים
const packageJson = require('./package.json');
const config = require('./config.json');

const CHROME_PATH = config.chrome.executablePath;
const USER_DATA_DIR = config.chrome.userDataDir;
const SERVER_PORT = config.server.port;
const SCREENSHOT_INTERVAL = config.server.screenshotInterval;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = SERVER_PORT;
let browsers = new Map(); // מחזיק דפדפנים פעילים לכל לקוח

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// הגדרת template engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// יצירת תיקיה לנתוני משתמש (תיקיה יחידה לכל שרת)
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    console.log(`📁 Created user data directory: ${USER_DATA_DIR}`);
}

// דף ראשי
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// דף facebook ייעודי עם IFRAME
app.get('/facebook', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'facebook.html'));
});

// דף facebook דינמי עם IFRAME לפי כתובת IP ו-port (ללא http)
app.get('/facebook/:ipAndPort/', (req, res) => {
    const [ip, port] = req.params.ipAndPort.split(':');
    const targetUrl = `http://${ip}:${port}`;
    res.render('facebook', { targetUrl });
});

// API ליצירת דפדפן חדש
app.post('/api/create-browser/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    
    try {
        if (browsers.has(sessionId)) {
            return res.json({ status: 'success', message: 'Browser already exists' });
        }

        console.log(`🚀 Creating browser for session: ${sessionId}`);
        console.log(`📁 Using Chrome: ${CHROME_PATH}`);
        console.log(`💾 User data dir: ${USER_DATA_DIR}`);
        
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: USER_DATA_DIR,
            executablePath: CHROME_PATH,
            args: config.chrome.defaultArgs,
            defaultViewport: { width: 1280, height: 720 }
        });

        const page = await browser.newPage();
        
        // הגדרת User Agent אמיתי
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        browsers.set(sessionId, { browser, page });
        
        // פונקציה לעדכון screenshot אוטומטי
        const updateScreenshot = async () => {
            try {
                const screenshot = await page.screenshot({ 
                    encoding: 'base64',
                    fullPage: false 
                });
                io.to(sessionId).emit('screenshot', screenshot);
            } catch (error) {
                console.error('Screenshot error:', error);
            }
        };

        // screenshot ראשוני
        setTimeout(updateScreenshot, 1000);
        
        // עדכון אוטומטי כל שתי שניות
        const screenshotInterval = setInterval(updateScreenshot, SCREENSHOT_INTERVAL);
        
        // שמירת הפונקציה והאינטרוול לשימוש מאוחר יותר
        browsers.get(sessionId).updateScreenshot = updateScreenshot;
        browsers.get(sessionId).screenshotInterval = screenshotInterval;

        // הוספת מעקב אחר טעינת דפים
        page.on('framenavigated', () => {
            io.to(sessionId).emit('page-loading');
        });
        
        page.on('load', () => {
            io.to(sessionId).emit('page-loaded');
            // צילום מסך מיידי אחרי טעינת דף
            setTimeout(updateScreenshot, 500);
        });

        // ניווט לפייסבוק
        io.to(sessionId).emit('page-loading');
        await page.goto(config.facebook.defaultUrl, { waitUntil: 'networkidle2' });
        io.to(sessionId).emit('page-loaded');
        
        res.json({ 
            status: 'success', 
            message: 'Browser created successfully',
            sessionId: sessionId 
        });

    } catch (error) {
        console.error('Error creating browser:', error);
        res.json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// API לסגירת דפדפן
app.post('/api/close-browser/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    
    try {
        if (browsers.has(sessionId)) {
            const { browser, screenshotInterval } = browsers.get(sessionId);
            
            // ביטול האינטרוול לצילומי מסך
            if (screenshotInterval) {
                clearInterval(screenshotInterval);
            }
            
            await browser.close();
            browsers.delete(sessionId);
            
            console.log(`🔒 Browser closed for session: ${sessionId}`);
        }
        
        res.json({ status: 'success', message: 'Browser closed successfully' });
    } catch (error) {
        console.error('Error closing browser:', error);
        res.json({ status: 'error', message: error.message });
    }
});

// WebSocket connections
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
        console.log(`👥 Client ${socket.id} joined session: ${sessionId}`);
    });

    // טיפול בקליקים
    socket.on('click', async (data) => {
        const { sessionId, x, y } = data;
        if (browsers.has(sessionId)) {
            const { page, updateScreenshot } = browsers.get(sessionId);
            try {
                await page.mouse.click(x, y);
                console.log(`🖱️ Click at (${x}, ${y}) for session: ${sessionId}`);
                // עדכון screenshot אחרי קליק
                setTimeout(updateScreenshot, 1000);
            } catch (error) {
                console.error('Click error:', error);
            }
        }
    });

    // טיפול בהקלדה מיידית - ללא מחיקה
    socket.on('type', async (data) => {
        const { sessionId, text } = data;
        if (browsers.has(sessionId)) {
            const { page, updateScreenshot } = browsers.get(sessionId);
            try {
                // הקלדת התו ישירות ללא מחיקה
                await page.keyboard.type(text, { delay: 50 });
                console.log(`⌨️ Typed "${text}" for session: ${sessionId}`);
                
                // עדכון screenshot מיידי אחרי הקלדה
                setTimeout(updateScreenshot, 800);
            } catch (error) {
                console.error('Type error:', error);
            }
        }
    });

    // טיפול במקשים מיוחדים
    socket.on('key', async (data) => {
        const { sessionId, key } = data;
        if (browsers.has(sessionId)) {
            const { page, updateScreenshot } = browsers.get(sessionId);
            try {
                await page.keyboard.press(key);
                console.log(`🔑 Pressed key "${key}" for session: ${sessionId}`);
                // עדכון screenshot אחרי מקש
                setTimeout(updateScreenshot, 1000);
            } catch (error) {
                console.error('Key press error:', error);
            }
        }
    });

    // ניווט לכתובת
    socket.on('navigate', async (data) => {
        const { sessionId, url } = data;
        if (browsers.has(sessionId)) {
            const { page, updateScreenshot } = browsers.get(sessionId);
            try {
                // הודעה על תחילת הניווט
                io.to(sessionId).emit('page-loading');
                
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                console.log(`🌐 Navigated to ${url} for session: ${sessionId}`);
                
                // הודעה על סיום הניווט
                io.to(sessionId).emit('page-loaded');
                
                // עדכון screenshot מיידי אחרי ניווט
                setTimeout(updateScreenshot, 1000);
            } catch (error) {
                console.error('Navigation error:', error);
                io.to(sessionId).emit('page-loaded');
            }
        }
    });

    // מילוי פרטי התחברות פייסבוק
    socket.on('facebook-login', async (data) => {
        const { sessionId, email, password } = data;
        if (browsers.has(sessionId)) {
            const { page, updateScreenshot } = browsers.get(sessionId);
            try {
                console.log(`🔐 Auto-filling Facebook login for session: ${sessionId}`);
                
                // המתנה לטעינת הדף
                await page.waitForSelector('#email', { timeout: 10000 });
                
                // מילוי שדה אימייל
                await page.click('#email');
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await page.keyboard.type(email, { delay: 100 });
                
                // מילוי שדה סיסמה
                await page.click('#pass');
                await page.keyboard.down('Control');
                await page.keyboard.press('KeyA');
                await page.keyboard.up('Control');
                await page.keyboard.type(password, { delay: 100 });
                
                console.log(`✅ Facebook credentials filled for session: ${sessionId}`);
                
                // עדכון screenshot
                setTimeout(updateScreenshot, 2000);
                
            } catch (error) {
                console.error('Facebook login error:', error);
                socket.emit('facebook-login-error', { error: error.message });
            }
        }
    });

    // לחיצה על כפתור כניסה
    socket.on('facebook-submit', async (data) => {
        const { sessionId } = data;
        if (browsers.has(sessionId)) {
            const { page, updateScreenshot } = browsers.get(sessionId);
            try {
                // חיפוש כפתור הכניסה
                const loginButton = await page.$('[name="login"]') || 
                                   await page.$('[data-testid="royal_login_button"]') ||
                                   await page.$('button[type="submit"]');
                
                if (loginButton) {
                    await loginButton.click();
                    console.log(`🚀 Login button clicked for session: ${sessionId}`);
                    
                    // המתנה ועדכון screenshot
                    setTimeout(updateScreenshot, 3000);
                } else {
                    console.error('Login button not found');
                    socket.emit('facebook-login-error', { error: 'Login button not found' });
                }
                
            } catch (error) {
                console.error('Facebook submit error:', error);
                socket.emit('facebook-login-error', { error: error.message });
            }
        }
    });
    socket.on('refresh-screenshot', async (data) => {
        const { sessionId } = data;
        if (browsers.has(sessionId)) {
            const { updateScreenshot } = browsers.get(sessionId);
            try {
                await updateScreenshot();
                console.log(`🔄 Manual screenshot refresh for session: ${sessionId}`);
            } catch (error) {
                console.error('Manual refresh error:', error);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// ניקוי בעת סגירת השרת
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    
    for (const [sessionId, { browser }] of browsers) {
        try {
            await browser.close();
            console.log(`✅ Closed browser for session: ${sessionId}`);
        } catch (error) {
            console.error(`❌ Error closing browser for session ${sessionId}:`, error);
        }
    }
    
    process.exit(0);
});

process.env.NODE_PATH = 'C:\\postify\\node_modules';
require('module').Module._initPaths();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 External access: http://[YOUR-SERVER-IP]:${PORT}`);
    console.log(`📱 Facebook Remote Browser System Ready!`);
    console.log(`🔒 User data stored in: ${USER_DATA_DIR}`);
    console.log(`🌐 Chrome executable: ${CHROME_PATH}`);
    console.log(`💡 Each server instance uses its own Chrome profile`);
});
