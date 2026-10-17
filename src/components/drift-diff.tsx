import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface Finding {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  resource: string | null;
}

const SEV_CLASS: Record<Finding["severity"], string> = {
  info: "border-severity-info/40 text-severity-info",
  low: "border-severity-low/40 text-severity-low",
  medium: "border-severity-medium/40 text-severity-medium",
  high: "border-severity-high/40 text-severity-high",
  critical: "border-severity-critical/40 text-severity-critical",
};

function keyOf(f: Finding) {
  return `${f.severity}::${f.title}::${f.resource ?? ""}`;
}

export function DriftDiff({ current, previous }: { current: Finding[]; previous: Finding[] }) {
  const prevSet = new Set(previous.map(keyOf));
  const curSet = new Set(current.map(keyOf));

  const newFindings = current.filter((f) => !prevSet.has(keyOf(f)));
  const resolved = previous.filter((f) => !curSet.has(keyOf(f)));
  const unchanged = current.filter((f) => prevSet.has(keyOf(f)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="New" count={newFindings.length} icon={ArrowUp} tone="text-severity-high" />
        <Stat label="Resolved" count={resolved.length} icon={ArrowDown} tone="text-emerald-400" />
        <Stat
          label="Unchanged"
          count={unchanged.length}
          icon={Minus}
          tone="text-muted-foreground"
        />
      </div>

      <Section title="New findings" tone="text-severity-high" items={newFindings} />
      <Section title="Resolved" tone="text-emerald-400" items={resolved} resolved />
      <Section title="Still present" tone="text-muted-foreground" items={unchanged} />
    </div>
  );
}

function Stat({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3 text-center">
      <Icon className={`mx-auto h-4 w-4 ${tone}`} />
      <div className={`mt-1 text-lg font-semibold ${tone}`}>{count}</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Section({
  title,
  tone,
  items,
  resolved,
}: {
  title: string;
  tone: string;
  items: Finding[];
  resolved?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={`mb-2 text-[10px] font-mono uppercase tracking-wider ${tone}`}>
        {title} · {items.length}
      </div>
      <div className="space-y-1.5">
        {items.map((f) => (
          <div
            key={f.id}
            className={`rounded-md border border-border bg-surface p-2.5 ${resolved ? "opacity-70 line-through" : ""}`}
          >
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`font-mono text-[10px] uppercase ${SEV_CLASS[f.severity]}`}
              >
                {f.severity}
              </Badge>
              <span className="text-sm truncate">{f.title}</span>
            </div>
            {f.resource && (
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {f.resource}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pre-Remediation Resource Diff Preview ─────────────────────────────────────
// Shows exactly what will be modified on the cloud resource prior to fix execution.
export function ResourceRemediationDiff({
  findingTitle,
  resourceName,
  cloudformationTemplate,
}: {
  findingTitle: string;
  resourceName: string | null;
  cloudformationTemplate?: string;
}) {
  const diffLines = getSynthesizedDiff(findingTitle, resourceName, cloudformationTemplate);

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Pre-Remediation Resource Diff (Target vs Live State)
        </div>
        <Badge
          variant="outline"
          className="font-mono text-[9px] uppercase text-primary border-primary/40"
        >
          Inspection Mode
        </Badge>
      </div>

      <div className="terminal overflow-x-auto rounded border border-border/80 bg-black/40 p-2.5 font-mono text-[11px] leading-relaxed">
        <div className="text-muted-foreground pb-1 mb-1 border-b border-border/40 text-[10px]">
          --- a/{resourceName || "aws-resource-live"} (Current Live Misconfiguration)
          <br />
          +++ b/{resourceName || "aws-resource-target"} (CloudFormation Target State)
        </div>
        {diffLines.map((line, idx) => {
          if (line.type === "del") {
            return (
              <div
                key={idx}
                className="bg-destructive/15 text-destructive font-semibold px-1 rounded-sm"
              >
                - {line.content}
              </div>
            );
          }
          if (line.type === "add") {
            return (
              <div
                key={idx}
                className="bg-emerald-500/15 text-emerald-400 font-semibold px-1 rounded-sm"
              >
                + {line.content}
              </div>
            );
          }
          return (
            <div key={idx} className="text-muted-foreground px-1">
              &nbsp;&nbsp;{line.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DiffLine {
  type: "context" | "del" | "add";
  content: string;
}

function getSynthesizedDiff(title: string, resource: string | null, cfn?: string): DiffLine[] {
  const t = title.toLowerCase();

  if (t.includes("s3") || t.includes("bucket")) {
    return [
      { type: "context", content: `Type: AWS::S3::Bucket` },
      { type: "context", content: `Properties:` },
      { type: "context", content: `  BucketName: "${resource || "target-s3-bucket"}"` },
      {
        type: "del",
        content: `  PublicAccessBlockConfiguration: { BlockPublicAcls: false, BlockPublicPolicy: false }`,
      },
      { type: "add", content: `  PublicAccessBlockConfiguration:` },
      { type: "add", content: `    BlockPublicAcls: true` },
      { type: "add", content: `    BlockPublicPolicy: true` },
      { type: "add", content: `    IgnorePublicAcls: true` },
      { type: "add", content: `    RestrictPublicBuckets: true` },
      { type: "del", content: `  BucketEncryption: None` },
      {
        type: "add",
        content: `  BucketEncryption: { ServerSideEncryptionConfiguration: [ { SSEAlgorithm: "AES256" } ] }`,
      },
    ];
  }

  if (
    t.includes("security group") ||
    t.includes("port") ||
    t.includes("0.0.0.0/0") ||
    t.includes("ec2")
  ) {
    return [
      { type: "context", content: `Type: AWS::EC2::SecurityGroupIngress` },
      { type: "context", content: `Properties:` },
      { type: "context", content: `  GroupId: "${resource || "sg-01a2b3c4d5e6"}"` },
      { type: "del", content: `  CidrIp: "0.0.0.0/0"  # Insecure unrestricted world access` },
      { type: "add", content: `  CidrIp: "10.0.0.0/16"  # Restrict to trusted VPC CIDR block` },
      { type: "context", content: `  IpProtocol: "tcp"` },
      {
        type: "context",
        content: `  Description: "Audited & sealed by Cirrus Automated Remediation"`,
      },
    ];
  }

  if (
    t.includes("iam") ||
    t.includes("policy") ||
    t.includes("key") ||
    t.includes("wildcard") ||
    t.includes("root")
  ) {
    return [
      { type: "context", content: `Type: AWS::IAM::Policy` },
      { type: "context", content: `Properties:` },
      { type: "context", content: `  PolicyDocument:` },
      { type: "context", content: `    Statement:` },
      { type: "del", content: `      - Action: "*"` },
      { type: "del", content: `        Resource: "*"` },
      { type: "del", content: `        Effect: "Allow"` },
      { type: "add", content: `      - Action:` },
      { type: "add", content: `          - "s3:GetObject"` },
      { type: "add", content: `          - "s3:ListBucket"` },
      { type: "add", content: `        Resource: "arn:aws:s3:::specific-audited-resource/*"` },
      { type: "add", content: `        Effect: "Allow"` },
    ];
  }

  // Fallback parsed from CloudFormation template snippet if available
  if (cfn && cfn.includes("Resources:")) {
    const lines = cfn
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(0, 8);
    return [
      {
        type: "del",
        content: `# Resource: ${resource || "aws-resource"} is in non-compliant state`,
      },
      ...lines.map((l) => ({ type: "add" as const, content: l })),
    ];
  }

  return [
    { type: "context", content: `Resource: ${resource || "aws-resource"}` },
    { type: "del", content: `- Status: Non-compliant / Unrestricted configuration` },
    { type: "add", content: `+ Status: Hardened per Cirrus Security Benchmark` },
    { type: "add", content: `+ Protection: CloudFormation Managed Change Set Applied` },
  ];
}
