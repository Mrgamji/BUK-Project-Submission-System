const fs = require('fs');
const path = require('path');
const db = require('../config/database');

// Add missing logActivity function
const logActivity = (userId, action, resourceType, resourceId = null) => {
  try {
    db.prepare(`
      INSERT INTO activity_logs (user_id, action, resource_type, resource_id, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, action, resourceType, resourceId);
  } catch (error) {
    console.error('Activity logging error:', error);
  }
};

// File Configuration
const FILE_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024,
  ALLOWED_EXTENSIONS: ['pdf', 'txt', 'doc', 'docx', 'js', 'html', 'css', 'md', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar'],
  EDITABLE_EXTENSIONS: ['txt', 'js', 'html', 'css', 'md', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'php'],
  CODE_EXTENSIONS: ['js', 'html', 'css', 'py', 'java', 'cpp', 'c', 'php', 'xml', 'json'],
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
    if (!filename) return '';
    return filename.toLowerCase().split('.').pop();
  },

  isEditableFile(extension) {
    return FILE_CONFIG.EDITABLE_EXTENSIONS.includes(extension);
  },

  isCodeFile(extension) {
    return FILE_CONFIG.CODE_EXTENSIONS.includes(extension);
  },

  isPdfFile(extension) {
    return extension === 'pdf';
  },

  isImageFile(extension) {
    return ['jpg', 'jpeg', 'png', 'gif'].includes(extension);
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

  detectLanguage(extension) {
    const languageMap = {
      'js': 'javascript',
      'html': 'html',
      'css': 'css',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'php': 'php',
      'xml': 'xml',
      'json': 'json',
      'md': 'markdown',
      'txt': 'plaintext'
    };
    return languageMap[extension] || 'plaintext';
  }
};

const getFileView = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Simple file path resolution
    const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
    
    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      return res.status(404).json({ 
        error: 'Uploads directory not found'
      });
    }

    // Get all files in uploads directory
    const availableFiles = fs.readdirSync(uploadsDir);
    console.log('Available files:', availableFiles);

    // Try to find file by ID pattern
    let targetFile = availableFiles.find(file => file.includes(id));

    if (!targetFile) {
      return res.status(404).json({ 
        error: 'File not found',
        availableFiles: availableFiles
      });
    }

    const filePath = path.join(uploadsDir, targetFile);
    const fileExtension = FileUtils.getFileExtension(targetFile);

    console.log('Using file:', {
      filePath,
      targetFile,
      fileExtension
    });

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found on server'
      });
    }

    // Get file stats
    const fileStats = fs.statSync(filePath);

    // For PDF files, we need to provide the correct URL for the PDF.js viewer
    let fileContent = '';
    let fileLanguage = 'plaintext';
    
    if (FileUtils.isEditableFile(fileExtension)) {
      try {
        fileContent = fs.readFileSync(filePath, 'utf8');
        fileLanguage = FileUtils.detectLanguage(fileExtension);
      } catch (readError) {
        console.error('Error reading file:', readError);
        fileContent = 'Unable to read file content';
      }
    }

    // Use the actual file name for display
    const displayName = targetFile.replace(/^\d+-/, ''); // Remove timestamp prefix

    // Render the file viewer page with CORRECT PDF URL
    res.render('layouts/main', {
      title: `View File - ${displayName}`,
      view: '../supervisor/fileviewer',
      user: req.session.user,
      file: {
        id: id,
        name: displayName,
        originalName: targetFile,
        title: displayName.replace(/\.[^/.]+$/, ""), // Remove extension for title
        studentName: 'Student',
        extension: fileExtension,
        content: fileContent,
        language: fileLanguage,
        isEditable: FileUtils.isEditableFile(fileExtension),
        isCode: FileUtils.isCodeFile(fileExtension),
        isPdf: FileUtils.isPdfFile(fileExtension),
        isImage: FileUtils.isImageFile(fileExtension),
        downloadUrl: `/supervisor/files/download/${id}`,
        // FIX: Use direct public URL for PDF files
        pdfDirectUrl: `/uploads/reports/${targetFile}`, // This is the key fix!
        infoUrl: `/supervisor/files/info/${id}`,
        fileSize: FileUtils.formatFileSize(fileStats.size),
        modified: fileStats.mtime
      }
    });

  } catch (error) {
    console.error('File View Error:', error);
    res.status(500).json({ 
      error: 'Failed to load file viewer'
    });
  }
};
// Update file content - FIXED
const updateFileContent = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;
    const { content } = req.body;

    if (!supervisorId) {
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

    // Resolve file path (same logic as getFileView)
    let filePath;
    if (report.file_url && report.file_url.startsWith('/uploads/')) {
      filePath = path.join(__dirname, '..', 'public', report.file_url);
    } else if (report.file_url) {
      filePath = report.file_url;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Check if file is editable
    const fileExtension = FileUtils.getFileExtension(report.file_name);
    if (!FileUtils.isEditableFile(fileExtension)) {
      return res.status(400).json({ error: 'File format not editable' });
    }

    // Create backup before modification
    const backupPath = `${filePath}.backup_${Date.now()}`;
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch (backupError) {
      console.warn('Could not create backup:', backupError.message);
    }

    // Write new content
    fs.writeFileSync(filePath, content, 'utf8');

    // Update file size in database
    const stats = fs.statSync(filePath);
    db.prepare(
      "UPDATE reports SET file_size = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(stats.size, id);

    // Log the activity
    logActivity(supervisorId, `Updated file content: ${report.file_name}`, 'file', id);

    res.json({ 
      success: true, 
      message: 'File updated successfully',
      timestamp: new Date().toISOString(),
      fileSize: FileUtils.formatFileSize(stats.size),
      backupCreated: fs.existsSync(backupPath)
    });

  } catch (error) {
    console.error('Update File Content Error:', error);
    res.status(500).json({ 
      error: 'Failed to update file'
    });
  }
};

// Download file - FIXED
const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    const report = db.prepare(`
      SELECT r.*, u.full_name as student_name
      FROM reports r 
      INNER JOIN users u ON r.student_id = u.id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).render('error', {
        message: 'File not found or you are not authorized to download it.',
        error: { status: 404, stack: '' }
      });
    }

    // Resolve file path (same logic as getFileView)
    let filePath;
    if (report.file_url && report.file_url.startsWith('/uploads/')) {
      filePath = path.join(__dirname, '..', 'public', report.file_url);
    } else if (report.file_url) {
      filePath = report.file_url;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).render('error', {
        message: 'File not found on server. It may have been moved or deleted.',
        error: { status: 404, stack: '' }
      });
    }

    const fileExtension = FileUtils.getFileExtension(report.file_name);
    const mimeType = FileUtils.getMimeType(fileExtension);
    const sanitizedFileName = report.file_name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // Get file stats
    const stats = fs.statSync(filePath);

    // Set headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    // Stream file to response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Log download activity
    logActivity(supervisorId, `Downloaded file: ${report.file_name}`, 'file', id);

  } catch (error) {
    console.error('Download File Error:', error);
    res.status(500).render('error', {
      message: 'Failed to download file. Please try again.',
      error: { status: 500, stack: '' }
    });
  }
};

