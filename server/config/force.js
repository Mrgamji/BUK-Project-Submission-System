const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

console.log('🔄 FORCE RECREATING DATABASE...');

const dbDir = path.join(__dirname, 'data');
const dbFile = path.join(dbDir, 'database.db');

// Delete existing database file if it exists
if (fs.existsSync(dbFile)) {
  console.log('🗑️ Removing existing database file...');
  fs.unlinkSync(dbFile);
  console.log('✅ Old database removed');
}

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create new database
console.log('📦 Creating new database...');
const db = new Database(dbFile);

// === USERS TABLE ===
console.log('📋 Creating users table...');
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    registration_number TEXT UNIQUE,
    phone TEXT,
    role TEXT NOT NULL,
    department TEXT,
    level TEXT,
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
console.log('📋 Creating student_supervisor_assignments table...');
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
console.log('📋 Creating reports table...');
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
    status TEXT DEFAULT 'pending',
    version INTEGER DEFAULT 1,
    submitted_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id)
  )
`).run();

// === FEEDBACK TABLE ===
console.log('📋 Creating feedback table...');
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
console.log('📋 Creating hod_feedback table...');
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
console.log('📋 Creating activity_logs table...');
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

// Add sample data with registration numbers
console.log('👥 Adding sample data...');
try {
  // Insert sample supervisor
  db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role, department)
    VALUES (?, ?, ?, ?, ?)
  `).run('supervisor@university.edu', '$2b$10$examplehash', 'Dr. John Smith', 'supervisor', 'Computer Science');

  // Insert sample HOD
  db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role, department)
    VALUES (?, ?, ?, ?, ?)
  `).run('hod@university.edu', '$2b$10$examplehash', 'Prof. Sarah Johnson', 'hod', 'Computer Science');

  // Insert sample level coordinator
  db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role, department)
    VALUES (?, ?, ?, ?, ?)
  `).run('coordinator@university.edu', '$2b$10$examplehash', 'Dr. Michael Brown', 'level_coordinator', 'Computer Science');

  // Insert sample students with registration numbers
  const students = [
    {
      email: 'student1@university.edu',
      password_hash: '$2b$10$examplehash',
      full_name: 'Alice Johnson',
      registration_number: 'CS2024001',
      role: 'student',
      department: 'Computer Science',
      level: '400'
    },
    {
      email: 'student2@university.edu',
      password_hash: '$2b$10$examplehash',
      full_name: 'Bob Williams',
      registration_number: 'CS2024002',
      role: 'student',
      department: 'Computer Science',
      level: '400'
    },
    {
      email: 'student3@university.edu',
      password_hash: '$2b$10$examplehash',
      full_name: 'Carol Davis',
      registration_number: 'CS2024003',
      role: 'student',
      department: 'Computer Science',
      level: '400'
    }
  ];

  students.forEach(student => {
    db.prepare(`
      INSERT INTO users (email, password_hash, full_name, registration_number, role, department, level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      student.email,
      student.password_hash,
      student.full_name,
      student.registration_number,
      student.role,
      student.department,
      student.level
    );
  });

  // Get the inserted IDs
  const supervisor = db.prepare('SELECT id FROM users WHERE role = ?').get('supervisor');
  const coordinator = db.prepare('SELECT id FROM users WHERE role = ?').get('level_coordinator');
  const studentUsers = db.prepare('SELECT id FROM users WHERE role = ?').all('student');

  // Create assignments
  studentUsers.forEach(student => {
    db.prepare(`
      INSERT INTO student_supervisor_assignments (student_id, supervisor_id, level_coordinator_id)
      VALUES (?, ?, ?)
    `).run(student.id, supervisor.id, coordinator.id);
  });

  console.log('✅ Sample data with registration numbers added successfully.');

} catch (error) {
  console.log('Error adding sample data:', error.message);
}

// Verify the schema
console.log('\n🔍 Verifying database schema...');
try {
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  console.log('📋 Users table columns:');
  userColumns.forEach(col => {
    console.log(`   - ${col.name} (${col.type})`);
  });

  const hasRegNumber = userColumns.some(col => col.name === 'registration_number');
  const hasPhone = userColumns.some(col => col.name === 'phone');
  
  console.log(`\n✅ registration_number column exists: ${hasRegNumber}`);
  console.log(`✅ phone column exists: ${hasPhone}`);
  
  if (hasRegNumber && hasPhone) {
    console.log('\n🎉 SUCCESS! Database has been completely recreated with all required columns!');
  } else {
    console.log('\n❌ WARNING: Some columns are missing!');
  }
  
} catch (error) {
  console.error('Error verifying schema:', error);
}

console.log('\n✅ Database force recreation completed!');
module.exports = db;