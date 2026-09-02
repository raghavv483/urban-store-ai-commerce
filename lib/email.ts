import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

/**
 * Transactional email via Resend, in sandbox mode.
 *
 * Sandbox has two hard limits that shape everything here:
 *   1. The from-address must be one Resend owns (`onboarding@resend.dev`) until a
 *      domain is verified, which needs DNS propagation we do not have time for.
 *   2. It will only deliver to addresses verified on the Resend account. Sending
 *      to anyone else fails per-recipient.
 *
 * So `RESEND_ALLOWED_RECIPIENTS` is an explicit allowlist. An address not on it is
 * reported as unreachable rather than attempted — a guaranteed bounce is not a
 * more honest outcome than declining to try, and it keeps the counts truthful.
 *
 * Every function here is failure-tolerant by design: a campaign approval is a
 * human decision that already happened, and it must not be undone because an
 * email provider was down.
 */

let client: Resend | null = null;

function resend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

export function emailIsConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Addresses sandbox will actually accept. Empty means "none configured". */
function allowlist(): string[] {
  return (env.RESEND_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isDeliverable(email: string): boolean {
  const allowed = allowlist();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

export type SendOutcome = {
  /** Addresses Resend accepted. */
  sent: string[];
  /** Addresses skipped before any attempt, with why. */
  skipped: Array<{ email: string; reason: string }>;
  /** Addresses attempted that Resend rejected. */
  failed: Array<{ email: string; reason: string }>;
};

/**
 * Sends one campaign message to each recipient individually.
 *
 * Individually rather than one message with many recipients: shoppers must not
 * see each other's addresses, and a single bad address should not take the whole
 * batch down with it.
 */
export async function sendCampaignEmails(input: {
  recipients: string[];
  subject: string;
  body: string;
}): Promise<SendOutcome> {
  const outcome: SendOutcome = { sent: [], skipped: [], failed: [] };
  const unique = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];

  const api = resend();
  if (!api) {
    for (const email of unique) {
      outcome.skipped.push({ email, reason: "email sending is not configured" });
    }
    return outcome;
  }

  for (const email of unique) {
    if (!isDeliverable(email)) {
      outcome.skipped.push({
        email,
        reason: "not a verified sandbox recipient",
      });
      continue;
    }

    try {
      const res = await api.emails.send({
        from: env.RESEND_FROM,
        to: email,
        subject: input.subject,
        text: input.body,
      });

      if (res.error) {
        outcome.failed.push({ email, reason: res.error.message });
      } else {
        outcome.sent.push(email);
      }
    } catch (error) {
      // Never let a provider outage propagate into the approval transaction.
      outcome.failed.push({
        email,
        reason: error instanceof Error ? error.message : "send failed",
      });
    }
  }

  return outcome;
}

/** One honest sentence describing what actually happened. */
export function describeOutcome(outcome: SendOutcome): string {
  const parts: string[] = [];

  if (outcome.sent.length > 0) {
    parts.push(
      `Sent to ${outcome.sent.length} recipient${outcome.sent.length === 1 ? "" : "s"} (Resend test mode)`,
    );
  }
  if (outcome.failed.length > 0) {
    parts.push(
      `${outcome.failed.length} send${outcome.failed.length === 1 ? "" : "s"} failed`,
    );
  }
  if (outcome.skipped.length > 0) {
    parts.push(`${outcome.skipped.length} could not be reached (no verified email on file)`);
  }

  if (parts.length === 0) return "No recipients to contact.";
  return `${parts.join("; ")}.`;
}
