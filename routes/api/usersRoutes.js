const express = require("express");
const Joi = require("joi");
const bcrypt = require("bcrypt");
const User = require("../../services/users");
const router = express.Router();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const secret = process.env.SECRET;
const auth = require("../../auth");
const multer = require("multer");
const gravatar = require("gravatar");
const path = require("path");
const jimp = require("jimp");
const fs = require("fs/promises");
// const nodemailer = require("nodemailer");
const transporter = require("../../config/nodemailerConfig"); // Importuj wcześniej utworzony transporter
const uuid = require("uuid"); // Dodaj import dla uuid

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

// rejestracja
router.post("/signup", async (req, res) => {
  try {
    const { error } = signupSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: "Validation error" });
    }

    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(409).json({ message: "Email in use" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    // Generuj verificationToken
    const verificationToken = uuid.v4(); // Tutaj generujemy unikalny token

    // Dodaj generowanie URL avatara przy pomocy gravatar
    const avatarURL = gravatar.url(req.body.email, { s: "250" }, true);

    const user = new User({
      email: req.body.email,
      password: hashedPassword,
      subscription: "starter",
      avatarURL, // Dodaj avatarURL
      verificationToken, // Dodaj verificationToken do użytkownika
    });

    await user.save();

    // Po zapisaniu użytkownika
    const emailVerificationLink = `http://localhost:3000/verify?token=${user.token}`; // Tutaj użyj tokena użytkownika
    const mailOptions = {
      from: "MagMar80@gmail.com",
      to: user.email, // Adres e-mail użytkownika
      subject: "Potwierdzenie rejestracji",
      text: `Kliknij poniższy link, aby potwierdzić swoją rejestrację:\n${emailVerificationLink}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Błąd podczas wysyłania e-maila:", error);
      } else {
        console.log(
          "E-mail z linkiem do weryfikacji został wysłany:",
          info.response
        );
      }
    });

    res.status(201).json({
      user: {
        email: user.email,
        subscription: user.subscription,
        avatarURL: user.avatarURL, // Zwracamy również URL avatara
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// logowanie
router.post("/login", async (req, res) => {
  const { error } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Email or password is wrong" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: "Email or password is wrong" });
    }

    const payload = {
      id: user._id,
      email: user.email,
    };

    const token = jwt.sign(payload, secret, { expiresIn: "1h" });

    return res.status(200).json({
      token,
      user: {
        email: user.email,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Endpoint do weryfikacji emaila
router.get("/verify/:verificationToken", async (req, res) => {
  const { verificationToken } = req.params;

  try {
    // Znajdź użytkownika po verificationToken
    const user = await User.findOne({ verificationToken });

    // Jeśli użytkownik nie został znaleziony, zwróć błąd "Not Found"
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Jeśli użytkownik został znaleziony, ustaw verificationToken na null
    // i pole verify na true
    user.verificationToken = null;
    user.verify = true;
    await user.save();

    // Zwróć odpowiedź o sukcesie
    return res.status(200).json({ message: "Verification successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Endpoint do ponownego wysyłania wiadomości z odnośnikiem do weryfikacji
router.post("/verify", async (req, res) => {
  // Sprawdź, czy body zawiera wymagane pole "email"
  const { error } = Joi.object({
    email: Joi.string().email().required(),
  }).validate(req.body);

  if (error) {
    return res.status(400).json({ message: "missing required field email" });
  }

  const { email } = req.body;

  try {
    // Znajdź użytkownika po adresie e-mail
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Jeśli użytkownik jest już zweryfikowany, zwróć błąd
    if (user.verify) {
      return res
        .status(400)
        .json({ message: "Verification has already been passed" });
    }

    // Ponownie wygeneruj verificationToken i zapisz go w bazie danych
    user.generateVerificationToken();
    await user.save();

    // Wyślij ponownie wiadomość z odnośnikiem do weryfikacji
    const emailVerificationLink = `http://localhost:3000/verify?token=${user.token}`;
    const mailOptions = {
      from: "MagMar80@gmail.com",
      to: user.email,
      subject: "Potwierdzenie rejestracji",
      text: `Kliknij poniższy link, aby potwierdzić swoją rejestrację:\n${emailVerificationLink}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Błąd podczas wysyłania e-maila:", error);
      } else {
        console.log(
          "E-mail z linkiem do weryfikacji został wysłany:",
          info.response
        );
      }
    });

    return res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// wylogowanie
router.post("/logout", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        status: "error",
        code: 401,
        message: "Unauthorized",
      });
    }

    user.token = null;
    await user.save();

    res.status(204).end();
  } catch (error) {
    res.status(500).json({
      status: "error",
      code: 500,
      message: "An error occurred during logout.",
    });
  }
});

// pobieranie danych użytkownika zgodnie z tokenem
router.get("/current", auth, async (req, res) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.status(200).json({
      email: currentUser.email,
      subscription: currentUser.subscription,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// avatary, ładowanie
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/avatars");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

router.post("/upload", upload.single("file"), (req, res) => {
  const { description } = req.body;
  res.json({
    description,
    message: "File loaded correctly",
    status: 200,
  });
});

const avatarDir = path.join(__dirname, "../../", "public", "avatars");

// Dodaj endpoint do aktualizacji avatara
router.patch(
  "/avatars",
  auth,
  upload.single("avatar"),
  async (req, res, next) => {
    try {
      // sprawdzenie czy użytkownik jest zalogowany
      if (!req.user) {
        return res.status(401).json({ message: "Not authorized" });
      }
      // pobieram dane z requestu
      const { _id } = req.user;
      const { path: tempUpload, originalname } = req.file;
      const extension = originalname.split(".").pop();
      // dodane rozszerzenie
      const filename = `${_id}.${extension}`;
      const resultUpload = path.join(avatarDir, filename);
      // zmiena nazwy
      await fs.rename(tempUpload, resultUpload);
      const avatarURL = path.join("public/avatars", originalname);
      jimp
        .read(avatarURL)
        .then((img) => {
          return img.resize(250, 250).write(avatarURL);
        })
        .catch((err) => {
          console.error(err);
        });
      // aktualizacja za pomocą id
      await User.findByIdAndUpdate(_id, { avatarURL });
      res.json({ _id, avatarURL });
    } catch (error) {
      await fs.unlink(req.file.path);
      throw error;
    }
  }
);

module.exports = router;
