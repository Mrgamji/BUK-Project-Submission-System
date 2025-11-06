const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const queries = require('../config/queries');
const { logActivity } = require('../utils/logger');
const renderPage = require('../utils/renderHelper');
const sendEmail = require('../utils/email');

// Validation helpers
const validateUpload = (file, title, reportStage) => {
  const errors = [];
  if (!file) errors.push('No file uploaded');
  if (!title || !title.trim()) errors.push('Title is required');
  if (!reportStage) errors.push('Report stage is required');

  if (file) {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const fileExt = path.extname(file.originalname || '').toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      errors.push('Only PDF, DOC, DOCX, and TXT files are allowed');
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      errors.push('File size must be less than 5MB');
    }
  }

  return errors;
};

// ---------------- GET Settings Page ----------------
// ---------------- GET Settings Page ----------------
const getSettings = (req, res) => {
  try {
    const { user } = req.session;
    
    // Get supervisor for the settings page (if student)
    const supervisor = user.role === 'student' ? queries.getSupervisor.get(user.id) : null;
    
    // Get reports for student (for security score calculation)
    const reports = user.role === 'student' ? queries.getStudentReports.all(user.id) : [];
    const reportsByStage = user.role === 'student' ? organizeReportsByStage(reports) : {};

    // Helper functions for settings page
    function calculateSecurityScore(mfaEnabled) {
      let score = 70; // Base score for strong password
      if (mfaEnabled) score += 30;
      return score;
    }

    function getSecurityMessage(score) {
      if (score >= 90) return 'Excellent security';
      if (score >= 70) return 'Good security';
      return 'Needs improvement';
    }

    // Default MFA status (you can implement real MFA logic later)
    const mfaEnabled = false;
    const securityScore = calculateSecurityScore(mfaEnabled);
    const securityMessage = getSecurityMessage(securityScore);

    renderPage(res, {
      title: 'Account Settings',
      view: '../settings',
      user: user,
      supervisor: supervisor || null,
      reports: reports || [],
      reportsByStage: reportsByStage || {},
      mfaEnabled: mfaEnabled,
      securityScore: securityScore,
      securityMessage: securityMessage,
      error: null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('❌ Get Settings Page Error:', err.message);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: 'Unable to load settings page'
    });
  }
};
const cleanUpFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error cleaning up file:', err.message);
    }
  }
};

const organizeReportsByStage = (reports) => {
  const stages = ['progress_1', 'progress_2', 'progress_3', 'final'];
  const organized = {};
  for (const stage of stages) {
    organized[stage] = (reports || []).filter(r => r.report_stage === stage);
  }
  return organized;
};

