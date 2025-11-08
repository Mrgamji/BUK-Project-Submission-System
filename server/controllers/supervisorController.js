const db = require('../config/database');
const { logActivity } = require('../utils/logger');
const sendEmail = require('../utils/email')

// Get supervisor dashboard data
const getDashboard = async (req, res) => {
  try {
    // Use session user instead of req.user
    const supervisorId = req.session.user?.id;
    
    if (!supervisorId) {
      console.error('No user ID found in session');
      return res.redirect('/auth/login');
    }

    console.log('Loading dashboard for supervisor:', supervisorId);

    // Get all data sequentially to ensure proper variable assignment
    const stats = await getSupervisorStats(supervisorId);
    const students = await getAssignedStudents(supervisorId);
    const recentReports = await getRecentReports(supervisorId, 5);
    const reportsByStage = await getReportsByStage(supervisorId);
    const recentActivity = await getRecentActivity(supervisorId, 8);

    console.log('Dashboard data loaded:', {
      students: students.length,
      reports: recentReports.length,
      recentActivity: recentActivity.length
    });

    // Get flash messages if any
    const success = req.flash('success')[0] || null;
    const error = req.flash('error')[0] || null;

    // Render with all data
    res.render('layouts/main', {
      title: 'Supervisor Dashboard',
      view: '../supervisor/dashboard',
      user: req.session.user,
      stats: stats,
      students: students,
      recentReports: recentReports,
      reportsByStage: reportsByStage,
      recentActivity: recentActivity,
      success: success,
      error: error
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      error: 'Failed to load dashboard',
      user: req.session.user
    });
  }
};

// Get all students assigned to supervisor
const getAllStudents = async (req, res) => {
  try {
    const supervisorId = req.session.user?.id;
    
    if (!supervisorId) {
      return res.redirect('/auth/login');
    }

    console.log('Loading students for supervisor:', supervisorId);
    
    const students = await getAssignedStudents(supervisorId);
    const stats = await getSupervisorStats(supervisorId);
    
    console.log('Students data:', students);
    console.log('Stats data:', stats);
    
    const success = req.flash('success')[0] || null;
    const error = req.flash('error')[0] || null;

    // Make sure we're passing all required variables
    res.render('layouts/main', {
      title: 'My Students',
      view: '../supervisor/students',
      user: req.session.user,
      students: students || [],
      stats: stats || {},
      success: success,
      error: error
    });
  } catch (error) {
    console.error('Error getting all students:', error);
    res.status(500).render('error', {
      error: 'Failed to load students',
      user: req.session.user
    });
  }
};

