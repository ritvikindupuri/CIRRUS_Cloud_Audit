import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ScanData {
  id: string;
  name: string;
  region: string;
  aws_account_id: string | null;
  aws_account_alias: string | null;
  created_at: string;
  selected_agents: string[];
}

interface FindingData {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  resource: string | null;
  remediation?: Record<string, unknown> | null;
}

export function generateSecurityReport(scan: ScanData, findings: FindingData[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // Color Palette
  const colors = {
    primary: [26, 54, 93],       // Deep Slate Navy
    secondary: [49, 151, 149],   // Muted Teal
    darkText: [45, 55, 72],      // Charcoal
    lightBackground: [247, 250, 252], // Off-white/slate
    border: [226, 232, 240],     // Light grey
    
    // Severity colors
    critical: [229, 62, 62],     // Red
    high: [221, 107, 32],        // Orange
    medium: [214, 158, 46],      // Gold
    low: [49, 130, 206],         // Blue
    info: [113, 128, 150]        // Slate Grey
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical": return colors.critical;
      case "high": return colors.high;
      case "medium": return colors.medium;
      case "low": return colors.low;
      default: return colors.info;
    }
  };

  const detectService = (f: FindingData) => {
    const title = f.title.toLowerCase();
    const resource = (f.resource ?? "").toLowerCase();
    if (title.includes("s3") || resource.includes("arn:aws:s3")) return "S3";
    if (title.includes("iam") || title.includes("user") || title.includes("role") || title.includes("policy") || resource.includes("arn:aws:iam")) return "IAM";
    if (title.includes("security group") || title.includes("ec2") || title.includes("port") || title.includes("ingress") || resource.includes("sg-") || resource.includes("i-")) return "EC2";
    if (title.includes("rds") || title.includes("database") || resource.includes("arn:aws:rds")) return "RDS";
    if (title.includes("lambda") || resource.includes("arn:aws:lambda")) return "Lambda";
    if (title.includes("dynamodb") || resource.includes("arn:aws:dynamodb")) return "DynamoDB";
    if (title.includes("kms") || resource.includes("arn:aws:kms")) return "KMS";
    if (title.includes("cloudtrail") || resource.includes("arn:aws:cloudtrail")) return "CloudTrail";
    return "AWS General";
  };

  let currentY = 20;
  const leftMargin = 15;
  const rightMargin = 195;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const checkPageBreak = (neededSpace: number) => {
    if (currentY + neededSpace > 275) {
      doc.addPage();
      currentY = 20;
      return true;
    }
    return false;
  };

  // Helper for drawing styled block quotes/banners
  const drawBanner = (text: string, subText: string, sevColor: number[]) => {
    checkPageBreak(32);
    
    // Draw left border strip
    doc.setFillColor(sevColor[0], sevColor[1], sevColor[2]);
    doc.rect(leftMargin, currentY, 3, 22, "F");
    
    // Draw shaded background
    doc.setFillColor(colors.lightBackground[0], colors.lightBackground[1], colors.lightBackground[2]);
    doc.rect(leftMargin + 3, currentY, rightMargin - leftMargin - 3, 22, "F");
    
    // Draw text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);
    doc.text(text, leftMargin + 8, currentY + 7);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(113, 128, 150);
    const splitSub = doc.splitTextToSize(subText, rightMargin - leftMargin - 15);
    doc.text(splitSub, leftMargin + 8, currentY + 13);
    
    currentY += 27;
  };

  // Helper for drawing code blocks (supporting multi-page split automatically)
  const drawCodeBlock = (title: string, code: string) => {
    const splitCode = doc.splitTextToSize(code.trim(), rightMargin - leftMargin - 10);
    const lineHeight = 4.2;
    const padding = 5;
    const headerHeight = 6;

    // Label
    checkPageBreak(headerHeight + padding + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(74, 85, 104);
    doc.text(title, leftMargin, currentY);
    currentY += headerHeight;

    let lineIndex = 0;
    while (lineIndex < splitCode.length) {
      // Calculate remaining printable height on current page
      const remainingHeight = pageHeight - currentY - 15; // 15mm bottom margin
      if (remainingHeight < (lineHeight + padding * 2)) {
        doc.addPage();
        currentY = 20;
      }

      const usableHeight = pageHeight - currentY - 15;
      const maxLinesOnThisPage = Math.floor((usableHeight - padding * 2) / lineHeight);
      const linesToPrint = Math.min(maxLinesOnThisPage, splitCode.length - lineIndex);

      if (linesToPrint <= 0) {
        doc.addPage();
        currentY = 20;
        continue;
      }

      const chunk = splitCode.slice(lineIndex, lineIndex + linesToPrint);
      const chunkHeight = (chunk.length * lineHeight) + padding * 2;

      // Background box for this chunk
      doc.setFillColor(40, 44, 52); // Dark editor theme
      doc.rect(leftMargin, currentY, rightMargin - leftMargin, chunkHeight, "F");

      // Code text
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.setTextColor(171, 178, 191);
      doc.text(chunk, leftMargin + 4, currentY + padding + 1.5);

      currentY += chunkHeight;
      lineIndex += linesToPrint;

      // If we have more lines to print, force page break
      if (lineIndex < splitCode.length) {
        doc.addPage();
        currentY = 20;
      }
    }

    currentY += 6; // Spacing after block
  };

  // Helper for drawing long text paragraphs (supporting page breaks dynamically line-by-line)
  const drawParagraph = (title: string, text: string) => {
    checkPageBreak(15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(74, 85, 104);
    doc.text(title, leftMargin, currentY);
    currentY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);

    const splitText = doc.splitTextToSize(text, rightMargin - leftMargin);
    const lineHeight = 4.5;

    for (let i = 0; i < splitText.length; i++) {
      checkPageBreak(lineHeight + 5);
      doc.text(splitText[i], leftMargin, currentY);
      currentY += lineHeight;
    }
    currentY += 4; // Spacing after paragraph
  };

  // 1. COVER PAGE
  // Top thick colored banner
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Secondary thin border banner
  doc.setFillColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
  doc.rect(0, 28, pageWidth, 2, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("CIRRUS", leftMargin, 85);

  doc.setFontSize(22);
  doc.setFont("helvetica", "normal");
  doc.text("Cloud Security Assessment Report", leftMargin, 97);

  // Decorative divider
  doc.setDrawColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
  doc.setLineWidth(1);
  doc.line(leftMargin, 105, leftMargin + 60, 105);

  // Project details card
  doc.setFillColor(colors.lightBackground[0], colors.lightBackground[1], colors.lightBackground[2]);
  doc.rect(leftMargin, 140, rightMargin - leftMargin, 85, "F");
  doc.rect(leftMargin, 140, rightMargin - leftMargin, 85, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("ASSESSMENT TARGET AND SCOPE", leftMargin + 8, 150);

  const targetAccount = scan.aws_account_alias 
    ? `${scan.aws_account_alias} (${scan.aws_account_id})` 
    : (scan.aws_account_id || "Unknown Account ID");

  const metadata = [
    ["Scan Session ID", scan.id],
    ["Scan Config Name", scan.name],
    ["Target Account", targetAccount],
    ["Audited AWS Region", scan.region],
    ["Execution Date", new Date(scan.created_at).toLocaleString()],
    ["Assessor Agent", "Cirrus Autonomous AI Engine v1.2"]
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);

  let metaY = 162;
  metadata.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, leftMargin + 8, metaY);
    doc.setFont("helvetica", "normal");
    doc.text(value, leftMargin + 50, metaY);
    metaY += 10;
  });

  // Footer banner on cover
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(160, 174, 192);
  doc.text("CONFIDENTIAL - FOR INTERNAL REVIEW ONLY", pageWidth / 2, 275, { align: "center" });

  // 2. PAGE 2: EXECUTIVE SUMMARY & SECURITY METHODOLOGY
  doc.addPage();
  currentY = 25;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("1. Executive Summary & Scope", leftMargin, currentY);
  currentY += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);
  
  const introText = `This document provides the technical audit details resulting from the automated cloud security assessment executed by Cirrus within the AWS environment. The objective of this automated assessment was to evaluate configuration baselines, detect vulnerabilities (such as open security groups or unencrypted storage), analyze IAM policy boundaries, and compile a secure remediation roadmap.`;
  const splitIntro = doc.splitTextToSize(introText, rightMargin - leftMargin);
  doc.text(splitIntro, leftMargin, currentY);
  currentY += (splitIntro.length * 5) + 8;

  // Overview callout box
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f) => {
    severityCounts[f.severity]++;
  });
  const totalFindings = findings.length;

  const summaryStatement = `During the execution run, the Cirrus scan engine registered a total of ${totalFindings} findings matching your configuration constraints. Action is highly recommended on any Critical or High severity findings.`;
  drawBanner("Assessment Results Summary", summaryStatement, colors.secondary);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("2. Assessment Methodology", leftMargin, currentY);
  currentY += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(colors.darkText[0], colors.darkText[1], colors.darkText[2]);

  const methodologyText = `Assessment execution is handled by specialized AI security agents executing a ReAct (Reasoning and Acting) loop. These agents determine the optimal API actions to check resource structures against security compliance baselines. Each run is audited against native, read-only safety rules to prevent modifications during discovery.
  
• RECON Agent: Establishes initial authentication profile, lists active regions, aliases, and high-level posture.
• IAM Auditor: Evaluates roles, policies, group memberships, and credentials for privilege escalation risks.
• S3 Hunter: Reviews S3 block public access configurations, default encryptions, and bucket policies.
• EC2 Auditor: Inspects security groups, inbound firewall policies, and network-exposed configurations.`;
  const splitMethodology = doc.splitTextToSize(methodologyText, rightMargin - leftMargin);
  doc.text(splitMethodology, leftMargin, currentY);
  currentY += (splitMethodology.length * 5) + 12;

  // 3. PAGE 3: VULNERABILITY SUMMARY MATRIX
  checkPageBreak(90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("3. Vulnerability Summary Registry", leftMargin, currentY);
  currentY += 6;

  const overviewData = [
    ["Critical Severity", severityCounts.critical.toString()],
    ["High Severity", severityCounts.high.toString()],
    ["Medium Severity", severityCounts.medium.toString()],
    ["Low Severity", severityCounts.low.toString()],
    ["Info / Audits", severityCounts.info.toString()],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Risk Classification", "Total Findings Count"]],
    body: overviewData,
    theme: "striped",
    headStyles: { fillColor: colors.primary as [number, number, number] },
    willDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const rowVal = data.cell.raw as string;
        if (rowVal.startsWith("Critical")) doc.setTextColor(colors.critical[0], colors.critical[1], colors.critical[2]);
        else if (rowVal.startsWith("High")) doc.setTextColor(colors.high[0], colors.high[1], colors.high[2]);
        else if (rowVal.startsWith("Medium")) doc.setTextColor(colors.medium[0], colors.medium[1], colors.medium[2]);
        doc.setFont("helvetica", "bold");
      }
    },
    didDrawPage: (data) => {
      currentY = data.cursor ? data.cursor.y + 15 : currentY;
    }
  });

  // 4. DETAILED VULNERABILITY LOGS
  doc.addPage();
  currentY = 25;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text("4. Detailed Finding Reports", leftMargin, currentY);
  currentY += 12;

  if (findings.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(colors.info[0], colors.info[1], colors.info[2]);
    doc.text("No security findings were registered during this scan execution.", leftMargin, currentY);
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortedFindings = [...findings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  sortedFindings.forEach((f, idx) => {
    checkPageBreak(50);
    const sevColor = getSeverityColor(f.severity);
    const service = detectService(f);

    // Colored Title Banner
    drawBanner(
      `[${idx + 1}] ${f.title}`,
      `Risk Severity: ${f.severity.toUpperCase()}   |   Audited Service: ${service}`,
      sevColor
    );

    // Affected Resource
    if (f.resource) {
      checkPageBreak(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(74, 85, 104);
      doc.text("Target Affected Resource:", leftMargin, currentY);
      doc.setFont("helvetica", "normal");
      
      const splitResource = doc.splitTextToSize(f.resource, rightMargin - leftMargin - 45);
      doc.text(splitResource, leftMargin + 42, currentY);
      currentY += (splitResource.length * 5) + 3;
    }

    // Threat Description
    if (f.description) {
      drawParagraph("Impact Analysis & Description:", f.description);
    }

    // Remediation Playbook
    const remediation = f.remediation as { explanation?: string; cli?: string; cloudformation?: string } | null;
    if (remediation) {
      if (remediation.explanation) {
        drawParagraph("Remediation Strategy:", remediation.explanation);
      }

      if (remediation.cli && remediation.cli.trim()) {
        drawCodeBlock("AWS CLI Remediation Commands", remediation.cli);
      }

      if (remediation.cloudformation && remediation.cloudformation.trim()) {
        drawCodeBlock("CloudFormation Remediation Playbook", remediation.cloudformation);
      }
    }

    // Divider line
    checkPageBreak(10);
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, currentY, rightMargin, currentY);
    currentY += 12;
  });

  // 5. CONCLUSION & CONTINUOUS MONITORING
  doc.addPage();
  currentY = 25;
  const conclusionText = `The findings detailed above highlight configurations that do not meet standard security best practices. Remediation actions should be prioritize-scanned to evaluate drift. High priority actions:
  
1. Restrict all wildcard permissions (*) in user-attached policies to follow least-privilege principles.
2. Enable default server-side encryption (SSE-KMS) and block public access on all S3 data stores.
3. Close security group access for sensitive administrative ports (22, 3389, 3306) open to the internet.
4. Establish weekly scheduled scans to detect configuration drift and baseline changes.`;
  drawParagraph("5. Conclusion & Recommendations", conclusionText);

  // Pagination & Headers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Header (skip on cover page)
    if (i > 1) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(160, 174, 192);
      doc.text(`Cirrus Security Report · Target: ${scan.name}`, leftMargin, 12);
      doc.line(leftMargin, 14, rightMargin, 14);
    }
    
    // Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 174, 192);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 287, { align: "center" });
    doc.text("CONFIDENTIAL - SECURE ANALYSIS", leftMargin, 287);
  }

  // Save Document
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `Cirrus_Security_Report_${scan.name.replace(/\s+/g, "_")}_${dateStr}.pdf`;
  doc.save(filename);
}
