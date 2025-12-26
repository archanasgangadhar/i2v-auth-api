const authService = require("../services/auth.service");

exports.signup = async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      confirmPassword
    } = req.body;

    await authService.signup({
      fullName: full_name,   // ✅ IMPORTANT FIX
      email,
      password,
      confirmPassword
    });

    res.status(201).json({ message: "Signup successful. Please login." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password
    });

    res.json(result);
  } catch (err) {
    res.status(401).json({ error: "Invalid email or password" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({ message: "Check the email, reset link sent" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    await authService.resetPassword({
      token: req.body.token,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword
    });

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
