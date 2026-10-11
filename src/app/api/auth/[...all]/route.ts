import { authRouteHandler } from "@/server/auth/route-handler";

// Better Auth serves sign-up, sign-in, sign-out, sessions, email verification, and password reset here,
// behind our CSRF, body-size, and rate-limit checks.
export const GET = authRouteHandler;
export const POST = authRouteHandler;
