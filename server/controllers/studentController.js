
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');
const renderPage = require('../utils/renderHelper');
const sendEmail = require('../utils/email');

// ---------------- Student Dashboard ----------------
const getDashboard = (req, res) => {
  try {
    const user = req.session.user;

    const supervisor = db.prepare(`
      SELECT u.* FROM users u
      JOIN student_supervisor_assignments ssa ON ssa.supervisor_id = u.id
      WHERE ssa.student_id = ?
    `).get(user.id);

    const reports = db.prepare('SELECT * FROM reports WHERE student_id = ? ORDER BY submitted_at DESC')
      .all(user.id);

    const reportsByStage = {
      progress_1: reports.filter(r => r.report_stage === 'progress_1'),
      progress_2: reports.filter(r => r.report_stage === 'progress_2'),
      progress_3: reports.filter(r => r.report_stage === 'progress_3'),
      final: reports.filter(r => r.report_stage === 'final')
    };

    res.render('layouts/main', {
      title: 'Student Dashboard',
      view: '../student/dashboard',
      user,
      supervisor,
      reports,
      reportsByStage
    });
  } catch (err) {
    console.error('Dashboard Error:', err);
    res.status(500).send(`Dashboard Error: ${err.message}`);
  }
};

// ---------------- GET Upload Page ----------------
const getUploadReport = (req, res) => {
  try {
    renderPage(res, {
      title: 'Upload Report',
      view: '../student/upload-report',
      user: req.session.user,
      error: null
    });
  } catch (err) {
    console.error('Get Upload Page Error:', err);
    res.status(500).send(`Get Upload Page Error: ${err.message}`);
  }
};

// ---------------- POST Upload ----------------
const postUploadReport = (req, res) => {
  try {
  const user = req.session.user;

    if (!req.file) {
      return renderPage(res, {
        title: 'Upload Report',
        view: '../student/upload-report',
        user,
        error: 'No file uploaded. Please select a file.'
      });
    }

    const { title, report_stage } = req.body;

    // Validate required fields
    if (!title || !report_stage) {
      // Clean up uploaded file if validation fails
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return renderPage(res, {
        title: 'Upload Report',
        view: '../student/upload-report',
        user,
        error: 'Title and report stage are required.'
      });
    }

    const supervisor = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get('supervisor');
    if (!supervisor) {
      // Clean up uploaded file if no supervisor
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return renderPage(res, {
        title: 'Upload Report',
        view: '../student/upload-report',
        user,
        error: 'No supervisor available. Please contact administrator.'
      });
    }

    const file_path = `/uploads/reports/${req.file.filename}`;

    const stmt = db.prepare(`
      INSERT INTO reports
        (student_id, supervisor_id, title, report_stage, file_url, file_name, file_size, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const info = stmt.run(
      user.id,
      supervisor.id,
      title,
      report_stage,
      file_path,
      req.file.originalname,
      req.file.size
    );

   logActivity(user.id, 'Uploaded report', 'report', info.lastInsertRowid, {
  title,
  report_stage,
  file: req.file.originalname
});

// Send email notification to supervisor
(async () => {
  try {
    const subject = `📘 New Report Uploaded by ${user.name || 'Student'}`;
    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f5f7fa; padding: 30px;">
        <div style="max-width: 600px; background: #fff; margin: 0 auto; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #0078ff, #00c6ff); color: #fff; padding: 20px 30px;">
            <h2 style="margin: 0;">New Report Submission</h2>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333;">Hello <b>${supervisor.name || 'Supervisor'}</b>,</p>
            <p style="font-size: 15px; color: #555; line-height: 1.6;">
              A new report has been uploaded by <b>${user.name || 'a student'}</b>.
            </p>

            <div style="margin-top: 20px; background: #f0f4f8; border-left: 4px solid #0078ff; padding: 15px;">
              <p style="margin: 5px 0;"><b>Title:</b> ${title}</p>
              <p style="margin: 5px 0;"><b>Stage:</b> ${report_stage}</p>
              <p style="margin: 5px 0;"><b>File:</b> ${req.file.originalname}</p>
              <p style="margin: 5px 0;"><b>Uploaded at:</b> ${new Date().toLocaleString()}</p>
            </div>

            <p style="margin-top: 30px; font-size: 15px; color: #555;">
              You can review this report from your dashboard.
            </p>

            <a href="${process.env.APP_URL || 'http://localhost:3000'}/supervisor/reports" 
              style="display: inline-block; margin-top: 15px; padding: 12px 24px; background-color: #0078ff; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Report
            </a>

            <p style="margin-top: 40px; font-size: 13px; color: #999; text-align: center;">
              This is an automated notification from <b>${process.env.APP_NAME || 'Student Report Portal'}</b>.
            </p>
          </div>
        </div>
      </div>
    `;

    await sendEmail({
      to: supervisor.email,
      subject,
      html,
    });

    console.log(`Email sent to supervisor (${supervisor.email}) about new report.`);
  } catch (emailError) {
    console.error('Failed to send supervisor notification:', emailError);
  }
})();

