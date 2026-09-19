from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=schemas.AdminStats)
def stats(db: Session = Depends(get_db), _admin: models.User = Depends(get_current_admin)):
    return schemas.AdminStats(
        total_users=db.query(models.User).count(),
        total_children=db.query(models.Child).count(),
        total_scans=db.query(models.ScanEvent).count(),
        open_reports=db.query(models.AbuseReport)
        .filter(models.AbuseReport.status == models.ReportStatus.open)
        .count(),
        suspended_users=db.query(models.User).filter(models.User.is_suspended == True).count(),  # noqa: E712
    )


@router.get("/reports", response_model=list[schemas.AbuseReportOut])
def list_reports(db: Session = Depends(get_db), _admin: models.User = Depends(get_current_admin)):
    return db.query(models.AbuseReport).order_by(models.AbuseReport.created_at.desc()).all()


@router.post("/reports/{report_id}/status/{new_status}")
def update_report_status(
    report_id: str,
    new_status: models.ReportStatus,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    report = db.query(models.AbuseReport).filter(models.AbuseReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = new_status
    db.add(models.AuditLog(actor=admin.email, action="report_status_change",
                            detail=f"report={report_id} -> {new_status}"))
    db.commit()
    return {"status": "updated"}


@router.post("/users/{user_id}/suspend")
def suspend_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_suspended = True
    db.add(models.AuditLog(actor=admin.email, action="suspend_user", detail=f"user={user_id}"))
    db.commit()
    return {"status": "suspended"}


@router.post("/users/{user_id}/unsuspend")
def unsuspend_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_suspended = False
    db.add(models.AuditLog(actor=admin.email, action="unsuspend_user", detail=f"user={user_id}"))
    db.commit()
    return {"status": "active"}


@router.get("/audit-logs")
def audit_logs(db: Session = Depends(get_db), _admin: models.User = Depends(get_current_admin)):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(200).all()
    return [
        {"id": l.id, "actor": l.actor, "action": l.action, "detail": l.detail, "created_at": l.created_at}
        for l in logs
    ]
