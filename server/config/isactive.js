const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'data');
const dbFile = path.join(dbDir, 'database.db');

function migrateIsActiveColumn() {
  try {
    console.log('🚀 Starting migration: Ensuring is_active column exists...');
    
    const db = new Database(dbFile);
    
    // Check if is_active column exists in users table
    const columns = db.prepare(`PRAGMA table_info(users)`).all();
    const hasIsActiveColumn = columns.some(col => col.name === 'is_active');
    
    if (!hasIsActiveColumn) {
      console.log('📝 Adding is_active column to users table...');
      
      // Add the column
      db.prepare(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`).run();
      
      // Update any existing records to set is_active = 1
      db.prepare(`UPDATE users SET is_active = 1 WHERE is_active IS NULL`).run();
      
      console.log('✅ Successfully added is_active column with default value 1');
      console.log('✅ All existing users set to is_active = 1');
    } else {
      console.log('✅ is_active column already exists in users table');
      
      // Ensure default value is set for any NULL values
      const nullCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE is_active IS NULL`).get().count;
      if (nullCount > 0) {
        console.log(`🔄 Setting is_active = 1 for ${nullCount} users with NULL values...`);
        db.prepare(`UPDATE users SET is_active = 1 WHERE is_active IS NULL`).run();
        console.log('✅ All NULL values updated to is_active = 1');
      }
    }
    
    // Verify the migration
    const verify = db.prepare(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN is_active IS NULL OR is_active = 0 THEN 1 ELSE 0 END) as inactive_users
      FROM users
    `).get();
    
    console.log('📊 Migration verification:');
    console.log(`   Total users: ${verify.total_users}`);
    console.log(`   Active users: ${verify.active_users}`);
    console.log(`   Inactive users: ${verify.inactive_users}`);
    
    db.close();
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  migrateIsActiveColumn();
}

module.exports = migrateIsActiveColumn;