// Get all reports assigned to supervisor
const getAllReports = async (req, res) => {
  try {
    const supervisorId = req.session.user?.id;
    
    if (!supervisorId) {
      return res.redirect('/auth/login');
    }

    const { status, stage, search } = req.query;
    let query = `
      SELECT 
        r.*,
        u.full_name as student_name,
        u.email as student_email,
        u.registration_number,
        u.level,
        u.department,
        (SELECT COUNT(*) FROM feedback f WHERE f.report_id = r.id) as feedback_count,
        (SELECT COUNT(*) FROM hod_feedback hf WHERE hf.report_id = r.id) as hod_feedback_count
      FROM reports r
      INNER JOIN users u ON r.student_id = u.id
      WHERE r.supervisor_id = ?
    `;
    
    const params = [supervisorId];
    
    // Apply filters
    if (status && status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }
    
    if (stage && stage !== 'all') {
      query += ' AND r.report_stage = ?';
      params.push(stage);
    }
    
    if (search) {
      query += ' AND (r.title LIKE ? OR u.full_name LIKE ? OR u.registration_number LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY r.submitted_at DESC';
    
    const reports = db.prepare(query).all(...params);
    const stats = await getSupervisorStats(supervisorId);
    
    const success = req.flash('success')[0] || null;
    const error = req.flash('error')[0] || null;

    res.render('layouts/main', {
      title: 'All Reports',
      view: '../supervisor/reports',
      user: req.session.user,
      reports: reports,
      stats: stats,
      filters: { status, stage, search },
      success: success,
      error: error
    });
  } catch (error) {
    console.error('Error getting all reports:', error);
    res.status(500).render('error', {
      error: 'Failed to load reports',
      user: req.session.user
    });
  }
};

// Get reports by supervisor (helper function)
const getReportsBySupervisor = async (supervisorId) => {
  return new Promise((resolve, reject) => {
    try {
      const reports = db.prepare(`
        SELECT 
          r.*,
          u.full_name as student_name,
          u.email as student_email,
          u.registration_number,
          u.level,
          u.department
        FROM reports r
        INNER JOIN users u ON r.student_id = u.id
        WHERE r.supervisor_id = ?
        ORDER BY r.submitted_at DESC
      `).all(supervisorId);

      resolve(reports);
    } catch (error) {
      console.error('Error getting reports by supervisor:', error);
      resolve([]);
    }
  });
};

// Get supervisor statistics
const getSupervisorStats = async (supervisorId) => {
  return new Promise((resolve, reject) => {
    try {
      // Total assigned students
      const totalStudents = db.prepare(`
        SELECT COUNT(DISTINCT student_id) as count 
        FROM student_supervisor_assignments 
        WHERE supervisor_id = ?
      `).get(supervisorId);

      // Total reports
      const totalReports = db.prepare(`
        SELECT COUNT(*) as count 
        FROM reports 
        WHERE supervisor_id = ?
      `).get(supervisorId);

      // Pending reports
      const pendingReports = db.prepare(`
        SELECT COUNT(*) as count 
        FROM reports 
        WHERE supervisor_id = ? AND status = 'pending'
      `).get(supervisorId);

      // Approved reports
      const approvedReports = db.prepare(`
        SELECT COUNT(*) as count 
        FROM reports 
        WHERE supervisor_id = ? AND status = 'approved'
      `).get(supervisorId);

      // Rejected reports
      const rejectedReports = db.prepare(`
        SELECT COUNT(*) as count 
        FROM reports 
        WHERE supervisor_id = ? AND status = 'rejected'
      `).get(supervisorId);

      // Feedback given count
      const feedbackGiven = db.prepare(`
        SELECT COUNT(DISTINCT report_id) as count 
        FROM feedback 
        WHERE supervisor_id = ?
      `).get(supervisorId);

      resolve({
        totalStudents: totalStudents?.count || 0,
        totalReports: totalReports?.count || 0,
        pendingReports: pendingReports?.count || 0,
        approvedReports: approvedReports?.count || 0,
        rejectedReports: rejectedReports?.count || 0,
        feedbackGiven: feedbackGiven?.count || 0
      });
    } catch (error) {
      console.error('Error getting supervisor stats:', error);
      resolve({
        totalStudents: 0,
        totalReports: 0,
        pendingReports: 0,
        approvedReports: 0,
        rejectedReports: 0,
        feedbackGiven: 0
      });
    }
  });
};

// Get assigned students with report counts
const getAssignedStudents = async (supervisorId) => {
  return new Promise((resolve, reject) => {
    try {
      const students = db.prepare(`
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.registration_number,
          u.level,
          u.department,
          COUNT(r.id) as reportsCount,
          SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
          SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) as approvedCount
        FROM users u
        INNER JOIN student_supervisor_assignments ssa ON u.id = ssa.student_id
        LEFT JOIN reports r ON u.id = r.student_id
        WHERE ssa.supervisor_id = ?
        GROUP BY u.id
        ORDER BY u.full_name
      `).all(supervisorId);

      const formattedStudents = students.map(student => ({
        ...student,
        reportsCount: student.reportsCount || 0,
        pendingCount: student.pendingCount || 0,
        approvedCount: student.approvedCount || 0
      }));

      resolve(formattedStudents);
    } catch (error) {
      console.error('Error getting assigned students:', error);
      resolve([]);
    }
  });
};

const getRecentReports = async (supervisorId, limit = 5) => {
  return new Promise((resolve, reject) => {
    try {
      const reports = db.prepare(`
        SELECT 
          r.*,
          u.full_name as student_name,
          u.email as student_email
        FROM reports r
        INNER JOIN users u ON r.student_id = u.id
        WHERE r.supervisor_id = ? 
        ORDER BY r.submitted_at DESC
        LIMIT ?
      `).all(supervisorId, limit);
      
      console.log(`Found ${reports.length} reports for supervisor ${supervisorId}`);
      resolve(reports);
    } catch (error) {
      console.error('Error getting recent reports:', error);
      resolve([]);
    }
  });
};

// Get reports grouped by stage
const getReportsByStage = async (supervisorId) => {
  return new Promise((resolve, reject) => {
    try {
      const stages = ['progress_1', 'progress_2', 'progress_3', 'final'];
      const reportsByStage = {};

      for (const stage of stages) {
        const reports = db.prepare(`
          SELECT 
            r.*,
            u.full_name as student_name
          FROM reports r
          INNER JOIN users u ON r.student_id = u.id
          WHERE r.supervisor_id = ? AND r.report_stage = ?
          ORDER BY r.submitted_at DESC
        `).all(supervisorId, stage);

        reportsByStage[stage] = reports;
      }

      resolve(reportsByStage);
    } catch (error) {
      console.error('Error getting reports by stage:', error);
      resolve({});
    }
  });
};

// Get recent activity for supervisor dashboard
const getRecentActivity = async (supervisorId, limit = 10) => {
  return new Promise((resolve, reject) => {
    try {
      const activities = db.prepare(`
        SELECT 
          al.*,
          u.full_name as user_name,
          r.title as report_title,
          s.full_name as student_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN reports r ON al.entity_id = r.id AND al.entity_type = 'report'
        LEFT JOIN users s ON r.student_id = s.id
        WHERE al.user_id = ? OR al.entity_id IN (
          SELECT r.id FROM reports r 
          WHERE r.supervisor_id = ?
        )
        ORDER BY al.created_at DESC
        LIMIT ?
      `).all(supervisorId, supervisorId, limit);

      const formattedActivities = activities.map(activity => ({
        id: activity.id,
        action: activity.action,
        details: generateActivityDescription(activity),
        user_name: activity.user_name,
        report_title: activity.report_title,
        student_name: activity.student_name,
        created_at: activity.created_at,
        entity_type: activity.entity_type,
        entity_id: activity.entity_id
      }));

      resolve(formattedActivities);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      resolve([]);
    }
  });
};

// Generate human-readable activity descriptions
const generateActivityDescription = (activity) => {
  const userName = activity.user_name || 'A user';
  const studentName = activity.student_name || 'a student';
  const reportTitle = activity.report_title ? `"${activity.report_title}"` : 'a report';

  switch (activity.action) {
    case 'report_submitted':
      return `${studentName} submitted report ${reportTitle}`;
    case 'report_approved':
      return `${userName} approved ${studentName}'s report`;
    case 'report_rejected':
      return `${userName} requested revisions for ${studentName}'s report`;
    case 'feedback_provided':
      return `${userName} provided feedback on ${studentName}'s report`;
    case 'report_moved_stage':
      return `${studentName}'s report advanced to next stage`;
    case 'login':
      return `${userName} logged in`;
    case 'file_uploaded':
      return `${studentName} uploaded a new file`;
    case 'file_updated':
      return `${studentName} updated their report file`;
    default:
      return `${userName} performed ${activity.action}`;
  }
};

// Get student reports
const getStudentReports = async (req, res) => {
  try {
    const { studentId } = req.params;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.redirect('/auth/login');
    }

    // Verify the student is assigned to this supervisor
    const assignment = db.prepare(`
      SELECT * FROM student_supervisor_assignments 
      WHERE student_id = ? AND supervisor_id = ?
    `).get(studentId, supervisorId);

    if (!assignment) {
      return res.status(403).render('error', {
        error: 'You are not authorized to view this student',
        user: req.session.user
      });
    }

    const student = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId);
    const reports = db.prepare(`
      SELECT * FROM reports 
      WHERE student_id = ? 
      ORDER BY submitted_at DESC
    `).all(studentId);

    res.render('supervisor/student-reports', {
      user: req.session.user,
      student,
      reports,
      title: `Reports - ${student.full_name}`
    });
  } catch (error) {
    console.error('Error getting student reports:', error);
    res.status(500).render('error', {
      error: 'Failed to load student reports',
      user: req.session.user
    });
  }
};
// === GET SUPERVISORS MANAGEMENT ===
const getSupervisors = async (req, res) => {
  try {
    const user = req.session.user;
    const userLevel = user.level;

    // Get all supervisors with their assigned student count
    const supervisorsStmt = db.prepare(`
      SELECT 
        u.*,
        COUNT(a.id) as assigned_students,
        GROUP_CONCAT(s.full_name) as student_names
      FROM users u
      LEFT JOIN student_supervisor_assignments a ON u.id = a.supervisor_id AND a.is_active = 1
      LEFT JOIN users s ON a.student_id = s.id
      WHERE u.role = 'supervisor'
      GROUP BY u.id
      ORDER BY u.full_name
    `);
    const supervisors = supervisorsStmt.all();

    // Get assigned students details for each supervisor
    const supervisorsWithDetails = supervisors.map(supervisor => {
      const assignedStudentsStmt = db.prepare(`
        SELECT 
          s.id, s.full_name, s.department, a.id as assignment_id
        FROM student_supervisor_assignments a
        JOIN users s ON a.student_id = s.id
        WHERE a.supervisor_id = ? AND a.is_active = 1
      `);
      const assignedStudentsList = assignedStudentsStmt.all(supervisor.id);
      
      return {
        ...supervisor,
        assignedStudentsList,
        assignedStudents: parseInt(supervisor.assigned_students) || 0
      };
    });

    // Get unassigned students for assignment
    const unassignedStmt = db.prepare(`
      SELECT u.* 
      FROM users u
      LEFT JOIN student_supervisor_assignments a ON u.id = a.student_id AND a.is_active = 1
      WHERE u.role = 'student' AND u.level = ? AND a.id IS NULL
      ORDER BY u.full_name
    `);
    const unassignedStudentsList = unassignedStmt.all(userLevel);

    // Calculate statistics
    const totalSupervisors = supervisors.length;
    const totalCapacity = supervisors.reduce((sum, s) => sum + (s.max_students || 5), 0);
    const totalAssigned = supervisors.reduce((sum, s) => sum + (parseInt(s.assigned_students) || 0), 0);
    const availableCapacity = totalCapacity - totalAssigned;
    const averageLoad = totalSupervisors > 0 ? (totalAssigned / totalSupervisors).toFixed(1) : 0;
    const fullyBookedCount = supervisors.filter(s => (parseInt(s.assigned_students) || 0) >= (s.max_students || 5)).length;

    res.render('coordinator/supervisors', {
      title: 'Supervisors Management',
      user,
      level: userLevel,
      supervisors: supervisorsWithDetails,
      unassignedStudentsList,
      totalSupervisors,
      totalCapacity,
      totalAssigned,
      availableCapacity,
      averageLoad,
      fullyBookedCount,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Supervisors management error:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.session.user,
      message: 'Failed to load supervisors management',
      error: error.message
    });
  }
};

