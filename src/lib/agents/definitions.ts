// Client-safe agent metadata. No AWS / LLM imports here so this can be
// imported from React components.

export type BuiltinAgentType = "recon" | "iam" | "s3" | "ec2";
export type AgentType = BuiltinAgentType | "custom";

export const AWS_SERVICE_OPTIONS = ["sts", "iam", "s3", "ec2", "rds", "lambda", "dynamodb", "kms", "cloudtrail"] as const;
export type AwsService = (typeof AWS_SERVICE_OPTIONS)[number];

export interface AgentDefinition {
  type: AgentType;
  name: string;
  tagline: string;
  description: string;
  colorVar: string;
  icon: "radar" | "key" | "bucket" | "network";
}

export const AGENT_DEFINITIONS: Record<BuiltinAgentType, AgentDefinition> = {
  recon: {
    type: "recon",
    name: "Recon",
    tagline: "Identity & surface mapping",
    description:
      "Establishes who you are in the account, enumerates regions, account aliases, and the initial attack surface.",
    colorVar: "var(--color-agent-recon)",
    icon: "radar",
  },
  iam: {
    type: "iam",
    name: "IAM Auditor",
    tagline: "Privilege & policy analysis",
    description:
      "Enumerates users, roles, policies. Hunts for AdministratorAccess, wildcards, unused credentials, and privilege-escalation paths.",
    colorVar: "var(--color-agent-iam)",
    icon: "key",
  },
  s3: {
    type: "s3",
    name: "S3 Hunter",
    tagline: "Bucket exposure & data risk",
    description:
      "Lists buckets, inspects public access blocks, ACLs, encryption, and policy. Flags publicly readable / writable buckets.",
    colorVar: "var(--color-agent-s3)",
    icon: "bucket",
  },
  ec2: {
    type: "ec2",
    name: "EC2 / Network",
    tagline: "Exposed compute & SGs",
    description:
      "Audits security groups for 0.0.0.0/0 ingress on sensitive ports, finds public instances and overly-open network paths.",
    colorVar: "var(--color-agent-ec2)",
    icon: "network",
  },
};

export const CUSTOM_AGENT_DEFINITION: AgentDefinition = {
  type: "custom",
  name: "Custom Agent",
  tagline: "User-defined check",
  description: "A user-authored agent with a custom system prompt and AWS tool whitelist.",
  colorVar: "#a78bfa",
  icon: "radar",
};

export function getAgentDefinition(
  type: AgentType,
  custom?: { name?: string | null; description?: string | null; color?: string | null },
): AgentDefinition {
  if (type !== "custom") return AGENT_DEFINITIONS[type];
  return {
    ...CUSTOM_AGENT_DEFINITION,
    name: custom?.name ?? CUSTOM_AGENT_DEFINITION.name,
    tagline: custom?.description?.slice(0, 60) ?? CUSTOM_AGENT_DEFINITION.tagline,
    colorVar: custom?.color ?? CUSTOM_AGENT_DEFINITION.colorVar,
  };
}

export const AGENT_ORDER: BuiltinAgentType[] = ["recon", "iam", "s3", "ec2"];

export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
];
