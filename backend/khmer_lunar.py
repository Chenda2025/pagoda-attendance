"""Best-effort Khmer (Buddhist) lunar calendar conversion.

This uses the mean synodic month anchored to a known astronomical new moon
(2000-01-06) to compute moon phase and lunar month — NOT the official Khmer
Suriyayart algorithm, which additionally inserts leap months/days on an
irregular multi-year schedule. Expect the moon-phase day to be accurate to
within about a day, and the lunar month name to occasionally drift by one
position in leap-month years. Good enough for a display subtitle; verify
against an authoritative Khmer almanac before using it for anything where
the exact date matters.
"""
import datetime

_SYNODIC_MONTH      = 29.530588853  # mean days per lunar month
_REFERENCE_NEW_MOON = datetime.date(2000, 1, 6)

_LUNAR_MONTHS = [
    'មិគសិរ', 'បុស្យ', 'មាឃ', 'ផល្គុន', 'ចេត្រ', 'ពិសាខ',
    'ជេស្ឋ', 'អាសាឍ', 'ស្រាពណ៍', 'ភទ្របទ', 'អស្សុជ', 'កត្តិក',
]

_KHMER_DIGITS = '០១២៣៤៥៦៧៨៩'


def _khmer_num(n: int) -> str:
    return ''.join(_KHMER_DIGITS[int(c)] for c in str(n))


def buddhist_era_year(d: datetime.date) -> int:
    """Approximate ព.ស. (Buddhist Era) year — the changeover happens around
    Khmer New Year (mid-April), not January 1."""
    cutoff = datetime.date(d.year, 4, 14)
    return d.year + 544 if d >= cutoff else d.year + 543


def khmer_lunar_date(d: datetime.date) -> str:
    """Return e.g. 'ថ្ងៃ៨កើត ខែពិសាខ ព.ស.២៥៦៩' for the given Gregorian date."""
    days_since_ref = (d - _REFERENCE_NEW_MOON).days
    moon_age     = days_since_ref % _SYNODIC_MONTH
    month_index  = int(days_since_ref // _SYNODIC_MONTH) % 12
    month_name   = _LUNAR_MONTHS[month_index]

    if moon_age < 15:
        phase_day = int(moon_age) + 1
        phase     = 'កើត'
    else:
        phase_day = int(moon_age) - 14
        phase     = 'រោច'

    be_year = buddhist_era_year(d)
    return f"ថ្ងៃ{_khmer_num(phase_day)}{phase} ខែ{month_name} ព.ស.{_khmer_num(be_year)}"
