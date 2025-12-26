const bcrypt = require("bcryptjs");
const { createConnection, query, sql } = require("../config/db");
const { generateToken } = require("../utils/jwt");
const { v4: uuidv4 } = require("uuid");
const mailer = require("../config/mail");

exports.signup = async (data) => {
  const connection = await createConnection();
  const existing = await query(connection, "SELECT id FROM users WHERE email = @email", { email: data.email });

  if (existing.rows.length > 0) {
    throw new Error("Email already exists");
  }

  if (data.password !== data.confirmPassword) {
    throw new Error("Passwords do not match");
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  await query(connection, `INSERT INTO users (full_name, email, password, role, active) VALUES (@fullName, @email, @password, @role, 1)`, {
    fullName: data.fullName,
    email: data.email,
    password: hashedPassword,
    role: data.role || "GENERAL"
  });
};

exports.login = async ({ email, password }) => {
  const connection = await createConnection();
  const result = await query(connection, "SELECT * FROM users WHERE email=@email AND active=1", { email });

  

  if (result.rows.length === 0) {
    
    throw new Error("Invalid credentials");
  }

  const userRow = result.rows[0];
  const user = {};
  userRow.forEach(col => { user[col.metadata.colName] = col.value; });



  const isMatch = await bcrypt.compare(password, user.password);
 

  if (!isMatch) {
    
    throw new Error("Invalid credentials");
  }

  
  return {
    token: generateToken(user.email, user.role),
    role: user.role
  };
};

exports.forgotPassword = async (email) => {
  const connection = await createConnection();
  // 1. Check user exists & active
  const userRes = await query(connection, "SELECT id FROM users WHERE email=@email AND active=1", { email });

  // Always return success (security best practice)
  if (userRes.rows.length === 0) {
    return;
  }

  // 2. Generate token
  const token = uuidv4();
  

  // 3. Save token
  await query(connection, `INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (@email, @token, DATEADD(HOUR, 1, SYSDATETIME()))`, {
    email,
    token
  });


  // 4. Send email
  const resetLink = `http://localhost:5173/reset-password?token=${token}`;

  await mailer.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: "Reset your password",
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetLink}">Click here to reset password</a></p>
      <p>This link expires in 1 hour.</p>
    `
  });
};


exports.resetPassword = async ({ token, newPassword }) => {
  const connection = await createConnection();
  // 1. Validate token
  const tokenRes = await query(connection, `SELECT email, expires_at FROM password_reset_tokens WHERE token=@token AND expires_at > SYSDATETIME()`, { token });


  if (tokenRes.rows.length === 0) {
    throw new Error("Invalid or expired token");
  }

  const email = tokenRes.rows[0][0].value;

  // 2. Hash new password
  const hashed = await bcrypt.hash(newPassword, 10);

  // 3. Update password
  await query(connection, `UPDATE users SET password=@password WHERE email=@email`, {
    password: hashed,
    email
  });

  // 4. Delete token (one-time use)
  await query(connection, "DELETE FROM password_reset_tokens WHERE token=@token", { token });
};

