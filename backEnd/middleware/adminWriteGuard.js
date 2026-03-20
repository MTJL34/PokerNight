const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getProvidedKey(req) {
  const fromHeader = String(req.headers["x-admin-key"] || "").trim();
  if (fromHeader) return fromHeader;

  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return "";
}

function getProvidedCode(req) {
  return String(req.headers["x-admin-code"] || "").trim();
}

function adminWriteGuard(req, res, next) {
  if (READ_METHODS.has(req.method)) return next();

  const expectedKey = String(process.env.ADMIN_API_KEY || "").trim();
  if (!expectedKey) {
    return res.status(503).json({
      message: "Write access disabled: ADMIN_API_KEY not configured",
    });
  }

  const providedKey = getProvidedKey(req);
  if (!providedKey) {
    return res.status(401).json({ message: "Missing admin key" });
  }

  if (providedKey !== expectedKey) {
    return res.status(403).json({ message: "Invalid admin key" });
  }

  const expectedCode = String(process.env.ADMIN_CONFIRM_CODE || "").trim();
  if (!expectedCode) {
    return res.status(503).json({
      message: "Write access disabled: ADMIN_CONFIRM_CODE not configured",
    });
  }

  const providedCode = getProvidedCode(req);
  if (!providedCode) {
    return res.status(401).json({ message: "Missing admin confirmation code" });
  }

  if (providedCode !== expectedCode) {
    return res.status(403).json({ message: "Invalid admin confirmation code" });
  }

  return next();
}

module.exports = adminWriteGuard;
