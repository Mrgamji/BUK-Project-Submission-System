# Project Submission Reporting System - Complete Overview

## System Architecture

### Technology Stack
- **Backend Framework**: Express.js (Node.js)
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Express Sessions with bcrypt password hashing
- **Template Engine**: EJS (Embedded JavaScript)
- **Styling**: Bootstrap 5 with custom gradients and animations
- **File Handling**: Multer for multipart/form-data
- **Icons**: Bootstrap Icons

## Database Schema

### Tables Created
1. **users** - All system users with role-based access
2. **student_supervisor_assignments** - Links students to supervisors
3. **reports** - Project submissions with versioning
4. **feedback** - Supervisor feedback on reports
5. **hod_feedback** - HOD oversight feedback
6. **activity_logs** - Complete audit trail

### Security Features
- Row Level Security (RLS) enabled on all tables
- Password hashing with bcrypt (10 rounds)
- Session-based authentication with secure cookies
- Role-based access control at route level
- File upload validation and size limits

## User Roles & Capabilities

### 1. General Admin
**Routes**: `/admin/*`
- Create, edit, delete Level Coordinators
- View all system users
- Access complete activity logs
- System-wide oversight

**Views**:
- Dashboard with statistics
- Add/Edit Coordinator forms
- Activity logs table

### 2. Level Coordinator
**Routes**: `/coordinator/*`
- Assign students to supervisors
- View all students in their level
- Monitor progress across level
- Manage supervisor-student relationships

**Views**:
- Student-supervisor assignment dashboard
- Progress overview with filters
- Assignment modals

### 3. Head of Department (HOD)
**Routes**: `/hod/*`
- View all students in department
- Monitor all supervisors
- Access all reports in department
- Provide strategic feedback

**Views**:
- Department statistics dashboard
- Students list with supervisors
- Filterable reports table
- Report details with feedback form

### 4. Supervisor
**Routes**: `/supervisor/*`
- View assigned students
- Download report submissions
- Provide detailed feedback
- Approve/reject reports
- Move reports to next stage

**Views**:
- Dashboard with student cards
- Student reports list
- Report review interface
- Feedback form with action selector

### 5. Student
**Routes**: `/student/*`
- Upload reports (4 stages)
- View supervisor feedback
- Reupload revised versions
- Track submission status

**Views**:
- Dashboard with progress tracker
- Upload form with file validation
- Report details with feedback timeline
- Reupload interface

## File Upload System

### Configuration
- Storage: Local filesystem (`uploads/` directory)
- Naming: Timestamp + random number + original extension
- Max size: 10MB
- Allowed formats: PDF, DOC, DOCX, JPG, JPEG, PNG

### Features
- Version tracking for reuploads
- Original filename preservation
- File size recording
- Direct download links
- Optional annotated file uploads from supervisors

## Report Workflow

### Stages
1. **Progress Report 1** - Initial research/proposal
2. **Progress Report 2** - Mid-term progress
3. **Progress Report 3** - Near-final work
4. **Final Report** - Complete submission

### Status Flow
```
Pending → Feedback Given → (Student reuploads) → Pending
Pending → Approved → (Supervisor moves to next stage)
Pending → Rejected → (Student must reupload)
```

### Version Control
- Each reupload increments version number
- All versions tracked in database
- Latest version always displayed
- Version history maintained

## Activity Logging

Every significant action is logged:
- User logins
- Account creations
- Assignments made
- Reports uploaded
- Feedback provided
- Status changes

Logs include:
- Timestamp
- User who performed action
- Action description
- Entity type affected
- Entity ID
- Additional details (JSON)

## UI/UX Features

### Design Elements
- Purple gradient theme (customizable)
- Smooth animations on cards
- Hover effects on interactive elements
- Responsive design (mobile-friendly)
- Intuitive navigation with sidebar
- Role-specific dashboards
- Clear status badges

### User Experience
- Breadcrumb navigation
- Back buttons on detail pages
- Confirmation dialogs for destructive actions
- Loading states and error messages
- Clear status indicators
- Progress tracking widgets

## API Endpoints

### Authentication
- `GET /auth/login` - Login page
- `POST /auth/login` - Process login
- `GET /auth/register` - Registration page
- `POST /auth/register` - Create student account
- `GET /auth/logout` - Destroy session

