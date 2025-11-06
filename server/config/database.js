const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Ensure /data directory exists - FIXED THE TYPO
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite database
const dbFile = path.join(dbDir, 'database.db');
const db = new Database(dbFile);

// === USERS TABLE ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    level TEXT,
    registration_number TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`).run();

// Trigger to auto-update updated_at
db.prepare(`
  CREATE TRIGGER IF NOT EXISTS users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
  BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = OLD.id;
  END;
`).run();

// === STUDENT–SUPERVISOR ASSIGNMENTS TABLE ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS student_supervisor_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    supervisor_id INTEGER NOT NULL,
    level_coordinator_id INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id),
    FOREIGN KEY (level_coordinator_id) REFERENCES users(id)
  )
`).run();

// === REPORTS TABLE ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    supervisor_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    report_stage TEXT CHECK(report_stage IN ('progress_1','progress_2','progress_3','final')) DEFAULT 'progress_1',
    file_url TEXT,
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    status TEXT DEFAULT 'pending',
    version INTEGER DEFAULT 1,
    submitted_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id)
  )
`).run();

// Trigger to auto-update reports updated_at
db.prepare(`
  CREATE TRIGGER IF NOT EXISTS reports_updated_at
  AFTER UPDATE ON reports
  FOR EACH ROW
  BEGIN
    UPDATE reports SET updated_at = datetime('now') WHERE id = OLD.id;
  END;
`).run();

// === FEEDBACK TABLE ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    supervisor_id INTEGER NOT NULL,
    comment TEXT,
    action_taken TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES reports(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id)
  )
`).run();

// === HOD FEEDBACK TABLE ===
db.prepare(`
  CREATE TABLE IF NOT EXISTS hod_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    hod_id INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES reports(id),
    FOREIGN KEY (hod_id) REFERENCES users(id)
  )
`).run();

// === ACTIVITY LOGS TABLE ===
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

// Create indexes for better performance
db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_reports_student_id ON reports(student_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_reports_supervisor_id ON reports(supervisor_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_feedback_report_id ON feedback(report_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_assignments_student_id ON student_supervisor_assignments(student_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_assignments_supervisor_id ON student_supervisor_assignments(supervisor_id)`).run();

console.log('✅ SQLite database initialized successfully.');
console.log(`📁 Database location: ${dbFile}`);

// Test the database connection
try {
  const test = db.prepare('SELECT 1 as test').get();
  console.log('✅ Database connection test passed');
} catch (error) {
  console.error('❌ Database connection test failed:', error.message);
}

module.exports = db;