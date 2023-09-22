const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Ustaw adres e-mail jako zmienną środowiskową
    pass: process.env.EMAIL_PASSWORD, // Ustaw hasło jako zmienną środowiskową
  },
});

module.exports = transporter;
