import { jsPDF } from "jspdf";
import type { MeetingRecord } from "../types";

export function generateMeetingMinutesPDF(meeting: MeetingRecord): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let currentY = 16;

  // Helper for page break
  const checkPageBreak = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - margin) {
      doc.addPage();
      currentY = margin;
      drawHeaderFooter();
    }
  };

  const drawHeaderFooter = () => {
    // Top subtle bar
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageWidth, 4, "F");
  };

  drawHeaderFooter();

  // Header Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(24, 24, 27); // Dark gray
  doc.text("MeetMinutes.ai — Meeting Minutes", margin, currentY);

  currentY += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(`Generated on ${new Date().toLocaleString()} | Official Record`, margin, currentY);

  currentY += 6;
  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, margin + contentWidth, currentY);

  currentY += 8;

  // Meeting Metadata Card / Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, "FD");

  // Metadata content
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`Meeting: ${meeting.title}`, margin + 4, currentY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`ID: ${meeting.id}`, margin + 4, currentY + 12);
  doc.text(`Date: ${meeting.date} at ${meeting.time}`, margin + 4, currentY + 18);

  doc.text(`Duration: ${meeting.duration}`, margin + contentWidth / 2 + 10, currentY + 12);
  doc.text(`Total Attendees: ${meeting.attendees.length}`, margin + contentWidth / 2 + 10, currentY + 18);

  currentY += 32;

  // 1. Executive Summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(180, 83, 9); // Indigo-600
  doc.text("1. Executive Summary", margin, currentY);

  currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);

  const summaryLines = doc.splitTextToSize(meeting.minutes.summary, contentWidth - 4);
  checkPageBreak(summaryLines.length * 5);
  doc.text(summaryLines, margin + 2, currentY);
  currentY += summaryLines.length * 5 + 6;

  // 2. Key Decisions
  checkPageBreak(15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(180, 83, 9);
  doc.text("2. Key Decisions & Agreements", margin, currentY);

  currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);

  meeting.minutes.keyDecisions.forEach((decision) => {
    const decisionLines = doc.splitTextToSize(`•  ${decision}`, contentWidth - 8);
    checkPageBreak(decisionLines.length * 5 + 2);
    doc.text(decisionLines, margin + 4, currentY);
    currentY += decisionLines.length * 5 + 2;
  });

  currentY += 4;

  // 3. Action Items
  checkPageBreak(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(180, 83, 9);
  doc.text("3. Action Items & Next Steps", margin, currentY);

  currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  meeting.minutes.actionItems.forEach((item, idx) => {
    const statusText = item.completed ? "[Completed]" : "[Pending]";
    const itemText = `${idx + 1}. ${item.task} — Assignee: ${item.assignee} | Due: ${item.dueDate} ${statusText}`;
    const lines = doc.splitTextToSize(itemText, contentWidth - 8);
    checkPageBreak(lines.length * 5 + 2);

    doc.setTextColor(item.completed ? 22 : 30, item.completed ? 101 : 41, item.completed ? 52 : 59);
    doc.text(lines, margin + 4, currentY);
    currentY += lines.length * 5 + 3;
  });

  currentY += 4;

  // 4. Attendance & Participation
  checkPageBreak(25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(180, 83, 9);
  doc.text("4. Attendance & Participation Record", margin, currentY);

  currentY += 6;

  // Attendance Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, currentY, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  doc.text("Participant Name", margin + 3, currentY + 4.8);
  doc.text("Role", margin + 55, currentY + 4.8);
  doc.text("Status", margin + 90, currentY + 4.8);
  doc.text("Speaking Time", margin + 120, currentY + 4.8);
  doc.text("Time Window", margin + 148, currentY + 4.8);

  currentY += 8;

  // Attendance rows
  meeting.attendees.forEach((att, index) => {
    checkPageBreak(8);
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY - 1, contentWidth, 6.5, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);

    doc.text(att.name, margin + 3, currentY + 3.8);
    doc.text(att.role, margin + 55, currentY + 3.8);

    // Status color
    if (att.status === "Present") {
      doc.setTextColor(16, 185, 129); // Emerald
    } else {
      doc.setTextColor(245, 158, 11); // Amber
    }
    doc.text(att.status, margin + 90, currentY + 3.8);

    doc.setTextColor(30, 41, 59);
    doc.text(`${att.speakingTimePct}% of meeting`, margin + 120, currentY + 3.8);
    doc.text(`${att.joinedAt} - ${att.leftAt}`, margin + 148, currentY + 3.8);

    currentY += 6.5;
  });

  // Footer for each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `MeetMinutes.ai • Meeting ID: ${meeting.id} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  // Sanitize filename
  const cleanId = meeting.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `MeetMinutes_${cleanId}_${Date.now()}.pdf`;
  doc.save(fileName);
}
