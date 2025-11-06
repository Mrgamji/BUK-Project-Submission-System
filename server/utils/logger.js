const db = require('../config/database');

const logActivity = (user_id, action, entity_type = null, entity_id = null, details = {}) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    
    // Convert details to JSON string if it's an object
    const detailsString = typeof details === 'object' ? JSON.stringify(details) : details;
    
    stmt.run(
      user_id, 
      action, 
      entity_type, 
      entity_id, 
      detailsString
    );
    
    console.log(`📝 Activity logged: ${action} by user ${user_id}`);
    
  } catch (err) {
    console.error('❌ Error logging activity:', err);
    
    // If activity_logs table doesn't exist, create it and try again
    if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
      try {
        console.log('🔄 Creating activity_logs table...');
        
        db.prepare(`
          CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            details TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `).run();
        
        // Create index for better performance
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at)`).run();
        
        console.log('✅ Activity logs table created successfully');
        
        // Retry the insert
        const stmt = db.prepare(`
          INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `);
        stmt.run(user_id, action, entity_type, entity_id, JSON.stringify(details));
        
        console.log(`📝 Activity logged successfully after table creation: ${action}`);
        
      } catch (createError) {
        console.error('❌ Failed to create activity_logs table:', createError);
      }
    }
  }
};

// Optional: Function to get recent activities
const getRecentActivities = (limit = 50) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        al.*,
        u.full_name as user_name,
        u.role as user_role
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  } catch (err) {
    console.error('❌ Error fetching activities:', err);
    return [];
  }
};

// Optional: Function to get user activities
const getUserActivities = (user_id, limit = 20) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM activity_logs 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    
    return stmt.all(user_id, limit);
  } catch (err) {
    console.error('❌ Error fetching user activities:', err);
    return [];
  }
};

module.exports = { 
  logActivity,
  getRecentActivities,
  getUserActivities 
};