// Get file information - FIXED
const getFileInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const report = db.prepare(`
      SELECT 
        r.*,
        s.full_name as student_name,
        sup.full_name as supervisor_name
      FROM reports r
      LEFT JOIN users s ON s.id = r.student_id
      LEFT JOIN users sup ON sup.id = r.supervisor_id
      WHERE r.id = ? AND r.supervisor_id = ?
    `).get(id, supervisorId);

    if (!report) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    // Get file stats and detect MIME type
    const fileExtension = FileUtils.getFileExtension(report.file_name);
    const mimeType = FileUtils.getMimeType(fileExtension);
    
    // Resolve file path
    let filePath;
    if (report.file_url && report.file_url.startsWith('/uploads/')) {
      filePath = path.join(__dirname, '..', 'public', report.file_url);
    } else if (report.file_url) {
      filePath = report.file_url;
    }

    let fileStats = {};
    try {
      const stats = fs.statSync(filePath);
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
        fileSize: FileUtils.formatFileSize(report.file_size || 0),
        mimeType: mimeType,
        reportStage: report.report_stage,
        status: report.status,
        studentName: report.student_name,
        supervisorName: report.supervisor_name,
        submittedAt: report.submitted_at,
        isEditable: FileUtils.isEditableFile(fileExtension),
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

// Get file preview - FIXED
const getFilePreview = async (req, res) => {
  try {
    const { id } = req.params;
    const supervisorId = req.session.user?.id;

    if (!supervisorId) {
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

    const fileExtension = FileUtils.getFileExtension(report.file_name);
    const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];

    if (!previewableTypes.includes(fileExtension)) {
      return res.status(400).json({ error: 'File type not previewable' });
    }

    // Resolve file path
    let filePath;
    if (report.file_url && report.file_url.startsWith('/uploads/')) {
      filePath = path.join(__dirname, '..', 'public', report.file_url);
    } else if (report.file_url) {
      filePath = report.file_url;
    }

    // Check if file exists
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    const mimeType = FileUtils.getMimeType(fileExtension);
    res.setHeader('Content-Type', mimeType);
    
    if (fileExtension === 'pdf') {
      res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    const fileStream = fs.createReadStream(filePath);
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
  getFileView,
  updateFileContent,
  downloadFile,
  getFileInfo,
  getFilePreview
};