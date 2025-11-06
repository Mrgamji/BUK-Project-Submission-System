const { logActivity } = require('../utils/logger');
const db = require('../config/database'); // better-sqlite3 instance

// === GET DASHBOARD ===
const getDashboard = async (req, res) => {
  try {
    const user = req.session.user;
    const userLevel = user.level;

    // Get all students in coordinator's level
    const studentsStmt = db.prepare(`
      SELECT * FROM users
      WHERE role = ? AND level = ?
      ORDER BY full_name
    `);
    const students = studentsStmt.all('student', userLevel);

    // Get all supervisors
    const supervisorsStmt = db.prepare(`
      SELECT * FROM users
      WHERE role = ?
      ORDER BY full_name
    `);
    const supervisors = supervisorsStmt.all('supervisor');

    // Get existing active assignments, and join supervisor details
    const assignmentsStmt = db.prepare(`
      SELECT 
        a.id, 
        a.student_id, 
        a.supervisor_id, 
        a.is_active,
        u.id AS supervisor_id,
        u.full_name AS supervisor_full_name,
        u.email AS supervisor_email
      FROM student_supervisor_assignments a
      JOIN users u ON a.supervisor_id = u.id
      WHERE a.is_active = 1
    `);
    const assignments = assignmentsStmt.all();

    // Merge assignments with students
    const studentsWithAssignments = students.map(st => {
      const asg = assignments.find(a => a.student_id === st.id);
      return {
        ...st,
        supervisor: asg
          ? {
              id: asg.supervisor_id,
              full_name: asg.supervisor_full_name,
              email: asg.supervisor_email
            }
          : null,
        assignmentId: asg ? asg.id : null
      };
    });

    // Calculate statistics for the template
    const totalStudents = students ? students.length : 0;
    const assignedStudents = studentsWithAssignments
      ? studentsWithAssignments.filter(s => s.supervisor).length
      : 0;
    const unassignedStudents = totalStudents - assignedStudents;
    const totalSupervisors = supervisors ? supervisors.length : 0;

    // Calculate supervisor capacity stats
    let totalCapacity = 0;
    let totalAssigned = 0;
    let availableCapacity = 0;

    if (supervisors) {
      supervisors.forEach(s => {
        totalCapacity += s.max_students || 5;
        const supervisorAssigned = studentsWithAssignments
          ? studentsWithAssignments.filter(st => st.supervisor && st.supervisor.id === s.id).length
          : 0;
        totalAssigned += supervisorAssigned;
      });
      availableCapacity = totalCapacity - totalAssigned;
    }

    // Use 'layouts/main' view and 'view' for EJS template compatibility
    res.render('layouts/main', {
      title: 'Level Coordinator Dashboard',
      user,
      level: userLevel,
      students: studentsWithAssignments,
      supervisors,
      totalStudents,
      assignedStudents,
      unassignedStudents,
      totalSupervisors,
      totalCapacity,
      totalAssigned,
      availableCapacity,
      success: req.query.success || null,
      error: req.query.error || null,
      view: '../coordinator/dashboard'
    });
  } catch (error) {
    console.error('Dashboard Load Error:', error);
    res.status(500).render('layouts/main', {
      title: 'Error',
      user: req.session.user,
      view: '../error',
      message: 'Failed to load dashboard',
      error: error.message
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = req.session.user; // ✅ declare first

    // Fetch coordinator
    const coordinatorStmt = db.prepare(`
      SELECT id, full_name, email, phone, department, level, created_at
      FROM users
      WHERE id = ? AND role = 'level_coordinator'
      LIMIT 1
    `);
    const coordinator = coordinatorStmt.get(user.id); // now user is defined

    if (!coordinator) {
      return res.status(404).render('layouts/main', {
        title: 'Profile Not Found',
        user,
        view: '../error',
        message: 'Coordinator profile not found',
        error: ''
      });
    }

    // Get pending approvals
    const pendingStmt = db.prepare(`
      SELECT * FROM reports r
      JOIN users s ON r.student_id = s.id
      WHERE s.level = ? AND r.status = 'pending'
    `);
    const pendingApprovals = pendingStmt.all(coordinator.level);

    // Success/error messages
    const success = req.query.success || null;
    const error = req.query.error || null;

    res.render('layouts/main', {
      title: 'My Profile',
      user,
      coordinator,
      reports: [],             // default empty array
      pendingApprovals,
      success,
      error,
      view: '../coordinator/profile'
    });

  } catch (error) {
    console.error('Profile load error:', error);
    res.status(500).render('layouts/main', {
      title: 'Error',
      user: req.session.user,
      view: '../error',
      message: 'Failed to load profile',
      error: error.message
    });
  }
};


// === ASSIGN STUDENT ===
const assignStudent = async (req, res) => {
  const { studentId, supervisorId } = req.body;

  try {
    // Check for existing active assignment
    const existingAssignmentStmt = db.prepare(`
      SELECT id FROM student_supervisor_assignments
      WHERE student_id = ? AND is_active = 1
      LIMIT 1
    `);
    const existingAssignment = existingAssignmentStmt.get(studentId);

    if (existingAssignment) {
      // Set previous assignment inactive
      const deactivateStmt = db.prepare(`
        UPDATE student_supervisor_assignments 
        SET is_active = 0 
        WHERE id = ?
      `);
      deactivateStmt.run(existingAssignment.id);
    }

    // Insert new assignment as active
    const insertStmt = db.prepare(`
      INSERT INTO student_supervisor_assignments
        (student_id, supervisor_id, level_coordinator_id, is_active)
      VALUES (?, ?, ?, 1)
    `);
    insertStmt.run(studentId, supervisorId, req.session.user.id);

    await logActivity(
      req.session.user.id,
      'Assigned Student to Supervisor',
      'assignment',
      studentId,
      { supervisor_id: supervisorId }
    );

    res.redirect('/coordinator/dashboard?success=Student assigned successfully');
  } catch (error) {
    console.error('Assign student error:', error);
    res.redirect('/coordinator/dashboard?error=Failed to assign student');
  }
};

// === GET STUDENTS MANAGEMENT (Fixed - using submitted_at) ===
const getStudents = async (req, res) => {
  try {
    const user = req.session.user;
    const userLevel = user.level;

    // Get all students in coordinator's level with supervisor info - FIXED: use submitted_at
    const studentsStmt = db.prepare(`
      SELECT 
        u.*,
        a.id as assignment_id,
        s.full_name as supervisor_name,
        s.email as supervisor_email,
        s.id as supervisor_id,
        (SELECT MAX(r.submitted_at) FROM reports r WHERE r.student_id = u.id) as last_report_date
      FROM users u
      LEFT JOIN student_supervisor_assignments a ON u.id = a.student_id AND a.is_active = 1
      LEFT JOIN users s ON a.supervisor_id = s.id
      WHERE u.role = 'student' AND u.level = ?
      ORDER BY u.full_name
    `);
    const students = studentsStmt.all(userLevel);

    // Format students data with supervisor information
    const studentsWithSupervisors = students.map(student => ({
      ...student,
      supervisor: student.supervisor_id ? {
        id: student.supervisor_id,
        full_name: student.supervisor_name,
        email: student.supervisor_email
      } : null,
      assignmentId: student.assignment_id
    }));

    // Get all supervisors for assignment dropdown
    const supervisorsStmt = db.prepare(`
      SELECT 
        u.*,
        COUNT(a.id) as assigned_students
      FROM users u
      LEFT JOIN student_supervisor_assignments a ON u.id = a.supervisor_id AND a.is_active = 1
      WHERE u.role = 'supervisor'
      GROUP BY u.id
      ORDER BY u.full_name
    `);
    const supervisors = supervisorsStmt.all();

    // Add assignedStudents count to supervisors
    const supervisorsWithCounts = supervisors.map(supervisor => ({
      ...supervisor,
      assignedStudents: parseInt(supervisor.assigned_students) || 0
    }));

    // Calculate statistics
    const totalStudents = students.length;
    const assignedStudents = students.filter(s => s.supervisor_id).length;
    const unassignedStudents = totalStudents - assignedStudents;
    
    // Get unique departments
    const departments = [...new Set(students.map(s => s.department).filter(Boolean))];
    
    // Count active students (submitted reports in last 30 days) - FIXED: use submitted_at
    const activeStmt = db.prepare(`
      SELECT COUNT(DISTINCT r.student_id) as active_count 
      FROM reports r 
      WHERE r.submitted_at >= datetime('now', '-30 days')
    `);
    const activeResult = activeStmt.get();
    const activeStudents = activeResult ? activeResult.active_count : 0;

    res.render('layouts/main', {
      title: 'Students Management',
      user,
      level: userLevel,
      students: studentsWithSupervisors,
      supervisors: supervisorsWithCounts,
      totalStudents,
      assignedStudents,
      unassignedStudents,
      activeStudents,
      departments,
      success: req.query.success || null,
      error: req.query.error || null,
      view: '../coordinator/students'
    });
  } catch (error) {
    console.error('Students management error:', error);
    res.status(500).render('error', {
      title: 'Error',
      user: req.session.user,
      message: 'Failed to load students management',
      error: error.message
    });
  }
};
// === UNASSIGN STUDENT ===
const unassignStudent = async (req, res) => {
  const { assignmentId } = req.params;

  try {
    const deactivateStmt = db.prepare(`
      UPDATE student_supervisor_assignments
      SET is_active = 0
      WHERE id = ? AND level_coordinator_id = ?
    `);
    const result = deactivateStmt.run(assignmentId, req.session.user.id);

    if (result.changes === 0) {
      return res.redirect('/coordinator/dashboard?error=Assignment not found or unauthorized');
    }

    await logActivity(
      req.session.user.id,
      'Unassigned Student from Supervisor',
      'assignment',
      assignmentId
    );

    res.redirect('/coordinator/dashboard?success=Student unassigned successfully');
  } catch (error) {
    console.error('Unassign student error:', error);
    res.redirect('/coordinator/dashboard?error=Failed to unassign student');
  }
};

// === PROGRESS OVERVIEW ===
const getProgressOverview = async (req, res) => {
  try {
    const userLevel = req.session.user.level;
    
    // Get reports and join with student and supervisor details
    const reportsStmt = db.prepare(`
      SELECT 
        r.*,
        s.id AS student_id, s.full_name AS student_full_name, s.email AS student_email, s.level AS student_level,
        p.id AS supervisor_id, p.full_name AS supervisor_full_name, p.email AS supervisor_email
      FROM reports r
      JOIN users s ON r.student_id = s.id
      LEFT JOIN users p ON r.supervisor_id = p.id
      ORDER BY r.submitted_at DESC
    `);
    const reports = reportsStmt.all();

    // Filter by coordinator's level
    const levelReports = (reports || []).filter(r => r.student_level === userLevel);

    // Map to structure similar to original
    const mappedReports = levelReports.map(r => ({
      ...r,
      student: {
        id: r.student_id,
        full_name: r.student_full_name,
        email: r.student_email,
        level: r.student_level
      },
      supervisor: r.supervisor_id
        ? {
            id: r.supervisor_id,
            full_name: r.supervisor_full_name,
            email: r.supervisor_email
          }
        : null
    }));

    res.render('layouts/main', {
      title: 'Progress Overview',
      view: '../coordinator/progress-overview',
      user: req.session.user,
      reports: mappedReports
    });
  } catch (error) {
    console.error('Progress overview error:', error);
    res.render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load progress overview',
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
        a.created_at as assigned_date,
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
      ORDER BY a.created_at DESC
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
      ORDER BY a.created_at DESC
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

    // Get available supervisors - FIXED: Use default capacity of 5 since max_students column doesn't exist
    const availableSupervisorsStmt = db.prepare(`
      SELECT 
        u.*,
        COUNT(a.id) as assigned_count,
        (5 - COUNT(a.id)) as available_slots  -- Default capacity of 5
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

    res.render('layouts/main', {
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
      error: req.query.error || null,
      view: '../coordinator/assignments'
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

    res.render('layouts/main', {
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
      error: req.query.error || null,
      view: '../coordinator/supervisors'
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

module.exports = {
  getDashboard,
  assignStudent,
  unassignStudent,
  getProgressOverview,
  getStudents,
  getSupervisors,
  getAssignments,
  getProfile
};