const db = require('../config/database');
const bcrypt = require('bcryptjs');
const renderPage = require('../utils/renderHelper');
const { logActivity } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// === GET ADMIN DASHBOARD ===
async function getDashboard(req, res) {
  try {
    const user = req.session.user;

    // Collect statistics
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'level_coordinator') AS coordinators,
        (SELECT COUNT(*) FROM users WHERE role = 'supervisor') AS supervisors,
        (SELECT COUNT(*) FROM users WHERE role = 'student') AS students,
        (SELECT COUNT(*) FROM users WHERE role = 'hod') AS hods,
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM reports) AS totalReports,
        (SELECT COUNT(DISTINCT user_id) FROM activity_logs WHERE DATE(created_at) = DATE('now')) AS activeUsers,
        (SELECT COUNT(*) FROM activity_logs WHERE DATE(created_at) = DATE('now')) AS recentActivities
    `).get() || {};

    // List recent users
    const recentUsers = db.prepare(`
      SELECT 
        u.id, u.full_name, u.email, u.role, u.department, u.level, u.created_at,
        (SELECT COUNT(*) FROM reports WHERE student_id = u.id) AS report_count,
        (SELECT MAX(created_at) FROM activity_logs WHERE user_id = u.id) AS last_activity
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 15
    `).all();

    // Recent activities
    const rawActivities = db.prepare(`
      SELECT a.*, u.full_name AS user_name, u.role AS user_role
      FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `).all();
    const recentActivities = rawActivities.map(a => ({
      type: a.action_type,
      description: `${a.user_name || 'System'} ${a.description || ''}`,
      timestamp: a.created_at
    }));

    // Extended stats
    stats.databaseSize = await getDatabaseSize();
    stats.activeSessions = await getActiveSessions();
    stats.apiRequests = 1250;

    // Department user breakdown
    const departmentStats = db.prepare(`
      SELECT department, COUNT(*) AS user_count
      FROM users
      WHERE department IS NOT NULL
      GROUP BY department
    `).all();

    // Report status breakdown
    const reportStats = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM reports
      GROUP BY status
    `).all();

    // User growth per month (past 6 months)
    const userGrowth = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) AS month,
        COUNT(*) AS user_count,
        SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS students,
        SUM(CASE WHEN role = 'supervisor' THEN 1 ELSE 0 END) AS supervisors,
        SUM(CASE WHEN role = 'level_coordinator' THEN 1 ELSE 0 END) AS coordinators
      FROM users
      WHERE created_at >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).all();

    // Compose chart data
    const chartData = {
      monthlyLabels: userGrowth.map(row => {
        const d = new Date(row.month + '-01');
        return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }),
      monthlyStudents: userGrowth.map(row => row.students || 0),
      monthlySupervisors: userGrowth.map(row => row.supervisors || 0),
      monthlyCoordinators: userGrowth.map(row => row.coordinators || 0),
      departmentLabels: departmentStats.map(d => d.department),
      departmentData: departmentStats.map(d => d.user_count),
      reportStatus: {
        approved: reportStats.find(r => r.status === 'approved')?.count || 0,
        pending: reportStats.find(r => r.status === 'pending')?.count || 0,
        rejected: reportStats.find(r => r.status === 'rejected')?.count || 0,
        feedback: reportStats.find(r => r.status === 'feedback_given')?.count || 0
      }
    };

    res.render('layouts/main', {
      title: 'System Administration',
      user,
      stats,
      recentUsers,
      recentActivities,
      chartData,
      success: req.query.success || null,
      error: req.query.error || null,
      view: '../admin/dashboard',
    });
  } catch (error) {
    console.error('Admin Dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.session.user,
      message: 'Failed to load admin dashboard',
      error: error?.message || 'Unknown error'
    });
  }
}

// Obtain SQLite database file size in MB
async function getDatabaseSize() {
  try {
    const dbPath = path.join(__dirname, '../data/database.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      return (stats.size / (1024 * 1024)).toFixed(2);
    }
    return 0;
  } catch (error) {
    console.error('Error getting database size:', error);
    return 0;
  }
}

