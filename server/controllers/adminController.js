const db = require('../config/database');
const bcrypt = require('bcryptjs');
const renderPage = require('../utils/renderHelper');
const { logActivity } = require('../utils/logger');

// === ADMIN DASHBOARD ===
const getDashboard = (req, res) => {
  try {
    const user = req.session.user;
    const allUsers = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

    const stats = {
      coordinators: allUsers.filter(u => u.role === 'level_coordinator').length,
      supervisors: allUsers.filter(u => u.role === 'supervisor').length,
      students: allUsers.filter(u => u.role === 'student').length,
      hods: allUsers.filter(u => u.role === 'hod').length
    };

    const recentUsers = allUsers.slice(0, 5);
    const coordinators = allUsers.filter(u => u.role === 'level_coordinator');

    renderPage(res, {
      title: 'Admin Dashboard',
      view: '../admin/dashboard',
      user,
      stats,
      coordinators,
      recentUsers
    });
  } catch (error) {
    console.error('❌ Error loading admin dashboard:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load dashboard',
      error: error.message
    });
  }
};

// === MANAGE USERS PAGE ===
const getManageUsers = (req, res) => {
  try {
    const user = req.session.user;

    // Fetch all users
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();

    renderPage(res, {
      title: 'Manage Users',
      view: '../admin/manage-users',
      user,
      users
    });
  } catch (error) {
    console.error('❌ Error loading Manage Users:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load users',
      error: error.message
    });
  }
};

// === ADD USER (POST) ===
const postAddUser = async (req, res) => {
  const { full_name, email, password, role, level, department, registration_number } = req.body;
  try {
    const password_hash = bcrypt.hashSync(password, 10);

    // Prevent duplicate email
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      req.flash('error', 'Email already exists.');
      return res.redirect('/admin/manage-users');
    }

    const result = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, level, department, registration_number, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(full_name, email, password_hash, role, level || null, department || 'Computer Science', registration_number || null);

    // Log the activity
    await logActivity(
      req.session.user.id,
      'Created User',
      'user',
      result.lastInsertRowid,
      { role, email, name: full_name }
    );

    req.flash('success', `User ${full_name} created successfully!`);
    res.redirect('/admin/manage-users');
  } catch (error) {
    console.error('❌ Error adding user:', error);
    req.flash('error', 'Failed to add user');
    res.redirect('/admin/manage-users');
  }
};

// === DELETE USER ===
const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(id);
    
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    
    // Log the activity
    await logActivity(
      req.session.user.id,
      'Deleted User',
      'user',
      id,
      { email: user.email, name: user.full_name }
    );

    req.flash('success', `User ${user.full_name} deleted successfully!`);
    res.redirect('/admin/manage-users');
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    req.flash('error', 'Failed to delete user');
    res.redirect('/admin/manage-users');
  }
};

// === VIEW STUDENTS ===
const getViewStudents = (req, res) => {
  try {
    const students = db.prepare("SELECT * FROM users WHERE role = 'student' ORDER BY created_at DESC").all();

    renderPage(res, {
      title: 'View Students',
      view: '../admin/view-students',
      user: req.session.user,
      students
    });
  } catch (error) {
    console.error('❌ Error loading students:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load students',
      error: error.message
    });
  }
};

// === VIEW SUPERVISORS ===
const getViewSupervisors = (req, res) => {
  try {
    const supervisors = db.prepare("SELECT * FROM users WHERE role = 'supervisor' ORDER BY created_at DESC").all();
    renderPage(res, {
      title: 'View Supervisors',
      view: '../admin/view-supervisors',
      user: req.session.user,
      supervisors
    });
  } catch (error) {
    console.error('❌ Error loading supervisors:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load supervisors',
      error: error.message
    });
  }
};

// === ADD COORDINATOR PAGE ===
const getAddCoordinator = (req, res) => {
  renderPage(res, {
    title: 'Add Level Coordinator',
    view: '../admin/add-coordinator',
    user: req.session.user
  });
};