const sendSupervisorNotification = async (supervisor, user, reportData, fileName) => {
  try {
    const subject = `📘 New Report Uploaded by ${user.full_name || 'Student'}`;
    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f5f7fa; padding: 30px;">
        <div style="max-width: 600px; background: #fff; margin: 0 auto; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="background: linear-gradient(135deg, #0078ff, #00c6ff); color: #fff; padding: 20px 30px;">
            <h2 style="margin: 0;">New Report Submission</h2>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333;">Hello <b>${supervisor.full_name || 'Supervisor'}</b>,</p>
            <p style="font-size: 15px; color: #555; line-height: 1.6;">
              A new report has been uploaded by <b>${user.full_name || 'a student'}</b>.
            </p>
            <div style="margin-top: 20px; background: #f0f4f8; border-left: 4px solid #0078ff; padding: 15px;">
              <p style="margin: 5px 0;"><b>Title:</b> ${reportData.title}</p>
              <p style="margin: 5px 0;"><b>Stage:</b> ${reportData.report_stage}</p>
              <p style="margin: 5px 0;"><b>File:</b> ${fileName}</p>
              <p style="margin: 5px 0;"><b>Uploaded at:</b> ${new Date().toLocaleString()}</p>
            </div>
            <p style="margin-top: 30px; font-size: 15px; color: #555;">
              You can review this report from your dashboard.
            </p>
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/supervisor/reports" 
              style="display: inline-block; margin-top: 15px; padding: 12px 24px; background-color: #0078ff; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View Report
            </a>
          </div>
        </div>
      </div>
    `;
    await sendEmail({ to: supervisor.email, subject, html });
    console.log(`📧 Notification sent to supervisor: ${supervisor.email}`);
  } catch (emailError) {
    console.error('❌ Failed to send supervisor notification:', emailError.message);
  }
};

// ---------------- GET Profile Page ----------------
const getProfile = (req, res) => {
  try {
    const { user } = req.session;
    const supervisor = queries.getSupervisor.get(user.id);
    const reports = queries.getStudentReports.all(user.id);
    const reportsByStage = organizeReportsByStage(reports);

    renderPage(res, {
      title: 'My Profile',
      view: '../student/profile',
      user: user,
      supervisor: supervisor || null,
      reports: reports || [],
      reportsByStage: reportsByStage || {},
      error: null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('❌ Get Profile Page Error:', err.message);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: 'Unable to load profile page'
    });
  }
};

// ---------------- Student Dashboard ----------------
const getDashboard = async (req, res) => {
  try {
    const { user } = req.session;
    const supervisor = queries.getSupervisor.get(user.id);
    const reports = queries.getStudentReports.all(user.id);
    const reportsByStage = organizeReportsByStage(reports);

    res.render('layouts/main', {
      title: 'Student Dashboard',
      view: '../student/dashboard',
      user,
      supervisor: supervisor || null,
      reports: reports || [],
      reportsByStage,
      error: null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('❌ Dashboard Error:', err.message);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: 'Unable to load dashboard. Please try again.'
    });
  }
};

// ---------------- GET Upload Page ----------------
const getUploadReport = (req, res) => {
  try {
    const { user } = req.session;
    const supervisor = queries.getSupervisor.get(user.id);

    renderPage(res, {
      title: 'Upload Report',
      view: '../student/upload-report',
      supervisor: supervisor || null,
      user: user,
      error: null,
      success: null
    });
  } catch (err) {
    console.error('❌ Get Upload Page Error:', err.message);
    res.status(500).send('Error loading upload page');
  }
};

// ---------------- POST Upload Report ----------------
// ---------------- POST Upload Report ----------------
const postUploadReport = async (req, res) => {
  let fileCleanupRequired = false;
  let tempFilePath = null;

  try {
    const { user } = req.session;
    const { title, report_stage } = req.body;
    const file = req.file;

    console.log('📤 Upload request received:', {
      user: user.id,
      title,
      report_stage,
      file: file ? {
        originalname: file.originalname,
        filename: file.filename,
        size: file.size,
        path: file.path
      } : 'No file'
    });

    // Validate input
    const validationErrors = validateUpload(file, title, report_stage);
    if (validationErrors.length > 0) {
      if (file) {
        fileCleanupRequired = true;
        tempFilePath = file.path;
      }
      console.log('❌ Validation errors:', validationErrors);
      return renderPage(res, {
        title: 'Upload Report',
        view: '../student/upload-report',
        user,
        error: validationErrors.join(', '),
        success: null
      });
    }

    // Get available supervisor
    const supervisor = queries.getAvailableSupervisor.get();
    if (!supervisor) {
      fileCleanupRequired = true;
      tempFilePath = file.path;
      console.log('❌ No supervisor available');
      return renderPage(res, {
        title: 'Upload Report',
        view: '../student/upload-report',
        user,
        error: 'No supervisor available. Please contact administrator.',
        success: null
      });
    }

    console.log('👨‍🏫 Supervisor assigned:', supervisor.id, supervisor.full_name);

    // Define upload directories
    const uploadsBaseDir = path.join(__dirname, '..', 'public', 'uploads');
    const reportsDir = path.join(uploadsBaseDir, 'reports');
    
    // Ensure directories exist
    if (!fs.existsSync(uploadsBaseDir)) {
      fs.mkdirSync(uploadsBaseDir, { recursive: true });
      console.log('✅ Created uploads base directory');
    }
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
      console.log('✅ Created reports directory');
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${timestamp}-${randomSuffix}${fileExtension}`;
    
    // Define permanent file path
    const permanentFilePath = path.join(reportsDir, uniqueFilename);
    tempFilePath = file.path;

    console.log('📁 File paths:', {
      temp: tempFilePath,
      permanent: permanentFilePath,
      uniqueFilename: uniqueFilename
    });

    // Move file from temp to permanent location
    try {
      fs.renameSync(tempFilePath, permanentFilePath);
      console.log('✅ File moved to permanent location');
      fileCleanupRequired = false; // File is now in permanent location
    } catch (moveError) {
      console.error('❌ Error moving file:', moveError);
      
      // Fallback: copy file if rename fails
      try {
        fs.copyFileSync(tempFilePath, permanentFilePath);
        console.log('✅ File copied to permanent location (fallback)');
        fileCleanupRequired = true; // Still need to clean up temp file
      } catch (copyError) {
        console.error('❌ Error copying file:', copyError);
        throw new Error('Failed to save file to permanent storage');
      }
    }

    // Verify file was saved
    if (!fs.existsSync(permanentFilePath)) {
      throw new Error('File was not saved to permanent location');
    }

    // Get file stats for permanent file
    const fileStats = fs.statSync(permanentFilePath);
    console.log('📊 File stats:', {
      size: fileStats.size,
      savedLocation: permanentFilePath
    });

    // Store relative path in database (for web access)
    const relativeFilePath = `/uploads/reports/${uniqueFilename}`;

    console.log('💾 Saving to database:', {
      student_id: user.id,
      supervisor_id: supervisor.id,
      title: title.trim(),
      report_stage: report_stage,
      file_url: relativeFilePath,
      file_name: file.originalname,
      file_size: fileStats.size
    });

    // Insert report into database
    const result = queries.insertReport.run(
      user.id,
      supervisor.id,
      title.trim(),
      report_stage,
      relativeFilePath, // This should match what getFileView expects
      file.originalname,
      fileStats.size
    );

    const reportId = result.lastInsertRowid;
    console.log('✅ Report saved to database with ID:', reportId);

    // Verify database entry
    const savedReport = queries.getReportById.get(reportId);
    if (!savedReport) {
      throw new Error('Failed to verify report save in database');
    }

    console.log('✅ Database verification passed:', {
      id: savedReport.id,
      file_url: savedReport.file_url,
      file_name: savedReport.file_name
    });

    // Log activity
    logActivity(user.id, 'Uploaded report', 'report', reportId, {
      title: title.trim(),
      report_stage: report_stage,
      file: file.originalname,
      supervisor: supervisor.full_name,
      file_size: fileStats.size
    });

    console.log('✅ Activity logged');

    // Send notification to supervisor (non-blocking)
    sendSupervisorNotification(supervisor, user, { 
      title: title.trim(), 
      report_stage: report_stage 
    }, file.originalname)
    .then(() => console.log('✅ Supervisor notification sent'))
    .catch(err => console.error('❌ Supervisor notification failed:', err));

    // Clean up temp file if it still exists
    if (fileCleanupRequired && tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('✅ Temporary file cleaned up');
      } catch (cleanupError) {
        console.error('❌ Temp file cleanup failed:', cleanupError);
      }
    }

    console.log('🎉 Upload completed successfully, redirecting to dashboard');
    
    // Redirect with success message
    res.redirect('/student/dashboard?success=Report uploaded successfully');

  } catch (err) {
    console.error('❌ Upload Error:', err.message);
    console.error('❌ Stack trace:', err.stack);

    // Clean up files on error
    if (fileCleanupRequired && tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('✅ Temporary file cleaned up after error');
      } catch (cleanupError) {
        console.error('❌ Temp file cleanup failed after error:', cleanupError);
      }
    }

    // Also try to clean up any permanent file that might have been partially created
    if (req.file && req.file.filename) {
      const permanentFilePath = path.join(__dirname, '..', 'public', 'uploads', 'reports', req.file.filename);
      if (fs.existsSync(permanentFilePath)) {
        try {
          fs.unlinkSync(permanentFilePath);
          console.log('✅ Permanent file cleaned up after error');
        } catch (cleanupError) {
          console.error('❌ Permanent file cleanup failed:', cleanupError);
        }
      }
    }

    renderPage(res, {
      title: 'Upload Report',
      view: '../student/upload-report',
      user: req.session.user,
      error: `Upload failed: ${err.message}`,
      success: null
    });
  }
};

