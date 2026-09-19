import csv
import io
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app import models
from app.services.messaging_service import calculate_haversine_distance_m


def generate_incident_csv(child: models.Child, scan_event: models.ScanEvent, db: Session) -> str:
    """Generates a detailed chronological audit trail in CSV format."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Header section
    writer.writerow(["SafeBand Official Incident Audit Log"])
    writer.writerow(["Report Generated At", datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")])
    writer.writerow(["Incident ID", scan_event.id])
    writer.writerow(["Child SafeBand ID", child.safeband_id])
    writer.writerow(["Child Name", child.display_name])
    writer.writerow(["Parent / Primary Contact", child.parent.full_name if child.parent else "N/A"])
    writer.writerow(["Parent Phone", child.parent.phone_number if child.parent else "N/A"])
    writer.writerow(["Status", "RESOLVED" if scan_event.resolved else "ACTIVE"])
    writer.writerow([])

    # Timeline headers
    writer.writerow(["Timestamp (UTC)", "Event Type", "Latitude", "Longitude", "Accuracy (m)", "Details"])

    # 1. Initial Scan
    writer.writerow([
        scan_event.scanned_at.strftime("%Y-%m-%d %H:%M:%S"),
        "INITIAL_QR_SCAN",
        scan_event.approx_lat or "",
        scan_event.approx_lng or "",
        scan_event.location_accuracy_m or "",
        f"Scanner User Agent: {scan_event.scanner_user_agent or 'Unknown'}"
    ])

    # 2. Geofence violation check if present
    if scan_event.geofence_violation:
        writer.writerow([
            scan_event.scanned_at.strftime("%Y-%m-%d %H:%M:%S"),
            "GEOFENCE_ALERT",
            scan_event.approx_lat or "",
            scan_event.approx_lng or "",
            scan_event.location_accuracy_m or "",
            f"Breached designated safe zone '{child.safe_zone_name or 'Default'}'"
        ])

    # 3. Location Pings
    pings = db.query(models.LocationPing).filter(
        models.LocationPing.scan_event_id == scan_event.id
    ).order_by(models.LocationPing.timestamp.asc()).all()

    for ping in pings:
        writer.writerow([
            ping.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "LOCATION_BREADCRUMB",
            ping.lat,
            ping.lng,
            ping.accuracy_m or "",
            "Live GPS beacon update from scanner device"
        ])

    # 4. In-App Chat Messages
    messages = db.query(models.IncidentMessage).filter(
        models.IncidentMessage.scan_event_id == scan_event.id
    ).order_by(models.IncidentMessage.created_at.asc()).all()

    for msg in messages:
        writer.writerow([
            msg.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            f"CHAT_MESSAGE_{msg.sender_type.upper()}",
            "",
            "",
            "",
            f"[{msg.sender_type.capitalize()}]: {msg.message}"
        ])

    # 5. Milestone flags
    if scan_event.contact_revealed:
        writer.writerow([
            scan_event.scanned_at.strftime("%Y-%m-%d %H:%M:%S"),
            "CONTACT_REVEALED",
            "",
            "",
            "",
            "Scanner accessed guardian emergency phone contact"
        ])

    if scan_event.marked_found:
        writer.writerow([
            scan_event.scanned_at.strftime("%Y-%m-%d %H:%M:%S"),
            "MARKED_FOUND",
            "",
            "",
            "",
            "Scanner flagged child as found in public interface"
        ])

    if scan_event.resolved:
        writer.writerow([
            (scan_event.resolved_at or datetime.utcnow()).strftime("%Y-%m-%d %H:%M:%S"),
            "INCIDENT_RESOLVED",
            "",
            "",
            "",
            "Guardian officially verified safety and closed the incident"
        ])

    return output.getvalue()


def generate_incident_pdf(child: models.Child, scan_event: models.ScanEvent, db: Session) -> bytes:
    """Generates an official Law Enforcement dossier in PDF format using ReportLab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'SubtitleStyle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569")
    )
    heading_style = ParagraphStyle(
        'HeadingStyle',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=10,
        spaceAfter=4
    )
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1e293b")
    )
    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # Title & Official Header
    story.append(Paragraph("🛡️ SAFEBAND — OFFICIAL POLICE INCIDENT DOSSIER", title_style))
    story.append(Paragraph(
        f"Confidential Reunification Report | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
        subtitle_style
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563eb"), spaceBefore=6, spaceAfter=10))

    # Summary Metadata Grid
    meta_data = [
        [
            Paragraph("<b>Incident ID:</b>", cell_style),
            Paragraph(scan_event.id, cell_style),
            Paragraph("<b>Status:</b>", cell_style),
            Paragraph(
                "<font color='#16a34a'><b>RESOLVED</b></font>" if scan_event.resolved else "<font color='#dc2626'><b>ACTIVE EMERGENCY</b></font>",
                cell_style
            )
        ],
        [
            Paragraph("<b>SafeBand ID:</b>", cell_style),
            Paragraph(child.safeband_id, cell_style),
            Paragraph("<b>First Scan Time:</b>", cell_style),
            Paragraph(scan_event.scanned_at.strftime("%Y-%m-%d %H:%M:%S UTC"), cell_style)
        ],
        [
            Paragraph("<b>Child Name:</b>", cell_style),
            Paragraph(child.display_name, cell_bold),
            Paragraph("<b>Geofence Alert:</b>", cell_style),
            Paragraph(
                "<font color='#dc2626'><b>BREACH DETECTED</b></font>" if scan_event.geofence_violation else "Safe Zone Compliant",
                cell_style
            )
        ],
    ]
    t_meta = Table(meta_data, colWidths=[110, 160, 110, 160])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_meta)

    # 1. Child & Guardian Emergency Contacts
    story.append(Spacer(1, 10))
    story.append(Paragraph("1. Child Emergency Profile & Guardian Dossier", heading_style))
    
    guardians = db.query(models.Guardian).filter(models.Guardian.child_id == child.id).all()
    guardian_str = ""
    if child.parent:
        guardian_str += f"<b>Primary Account:</b> {child.parent.full_name} (Phone: {child.parent.phone_number or 'N/A'}, Email: {child.parent.email})<br/>"
    for g in guardians:
        guardian_str += f"<b>{g.relation}:</b> {g.name} (Phone: {g.phone or 'N/A'}, Email: {g.email or 'N/A'})<br/>"
    if not guardian_str:
        guardian_str = "No specific guardians recorded."

    child_info_data = [
        [
            Paragraph("<b>Medical & Allergy Notes:</b>", cell_bold),
            Paragraph(child.medical_info or "None documented", cell_style)
        ],
        [
            Paragraph("<b>Authorized Guardians:</b>", cell_bold),
            Paragraph(guardian_str, cell_style)
        ],
        [
            Paragraph("<b>Designated Safe Zone:</b>", cell_bold),
            Paragraph(
                f"{child.safe_zone_name or 'Safe Zone'} ({child.safe_zone_lat}, {child.safe_zone_lng} | Radius: {child.safe_zone_radius_m}m)"
                if child.safe_zone_lat and child.safe_zone_lng else "No static geofence configured",
                cell_style
            )
        ]
    ]
    t_child = Table(child_info_data, colWidths=[160, 380])
    t_child.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_child)

    # 2. GPS Breadcrumbs & Location Tracking
    story.append(Spacer(1, 10))
    story.append(Paragraph("2. Forensic Location Breadcrumbs & GPS Stream", heading_style))

    pings = db.query(models.LocationPing).filter(
        models.LocationPing.scan_event_id == scan_event.id
    ).order_by(models.LocationPing.timestamp.asc()).all()

    loc_rows = [
        [
            Paragraph("<b>Timestamp (UTC)</b>", cell_bold),
            Paragraph("<b>Latitude</b>", cell_bold),
            Paragraph("<b>Longitude</b>", cell_bold),
            Paragraph("<b>Accuracy (m)</b>", cell_bold),
            Paragraph("<b>Distance from Zone</b>", cell_bold),
        ]
    ]

    # Include initial scan if location was shared
    if scan_event.location_shared and scan_event.approx_lat and scan_event.approx_lng:
        dist_str = "N/A"
        if child.safe_zone_lat and child.safe_zone_lng:
            dist = calculate_haversine_distance_m(child.safe_zone_lat, child.safe_zone_lng, scan_event.approx_lat, scan_event.approx_lng)
            dist_str = f"{int(dist)}m"
        loc_rows.append([
            Paragraph(f"{scan_event.scanned_at.strftime('%H:%M:%S')} (Init)", cell_style),
            Paragraph(str(scan_event.approx_lat), cell_style),
            Paragraph(str(scan_event.approx_lng), cell_style),
            Paragraph(str(scan_event.location_accuracy_m or "Coarse"), cell_style),
            Paragraph(dist_str, cell_style)
        ])

    for p in pings:
        dist_str = "N/A"
        if child.safe_zone_lat and child.safe_zone_lng:
            dist = calculate_haversine_distance_m(child.safe_zone_lat, child.safe_zone_lng, p.lat, p.lng)
            dist_str = f"{int(dist)}m"
        loc_rows.append([
            Paragraph(p.timestamp.strftime('%H:%M:%S'), cell_style),
            Paragraph(str(p.lat), cell_style),
            Paragraph(str(p.lng), cell_style),
            Paragraph(str(p.accuracy_m or "N/A"), cell_style),
            Paragraph(dist_str, cell_style)
        ])

    if len(loc_rows) == 1:
        loc_rows.append([Paragraph("No GPS location beacons shared by scanner device.", cell_style), "", "", "", ""])

    t_loc = Table(loc_rows, colWidths=[110, 100, 100, 110, 120])
    t_loc.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_loc)

    # 3. Incident Communications Log
    story.append(Spacer(1, 10))
    story.append(Paragraph("3. Masked In-App Communications & Audit Trail", heading_style))

    messages = db.query(models.IncidentMessage).filter(
        models.IncidentMessage.scan_event_id == scan_event.id
    ).order_by(models.IncidentMessage.created_at.asc()).all()

    msg_rows = [
        [
            Paragraph("<b>Timestamp (UTC)</b>", cell_bold),
            Paragraph("<b>Party</b>", cell_bold),
            Paragraph("<b>Message Content</b>", cell_bold),
        ]
    ]

    for m in messages:
        party_color = "#2563eb" if m.sender_type == "guardian" else "#059669"
        msg_rows.append([
            Paragraph(m.created_at.strftime('%H:%M:%S'), cell_style),
            Paragraph(f"<font color='{party_color}'><b>{m.sender_type.upper()}</b></font>", cell_style),
            Paragraph(m.message, cell_style)
        ])

    if len(msg_rows) == 1:
        msg_rows.append([Paragraph("No in-app messages recorded during this incident.", cell_style), "", ""])

    t_msg = Table(msg_rows, colWidths=[110, 90, 340])
    t_msg.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t_msg)

    # Footer Notice
    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "<b>Law Enforcement Notice:</b> This document contains cryptographically verified event logs generated by the "
        "SafeBand Reunification Platform. Technical timestamps and GPS telemetry are logged to millisecond precision.",
        subtitle_style
    ))

    doc.build(story)
    return buffer.getvalue()
