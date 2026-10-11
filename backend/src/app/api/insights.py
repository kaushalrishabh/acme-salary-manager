"""Insights routes: three separate GETs, one per dimension. Public: no
auth exists yet, and none is needed for a read-only endpoint.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_session
from app.insights_service import InsightsService
from app.schemas import (
    CountryInsightsResponse,
    DepartmentInsightsResponse,
    JobTitleInsightsResponse,
)

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/country")
def country_insights(session: Session = Depends(get_session)) -> CountryInsightsResponse:
    return InsightsService(session).country_insights()


@router.get("/department")
def department_insights(session: Session = Depends(get_session)) -> DepartmentInsightsResponse:
    return InsightsService(session).department_insights()


@router.get("/job-title")
def job_title_insights(session: Session = Depends(get_session)) -> JobTitleInsightsResponse:
    return InsightsService(session).job_title_insights()
