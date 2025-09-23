const fs = require('fs');
const path = require('path');

// נתיבי המקור והיעד
const sourceDir = 'C:\\postify\\chrome-profiles';
const backupDir = 'C:\\backup-chrome';

function logMessage(message) {
    const timestamp = new Date().toLocaleString('he-IL');
    console.log(`[${timestamp}] ${message}`);
}

function copyFileSync(src, dest) {
    try {
        // ודא שתיקיית היעד קיימת
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        // העתק את הקובץ
        fs.copyFileSync(src, dest);
        return true;
    } catch (error) {
        logMessage(`❌ שגיאה בהעתקת קובץ ${src}: ${error.message}`);
        return false;
    }
}

function copyDirectoryRecursive(src, dest) {
    let copiedFiles = 0;
    let skippedFiles = 0;
    let totalSize = 0;

    function copyRecursive(currentSrc, currentDest) {
        try {
            const stats = fs.statSync(currentSrc);
            
            if (stats.isDirectory()) {
                // יצירת התיקיה ביעד אם לא קיימת
                if (!fs.existsSync(currentDest)) {
                    fs.mkdirSync(currentDest, { recursive: true });
                }
                
                // קריאת תוכן התיקיה
                const items = fs.readdirSync(currentSrc);
                
                for (const item of items) {
                    const srcItem = path.join(currentSrc, item);
                    const destItem = path.join(currentDest, item);
                    copyRecursive(srcItem, destItem);
                }
            } else {
                // העתקת קובץ
                if (copyFileSync(currentSrc, currentDest)) {
                    copiedFiles++;
                    totalSize += stats.size;
                } else {
                    skippedFiles++;
                }
            }
        } catch (error) {
            logMessage(`⚠️ שגיאה בעיבוד ${currentSrc}: ${error.message}`);
            skippedFiles++;
        }
    }
    
    copyRecursive(src, dest);
    return { copiedFiles, skippedFiles, totalSize };
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function deleteOldBackups(backupDir, keepDays = 7) {
    try {
        if (!fs.existsSync(backupDir)) return;
        
        const items = fs.readdirSync(backupDir);
        const now = Date.now();
        const maxAge = keepDays * 24 * 60 * 60 * 1000; // ימים למילישניות
        
        let deletedBackups = 0;
        
        for (const item of items) {
            const itemPath = path.join(backupDir, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isDirectory() && (now - stats.mtime.getTime()) > maxAge) {
                fs.rmSync(itemPath, { recursive: true, force: true });
                deletedBackups++;
                logMessage(`🗑️ מחק גיבוי ישן: ${item}`);
            }
        }
        
        if (deletedBackups > 0) {
            logMessage(`🧹 נמחקו ${deletedBackups} גיבויים ישנים (יותר מ-${keepDays} ימים)`);
        }
    } catch (error) {
        logMessage(`⚠️ שגיאה במחיקת גיבויים ישנים: ${error.message}`);
    }
}

async function backupChromeProfiles() {
    try {
        logMessage('🚀 מתחיל גיבוי פרופילי Chrome...');
        
        // בדיקה אם תיקיית המקור קיימת
        if (!fs.existsSync(sourceDir)) {
            logMessage('❌ תיקיית המקור לא קיימת: ' + sourceDir);
            return false;
        }
        
        // יצירת שם גיבוי עם תאריך ושעה
        const timestamp = new Date().toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '')
            .replace('T', '_');
        
        const backupName = `chrome-profiles-backup_${timestamp}`;
        const fullBackupPath = path.join(backupDir, backupName);
        
        logMessage(`📁 יוצר תיקיית גיבוי: ${fullBackupPath}`);
        
        // וידוא שתיקיית הגיבוי הראשית קיימת
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            logMessage(`✅ נוצרה תיקיית גיבוי: ${backupDir}`);
        }
        
        // מחיקת גיבויים ישנים לפני יצירת גיבוי חדש
        logMessage('🧹 בודק גיבויים ישנים למחיקה...');
        deleteOldBackups(backupDir, 7);
        
        // התחלת הגיבוי
        const startTime = Date.now();
        logMessage(`📋 מתחיל העתקת קבצים מ: ${sourceDir}`);
        
        const result = copyDirectoryRecursive(sourceDir, fullBackupPath);
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        // סיכום
        logMessage('🎉 גיבוי הושלם בהצלחה!');
        logMessage(`📊 סיכום:`);
        logMessage(`   📁 נוצר גיבוי: ${fullBackupPath}`);
        logMessage(`   📄 ${result.copiedFiles} קבצים הועתקו`);
        if (result.skippedFiles > 0) {
            logMessage(`   ⚠️ ${result.skippedFiles} קבצים דולגו (שגיאות)`);
        }
        logMessage(`   💾 גודל כולל: ${formatBytes(result.totalSize)}`);
        logMessage(`   ⏱️ זמן ביצוע: ${duration} שניות`);
        
        return true;
        
    } catch (error) {
        logMessage(`❌ שגיאה כללית בגיבוי: ${error.message}`);
        return false;
    }
}

// הרצת הגיבוי
console.log('🔄 Chrome Profiles Backup Tool');
console.log('================================');

backupChromeProfiles().then(success => {
    if (success) {
        console.log('\n✅ הגיבוי הושלם בהצלחה!');
        process.exit(0);
    } else {
        console.log('\n❌ הגיבוי נכשל!');
        process.exit(1);
    }
}).catch(error => {
    console.error('❌ שגיאה לא צפויה:', error.message);
    process.exit(1);
});