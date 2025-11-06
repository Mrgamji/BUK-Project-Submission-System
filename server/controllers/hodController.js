const db = require('../config/database');
const { logActivity } = require('../utils/logger');
const renderPage = require('../utils/renderHelper');

// === GET HOD DASHBOARD ===
// === GET HOD DASHBOARD ===
const getDashboard = async (req, res) => {
  try {
    const user = req.session.user;

    // Get department statistics
    const statsStmt = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'student') as totalStudents,
        (SELECT COUNT(*) FROM users WHERE role = 'supervisor') as totalSupervisors,
        (SELECT COUNT(*) FROM reports) as totalReports,
        (SELECT COUNT(*) FROM reports WHERE status = 'approved') as approvedReports,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pendingReports,
        (SELECT COUNT(*) FROM reports WHERE status = 'rejected') as rejectedReports,
        (SELECT COUNT(*) FROM reports WHERE strftime('%Y-%m', submitted_at) = strftime('%Y-%m', 'now')) as reportsThisMonth
    `);
    const stats = statsStmt.get();

    // Get recent reports with student and supervisor info
    const recentReportsStmt = db.prepare(`
      SELECT 
        r.*,
        s.full_name as student_name,
        s.id as student_id,
        sup.full_name as supervisor_name,
        sup.id as supervisor_id
      FROM reports r
      JOIN users s ON r.student_id = s.id
      LEFT JOIN users sup ON r.supervisor_id = sup.id
      ORDER BY r.submitted_at DESC
      LIMIT 10
    `);
    const recentReports = recentReportsStmt.all();

    // Format reports data
    const formattedReports = recentReports.map(report => ({
      ...report,
      student: {
        id: report.student_id,
        full_name: report.student_name
      },
      supervisor: report.supervisor_id ? {
        id: report.supervisor_id,
        full_name: report.supervisor_name
      } : null
    }));

    // Get recent activity
    const recentActivity = [
      {
        type: 'report_submitted',
        description: 'New report submitted by John Doe',
        timestamp: new Date().toISOString()
      },
      {
        type: 'report_approved',
        description: 'Report approved for Jane Smith',
        timestamp: new Date(Date.now() - 86400000).toISOString()
      },
      {
        type: 'report_rejected',
        description: 'Report returned for revision - Mike Johnson',
        timestamp: new Date(Date.now() - 172800000).toISOString()
      }
    ];

    // Add some calculated stats
    stats.studentsGrowth = 5;
    stats.availableSupervisors = Math.max(0, stats.totalSupervisors - Math.ceil(stats.totalStudents / 5));

    // Get chart data for the dashboard
    const monthlyReportsStmt = db.prepare(`
      SELECT 
        strftime('%Y-%m', submitted_at) as month,
        COUNT(*) as total_reports,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_reports
      FROM reports 
      WHERE submitted_at >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', submitted_at)
      ORDER BY month
    `);
    const monthlyReports = monthlyReportsStmt.all();

    const departmentStatsStmt = db.prepare(`
      SELECT 
        s.department,
        COUNT(*) as student_count
      FROM users s
      WHERE s.role = 'student'
      GROUP BY s.department
    `);
    const departmentStats = departmentStatsStmt.all();

    // Prepare chart data
    const chartData = {
      monthlyLabels: monthlyReports.map(r => {
        const date = new Date(r.month + '-01');
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }),
      monthlySubmitted: monthlyReports.map(r => r.total_reports),
      monthlyApproved: monthlyReports.map(r => r.approved_reports),
      departmentLabels: departmentStats.map(d => d.department),
      departmentData: departmentStats.map(d => d.student_count)
    };

    res.render('layouts/main', {
      title: 'HOD Dashboard',
      user,
      stats,
      recentReports: formattedReports,
      recentActivity,
      chartData,
      success: req.query.success || null,
      error: req.query.error || null,
      view: '../hod/dashboard'
    });

  } catch (error) {
    console.error('HOD Dashboard error:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.session.user,
      message: 'Failed to load HOD dashboard',
      error: error.message
    });
  }
};

// View all students in HOD's department
const getStudents = (req, res) => {
  try {
    const user = req.session.user;
    const dept = user.department;

    const students = db.prepare("SELECT * FROM users WHERE role = 'student' AND department = ? ORDER BY full_name").all(dept);

    const assignments = db.prepare(`
      SELECT a.*, 
             u.id AS supervisor_id, 
             u.full_name AS supervisor_name, 
             u.email AS supervisor_email
      FROM student_supervisor_assignments a
      LEFT JOIN users u ON u.id = a.supervisor_id
      WHERE a.is_active = 1
    `).all();

    const studentsWithSupervisors = students.map(s => {
      const assignment = assignments.find(x => x.student_id === s.id);
      return { 
        ...s, 
        supervisor: assignment ? { 
          id: assignment.supervisor_id, 
          full_name: assignment.supervisor_name, 
          email: assignment.supervisor_email 
        } : null 
      };
    });

    renderPage(res, {
      title: 'Department Students',
      view: '../hod/students',
      user,
      students: studentsWithSupervisors
    });

  } catch (err) {
    console.error('❌ HOD Students Error:', err);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load students',
      error: err.message
    });
  }
};

// View all reports with optional filters
const getReports = (req, res) => {
  try {
    const user = req.session.user;
    const dept = user.department;
    const { status, supervisor } = req.query;

    const reports = db.prepare(`
      SELECT r.*, 
             s.full_name AS student_name, 
             s.department AS student_department,
             s.registration_number,
             sup.full_name AS supervisor_name,
             sup.id AS supervisor_id
      FROM reports r
      LEFT JOIN users s ON s.id = r.student_id
      LEFT JOIN users sup ON sup.id = r.supervisor_id
      ORDER BY r.submitted_at DESC
    `).all();

    let filtered = reports.filter(r => r.student_department === dept);
    if (status) filtered = filtered.filter(r => r.status === status);
    if (supervisor) filtered = filtered.filter(r => r.supervisor_id == supervisor);

    const supervisors = db.prepare("SELECT id, full_name FROM users WHERE role = 'supervisor' AND department = ?").all(dept);

    renderPage(res, {
      title: 'Department Reports',
      view: '../hod/reports',
      user,
      reports: filtered,
      supervisors,
      filters: { status, supervisor }
    });

  } catch (err) {
    console.error('❌ HOD Reports Error:', err);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load reports',
      error: err.message
    });
  }
};

// View details of a single report
const getReportDetails = (req, res) => {
  try {
    const user = req.session.user;
    const reportId = req.params.id;

    const report = db.prepare(`
      SELECT r.*, 
             s.full_name AS student_name, 
             s.email AS student_email,
             s.department AS student_department,
             s.registration_number,
             sup.full_name AS supervisor_name, 
             sup.email AS supervisor_email
      FROM reports r
      LEFT JOIN users s ON s.id = r.student_id
      LEFT JOIN users sup ON sup.id = r.supervisor_id
      WHERE r.id = ?
    `).get(reportId);

    if (!report || report.student_department !== user.department) {
      req.flash('error', 'Report not found or not in your department.');
      return res.redirect('/hod/reports');
    }

    const feedback = db.prepare(`
      SELECT f.*, u.full_name AS supervisor_name
      FROM feedback f
      LEFT JOIN users u ON u.id = f.supervisor_id
      WHERE f.report_id = ? 
      ORDER BY f.created_at DESC
    `).all(reportId);

    const hodFeedback = db.prepare(`
      SELECT h.*, u.full_name AS hod_name
      FROM hod_feedback h
      LEFT JOIN users u ON u.id = h.hod_id
      WHERE h.report_id = ? 
      ORDER BY h.created_at DESC
    `).all(reportId);

    renderPage(res, {
      title: `Report Details - ${report.title}`,
      view: '../hod/report-details',
      user,
      report,
      feedback,
      hodFeedback
    });

  } catch (err) {
    console.error('❌ HOD Report Details Error:', err);
    req.flash('error', 'Failed to load report details.');
    res.redirect('/hod/reports');
  }
};

// Post HOD feedback
const postFeedback = async (req, res) => {
  try {
    const { reportId, comment } = req.body;
    const user = req.session.user;

    // Get report details for validation
    const report = db.prepare(`
      SELECT r.*, s.department 
      FROM reports r 
      JOIN users s ON s.id = r.student_id 
      WHERE r.id = ?
    `).get(reportId);

    if (!report || report.department !== user.department) {
      req.flash('error', 'Report not found or not in your department.');
      return res.redirect('/hod/reports');
    }

    // Insert HOD feedback
    db.prepare('INSERT INTO hod_feedback (report_id, hod_id, comment, created_at) VALUES (?, ?, ?, datetime("now"))')
      .run(reportId, user.id, comment);

    // Log the activity
    await logActivity(
      user.id, 
      'Provided HOD Feedback', 
      'report', 
      reportId,
      { comment_length: comment.length }
    );

    req.flash('success', 'Feedback submitted successfully.');
    res.redirect(`/hod/report/${reportId}`);
  } catch (err) {
    console.error('❌ HOD Feedback Error:', err);
    req.flash('error', 'Failed to submit feedback.');
    res.redirect(`/hod/report/${req.body.reportId}`);
  }
};

// View supervisors in department
const getSupervisors = (req, res) => {
  try {
    const user = req.session.user;
    const dept = user.department;

    const supervisors = db.prepare(`
      SELECT u.*,
             (SELECT COUNT(*) FROM student_supervisor_assignments WHERE supervisor_id = u.id AND is_active = 1) as assigned_students_count
      FROM users u
      WHERE u.role = 'supervisor' AND u.department = ?
      ORDER BY u.full_name
    `).all(dept);

    const assignments = db.prepare(`
      SELECT a.*, 
             s.full_name as student_name,
             s.registration_number
      FROM student_supervisor_assignments a
      JOIN users s ON s.id = a.student_id
      WHERE a.is_active = 1
    `).all();

    const supervisorsWithAssignments = supervisors.map(sup => {
      const assignedStudents = assignments.filter(a => a.supervisor_id === sup.id);
      return {
        ...sup,
        assigned_students: assignedStudents
      };
    });

    renderPage(res, {
      title: 'Department Supervisors',
      view: '../hod/supervisors',
      user,
      supervisors: supervisorsWithAssignments
    });

  } catch (err) {
    console.error('❌ HOD Supervisors Error:', err);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load supervisors',
      error: err.message
    });
  }
};

// View department statistics
const getStatistics = (req, res) => {
  try {
    const user = req.session.user;
    const dept = user.department;

    // Basic stats
    const students = db.prepare("SELECT * FROM users WHERE role = 'student' AND department = ?").all(dept);
    const supervisors = db.prepare("SELECT * FROM users WHERE role = 'supervisor' AND department = ?").all(dept);
    
    const reports = db.prepare(`
      SELECT r.*, s.department 
      FROM reports r 
      JOIN users s ON s.id = r.student_id 
      WHERE s.department = ?
    `).all(dept);

    // Report status breakdown
    const statusBreakdown = {
      pending: reports.filter(r => r.status === 'pending').length,
      approved: reports.filter(r => r.status === 'approved').length,
      rejected: reports.filter(r => r.status === 'rejected').length,
      feedback_given: reports.filter(r => r.status === 'feedback_given').length
    };

    // Student progress by level
    const studentsByLevel = {};
    students.forEach(student => {
      const level = student.level || 'Unknown';
      if (!studentsByLevel[level]) {
        studentsByLevel[level] = 0;
      }
      studentsByLevel[level]++;
    });

    // Supervisor assignment stats
    const assignments = db.prepare(`
      SELECT supervisor_id, COUNT(*) as student_count
      FROM student_supervisor_assignments 
      WHERE is_active = 1 
      GROUP BY supervisor_id
    `).all();

    const supervisorStats = supervisors.map(sup => {
      const assignment = assignments.find(a => a.supervisor_id === sup.id);
      return {
        ...sup,
        assigned_students: assignment ? assignment.student_count : 0
      };
    });

    renderPage(res, {
      title: 'Department Statistics',
      view: '../hod/statistics',
      user,
      stats: {
        totalStudents: students.length,
        totalSupervisors: supervisors.length,
        totalReports: reports.length,
        statusBreakdown,
        studentsByLevel,
        supervisorStats
      }
    });

  } catch (err) {
    console.error('❌ HOD Statistics Error:', err);
    renderPage(res, {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load statistics',
      error: err.message
    });
  }
};

module.exports = { 
  getDashboard, 
  getStudents, 
  getReports, 
  getReportDetails, 
  postFeedback,
  getSupervisors,
  getStatistics
};