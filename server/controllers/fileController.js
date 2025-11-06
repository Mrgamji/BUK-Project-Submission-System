const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { logActivity } = require('../utils/logger');

// Configuration
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

// File Controller
const FileController = {
  /**
   * Get file content for viewing/editing (supervisors)
   */
  getFileContent(req, res) {
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

      try {
        fs.accessSync(report.file_url);
      } catch {
        return res.status(404).json({ error: 'File not found on server' });
      }

      const fileExtension = FileUtils.getFileExtension(report.file_name);

      if (!FileUtils.isEditableFile(fileExtension)) {
        return res.status(400).json({ 
          error: 'File format not viewable in editor',
          redirect: `/supervisor/files/download/${id}`
        });
      }

      const content = fs.readFileSync(report.file_url, 'utf8');
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
      res.status(500).json({ error: 'Failed to read file' });
    }
  },

  /**
   * Update file content (supervisors)
   */
  updateFileContent(req, res) {
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

      const fileExtension = FileUtils.getFileExtension(report.file_name);
      if (!FileUtils.isEditableFile(fileExtension)) {
        return res.status(400).json({ error: 'File format not editable' });
      }

      const backupPath = `${report.file_url}.backup_${Date.now()}`;
      try {
        fs.copyFileSync(report.file_url, backupPath);
      } catch (backupError) {
        console.warn('Could not create backup:', backupError.message);
      }

      fs.writeFileSync(report.file_url, content, 'utf8');

      const stats = fs.statSync(report.file_url);
      db.prepare(
        "UPDATE reports SET file_size = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(stats.size, id);

      logActivity(supervisorId, `Updated file content: ${report.file_name}`, 'file', id);

      res.json({ 
        success: true, 
        message: 'File updated successfully',
        timestamp: new Date().toISOString(),
        fileSize: FileUtils.formatFileSize(stats.size)
      });

    } catch (error) {
      console.error('Update File Content Error:', error);
      res.status(500).json({ error: 'Failed to update file' });
    }
  },

  /**
   * Download file (supervisors)
   */
  downloadFile(req, res) {
    try {
      const { id } = req.params;
      const supervisorId = req.session.user?.id;

      if (!supervisorId) {
        return res.status(401).render('error', { message: 'Authentication required', error: { status: 401 } });
      }

      const report = db.prepare(`
        SELECT r.file_url, r.file_name
        FROM reports r 
        WHERE r.id = ? AND r.supervisor_id = ?
      `).get(id, supervisorId);

      if (!report) {
        return res.status(404).render('error', { message: 'File not found or unauthorized', error: { status: 404 } });
      }

      try {
        fs.accessSync(report.file_url);
      } catch {
        return res.status(404).render('error', { message: 'File not found on server', error: { status: 404 } });
      }

      const fileExtension = FileUtils.getFileExtension(report.file_name);
      const mimeType = FileUtils.getMimeType(fileExtension);
      const sanitizedFileName = FileUtils.sanitizeFileName(report.file_name);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);

      const stats = fs.statSync(report.file_url);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Last-Modified', stats.mtime.toUTCString());

      const fileStream = fs.createReadStream(report.file_url);
      fileStream.on('error', (error) => {
        console.error('File stream error:', error);
        if (!res.headersSent) {
          res.status(500).render('error', { message: 'Error streaming file', error: { status: 500 } });
        }
      });

      fileStream.pipe(res);
      logActivity(supervisorId, `Downloaded file: ${report.file_name}`, 'file', id);

    } catch (error) {
      console.error('Download File Error:', error);
      res.status(500).render('error', { message: 'Failed to download file', error: process.env.NODE_ENV === 'development' ? error : {} });
    }
  },

  /**
   * Get file information (supervisor/student)
   */
  getFileInfo(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;

      if (!id || !userId) return res.status(401).json({ error: 'Authentication required' });

      let report;
      if (userRole === 'supervisor') {
        report = db.prepare(`
          SELECT r.*, s.full_name AS student_name, sup.full_name AS supervisor_name,
          (SELECT COUNT(*) FROM feedback f WHERE f.report_id = r.id) AS feedback_count
          FROM reports r
          LEFT JOIN users s ON s.id = r.student_id
          LEFT JOIN users sup ON sup.id = r.supervisor_id
          WHERE r.id = ? AND r.supervisor_id = ?
        `).get(id, userId);
      } else if (userRole === 'student') {
        report = db.prepare(`
          SELECT r.*, s.full_name AS student_name, sup.full_name AS supervisor_name,
          (SELECT COUNT(*) FROM feedback f WHERE f.report_id = r.id) AS feedback_count
          FROM reports r
          LEFT JOIN users s ON s.id = r.student_id
          LEFT JOIN users sup ON sup.id = r.supervisor_id
          WHERE r.id = ? AND r.student_id = ?
        `).get(id, userId);
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!report) return res.status(404).json({ error: 'File not found or unauthorized' });

      let fileStats = {};
      try {
        const stats = fs.statSync(report.file_url);
        fileStats = {
          size: FileUtils.formatFileSize(stats.size),
          modified: stats.mtime,
          created: stats.birthtime,
          exists: true
        };
      } catch {
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
          fileStats
        }
      });

    } catch (error) {
      console.error('Get File Info Error:', error);
      res.status(500).json({ error: 'Failed to get file information' });
    }
  },

  /**
   * File preview (images/PDF)
   */
  getFilePreview(req, res) {
    try {
      const { id } = req.params;
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;

      if (!id || !userId) return res.status(401).json({ error: 'Authentication required' });

      let report;
      if (userRole === 'supervisor') {
        report = db.prepare(`SELECT r.file_url, r.file_name FROM reports r WHERE r.id = ? AND r.supervisor_id = ?`).get(id, userId);
      } else if (userRole === 'student') {
        report = db.prepare(`SELECT r.file_url, r.file_name FROM reports r WHERE r.id = ? AND r.student_id = ?`).get(id, userId);
      } else {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!report) return res.status(404).json({ error: 'File not found or unauthorized' });

      const fileExtension = FileUtils.getFileExtension(report.file_name);
      const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];

      if (!previewableTypes.includes(fileExtension)) return res.status(400).json({ error: 'File type not previewable' });

      try { fs.accessSync(report.file_url); } catch { return res.status(404).json({ error: 'File not found on server' }); }

      const mimeType = FileUtils.getMimeType(fileExtension);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', fileExtension === 'pdf' ? 'inline; filename="preview.pdf"' : 'inline');

      const fileStream = fs.createReadStream(report.file_url);
      fileStream.pipe(res);
      logActivity(userId, `Previewed file: ${report.file_name}`, 'file', id);

    } catch (error) {
      console.error('File Preview Error:', error);
      res.status(500).json({ error: 'Failed to generate file preview' });
    }
  }
};

module.exports = FileController;
