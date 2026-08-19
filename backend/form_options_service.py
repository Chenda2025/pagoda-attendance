"""Configurable dropdown options for monk entry forms."""

from conn import connect_db

FIELD_KEYS = (
    'monk_type',
    'residence',
    'position',
    'education_level',
    'academic_year',
)

DEFAULT_OPTIONS = {
    'monk_type': [
        ('សាមណេរ', 'សាមណេរ'),
        ('ភិក្ខុ', 'ភិក្ខុ'),
    ],
    'residence': [
        ('កុដិលេខ១', 'កុដិលេខ១'),
        ('កុដិលេខ២_ជាន់ក្រោម', 'កុដិលេខ២ ជាន់ក្រោម'),
        ('កុដិលេខ២_ជាន់លើ', 'កុដិលេខ២ ជាន់លើ'),
        ('កុដិលេខ៤', 'កុដិលេខ៤'),
        ('កុដិធំ_ជាន់ទី១', 'កុដិធំ ជាន់ទី១'),
        ('កុដិធំ_ជាន់ទី២', 'កុដិធំ ជាន់ទី២'),
        ('កុដិធំ_ជាន់ទី៣', 'កុដិធំ ជាន់ទី៣'),
        ('កុដិហោត្រៃ', 'កុដិហោត្រៃ'),
        ('សាលាបាលីចាស់', 'សាលាបាលីចាស់'),
        ('សាលាពុទ្ធិក', 'សាលាពុទ្ធិក'),
    ],
    'position': [
        ('សមណសិស្ស', 'សមណសិស្ស'),
        ('ព្រះអធិការ', 'ព្រះអធិការ'),
        ('ព្រះគ្រូសូត្រស្តាំ', 'ព្រះគ្រូសូត្រស្តាំ'),
        ('ព្រះគ្រូសូត្រឆ្វេង', 'ព្រះគ្រូសូត្រឆ្វេង'),
        ('ព្រះគ្រូវិន័យធរ', 'ព្រះគ្រូវិន័យធរ'),
        ('ព្រះគ្រូលេខា', 'ព្រះគ្រូលេខា'),
        ('ព្រះគ្រូប្រធានការក', 'ព្រះគ្រូប្រធានការក'),
        ('ព្រះគ្រូអនុប្រធានការកទី១', 'ព្រះគ្រូអនុប្រធានការកទី១'),
        ('ព្រះគ្រូអនុប្រធានការកទី២', 'ព្រះគ្រូអនុប្រធានការកទី២'),
        ('មេកុដិ', 'មេកុដិ'),
        ('អនុកុដិ', 'អនុកុដិ'),
        ('ព្រះសង្ឃធម្មតា', 'ព្រះសង្ឃធម្មតា'),
        ('មេក្រុម', 'មេក្រុម'),
        ('អនុមេក្រុម', 'អនុមេក្រុម'),
    ],
    'education_level': [
        ('បឋមសិក្សា', 'បឋមសិក្សា'),
        ('អនុវិទ្យាល័យ', 'អនុវិទ្យាល័យ'),
        ('វិទ្យាល័យ', 'វិទ្យាល័យ'),
        ('មហាវិទ្យាល័យ', 'មហាវិទ្យាល័យ'),
    ],
    'academic_year': [
        ('ឆ្នាំទី១', 'ឆ្នាំទី ១'),
        ('ឆ្នាំទី២', 'ឆ្នាំទី ២'),
        ('ឆ្នាំទី៣', 'ឆ្នាំទី ៣'),
        ('ឆ្នាំទី៤', 'ឆ្នាំទី ៤'),
    ],
}

FIELD_LABELS = {
    'monk_type': 'សាមណេរ / ភិក្ខុ',
    'residence': 'ស្នាក់នៅកុដិ',
    'position': 'តួនាទីក្នុងវត្ត',
    'education_level': 'កម្រិតសិក្សា',
    'academic_year': 'សិក្សាថ្នាក់',
}