// ---------------- View Report Details ----------------
const getReportDetails = (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.session;

    // Get report with authorization check
    const report = queries.getReportWithSupervisor.get(id, user.id);
    if (!report) {
      return res.status(404).render('layouts/main', {
        title: 'Report Not Found',
        view: '../error',
        user,
        error: 'Report not found or you do not have permission to view it'
      });
    }

    // Get related data
    const feedback = queries.getFeedbackForReport.all(id);
    const hodFeedback = queries.getHodFeedbackForReport.all(id);

    // Get report versions (from the same reports table)
    const reportVersions = queries.getReportVersions.all(
      report.student_id,
      report.title,
      report.report_stage
    );

    renderPage(res, {
      title: `Report: ${report.title}`,
      view: '../student/report-details',
      user,
      report,
      feedback: feedback || [],
      hodFeedback: hodFeedback || [],
      reportVersions: reportVersions || [],
      success: req.query.success,
      error: null
    });

  } catch (err) {
    console.error('❌ Get Report Details Error:', err.message);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: 'Failed to load report details'
    });
  }
};

// ---------------- GET Reupload Report ----------------
const getReuploadReport = (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.session;

    const report = queries.getReportById.get(id);

    // Authorization check
    if (!report || report.student_id !== user.id) {
      return res.status(404).render('layouts/main', {
        title: 'Report Not Found',
        view: '../error',
        user,
        error: 'Report not found or access denied'
      });
    }

    // Check if reupload is allowed
    const allowedStatuses = ['feedback_given', 'rejected'];
    if (!allowedStatuses.includes(report.status)) {
      return res.status(400).render('layouts/main', {
        title: 'Reupload Not Allowed',
        view: '../error',
        user,
        error: 'Reupload is only allowed for reports with feedback or rejected status'
      });
    }

    renderPage(res, {
      title: 'Reupload Report',
      view: '../student/reuploadReport',
      user,
      report,
      error: null,
      success: null
    });

  } catch (err) {
    console.error('❌ Get Reupload Error:', err.message);
    res.status(500).send('Error loading reupload page');
  }
};

