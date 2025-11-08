// email.js
const nodemailer = require('nodemailer');

// Create a transporter object
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,  // required for port 465
  auth: {
    user: 'facultyofcomputingbuk@gmail.com',
    pass: 'ndlqywycuvchfkhr',
  },
  tls: {
    rejectUnauthorized: false,
  }
});

// Function to send an email
async function sendEmail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Project Submission System, Faculty of Computing, BUK" <${process.env.EMAIL_USER || 'facultyofcomputingbuk@gmail.com'}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('✅ Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

module.exports = sendEmail;
