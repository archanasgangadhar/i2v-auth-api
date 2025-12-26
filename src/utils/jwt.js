const jwt = require("jsonwebtoken");

exports.generateToken = (email, role) => {
  return jwt.sign(
    { role },
    process.env.JWT_SECRET,
    {
      subject: email,
      expiresIn: process.env.JWT_EXPIRES_IN
    }
  );
};