// ---------------- POST Reupload Report ----------------
const postReuploadReport = (req, res) => {
  let fileCleanupRequired = false;

  try {
    const { id } = req.params;
    const { user } = req.session;
    const file = req.file;

    // Validate file
    if (!file) {
      const report = queries.getReportById.get(id);
      return renderPage(res, {
        title: 'Reupload Report',
        view: '../student/reuploadReport',
        user,
        report,
        error: 'No file uploaded. Please select a file.',
        success: null
      });
    }

    // Validate file type and size
    const validationErrors = validateUpload(file, 'Reupload', 'reupload');
    if (validationErrors.length > 0) {
      fileCleanupRequired = true;
      const report = queries.getReportById.get(id);
      return renderPage(res, {
        title: 'Reupload Report',
        view: '../student/reuploadReport',
        user,
        report,
        error: validationErrors.join(', '),
        success: null
      });
    }

    // Get and validate report
    const report = queries.getReportById.get(id);
    if (!report || report.student_id !== user.id) {
      fileCleanupRequired = true;
      return res.status(404).render('layouts/main', {
        title: 'Report Not Found',
        view: '../error',
        user,
        error: 'Report not found or access denied'
      });
    }

    // Update report
    queries.updateReportOnReupload.run(
      `/uploads/reports/${file.filename}`,
      file.originalname,
      file.size,
      id
    );

    // Log activity
    logActivity(user.id, 'Reuploaded report', 'report', id, {
      old_version: report.version,
      new_version: report.version + 1,
      new_file: file.originalname,
      previous_file: report.file_name
    });

    res.redirect('/student/dashboard?success=Report reuploaded successfully');

  } catch (err) {
    console.error('❌ Reupload Error:', err.message);

    if (fileCleanupRequired && req.file) {
      cleanUpFile(req.file.path);
    }

    const report = queries.getReportById.get(req.params.id);
    renderPage(res, {
      title: 'Reupload Report',
      view: '../student/reuploadReport',
      user: req.session.user,
      report,
      error: `Reupload failed: ${err.message}`,
      success: null
    });
  }
};

// ---------------- GET Supervisor Page ----------------
const getSupervisor = (req, res) => {
  try {
    const { user } = req.session;
    const supervisor = queries.getSupervisor.get(user.id);

    renderPage(res, {
      title: 'My Supervisor',
      view: '../student/my-supervisor',
      user: user,
      supervisor: supervisor || null,
      error: null,
      success: null
    });

  } catch (err) {
    console.error('❌ Get Supervisor Page Error:', err.message);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: 'Unable to load supervisor information'
    });
  }
};

