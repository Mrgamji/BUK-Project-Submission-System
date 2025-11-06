# Getting Started Guide

## Quick Start

1. **Install dependencies** (already done):
```bash
npm install
```

2. **Seed the database with sample users** (already done):
```bash
node server/utils/seedData.js
```

3. **Start the development server**:
```bash
npm run dev
```

4. **Access the application**:
Open your browser to `http://localhost:3000`

## Login Credentials

Use these sample accounts to test different roles:

### Admin Account
- **Email**: admin@example.com
- **Password**: password123
- **Can do**: Create level coordinators, view activity logs, manage system

### Level Coordinator Account
- **Email**: coordinator@example.com
- **Password**: password123
- **Can do**: Assign students to supervisors, view progress for 400 Level

### HOD Account
- **Email**: hod@example.com
- **Password**: password123
- **Can do**: View all students and reports in Computer Science department

### Supervisor Account
- **Email**: supervisor@example.com
- **Password**: password123
- **Can do**: Review student reports, provide feedback, approve/reject submissions

### Student Account
- **Email**: student@example.com
- **Password**: password123
- **Can do**: Upload reports, view feedback, reupload revised versions

## Testing the Workflow

### Step 1: Assign Student to Supervisor
1. Login as **coordinator@example.com**
2. Go to Dashboard
3. Find the student "John Doe"
4. Click "Assign" and select "Dr. John Smith" as supervisor
5. Logout

### Step 2: Student Uploads Report
1. Login as **student@example.com**
2. Click "Upload Report" from sidebar
3. Fill in:
   - Title: "Literature Review"
   - Stage: Progress Report 1
   - Upload a PDF/DOC file
4. Submit

### Step 3: Supervisor Reviews Report
1. Login as **supervisor@example.com**
2. View the pending report on dashboard
3. Click "Review" on the report
4. Download and review the file
5. Provide feedback:
   - Enter comments
   - Choose action (Comment/Request Reupload/Approve/Reject)
6. Submit feedback

### Step 4: Student Views Feedback
1. Login as **student@example.com**
2. View the report from dashboard
3. Read supervisor feedback
4. If needed, click "Reupload" to submit revised version

### Step 5: HOD Oversight
1. Login as **hod@example.com**
2. View all department reports
3. Click on any report to see details
4. Optionally provide high-level feedback

### Step 6: Admin Monitoring
1. Login as **admin@example.com**
2. View all level coordinators
3. Check activity logs to see system usage
4. Add new coordinators as needed

## Key Features to Test

### For Students
- Upload reports in different stages (Progress 1, 2, 3, Final)
- View feedback timeline
- Reupload after revisions
- Track submission status

### For Supervisors
- Manage multiple students
- Download submitted reports
- Provide detailed feedback
- Approve reports and move to next stage
- Track pending reviews

### For Level Coordinators
- Assign/reassign students to supervisors
- View progress overview for entire level
- Monitor all submissions in their level

### For HODs
- Department-wide overview
- Filter reports by status or supervisor
- Provide strategic feedback
- Monitor supervisor workload

### For Admins
- Create and manage level coordinators
- View complete activity logs
- System-wide statistics
- User management

## File Upload Notes

- Supported formats: PDF, DOC, DOCX, JPG, PNG
- Maximum file size: 10MB
- Files are stored in the `uploads/` directory
- Each reupload creates a new version

## Report Stages

1. **Progress Report 1** - Initial submission
2. **Progress Report 2** - Mid-term progress
3. **Progress Report 3** - Near completion
4. **Final Report** - Final submission

## Status Types

- **Pending** - Awaiting supervisor review
- **Feedback Given** - Supervisor has commented (student can reupload)
- **Approved** - Supervisor approved the report
- **Rejected** - Major revisions needed (student must reupload)

## Troubleshooting

### Port Already in Use
If port 3000 is busy, edit `server/index.js` and change the PORT variable.

### File Upload Issues
Ensure the `uploads/` directory exists and has write permissions.

### Session Issues
Sessions are stored in memory. Restart the server if you have login issues.

### Database Connection
Check that `.env` file has correct Supabase credentials.

## Additional Users

To create additional test users, you can:
1. Register as a student (click "Register as Student" on login page)
2. Use admin account to create more coordinators
3. Manually insert other roles via Supabase dashboard

## Need Help?

- Check the README.md for architecture details
- Review the code in `server/` directory
- Check browser console for client-side errors
- Check terminal for server-side errors
