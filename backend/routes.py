from flask import request, render_template, Blueprint, jsonify, send_file, session, redirect, url_for, abort
from conn import connect_db
from create_table import create_monks_table, insert_monk, get_all_monks, update_monk, delete_monk
from datetime import date as _date

main_bp = Blueprint('main_bp', __name__)

# ============ AUTH ============

USERS = {
    'admin': {'password': 'admin@2026',  'role': 'admin'},
    'user1': {'password': 'layout@2026', 'role': 'user1'},
    'user2': {'password': 'report@2026', 'role': 'user2'},
}

# URL prefixes each role may access (startswith matching)
_ROLE_PATHS = {
    'user1': ('/layout', '/api/monks', '/api/attendance', '/api/export-layout', '/api/check'),
    'user2': ('/report', '/api/attendance', '/api/monks/', '/api/reports'),
}

def _allowed(role, path):
    if role == 'admin':
        return True
    prefixes = _ROLE_PATHS.get(role, ())
    return any(path.startswith(p) for p in prefixes)

@main_bp.before_request
def check_auth():
    path = request.path
    if path.startswith('/static') or path in ('/login', '/logout'):
        return

    role = session.get('role')
    if not role:
        return redirect(url_for('main_bp.login_page', next=request.path))

    # Redirect root to role's home page
    if path == '/':
        if role == 'user1':
            return redirect(url_for('main_bp.layout'))
        if role == 'user2':
            return redirect(url_for('main_bp.report'))
        return  # admin → allow through to index

    if not _allowed(role, path):
        abort(403)

@main_bp.errorhandler(403)
def forbidden(e):
    role = session.get('role', '')
    home = '/layout' if role == 'user1' else '/report' if role == 'user2' else '/'
    return render_template('403.html', home=home), 403

@main_bp.route('/login', methods=['GET', 'POST'])
def login_page():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = USERS.get(username)
        if user and user['password'] == password:
            session['username'] = username
            session['role']     = user['role']
            nxt = request.args.get('next', '/')
            # Enforce role home if next is not allowed
            if not _allowed(user['role'], nxt):
                nxt = '/layout' if user['role'] == 'user1' else '/report' if user['role'] == 'user2' else '/'
            return redirect(nxt)
        error = 'ឈ្មោះអ្នកប្រើ ឬ លេខសម្ងាត់មិនត្រឹមត្រូវ'
    return render_template('login.html', error=error)

@main_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('main_bp.login_page'))

# ============ PAGES ============

@main_bp.route('/')
def index():
    return render_template('index.html')