// === GET ASSIGNMENTS MANAGEMENT ===
const getAssignments = async (req, res) => {
  try {
    const user = req.session.user;
    const userLevel = user.level;

    // Get current assignments
    const currentAssignmentsStmt = db.prepare(`
      SELECT 
        a.id as assignment_id,
        a.assigned_date,
        s.id as student_id,
        s.full_name as student_full_name,
        s.email as student_email,
        s.department as student_department,
        sup.id as supervisor_id,
        sup.full_name as supervisor_full_name,
        sup.email as supervisor_email,
        c.full_name as coordinator_name
      FROM student_supervisor_assignments a
      JOIN users s ON a.student_id = s.id
      JOIN users sup ON a.supervisor_id = sup.id
      JOIN users c ON a.level_coordinator_id = c.id
      WHERE a.is_active = 1 AND s.level = ?
      ORDER BY a.assigned_date DESC
    `);
    const currentAssignments = currentAssignmentsStmt.all(userLevel);

    // Get assignment history
    const historyStmt = db.prepare(`
      SELECT 
        a.*,
        s.full_name as student_full_name,
        sup.full_name as supervisor_full_name,
        c.full_name as coordinator_name
      FROM student_supervisor_assignments a
      JOIN users s ON a.student_id = s.id
      JOIN users sup ON a.supervisor_id = sup.id
      JOIN users c ON a.level_coordinator_id = c.id
      WHERE s.level = ?
      ORDER BY a.assigned_date DESC
      LIMIT 50
    `);
    const assignmentHistory = historyStmt.all(userLevel);

    // Get unassigned students
    const unassignedStmt = db.prepare(`
      SELECT u.* 
      FROM users u
      LEFT JOIN student_supervisor_assignments a ON u.id = a.student_id AND a.is_active = 1
      WHERE u.role = 'student' AND u.level = ? AND a.id IS NULL
      ORDER BY u.full_name
    `);
    const unassignedStudentsList = unassignedStmt.all(userLevel);

    // Get available supervisors with capacity
    const availableSupervisorsStmt = db.prepare(`
      SELECT 
        u.*,
        COUNT(a.id) as assigned_count,
        (u.max_students - COUNT(a.id)) as available_slots
      FROM users u
      LEFT JOIN student_supervisor_assignments a ON u.id = a.supervisor_id AND a.is_active = 1
      WHERE u.role = 'supervisor'
      GROUP BY u.id
      HAVING available_slots > 0
      ORDER BY u.full_name
    `);
    const availableSupervisors = availableSupervisorsStmt.all();

    // Get all students for statistics
    const studentsStmt = db.prepare(`
      SELECT * FROM users 
      WHERE role = 'student' AND level = ?
    `);
    const allStudents = studentsStmt.all(userLevel);

    // Calculate statistics
    const totalStudents = allStudents.length;
    const assignedStudents = currentAssignments.length;
    const unassignedStudents = unassignedStudentsList.length;
    const availableCapacity = availableSupervisors.reduce((sum, s) => sum + (s.available_slots || 0), 0);

    res.render('coordinator/assignments', {
      title: 'Assignments Management',
      user,
      level: userLevel,
      currentAssignments,
      assignmentHistory,
      unassignedStudentsList,
      availableSupervisors,
      totalStudents,
      assignedStudents,
      unassignedStudents,
      availableCapacity,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Assignments management error:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.session.user,
      message: 'Failed to load assignments management',
      error: error.message
    });
  }
};

