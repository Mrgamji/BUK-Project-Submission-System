const db = require('./database');

// Database queries (prepared once for better performance)
const queries = {
  getSupervisor: db.prepare(`
    SELECT u.* FROM users u
    JOIN student_supervisor_assignments ssa ON ssa.supervisor_id = u.id
    WHERE ssa.student_id = ? AND ssa.is_active = 1
  `),
  
  getStudentReports: db.prepare(`
    SELECT * FROM reports 
    WHERE student_id = ? 
    ORDER BY submitted_at DESC
  `),
  
  getReportById: db.prepare('SELECT * FROM reports WHERE id = ?'),
  
  getReportWithSupervisor: db.prepare(`
    SELECT r.*, u.full_name as supervisor_name, u.email as supervisor_email 
    FROM reports r 
    LEFT JOIN users u ON r.supervisor_id = u.id 
    WHERE r.id = ? AND r.student_id = ?
  `),
  
  getFeedbackForReport: db.prepare(`
    SELECT f.*, u.full_name as supervisor_name 
    FROM feedback f 
    LEFT JOIN users u ON f.supervisor_id = u.id 
    WHERE f.report_id = ? 
    ORDER BY f.created_at DESC
  `),
  
  getHodFeedbackForReport: db.prepare(`
    SELECT hf.*, u.full_name as hod_name 
    FROM hod_feedback hf 
    LEFT JOIN users u ON hf.hod_id = u.id 
    WHERE hf.report_id = ? 
    ORDER BY hf.created_at DESC
  `),
  
  getAvailableSupervisor: db.prepare(`
    SELECT * FROM users WHERE role = 'supervisor' AND is_active = 1 LIMIT 1
  `),
  
  insertReport: db.prepare(`
    INSERT INTO reports (
      student_id, supervisor_id, title, report_stage, 
      file_url, file_name, file_size, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `),
  
  updateReportOnReupload: db.prepare(`
    UPDATE reports SET
      file_url = ?, file_name = ?, file_size = ?,
      version = version + 1, status = 'pending', updated_at = datetime('now')
    WHERE id = ?
  `),
  
  getReportVersions: db.prepare(`
    SELECT * FROM reports 
    WHERE student_id = ? AND title = ? AND report_stage = ?
    ORDER BY version DESC
  `)
};

console.log('✅ Database queries prepared successfully');

module.exports = queries;