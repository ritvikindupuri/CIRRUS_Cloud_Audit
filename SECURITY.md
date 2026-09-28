# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in CIRRUS Cloud Audit, please report it responsibly by emailing the maintainers directly. Do not open a public GitHub issue for security vulnerabilities.

**Contact:** [Open an issue on GitHub](https://github.com/ritvikindupuri/CIRRUS_Cloud_Audit/issues) with `[SECURITY]` in the title (without details) and request a private disclosure channel.

We aim to acknowledge security reports within 48 hours and provide a timeline for remediation.

---

## Security Hardening Summary (2026-09-28)

This document reflects the security improvements implemented in the `security: harden CIRRUS` PR.

### Changes Applied

#### 1. **Secrets Management**

- ✅ **No secrets committed to git**: Verified that no `.env`, API keys, or credentials exist in git history
- ✅ **Environment variable template**: Added `.env.example` with placeholder values
- ✅ **Gitignore protection**: Confirmed `.env` is properly listed in `.gitignore`
- ℹ️ **Note**: Supabase anon/publishable keys are low-risk by design (RLS enforced), but kept out of version control per best practices

#### 2. **Authentication & Authorization**

- ✅ **JWT validation**: All server functions use `requireSupabaseAuth` middleware that validates Bearer tokens
- ✅ **User-scoped operations**: Database queries filter by `auth.uid()` to prevent cross-user data access
- ✅ **Row-Level Security (RLS)**: All tables (`profiles`, `scans`, `agent_runs`, `agent_steps`, `findings`, `scheduled_scans`, `custom_agents`, `remediation_deployments`) have RLS enabled with owner-based policies
- ✅ **Input validation**: All server functions use Zod schemas to validate and sanitize inputs

#### 3. **XSS Prevention**

- ✅ **Chart component sanitization**: Added input sanitization to `ChartStyle` component that uses `dangerouslySetInnerHTML`
  - CSS selector IDs are sanitized to alphanumeric + dash/underscore only
  - Color values are validated against safe CSS patterns (hex, rgb/rgba, hsl/hsla, named colors)
- ✅ **React default escaping**: All other components use React's built-in XSS protection (no raw HTML injection found)

#### 4. **AWS Credential Handling**

- ✅ **Zero-trust architecture**: AWS credentials are never persisted to the database
- ✅ **Client-side storage**: Credentials cached in browser `sessionStorage` only
- ✅ **Request-scoped transmission**: Credentials passed via SSL headers for single-request use
- ✅ **No credential logging**: Verified no console.log statements expose secrets
- ✅ **Input validation**: AWS credential schemas enforce length constraints (access key 16-128 chars, secret 20-256 chars, session token max 4096 chars)

#### 5. **AWS Remediation Actions**

- ✅ **Read-only agent tools**: All agent tools are strictly read-only AWS API calls (List*, Describe*, Get\*)
- ✅ **Explicit remediation flow**: Write actions (CloudFormation) require explicit user initiation via UI
- ✅ **Change set preview**: All CloudFormation deployments create a dry-run change set first
- ✅ **CAPABILITY_NAMED_IAM acknowledgment**: IAM-impacting stacks require explicit capability acknowledgment
- ✅ **No automatic privilege escalation**: Remediation permissions are user-provided; bootstrap function only attempts self-grant with explicit user action and requires existing `iam:PutUserPolicy`
- ✅ **Audit logging**: All CloudFormation stack events are captured in `remediation_deployments.cfn_events` for forensics

#### 6. **Prompt Injection Protection**

- ✅ **Custom agent DSL validator**: `dsl-validator.ts` scans custom agent prompts for forbidden mutating verbs (Create, Delete, Put, Update, Modify, etc.)
- ✅ **Blocked action logging**: Safety violations are logged to `agent_runs.blocked_calls` and persisted in the execution timeline
- ✅ **Service allowlist**: Custom agents explicitly declare allowed AWS services; tools are filtered to only those services

#### 7. **SSRF & Injection Prevention**

- ✅ **Controlled API endpoints**: Only two external fetch calls exist:
  1. `email.server.ts`: Hardcoded Resend API endpoint (`https://api.resend.com/emails`)
  2. AWS SDK calls: All URLs are generated internally by `@aws-sdk` libraries
- ✅ **No user-controlled URLs**: No dynamic URL construction from user input found
- ✅ **SQL injection prevention**: All database queries use Supabase's parameterized query builder

#### 8. **Dependency Management**

- ✅ **Dependabot configuration**: Added `.github/dependabot.yml` for automated security updates
  - Weekly npm dependency scans
  - Weekly GitHub Actions scans
  - Grouped AWS SDK updates
  - Auto-labeled security updates

#### 9. **Security Headers & CSP** _(Recommended for deployment)_

- ⚠️ **Not enforced in code**: Security headers should be configured at the deployment layer (Cloudflare, Netlify, Vercel, etc.)
- 📋 **Recommended headers**:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com;
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  ```
- ℹ️ **Note**: `'unsafe-inline'` and `'unsafe-eval'` are required for Vite dev mode and some chart libraries; tighten in production

---

### Residual Security Considerations

#### 1. **Supabase Service Role Key**

- **Risk**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and should be kept secret
- **Mitigation**: Only used in `client.server.ts`; never exposed to client bundle (`.server.ts` suffix enforces server-only execution)
- **Recommendation**: Rotate service role key if ever exposed; limit server deployment to trusted infrastructure

#### 2. **Gemini API Key**

- **Risk**: `GEMINI_API_KEY` authorizes LLM calls; exposure could lead to quota abuse
- **Mitigation**: Stored as server-only environment variable; never sent to client
- **Recommendation**: Implement rate limiting on server functions; monitor Gemini API usage

#### 3. **Resend API Key (User-Provided)**

- **Risk**: User-provided `resend_api_key` stored in `profiles` table could be leaked via database breach
- **Mitigation**: RLS ensures users can only read their own API key; consider encrypting at rest
- **Recommendation**: Migrate to Supabase Edge Function with server-managed Resend key to eliminate user-stored secrets

#### 4. **CloudFormation Remediation Permissions**

- **Risk**: The `bootstrapRemediationPermissions` function grants broad IAM/CloudFormation permissions
- **Mitigation**: Only works for IAM users (not roles); requires existing `iam:PutUserPolicy`; user must explicitly invoke bootstrap
- **Recommendation**: Document least-privilege policy; suggest users create a dedicated remediation role instead of inline policy

#### 5. **Client-Side Credential Caching**

- **Risk**: AWS credentials in `sessionStorage` are accessible to any JavaScript on the domain (XSS or malicious extension)
- **Mitigation**: Credentials are short-lived (session tokens); cleared on logout; SSL-only transmission
- **Recommendation**: Consider encrypting credentials in `sessionStorage` with a session-derived key; educate users on browser extension risks

#### 6. **LLM Prompt Injection (Advanced)**

- **Risk**: Despite DSL validation, a sophisticated attacker could craft prompts that manipulate agent reasoning to exfiltrate data or recommend unsafe changes
- **Mitigation**: Agents only have read-only tools; findings are logged but not auto-executed; user reviews all remediation playbooks before deployment
- **Recommendation**: Add output sanitization on LLM-generated CloudFormation templates (validate with `cfn-lint`); implement cost/quota limits per user

#### 7. **No Security Headers in Application Code**

- **Risk**: Missing `Content-Security-Policy`, `X-Frame-Options`, etc., could allow clickjacking or content injection
- **Mitigation**: Modern browsers have some built-in protections; Vite dev server is localhost-only
- **Recommendation**: Configure headers at deployment edge (Cloudflare Workers, Netlify `_headers`, Vercel `vercel.json`)

#### 8. **No GitHub Actions Workflow Hardening**

- **Risk**: No CI/CD workflows exist; if added later, could be vulnerable to supply-chain attacks
- **Mitigation**: N/A (no workflows present)
- **Recommendation**: When adding workflows, use `permissions: read-all` or specific scopes; pin action versions to SHAs; avoid `pull_request_target` with untrusted code

#### 9. **Supabase Edge Functions (Not Present)**

- **Risk**: No Edge Functions detected in repo; if added later, would need CORS + auth hardening
- **Mitigation**: N/A
- **Recommendation**: When adding Edge Functions, enforce JWT verification with `supabase.auth.getUser()`, validate all inputs, set CORS `Access-Control-Allow-Origin` via `ALLOWED_ORIGINS` env var (not `*`)

#### 10. **Supply Chain Security**

- **Risk**: 84 npm dependencies (including transitive) could contain vulnerabilities
- **Mitigation**: Dependabot enabled for weekly scans; lockfile pinned versions
- **Recommendation**: Run `npm audit` regularly; consider using Snyk or Socket.dev for deeper supply-chain analysis

---

## Security Best Practices for Operators

1. **AWS Credentials**:
   - Use short-lived session tokens (STS `AssumeRole` with MFA)
   - Never commit credentials to git
   - Rotate access keys every 90 days
   - Use read-only policies for audit scans; separate credentials for remediation

2. **Deployment**:
   - Deploy backend to trusted infrastructure (not public-writeable hosting)
   - Use environment variables for secrets (not hardcoded)
   - Enable HTTPS/TLS for all traffic
   - Configure security headers at edge/CDN layer

3. **Database**:
   - Regularly review Supabase RLS policies
   - Enable Supabase audit logging
   - Rotate `SUPABASE_SERVICE_ROLE_KEY` if exposed
   - Backup database regularly

4. **Monitoring**:
   - Monitor Gemini API usage for anomalies
   - Set up CloudWatch alarms on remediation CloudFormation stack failures
   - Review agent `blocked_calls` for repeated prompt-injection attempts

---

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

This is a single-version project; all security fixes apply to the `main` branch.

---

## Acknowledgments

Security hardening performed as part of the September 2026 defensive audit. No critical vulnerabilities were found in the codebase; improvements focus on defense-in-depth and supply-chain hygiene.
