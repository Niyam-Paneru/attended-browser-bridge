export function authorize({ origin, action, grant, now = Date.now() }) {
  if (!grant || typeof grant !== "object") {
    return { allowed: false, reason: "missing_grant" };
  }

  if (!Number.isFinite(now)) {
    return { allowed: false, reason: "invalid_clock" };
  }

  if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= now) {
    return { allowed: false, reason: "grant_expired" };
  }

  if (!Array.isArray(grant.origins) || !grant.origins.includes(origin)) {
    return { allowed: false, reason: "origin_not_allowed" };
  }

  if (!Array.isArray(grant.actions) || !grant.actions.includes(action)) {
    return { allowed: false, reason: "action_not_allowed" };
  }

  return { allowed: true, reason: "allowed" };
}