@main_bp.route('/api/monks', methods=['POST'])
def add_monk():
    """API endpoint to add a new monk"""
    try:
        data = request.get_json()
        
        # Extract form data
        fullname = data.get('fullname')
        vassa_years = data.get('total-monk')  # Match form field name
        monk_type = data.get('type')
        residence = data.get('home')
        position = data.get('position')
        education_level = data.get('education_level')
        academic_year = data.get('academic_level')
        
        # Validate required fields
        if not all([fullname, vassa_years, monk_type, residence, position, education_level, academic_year]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400
        
        # Insert into database
        monk_id = insert_monk(fullname, vassa_years, monk_type, residence, position, education_level, academic_year)
        
        if monk_id:
            return jsonify({'success': True, 'monk_id': monk_id})
        else:
            return jsonify({'success': False, 'message': 'Failed to insert monk'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/monks', methods=['GET'])
def list_monks():
    """API endpoint to get all monks"""
    try:
        monks = get_all_monks()
        # Convert to list of dictionaries
        monks_list = []
        for monk in monks:
            monks_list.append({
                'id': monk[0],
                'fullname': monk[1],
                'vassa_years': monk[2],
                'monk_type': monk[3],
                'residence': monk[4],
                'position': monk[5],
                'education_level': monk[6],
                'academic_year': monk[7],
                'created_at': monk[8].isoformat() if monk[8] else None,
                'updated_at': monk[9].isoformat() if monk[9] else None
            })
        return jsonify({'success': True, 'monks': monks_list})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/monks/<int:monk_id>', methods=['PUT'])
def update_monk_route(monk_id):
    try:
        data = request.get_json()
        fullname = data.get('fullname')
        vassa_years = data.get('total-monk')
        monk_type = data.get('type')
        residence = data.get('home')
        position = data.get('position')
        education_level = data.get('education_level')
        academic_year = data.get('academic_level')

        if not all([fullname, vassa_years, monk_type, residence, position, education_level, academic_year]):
            return jsonify({'success': False, 'message': 'Missing required fields'}), 400

        success = update_monk(monk_id, fullname, vassa_years, monk_type, residence, position, education_level, academic_year)
        if success:
            return jsonify({'success': True})
        return jsonify({'success': False, 'message': 'Failed to update'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/monks/<int:monk_id>', methods=['DELETE'])
def delete_monk_route(monk_id):
    try:
        success = delete_monk(monk_id)
        if success:
            return jsonify({'success': True})
        return jsonify({'success': False, 'message': 'Failed to delete'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/monks/check-duplicate', methods=['GET'])
def check_duplicate():
    fullname    = request.args.get('fullname', '').strip()
    monk_type   = request.args.get('monk_type', '').strip()
    vassa_years = request.args.get('vassa_years', '').strip()
    residence   = request.args.get('residence', '').strip()
    position    = request.args.get('position', '').strip()

    if not all([fullname, monk_type, vassa_years, residence, position]):
        return jsonify({'exists': False})

    try:
        vassa_int = int(vassa_years)
    except (ValueError, TypeError):
        return jsonify({'exists': False})

    try:
        conn   = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, fullname, monk_type, vassa_years, residence, position
            FROM monk_tbl
            WHERE LOWER(fullname) = LOWER(%s)
              AND monk_type   = %s
              AND vassa_years = %s
              AND residence   = %s
              AND position    = %s
            LIMIT 1
        """, (fullname, monk_type, vassa_int, residence, position))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row:
            return jsonify({
                'exists': True,
                'match': {
                    'id':          row[0],
                    'fullname':    row[1],
                    'monk_type':   row[2],
                    'vassa_years': row[3],
                    'residence':   row[4],
                    'position':    row[5]
                }
            })
        return jsonify({'exists': False})
    except Exception as e:
        return jsonify({'exists': False, 'error': str(e)})


@main_bp.route('/view')
def view_monks():
    return render_template('view.html')


@main_bp.route('/layout')
def layout():
    return render_template('layout.html')


@main_bp.route('/api/check', methods=['GET'])
def check_system():
    """Check DB connection, record count, and existing triggers on monk_tbl"""
    try:
        conn = connect_db()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM monk_tbl;")
        row = cursor.fetchone()
        total = row[0] if row else 0

        cursor.execute("""
            SELECT created_at, updated_at FROM monk_tbl
            ORDER BY updated_at DESC NULLS LAST LIMIT 1;
        """)
        latest = cursor.fetchone()
        latest_created = latest[0].isoformat() if latest and latest[0] else None
        latest_updated = latest[1].isoformat() if latest and latest[1] else None

        cursor.execute("""
            SELECT trigger_name, event_manipulation, action_timing
            FROM information_schema.triggers
            WHERE event_object_table = 'monk_tbl'
            ORDER BY trigger_name, event_manipulation;
        """)
        triggers = [{'name': t[0], 'event': t[1], 'timing': t[2]} for t in cursor.fetchall()]

        cursor.close()
        conn.close()

        return jsonify({
            'success': True,
            'db_connected': True,
            'total_records': total,
            'latest_created_at': latest_created,
            'latest_updated_at': latest_updated,
            'triggers': triggers
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/init-db', methods=['POST'])
def init_database():
    """API endpoint to initialize the database (create tables)"""
    try:
        create_monks_table()
        return jsonify({'success': True, 'message': 'Database initialized successfully'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/setup-trigger', methods=['POST'])
def setup_trigger():
    """Create or replace the updated_at trigger on monk_tbl"""
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)
        cursor.execute("DROP TRIGGER IF EXISTS trg_set_updated_at ON monk_tbl;")
        cursor.execute("""
            CREATE TRIGGER trg_set_updated_at
                BEFORE UPDATE ON monk_tbl
                FOR EACH ROW
                EXECUTE FUNCTION set_updated_at();
        """)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance', methods=['GET'])
def get_attendance():
    try:
        date_str = request.args.get('date', _date.today().isoformat())
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("SELECT monk_id, status FROM attendance_tbl WHERE date = %s;", (date_str,))
        records = [{'monk_id': r[0], 'status': r[1]} for r in cursor.fetchall()]
        cursor.close(); conn.close()
        return jsonify({'success': True, 'records': records})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance', methods=['POST'])
def set_attendance():
    try:
        data = request.get_json()
        monk_id = data.get('monk_id')
        status  = data.get('status')
        date_str = data.get('date', _date.today().isoformat())
        if status not in ('absent', 'permission'):
            return jsonify({'success': False, 'message': 'Invalid status'}), 400
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO attendance_tbl (monk_id, status, date)
            VALUES (%s, %s, %s)
            ON CONFLICT (monk_id, date) DO UPDATE SET status = EXCLUDED.status;
        """, (monk_id, status, date_str))
        conn.commit(); cursor.close(); conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/monk/<int:monk_id>', methods=['GET'])
def get_monk_attendance(monk_id):
    try:
        start = request.args.get('start', '')
        end   = request.args.get('end',   '')
        conn   = connect_db()
        cursor = conn.cursor()
        where_parts = ["monk_id = %s"]
        params      = [monk_id]
        if start: where_parts.append("date >= %s"); params.append(start)
        if end:   where_parts.append("date <= %s"); params.append(end)
        cursor.execute(f"""
            SELECT date, status FROM attendance_tbl
            WHERE {' AND '.join(where_parts)}
            ORDER BY date DESC
        """, params)
        records = [{'date': str(r[0]), 'status': r[1]} for r in cursor.fetchall()]
        cursor.close(); conn.close()
        return jsonify({'success': True, 'records': records})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/<int:monk_id>', methods=['DELETE'])
def remove_attendance(monk_id):
    try:
        date_str = request.args.get('date', _date.today().isoformat())
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM attendance_tbl WHERE monk_id = %s AND date = %s;", (monk_id, date_str))
        conn.commit(); cursor.close(); conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/report')
def report():
    return render_template('report.html')


def _get_block_dates(date_str):
    """Return the fixed 15-day block containing the given date.
    Days  1-15 → 1st–15th of the month.
    Days 16-31 → 16th–last day of the month."""
    import calendar
    d = _date.fromisoformat(date_str)
    if d.day <= 15:
        start = _date(d.year, d.month, 1)
        end   = _date(d.year, d.month, 15)
    else:
        start = _date(d.year, d.month, 16)
        end   = _date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])
    return start, end


def _fetch_report_rows(args):
    date_str   = (args.get('date') or _date.today().isoformat())
    start_date, end_date = _get_block_dates(date_str)

    monk_type  = (args.get('monk_type')       or '').strip()
    kuti       = (args.get('kuti')            or '').strip()
    edu        = (args.get('education_level') or '').strip()
    acad       = (args.get('academic_year')   or '').strip()
    name_pfx   = (args.get('name')            or '').strip()

    where_parts, where_params = [], []
    if monk_type: where_parts.append("m.monk_type = %s");       where_params.append(monk_type)
    if kuti:      where_parts.append("m.residence = %s");        where_params.append(kuti)
    if edu:       where_parts.append("m.education_level = %s");  where_params.append(edu)
    if acad:      where_parts.append("m.academic_year = %s");    where_params.append(acad)
    if name_pfx:  where_parts.append("m.fullname ILIKE %s");     where_params.append(name_pfx + '%')

    where_sql = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

    sql = f"""
        SELECT m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
               m.residence, m.education_level, m.academic_year,
               COUNT(CASE WHEN a.status = 'absent'     THEN 1 END) AS absent_count,
               COUNT(CASE WHEN a.status = 'permission' THEN 1 END) AS perm_count,
               STRING_AGG(CASE WHEN a.status = 'absent'
                               THEN TO_CHAR(a.date, 'DD/MM') END,
                          ', ' ORDER BY a.date) AS absent_dates,
               STRING_AGG(CASE WHEN a.status = 'permission'
                               THEN TO_CHAR(a.date, 'DD/MM') END,
                          ', ' ORDER BY a.date) AS perm_dates
        FROM monk_tbl m
        LEFT JOIN attendance_tbl a
            ON a.monk_id = m.id AND a.date >= %s AND a.date <= %s
        {where_sql}
        GROUP BY m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
                 m.residence, m.education_level, m.academic_year
        HAVING COUNT(CASE WHEN a.status = 'absent'     THEN 1 END) >= 2
            OR COUNT(CASE WHEN a.status = 'permission' THEN 1 END) >= 3
        ORDER BY m.monk_type,
                 COUNT(CASE WHEN a.status = 'absent'     THEN 1 END) DESC,
                 COUNT(CASE WHEN a.status = 'permission' THEN 1 END) DESC,
                 m.fullname;
    """
    params = [start_date.isoformat(), end_date.isoformat()] + where_params

    conn = connect_db()
    cur  = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close(); conn.close()

    monks = [{
        'id': r[0], 'fullname': r[1], 'monk_type': r[2], 'position': r[3],
        'vassa_years': r[4], 'residence': (r[5] or '').replace('_', ' '),
        'education_level': r[6] or '', 'academic_year': r[7] or '',
        'absent_count': int(r[8] or 0), 'permission_count': int(r[9] or 0),
        'absent_dates': r[10] or '', 'perm_dates': r[11] or '',
    } for r in rows]

    return monks, start_date, end_date


@main_bp.route('/api/attendance/report', methods=['GET'])
def attendance_report():
    try:
        monks, start_date, end_date = _fetch_report_rows(request.args)
        return jsonify({
            'success':    True,
            'start_date': start_date.isoformat(),
            'end_date':   end_date.isoformat(),
            'monks':      monks
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


def _build_report_html(monks, start_date, end_date, filters_applied, ABSENT_LIMIT, PERM_LIMIT):
    import html as _html

    def row_html(m, idx):
        ab = m['absent_count']     >= ABSENT_LIMIT
        pr = m['permission_count'] >= PERM_LIMIT
        bg = '#fff5f5' if ab else ('#fffaf0' if pr else '#ffffff')
        badge = (
            '<span class="badge-danger">⚠ លើសអវត្តមាន</span>' if ab else
            '<span class="badge-warning">⚠ លើសច្បាប់</span>' if pr else
            '<span class="badge-ok">✓ ប្រក្រតី</span>'
        )
        edu = _html.escape(f"{m['education_level']} {m['academic_year']}".strip())
        ac  = 'color:#c53030;font-weight:bold' if ab else 'color:#718096'
        pc  = 'color:#c05621;font-weight:bold' if pr else 'color:#718096'
        d_parts = []
        if m['absent_dates']: d_parts.append(f'<span style="color:#c53030">❌ {_html.escape(m["absent_dates"])}</span>')
        if m['perm_dates']:   d_parts.append(f'<span style="color:#c05621">📋 {_html.escape(m["perm_dates"])}</span>')
        dates_cell = '<br>'.join(d_parts) if d_parts else '—'
        return (
            f'<tr style="background:{bg}">'
            f'<td class="num">{idx}</td>'
            f'<td><strong>{_html.escape(m["fullname"])}</strong></td>'
            f'<td>{_html.escape(m["position"])}</td>'
            f'<td class="num">{m["vassa_years"]} ឆ្នាំ</td>'
            f'<td>{_html.escape(m["residence"])}</td>'
            f'<td>{edu}</td>'
            f'<td class="num" style="{ac}">{m["absent_count"] or "—"}</td>'
            f'<td class="num" style="{pc}">{m["permission_count"] or "—"}</td>'
            f'<td class="dates">{dates_cell}</td>'
            f'<td>{badge}</td>'
            f'</tr>'
        )

    def section_html(section_monks, title, hc, bc):
        if not section_monks:
            return ''
        rows = ''.join(row_html(m, i + 1) for i, m in enumerate(section_monks))
        return (
            f'<h2 style="color:{hc};border-bottom:2px solid {bc};'
            f'padding:6px 0;margin:18px 0 6px;font-size:13px;">'
            f'{_html.escape(title)} ({len(section_monks)} នាក់)</h2>'
            f'<table><thead><tr>'
            f'<th>#</th><th>ឈ្មោះ</th><th>តួនាទី</th><th>វស្សា</th>'
            f'<th>ស្នាក់នៅ</th><th>ការសិក្សា</th><th>❌</th><th>📋</th><th>ថ្ងៃ</th><th>ស្ថានភាព</th>'
            f'</tr></thead><tbody>{rows}</tbody></table>'
        )

    bhikkhus    = [m for m in monks if m['monk_type'] == 'ភិក្ខុ']
    samaneras   = [m for m in monks if m['monk_type'] == 'សាមណេរ']
    absent_viol = sum(1 for m in monks if m['absent_count']     >= ABSENT_LIMIT)
    perm_viol   = sum(1 for m in monks if m['permission_count'] >= PERM_LIMIT)
    clean       = len(monks) - absent_viol - perm_viol
    filter_line = (
        f'<p class="sub">តម្រង: {" | ".join(filters_applied)}</p>'
        if filters_applied else ''
    )
    date_range  = f"{start_date.strftime('%d/%m/%Y')} ដល់ {end_date.strftime('%d/%m/%Y')}"

    return (
        '<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8"><style>'
        "@import url('https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&display=swap');"
        '*{box-sizing:border-box;margin:0;padding:0}'
        "body{font-family:'Battambang','Khmer MN','Khmer Sangam MN',sans-serif;"
        'color:#2d3748;font-size:10px;}'
        'h1{text-align:center;font-size:15px;color:#1a202c;margin-bottom:4px;}'
        '.sub{text-align:center;color:#718096;font-size:9.5px;margin-bottom:3px;}'
        '.summary{display:flex;gap:12px;justify-content:center;margin:10px 0;flex-wrap:wrap;}'
        '.summary span{padding:3px 10px;border-radius:4px;font-weight:bold;font-size:9.5px;}'
        '.s-total{background:#edf2f7;color:#2d3748;}'
        '.s-absent{background:#fed7d7;color:#c53030;}'
        '.s-perm{background:#feebc8;color:#c05621;}'
        '.s-clean{background:#c6f6d5;color:#276749;}'
        'table{width:100%;border-collapse:collapse;margin-bottom:6px;}'
        'thead tr{background:#f7fafc;}'
        'th{padding:6px 7px;text-align:left;font-size:8.5px;font-weight:700;'
        'color:#718096;border-bottom:2px solid #e2e8f0;white-space:nowrap;}'
        'td{padding:6px 7px;border-bottom:1px solid #edf2f7;vertical-align:middle;font-size:9.5px;}'
        '.num{text-align:center;}'
        '.badge-danger{background:#fed7d7;color:#c53030;padding:2px 7px;'
        'border-radius:10px;font-size:8px;font-weight:bold;white-space:nowrap;}'
        '.badge-warning{background:#feebc8;color:#c05621;padding:2px 7px;'
        'border-radius:10px;font-size:8px;font-weight:bold;white-space:nowrap;}'
        '.badge-ok{background:#c6f6d5;color:#276749;padding:2px 7px;'
        'border-radius:10px;font-size:8px;font-weight:bold;white-space:nowrap;}'
        '.dates{font-size:8.5px;line-height:1.7;}'
        '@page{size:A4;margin:12mm 10mm;}'
        '</style></head><body>'
        '<h1>វត្តនិរោធរង្សី — របាយការណ៍វត្តមាន</h1>'
        f'<p class="sub">ចន្លោះ: {date_range} (១៥ ថ្ងៃ)</p>'
        f'{filter_line}'
        '<div class="summary">'
        f'<span class="s-total">ព្រះសង្ឃ: {len(monks)} នាក់</span>'
        f'<span class="s-absent">❌ លើសអវត្តមាន: {absent_viol} នាក់</span>'
        f'<span class="s-perm">📋 លើសច្បាប់: {perm_viol} នាក់</span>'
        f'<span class="s-clean">✓ ប្រក្រតី: {clean} នាក់</span>'
        '</div>'
        + section_html(bhikkhus,  'ផ្នែកទី ១ — ភិក្ខុ',   '#8a6100', '#f0c040')
        + section_html(samaneras, 'ផ្នែកទី ២ — សាមណេរ', '#1b5e20', '#66bb6a')
        + '</body></html>'
    )


@main_bp.route('/api/attendance/export-report-pdf', methods=['GET'])
def export_attendance_report_pdf():
    try:
        import io, requests as req
        from weasyprint import HTML

        action = request.args.get('action', 'download')
        monks, start_date, end_date = _fetch_report_rows(request.args)

        ABSENT_LIMIT = 2
        PERM_LIMIT   = 3

        filters_applied = []
        for k, label in [('monk_type','ប្រភេទ'),('kuti','កុដិ'),
                          ('education_level','ការសិក្សា'),('academic_year','ឆ្នាំ'),('name','ឈ្មោះ')]:
            v = request.args.get(k, '').strip()
            if v:
                filters_applied.append(f"{label}: {v}")

        html_str  = _build_report_html(monks, start_date, end_date, filters_applied, ABSENT_LIMIT, PERM_LIMIT)
        pdf_bytes = HTML(string=html_str).write_pdf()
        buf       = io.BytesIO(pdf_bytes)
        fname     = f"attendance_report_{end_date.isoformat()}.pdf"

        absent_viol = sum(1 for m in monks if m['absent_count']     >= ABSENT_LIMIT)
        perm_viol   = sum(1 for m in monks if m['permission_count'] >= PERM_LIMIT)

        if action == 'telegram':
            TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
            TELEGRAM_CHAT_ID = -1003960014484
            caption = (
                f"📋 របាយការណ៍វត្តមាន (PDF) — {end_date.strftime('%d/%m/%Y')}\n"
                f"📊 សរុប {len(monks)} នាក់  |  ❌ {absent_viol}  |  📋 {perm_viol}"
            )
            if filters_applied:
                caption += '\n🔎 ' + ' | '.join(filters_applied)
            tg = req.post(
                f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendDocument',
                data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
                files={'document': (fname, buf, 'application/pdf')},
                timeout=25
            ).json()
            if not tg.get('ok'):
                return jsonify({'success': False, 'message': f"Telegram: {tg.get('description')}"}), 500
            return jsonify({'success': True, 'total': len(monks)})

        return send_file(buf, mimetype='application/pdf', as_attachment=True, download_name=fname)

    except ImportError:
        return jsonify({'success': False,
                        'message': 'WeasyPrint មិនទាន់ install — សូម run: pip install weasyprint'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/export-report', methods=['GET'])
def export_attendance_report():
    try:
        import io, requests as req
        from docx import Document
        from docx.shared import Pt, Cm, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.enum.table import WD_ALIGN_VERTICAL
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement

        action = request.args.get('action', 'download')
        monks, start_date, end_date = _fetch_report_rows(request.args)

        ABSENT_LIMIT = 2
        PERM_LIMIT   = 3

        def shade(cell, hex_color):
            tc  = cell._tc
            tcPr = tc.get_or_add_tcPr()
            shd = OxmlElement('w:shd')
            shd.set(qn('w:val'),   'clear')
            shd.set(qn('w:color'), 'auto')
            shd.set(qn('w:fill'),  hex_color)
            tcPr.append(shd)

        def add_report_table(doc, section_monks):
            headers = ['#', 'ឈ្មោះ', 'តួនាទី', 'វស្សា', 'ស្នាក់នៅ', 'ការសិក្សា', '❌', '📋', 'ថ្ងៃ', 'ស្ថានភាព']
            widths  = [0.5, 3.0, 2.5, 1.0, 2.0, 1.6, 0.7, 0.7, 2.8, 1.8]

            tbl = doc.add_table(rows=1, cols=len(headers))
            tbl.style = 'Table Grid'
            for i, (h, w) in enumerate(zip(headers, widths)):
                cell = tbl.rows[0].cells[i]
                cell.width = Cm(w)
                shade(cell, 'F7FAFC')
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(h)
                run.bold = True
                run.font.size = Pt(8.5)
                run.font.color.rgb = RGBColor(0x71, 0x80, 0x96)

            for i, m in enumerate(section_monks, 1):
                ab_viol = m['absent_count']     >= ABSENT_LIMIT
                pr_viol = m['permission_count'] >= PERM_LIMIT
                row_color = 'FFF5F5' if ab_viol else ('FFFAF0' if pr_viol else 'FFFFFF')
                status = '⚠ លើសអវត្តមាន' if ab_viol else ('⚠ លើសច្បាប់' if pr_viol else '✓ ប្រក្រតី')

                row = tbl.add_row()
                dates_parts = []
                if m['absent_dates']:  dates_parts.append(f"❌ {m['absent_dates']}")
                if m['perm_dates']:    dates_parts.append(f"📋 {m['perm_dates']}")
                dates_text = '\n'.join(dates_parts) if dates_parts else '—'

                vals = [
                    str(i), m['fullname'], m['position'], f"{m['vassa_years']} ឆ្នាំ",
                    m['residence'], f"{m['education_level']} {m['academic_year']}".strip(),
                    str(m['absent_count']) if m['absent_count'] else '—',
                    str(m['permission_count']) if m['permission_count'] else '—',
                    dates_text,
                    status
                ]
                for j, (val, w) in enumerate(zip(vals, widths)):
                    cell = row.cells[j]
                    cell.width = Cm(w)
                    shade(cell, row_color)
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j in (0,3,6,7) else WD_ALIGN_PARAGRAPH.LEFT
                    run = p.add_run(val)
                    run.font.size = Pt(8.5)
                    if j == 1: run.bold = True
                    if ab_viol and j == 6: run.font.color.rgb = RGBColor(0xC5, 0x30, 0x30)
                    if pr_viol and j == 7: run.font.color.rgb = RGBColor(0xC0, 0x56, 0x21)

        doc = Document()
        sec = doc.sections[0]
        sec.left_margin = sec.right_margin = Cm(1.5)
        sec.top_margin  = sec.bottom_margin = Cm(1.5)

        t = doc.add_heading('វត្តនិរោធរង្សី — របាយការណ៍វត្តមាន', 0)
        t.alignment = WD_ALIGN_PARAGRAPH.CENTER

        sub = doc.add_paragraph(
            f"ចន្លោះ: {start_date.strftime('%d/%m/%Y')} ដល់ {end_date.strftime('%d/%m/%Y')} (១៥ ថ្ងៃ)"
        )
        sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub.runs[0].font.size = Pt(10)
        sub.runs[0].font.color.rgb = RGBColor(0x71, 0x80, 0x96)

        # Applied filters note
        filters_applied = []
        for k, label in [('monk_type','ប្រភេទ'),('kuti','កុដិ'),('education_level','ការសិក្សា'),
                          ('academic_year','ឆ្នាំ'),('name','ឈ្មោះ')]:
            v = request.args.get(k, '').strip()
            if v: filters_applied.append(f"{label}: {v}")
        if filters_applied:
            fp = doc.add_paragraph('តម្រង: ' + ' | '.join(filters_applied))
            fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
            fp.runs[0].font.size = Pt(9)
            fp.runs[0].font.color.rgb = RGBColor(0x4A, 0x55, 0x68)

        doc.add_paragraph()

        bhikkhus  = [m for m in monks if m['monk_type'] == 'ភិក្ខុ']
        samaneras = [m for m in monks if m['monk_type'] == 'សាមណេរ']

        if bhikkhus:
            h1 = doc.add_heading('ផ្នែកទី ១ — ភិក្ខុ', 1)
            h1.runs[0].font.color.rgb = RGBColor(0x8A, 0x61, 0x00)
            add_report_table(doc, bhikkhus)
            doc.add_paragraph()

        if samaneras:
            h2 = doc.add_heading('ផ្នែកទី ២ — សាមណេរ', 1)
            h2.runs[0].font.color.rgb = RGBColor(0x1B, 0x5E, 0x20)
            add_report_table(doc, samaneras)
            doc.add_paragraph()

        absent_viol = sum(1 for m in monks if m['absent_count']     >= ABSENT_LIMIT)
        perm_viol   = sum(1 for m in monks if m['permission_count'] >= PERM_LIMIT)
        sp = doc.add_paragraph(
            f"📊 សរុប {len(monks)} នាក់  |  "
            f"❌ លើសអវត្តមាន: {absent_viol} នាក់  |  "
            f"📋 លើសច្បាប់: {perm_viol} នាក់"
        )
        sp.runs[0].font.size = Pt(10)
        sp.runs[0].bold = True

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)

        if action in ('telegram', 'telegram-both'):
            TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
            TELEGRAM_CHAT_ID = -1003960014484
            fname   = f"attendance_report_{end_date.isoformat()}.docx"
            caption = (
                f"📋 របាយការណ៍វត្តមាន — {end_date.strftime('%d/%m/%Y')}\n"
                f"📊 សរុប {len(monks)} នាក់  |  ❌ {absent_viol}  |  📋 {perm_viol}"
            )
            tg = req.post(
                f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendDocument',
                data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
                files={'document': (fname, buf,
                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
                timeout=15
            ).json()
            if not tg.get('ok'):
                return jsonify({'success': False, 'message': f"Telegram (Word): {tg.get('description')}"}), 500

            if action == 'telegram-both':
                from weasyprint import HTML
                _fa = []
                for k, lbl in [('monk_type','ប្រភេទ'),('kuti','កុដិ'),
                                ('education_level','ការសិក្សា'),('academic_year','ឆ្នាំ'),('name','ឈ្មោះ')]:
                    v = request.args.get(k, '').strip()
                    if v: _fa.append(f"{lbl}: {v}")
                html_str  = _build_report_html(monks, start_date, end_date, _fa, ABSENT_LIMIT, PERM_LIMIT)
                pdf_bytes = HTML(string=html_str).write_pdf()
                pdf_buf   = io.BytesIO(pdf_bytes)
                fname_pdf = f"attendance_report_{end_date.isoformat()}.pdf"
                tg2 = req.post(
                    f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendDocument',
                    data={'chat_id': TELEGRAM_CHAT_ID,
                          'caption': f"📄 PDF — {end_date.strftime('%d/%m/%Y')}"},
                    files={'document': (fname_pdf, pdf_buf, 'application/pdf')},
                    timeout=25
                ).json()
                if not tg2.get('ok'):
                    return jsonify({'success': False, 'message': f"Telegram (PDF): {tg2.get('description')}"}), 500

            return jsonify({'success': True, 'total': len(monks)})

        fname = f"attendance_report_{end_date.isoformat()}.docx"
        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=fname
        )

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/history/<int:monk_id>', methods=['GET'])
def attendance_history(monk_id):
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                SUM(CASE WHEN status = 'absent'     THEN 1 ELSE 0 END),
                SUM(CASE WHEN status = 'permission' THEN 1 ELSE 0 END)
            FROM attendance_tbl
            WHERE monk_id = %s
              AND date >= CURRENT_DATE - INTERVAL '14 days'
              AND date <= CURRENT_DATE;
        """, (monk_id,))
        row = cursor.fetchone()
        cursor.close(); conn.close()
        return jsonify({
            'success': True,
            'absent_count':     int(row[0] or 0),
            'permission_count': int(row[1] or 0)
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/submit', methods=['POST'])
def submit_attendance():
    TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
    TELEGRAM_CHAT_ID = -1003960014484  # Channel: គ្រប់គ្រង អវត្តមាន-ច្បាប់ ថ្វាយបង្គំប្រចាំថ្ងៃ

    try:
        import requests as req
        today = _date.today().isoformat()

        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.fullname, m.monk_type, m.position, m.vassa_years, m.residence, a.status
            FROM attendance_tbl a
            JOIN monk_tbl m ON m.id = a.monk_id
            WHERE a.date = %s
            ORDER BY m.monk_type, a.status, m.fullname;
        """, (today,))
        rows = cursor.fetchall()
        cursor.close(); conn.close()

        if not rows:
            return jsonify({'success': False, 'message': 'មិនមានការចុះឈ្មោះត្រូវបញ្ជូនទេ'}), 400

        absent_count     = sum(1 for r in rows if r[5] == 'absent')
        permission_count = sum(1 for r in rows if r[5] == 'permission')

        def fmt_group(monks):
            lines = []
            for i, (name, _, position, vassa, kuti, status) in enumerate(monks, 1):
                icon  = '❌' if status == 'absent' else '📋'
                label = 'អវត្តមាន' if status == 'absent' else 'ច្បាប់'
                kuti_display = kuti.replace('_', ' ')
                lines.append(
                    f'{i}. {icon} {name}\n'
                    f'   ▸ តួនាទី: {position}\n'
                    f'   ▸ វស្សា: {vassa} ឆ្នាំ\n'
                    f'   ▸ កុដិ: {kuti_display}\n'
                    f'   ▸ ស្ថានភាព: {label}'
                )
            return '\n\n'.join(lines)

        bhikkhus  = [r for r in rows if r[1] == 'ភិក្ខុ']
        samaneras = [r for r in rows if r[1] == 'សាមណេរ']

        d_fmt = _date.today().strftime('%d/%m/%Y')
        parts = [
            f'🏛 វត្តនិរោធរង្សី',
            f'📋 ព័ត៌មានថ្វាយបង្គំប្រចាំថ្ងៃ — {d_fmt}',
            '═' * 15,
        ]
        if bhikkhus:
            parts += ['\n📿 ភិក្ខុ', '─' * 15, fmt_group(bhikkhus)]
        if samaneras:
            parts += ['\n🔰 សាមណេរ', '─' * 15, fmt_group(samaneras)]
        parts += [
            '\n' + '═' * 15,
            f'📊 សរុបចំនួន : {len(rows)} នាក់',
            f'   ❌ អវត្តមាន : {absent_count} នាក់',
            f'   📋 ច្បាប់    : {permission_count} នាក់',
        ]
        message = '\n'.join(parts)

        tg = req.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
            json={'chat_id': TELEGRAM_CHAT_ID, 'text': message},
            timeout=10
        ).json()

        if not tg.get('ok'):
            return jsonify({'success': False, 'message': f"Telegram: {tg.get('description', 'error')}"}), 500

        return jsonify({'success': True, 'total': len(rows)})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/monks/export', methods=['GET'])
def export_monks():
    try:
        import io, html as _html
        from datetime import date
        fmt = request.args.get('fmt', 'docx')

        name       = (request.args.get('name')            or '').strip()
        vassa      = (request.args.get('vassa_years')     or '').strip()
        monk_type  = (request.args.get('monk_type')       or '').strip()
        residence  = (request.args.get('residence')       or '').strip()
        position   = (request.args.get('position')        or '').strip()
        edu        = (request.args.get('education_level') or '').strip()
        acad       = (request.args.get('academic_year')   or '').strip()
        sort_vassa = (request.args.get('sort_vassa')      or '').strip()

        where_parts, where_params = [], []
        if name:      where_parts.append("fullname ILIKE %s");      where_params.append(f'%{name}%')
        if vassa:     where_parts.append("vassa_years = %s");        where_params.append(int(vassa))
        if monk_type: where_parts.append("monk_type = %s");          where_params.append(monk_type)
        if residence: where_parts.append("residence = %s");          where_params.append(residence)
        if position:  where_parts.append("position = %s");           where_params.append(position)
        if edu:       where_parts.append("education_level = %s");    where_params.append(edu)
        if acad:      where_parts.append("academic_year = %s");      where_params.append(acad)
        where_sql = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''

        vassa_dir = 'ASC' if sort_vassa == 'asc' else 'DESC'
        order_sql = f"ORDER BY monk_type, vassa_years {vassa_dir}, fullname"

        conn = connect_db()
        cur  = conn.cursor()
        cur.execute(f"""
            SELECT fullname, vassa_years, monk_type, residence, position,
                   education_level, academic_year, created_at
            FROM monk_tbl {where_sql}
            {order_sql};
        """, where_params)
        rows = cur.fetchall()
        cur.close(); conn.close()

        monks = [{
            'fullname': r[0], 'vassa_years': r[1], 'monk_type': r[2],
            'residence': (r[3] or '').replace('_', ' '), 'position': r[4],
            'education_level': r[5] or '', 'academic_year': r[6] or '',
            'created_at': r[7]
        } for r in rows]

        today      = date.today().strftime('%d/%m/%Y')
        fname_base = f"monks_{date.today().isoformat()}"

        # ── DOCX ─────────────────────────────────────────────────────────────
        if fmt == 'docx':
            from docx import Document
            from docx.shared import Pt, Cm, RGBColor
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.oxml.ns import qn
            from docx.oxml import OxmlElement

            def _shade(cell, hex_color):
                tc = cell._tc; tcPr = tc.get_or_add_tcPr()
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), hex_color); tcPr.append(shd)

            doc = Document()
            sec = doc.sections[0]
            sec.left_margin = sec.right_margin = Cm(1.5)
            sec.top_margin  = sec.bottom_margin = Cm(1.5)

            h = doc.add_heading('វត្តនិរោធរង្សី — បញ្ជីព្រះសង្ឃ', 0)
            h.alignment = WD_ALIGN_PARAGRAPH.CENTER
            sub = doc.add_paragraph(f"ថ្ងៃទី {today}  |  ចំនួនសរុប: {len(monks)} នាក់")
            sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
            sub.runs[0].font.size = Pt(10)
            sub.runs[0].font.color.rgb = RGBColor(0x71, 0x80, 0x96)
            doc.add_paragraph()

            hdrs   = ['#', 'ឈ្មោះ', 'វស្សា', 'ប្រភេទ', 'ស្នាក់នៅ', 'តួនាទី', 'ការសិក្សា', 'ថ្ងៃបញ្ចូល']
            widths = [0.6, 3.2, 1.0, 1.5, 2.2, 2.5, 2.5, 1.8]
            tbl = doc.add_table(rows=1, cols=len(hdrs))
            tbl.style = 'Table Grid'
            for i, (hdr, w) in enumerate(zip(hdrs, widths)):
                cell = tbl.rows[0].cells[i]; cell.width = Cm(w)
                _shade(cell, 'EEF2FF')
                p = cell.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(hdr); run.bold = True
                run.font.size = Pt(8.5); run.font.color.rgb = RGBColor(0x4A, 0x55, 0x68)

            for idx, m in enumerate(monks, 1):
                bg  = 'FFF8E1' if m['monk_type'] == 'ភិក្ខុ' else 'F1F8E9'
                edu = f"{m['education_level']} {m['academic_year']}".strip()
                cre = m['created_at'].strftime('%d/%m/%Y') if m['created_at'] else '—'
                vals = [str(idx), m['fullname'], f"{m['vassa_years']} ឆ្នាំ", m['monk_type'],
                        m['residence'], m['position'], edu, cre]
                row = tbl.add_row()
                for j, (val, w) in enumerate(zip(vals, widths)):
                    cell = row.cells[j]; cell.width = Cm(w); _shade(cell, bg)
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j in (0, 2, 7) else WD_ALIGN_PARAGRAPH.LEFT
                    run = p.add_run(val); run.font.size = Pt(8.5)
                    if j == 1: run.bold = True

            buf = io.BytesIO(); doc.save(buf); buf.seek(0)
            return send_file(buf,
                mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                as_attachment=True, download_name=f"{fname_base}.docx")

        # ── EXCEL ────────────────────────────────────────────────────────────
        elif fmt == 'excel':
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter

            wb = openpyxl.Workbook()
            ws = wb.active; ws.title = 'ព្រះសង្ឃ'

            hdrs = ['#', 'ឈ្មោះ', 'វស្សា', 'ប្រភេទ', 'ស្នាក់នៅ',
                    'តួនាទី', 'កម្រិតសិក្សា', 'ថ្នាក់', 'ថ្ងៃបញ្ចូល']
            hfill = PatternFill(start_color='667EEA', end_color='667EEA', fill_type='solid')
            hfont = Font(bold=True, color='FFFFFF', size=11, name='Calibri')
            thin  = Side(border_style='thin', color='D1D5DB')
            bdr   = Border(left=thin, right=thin, top=thin, bottom=thin)

            for col, h in enumerate(hdrs, 1):
                c = ws.cell(row=1, column=col, value=h)
                c.font = hfont; c.fill = hfill; c.border = bdr
                c.alignment = Alignment(horizontal='center', vertical='center')
            ws.row_dimensions[1].height = 22

            bfill = PatternFill(start_color='FFF8E1', end_color='FFF8E1', fill_type='solid')
            sfill = PatternFill(start_color='F1F8E9', end_color='F1F8E9', fill_type='solid')
            dfont = Font(size=10, name='Calibri')

            for row_i, m in enumerate(monks, 2):
                fill = bfill if m['monk_type'] == 'ភិក្ខុ' else sfill
                cre  = m['created_at'].strftime('%d/%m/%Y') if m['created_at'] else '—'
                vals = [row_i - 1, m['fullname'], m['vassa_years'], m['monk_type'],
                        m['residence'], m['position'], m['education_level'], m['academic_year'], cre]
                for col, val in enumerate(vals, 1):
                    c = ws.cell(row=row_i, column=col, value=val)
                    c.fill = fill; c.border = bdr; c.font = dfont
                    c.alignment = Alignment(
                        horizontal='center' if col in (1, 3, 9) else 'left',
                        vertical='center')

            for col, w in enumerate([5, 24, 8, 12, 18, 20, 15, 10, 13], 1):
                ws.column_dimensions[get_column_letter(col)].width = w

            buf = io.BytesIO(); wb.save(buf); buf.seek(0)
            return send_file(buf,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True, download_name=f"{fname_base}.xlsx")

        # ── PDF ──────────────────────────────────────────────────────────────
        elif fmt == 'pdf':
            from weasyprint import HTML

            def row_h(m, idx):
                bg  = '#fff8e1' if m['monk_type'] == 'ភិក្ខុ' else '#f1f8e9'
                edu = _html.escape(f"{m['education_level']} {m['academic_year']}".strip())
                cre = m['created_at'].strftime('%d/%m/%Y') if m['created_at'] else '—'
                return (
                    f'<tr style="background:{bg}">'
                    f'<td class="num">{idx}</td>'
                    f'<td><strong>{_html.escape(m["fullname"])}</strong></td>'
                    f'<td class="num">{m["vassa_years"]}</td>'
                    f'<td>{_html.escape(m["monk_type"])}</td>'
                    f'<td>{_html.escape(m["residence"])}</td>'
                    f'<td>{_html.escape(m["position"])}</td>'
                    f'<td>{edu}</td>'
                    f'<td>{cre}</td>'
                    f'</tr>'
                )

            rows_html = ''.join(row_h(m, i + 1) for i, m in enumerate(monks))
            html_str = (
                '<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8"><style>'
                "@import url('https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&display=swap');"
                '*{box-sizing:border-box;margin:0;padding:0}'
                "body{font-family:'Battambang','Khmer MN','Khmer Sangam MN',sans-serif;color:#2d3748;font-size:10px;}"
                'h1{text-align:center;font-size:15px;color:#1a202c;margin-bottom:4px;}'
                '.sub{text-align:center;color:#718096;font-size:9.5px;margin-bottom:12px;}'
                'table{width:100%;border-collapse:collapse;}'
                'thead tr{background:#667eea;}'
                'th{padding:7px 8px;text-align:left;font-size:8.5px;font-weight:700;'
                'color:#fff;border-bottom:2px solid #5a6fd6;white-space:nowrap;}'
                'td{padding:6px 7px;border-bottom:1px solid #edf2f7;vertical-align:middle;font-size:9.5px;}'
                '.num{text-align:center;}'
                '@page{size:A4;margin:12mm 10mm;}'
                '</style></head><body>'
                '<h1>វត្តនិរោធរង្សី — បញ្ជីព្រះសង្ឃ</h1>'
                f'<p class="sub">ថ្ងៃទី {today}  |  ចំនួនសរុប: {len(monks)} នាក់</p>'
                '<table><thead><tr>'
                '<th>#</th><th>ឈ្មោះ</th><th>វស្សា</th><th>ប្រភេទ</th>'
                '<th>ស្នាក់នៅ</th><th>តួនាទី</th><th>ការសិក្សា</th><th>ថ្ងៃបញ្ចូល</th>'
                '</tr></thead>'
                f'<tbody>{rows_html}</tbody></table>'
                '</body></html>'
            )
            pdf_bytes = HTML(string=html_str).write_pdf()
            buf = io.BytesIO(pdf_bytes)
            return send_file(buf, mimetype='application/pdf',
                             as_attachment=True, download_name=f"{fname_base}.pdf")

        return jsonify({'success': False, 'message': 'Unknown format'}), 400

    except ImportError as e:
        return jsonify({'success': False, 'message': f'Missing package: {e}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/export-layout')
def export_layout():
    """Export the seating layout as a Word (.docx) document"""
    import io
    from datetime import date
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_ALIGN_VERTICAL
    from docx.enum.section import WD_ORIENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    BHIKKHU_RANK = {
        'ព្រះគ្រូសូត្រស្តាំ':         1,
        'ព្រះគ្រូសូត្រឆ្វេង':         2,
        'ព្រះគ្រូវិន័យធរ':           3,
        'ព្រះគ្រូលេខា':               4,
        'ព្រះគ្រូប្រធានការក':        5,
        'ព្រះគ្រូអនុប្រធានការកទី១':  6,
        'ព្រះគ្រូអនុប្រធានការកទី២':  7,
        'មេកុដិ':                     8,
        'អនុកុដិ':                    9,
        'ព្រះសង្ឃធម្មតា':            10,
    }

    def clamp(val, lo, hi):
        return max(lo, min(hi, int(val)))

    def shade_cell(cell, hex_color):
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), hex_color)
        tcPr.append(shd)

    def fill_cell(cell, number, name, sub):
        cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
        shade_cell(cell, 'F7F8FA')

        p0 = cell.paragraphs[0]
        p0.paragraph_format.space_before = Pt(2)
        p0.paragraph_format.space_after  = Pt(0)
        r0 = p0.add_run(str(number))
        r0.font.size = Pt(7)
        r0.font.color.rgb = RGBColor(0xA0, 0xAE, 0xC0)

        p1 = cell.add_paragraph()
        p1.paragraph_format.space_before = Pt(1)
        p1.paragraph_format.space_after  = Pt(0)
        r1 = p1.add_run(name)
        r1.font.size = Pt(9)
        r1.font.bold = True
        r1.font.color.rgb = RGBColor(0x1A, 0x20, 0x2C)

        p2 = cell.add_paragraph()
        p2.paragraph_format.space_before = Pt(1)
        p2.paragraph_format.space_after  = Pt(2)
        r2 = p2.add_run(sub)
        r2.font.size = Pt(7.5)
        r2.font.color.rgb = RGBColor(0x71, 0x80, 0x96)

    def fill_empty(cell, number):
        cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
        p0 = cell.paragraphs[0]
        p0.paragraph_format.space_before = Pt(2)
        r0 = p0.add_run(str(number))
        r0.font.size = Pt(7)
        r0.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

    def add_grid_table(doc, monks, rows, cols, col_width_cm, type_):
        table = doc.add_table(rows=rows, cols=cols)
        table.style = 'Table Grid'
        for col in table.columns:
            col.width = Cm(col_width_cm)

        for r in range(rows):
            row_obj = table.rows[r]
            row_obj.height = Cm(1.6)
            for c in range(cols):
                idx = r * cols + c
                cell = row_obj.cells[c]
                monk = monks[idx] if idx < len(monks) else None
                if monk:
                    is_admin = monk['position'] in SAMANERA_ADMIN_RANK
                    sub = monk['position'] if (type_ == 'bhikkhu' or is_admin) else f"វស្សា {monk['vassa_years']}"
                    fill_cell(cell, idx + 1, monk['fullname'], sub)
                else:
                    fill_empty(cell, idx + 1)

    try:
        br = clamp(request.args.get('br', 3), 1, 30)
        bc = clamp(request.args.get('bc', 5), 1, 30)
        sr = clamp(request.args.get('sr', 12), 1, 50)
        sc = clamp(request.args.get('sc', 10), 1, 30)

        raw = get_all_monks()
        all_monks = [
            {'fullname': m[1], 'vassa_years': m[2], 'monk_type': m[3], 'position': m[5]}
            for m in raw
        ]

        bhikkhus = sorted(
            [m for m in all_monks if m['monk_type'] == 'ភិក្ខុ'],
            key=lambda m: (BHIKKHU_RANK.get(m['position'], 99), -m['vassa_years'])
        )
        SAMANERA_ADMIN_RANK = {'មេកុដិ': 1, 'អនុកុដិ': 2}
        samaneras = sorted(
            [m for m in all_monks if m['monk_type'] == 'សាមណេរ'],
            key=lambda m: (SAMANERA_ADMIN_RANK.get(m['position'], 99), -m['vassa_years'], m['fullname'])
        )

        doc = Document()

        # Landscape A4
        sec = doc.sections[0]
        sec.orientation = WD_ORIENT.LANDSCAPE
        sec.page_width, sec.page_height = sec.page_height, sec.page_width
        sec.left_margin   = Cm(1.5)
        sec.right_margin  = Cm(1.5)
        sec.top_margin    = Cm(1.5)
        sec.bottom_margin = Cm(1.5)

        usable_cm = 27.0  # ~297mm - 3cm margins

        # Title
        t = doc.add_heading('ប្លង់អាសនៈព្រះសង្ឃ — វត្តនិរោធរង្សី', 0)
        t.alignment = WD_ALIGN_PARAGRAPH.CENTER

        sub_p = doc.add_paragraph(f'ថ្ងៃទី {date.today().strftime("%d/%m/%Y")}')
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub_p.runs[0].font.size = Pt(11)
        sub_p.runs[0].font.color.rgb = RGBColor(0x71, 0x80, 0x96)

        doc.add_paragraph()

        # ── Section 1: Bhikkhu ──
        h1 = doc.add_heading('ផ្នែកទី ១ — ភិក្ខុ', 1)
        h1.runs[0].font.color.rgb = RGBColor(0x8A, 0x61, 0x00)

        info1 = doc.add_paragraph(
            f'ចំនួនភិក្ខុ: {len(bhikkhus)} នាក់  |  ក្រឡា: {br} × {bc} = {br*bc}'
        )
        info1.runs[0].font.size = Pt(10)
        info1.runs[0].font.color.rgb = RGBColor(0x71, 0x80, 0x96)

        col_w1 = round(usable_cm / bc, 2)
        add_grid_table(doc, bhikkhus, br, bc, col_w1, 'bhikkhu')

        # Page break before Samanera
        doc.add_page_break()

        # ── Section 2: Samanera ──
        h2 = doc.add_heading('ផ្នែកទី ២ — សាមណេរ', 1)
        h2.runs[0].font.color.rgb = RGBColor(0x1B, 0x5E, 0x20)

        info2 = doc.add_paragraph(
            f'ចំនួនសាមណេរ: {len(samaneras)} នាក់  |  ក្រឡា: {sr} × {sc} = {sr*sc}'
        )
        info2.runs[0].font.size = Pt(10)
        info2.runs[0].font.color.rgb = RGBColor(0x71, 0x80, 0x96)

        col_w2 = round(usable_cm / sc, 2)
        add_grid_table(doc, samaneras, sr, sc, col_w2, 'samanera')

        output = io.BytesIO()
        doc.save(output)
        output.seek(0)

        filename = f'layout_{date.today().strftime("%Y%m%d")}.docx'
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/export-layout-pdf')
def export_layout_pdf():
    """Export the seating layout as a PDF document via WeasyPrint"""
    import io, html as _html
    from datetime import date

    BHIKKHU_RANK = {
        'ព្រះគ្រូសូត្រស្តាំ':         1, 'ព្រះគ្រូសូត្រឆ្វេង':         2,
        'ព្រះគ្រូវិន័យធរ':           3, 'ព្រះគ្រូលេខា':               4,
        'ព្រះគ្រូប្រធានការក':        5, 'ព្រះគ្រូអនុប្រធានការកទី១':  6,
        'ព្រះគ្រូអនុប្រធានការកទី២':  7, 'មេកុដិ':                     8,
        'អនុកុដិ':                    9, 'ព្រះសង្ឃធម្មតា':            10,
    }
    SAMANERA_ADMIN_RANK = {'មេកុដិ': 1, 'អនុកុដិ': 2}

    def clamp(val, lo, hi):
        return max(lo, min(hi, int(val or 0)))

    try:
        from weasyprint import HTML

        br = clamp(request.args.get('br', 3),  1, 30)
        bc = clamp(request.args.get('bc', 5),  1, 30)
        sr = clamp(request.args.get('sr', 12), 1, 50)
        sc = clamp(request.args.get('sc', 10), 1, 30)

        raw = get_all_monks()
        all_monks = [
            {'fullname': m[1], 'vassa_years': m[2], 'monk_type': m[3], 'position': m[5]}
            for m in raw
        ]

        bhikkhus = sorted(
            [m for m in all_monks if m['monk_type'] == 'ភិក្ខុ'],
            key=lambda m: (BHIKKHU_RANK.get(m['position'], 99), -m['vassa_years'])
        )
        samaneras = sorted(
            [m for m in all_monks if m['monk_type'] == 'សាមណេរ'],
            key=lambda m: (SAMANERA_ADMIN_RANK.get(m['position'], 99), -m['vassa_years'], m['fullname'])
        )

        def build_grid(monks, rows, cols, type_):
            cells = []
            for r in range(rows):
                for c in range(cols):
                    idx = r * cols + c
                    m = monks[idx] if idx < len(monks) else None
                    num = idx + 1
                    if m:
                        sub = m['position'] if (type_ == 'bhikkhu' or m['position'] in SAMANERA_ADMIN_RANK) \
                              else f"វស្សា {m['vassa_years']}"
                        cells.append(
                            f'<td class="cell filled">'
                            f'<span class="num">{num}</span>'
                            f'<span class="name">{_html.escape(m["fullname"])}</span>'
                            f'<span class="sub">{_html.escape(sub)}</span>'
                            f'</td>'
                        )
                    else:
                        cells.append(f'<td class="cell empty"><span class="num-e">{num}</span></td>')
            rows_html = ''
            for r in range(rows):
                rows_html += '<tr>' + ''.join(cells[r * cols:(r + 1) * cols]) + '</tr>'
            return f'<table>{rows_html}</table>'

        today = date.today().strftime('%d/%m/%Y')
        css = (
            "@import url('https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&display=swap');"
            "*{box-sizing:border-box;margin:0;padding:0}"
            "body{font-family:'Battambang','Khmer MN',sans-serif;color:#2d3748;font-size:9px;}"
            "h1{text-align:center;font-size:14px;font-weight:700;color:#1a202c;margin-bottom:3px;}"
            ".sub-title{text-align:center;color:#718096;font-size:8.5px;margin-bottom:10px;}"
            "h2{font-size:11px;font-weight:700;margin:12px 0 4px;padding:4px 8px;border-radius:4px;}"
            ".h-bhikkhu{background:#fff8e1;color:#8a6100;}"
            ".h-samanera{background:#f1f8e9;color:#1b5e20;}"
            "table{width:100%;border-collapse:collapse;margin-bottom:6px;}"
            "td{border:1px solid #cbd5e0;vertical-align:top;padding:3px 4px;}"
            ".filled{background:#f7f8fa;}"
            ".empty{background:#fff;}"
            ".num{display:block;font-size:7px;color:#a0aec0;}"
            ".num-e{display:block;font-size:7px;color:#ddd;}"
            ".name{display:block;font-size:8.5px;font-weight:700;color:#1a202c;margin:1px 0;}"
            ".sub{display:block;font-size:7.5px;color:#718096;}"
            "@page{size:A4 landscape;margin:10mm 12mm;}"
        )
        html_str = (
            f'<!DOCTYPE html><html lang="km"><head><meta charset="UTF-8">'
            f'<style>{css}</style></head><body>'
            f'<h1>ប្លង់អាសនៈព្រះសង្ឃ — វត្តនិរោធរង្សី</h1>'
            f'<p class="sub-title">ថ្ងៃទី {today}</p>'
            f'<h2 class="h-bhikkhu">ផ្នែកទី ១ — ភិក្ខុ ({len(bhikkhus)} នាក់  |  {br}×{bc})</h2>'
            f'{build_grid(bhikkhus, br, bc, "bhikkhu")}'
            f'<h2 class="h-samanera">ផ្នែកទី ២ — សាមណេរ ({len(samaneras)} នាក់  |  {sr}×{sc})</h2>'
            f'{build_grid(samaneras, sr, sc, "samanera")}'
            f'</body></html>'
        )

        pdf_bytes = HTML(string=html_str).write_pdf()
        buf = io.BytesIO(pdf_bytes)
        fname = f'layout_{date.today().strftime("%Y%m%d")}.pdf'
        return send_file(buf, mimetype='application/pdf', as_attachment=True, download_name=fname)

    except ImportError:
        return jsonify({'success': False, 'message': 'WeasyPrint មិនទាន់ install — សូម run: pip install weasyprint'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ================================================================
# MULTI-TIER REPORTING SYSTEM
# ================================================================

DISC_ABSENT_MIN = 2   # absences  > 1  (i.e. >= 2)
DISC_PERM_MIN   = 3   # permissions > 2 (i.e. >= 3)


def _do_compile_period(conn, cur, period_start):
    """Aggregate the fixed 15-day block containing period_start into attendance_summaries
    and advance the period_tracker.  Returns (row_count, period_end)."""
    from datetime import timedelta
    _, period_end = _get_block_dates(period_start.isoformat())
    cur.execute("""
        SELECT monk_id,
               COALESCE(SUM(CASE WHEN status = 'absent'     THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN status = 'permission' THEN 1 ELSE 0 END), 0)
        FROM attendance_tbl
        WHERE date >= %s AND date <= %s
        GROUP BY monk_id
    """, (period_start.isoformat(), period_end.isoformat()))
    rows = cur.fetchall()
    for monk_id, absences, permissions in rows:
        cur.execute("""
            INSERT INTO attendance_summaries
                (monk_id, period_start, period_end, total_absences, total_permissions)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (monk_id, period_start) DO UPDATE
                SET total_absences    = EXCLUDED.total_absences,
                    total_permissions = EXCLUDED.total_permissions
        """, (monk_id, period_start, period_end, int(absences), int(permissions)))
    new_start = period_end + timedelta(days=1)
    cur.execute("""
        UPDATE period_tracker
        SET current_period_start = %s, last_compiled_at = NOW()
        WHERE id = 1
    """, (new_start,))
    return len(rows), period_end


def _summary_query(cur, start_str, end_str):
    """Aggregate summaries between two dates; apply disciplinary filter."""
    cur.execute("""
        SELECT m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
               m.residence, m.education_level, m.academic_year,
               SUM(s.total_absences)    AS tot_abs,
               SUM(s.total_permissions) AS tot_perm,
               MIN(s.period_start)      AS range_start,
               MAX(s.period_end)        AS range_end
        FROM attendance_summaries s
        JOIN monk_tbl m ON m.id = s.monk_id
        WHERE s.period_start >= %s AND s.period_end <= %s
        GROUP BY m.id, m.fullname, m.monk_type, m.position,
                 m.vassa_years, m.residence, m.education_level, m.academic_year
        HAVING SUM(s.total_absences)    >= %s
            OR SUM(s.total_permissions) >= %s
        ORDER BY m.monk_type,
                 SUM(s.total_absences)    DESC,
                 SUM(s.total_permissions) DESC
    """, (start_str, end_str, DISC_ABSENT_MIN, DISC_PERM_MIN))
    return cur.fetchall()


def _rows_to_monks(rows):
    return [{
        'id':                 r[0],
        'fullname':           r[1],
        'monk_type':          r[2],
        'position':           r[3],
        'vassa_years':        r[4],
        'residence':          (r[5] or '').replace('_', ' '),
        'education_level':    r[6] or '',
        'academic_year':      r[7] or '',
        'total_absences':     int(r[8] or 0),
        'total_permissions':  int(r[9] or 0),
        'range_start':        r[10].isoformat() if r[10] else None,
        'range_end':          r[11].isoformat() if r[11] else None,
    } for r in rows]


# ---- Page routes ------------------------------------------------

@main_bp.route('/report/book')
def book_report_page():
    return render_template('book_report.html')


# ---- API: daily report -----------------------------------------

@main_bp.route('/api/attendance/daily-report', methods=['GET'])
def daily_report():
    """Return today's (or given date's) attendance records — no disciplinary filter."""
    date_str = request.args.get('date', _date.today().isoformat())
    try:
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("""
            SELECT m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
                   m.residence, m.education_level, m.academic_year, a.status
            FROM attendance_tbl a
            JOIN monk_tbl m ON m.id = a.monk_id
            WHERE a.date = %s
            ORDER BY m.monk_type, a.status, m.fullname
        """, (date_str,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify({
            'success': True,
            'date': date_str,
            'records': [{
                'id':              r[0],
                'fullname':        r[1],
                'monk_type':       r[2],
                'position':        r[3],
                'vassa_years':     r[4],
                'residence':       (r[5] or '').replace('_', ' '),
                'education_level': r[6] or '',
                'academic_year':   r[7] or '',
                'status':          r[8],
            } for r in rows]
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: compile period ----------------------------------------

@main_bp.route('/api/attendance/compile-period', methods=['POST'])
def compile_period_endpoint():
    """Compile the current 15-day block into attendance_summaries and advance the tracker."""
    conn = None
    try:
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("SELECT current_period_start FROM period_tracker WHERE id = 1")
        row = cur.fetchone()
        if not row:
            return jsonify({'success': False, 'message': 'Period tracker not initialised'}), 400
        period_start = row[0]
        count, period_end = _do_compile_period(conn, cur, period_start)
        conn.commit()
        cur.close()
        from datetime import timedelta as _td
        return jsonify({
            'success':           True,
            'compiled':          count,
            'period_start':      period_start.isoformat(),
            'period_end':        period_end.isoformat(),
            'next_period_start': (period_end + _td(days=1)).isoformat(),
        })
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if conn: conn.close()


# ---- API: list compiled periods ---------------------------------

@main_bp.route('/api/reports/periods', methods=['GET'])
def list_periods():
    """Return all compiled periods plus current active period info."""
    try:
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("""
            SELECT DISTINCT period_start, period_end
            FROM attendance_summaries
            ORDER BY period_start DESC
            LIMIT 100
        """)
        periods = [{'start': r[0].isoformat(), 'end': r[1].isoformat()}
                   for r in cur.fetchall()]
        cur.execute("SELECT current_period_start, last_compiled_at FROM period_tracker WHERE id = 1")
        row = cur.fetchone()
        cur.close(); conn.close()
        return jsonify({
            'success':              True,
            'compiled_periods':     periods,
            'current_period_start': row[0].isoformat() if row else None,
            'last_compiled_at':     row[1].isoformat() if row and row[1] else None,
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: bi-weekly report --------------------------------------

@main_bp.route('/api/reports/biweekly', methods=['GET'])
def report_biweekly():
    """Bi-weekly report from summaries for a specific date (auto-block-snapped).
    Filter: absences >= 2 OR permissions >= 3."""
    date_str = request.args.get('period_start') or request.args.get('date', _date.today().isoformat())
    try:
        period_start, period_end = _get_block_dates(date_str)
        conn = connect_db()
        cur  = conn.cursor()
        rows = _summary_query(cur, period_start.isoformat(), period_end.isoformat())
        cur.close(); conn.close()
        return jsonify({
            'success':      True,
            'period_start': period_start.isoformat(),
            'period_end':   period_end.isoformat(),
            'monks':        _rows_to_monks(rows),
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: monthly report ----------------------------------------

@main_bp.route('/api/reports/monthly', methods=['GET'])
def report_monthly():
    """Monthly report: aggregate all summaries within a calendar month.
    Filter: absences >= 2 AND permissions >= 3."""
    year_str  = request.args.get('year',  str(_date.today().year))
    month_str = request.args.get('month', str(_date.today().month))
    try:
        import calendar
        year, month = int(year_str), int(month_str)
        month_start = _date(year, month, 1)
        month_end   = _date(year, month, calendar.monthrange(year, month)[1])
        conn = connect_db()
        cur  = conn.cursor()
        rows = _summary_query(cur, month_start.isoformat(), month_end.isoformat())
        cur.close(); conn.close()
        return jsonify({
            'success':      True,
            'year':         year,
            'month':        month,
            'period_start': month_start.isoformat(),
            'period_end':   month_end.isoformat(),
            'monks':        _rows_to_monks(rows),
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: annual report -----------------------------------------

@main_bp.route('/api/reports/annual', methods=['GET'])
def report_annual():
    """Annual report: aggregate all summaries within a calendar year.
    Filter: absences >= 2 AND permissions >= 3."""
    year_str = request.args.get('year', str(_date.today().year))
    try:
        year       = int(year_str)
        year_start = _date(year, 1, 1)
        year_end   = _date(year, 12, 31)
        conn = connect_db()
        cur  = conn.cursor()
        rows = _summary_query(cur, year_start.isoformat(), year_end.isoformat())
        cur.close(); conn.close()
        return jsonify({
            'success':      True,
            'year':         year,
            'period_start': year_start.isoformat(),
            'period_end':   year_end.isoformat(),
            'monks':        _rows_to_monks(rows),
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: 3-year report -----------------------------------------

@main_bp.route('/api/reports/triennial', methods=['GET'])
def report_triennial():
    """3-year report: aggregate all summaries across 3 consecutive years.
    Filter: absences >= 2 AND permissions >= 3."""
    start_year_str = request.args.get('start_year', str(_date.today().year - 2))
    try:
        start_year   = int(start_year_str)
        end_year     = start_year + 2
        period_start = _date(start_year, 1, 1)
        period_end   = _date(end_year, 12, 31)
        conn = connect_db()
        cur  = conn.cursor()
        rows = _summary_query(cur, period_start.isoformat(), period_end.isoformat())
        cur.close(); conn.close()
        return jsonify({
            'success':      True,
            'start_year':   start_year,
            'end_year':     end_year,
            'period_start': period_start.isoformat(),
            'period_end':   period_end.isoformat(),
            'monks':        _rows_to_monks(rows),
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
