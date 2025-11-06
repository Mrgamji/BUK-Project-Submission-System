const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');
const sendEmail = require('../utils/email');

// File Configuration
const FILE_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_EXTENSIONS: ['pdf', 'txt', 'doc', 'docx', 'js', 'html', 'css', 'md', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar'],
  EDITABLE_EXTENSIONS: ['txt', 'js', 'html', 'css', 'md', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php'],
  MIME_TYPES: {
    pdf: 'application/pdf',
    txt: 'text/plain',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    js: 'application/javascript',
    html: 'text/html',
    css: 'text/css',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    py: 'text/x-python',
    java: 'text/x-java',
    cpp: 'text/x-c++src',
    c: 'text/x-csrc',
    php: 'application/x-php',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed'
  }
};

// Utility functions
const FileUtils = {
  getFileExtension(filename) {
    return filename.toLowerCase().split('.').pop();
  },

  isValidFileType(extension) {
    return FILE_CONFIG.ALLOWED_EXTENSIONS.includes(extension);
  },

  isEditableFile(extension) {
    return FILE_CONFIG.EDITABLE_EXTENSIONS.includes(extension);
  },

  getMimeType(extension) {
    return FILE_CONFIG.MIME_TYPES[extension] || 'application/octet-stream';
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  sanitizeFileName(filename) {
    return filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  }
};

// GET Supervisor Dashboard
const getDashboard = (req, res) => {
  try {
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.status(401).render('error', {
        message: 'Authentication required',
        error: { status: 401 }
      });
    }

    // Get assigned students
    let assignments = [];
    try {
      assignments = db.prepare(`
        SELECT 
          s.id AS student_id, 
          s.full_name AS student_name, 
          s.email AS student_email,
          s.department, 
          s.level,
          COALESCE(s.registration_number, 'N/A') as registration_number
        FROM student_supervisor_assignments a
        LEFT JOIN users s ON s.id = a.student_id
        WHERE a.supervisor_id = ? AND a.is_active = 1
        ORDER BY s.full_name
      `).all(supervisorId);
    } catch (dbError) {
      console.error('Database Error (Assignments):', dbError);
      return res.status(500).render('error', {
        message: 'Failed to load student data',
        error: process.env.NODE_ENV === 'development' ? dbError : {}
      });
    }

    const studentIds = assignments.map(a => a.student_id);
    let reports = [];
    let recentReports = [];

    if (studentIds.length > 0) {
      try {
        const placeholders = studentIds.map(() => '?').join(',');
        
        reports = db.prepare(`
          SELECT r.*, s.full_name AS student_name
          FROM reports r
          LEFT JOIN users s ON s.id = r.student_id
          WHERE r.student_id IN (${placeholders})
          ORDER BY r.submitted_at DESC
        `).all(...studentIds);

        recentReports = db.prepare(`
          SELECT r.*, s.full_name AS student_name
          FROM reports r
          LEFT JOIN users s ON s.id = r.student_id
          WHERE r.student_id IN (${placeholders})
          ORDER BY r.submitted_at DESC
          LIMIT 10
        `).all(...studentIds);
      } catch (reportsError) {
        console.error('Database Error (Reports):', reportsError);
        reports = [];
        recentReports = [];
      }
    }

    const students = assignments.map(assignment => {
      const studentReports = reports.filter(r => r.student_id === assignment.student_id);
      return {
        id: assignment.student_id,
        full_name: assignment.student_name || 'Unknown Student',
        email: assignment.student_email || 'No email',
        registration_number: assignment.registration_number || 'N/A',
        department: assignment.department || 'No department',
        level: assignment.level || 'No level',
        reportsCount: studentReports.length,
        pendingCount: studentReports.filter(r => r.status === 'pending').length,
        approvedCount: studentReports.filter(r => r.status === 'approved').length,
        lastSubmission: studentReports.length > 0 ? studentReports[0].submitted_at : null
      };
    });

    const dashboardStats = {
      totalStudents: students.length,
      pendingReports: reports.filter(r => r.status === 'pending').length,
      totalReports: reports.length,
      approvedReports: reports.filter(r => r.status === 'approved').length
    };

    console.log('Dashboard data loaded:', {
      students: students.length,
      reports: reports.length,
      recentReports: recentReports.length
    });

    res.render('layouts/main', {
      title: 'Supervisor Dashboard',
      view: '../supervisor/dashboard',
      user: req.session.user,
      students,
      recentReports,
      stats: dashboardStats
    });

  } catch (error) {
    console.error('Dashboard Controller Error:', error);
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

// GET Student Reports
const getStudentReports = (req, res) => {
  try {
    const { studentId } = req.params;
    const supervisorId = req.session.user?.id;

    if (!studentId || !supervisorId) {
      req.flash('error', 'Invalid request parameters.');
      return res.redirect('/supervisor/dashboard');
    }

    const assignment = db.prepare(`
      SELECT s.full_name AS student_name, s.email AS student_email, s.department, s.level,
      COALESCE(s.registration_number, 'N/A') as registration_number
      FROM student_supervisor_assignments a
      LEFT JOIN users s ON s.id = a.student_id
      WHERE a.student_id = ? AND a.supervisor_id = ? AND a.is_active = 1
    `).get(studentId, supervisorId);

    if (!assignment) {
      req.flash('error', 'Student not found or not assigned to you.');
      return res.redirect('/supervisor/dashboard');
    }

    const reports = db.prepare(`
      SELECT r.*, COUNT(f.id) as feedback_count
      FROM reports r
      LEFT JOIN feedback f ON f.report_id = r.id
      WHERE r.student_id = ?
      GROUP BY r.id
      ORDER BY 
        CASE r.report_stage 
          WHEN 'progress_1' THEN 1
          WHEN 'progress_2' THEN 2
          WHEN 'progress_3' THEN 3
          WHEN 'final' THEN 4
          ELSE 5
        END,
        r.submitted_at DESC
    `).all(studentId);

    const reportStats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      approved: reports.filter(r => r.status === 'approved').length,
      withFeedback: reports.filter(r => r.feedback_count > 0).length
    };

    res.render('layouts/main', {
      title: `Student Reports - ${assignment.student_name}`,
      view: '../supervisor/student-reports',
      user: req.session.user,
      student: assignment,
      reports,
      stats: reportStats
    });

  } catch (error) {
    console.error('Student Reports Error:', error);
    req.flash('error', 'Failed to load student reports.');
    res.redirect('/supervisor/dashboard');
  }
};

// GET Report Details
const getReportDetails = (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!id || !supervisorId) {
      req.flash('error', 'Invalid request parameters.');
      return res.redirect('/supervisor/dashboard');
    }

    const report = db.prepare(`
      SELECT r.*, s.full_name AS student_name, s.email AS student_email, s.level AS student_level,
             COALESCE(s.registration_number, 'N/A') as registration_number
      FROM reports r
      LEFT JOIN users s ON s.id = r.student_id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      req.flash('error', 'Report not found or you are not authorized to view it.');
      return res.redirect('/supervisor/dashboard');
    }

    const feedback = db.prepare(`
      SELECT f.*, u.full_name AS supervisor_name
      FROM feedback f
      LEFT JOIN users u ON u.id = f.supervisor_id
      WHERE f.report_id = ? 
      ORDER BY f.created_at DESC
    `).all(id);

    const stageMap = { progress_1: 'progress_2', progress_2: 'progress_3', progress_3: 'final' };
    const nextStage = stageMap[report.report_stage];

    // Add config for the template
    const config = {
      editableFormats: FILE_CONFIG.EDITABLE_EXTENSIONS
    };

    res.render('layouts/main', {
      title: `Report Review - ${report.title}`,
      view: '../supervisor/report-details',
      user: req.session.user,
      report,
      feedback,
      nextStage,
      config: config
    });

  } catch (error) {
    console.error('Report Details Error:', error);
    req.flash('error', 'Failed to load report details.');
    res.redirect('/supervisor/dashboard');
  }
};

// POST Feedback
const postFeedback = async (req, res) => {
  try {
    const { reportId, comment, action } = req.body;
    const supervisorId = req.session.user?.id;

    if (!reportId || !action) {
      req.flash('error', 'Missing required fields.');
      return res.redirect('/supervisor/dashboard');
    }

    const report = db.prepare('SELECT * FROM reports WHERE id = ? AND supervisor_id = ?')
      .get(reportId, supervisorId);

    if (!report) {
      req.flash('error', 'Report not found or unauthorized.');
      return res.redirect('/supervisor/dashboard');
    }

    db.prepare(`
      INSERT INTO feedback (report_id, supervisor_id, comment, action_taken)
      VALUES (?, ?, ?, ?)
    `).run(reportId, supervisorId, comment || '', action);

    let newStatus = 'feedback_given';
    if (action === 'approve') newStatus = 'approved';
    else if (action === 'reject') newStatus = 'rejected';
    else if (action === 'request_reupload') newStatus = 'reupload_requested';

    db.prepare("UPDATE reports SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newStatus, reportId);

    await logActivity(supervisorId, `Provided feedback (${action}) for report`, 'report', reportId);

    // Send email notification
    const student = db.prepare('SELECT * FROM users WHERE id = ?').get(report.student_id);
    const supervisor = db.prepare('SELECT * FROM users WHERE id = ?').get(supervisorId);

    if (student?.email) {
      const subject = `📄 Feedback on Your Report: "${report.title}"`;
      const statusText =
        action === 'approve' ? '✅ Approved' :
        action === 'reject' ? '❌ Rejected' :
        '💬 Feedback Given';

      const html = `
        <div style="font-family: Arial, sans-serif; color:#333;">
          <h3>${statusText} by Supervisor</h3>
          <p><strong>Report:</strong> ${report.title}</p>
          <p><strong>Comment:</strong> ${comment || 'No comment'}</p>
          <p><strong>Supervisor:</strong> ${supervisor.full_name}</p>
          <p>Visit your dashboard to view more details.</p>
        </div>
      `;

      await sendEmail(student.email, subject, html);
    }

    req.flash('success', 'Feedback submitted successfully.');
    res.redirect(`/supervisor/reports/${reportId}`);

  } catch (error) {
    console.error('Post Feedback Error:', error);
    req.flash('error', 'Failed to submit feedback.');
    res.redirect('/supervisor/dashboard');
  }
};

// PUT Move Report to Next Stage
const moveToNextStage = (req, res) => {
  try {
    const { reportId } = req.params;
    const supervisorId = req.session.user?.id;

    if (!reportId) {
      return res.status(400).json({ error: 'Report ID missing' });
    }

    const report = db.prepare('SELECT * FROM reports WHERE id = ? AND supervisor_id = ?')
      .get(reportId, supervisorId);

    if (!report) {
      return res.status(404).json({ error: 'Report not found or unauthorized' });
    }

    const stageMap = { progress_1: 'progress_2', progress_2: 'progress_3', progress_3: 'final' };
    const nextStage = stageMap[report.report_stage];

    if (!nextStage) {
      return res.status(400).json({ error: 'Report cannot move to next stage' });
    }

    db.prepare("UPDATE reports SET report_stage = ?, updated_at = datetime('now') WHERE id = ?")
      .run(nextStage, reportId);

    logActivity(supervisorId, `Moved report to next stage: ${nextStage}`, 'report', reportId);

    return res.json({ success: true, nextStage });

  } catch (error) {
    console.error('Move to Next Stage Error:', error);
    return res.status(500).json({ error: 'Failed to move report to next stage' });
  }
};

// FILE OPERATIONS

// GET File content for editing
const getFileContent = (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!id || !supervisorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const report = db.prepare(`
      SELECT r.file_url, r.file_name 
      FROM reports r 
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    // Check if file exists
    try {
      fs.accessSync(report.file_url);
    } catch (error) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    const fileExtension = FileUtils.getFileExtension(report.file_name);
    
    // For non-text files, send appropriate response
    if (!FileUtils.isEditableFile(fileExtension)) {
      return res.status(400).json({ 
        error: 'File format not viewable in editor',
        redirect: `/supervisor/files/download/${id}`
      });
    }

    // Read file content
    const content = fs.readFileSync(report.file_url, 'utf8');
    
    // Log the view activity
    logActivity(supervisorId, `Viewed file: ${report.file_name}`, 'file', id);

    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(content, 'utf8'),
      'X-File-Name': report.file_name,
      'X-File-Extension': fileExtension
    });

    res.send(content);

  } catch (error) {
    console.error('Get File Content Error:', error);
    res.status(500).json({ 
      error: 'Failed to read file'
    });
  }
};

