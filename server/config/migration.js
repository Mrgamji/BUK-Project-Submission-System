const db = require('../config/database');

console.log('Running database migration...');

try {
  // Add registration_number column if it doesn't exist
  try {
    db.prepare('ALTER TABLE users ADD COLUMN registration_number TEXT UNIQUE').run();
    console.log('✅ Added registration_number column to users table');
  } catch (e) {
    console.log('ℹ️ registration_number column already exists');
  }

  // Add phone column if it doesn't exist
  try {
    db.prepare('ALTER TABLE users ADD COLUMN phone TEXT').run();
    console.log('✅ Added phone column to users table');
  } catch (e) {
    console.log('ℹ️ phone column already exists');
  }

  // Update existing students with sample registration numbers
  const students = db.prepare('SELECT id FROM users WHERE role = ?').all('student');
  
  students.forEach((student, index) => {
    const registrationNumber = `CSC/20/${String(index + 1).padStart(4, '0')}`;
    try {
      db.prepare('UPDATE users SET registration_number = ? WHERE id = ? AND registration_number IS NULL')
        .run(registrationNumber, student.id);
    } catch (e) {
      console.log('ℹ️ Could not update student', student.id);
    }
  });

  console.log('✅ Migration completed successfully');
} catch (error) {
  console.error('❌ Migration error:', error.message);
}