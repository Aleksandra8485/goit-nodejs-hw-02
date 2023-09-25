const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_LOGIN,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendVerificationEmail = (email, verificationToken) => {
  const verificationLink = `http://localhost:3000/api/users/verify/${verificationToken}`; // Używaj 3002 jeśli to jest poprawny port serwera
  const mailOptions = {
    from: process.env.EMAIL_LOGIN,
    to: email,
    subject: "Weryfikacja adresu email",
    text: `Kliknij w poniższy link, aby zweryfikować swój adres email: ${verificationLink}`,
  };
  console.log(verificationLink);
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

module.exports = {
  sendVerificationEmail,
};
