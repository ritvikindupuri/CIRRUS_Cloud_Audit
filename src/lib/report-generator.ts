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
}

export function generatePentestReport(scan: ScanData, findings: FindingData[]) {
  const doc = new jsPDF();

  // Colors
  const colors = {
    primary: [41, 128, 185],
    critical: [231, 76, 60],
    high: [230, 126, 34],
    medium: [241, 196, 15],
    low: [52, 152, 219],
    info: [149, 165, 166],
    dark: [44, 62, 80],
    light: [236, 240, 241],
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return colors.critical;
      case "high":
        return colors.high;
      case "medium":
        return colors.medium;
      case "low":
        return colors.low;
      default:
        return colors.info;
    }
  };

  let currentY = 20;
  const leftMargin = 15;
  const rightMargin = 195;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Helper function to add a new page if needed
  const checkPageBreak = (neededSpace: number) => {
    if (currentY + neededSpace > 280) {
      doc.addPage();
      currentY = 20;
    }
  };

  // TITLE PAGE
  doc.setFontSize(28);
  doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
  doc.text("Cirrus Penetration Test Report", pageWidth / 2, 80, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.text(`Scan Name: ${scan.name}`, pageWidth / 2, 100, { align: "center" });

  const targetAccount = scan.aws_account_alias || scan.aws_account_id || "Unknown Account";
  doc.text(`Target Account: ${targetAccount}`, pageWidth / 2, 110, { align: "center" });
  doc.text(`Target Region: ${scan.region}`, pageWidth / 2, 120, { align: "center" });
  doc.text(`Date: ${new Date(scan.created_at).toLocaleDateString()}`, pageWidth / 2, 130, {
    align: "center",
  });

  doc.addPage();
  currentY = 20;

  // EXECUTIVE SUMMARY
  doc.setFontSize(22);
  doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
  doc.text("Executive Summary", leftMargin, currentY);
  currentY += 10;

  doc.setFontSize(12);
  doc.setTextColor(60);
  const summaryText = `This report details the findings from an automated penetration test conducted by Cirrus autonomous agents on the AWS environment for account ${targetAccount}. The assessment was designed to identify security misconfigurations, overly permissive IAM policies, exposed resources, and other potential vulnerabilities.`;
  const splitSummary = doc.splitTextToSize(summaryText, rightMargin - leftMargin);
  doc.text(splitSummary, leftMargin, currentY);
  currentY += splitSummary.length * 6 + 10;

  // FINDINGS OVERVIEW
  doc.setFontSize(18);
  doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
  doc.text("Findings Overview", leftMargin, currentY);
  currentY += 10;

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f) => {
    severityCounts[f.severity]++;
  });

  const overviewData = [
    ["Severity", "Count"],
    ["Critical", severityCounts.critical.toString()],
    ["High", severityCounts.high.toString()],
    ["Medium", severityCounts.medium.toString()],
    ["Low", severityCounts.low.toString()],
    ["Info", severityCounts.info.toString()],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [overviewData[0]],
    body: overviewData.slice(1),
    theme: "grid",
    headStyles: { fillColor: colors.primary as [number, number, number] },
    willDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const severity = data.cell.raw as string;
        doc.setTextColor(
          getSeverityColor(severity.toLowerCase())[0],
          getSeverityColor(severity.toLowerCase())[1],
          getSeverityColor(severity.toLowerCase())[2],
        );
        doc.setFont("helvetica", "bold");
      }
    },
    didDrawPage: (data) => {
      currentY = data.cursor ? data.cursor.y + 15 : currentY;
    },
  });

  currentY += 15;
  checkPageBreak(50);

  // DETAILED FINDINGS
  doc.setFontSize(22);
  doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
  doc.text("Detailed Findings", leftMargin, currentY);
  currentY += 15;

  if (findings.length === 0) {
    doc.setFontSize(12);
    doc.text("No findings were discovered during this scan.", leftMargin, currentY);
  }

  // Sort findings by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortedFindings = [...findings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  sortedFindings.forEach((finding, index) => {
    checkPageBreak(60);

    const sevColor = getSeverityColor(finding.severity);

    // Finding Header
    doc.setFillColor(colors.light[0], colors.light[1], colors.light[2]);
    doc.rect(leftMargin, currentY - 5, rightMargin - leftMargin, 12, "F");

    doc.setFontSize(14);
    doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
    doc.setFont("helvetica", "bold");
    const titleText = `${index + 1}. ${finding.title}`;
    const splitTitle = doc.splitTextToSize(titleText, rightMargin - leftMargin - 30);
    doc.text(splitTitle, leftMargin + 2, currentY + 3);

    // Severity Badge
    doc.setFontSize(10);
    doc.setTextColor(sevColor[0], sevColor[1], sevColor[2]);
    doc.text(`[${finding.severity.toUpperCase()}]`, rightMargin - 2, currentY + 3, {
      align: "right",
    });

    currentY += splitTitle.length * 6 + 10;
    doc.setFont("helvetica", "normal");

    // Resource
    if (finding.resource) {
      doc.setFontSize(11);
      doc.setTextColor(80);
      doc.setFont("helvetica", "bold");
      doc.text("Affected Resource:", leftMargin, currentY);
      doc.setFont("helvetica", "normal");

      const splitResource = doc.splitTextToSize(finding.resource, rightMargin - leftMargin - 30);
      doc.text(splitResource, leftMargin + 35, currentY);
      currentY += splitResource.length * 5 + 5;
    }

    // Description
    if (finding.description) {
      doc.setFontSize(11);
      doc.setTextColor(60);
      const splitDesc = doc.splitTextToSize(finding.description, rightMargin - leftMargin);
      doc.text(splitDesc, leftMargin, currentY);
      currentY += splitDesc.length * 5 + 10;
    }

    currentY += 5;
  });

  // CONCLUSION
  checkPageBreak(50);
  doc.setFontSize(22);
  doc.setTextColor(colors.dark[0], colors.dark[1], colors.dark[2]);
  doc.text("Conclusion", leftMargin, currentY);
  currentY += 10;

  doc.setFontSize(12);
  doc.setTextColor(60);
  const conclusionText = `The automated assessment successfully mapped and evaluated the target AWS environment. Review the detailed findings above to prioritize remediation efforts. It is highly recommended to address Critical and High severity findings immediately to mitigate potential risk. Continuous monitoring and regular assessments should be implemented to maintain a strong security posture.`;
  const splitConclusion = doc.splitTextToSize(conclusionText, rightMargin - leftMargin);
  doc.text(splitConclusion, leftMargin, currentY);

  // Footer (add page numbers)
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: "center" });
    doc.text(`Cirrus Automated Security`, 15, 290);
  }

  // Save the PDF
  const filename = `Cirrus_Pentest_Report_${scan.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}