// PUT Update file content
const updateFileContent = (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;
    const content = req.body;

    if (!id || !supervisorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Invalid content format' });
    }

    const report = db.prepare(`
      SELECT r.file_url, r.file_name 
      FROM reports r 
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    // Check if file is editable
    const fileExtension = FileUtils.getFileExtension(report.file_name);
    if (!FileUtils.isEditableFile(fileExtension)) {
      return res.status(400).json({ error: 'File format not editable' });
    }

    // Create backup before modification
    const backupPath = `${report.file_url}.backup_${Date.now()}`;
    try {
      fs.copyFileSync(report.file_url, backupPath);
    } catch (backupError) {
      console.warn('Could not create backup:', backupError.message);
    }

    // Write new content
    fs.writeFileSync(report.file_url, content, 'utf8');

    // Update file size in database
    const stats = fs.statSync(report.file_url);
    db.prepare(
      "UPDATE reports SET file_size = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(stats.size, id);

    // Log the activity
    logActivity(supervisorId, `Updated file content: ${report.file_name}`, 'file', id);

    res.json({ 
      success: true, 
      message: 'File updated successfully',
      timestamp: new Date().toISOString(),
      fileSize: FileUtils.formatFileSize(stats.size)
    });

  } catch (error) {
    console.error('Update File Content Error:', error);
    res.status(500).json({ 
      error: 'Failed to update file'
    });
  }
};

// GET Download file
const downloadFile = (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    console.log('Download request - Report ID:', id, 'Supervisor ID:', supervisorId);

    const report = db.prepare(`
      SELECT r.file_url, r.file_name, r.mime_type
      FROM reports r 
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      console.log('Report not found for supervisor');
      return res.status(404).render('error', {
        message: 'File not found or you are not authorized to download it.',
        error: { status: 404, stack: '' }
      });
    }

    console.log('Report found:', report.file_name, 'at URL:', report.file_url);

    // Check if file exists
    try {
      fs.accessSync(report.file_url);
      console.log('File exists and is accessible');
    } catch (error) {
      console.log('File access error:', error.message);
      return res.status(404).render('error', {
        message: 'File not found on server. It may have been moved or deleted.',
        error: { status: 404, stack: '' }
      });
    }

    const fileExtension = FileUtils.getFileExtension(report.file_name);
    const mimeType = FileUtils.getMimeType(fileExtension);
    const sanitizedFileName = FileUtils.sanitizeFileName(report.file_name);

    console.log('Setting headers for download:', {
      mimeType,
      fileName: sanitizedFileName
    });

    // Set headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
    res.setHeader('X-File-Name', sanitizedFileName);

    // Get file stats
    const stats = fs.statSync(report.file_url);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    console.log('Starting file stream...');

    // Stream file to response
    const fileStream = fs.createReadStream(report.file_url);
    
    fileStream.on('open', () => {
      console.log('File stream opened successfully');
    });
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        return res.status(500).render('error', {
          message: 'Error reading file during download',
          error: { status: 500, stack: '' }
        });
      }
    });

    fileStream.pipe(res);

    // Log download activity
    logActivity(supervisorId, `Downloaded file: ${report.file_name}`, 'file', id);

  } catch (error) {
    console.error('Download File Error:', error);
    
    if (res.headersSent) {
      console.log('Headers already sent, cannot render error page');
      return;
    }
    
    res.status(500).render('error', {
      message: 'Failed to download file. Please try again.',
      error: process.env.NODE_ENV === 'development' ? { status: 500, stack: error.stack } : { status: 500, stack: '' }
    });
  }
};

