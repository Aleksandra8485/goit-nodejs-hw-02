const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const User = require("../../services/users");
const auth = require("../../auth");
const multer = require("multer");
const path = require("path");
const Jimp = require("jimp");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const { sendVerificationEmail } = require("../../config/nodemailerConfig");

const router = express.Router();

const upload = multer({
  dest: "tmp",
  limits: { fileSize: 2 * 1024 * 1024 },
});

const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

router.post("/signup", async (req, res, next) => {
  try {
    const validationResult = schema.validate(req.body);
    if (validationResult.error) {
      return res
        .status(400)
        .json({ message: validationResult.error.details[0].message });
    }

    const { email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Generowanie verificationToken
    const verificationToken = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      email,
      password: hashedPassword,
      verificationToken,
    });

    // Wysyłanie emaila weryfikacyjnego
    sendVerificationEmail(email, verificationToken);
    await newUser.save();

    res.status(201).json({
      user: { email, subscription: "starter" },
    });
  } catch (error) {
    console.error("Error during signup:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/login", async (req, res, next) => {
  const validationResult = schema.validate(req.body);
  if (validationResult.error) {
    return res
      .status(400)
      .json({ message: validationResult.error.details[0].message });
  }

  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (isPasswordValid) {
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    await User.findByIdAndUpdate(user._id, { token });
    res.status(200).json({
      token,
      user: { email, subscription: "starter" },
    });
  } else {
    return res.status(400).json({ message: "Invalid email or password" });
  }
});
router.get("/current", auth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }
    const { email, subscription } = user;
    return res.status(200).json({
      email,
      subscription,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/logout", auth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    await User.findByIdAndUpdate(user._id, { token: null });
    return res.status(204).send(); // 204 No Content
  } catch (error) {
    next(error);
  }
});
router.patch(
  "/avatars",
  auth,
  upload.single("avatar"),
  async (req, res, next) => {
    try {
      const { file } = req;
      if (!file) {
        return res.status(400).json({ message: "No file provided" });
      }

      // Obróbka zdjęcia za pomocą Jimp
      const img = await Jimp.read(file.path);
      await img.resize(250, 250).writeAsync(file.path);

      // Przeniesienie pliku do folderu `public/avatars` i nadanie unikalnej nazwy
      const newName = `avatar_${req.user._id}${path.extname(
        file.originalname
      )}`;
      const newLocation = path.join(__dirname, "../../public/avatars", newName);

      await fs.rename(file.path, newLocation);

      // Aktualizacja URL awatara użytkownika w bazie danych
      const avatarURL = `/avatars/${newName}`;
      await User.findByIdAndUpdate(req.user._id, { avatarURL });

      res.status(200).json({ avatarURL });
    } catch (error) {
      next(error);
    }
  }
);
router.get("/verify/:verificationToken", async (req, res, next) => {
  try {
    const user = await User.findOne({
      verificationToken: req.params.verificationToken,
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verify) {
      return res
        .status(400)
        .json({ message: "Email has already been verified" });
    }

    await User.findByIdAndUpdate(user._id, {
      verify: true,
      verificationToken: null,
    });
    res.status(200).json({ message: "Verification successful" });
  } catch (error) {
    next(error);
  }
});
router.post("/verify", async (req, res, next) => {
  try {
    const { email } = req.body;

    // Jeśli brak emaila w żądaniu
    if (!email) {
      return res.status(400).json({ message: "missing required field email" });
    }

    const user = await User.findOne({ email });

    // Jeśli brak użytkownika o podanym emailu
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Jeśli użytkownik został już zweryfikowany
    if (user.verify) {
      return res
        .status(400)
        .json({ message: "Verification has already been passed" });
    }

    // Wysyłanie emaila weryfikacyjnego
    sendVerificationEmail(email, user.verificationToken);

    res.status(200).json({ message: "Verification email sent" });
  } catch (error) {
    console.error("Error during re-sending verification email:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
