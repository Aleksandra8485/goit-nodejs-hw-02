const passport = require("passport");
const passportJWT = require("passport-jwt");
const User = require("./services/users");
const dotenv = require("dotenv");

dotenv.config();
const secret = process.env.SECRET;

const ExtractJWT = passportJWT.ExtractJwt;
const JWTStrategy = passportJWT.Strategy;

passport.use(
  new JWTStrategy(
    {
      jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
    },
    async (jwtPayload, done) => {
      try {
        const user = await User.findById(jwtPayload.id).select("-password");
        console.log(user);
        if (!user) {
          return done(null, false, { message: "Not authorized" });
        }

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

const auth = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ message: "Not authorized" });
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = auth;

// const jwt = require("jsonwebtoken");
// const User = require("./services/users"); // Importuj model użytkownika

// // Funkcja do generowania tokena JWT po prawidłowym uwierzytelnieniu
// const generateToken = (user) => {
//   const payload = {
//     userId: user._id,
//     email: user.email,
//   };
//   const options = {
//     expiresIn: "1h", // Czas ważności tokenu
//   };
//   return jwt.sign(payload, "your-secret-key", options); // Zmień 'your-secret-key' na własny klucz
// };

// // Funkcja do logowania użytkownika
// const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // Sprawdź, czy istnieje użytkownik o podanym e-mailu
//     const user = await User.findOne({ email });

//     if (!user) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     // Sprawdź hasło
//     const isPasswordValid = await user.checkPassword(password);

//     if (!isPasswordValid) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     // Wygeneruj token JWT
//     const token = generateToken(user);

//     // Odeślij token jako odpowiedź
//     res.status(200).json({ token });
//   } catch (error) {
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// module.exports = { login };