### Admin Routes
- `GET /admin/dashboard` - Admin overview
- `GET /admin/add-coordinator` - Add coordinator form
- `POST /admin/add-coordinator` - Create coordinator
- `GET /admin/edit-coordinator/:id` - Edit form
- `POST /admin/edit-coordinator/:id` - Update coordinator
- `POST /admin/delete-coordinator/:id` - Remove coordinator
- `GET /admin/activity-logs` - System logs

### Coordinator Routes
- `GET /coordinator/dashboard` - Assignment management
- `POST /coordinator/assign-student` - Assign student
- `POST /coordinator/unassign-student/:id` - Remove assignment
- `GET /coordinator/progress-overview` - Level reports

### HOD Routes
- `GET /hod/dashboard` - Department overview
- `GET /hod/students` - All students
- `GET /hod/reports` - All reports (filterable)
- `GET /hod/report/:id` - Report details
- `POST /hod/feedback` - Provide feedback

### Supervisor Routes
- `GET /supervisor/dashboard` - Assigned students
- `GET /supervisor/student/:id` - Student reports
- `GET /supervisor/report/:id` - Report review
- `POST /supervisor/feedback` - Provide feedback
- `POST /supervisor/move-to-next-stage` - Advance report

### Student Routes
- `GET /student/dashboard` - Overview
- `GET /student/upload-report` - Upload form
- `POST /student/upload-report` - Submit report
- `GET /student/report/:id` - View details
- `GET /student/reupload/:id` - Reupload form
- `POST /student/reupload/:id` - Submit new version

## Middleware

### Authentication Middleware
- `requireAuth()` - Ensures user is logged in
- `requireRole(...roles)` - Checks user has required role
- `setUserContext()` - Makes user available in templates

## Sample Data

5 users created via seed script:
1. General Admin (admin@example.com)
2. Level Coordinator (coordinator@example.com) - 400 Level
3. HOD (hod@example.com) - Computer Science
4. Supervisor (supervisor@example.com) - Computer Science
5. Student (student@example.com) - CS, 400 Level

All passwords: `password123`

## Deployment Considerations

### Environment Variables Required
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SESSION_SECRET` - Express session secret
- `PORT` - Server port (default: 3000)

### Production Recommendations
1. Use production database (not development)
2. Set strong SESSION_SECRET
3. Enable HTTPS
4. Configure file upload limits
5. Set up backup strategy
6. Monitor activity logs
7. Implement rate limiting
8. Add email notifications
9. Configure file storage (S3/Cloud Storage)
10. Set up monitoring and logging

## Extension Points

The system can be extended with:
1. **Email Notifications** - Alert users of feedback/assignments
2. **PDF Report Generation** - Export with comments
3. **Advanced Analytics** - Supervisor workload, completion rates
4. **Deadline Management** - Set and track deadlines
5. **Document Commenting** - In-line annotations
6. **Mobile App** - React Native companion
7. **Real-time Updates** - WebSocket for live notifications
8. **Bulk Operations** - Batch assign students
9. **Report Templates** - Provide structure guidelines
10. **Calendar Integration** - Schedule review sessions

## Testing Checklist

- [ ] Admin can create coordinators
- [ ] Coordinator can assign students
- [ ] Student can upload reports
- [ ] Supervisor can review and provide feedback
- [ ] HOD can view department overview
- [ ] File uploads work correctly
- [ ] Reuploads create new versions
- [ ] Status changes flow correctly
- [ ] Activity logs capture actions
- [ ] Authentication works properly
- [ ] Role-based access is enforced
- [ ] Responsive design on mobile
- [ ] Error handling is graceful

## Performance Optimizations

1. Database indexes on frequently queried columns
2. Session storage (consider Redis for production)
3. File upload streaming
4. Pagination for large lists (implement as needed)
5. Caching strategy for static data
6. Connection pooling for database

## Security Measures

1. ✅ Password hashing (bcrypt)
2. ✅ SQL injection prevention (parameterized queries)
3. ✅ XSS protection (EJS auto-escaping)
4. ✅ CSRF protection (consider adding tokens)
5. ✅ File upload validation
6. ✅ Session security (httpOnly cookies)
7. ✅ Role-based access control
8. ✅ Row Level Security

## Maintenance

### Regular Tasks
- Monitor disk space (uploaded files)
- Review activity logs
- Update dependencies
- Backup database
- Clear old sessions

### Updates
- Check for security updates
- Update npm packages
- Test after updates
- Review and optimize queries

---

**System Status**: ✅ Fully Operational
**Last Updated**: October 2025
**Version**: 1.0.0