// Get report details
const getReportDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.redirect('/auth/login');
    }

    const report = db.prepare(`
      SELECT 
        r.*,
        u.full_name as student_name,
        u.email as student_email
      FROM reports r
      INNER JOIN users u ON r.student_id = u.id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).render('error', {
        error: 'Report not found',
        user: req.session.user
      });
    }

    const feedback = db.prepare(`
      SELECT f.*, u.full_name as supervisor_name
      FROM feedback f
      INNER JOIN users u ON f.supervisor_id = u.id
      WHERE f.report_id = ?
      ORDER BY f.created_at DESC
    `).all(id);

    const hodFeedback = db.prepare(`
      SELECT hf.*, u.full_name as hod_name
      FROM hod_feedback hf
      INNER JOIN users u ON hf.hod_id = u.id
      WHERE hf.report_id = ?
      ORDER BY hf.created_at DESC
    `).all(id);

    // Determine next stage
    const stages = ['progress_1', 'progress_2', 'progress_3', 'final'];
    const currentIndex = stages.indexOf(report.report_stage);
    const nextStage = currentIndex !== -1 && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;

    const success = req.flash('success')[0] || null;
    const error = req.flash('error')[0] || null;

    // Render using main layout
    res.render('layouts/main', {
      title: `Report - ${report.title}`,
      view: '../supervisor/report-details',
      user: req.session.user,
      report: report,
      feedback: feedback,
      hodFeedback: hodFeedback,
      nextStage: nextStage,
      success: success,
      error: error
    });
  } catch (error) {
    console.error('Error getting report details:', error);
    res.status(500).render('error', {
      error: 'Failed to load report details',
      user: req.session.user
    });
  }
};


// Submit feedback
const postFeedback = async (req, res) => {
  try {
    const { report_id, comment, action_taken } = req.body;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.redirect(`/supervisor/reports?error=${encodeURIComponent('Not authenticated')}`);
    }

    // Verify report exists and belongs to supervisor
    const report = db.prepare(`
      SELECT r.*, u.full_name as student_name, u.email as student_email
      FROM reports r
      INNER JOIN users u ON r.student_id = u.id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(report_id, supervisorId);

    if (!report) {
      return res.redirect(`/supervisor/reports?error=${encodeURIComponent('Report not found')}`);
    }

    // Validate fields
    if (!comment || !comment.trim()) {
      return res.redirect(`/supervisor/reports/${report_id}?error=${encodeURIComponent('Feedback comment is required')}`);
    }

    if (!action_taken) {
      return res.redirect(`/supervisor/reports/${report_id}?error=${encodeURIComponent('Action taken is required')}`);
    }

    // Insert feedback
    db.prepare(`
      INSERT INTO feedback (report_id, supervisor_id, comment, action_taken)
      VALUES (?, ?, ?, ?)
    `).run(report_id, supervisorId, comment.trim(), action_taken);

    // Determine new status
    let newStatus = 'feedback_given';
    let successMessage = 'Feedback submitted successfully!';

    if (action_taken === 'minor_changes' || action_taken === 'no_action') {
      newStatus = 'approved';
      successMessage = 'Report approved with feedback!';
    } else if (action_taken === 'revise') {
      newStatus = 'rejected';
      successMessage = 'Report returned for revision!';
    } else if (action_taken === 'meet_discuss') {
      successMessage = 'Feedback submitted! Meeting requested to discuss.';
    }

    // Update report status
    db.prepare(`
      UPDATE reports SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, report_id);

    // Log activity (fail-safe)
    try {
      logActivity(supervisorId, 'feedback_provided', 'report', report_id, {
        student_name: report.student_name,
        action: action_taken
      });
    } catch (logError) {
      console.error('Activity logging error:', logError);
    }

    // ✅ SEND STYLISH EMAIL INSIDE THIS FUNCTION
    try {
      if (report.student_email) {

        const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
          <div style="max-width: 600px; margin: auto; background: white; border-radius: 10px; padding: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            
            <h2 style="color: #0066cc;">📘 Project Report Feedback Received</h2>

            <p>Hello <strong>${report.student_name}</strong>,</p>

            <p>Your supervisor has reviewed your project report titled:</p>

            <p style="font-size: 16px; font-weight: bold; margin: 10px 0;">📄 ${report.title}</p>

            <p style="margin-top: 20px;">Here is the feedback you received:</p>

            <div style="background: #f0f8ff; padding: 15px; border-left: 4px solid #0066cc; border-radius: 5px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 15px;">${comment}</p>
            </div>

            <p><strong>Action Taken:</strong> 
              <span style="color: #444; font-size: 15px;">
                ${action_taken.replace("_", " ")}
              </span>
            </p>

            <p style="margin-top: 20px;">Please log in to your dashboard to view full details.</p>

            <a href="https://your-domain.com/student/dashboard"
              style="display: inline-block; margin-top: 20px; padding: 12px 25px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">
              Open Dashboard
            </a>

            <p style="margin-top: 30px; font-size: 13px; color: gray;">
              This is an automated message from the Project Submission System, Faculty of Computing, BUK.
            </p>
          </div>
        </div>
        `;

        await sendEmail({
          to: report.student_email,
          subject: "✅ New Feedback on Your Project Report",
          html,
          text: `You have received new feedback on your report titled "${report.title}". Login to your dashboard to read it.`
        });

        console.log("✅ Feedback email sent to student");
      }
    } catch (emailError) {
      console.error("❌ Failed to send feedback email:", emailError);
    }

    // ✅ Final redirect
    return res.redirect(`/supervisor/reports/${report_id}?success=${encodeURIComponent(successMessage)}`);

  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.redirect(`/supervisor/reports?error=${encodeURIComponent('Failed to submit feedback. Please try again.')}`);
  }
};