// ---------------- GET Progress Page ----------------
const getProgress = (req, res) => {
  try {
    const { user } = req.session;
    const supervisor = queries.getSupervisor.get(user.id);
    const reports = queries.getStudentReports.all(user.id);
    const reportsByStage = organizeReportsByStage(reports);

    // Calculate progress statistics
    const totalReports = reports ? reports.length : 0;
    const approvedReports = reports ? reports.filter(r => r.status === 'approved').length : 0;
    const pendingReports = reports ? reports.filter(r => r.status === 'pending').length : 0;
    const feedbackReports = reports ? reports.filter(r => r.status === 'feedback_given').length : 0;

    // Calculate completion percentage
    const stages = ['progress_1', 'progress_2', 'progress_3', 'final'];
    const completedStages = stages.filter(stage =>
      reportsByStage[stage] && reportsByStage[stage].length > 0
    ).length;
    const completionPercentage = Math.round((completedStages / stages.length) * 100);

    // Prepare progress stages data
    // Build objects for each stage with history and status
    function getStatusColor(status) {
      switch (status) {
        case 'approved':
          return 'success';
        case 'pending':
          return 'warning';
        case 'feedback_given':
          return 'info';
        case 'rejected':
          return 'danger';
        default:
          return 'secondary';
      }
    }

    function getStatusText(status) {
      switch (status) {
        case 'approved':
          return 'Approved';
        case 'pending':
          return 'Pending';
        case 'feedback_given':
          return 'Feedback';
        case 'rejected':
          return 'Rejected';
        default:
          return status || 'Not Started';
      }
    }

    function getDaysAgo(dateString) {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    }

    const progressStages = stages.map((stage, idx) => {
      const displayNames = [
        'Progress Report 1',
        'Progress Report 2',
        'Progress Report 3',
        'Final Report'
      ];
      const descriptions = [
        'Initial Research & Proposal',
        'Literature Review & Analysis',
        'Preliminary Results & Discussion',
        'Final Thesis/Dissertation'
      ];
      const icons = [
        'bi-1-circle',
        'bi-2-circle',
        'bi-3-circle',
        'bi-file-earmark-check'
      ];
      const colors = [
        'primary',
        'secondary',
        'info',
        'success'
      ];
      const stageReports = reportsByStage[stage] || [];
      const hasReport = stageReports.length > 0;
      const mainReport = hasReport ? stageReports[0] : null;
      const completed = hasReport && mainReport.status === 'approved';

      return {
        key: stage,
        name: displayNames[idx],
        description: descriptions[idx],
        icon: icons[idx],
        color: colors[idx],
        hasReport: hasReport,
        completed: completed,
        statusColor: hasReport ? getStatusColor(mainReport.status) : 'secondary',
        statusText: hasReport ? getStatusText(mainReport.status) : 'Not Started',
        version: hasReport ? mainReport.version : 0,
        submittedDate: hasReport && mainReport.submitted_at ? new Date(mainReport.submitted_at).toLocaleDateString() : '',
        daysAgo: hasReport && mainReport.submitted_at ? getDaysAgo(mainReport.submitted_at) : '',
        reportId: hasReport ? mainReport.id : null,
        canReupload: hasReport ? (mainReport.status === 'feedback_given' || mainReport.status === 'rejected') : false,
        hasHistory: stageReports.length > 1,
        historyCount: stageReports.length > 1 ? stageReports.length - 1 : 0,
        history: stageReports.length > 1
          ? stageReports.slice(1).map(report => ({
            version: report.version,
            submittedDate: report.submitted_at ? new Date(report.submitted_at).toLocaleDateString() : '',
            statusColor: getStatusColor(report.status),
            statusText: getStatusText(report.status)
          }))
          : []
      };
    });

    renderPage(res, {
      title: 'My Progress',
      view: '../student/progress',
      user: user,
      supervisor: supervisor || null,
      reports: reports || [],
      reportsByStage: reportsByStage || {},
      totalReports,
      approvedReports,
      pendingReports,
      feedbackReports,
      completionPercentage,
      completedStages,
      totalStages: stages.length,
      progressStages,
      error: null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('❌ Get Progress Page Error:', err.message);
    res.status(500).render('layouts/main', {
      title: 'Error',
      view: '../error',
      user: req.session.user,
      error: 'Unable to load progress page'
    });
  }
};

module.exports = {
  getDashboard,
  getUploadReport,
  postUploadReport,
  getReportDetails,
  getReuploadReport,
  postReuploadReport,
  getSupervisor,
  getProfile,
  getProgress,
  getSettings,
};