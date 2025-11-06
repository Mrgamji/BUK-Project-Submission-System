
// email.js
const nodemailer = require('nodemailer');

// Create a transporter object
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com', // e.g. Gmail SMTP
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for port 465, false for 587
  auth: {
    user: 'facultyofcomputingbuk@gmail.com', // your email
    pass: 'ndlq ywyc uvch fkhr', // your email password or app password
  },
});

// Function to send an email
async function sendEmail({ to, subject, text, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Project Submission System, Faculty of Computing, BUK" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = sendEmail;