// Move report to next stage
const moveToNextStage = async (req, res) => {
  try {
    const { reportId } = req.params;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Verify report exists and belongs to supervisor
    const report = db.prepare(`
      SELECT r.*, u.full_name as student_name 
      FROM reports r
      INNER JOIN users u ON r.student_id = u.id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(reportId, supervisorId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Determine next stage
    const stages = ['progress_1', 'progress_2', 'progress_3', 'final'];
    const currentIndex = stages.indexOf(report.report_stage);
    
    if (currentIndex === -1 || currentIndex === stages.length - 1) {
      return res.status(400).json({
        success: false,
        message: 'Report is already at the final stage'
      });
    }

    const nextStage = stages[currentIndex + 1];

    // Update report stage
    db.prepare(`
      UPDATE reports 
      SET report_stage = ?, status = 'pending', updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStage, reportId);

    // Log activity
    logActivity(supervisorId, 'report_moved_stage', 'report', reportId, {
      student_name: report.student_name,
      from_stage: report.report_stage,
      to_stage: nextStage
    });

    res.json({
      success: true,
      message: `Report moved to ${nextStage.replace('_', ' ')} stage`,
      nextStage
    });
  } catch (error) {
    console.error('Error moving report stage:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move report to next stage'
    });
  }
};

module.exports = {
  getDashboard,
  getStudentReports,
  getReportDetails,
  getAllReports,
  getAllStudents,
  getAssignedStudents,
  postFeedback,
  moveToNextStage
};