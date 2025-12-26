const authService = require("../services/auth.service");

exports.signup = async (req, res) => {
  try {
    await authService.signup(req.body);
    res.status(201).json({ message: "Signup successful. Please login." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: "Invalid email or password" });
  }
};

exports.forgotPassword = async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.json({ message: "Check the email, reset link sent" });
};

exports.resetPassword = async (req, res) => {
  try {
    await authService.resetPassword(req.body);
    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