res.redirect('/student/dashboard');

  } catch (err) {
    console.error('Upload Error:', err);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    renderPage(res, {
      title: 'Upload Report',
      view: '../student/upload-report',
      user: req.session.user,
      error: `Upload failed: ${err.message}`
    });
  }
};

// ---------------- VIEW REPORT ----------------
const getReport = (req, res) => {
  try {
    const { id } = req.params;
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    const feedback = db.prepare('SELECT * FROM feedback WHERE report_id = ?').all(id);

    res.render('layouts/main', {
      title: 'View Report',
      view: '../student/reportDetail',
      user: req.session.user,
      report,
      feedback
    });
  } catch (err) {
    console.error('View Report Error:', err);
    res.status(500).send(`View Report Error: ${err.message}`);
  }
};

// ---------------- REUPLOAD REPORT ----------------
const getReuploadReport = (req, res) => {
  try {
    const { id } = req.params;
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);

    renderPage(res, {
      title: 'Reupload Report',
      view: '../student/reuploadReport',
      user: req.session.user,
      report,
      error: null
    });
  } catch (err) {
    console.error('Get Reupload Error:', err);
    res.status(500).send(`Get Reupload Error: ${err.message}`);
  }
};

const postReuploadReport = (req, res) => {
  try {
    const { id } = req.params;
    const user = req.session.user;

    if (!req.file) {
      return renderPage(res, {
        title: 'Reupload Report',
        view: '../student/reuploadReport',
        user,
        error: 'No file uploaded. Please select a file.',
        report: db.prepare('SELECT * FROM reports WHERE id = ?').get(id)
      });
    }

    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);

    // Update the report
    db.prepare(`
      UPDATE reports SET
        file_url = ?,
        file_name = ?,
        file_size = ?,
        version = version + 1,
        status = 'pending',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(`/uploads/reports/${req.file.filename}`, req.file.originalname, req.file.size, id);

    logActivity(user.id, 'Reuploaded report', 'report', id, {
      old_version: report.version,
      new_file: req.file.originalname
    });

    res.redirect('/student/dashboard');

  } catch (err) {
    console.error('Reupload Error:', err);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    renderPage(res, {
      title: 'Reupload Report',
      view: '../student/reuploadReport',
      user,
      error: `Reupload failed: ${err.message}`,
      report: db.prepare('SELECT * FROM reports WHERE id = ?').get(id)
    });
  }
};
// ---------------- VIEW REPORT DETAILS ----------------
const getReportDetails = (req, res) => {
  try {
    const { id } = req.params;
    const user = req.session.user;
    
    // Get report with supervisor details
    const report = db.prepare(`
      SELECT r.*, u.name as supervisor_name, u.email as supervisor_email 
      FROM reports r 
      LEFT JOIN users u ON r.supervisor_id = u.id 
      WHERE r.id = ? AND r.student_id = ?
    `).get(id, user.id);

    if (!report) {
      return res.status(404).render('layouts/main', {
        title: 'Report Not Found',
        view: '../error',
        user,
        error: 'Report not found or you do not have permission to view it'
      });
    }

    // Get all feedback for this report
    const feedback = db.prepare(`
      SELECT f.*, u.name as supervisor_name 
      FROM feedback f 
      LEFT JOIN users u ON f.supervisor_id = u.id 
      WHERE f.report_id = ? 
      ORDER BY f.created_at DESC
    `).all(id);

    // Get report history (previous versions if any)
    const reportHistory = db.prepare(`
      SELECT * FROM report_history 
      WHERE report_id = ? 
      ORDER BY created_at DESC
    `).all(id);

    renderPage(res, {
      title: `Report: ${report.title}`,
      view: '../student/reportDetail',
      user,
      report,
      feedback,
      reportHistory,
      success: req.query.success
    });

  } catch (err) {
    console.error('Get Report Details Error:', err);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: `Failed to load report details: ${err.message}`
    });
  }
};
module.exports = {
  getDashboard,
  getUploadReport,
  postUploadReport,
  getReportDetails,
  getReuploadReport,
  postReuploadReport
};