// GET File information
const getFileInfo = (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!id || !supervisorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const report = db.prepare(`
      SELECT 
        r.*,
        s.full_name as student_name,
        sup.full_name as supervisor_name,
        (SELECT COUNT(*) FROM feedback f WHERE f.report_id = r.id) as feedback_count
      FROM reports r
      LEFT JOIN users s ON s.id = r.student_id
      LEFT JOIN users sup ON sup.id = r.supervisor_id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    // Get file stats
    let fileStats = {};
    try {
      const stats = fs.statSync(report.file_url);
      fileStats = {
        size: FileUtils.formatFileSize(stats.size),
        modified: stats.mtime,
        created: stats.birthtime,
        exists: true
      };
    } catch (error) {
      fileStats.exists = false;
    }

    res.json({
      success: true,
      file: {
        id: report.id,
        title: report.title,
        fileName: report.file_name,
        fileSize: FileUtils.formatFileSize(report.file_size),
        mimeType: report.mime_type,
        reportStage: report.report_stage,
        status: report.status,
        studentName: report.student_name,
        supervisorName: report.supervisor_name,
        submittedAt: report.submitted_at,
        feedbackCount: report.feedback_count,
        isEditable: FileUtils.isEditableFile(FileUtils.getFileExtension(report.file_name)),
        fileStats: fileStats
      }
    });

  } catch (error) {
    console.error('Get File Info Error:', error);
    res.status(500).json({ 
      error: 'Failed to get file information'
    });
  }
};

// GET File preview
const getFilePreview = (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!id || !supervisorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const report = db.prepare(`
      SELECT r.file_url, r.file_name, r.mime_type
      FROM reports r 
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    const fileExtension = FileUtils.getFileExtension(report.file_name);
    const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];

    if (!previewableTypes.includes(fileExtension)) {
      return res.status(400).json({ error: 'File type not previewable' });
    }

    // Check if file exists
    try {
      fs.accessSync(report.file_url);
    } catch (error) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    const mimeType = FileUtils.getMimeType(fileExtension);
    res.setHeader('Content-Type', mimeType);
    
    if (fileExtension === 'pdf') {
      res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    const fileStream = fs.createReadStream(report.file_url);
    fileStream.pipe(res);

    logActivity(supervisorId, `Previewed file: ${report.file_name}`, 'file', id);

  } catch (error) {
    console.error('File Preview Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate file preview'
    });
  }
};

module.exports = {
  getDashboard,
  getStudentReports,
  getReportDetails,
  postFeedback,
  moveToNextStage,
  // File operations
  getFileContent,
  updateFileContent,
  downloadFile,
  getFileInfo,
  getFilePreview
};