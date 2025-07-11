const puppeteer = require('puppeteer');

// קריאת הגדרות Chrome מ-package.json
const packageJson = require('./package.json');
const CHROME_PATH = packageJson.config.chromePath;

async function testPuppeteer() {
    console.log('🧪 Testing Puppeteer setup...');
    console.log(`🌐 Chrome path: ${CHROME_PATH}`);
    
    try {
        console.log('📂 Creating browser...');
        
        const browser = await puppeteer.launch({
            headless: false, // נראה את הדפדפן
            executablePath: CHROME_PATH,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--start-maximized'
            ],
            defaultViewport: { width: 1280, height: 720 }
        });
        
        console.log('✅ Browser created successfully!');
        
        const page = await browser.newPage();
        console.log('📄 New page created');
        
        await page.goto('https://www.google.com');
        console.log('🌐 Navigated to Google');
        
        const title = await page.title();
        console.log('📝 Page title:', title);
        
        // נחכה 3 שניות ואז נסגור
        setTimeout(async () => {
            await browser.close();
            console.log('🔒 Browser closed');
            console.log('✅ Test completed successfully!');
        }, 3000);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('💡 Check if Chrome is installed at:', CHROME_PATH);
    }
}

testPuppeteer();
