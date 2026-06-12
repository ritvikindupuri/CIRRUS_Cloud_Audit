import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const POLICY_JSON = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CirrusReadOnlyAudit",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity",
        "iam:Get*",
        "iam:List*",
        "s3:ListAllMyBuckets",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicyStatus",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
        "ec2:Describe*",
        "rds:Describe*",
        "lambda:List*",
        "lambda:Get*",
        "dynamodb:List*",
        "dynamodb:Describe*",
        "kms:List*",
        "kms:Describe*",
        "kms:GetKey*",
        "cloudtrail:Describe*",
        "cloudtrail:Get*"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CirrusRemediation",
      "Effect": "Allow",
      "Action": [
        "iam:PutUserPolicy",
        "iam:DeleteUserPolicy",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PassRole",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketEncryption",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:ModifySecurityGroupRules",
        "rds:ModifyDBInstance",
        "rds:ModifyDBCluster",
        "rds:ModifyOptionGroup",
        "rds:ModifyDBParameterGroup",
        "lambda:UpdateFunctionConfiguration",
        "lambda:UpdateFunctionCode",
        "lambda:PutFunctionConcurrency",
        "dynamodb:UpdateTable",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "kms:CreateKey",
        "kms:UpdateKeyDescription",
        "kms:EnableKey",
        "kms:DisableKey",
        "kms:PutKeyPolicy",
        "cloudtrail:CreateTrail",
        "cloudtrail:UpdateTrail",
        "cloudtrail:StartLogging",
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail"
      ],
      "Resource": "*"
    }
  ]
}`;

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function AwsSetupGuide() {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
            One-time setup
          </Badge>
          <span className="text-xs text-muted-foreground">~3 minutes in the AWS console</span>
        </div>
        <h3 className="mt-2 text-base font-semibold text-foreground">
          Create a read-only IAM user for Cirrus
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Cirrus only needs <span className="font-mono text-foreground">List*</span>,{" "}
          <span className="font-mono text-foreground">Get*</span>, and{" "}
          <span className="font-mono text-foreground">Describe*</span> permissions — no writes, no
          deletes. Your keys stay in your browser and are sent to our agents only for the duration
          of a single scan. They are never written to disk on our side.
        </p>
      </div>

      <Accordion type="single" collapsible defaultValue="step-1" className="px-2 py-2">
        <AccordionItem value="step-1">
          <AccordionTrigger className="px-3 text-sm">
            <span className="flex items-center gap-3">
              <StepDot n={1} /> Open the IAM console
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 text-sm text-muted-foreground space-y-2">
            <p>
              Sign in to AWS as a user that can create IAM users (an administrator works), then open
              the IAM console.
            </p>
            <a
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
              href="https://console.aws.amazon.com/iam/home#/users"
              target="_blank"
              rel="noreferrer"
            >
              console.aws.amazon.com/iam → Users <ExternalLink className="h-3 w-3" />
            </a>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step-2">
          <AccordionTrigger className="px-3 text-sm">
            <span className="flex items-center gap-3">
              <StepDot n={2} /> Create a user named{" "}
              <code className="font-mono text-foreground">cirrus-audit</code>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 text-sm text-muted-foreground space-y-2">
            <p>
              Click <strong className="text-foreground">Create user</strong>. Name it{" "}
              <code className="font-mono text-foreground">cirrus-audit</code>. Do{" "}
              <strong className="text-foreground">not</strong> enable console access — programmatic
              access only.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step-3">
          <AccordionTrigger className="px-3 text-sm">
            <span className="flex items-center gap-3">
              <StepDot n={3} /> Attach the Cirrus policy
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 text-sm text-muted-foreground space-y-3">
            <p>
              Choose <strong className="text-foreground">Attach policies directly</strong> →{" "}
              <strong className="text-foreground">Create policy</strong>, switch to the JSON tab,
              and paste:
            </p>
            <div className="relative">
              <pre className="terminal max-h-72 overflow-auto pr-12 text-xs">{POLICY_JSON}</pre>
              <button
                onClick={() => copy(POLICY_JSON, "Policy JSON")}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <p>
              Name the policy <code className="font-mono text-foreground">CirrusAuditPolicy</code>
              , save it, then attach it to the{" "}
              <code className="font-mono text-foreground">cirrus-audit</code> user.
            </p>
            <div className="rounded border border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-2">
              <p>
                <strong className="text-amber-900 dark:text-amber-100 font-semibold">Remediation permissions included:</strong> This inline policy includes both read-only audit permissions and CloudFormation one-click remediation actions.
              </p>
              <p className="text-[11px] leading-relaxed opacity-95">
                Note that one-click remediation capabilities can only execute if the operator credentials themselves have power-user privileges (e.g., <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded text-amber-900 dark:text-amber-100">iam:PutUserPolicy</code>). A pure read-only key cannot execute stack mutations or modifications without administrative access.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step-4">
          <AccordionTrigger className="px-3 text-sm">
            <span className="flex items-center gap-3">
              <StepDot n={4} /> Generate an access key
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 text-sm text-muted-foreground space-y-2">
            <p>
              Open the user, go to <strong className="text-foreground">Security credentials</strong>{" "}
              → <strong className="text-foreground">Create access key</strong>, and choose{" "}
              <strong className="text-foreground">Third-party service</strong>.
            </p>
            <p>
              AWS will display the <code className="font-mono text-foreground">Access key ID</code>{" "}
              and <code className="font-mono text-foreground">Secret access key</code> exactly once
              — paste them into the form on the right.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step-5">
          <AccordionTrigger className="px-3 text-sm">
            <span className="flex items-center gap-3">
              <StepDot n={5} /> (Optional) Use temporary credentials
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 text-sm text-muted-foreground space-y-2">
            <p>
              For extra safety, assume a role with{" "}
              <code className="font-mono text-foreground">aws sts assume-role</code> and paste the
              temporary <code className="font-mono text-foreground">AccessKeyId</code>,{" "}
              <code className="font-mono text-foreground">SecretAccessKey</code>, and{" "}
              <code className="font-mono text-foreground">SessionToken</code>. They expire
              automatically.
            </p>
            <pre className="terminal text-xs">
              <span className="prompt">$ </span>aws sts assume-role \{"\n"} --role-arn
              arn:aws:iam::123456789012:role/CirrusAuditor \{"\n"} --role-session-name cirrus-scan
            </pre>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="step-6">
          <AccordionTrigger className="px-3 text-sm">
            <span className="flex items-center gap-3">
              <StepDot n={6} /> When you're done
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-4 text-sm text-muted-foreground space-y-2">
            <p>
              Either delete the access key under{" "}
              <strong className="text-foreground">Security credentials</strong>, or delete the user
              entirely. Cirrus does not persist your keys, but rotating them is always good hygiene.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function StepDot({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] text-primary">
      {n}
    </span>
  );
}