// === ADD COORDINATOR (POST) ===
const postAddCoordinator = async (req, res) => {
  const { full_name, email, password, level } = req.body;
  const department = req.session.user?.department || 'Computer Science';

  try {
    const password_hash = bcrypt.hashSync(password, 10);
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (existing) {
      req.flash('error', 'Email already exists. Please use a different email.');
      return res.redirect('/admin/add-coordinator');
    }

    const result = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, level, department, created_at, updated_at)
      VALUES (?, ?, ?, 'level_coordinator', ?, ?, datetime('now'), datetime('now'))
    `).run(full_name, email, password_hash, level, department);

    // Log the activity
    await logActivity(
      req.session.user.id,
      'Created Level Coordinator',
      'user',
      result.lastInsertRowid,
      { coordinator_name: full_name, level }
    );

    req.flash('success', `Coordinator ${full_name} created successfully!`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('❌ Error adding coordinator:', error);
    req.flash('error', 'Error adding coordinator');
    res.redirect('/admin/add-coordinator');
  }
};

// === EDIT COORDINATOR PAGE ===
const getEditCoordinator = (req, res) => {
  const { id } = req.params;
  try {
    const coordinator = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!coordinator) {
      req.flash('error', 'Coordinator not found');
      return res.redirect('/admin/dashboard');
    }

    renderPage(res, {
      title: 'Edit Level Coordinator',
      view: '../admin/edit-coordinator',
      user: req.session.user,
      coordinator
    });
  } catch (error) {
    console.error('❌ Error loading edit coordinator:', error);
    req.flash('error', 'Failed to load coordinator data');
    res.redirect('/admin/dashboard');
  }
};

// === UPDATE COORDINATOR ===
const postEditCoordinator = async (req, res) => {
  const { id } = req.params;
  const { full_name, email, level, department, password } = req.body;

  try {
    let updateQuery = `
      UPDATE users
      SET full_name = ?, email = ?, level = ?, department = ?, updated_at = datetime('now')
      WHERE id = ?
    `;
    let params = [full_name, email, level, department, id];

    // If password is provided, update it too
    if (password && password.trim() !== '') {
      const password_hash = bcrypt.hashSync(password, 10);
      updateQuery = `
        UPDATE users
        SET full_name = ?, email = ?, level = ?, department = ?, password_hash = ?, updated_at = datetime('now')
        WHERE id = ?
      `;
      params = [full_name, email, level, department, password_hash, id];
    }

    db.prepare(updateQuery).run(...params);

    // Log the activity
    await logActivity(
      req.session.user.id,
      'Updated Level Coordinator',
      'user',
      id,
      { coordinator_name: full_name, level }
    );

    req.flash('success', `Coordinator ${full_name} updated successfully!`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('❌ Error updating coordinator:', error);
    req.flash('error', 'Failed to update coordinator');
    res.redirect(`/admin/edit-coordinator/${id}`);
  }
};

// === DELETE COORDINATOR ===
const deleteCoordinator = async (req, res) => {
  const { id } = req.params;
  try {
    const coordinator = db.prepare('SELECT full_name FROM users WHERE id = ?').get(id);
    
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    // Log the activity
    await logActivity(
      req.session.user.id,
      'Deleted Level Coordinator',
      'user',
      id,
      { coordinator_name: coordinator.full_name }
    );

    req.flash('success', `Coordinator ${coordinator.full_name} deleted successfully!`);
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('❌ Error deleting coordinator:', error);
    req.flash('error', 'Failed to delete coordinator');
    res.redirect('/admin/dashboard');
  }
};

// === ACTIVITY LOGS ===
const getActivityLogs = (req, res) => {
  try {
    const logs = db
      .prepare(`
        SELECT al.*, u.full_name AS user_name, u.role as user_role
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 100
      `)
      .all();

    renderPage(res, {
      title: 'Activity Logs',
      view: '../admin/activity-logs',
      user: req.session.user,
      logs
    });
  } catch (error) {
    console.error('❌ Error loading activity logs:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load activity logs',
      error: error.message
    });
  }
};

// === VIEW COORDINATORS ===
const getViewCoordinators = (req, res) => {
  try {
    const coordinators = db.prepare("SELECT * FROM users WHERE role = 'level_coordinator' ORDER BY created_at DESC").all();
    renderPage(res, {
      title: 'View Coordinators',
      view: '../admin/view-coordinators',
      user: req.session.user,
      coordinators
    });
  } catch (error) {
    console.error('❌ Error loading coordinators:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load coordinators',
      error: error.message
    });
  }
};

// === VIEW HODs ===
const getViewHods = (req, res) => {
  try {
    const hods = db.prepare("SELECT * FROM users WHERE role = 'hod' ORDER BY created_at DESC").all();
    renderPage(res, {
      title: 'View HODs',
      view: '../admin/view-hods',
      user: req.session.user,
      hods
    });
  } catch (error) {
    console.error('❌ Error loading HODs:', error);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load HODs',
      error: error.message
    });
  }
};

module.exports = {
  getDashboard,
  getManageUsers,
  postAddUser,
  deleteUser,
  getAddCoordinator,
  postAddCoordinator,
  getEditCoordinator,
  postEditCoordinator,
  deleteCoordinator,
  getActivityLogs,
  getViewCoordinators,
  getViewHods,
  getViewStudents,
  getViewSupervisors
};