// server/controllers/coordinatorController.js
const { logActivity } = require('../utils/logger');
const supabase = require('../config/database'); // Make sure your supabase client is initialized

// === GET DASHBOARD ===
const getDashboard = async (req, res) => {
  try {
    const user = req.session.user;
    const userLevel = user.level;

    // ✅ Get all students in coordinator's level
    const { data: students, error: studentsError } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'student')
      .eq('level', userLevel)
      .order('full_name');

    if (studentsError) throw studentsError;

    // ✅ Get all supervisors
    const { data: supervisors, error: supervisorsError } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'supervisor')
      .order('full_name');

    if (supervisorsError) throw supervisorsError;

    // ✅ Get existing active assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from('student_supervisor_assignments')
      .select(`
        id,
        student_id,
        supervisor_id,
        is_active,
        supervisor:supervisor_id(id, full_name, email)
      `)
      .eq('is_active', true);

    if (assignmentsError) throw assignmentsError;

    // ✅ Merge assignments with students
    const studentsWithAssignments = students.map(st => {
      const asg = assignments.find(a => a.student_id === st.id);
      return {
        ...st,
        supervisor: asg ? asg.supervisor : null,
        assignmentId: asg ? asg.id : null
      };
    });

    // ✅ Render dashboard
    res.render('layouts/main', {
      title: 'Level Coordinator Dashboard',
      view: '../coordinator/dashboard',
      user,
      students: studentsWithAssignments,
      supervisors
    });
  } catch (error) {
    console.error('Dashboard Load Error:', error);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      message: 'Failed to load dashboard',
      error: error.message
    });
  }
};

// === ASSIGN STUDENT ===
const assignStudent = async (req, res) => {
  const { studentId, supervisorId } = req.body;

  try {
    const { data: existingAssignment } = await supabase
      .from('student_supervisor_assignments')
      .select('id')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .maybeSingle();

    if (existingAssignment) {
      await supabase
        .from('student_supervisor_assignments')
        .update({ is_active: false })
        .eq('id', existingAssignment.id);
    }

    const { error } = await supabase
      .from('student_supervisor_assignments')
      .insert({
        student_id: studentId,
        supervisor_id: supervisorId,
        level_coordinator_id: req.session.user.id,
        is_active: true
      });

    if (error) throw error;

    await logActivity(req.session.user.id, 'Assigned Student to Supervisor', 'assignment', studentId, {
      supervisor_id: supervisorId
    });

    res.redirect('/coordinator/dashboard');
  } catch (error) {
    console.error('Assign student error:', error);
    res.redirect('/coordinator/dashboard');
  }
};

// === UNASSIGN STUDENT ===
const unassignStudent = async (req, res) => {
  const { assignmentId } = req.params;

  try {
    const { error } = await supabase
      .from('student_supervisor_assignments')
      .update({ is_active: false })
      .eq('id', assignmentId)
      .eq('level_coordinator_id', req.session.user.id);

    if (error) throw error;

    await logActivity(req.session.user.id, 'Unassigned Student from Supervisor', 'assignment', assignmentId);

    res.redirect('/coordinator/dashboard');
  } catch (error) {
    console.error('Unassign student error:', error);
    res.redirect('/coordinator/dashboard');
  }
};

// === PROGRESS OVERVIEW ===
const getProgressOverview = async (req, res) => {
  try {
    const userLevel = req.session.user.level;

    const { data: reports, error } = await supabase
      .from('reports')
      .select(`
        *,
        student:student_id(id, full_name, email, level),
        supervisor:supervisor_id(id, full_name, email)
      `)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    const levelReports = reports?.filter(r => r.student.level === userLevel);

    res.render('layouts/main', {
      title: 'Progress Overview',
      view: '../coordinator/progress-overview',
      user: req.session.user,
      reports: levelReports
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

module.exports = {
  getDashboard,
  assignStudent,
  unassignStudent,
  getProgressOverview
};
