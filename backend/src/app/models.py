"""SQLAlchemy 2.x models: CurrencyRate and Employee.

Exactly the tables described in docs/design-notes.md. No business logic
here: deriving currency from country, converting salary to USD cents, and
lowercasing email all belong to the service layer.
"""

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# A fixed naming convention so every constraint has a stable, predictable
# name on both SQLite and Postgres, and under future migrations.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class CurrencyRate(Base):
    __tablename__ = "currency_rates"
    __table_args__ = (
        CheckConstraint("usd_rate_scaled > 0", name="usd_rate_scaled_positive"),
        CheckConstraint("minor_unit BETWEEN 0 AND 3", name="minor_unit_range"),
    )

    currency_code: Mapped[str] = mapped_column(String(3), primary_key=True)
    minor_unit: Mapped[int] = mapped_column(SmallInteger)
    usd_rate_scaled: Mapped[int] = mapped_column(BigInteger)


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint("annual_gross_salary_minor > 0", name="annual_gross_salary_minor_positive"),
        CheckConstraint(
            "annual_gross_salary_usd_cents >= 0",
            name="annual_gross_salary_usd_cents_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200), index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    job_title: Mapped[str] = mapped_column(String(100), index=True)
    department: Mapped[str] = mapped_column(String(100), index=True)
    country: Mapped[str] = mapped_column(String(2), index=True)
    currency: Mapped[str] = mapped_column(String(3), ForeignKey("currency_rates.currency_code"))
    annual_gross_salary_minor: Mapped[int] = mapped_column(BigInteger)
    annual_gross_salary_usd_cents: Mapped[int] = mapped_column(BigInteger, index=True)
    hire_date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