def create_form_options_table():
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS form_field_options (
                id         SERIAL PRIMARY KEY,
                field_key  VARCHAR(50)  NOT NULL,
                value      VARCHAR(255) NOT NULL,
                label      VARCHAR(255) NOT NULL,
                sort_order INTEGER      NOT NULL DEFAULT 0,
                is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (field_key, value)
            );
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_form_field_options_key
            ON form_field_options (field_key, sort_order);
        """)
        conn.commit()
        cur.close()
    except Exception as e:
        print(f'Database error creating form_field_options: {e}')
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def seed_form_options():
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        for field_key, items in DEFAULT_OPTIONS.items():
            for idx, (value, label) in enumerate(items):
                cur.execute("""
                    INSERT INTO form_field_options (field_key, value, label, sort_order, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                    ON CONFLICT (field_key, value) DO NOTHING;
                """, (field_key, value, label, idx))
        conn.commit()
        cur.close()
    except Exception as e:
        print(f'Database error seeding form_field_options: {e}')
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def _row_to_dict(row):
    return {
        'id': row[0],
        'field_key': row[1],
        'value': row[2],
        'label': row[3],
        'sort_order': row[4],
        'is_active': row[5],
    }


def list_options(field_key=None, active_only=True):
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        clauses = []
        params = []
        if field_key:
            clauses.append('field_key = %s')
            params.append(field_key)
        if active_only:
            clauses.append('is_active = TRUE')
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
        cur.execute(f"""
            SELECT id, field_key, value, label, sort_order, is_active
            FROM form_field_options
            {where}
            ORDER BY field_key, sort_order, id;
        """, params)
        rows = [_row_to_dict(r) for r in cur.fetchall()]
        cur.close()
        return rows
    except Exception as e:
        print(f'Database error listing form options: {e}')
        return []
    finally:
        if conn:
            conn.close()


def list_grouped(active_only=True):
    grouped = {key: [] for key in FIELD_KEYS}
    for row in list_options(active_only=active_only):
        grouped.setdefault(row['field_key'], []).append(row)
    return grouped


def valid_set(field_key, active_only=True):
    return {row['value'] for row in list_options(field_key, active_only=active_only)}


def add_option(field_key, value, label=None, sort_order=None):
    if field_key not in FIELD_KEYS:
        return None, 'ប្រភេទជម្រើសមិនត្រឹមត្រូវ'
    value = (value or '').strip()
    if not value or len(value) > 255:
        return None, 'តម្លៃជម្រើសមិនត្រឹមត្រូវ'
    label = (label or value).strip() or value

    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        if sort_order is None:
            cur.execute("""
                SELECT COALESCE(MAX(sort_order), -1) + 1
                FROM form_field_options
                WHERE field_key = %s;
            """, (field_key,))
            sort_order = cur.fetchone()[0]
        else:
            try:
                sort_order = int(sort_order)
            except (TypeError, ValueError):
                return None, 'អាទិភាពត្រូវតែជាលេខ'
            if sort_order < 0:
                return None, 'អាទិភាពត្រូវតែ ≥ ០'
        cur.execute("""
            INSERT INTO form_field_options (field_key, value, label, sort_order, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
            ON CONFLICT (field_key, value) DO UPDATE
            SET label = EXCLUDED.label,
                sort_order = EXCLUDED.sort_order,
                is_active = TRUE
            RETURNING id, field_key, value, label, sort_order, is_active;
        """, (field_key, value, label, sort_order))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return _row_to_dict(row), None
    except Exception as e:
        if conn:
            conn.rollback()
        return None, str(e)
    finally:
        if conn:
            conn.close()


def get_option(option_id):
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, field_key, value, label, sort_order, is_active
            FROM form_field_options
            WHERE id = %s AND is_active = TRUE;
        """, (option_id,))
        row = cur.fetchone()
        cur.close()
        return _row_to_dict(row) if row else None
    except Exception as e:
        print(f'Database error getting form option: {e}')
        return None
    finally:
        if conn:
            conn.close()


def update_option(option_id, label=None, sort_order=None):
    label = (label or '').strip() if label is not None else None
    if label is not None and not label:
        return None, 'ឈ្មោះជម្រើសមិនត្រឹមត្រូវ'

    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        if sort_order is not None:
            try:
                sort_order = int(sort_order)
            except (TypeError, ValueError):
                return None, 'អាទិភាពត្រូវតែជាលេខ'
            if sort_order < 0:
                return None, 'អាទិភាពត្រូវតែ ≥ ០'

        sets = []
        params = []
        if label is not None:
            sets.append('label = %s')
            params.append(label)
        if sort_order is not None:
            sets.append('sort_order = %s')
            params.append(sort_order)
        if not sets:
            return None, 'មិនមានអ្វីត្រូវកែ'

        params.append(option_id)
        cur.execute(f"""
            UPDATE form_field_options
            SET {', '.join(sets)}
            WHERE id = %s AND is_active = TRUE
            RETURNING id, field_key, value, label, sort_order, is_active;
        """, params)
        row = cur.fetchone()
        conn.commit()
        cur.close()
        if not row:
            return None, 'រកមិនឃើញជម្រើស'
        return _row_to_dict(row), None
    except Exception as e:
        if conn:
            conn.rollback()
        return None, str(e)
    finally:
        if conn:
            conn.close()


def delete_option(option_id):
    conn = None
    try:
        conn = connect_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE form_field_options
            SET is_active = FALSE
            WHERE id = %s
            RETURNING id;
        """, (option_id,))
        deleted = cur.fetchone()
        conn.commit()
        cur.close()
        if not deleted:
            return False, 'រកមិនឃើញជម្រើស'
        return True, None
    except Exception as e:
        if conn:
            conn.rollback()
        return False, str(e)
    finally:
        if conn:
            conn.close()
