const app = require("./app");
const mongoose = require("mongoose");
require("dotenv").config();

const uriDb = process.env.DB_HOST;

const startServer = async () => {
  try {
    const connection = await mongoose.connect(uriDb, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Database connection successful");

    app.listen(3001, () => {
      console.log("Server running. Use our API on port: 3001");
    });
  } catch (error) {
    console.error("Cannot connect to Mongo Database");
    console.error(error);
    process.exit(1);
  }
};

startServer();
