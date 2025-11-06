const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./config/database');
const bcrypt = require('bcryptjs');
const { setUserContext } = require('./middleware/auth');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const coordinatorRoutes = require('./routes/coordinatorRoutes');
const hodRoutes = require('./routes/hodRoutes');
const supervisorRoutes = require('./routes/supervisorRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// === View engine ===
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// === Middleware ===
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ✅ Session (required for CSRF)
app.use(session({
  secret: process.env.SESSION_SECRET || 'project-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, 
    httpOnly: true 
  }
}));

// ✅ Flash messages
app.use(flash());

// ✅ Static folders
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ✅ Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ✅ User context middleware
app.use(setUserContext);

// === Seed default users ===
function seedDefaultUsers() {
  try {
    console.log('🔍 Checking for default users...');
    
    // Check if users table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='users'
    `).get();

    if (!tableExists) {
      console.log('❌ Users table does not exist yet');
      return;
    }

    const defaultUsers = [
      {
        email: 'admin@project.com',
        password: 'admin123',
        full_name: 'System Administrator',
        role: 'general_admin',
        department: 'Administration',
        level: 'N/A'
      },
      {
        email: 'coordinator@project.com',
        password: 'coordinator123',
        full_name: 'Level Coordinator',
        role: 'level_coordinator',
        department: 'Computer Science',
        level: '400'
      },
      {
        email: 'hod@project.com',
        password: 'hod123',
        full_name: 'Head of Department',
        role: 'hod',
        department: 'Computer Science',
        level: 'N/A'
      },
      {
        email: 'supervisor@project.com',
        password: 'supervisor123',
        full_name: 'Project Supervisor',
        role: 'supervisor',
        department: 'Computer Science',
        level: 'N/A'
      },
      {
        email: 'student@project.com',
        password: 'student123',
        full_name: 'Test Student',
        role: 'student',
        department: 'Computer Science',
        level: '400',
        registration_number: 'CS400001'
      }
    ];

    let createdCount = 0;

    defaultUsers.forEach(user => {
      try {
        // Check if user already exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(user.email);
        
        if (!existingUser) {
          // Hash password
          const hashedPassword = bcrypt.hashSync(user.password, 10);
          
          // Insert user
          const result = db.prepare(`
            INSERT INTO users (email, password, full_name, role, department, level, registration_number, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
          `).run(
            user.email,
            hashedPassword,
            user.full_name,
            user.role,
            user.department,
            user.level,
            user.registration_number || null
          );

          if (result.changes > 0) {
            console.log(`✅ Created default ${user.role}: ${user.email}`);
            createdCount++;
          }
        } else {
          console.log(`ℹ️  ${user.role} already exists: ${user.email}`);
        }
      } catch (error) {
        console.error(`❌ Error creating ${user.role}:`, error.message);
      }
    });

    if (createdCount > 0) {
      console.log(`🎉 Successfully created ${createdCount} default users`);
    } else {
      console.log('ℹ️  All default users already exist');
    }

  } catch (error) {
    console.error('❌ Error seeding default users:', error.message);
  }
}

// Initialize database and seed users
function initializeDatabase() {
  try {
    // Check if database is properly initialized
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();

    console.log('📊 Database tables:', tables.map(t => t.name));
    
    if (tables.length > 0) {
      seedDefaultUsers();
    } else {
      console.log('⚠️  No tables found in database. Please run database initialization first.');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
  }
}

// Call initialization
initializeDatabase();

// === Routes ===
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/auth/login');
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }

  const roleRoutes = {
    'general_admin': '/admin/dashboard',
    'level_coordinator': '/coordinator/dashboard',
    'hod': '/hod/dashboard',
    'supervisor': '/supervisor/dashboard',
    'student': '/student/dashboard'
  };

  const redirectPath = roleRoutes[req.session.user.role];
  if (redirectPath) {
    return res.redirect(redirectPath);
  }

  res.redirect('/auth/login');
});

// Mount route modules
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/coordinator', coordinatorRoutes);
app.use('/hod', hodRoutes);
app.use('/supervisor', supervisorRoutes);
app.use('/student', studentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    // Test database connection
    db.prepare('SELECT 1 as test').get();
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      database: 'Disconnected',
      error: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    message: 'Page Not Found', 
    error: 'The page you are looking for does not exist' 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err);
  res.status(500).render('error', {
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log('🚀 Project Submission Reporting System');
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});