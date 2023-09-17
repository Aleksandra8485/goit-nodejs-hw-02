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

    // Dodaj generowanie URL avatara przy pomocy gravatar
    const avatarURL = gravatar.url(req.body.email, { s: "250" }, true);

    const user = new User({
      email: req.body.email,
      password: hashedPassword,
      subscription: "starter",
      avatarURL, // Dodaj avatarURL
    });

    await user.save();

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

      // pobranie załadowanego pliku avatara z req.file
      const { file } = req;

      // nadalnie unikalnej nazwy pliku na podstawie ID użytkownika i aktualnego czasu
      const uniqueFilename = `${req.user.id}-${Date.now()}-${
        file.originalname
      }`;

      // ścieżka do pliku tymczasowego w folderze "tmp"
      const tmpFilePath = `tmp/${uniqueFilename}`;

      // ścieżka docelowa
      const targetFilePath = `public/avatars/${uniqueFilename}`;

      // Jimp-obrówbka avatara (zmiana rozmiaru na 250x250)
      const image = await jimp.read(file.path);
      await image.resize(250, 250).write(tmpFilePath);

      // przeniesienie awatara z folderu tymczasowego do docelowego
      await fs.rename(tmpFilePath, targetFilePath);

      // uaktualnij pole avatarURL użytkownika w bazie danych
      req.user.avatarURL = `/avatars/${uniqueFilename}`;
      await req.user.save();

      // odpowiedź z URL-em avatara
      res.status(200).json({ avatarURL: req.user.avatarURL });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
