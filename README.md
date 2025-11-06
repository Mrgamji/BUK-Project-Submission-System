# Project Submission Reporting System

A full-stack Node.js + Express.js application for managing project submissions with multiple user roles.

## Features

### User Roles

1. **General Admin**
   - Add/edit/delete Level Coordinators
   - View activity logs
   - Oversee entire system

2. **Level Coordinator**
   - Assign students to supervisors
   - View progress reports of all students in their level
   - Manage supervisor-student relationships

3. **Head of Department (HOD)**
   - View progress of all students in department
   - View all supervisors and assigned students
   - Provide high-level feedback on reports

4. **Supervisor**
   - View dashboard with assigned students
   - Download student report uploads
   - Provide feedback and comments
   - Approve, reject, or request reuploads
   - Move students to next report stage

5. **Student**
   - Upload progress reports (multiple stages)
   - View supervisor feedback
   - Reupload after making changes
   - Track report status

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Express sessions
- **File Uploads**: Multer
- **Templating**: EJS
- **Styling**: Bootstrap 5 + Bootstrap Icons

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create sample users:
```bash
node server/utils/seedData.js
```

3. Start the server:
```bash
npm run dev
```

The application will run on `http://localhost:3000`

## Sample Login Credentials

After seeding the database, you can login with:

- **Admin**: admin@example.com / password123
- **Level Coordinator**: coordinator@example.com / password123
- **HOD**: hod@example.com / password123
- **Supervisor**: supervisor@example.com / password123
- **Student**: student@example.com / password123

## Report Stages

Students can submit reports in 4 stages:
1. Progress Report 1
2. Progress Report 2
3. Progress Report 3
4. Final Report

## File Upload

Supported formats:
- PDF (.pdf)
- Word Documents (.doc, .docx)
- Images (.jpg, .jpeg, .png)

Maximum file size: 10MB

## Database Schema

The system uses the following tables:
- `users` - All user accounts with roles
- `student_supervisor_assignments` - Links students to supervisors
- `reports` - Project progress reports
- `feedback` - Supervisor feedback on reports
- `hod_feedback` - HOD feedback on reports
- `activity_logs` - System activity audit trail

## Workflow

1. **Admin** creates Level Coordinators
2. **Level Coordinator** assigns students to supervisors
3. **Student** uploads progress reports
4. **Supervisor** reviews, provides feedback, and approves/rejects
5. **HOD** oversees department progress and provides additional feedback
6. **Student** views feedback and reuploads if needed
7. **Supervisor** moves approved reports to next stage

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Role-based access control (RBAC)
- Row Level Security (RLS) on database
- File upload validation
- Secure file storage

## Project Structure

```
server/
├── config/          # Database configuration
├── controllers/     # Route controllers for each role
├── middleware/      # Authentication & authorization
├── routes/          # Express routes
├── utils/           # Helper utilities
├── views/           # EJS templates
│   ├── admin/
│   ├── coordinator/
│   ├── hod/
│   ├── supervisor/
│   ├── student/
│   ├── auth/
│   ├── layouts/
│   └── partials/
└── index.js         # Main server file
```

## License

MIT