// Approximate active sessions: unique user_id in activity_logs in past hour
async function getActiveSessions() {
  try {
    const result = db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS active_count
      FROM activity_logs
      WHERE created_at >= datetime('now', '-1 hour')
    `).get();
    return result ? result.active_count : 0;
  } catch (error) {
    console.error('Error getting active sessions:', error);
    return 0;
  }
}

// === GET USER MANAGEMENT ===
function getManageUsers(req, res) {
  try {
    const user = req.session.user;
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
      error: error?.message || 'Unknown error'
    });
  }
}

// === ADD USER (POST) ===
async function postAddUser(req, res) {
  const { full_name, email, password, role, level, department, registration_number } = req.body;
  try {
    if (!password || password.length < 4) {
      req.flash('error', 'Password is required (min 4 chars).');
      return res.redirect('/admin/manage-users');
    }
    const password_hash = bcrypt.hashSync(password, 10);
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      req.flash('error', 'Email already exists.');
      return res.redirect('/admin/manage-users');
    }

    const result = db.prepare(`
      INSERT INTO users (full_name, email, password_hash, role, level, department, registration_number, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      full_name,
      email,
      password_hash,
      role,
      level || null,
      department || 'Computer Science',
      registration_number || null
    );

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
}

// === DELETE USER ===
async function deleteUser(req, res) {
  const { id } = req.params;
  try {
    const user = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(id);
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/admin/manage-users');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
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
}

// === VIEW STUDENTS ===
function getViewStudents(req, res) {
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
      error: error?.message || 'Unknown error'
    });
  }
}

// === VIEW SUPERVISORS ===
function getViewSupervisors(req, res) {
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
      error: error?.message || 'Unknown error'
    });
  }
}

// === ADD COORDINATOR PAGE ===
function getAddCoordinator(req, res) {
  renderPage(res, {
    title: 'Add Level Coordinator',
    view: '../admin/add-coordinator',
    user: req.session.user
  });
}

// === ADD COORDINATOR (POST) ===
async function postAddCoordinator(req, res) {
  const { full_name, email, password, level } = req.body;
  const department = req.session.user?.department || 'Computer Science';
  try {
    if (!password || password.length < 4) {
      req.flash('error', 'Password is required (min 4 chars).');
      return res.redirect('/admin/add-coordinator');
    }
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
}

// === EDIT COORDINATOR PAGE ===
function getEditCoordinator(req, res) {
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
}

// === UPDATE COORDINATOR ===
async function postEditCoordinator(req, res) {
  const { id } = req.params;
  const { full_name, email, level, department, password } = req.body;

  try {
    let updateQuery = `
      UPDATE users
      SET full_name = ?, email = ?, level = ?, department = ?, updated_at = datetime('now')
      WHERE id = ?
    `;
    let params = [full_name, email, level, department, id];

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
}

// === DELETE COORDINATOR ===
async function deleteCoordinator(req, res) {
  const { id } = req.params;
  try {
    const coordinator = db.prepare('SELECT full_name FROM users WHERE id = ?').get(id);
    if (!coordinator) {
      req.flash('error', 'Coordinator not found');
      return res.redirect('/admin/dashboard');
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

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
}

// === ACTIVITY LOGS ===
function getActivityLogs(req, res) {
  try {
    const logs = db.prepare(`
      SELECT al.*, u.full_name AS user_name, u.role AS user_role
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT 100
    `).all();

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
      error: error?.message || 'Unknown error'
    });
  }
}

// === VIEW COORDINATORS ===
function getViewCoordinators(req, res) {
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
      error: error?.message || 'Unknown error'
    });
  }
}

// === VIEW HODs ===
function getViewHods(req, res) {
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
      error: error?.message || 'Unknown error'
    });
  }
}

// Exporting the key endpoints, using indirection for students/supervisors as in original code
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
  getViewStudents: getViewStudents,
  getViewSupervisors: getViewSupervisors
};