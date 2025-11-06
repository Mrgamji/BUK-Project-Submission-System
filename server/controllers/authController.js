const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');

const getLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  
  const messages = {
    error: req.flash('error')?.[0] || null,
    success: req.flash('success')?.[0] || null
  };
  
  res.render('auth/login', messages);
};

const postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    
    if (!user) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/auth/login');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      req.flash('error', 'Invalid email or password');
      return res.redirect('/auth/login');
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department: user.department,
      level: user.level,
      registration_number: user.registration_number
    };

    await logActivity(user.id, 'Login', 'user', user.id);
    
    req.flash('success', `Welcome back, ${user.full_name}!`);
    res.redirect('/dashboard');
    
  } catch (err) {
    console.error('Login error:', err);
    req.flash('error', 'An error occurred. Please try again.');
    res.redirect('/auth/login');
  }
};

const getRegister = (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  
  const messages = {
    error: req.flash('error')?.[0] || null,
    success: req.flash('success')?.[0] || null,
    formData: {
      full_name: '',
      email: '',
      registration_number: '',
      level: '',
      department: '',
      phone: ''
    }
  };
  
  res.render('auth/register', messages);
};

const postRegister = async (req, res) => {
  const { 
    email, 
    password, 
    confirm_password, 
    full_name, 
    department, 
    level, 
    registration_number,
    phone
  } = req.body;

  try {
    // Validation checks
    if (password !== confirm_password) {
      req.flash('error', 'Passwords do not match');
      return res.redirect('/auth/register');
    }

    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters long');
      return res.redirect('/auth/register');
    }

    // Check if email already exists
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      req.flash('error', 'Email already registered');
      return res.redirect('/auth/register');
    }

    // Check if registration number already exists
    if (registration_number) {
      const existingRegNo = db.prepare('SELECT id FROM users WHERE registration_number = ?').get(registration_number);
      if (existingRegNo) {
        req.flash('error', 'Registration number already exists');
        return res.redirect('/auth/register');
      }
    }

    // Validate required fields
    if (!full_name || !email || !department || !level) {
      req.flash('error', 'All required fields must be filled');
      return res.redirect('/auth/register');
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    
    let result;
    try {
      // Try to insert with all fields
      const stmt = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, role, department, level, registration_number, phone)
        VALUES (?, ?, ?, 'student', ?, ?, ?, ?)
      `);
      
      result = stmt.run(
        email, 
        hashedPassword, 
        full_name, 
        department, 
        level, 
        registration_number || null,
        phone || null
      );
    } catch (dbError) {
      // Fallback: insert without optional columns if they don't exist
      console.log('Fallback: inserting without optional columns');
      const stmt = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, role, department, level)
        VALUES (?, ?, ?, 'student', ?, ?)
      `);
      
      result = stmt.run(
        email, 
        hashedPassword, 
        full_name, 
        department, 
        level
      );
    }

    // Create session
    req.session.user = {
      id: result.lastInsertRowid,
      email,
      full_name,
      role: 'student',
      department,
      level,
      registration_number: registration_number || null
    };

    // Log the activity
    await logActivity(
      result.lastInsertRowid, 
      'Account Created', 
      'user', 
      result.lastInsertRowid,
      { 
        registration_number,
        department,
        level 
      }
    );

    req.flash('success', 'Account created successfully! Welcome to the system.');
    res.redirect('/dashboard');

  } catch (err) {
    console.error('Registration Error:', err);
    
    // Handle specific database errors
    let errorMessage = 'An error occurred during registration. Please try again.';
    
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      if (err.message.includes('email')) {
        errorMessage = 'Email already registered';
      } else if (err.message.includes('registration_number')) {
        errorMessage = 'Registration number already exists';
      }
    }

    req.flash('error', errorMessage);
    
    // Pass form data back to maintain user input
    req.flash('formData', {
      full_name: full_name || '',
      email: email || '',
      registration_number: registration_number || '',
      level: level || '',
      department: department || '',
      phone: phone || ''
    });
    
    res.redirect('/auth/register');
  }
};

const logout = (req, res) => {
  if (req.session.user) {
    logActivity(req.session.user.id, 'Logout', 'user', req.session.user.id)
      .catch(err => console.error('Logout activity log error:', err));
  }
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/auth/login');
  });
};

module.exports = { 
  getLogin, 
  postLogin, 
  getRegister, 
  postRegister, 
  logout 
};