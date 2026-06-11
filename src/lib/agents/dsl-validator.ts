// Client-safe validator for the Custom Agent DSL. Enforces strict schema,
// AWS service whitelist, and reports blocked / forbidden command intent.
import { z } from "zod";
import { AWS_SERVICE_OPTIONS, type AwsService } from "@/lib/agents/definitions";

export const CustomAgentDslSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be 80 characters or fewer")
    .regex(/^[A-Za-z0-9 _\-./]+$/, "Name may only contain letters, numbers, space, _ - . /"),
  description: z
    .string()
    .trim()
    .max(280, "Description must be 280 characters or fewer")
    .optional()
    .nullable(),
  system_prompt: z
    .string()
    .trim()
    .min(20, "System prompt must be at least 20 characters")
    .max(8000, "System prompt must be 8000 characters or fewer"),
  services: z
    .array(z.enum(AWS_SERVICE_OPTIONS))
    .min(1, "Pick at least one allowed AWS service")
    .max(AWS_SERVICE_OPTIONS.length, "Too many services selected"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #RRGGBB hex value"),
});

export type CustomAgentDsl = z.infer<typeof CustomAgentDslSchema>;

// AWS services the prompt might reference but that are NOT in the read-only
// tool catalog OR not in the whitelist. We report these as "blocked" so the
// author knows the agent literally cannot perform them at runtime.
const KNOWN_AWS_SERVICES = [
  "sts", "iam", "s3", "ec2", "rds", "lambda", "dynamodb", "kms", "kinesis",
  "sns", "sqs", "cloudfront", "route53", "cloudtrail", "cloudwatch", "logs",
  "ssm", "secretsmanager", "eks", "ecs", "ecr", "apigateway", "elasticache",
  "redshift", "athena", "glue", "sagemaker", "stepfunctions",
];

// Hard-blocked verbs: even if a service is whitelisted, Cirrus is read-only
// at scan time. Mutations like delete/create/put/modify must go through
// the remediation playbook flow, not a custom agent.
const FORBIDDEN_VERBS = [
  "delete", "destroy", "terminate", "remove",
  "create", "put", "post",
  "modify", "update", "patch", "replace",
  "stop", "start", "reboot",
  "attach", "detach", "grant", "revoke",
  "publish", "send",
];

export interface DslValidationResult {
  ok: boolean;
  errors: string[];                              // hard errors — block save
  blockedServices: string[];                     // mentioned but not whitelisted
  unsupportedServices: string[];                 // not in catalog at all
  forbiddenCommands: { verb: string; phrase: string }[]; // mutation verbs in prompt
  warnings: string[];
}

export function validateCustomAgentDsl(input: unknown): DslValidationResult {
  const parsed = CustomAgentDslSchema.safeParse(input);
  const result: DslValidationResult = {
    ok: false,
    errors: [],
    blockedServices: [],
    unsupportedServices: [],
    forbiddenCommands: [],
    warnings: [],
  };

  if (!parsed.success) {
    result.errors = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "value"}: ${i.message}`,
    );
    return result;
  }

  const dsl = parsed.data;
  const promptLower = dsl.system_prompt.toLowerCase();
  const allowedServices = new Set<AwsService>(dsl.services);

  // Service-mention scan: tokens like "rds", "lambda", "aws lambda", "iam".
  for (const svc of KNOWN_AWS_SERVICES) {
    const re = new RegExp(`\\b${svc}\\b`, "i");
    if (!re.test(promptLower)) continue;
    if ((AWS_SERVICE_OPTIONS as readonly string[]).includes(svc)) {
      if (!allowedServices.has(svc as AwsService)) result.blockedServices.push(svc);
    } else {
      result.unsupportedServices.push(svc);
    }
  }

  // Forbidden-verb scan: e.g. "delete the bucket", "create-stack", "modify sg".
  for (const verb of FORBIDDEN_VERBS) {
    const re = new RegExp(`\\b${verb}[a-z\\-]*\\b[^.\\n]{0,40}`, "gi");
    const matches = dsl.system_prompt.match(re);
    if (matches) {
      for (const m of matches.slice(0, 3)) {
        result.forbiddenCommands.push({ verb, phrase: m.trim().slice(0, 80) });
      }
    }
  }

  if (result.blockedServices.length) {
    result.warnings.push(
      `Prompt references ${result.blockedServices.join(", ")} but those services are not in the whitelist. The agent will be unable to call them.`,
    );
  }
  if (result.unsupportedServices.length) {
    result.warnings.push(
      `Prompt references ${result.unsupportedServices.join(", ")} which Cirrus does not yet expose as agent tools.`,
    );
  }
  if (result.forbiddenCommands.length) {
    result.errors.push(
      `Custom agents are read-only. Remove mutation verbs (${[...new Set(result.forbiddenCommands.map((c) => c.verb))].join(", ")}) — use Remediation Playbooks to apply fixes.`,
    );
  }

  result.ok = result.errors.length === 0;
  return result;
}
