"""Hierarchical sort order for the monk/attendance roster.

Cascades three levels, strictly in this priority order:
  1. Monk type (ប្រភេទ)  — ភិក្ខុ before សាមណេរ, regardless of role/position
  2. Role (តួនាទី)      — fixed pagoda hierarchy, ascending rank (1 = highest)
  3. Vassa (វស្សា)        — descending (more years = more senior); NULL treated as 0

Ordination status outranks administrative position: a សាមណេរ holding a
position (e.g. អនុកុដិ) still sorts below every ភិក្ខុ, even an ordinary one.
"""

# Rank 1 is highest priority, rank 10 is lowest among the named tiers.
# Roles that exist in the data model but have no defined seniority of their
# own (deputy/assistant posts not part of the core hierarchy) share a single
# "unranked committee/group" tier, placed just above ordinary monks.
_UNRANKED_TIER = 10

ROLE_RANK = {
    'ព្រះអធិការ':                 1,   # Chief Monk
    'ព្រះគ្រូសូត្រស្តាំ':           2,   # Right Chanting Master
    'ព្រះគ្រូសូត្រឆ្វេង':           3,   # Left Chanting Master
    'ព្រះគ្រូវិន័យធរ':             4,   # Discipline Master
    'ព្រះគ្រូលេខា':                5,   # Secretary
    'មេក្រុម':                    6,   # Group Leader
    'ព្រះគ្រូប្រធានការក':          7,   # Head of Working Committee
    'មេកុដិ':                     8,   # Head of Kuti
    'អនុកុដិ':                    9,   # Deputy of Kuti

    # Valid positions with no individually-defined seniority — bucketed
    # together one tier above ordinary monks.
    'អនុមេក្រុម':                  _UNRANKED_TIER,   # Deputy Group Leader
    'ព្រះគ្រូអនុប្រធានការកទី១':     _UNRANKED_TIER,   # Deputy Head of Working Committee No.1
    'ព្រះគ្រូអនុប្រធានការកទី២':     _UNRANKED_TIER,   # Deputy Head of Working Committee No.2

    'ព្រះសង្ឃធម្មតា':              11,  # Ordinary Monk
}

# Anything not in ROLE_RANK (missing/unrecognized) sorts after every known role.
_UNKNOWN_ROLE_RANK = max(ROLE_RANK.values()) + 1

# ភិក្ខុ (fully ordained) outranks សាមណេរ (novice); unrecognized types sort last.
MONK_TYPE_RANK = {
    'ភិក្ខុ':    0,
    'សាមណេរ':   1,
}
_UNKNOWN_MONK_TYPE_RANK = max(MONK_TYPE_RANK.values()) + 1


def _attendance_sort_key(monk: dict):
    type_rank = MONK_TYPE_RANK.get(monk.get('monk_type'), _UNKNOWN_MONK_TYPE_RANK)
    role_rank = ROLE_RANK.get(monk.get('position'), _UNKNOWN_ROLE_RANK)
    vassa = monk.get('vassa_years') or 0
    return (type_rank, role_rank, -vassa)


def sort_attendance_monks(monks: list) -> list:
    """Sort monk dicts by monk type, then role, then vassa (desc).

    Each item must be a dict with 'position', 'monk_type', and
    'vassa_years' keys — the shape already produced by list_monks().
    Stable: monks tying on all three levels keep their incoming order.
    """
    return sorted(monks, key=_attendance_sort_key)
