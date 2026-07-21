import time
from collections import defaultdict
from flask import request, render_template, Blueprint, jsonify, send_file, session, redirect, url_for, abort
from conn import connect_db
from create_table import (create_monks_table, insert_monk, get_all_monks,
                          update_monk, delete_monk, insert_pending_submission)
from datetime import date as _date
from sorting import sort_attendance_monks
from khmer_lunar import khmer_lunar_date

# ============ MINISTRY DOCUMENT HEADER (shared by docx/html/excel exports) ============

_HDR_LEFT_LINES  = ['មន្ទីរធម្មការ និងសាសនា រាជធានី', 'ភ្នំពេញ', 'សាលា ពុ.អ.វិ.ស.ព្រ.ន.វ.និ']
_HDR_RIGHT_LINES = ['ព្រះរាជាណាចក្រកម្ពុជា', 'ជាតិ សាសនា ព្រះមហាក្សត្រ']
_HDR_MAIN_TITLE  = 'ស្ថិតព្រះសង្ឃក្នុងវត្តនិរោធរង្សី'

main_bp = Blueprint('main_bp', __name__)

# ============ PUBLIC SUBMISSION — ALLOWED VALUES ============

_VALID_MONK_TYPES       = {'សាមណេរ', 'ភិក្ខុ'}
_VALID_RESIDENCES       = {
    'កុដិលេខ១', 'កុដិលេខ២_ជាន់ក្រោម', 'កុដិលេខ២_ជាន់លើ', 'កុដិលេខ៤',
    'កុដិធំ_ជាន់ទី១', 'កុដិធំ_ជាន់ទី២', 'កុដិធំ_ជាន់ទី៣',
    'កុដិហោត្រៃ', 'សាលាបាលីចាស់', 'សាលាពុទ្ធិក',
}
_VALID_POSITIONS        = {
    'ព្រះអធិការ',
    'ព្រះសង្ឃធម្មតា', 'មេក្រុម', 'អនុមេក្រុម',
    'ព្រះគ្រូសូត្រស្តាំ', 'ព្រះគ្រូសូត្រឆ្វេង', 'ព្រះគ្រូវិន័យធរ',
    'ព្រះគ្រូលេខា', 'ព្រះគ្រូប្រធានការក',
    'ព្រះគ្រូអនុប្រធានការកទី១', 'ព្រះគ្រូអនុប្រធានការកទី២',
    'មេកុដិ', 'អនុកុដិ',
}
_VALID_EDUCATION_LEVELS = {'បឋមសិក្សា', 'អនុវិទ្យាល័យ', 'វិទ្យាល័យ', 'មហាវិទ្យាល័យ'}
_VALID_ACADEMIC_YEARS   = {'ឆ្នាំទី១', 'ឆ្នាំទី២', 'ឆ្នាំទី៣', 'ឆ្នាំទី៤'}

# ============ RATE LIMITER (in-memory, per IP, 10 req/min) ============

_rate_store: dict = defaultdict(list)
_RATE_MAX    = 10
_RATE_WINDOW = 60  # seconds

def _rate_limit_ok(ip: str) -> bool:
    now  = time.monotonic()
    hits = _rate_store[ip]
    _rate_store[ip] = [t for t in hits if now - t < _RATE_WINDOW]
    if len(_rate_store[ip]) >= _RATE_MAX:
        return False
    _rate_store[ip].append(now)
    return True

# ============ AUTH ============

USERS = {
    'admin': {'password': 'admin@2026',  'role': 'admin'},
    'user1': {'password': 'layout@2026', 'role': 'user1'},
    'user2': {'password': 'report@2026', 'role': 'user2'},
}

# URL prefixes each role may access (startswith matching)
_ROLE_PATHS = {
    'user1': ('/layout', '/api/monks', '/api/attendance', '/api/permissions', '/api/export-layout', '/api/check', '/api/seat-order'),
    'user2': ('/report', '/api/attendance', '/api/permissions', '/api/monks/', '/api/reports'),
}

def _allowed(role, path):
    if role == 'admin':
        return True
    prefixes = _ROLE_PATHS.get(role, ())
    return any(path.startswith(p) for p in prefixes)

@main_bp.before_request
def check_auth():
    path = request.path
    if (path.startswith('/static')
            or path in ('/login', '/logout', '/submit')
            or path in ('/public/submit', '/api/monks/check-duplicate')):
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


# ============ PUBLIC SUBMISSION ROUTES ============

@main_bp.route('/submit', methods=['GET'])
def public_submit_page():
    success = request.args.get('success') == '1'
    return render_template('submit.html', success=success, error=None, form_data={})


@main_bp.route('/public/submit', methods=['POST'])
def public_submit():
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()

    if not _rate_limit_ok(ip):
        return jsonify({'success': False, 'message': 'ការដាក់ស្នើច្រើនពេក។ សូមព្យាយាមមកវិញក្រោយ ១ នាទី។'}), 429

    data = request.get_json(silent=True) or {}

    fullname        = str(data.get('fullname',        '') or '').strip()
    vassa_years     = str(data.get('total-monk',      '') or '').strip()
    monk_type       = str(data.get('type',            '') or '').strip()
    residence       = str(data.get('home',            '') or '').strip()
    position        = str(data.get('position',        '') or '').strip()
    education_level = str(data.get('education_level', '') or '').strip()
    academic_year   = str(data.get('academic_level',  '') or '').strip()

    errors = []
    if not fullname or len(fullname) > 200:
        errors.append('នាមត្រកូល និង នាម មិនត្រឹមត្រូវ')

    vassa_int = None
    try:
        vassa_int = int(vassa_years)
        if vassa_int < 1 or vassa_int > 100:
            raise ValueError
    except (ValueError, TypeError):
        errors.append('ចំនួនវស្សា ត្រូវតែជាលេខចន្លោះ ១ ដល់ ១០០')

    if monk_type not in _VALID_MONK_TYPES:
        errors.append('ប្រភេទព្រះសង្ឃ មិនត្រឹមត្រូវ')
    if residence not in _VALID_RESIDENCES:
        errors.append('ស្នាក់នៅកុដិ មិនត្រឹមត្រូវ')
    if position not in _VALID_POSITIONS:
        errors.append('តួនាទី មិនត្រឹមត្រូវ')
    if education_level not in _VALID_EDUCATION_LEVELS:
        errors.append('កម្រិតសិក្សា មិនត្រឹមត្រូវ')
    if academic_year not in _VALID_ACADEMIC_YEARS:
        errors.append('ឆ្នាំសិក្សា មិនត្រឹមត្រូវ')

    if errors:
        return jsonify({'success': False, 'message': ' | '.join(errors)}), 422

    # Guard against duplicate pending submissions for the same name
    try:
        _conn = connect_db()
        _cur  = _conn.cursor()
        _cur.execute(
            "SELECT id FROM pending_submissions WHERE LOWER(fullname)=LOWER(%s) AND status='pending' LIMIT 1",
            (fullname,)
        )
        if _cur.fetchone():
            _cur.close(); _conn.close()
            return jsonify({'success': False,
                            'message': 'ឈ្មោះនេះ​មាន​ក្នុង​បញ្ជីរ​ង់ចាំ​ហើយ។ សូម​រង់ចាំ​ការ​អនុម័ត។'}), 409
        _cur.close(); _conn.close()
    except Exception:
        pass

    try:
        sub_id = insert_pending_submission(fullname, vassa_int, monk_type, residence,
                                           position, education_level, academic_year)
        if sub_id:
            return jsonify({'success': True, 'pending_id': sub_id})
        return jsonify({'success': False, 'message': 'មានបញ្ហាក្នុងការរក្សាទុក។ សូមព្យាយាមមកវិញ។'}), 500
    except Exception:
        return jsonify({'success': False, 'message': 'កំហុសសេវាកម្ម។ សូមព្យាយាមមកវិញ។'}), 500


# ============ APPROVAL QUEUE ============

@main_bp.route('/approve')
def approve_page():
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                ps.id, ps.fullname, ps.vassa_years, ps.monk_type,
                ps.residence, ps.position, ps.education_level, ps.academic_year,
                ps.submitted_at,
                (SELECT m.id FROM monk_tbl m
                 WHERE LOWER(m.fullname) = LOWER(ps.fullname) LIMIT 1) AS matched_id
            FROM pending_submissions ps
            WHERE ps.status = 'pending'
            ORDER BY ps.submitted_at DESC;
        """)
        rows = cursor.fetchall()
        cursor.close()
        submissions = []
        for r in rows:
            submissions.append({
                'id':              r[0],
                'fullname':        r[1],
                'vassa_years':     r[2],
                'monk_type':       r[3],
                'residence':       r[4],
                'position':        r[5],
                'education_level': r[6],
                'academic_year':   r[7],
                'submitted_at':    r[8].strftime('%d/%m/%Y %H:%M') if r[8] else '',
                'matched':         r[9] is not None,
            })
        return render_template('approve.html', submissions=submissions, error=None)
    except Exception as e:
        return render_template('approve.html', submissions=[], error=str(e))
    finally:
        if conn:
            conn.close()


@main_bp.route('/api/submissions/bulk-action', methods=['POST'])
def submissions_bulk_action():
    data           = request.get_json(silent=True) or {}
    action         = str(data.get('action', '')).strip()
    ids            = data.get('ids', [])
    rejection_note = str(data.get('rejection_note', '') or '').strip()[:500] or None

    valid_actions = {'approve-selected', 'approve-all', 'reject-selected', 'reject-all'}
    if action not in valid_actions:
        return jsonify({'success': False, 'message': 'សកម្មភាព​មិន​ត្រឹម​ត្រូវ'}), 400

    if action.endswith('-selected') and not ids:
        return jsonify({'success': False, 'message': 'សូម​រើស​យ៉ាង​ហោច​ណាស់​មួយ​ជួរ'}), 400

    conn = None
    try:
        conn = connect_db()
        conn.autocommit = False
        cursor = conn.cursor()

        if action in ('reject-all', 'reject-selected'):
            if action == 'reject-all':
                cursor.execute("""
                    UPDATE pending_submissions
                    SET status = 'rejected', rejection_note = %s, reviewed_at = NOW()
                    WHERE status = 'pending'
                """, (rejection_note,))
            else:
                cursor.execute("""
                    UPDATE pending_submissions
                    SET status = 'rejected', rejection_note = %s, reviewed_at = NOW()
                    WHERE status = 'pending' AND id = ANY(%s)
                """, (rejection_note, ids))
            count = cursor.rowcount
            conn.commit()
            return jsonify({'success': True, 'count': count})

        # Approve path — fetch rows to process
        if action == 'approve-all':
            cursor.execute("""
                SELECT id, fullname, vassa_years, monk_type, residence,
                       position, education_level, academic_year
                FROM pending_submissions
                WHERE status = 'pending'
                FOR UPDATE
            """)
        else:
            cursor.execute("""
                SELECT id, fullname, vassa_years, monk_type, residence,
                       position, education_level, academic_year
                FROM pending_submissions
                WHERE status = 'pending' AND id = ANY(%s)
                FOR UPDATE
            """, (ids,))
        rows = cursor.fetchall()

        approved = 0
        for row in rows:
            sub_id, fullname, vassa_years, monk_type, residence, \
                position, education_level, academic_year = row

            # Auto-match: update existing monk record if name found, else insert
            cursor.execute(
                "SELECT id FROM monk_tbl WHERE LOWER(fullname) = LOWER(%s) LIMIT 1",
                (fullname,)
            )
            match = cursor.fetchone()
            if match:
                cursor.execute("""
                    UPDATE monk_tbl
                    SET vassa_years=%s, monk_type=%s, residence=%s, position=%s,
                        education_level=%s, academic_year=%s, updated_at=NOW()
                    WHERE id=%s
                """, (vassa_years, monk_type, residence, position,
                      education_level, academic_year, match[0]))
            else:
                cursor.execute("""
                    INSERT INTO monk_tbl
                        (fullname, vassa_years, monk_type, residence, position, education_level, academic_year)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (fullname, vassa_years, monk_type, residence,
                      position, education_level, academic_year))

            cursor.execute("""
                UPDATE pending_submissions
                SET status = 'approved', reviewed_at = NOW()
                WHERE id = %s
            """, (sub_id,))
            approved += 1

        conn.commit()
        return jsonify({'success': True, 'count': approved})

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()


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
        monks_list = sort_attendance_monks(monks_list)
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


@main_bp.route('/api/monks/bulk-delete', methods=['POST'])
def bulk_delete_monks():
    data = request.get_json(silent=True) or {}
    ids  = [int(i) for i in data.get('ids', []) if str(i).isdigit()]
    if not ids:
        return jsonify({'success': False, 'message': 'No ids provided'}), 400

    conn = None
    try:
        conn = connect_db()
        conn.autocommit = False
        cursor = conn.cursor()
        cursor.execute("DELETE FROM monk_tbl WHERE id = ANY(%s)", (ids,))
        count = cursor.rowcount
        conn.commit()
        return jsonify({'success': True, 'count': count})
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    finally:
        if conn:
            conn.close()


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


@main_bp.route('/api/seat-order', methods=['GET'])
def get_seat_order():
    try:
        import json as _json
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("SELECT type, monk_ids, updated_at FROM seat_order")
        rows = cur.fetchall()
        cur.close(); conn.close()
        result = {'bhikkhu': None, 'samanera': None, 'grid_config': None, 'updated_at': None}
        for row in rows:
            result[row[0]] = _json.loads(row[1])
            ts = row[2].isoformat() if row[2] else None
            if ts and (result['updated_at'] is None or ts > result['updated_at']):
                result['updated_at'] = ts
        return jsonify({'success': True, **result})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/seat-order', methods=['POST'])
def save_seat_order():
    if session.get('role') != 'admin':
        abort(403)
    import json as _json
    data  = request.get_json(silent=True) or {}
    type_ = str(data.get('type', '')).strip()
    ids   = data.get('ids', [])
    if type_ not in ('bhikkhu', 'samanera', 'grid_config'):
        return jsonify({'success': False, 'message': 'Invalid type'}), 400
    if type_ == 'grid_config':
        if not isinstance(ids, dict):
            return jsonify({'success': False, 'message': 'ids must be a dict for grid_config'}), 400
    elif not isinstance(ids, list):
        return jsonify({'success': False, 'message': 'ids must be a list'}), 400
    try:
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("""
            INSERT INTO seat_order (type, monk_ids, updated_at)
            VALUES (%s, %s, NOW())
            ON CONFLICT (type) DO UPDATE
                SET monk_ids = EXCLUDED.monk_ids, updated_at = NOW()
            RETURNING updated_at
        """, (type_, _json.dumps(ids)))
        row = cur.fetchone()
        conn.commit()
        cur.close(); conn.close()
        return jsonify({'success': True, 'updated_at': row[0].isoformat() if row else None})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/view')
def view_monks():
    return render_template('view.html')


@main_bp.route('/layout')
def layout():
    return render_template('layout.html', role=session.get('role', ''))


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
        
        cursor.execute("""
            SELECT monk_id, start_date, end_date, reason FROM monk_permission
            WHERE %s BETWEEN start_date AND end_date
        """, (date_str,))

        perms = {}
        target_date = _date.fromisoformat(date_str)
        for r in cursor.fetchall():
            monk_id, start_date, end_date, reason = r
            days_left = (end_date - target_date).days
            if days_left >= 0:
                perms[monk_id] = {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'days_left': days_left,
                    'reason': reason or ''
                }
                
        cursor.close(); conn.close()
        return jsonify({'success': True, 'records': records, 'permissions_info': perms})
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
        conn.commit()

        if status == 'absent':
            block_start, block_end = _get_block_dates(date_str)
            cursor.execute("""
                SELECT 
                    SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN status = 'permission' THEN 1 ELSE 0 END)
                FROM attendance_tbl
                WHERE monk_id = %s
                  AND date >= %s
                  AND date <= %s;
            """, (monk_id, block_start.isoformat(), block_end.isoformat()))
            row = cursor.fetchone()
            absent_count = int(row[0] or 0)
            perm_count = int(row[1] or 0)

            if absent_count in (3, 6):
                # Fetch monk info
                cursor.execute("SELECT fullname, residence FROM monk_tbl WHERE id = %s", (monk_id,))
                monk_info = cursor.fetchone()
                if monk_info:
                    fullname, kuti = monk_info
                    
                    # Fetch head and deputy
                    cursor.execute("SELECT fullname FROM monk_tbl WHERE residence = %s AND position = 'មេកុដិ' LIMIT 1", (kuti,))
                    kuti_head_row = cursor.fetchone()
                    kuti_head = kuti_head_row[0] if kuti_head_row else '...........'
                    
                    cursor.execute("SELECT fullname FROM monk_tbl WHERE residence = %s AND position = 'អនុកុដិ' LIMIT 1", (kuti,))
                    kuti_deputy_row = cursor.fetchone()
                    kuti_deputy = kuti_deputy_row[0] if kuti_deputy_row else '...........'

                    msg = (
                        "🔔 សេចក្តីប្រគេនដំណឹង 🔔\n"
                        "កិច្ចវត្តថ្វាយបង្គំរាល់ល្ងាចវត្តនិរោធរង្សី\n"
                        "----- សារព្រមាន -----\n"
                        f"ព្រះសង្ឃនាម ៖ {fullname}\n"
                        f"កុដិ ៖ {kuti or '............'}\n"
                        f"មេកុដិ ៖ {kuti_head}\n"
                        f"អនុកុដិ ៖ {kuti_deputy}\n"
                        "- - - - - បញ្ហា - - - - - \n"
                        f"អវត្តមាន ៖ {absent_count}\n"
                        f"ច្បាប់ ៖ {perm_count}\n"
                        f"កាលបរិច្ឆេទ៖ {date_str}\n"
                        "ដូចបានប្រគេនខាងលើនេះសូមមេកុដិនិងអនុកុដិសួរនាំជាបន្ទាន់ដល់សមាជិកកុដិរបស់ខ្លួន។"
                    )
                    import requests as req
                    import threading
                    TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
                    TELEGRAM_CHAT_ID = -1003960014484
                    # Run telegram sending in a background thread to not block the response
                    def send_tg():
                        try:
                            _tg_send_message(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, msg, req)
                        except: pass
                    threading.Thread(target=send_tg).start()
                    
        cursor.close(); conn.close()
        
        # Check and send monthly alert
        _check_and_send_monthly_alert(date_str)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/permissions', methods=['POST'])
def add_permission():
    try:
        data = request.get_json()
        monk_id = data.get('monk_id')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        reason = data.get('reason', '')
        
        s_date = _date.fromisoformat(start_date)
        e_date = _date.fromisoformat(end_date)
        
        if e_date < s_date:
            return jsonify({'success': False, 'message': 'ថ្ងៃបញ្ចប់ត្រូវតែក្រោយថ្ងៃចាប់ផ្តើម'}), 400
            
        conn = connect_db()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO monk_permission (monk_id, reason, start_date, end_date)
            VALUES (%s, %s, %s, %s)
        """, (monk_id, reason, start_date, end_date))
        
        from datetime import timedelta
        current_date = s_date
        while current_date <= e_date:
            cursor.execute("""
                INSERT INTO attendance_tbl (monk_id, status, date)
                VALUES (%s, 'permission', %s)
                ON CONFLICT (monk_id, date) DO UPDATE SET status = EXCLUDED.status;
            """, (monk_id, current_date.isoformat()))
            current_date += timedelta(days=1)
            
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


def _check_and_send_monthly_alert(date_str):
    import os, calendar
    try:
        d = _date.fromisoformat(date_str)
    except:
        return
        
    last_day = calendar.monthrange(d.year, d.month)[1]
    is_target_day = d.day == 15 or d.day == 30 or (d.day == last_day and last_day < 30)
    
    if not is_target_day:
        return
        
    flag_file = os.path.join(os.path.dirname(__file__), 'last_monthly_alert.txt')
    try:
        if os.path.exists(flag_file):
            with open(flag_file, 'r') as f:
                if f.read().strip() == date_str:
                    return
    except:
        pass
        
    import requests as req
    import threading
    import io
    from collections import Counter
    TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
    TELEGRAM_CHAT_ID = -1003960014484
    
    def send_tg():
        try:
            # 1. Fetch data
            monks, start_date, end_date = _fetch_report_rows({'date': date_str})
            
            # 2. Filter violators
            ABSENT_LIMIT = 2
            PERM_LIMIT = 3
            violators = []
            for m in monks:
                ab = m['absent_count'] >= ABSENT_LIMIT
                pr = m['permission_count'] >= PERM_LIMIT
                if ab or pr:
                    violators.append(m)
                    
            # 3. Sort by Kuti frequency then Kuti name then absences/permissions
            kuti_counts = Counter(m['residence'] for m in violators)
            violators.sort(key=lambda m: (
                -kuti_counts[m['residence']],
                m['residence'],
                -m['absent_count'],
                -m['permission_count']
            ))
            
            # 4. Generate DOCX
            docx_buf = _make_export_docx(violators, 'អ្នកដែលមានបញ្ហា (អវត្តមាន/ច្បាប់លើសដែន)', '', 'biweekly')
            
            # 5. Send to Telegram
            fname_docx = f"attendance_report_{end_date.isoformat()}.docx"
            
            caption = (
                f"🔔 របាយការណ៍បូកសរុប ១៥ថ្ងៃ 🔔\n"
                f"កាលបរិច្ឆេទ៖ {start_date.strftime('%d/%m/%Y')} - {end_date.strftime('%d/%m/%Y')}\n"
                f"ចំនួនអ្នកដែលមានបញ្ហា៖ {len(violators)} អង្គ\n"
                f"សូមមេកុដិ និងអនុកុដិសួរនាំជាបន្ទាន់។"
            )
            
            tg_docx = req.post(
                f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendDocument',
                data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
                files={'document': (fname_docx, docx_buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
                timeout=25
            ).json()
            
            # Send Photo (PNG) with Caption
            tg_png = req.post(
                f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto',
                data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
                files={'photo': (fname_png, io.BytesIO(png_bytes), 'image/png')},
                timeout=25
            ).json()
            
            if tg_png.get('ok') or tg_pdf.get('ok'):
                with open(flag_file, 'w') as f:
                    f.write(date_str)
                    
        except Exception as e:
            print(f"Failed to send monthly alert: {e}")
            
    threading.Thread(target=send_tg).start()



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


def _format_date_list(dates):
    """Format a list of dates in the same month as '03, 04, 05 - 07 - 2026',
    grouping by month/year when the list spans more than one month."""
    from itertools import groupby
    dates = [d for d in (dates or []) if d]
    if not dates:
        return ''
    groups = []
    for (year, month), grp in groupby(dates, key=lambda d: (d.year, d.month)):
        days = ', '.join(f'{d.day:02d}' for d in grp)
        groups.append(f'{days} - {month:02d} - {year}')
    return '; '.join(groups)


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
               ARRAY_AGG(a.date ORDER BY a.date) FILTER (WHERE a.status = 'absent')     AS absent_dates,
               ARRAY_AGG(a.date ORDER BY a.date) FILTER (WHERE a.status = 'permission') AS perm_dates
        FROM monk_tbl m
        LEFT JOIN attendance_tbl a
            ON a.monk_id = m.id AND a.date >= %s AND a.date <= %s
        {where_sql}
        GROUP BY m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
                 m.residence, m.education_level, m.academic_year
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
        'absent_dates': _format_date_list(r[10]), 'perm_dates': _format_date_list(r[11]),
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
        '@media print { @page { size: A4 landscape; margin: 10mm; } }'
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
        html_str += '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>'
        return html_str

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
        date_str = request.args.get('date', _date.today().isoformat())
        block_start, block_end = _get_block_dates(date_str)
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                SUM(CASE WHEN status = 'absent'     THEN 1 ELSE 0 END),
                SUM(CASE WHEN status = 'permission' THEN 1 ELSE 0 END)
            FROM attendance_tbl
            WHERE monk_id = %s
              AND date >= %s
              AND date <= %s;
        """, (monk_id, block_start.isoformat(), block_end.isoformat()))
        row = cursor.fetchone()
        cursor.close(); conn.close()
        return jsonify({
            'success': True,
            'absent_count':     int(row[0] or 0),
            'permission_count': int(row[1] or 0)
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/full-history/<int:monk_id>', methods=['GET'])
def attendance_full_history(monk_id):
    try:
        date_str = request.args.get('date', _date.today().isoformat())
        block_start, block_end = _get_block_dates(date_str)
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.date, a.status, p.reason, p.end_date
            FROM attendance_tbl a
            LEFT JOIN monk_permission p
                   ON p.monk_id = a.monk_id
                  AND a.date >= p.start_date
                  AND a.date <= p.end_date
            WHERE a.monk_id = %s
              AND a.date >= %s
              AND a.date <= %s
            ORDER BY a.date DESC;
        """, (monk_id, block_start.isoformat(), block_end.isoformat()))
        rows = cursor.fetchall()
        cursor.close(); conn.close()

        absent_dates = []
        perm_dates   = []
        for date, status, reason, end_date in rows:
            entry = {'date': date.isoformat() if hasattr(date, 'isoformat') else str(date)}
            if status == 'absent':
                absent_dates.append(entry)
            elif status == 'permission':
                entry['reason']   = reason   or ''
                entry['end_date'] = end_date.isoformat() if end_date and hasattr(end_date, 'isoformat') else (str(end_date) if end_date else '')
                perm_dates.append(entry)

        return jsonify({
            'success':          True,
            'absent_count':     len(absent_dates),
            'permission_count': len(perm_dates),
            'absent_dates':     absent_dates,
            'perm_dates':       perm_dates,
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


def _tg_send_message(token, chat_id, text, req_lib, timeout=10):
    """Send a text message to Telegram, splitting into chunks if > 4000 chars."""
    MAX = 4000
    if len(text) <= MAX:
        return req_lib.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text},
            timeout=timeout,
        ).json()

    # Split on double-newline paragraph boundaries to keep records intact
    paragraphs = text.split('\n\n')
    chunks, current = [], ''
    for para in paragraphs:
        candidate = (current + '\n\n' + para).lstrip('\n')
        if len(candidate) <= MAX:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = para[:MAX]          # hard-cut only if single para > MAX
    if current:
        chunks.append(current)

    last = None
    for chunk in chunks:
        last = req_lib.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': chunk},
            timeout=timeout,
        ).json()
        if not last.get('ok'):
            return last
    return last


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

        tg = _tg_send_message(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, message, req)

        if not tg.get('ok'):
            return jsonify({'success': False, 'message': f"Telegram: {tg.get('description', 'error')}"}), 500

        return jsonify({'success': True, 'total': len(rows)})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/attendance/submit-image', methods=['POST'])
def submit_attendance_image():
    TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
    TELEGRAM_CHAT_ID = -1003960014484

    try:
        import requests as req
        if 'image' not in request.files:
            return jsonify({'success': False, 'message': 'No image provided'}), 400

        image_bytes = request.files['image'].read()
        caption = f'📋 បញ្ជីអវត្តមាន/ច្បាប់ — {_date.today().strftime("%d/%m/%Y")}'

        resp = req.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto',
            data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
            files={'photo': ('attendance.png', image_bytes, 'image/png')},
            timeout=30,
        ).json()

        if not resp.get('ok'):
            return jsonify({'success': False, 'message': resp.get('description', 'Telegram error')}), 500

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


@main_bp.route('/api/monks/export', methods=['GET'])
def export_monks():
    try:
        import io, html as _html
        from datetime import date
        fmt    = request.args.get('fmt',    'docx')

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

        conn = connect_db()
        cur  = conn.cursor()
        cur.execute(f"""
            SELECT fullname, vassa_years, monk_type, residence, position,
                   education_level, academic_year, created_at
            FROM monk_tbl {where_sql}
            ORDER BY fullname;
        """, where_params)
        rows = cur.fetchall()
        cur.close(); conn.close()

        monks = [{
            'fullname': r[0], 'vassa_years': r[1], 'monk_type': r[2],
            'residence': (r[3] or '').replace('_', ' '), 'position': r[4],
            'education_level': r[5] or '', 'academic_year': r[6] or '',
            'created_at': r[7]
        } for r in rows]

        # Default: the same role > type > vassa hierarchy used everywhere else.
        # A monk clicking the vassa column header on /view wants a pure vassa
        # sort instead — sort_vassa carries that explicit override into export.
        if sort_vassa in ('asc', 'desc'):
            monks.sort(key=lambda m: m['vassa_years'] or 0, reverse=(sort_vassa == 'desc'))
        else:
            monks = sort_attendance_monks(monks)

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

            hdrs   = ['#', 'ឈ្មោះ', 'វស្សា', 'ប្រភេទ', 'ស្នាក់នៅ', 'តួនាទី', 'កម្រិតសិក្សា']
            widths = [0.8, 3.8, 1.4, 1.8, 2.8, 3.4, 3.0]
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
                vals = [str(idx), m['fullname'], f"{m['vassa_years']} ឆ្នាំ", m['monk_type'],
                        m['residence'], m['position'], m['education_level']]
                row = tbl.add_row()
                for j, (val, w) in enumerate(zip(vals, widths)):
                    cell = row.cells[j]; cell.width = Cm(w); _shade(cell, bg)
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j in (0, 2) else WD_ALIGN_PARAGRAPH.LEFT
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
        elif fmt == 'html':

            bhikkhus  = [m for m in monks if m['monk_type'] == 'ភិក្ខុ']
            samaneras = [m for m in monks if m['monk_type'] == 'សាមណេរ']

            def _trow(m, idx, stripe):
                bg  = '#f8fafc' if stripe else '#ffffff'
                return (
                    f'<tr style="background:{bg}">'
                    f'<td class="c">{idx}</td>'
                    f'<td class="name">{_html.escape(m["fullname"])}</td>'
                    f'<td class="c">{m["vassa_years"]} ឆ្នាំ</td>'
                    f'<td>{_html.escape(m["monk_type"])}</td>'
                    f'<td>{_html.escape(m["residence"])}</td>'
                    f'<td>{_html.escape(m["position"])}</td>'
                    f'<td>{_html.escape(m["education_level"])}</td>'
                    f'</tr>'
                )

            def _section(section_monks, title, hdr_bg, hdr_color, border_color):
                if not section_monks:
                    return ''
                rows = ''.join(_trow(m, i + 1, i % 2 == 1) for i, m in enumerate(section_monks))
                return f'''
                <div class="sec-title" style="background:{hdr_bg};color:{hdr_color};border-left:4px solid {border_color}">
                    {_html.escape(title)} &nbsp;<span class="sec-count">({len(section_monks)} នាក់)</span>
                </div>
                <table>
                    <thead><tr>
                        <th class="c" style="width:28px">#</th>
                        <th>ឈ្មោះ</th>
                        <th class="c" style="width:48px">វស្សា</th>
                        <th>ប្រភេទ</th>
                        <th>ស្នាក់នៅ</th>
                        <th>តួនាទី</th>
                        <th>កម្រិតសិក្សា</th>
                    </tr></thead>
                    <tbody>{rows}</tbody>
                </table>'''

            # Active filters line
            fp = []
            if name:      fp.append(f'ឈ្មោះ: <strong>{_html.escape(name)}</strong>')
            if monk_type: fp.append(f'ប្រភេទ: <strong>{_html.escape(monk_type)}</strong>')
            if residence: fp.append(f'កុដិ: <strong>{_html.escape(residence.replace("_"," "))}</strong>')
            if position:  fp.append(f'តួនាទី: <strong>{_html.escape(position)}</strong>')
            if edu:       fp.append(f'កម្រិតសិក្សា: <strong>{_html.escape(edu)}</strong>')
            if acad:      fp.append(f'ថ្នាក់: <strong>{_html.escape(acad)}</strong>')
            filter_html = (
                f'<div class="filter-bar">🔎 &nbsp;' + ' &nbsp;|&nbsp; '.join(fp) + '</div>'
                if fp else ''
            )

            css = (
                "@import url('https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&display=swap');"
                "*, *::before, *::after{box-sizing:border-box;margin:0;padding:0}"
                "body{font-family:'Battambang','Khmer MN','Khmer Sangam MN',sans-serif;"
                "color:#1a202c;font-size:9px;background:#fff}"

                # Header
                ".header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);"
                "color:#fff;padding:14px 18px 12px;border-radius:8px;margin-bottom:14px}"
                ".hdr-top{display:flex;justify-content:space-between;align-items:flex-start}"
                ".hdr-name{font-size:17px;font-weight:700;letter-spacing:.4px}"
                ".hdr-sub{font-size:8.5px;opacity:.85;margin-top:3px}"
                ".hdr-date{font-size:8.5px;opacity:.8;text-align:right}"
                ".hdr-divider{border:none;border-top:1px solid rgba(255,255,255,.3);margin:10px 0 8px}"
                ".hdr-stats{display:flex;gap:20px}"
                ".hdr-stat{font-size:8.5px;opacity:.9}"
                ".hdr-stat strong{font-size:13px;display:block;font-weight:700}"

                # Summary chips
                ".chips{display:flex;gap:8px;margin-bottom:12px}"
                ".chip{flex:1;padding:7px 10px;border-radius:6px;text-align:center}"
                ".chip-lbl{font-size:7.5px;color:#718096;display:block;margin-bottom:2px}"
                ".chip-val{font-size:15px;font-weight:700;display:block}"
                ".chip-total{background:#edf2f7}.chip-total .chip-val{color:#2d3748}"
                ".chip-b{background:#fff8e1}.chip-b .chip-val{color:#8a6100}"
                ".chip-s{background:#f1f8e9}.chip-s .chip-val{color:#1b5e20}"

                # Filter bar
                ".filter-bar{background:#f7fafc;border:1px solid #e2e8f0;border-radius:5px;"
                "padding:5px 10px;font-size:8px;color:#4a5568;margin-bottom:12px}"

                # Section title
                ".sec-title{padding:5px 10px;font-size:10px;font-weight:700;"
                "border-radius:4px;margin-bottom:4px;margin-top:14px}"
                ".sec-count{font-weight:400;font-size:8.5px;opacity:.8}"

                # Table
                "table{width:100%;border-collapse:collapse;margin-bottom:4px}"
                "thead tr{background:#4a5568}"
                "th{padding:6px 6px;text-align:left;font-size:7.5px;font-weight:700;"
                "color:#fff;white-space:nowrap;border-right:1px solid rgba(255,255,255,.15)}"
                "th:last-child{border-right:none}"
                "td{padding:5px 6px;font-size:8.5px;border-bottom:1px solid #edf2f7;"
                "vertical-align:middle}"
                ".c{text-align:center}"
                ".name{font-weight:600;color:#1a202c}"

                # Footer
                ".footer{position:running(footer);display:flex;justify-content:space-between;"
                "font-size:7px;color:#a0aec0;border-top:1px solid #e2e8f0;padding-top:4px;"
                "margin-top:6px}"
                "@page{size:A4;margin:12mm 10mm 18mm;"
                "@bottom-center{content:element(footer)}}"
            )

            html_str = f'''<!DOCTYPE html>
<html lang="km"><head><meta charset="UTF-8">
<style>{css}
@media print {{ @page {{ size: A4 landscape; margin: 10mm; }} }}
</style></head><body>

<div class="header">
    <div class="hdr-top">
        <div>
            <div class="hdr-name">វត្តនិរោធរង្សី</div>
            <div class="hdr-sub">Pagoda Niroth Rangsay — បញ្ជីព្រះសង្ឃ</div>
        </div>
        <div class="hdr-date">
            ថ្ងៃទី {_html.escape(today)}<br>
            ស្ថានភាព​ ​បច្ចុប្បន្ន
        </div>
    </div>
    <hr class="hdr-divider">
    <div class="hdr-stats">
        <div class="hdr-stat"><strong>{len(monks)}</strong>ព្រះសង្ឃ​សរុប</div>
        <div class="hdr-stat"><strong>{len(bhikkhus)}</strong>ភិក្ខុ</div>
        <div class="hdr-stat"><strong>{len(samaneras)}</strong>សាមណេរ</div>
    </div>
</div>

{filter_html}

{_section(bhikkhus,  'ផ្នែកទី ១ — ភិក្ខុ',   '#fff8e1','#8a6100','#f0c040')}
{_section(samaneras, 'ផ្នែកទី ២ — សាមណេរ', '#f1f8e9','#1b5e20','#66bb6a')}

<div class="footer">
    <span>វត្តនិរោធរង្សី — បញ្ជីព្រះសង្ឃ</span>
    <span>ថ្ងៃទី {_html.escape(today)}</span>
</div>
</body></html>'''

            return html_str

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
            "*, *::before, *::after{box-sizing:border-box;margin:0;padding:0}"
            "body{font-family:'Battambang','Khmer MN',sans-serif;color:#1a202c;font-size:8.5px;background:#fff}"

            # Header
            ".header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);"
            "color:#fff;padding:10px 14px 9px;border-radius:7px;margin-bottom:10px}"
            ".hdr-row{display:flex;justify-content:space-between;align-items:center}"
            ".hdr-title{font-size:15px;font-weight:700;letter-spacing:.3px}"
            ".hdr-sub{font-size:8px;opacity:.85;margin-top:2px}"
            ".hdr-right{text-align:right;font-size:8px;opacity:.85}"
            ".hdr-divider{border:none;border-top:1px solid rgba(255,255,255,.3);margin:7px 0 6px}"
            ".hdr-stats{display:flex;gap:18px}"
            ".hdr-stat{font-size:8px;opacity:.9}"
            ".hdr-stat strong{font-size:12px;display:block;font-weight:700}"

            # Section
            ".sec{padding:4px 9px;font-size:10px;font-weight:700;border-radius:4px;margin:10px 0 4px}"
            ".sec-b{background:#fff8e1;color:#8a6100;border-left:4px solid #f0c040}"
            ".sec-s{background:#f1f8e9;color:#1b5e20;border-left:4px solid #66bb6a}"
            ".sec-sub{font-size:7.5px;font-weight:400;opacity:.75;margin-left:6px}"

            # Grid table
            "table{width:100%;border-collapse:collapse;margin-bottom:8px}"
            "td{border:1px solid #e2e8f0;vertical-align:top;padding:3px 4px}"
            ".filled{background:#f7f8fa}"
            ".empty{background:#fafbfc}"
            ".num{display:block;font-size:6.5px;color:#a0aec0;line-height:1}"
            ".num-e{display:block;font-size:6.5px;color:#e2e8f0}"
            ".name{display:block;font-size:8px;font-weight:700;color:#1a202c;margin:2px 0 1px;line-height:1.3}"
            ".sub{display:block;font-size:7px;color:#718096;line-height:1.2}"

            # Footer
            ".footer{position:running(footer);display:flex;justify-content:space-between;"
            "font-size:7px;color:#a0aec0;border-top:1px solid #e2e8f0;padding-top:3px}"
            "@page{size:A4 landscape;margin:10mm 12mm 16mm;"
            "@bottom-center{content:element(footer)}}"
        )
        html_str = f'''<!DOCTYPE html>
<html lang="km"><head><meta charset="UTF-8"><style>{css}
@media print {{ @page {{ size: A4 landscape; margin: 10mm; }} }}
</style></head><body>

<div class="header">
  <div class="hdr-row">
    <div>
      <div class="hdr-title">ប្លង់អាសនៈព្រះសង្ឃ — វត្តនិរោធរង្សី</div>
      <div class="hdr-sub">Pagoda Niroth Rangsay — Seating Layout</div>
    </div>
    <div class="hdr-right">ថ្ងៃទី {today}<br>ស្ថានភាព​ ​បច្ចុប្បន្ន</div>
  </div>
  <hr class="hdr-divider">
  <div class="hdr-stats">
    <div class="hdr-stat"><strong>{len(bhikkhus)}</strong>ភិក្ខុ</div>
    <div class="hdr-stat"><strong>{len(samaneras)}</strong>សាមណេរ</div>
    <div class="hdr-stat"><strong>{len(bhikkhus)+len(samaneras)}</strong>ព្រះសង្ឃ​សរុប</div>
  </div>
</div>

<div class="sec sec-b">ផ្នែកទី ១ — ភិក្ខុ
  <span class="sec-sub">{len(bhikkhus)} នាក់ &nbsp;|&nbsp; ក្រឡា {br}×{bc}={br*bc}</span>
</div>
{build_grid(bhikkhus, br, bc, "bhikkhu")}

<div class="sec sec-s">ផ្នែកទី ២ — សាមណេរ
  <span class="sec-sub">{len(samaneras)} នាក់ &nbsp;|&nbsp; ក្រឡា {sr}×{sc}={sr*sc}</span>
</div>
{build_grid(samaneras, sr, sc, "samanera")}

<div class="footer">
  <span>វត្តនិរោធរង្សី — ប្លង់អាសនៈព្រះសង្ឃ</span>
  <span>ថ្ងៃទី {today}</span>
</div>
</body></html>'''

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


def _fetch_live_range(start_date, end_date):
    """Aggregate directly from attendance_tbl for any date range — no compiled summaries needed."""
    sql = """
        SELECT m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
               m.residence, m.education_level, m.academic_year,
               COALESCE(SUM(CASE WHEN a.status = 'absent'     THEN 1 ELSE 0 END), 0),
               COALESCE(SUM(CASE WHEN a.status = 'permission' THEN 1 ELSE 0 END), 0)
        FROM monk_tbl m
        LEFT JOIN attendance_tbl a
            ON a.monk_id = m.id AND a.date >= %s AND a.date <= %s
        GROUP BY m.id, m.fullname, m.monk_type, m.position,
                 m.vassa_years, m.residence, m.education_level, m.academic_year
        HAVING COALESCE(SUM(CASE WHEN a.status = 'absent'     THEN 1 ELSE 0 END), 0) >= %s
            OR COALESCE(SUM(CASE WHEN a.status = 'permission' THEN 1 ELSE 0 END), 0) >= %s
        ORDER BY m.monk_type,
                 SUM(CASE WHEN a.status = 'absent'     THEN 1 ELSE 0 END) DESC,
                 SUM(CASE WHEN a.status = 'permission' THEN 1 ELSE 0 END) DESC
    """
    conn = connect_db()
    cur  = conn.cursor()
    cur.execute(sql, (start_date.isoformat(), end_date.isoformat(),
                      DISC_ABSENT_MIN, DISC_PERM_MIN))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [{
        'id':                r[0],
        'fullname':          r[1],
        'monk_type':         r[2],
        'position':          r[3],
        'vassa_years':       r[4],
        'residence':         (r[5] or '').replace('_', ' '),
        'education_level':   r[6] or '',
        'academic_year':     r[7] or '',
        'total_absences':    int(r[8] or 0),
        'total_permissions': int(r[9] or 0),
        'range_start':       start_date.isoformat(),
        'range_end':         end_date.isoformat(),
    } for r in rows]


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
    year_str  = request.args.get('year',  str(_date.today().year))
    month_str = request.args.get('month', str(_date.today().month))
    try:
        import calendar
        year, month = int(year_str), int(month_str)
        month_start = _date(year, month, 1)
        month_end   = _date(year, month, calendar.monthrange(year, month)[1])
        monks = _fetch_live_range(month_start, month_end)
        return jsonify({
            'success':      True,
            'year':         year,
            'month':        month,
            'period_start': month_start.isoformat(),
            'period_end':   month_end.isoformat(),
            'monks':        monks,
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: annual report -----------------------------------------

@main_bp.route('/api/reports/annual', methods=['GET'])
def report_annual():
    year_str = request.args.get('year', str(_date.today().year))
    try:
        year       = int(year_str)
        year_start = _date(year, 1, 1)
        year_end   = _date(year, 12, 31)
        monks = _fetch_live_range(year_start, year_end)
        return jsonify({
            'success':      True,
            'year':         year,
            'period_start': year_start.isoformat(),
            'period_end':   year_end.isoformat(),
            'monks':        monks,
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- API: 3-year report -----------------------------------------

@main_bp.route('/api/reports/triennial', methods=['GET'])
def report_triennial():
    start_year_str = request.args.get('start_year', str(_date.today().year - 2))
    try:
        start_year   = int(start_year_str)
        end_year     = start_year + 2
        period_start = _date(start_year, 1, 1)
        period_end   = _date(end_year, 12, 31)
        monks = _fetch_live_range(period_start, period_end)
        return jsonify({
            'success':      True,
            'start_year':   start_year,
            'end_year':     end_year,
            'period_start': period_start.isoformat(),
            'period_end':   period_end.isoformat(),
            'monks':        monks,
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---- Unified export: fetch + normalise data for any report type -

def _fetch_export_data(report_type, args):
    """Return (monks, type_label, subtitle, period_start_iso, period_end_iso).
    monks list is normalised: absent_count, permission_count, absent_dates, perm_dates, status."""
    import calendar as _cal

    if report_type == 'daily':
        date_str = args.get('date', _date.today().isoformat())
        conn = connect_db(); cur = conn.cursor()
        cur.execute("""
            SELECT m.id, m.fullname, m.monk_type, m.position, m.vassa_years,
                   m.residence, m.education_level, m.academic_year, a.status
            FROM attendance_tbl a
            JOIN monk_tbl m ON m.id = a.monk_id
            WHERE a.date = %s
            ORDER BY m.fullname
        """, (date_str,))
        rows = cur.fetchall(); cur.close(); conn.close()
        d_fmt = _date.fromisoformat(date_str).strftime('%d/%m/%Y')
        monks = [{
            'id': r[0], 'fullname': r[1], 'monk_type': r[2], 'position': r[3],
            'vassa_years': r[4], 'residence': (r[5] or '').replace('_', ' '),
            'education_level': r[6] or '', 'academic_year': r[7] or '',
            'absent_count':     1 if r[8] == 'absent'     else 0,
            'permission_count': 1 if r[8] == 'permission' else 0,
            'absent_dates':     d_fmt if r[8] == 'absent'     else '',
            'perm_dates':       d_fmt if r[8] == 'permission' else '',
            'status': r[8],
        } for r in rows]
        monks = sort_attendance_monks(monks)
        return monks, 'ប្រចាំថ្ងៃ', d_fmt, date_str, date_str

    elif report_type == 'biweekly':
        monks, start_date, end_date = _fetch_report_rows(args)
        subtitle = f"{start_date.strftime('%d/%m/%Y')} ដល់ {end_date.strftime('%d/%m/%Y')} (១៥ ថ្ងៃ)"
        return monks, 'ប្រចាំ ១៥ ថ្ងៃ', subtitle, start_date.isoformat(), end_date.isoformat()

    elif report_type == 'monthly':
        date_str = args.get('date', _date.today().isoformat())
        d = _date.fromisoformat(date_str)
        year  = int(args.get('year',  d.year))
        month = int(args.get('month', d.month))
        ps = _date(year, month, 1)
        pe = _date(year, month, _cal.monthrange(year, month)[1])
        monks = _norm_summary_monks(_fetch_live_range(ps, pe))
        subtitle = f"{ps.strftime('%d/%m/%Y')} ដល់ {pe.strftime('%d/%m/%Y')}"
        return monks, 'ប្រចាំខែ', subtitle, ps.isoformat(), pe.isoformat()

    elif report_type == 'annual':
        date_str = args.get('date', _date.today().isoformat())
        year = int(args.get('year', _date.fromisoformat(date_str).year))
        ps = _date(year, 1, 1); pe = _date(year, 12, 31)
        monks = _norm_summary_monks(_fetch_live_range(ps, pe))
        subtitle = f"{ps.strftime('%d/%m/%Y')} ដល់ {pe.strftime('%d/%m/%Y')}"
        return monks, 'ប្រចាំឆ្នាំ', subtitle, ps.isoformat(), pe.isoformat()

    else:  # triennial
        date_str   = args.get('date', _date.today().isoformat())
        d          = _date.fromisoformat(date_str)
        start_year = int(args.get('start_year', d.year - 2))
        ps = _date(start_year, 1, 1); pe = _date(start_year + 2, 12, 31)
        monks = _norm_summary_monks(_fetch_live_range(ps, pe))
        subtitle = f"{ps.strftime('%d/%m/%Y')} ដល់ {pe.strftime('%d/%m/%Y')}"
        return monks, 'ប្រចាំ ៣ ឆ្នាំ', subtitle, ps.isoformat(), pe.isoformat()


def _norm_summary_monks(monks):
    """Convert _rows_to_monks shape to unified export shape."""
    result = []
    for m in monks:
        rng = ''
        if m.get('range_start') and m.get('range_end'):
            rs  = _date.fromisoformat(m['range_start']).strftime('%d/%m/%Y')
            re  = _date.fromisoformat(m['range_end']).strftime('%d/%m/%Y')
            rng = f"{rs} → {re}"
        result.append({**m,
            'absent_count':     m['total_absences'],
            'permission_count': m['total_permissions'],
            'absent_dates':     '',
            'perm_dates':       rng,
            'status':           None,
        })
    return result


# ---- Unified export: Ministry document header (docx) --------------

def _add_ministry_header_docx(doc, lunar_str):
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    def no_border(table):
        tbl_pr = table._tbl.tblPr
        borders = OxmlElement('w:tblBorders')
        for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            el = OxmlElement(f'w:{edge}')
            el.set(qn('w:val'), 'none')
            borders.append(el)
        tbl_pr.append(borders)

    def line(cell, text, *, bold=False, color=None, size=10, first=False):
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(text)
        run.bold = bold
        run.font.size = Pt(size)
        if color: run.font.color.rgb = RGBColor(*color)

    hdr_tbl = doc.add_table(rows=1, cols=2)
    hdr_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    no_border(hdr_tbl)
    left, right = hdr_tbl.rows[0].cells
    left.width = right.width = Cm(8.5)

    line(left, '[ និមិត្តសញ្ញាក្រសួង ]', color=(0x2B, 0x6C, 0xB0), size=9, first=True)
    for txt in _HDR_LEFT_LINES:
        line(left, txt, color=(0x2B, 0x6C, 0xB0), size=10)

    line(right, _HDR_RIGHT_LINES[0], bold=True, size=12, first=True)
    line(right, _HDR_RIGHT_LINES[1], bold=True, size=11)

    doc.add_paragraph()
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = t.add_run(_HDR_MAIN_TITLE)
    tr.bold = True
    tr.font.size = Pt(16)

    s = doc.add_paragraph()
    s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = s.add_run(f"កាលបរិច្ឆេទ ជាចន្ទគតិ: {lunar_str}")
    sr.font.size = Pt(10)
    sr.font.color.rgb = RGBColor(0x71, 0x80, 0x96)
    doc.add_paragraph()


# ---- Unified export: build docx ----------------------------------

def _make_export_docx(monks, type_label, subtitle, report_type):
    import io
    from datetime import date as _d
    from docx import Document
    from docx.shared import Pt, Cm, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    def shade(cell, hex_color):
        tcPr = cell._tc.get_or_add_tcPr()
        shd  = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), hex_color); tcPr.append(shd)

    if report_type == 'daily':
        headers = ['#', 'ឈ្មោះ', 'ប្រភេទ', 'តួនាទី', 'វស្សា', 'ស្នាក់នៅ', 'ស្ថានភាព']
        widths  = [0.5, 3.0, 1.5, 2.5, 1.0, 2.0, 2.0]
    elif report_type == 'biweekly':
        headers = ['#', 'ឈ្មោះ', 'តួនាទី', 'វស្សា', 'ស្នាក់នៅ', 'ការសិក្សា', '❌', '📋', 'ថ្ងៃ', 'ស្ថានភាព']
        widths  = [0.5, 3.0, 2.5, 1.0, 2.0, 1.6, 0.7, 0.7, 2.8, 1.8]
    else:
        headers = ['#', 'ឈ្មោះ', 'ប្រភេទ', 'តួនាទី', 'វស្សា', '❌', '📋', 'ចន្លោះ', 'ស្ថានភាព']
        widths  = [0.5, 3.0, 1.5, 2.5, 1.0, 0.7, 0.7, 3.5, 1.8]

    def add_table(doc, section_monks):
        tbl = doc.add_table(rows=1, cols=len(headers))
        tbl.style = 'Table Grid'
        for i, (h, w) in enumerate(zip(headers, widths)):
            cell = tbl.rows[0].cells[i]; cell.width = Cm(w)
            shade(cell, 'F7FAFC')
            p = cell.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(h); run.bold = True
            run.font.size = Pt(8.5); run.font.color.rgb = RGBColor(0x71, 0x80, 0x96)

        for idx, m in enumerate(section_monks, 1):
            ab = m['absent_count']     >= DISC_ABSENT_MIN
            pr = m['permission_count'] >= DISC_PERM_MIN
            bg = 'FFF5F5' if ab else ('FFFAF0' if pr else 'FFFFFF')
            status_text = '⚠ លើសអវត្តមាន' if ab else ('⚠ លើសច្បាប់' if pr else '✓ ប្រក្រតី')
            row = tbl.add_row()

            if report_type == 'daily':
                s = '❌ អវត្តមាន' if m.get('status') == 'absent' else '📋 ច្បាប់'
                vals    = [str(idx), m['fullname'], m['monk_type'], m['position'],
                           f"{m['vassa_years']} ឆ្នាំ", m['residence'], s]
                centers = {0, 2, 4, 6}
                abs_col = perm_col = -1
            elif report_type == 'biweekly':
                edu    = f"{m['education_level']} {m['academic_year']}".strip()
                dp     = []
                if m['absent_dates']: dp.append(f"❌ {m['absent_dates']}")
                if m['perm_dates']:   dp.append(f"📋 {m['perm_dates']}")
                vals    = [str(idx), m['fullname'], m['position'], f"{m['vassa_years']} ឆ្នាំ",
                           m['residence'], edu,
                           str(m['absent_count'])     if m['absent_count']     else '—',
                           str(m['permission_count']) if m['permission_count'] else '—',
                           '\n'.join(dp) if dp else '—', status_text]
                centers = {0, 3, 6, 7}; abs_col, perm_col = 6, 7
            else:
                vals    = [str(idx), m['fullname'], m['monk_type'], m['position'],
                           f"{m['vassa_years']} ឆ្នាំ",
                           str(m['absent_count'])     if m['absent_count']     else '—',
                           str(m['permission_count']) if m['permission_count'] else '—',
                           m['perm_dates'] or '—', status_text]
                centers = {0, 2, 4, 5, 6}; abs_col, perm_col = 5, 6

            for j, (val, w) in enumerate(zip(vals, widths)):
                cell = row.cells[j]; cell.width = Cm(w)
                shade(cell, bg)
                p = cell.paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER if j in centers else WD_ALIGN_PARAGRAPH.LEFT
                run = p.add_run(val); run.font.size = Pt(8.5)
                if j == 1:            run.bold = True
                if ab and j == abs_col:  run.font.color.rgb = RGBColor(0xC5, 0x30, 0x30)
                if pr and j == perm_col: run.font.color.rgb = RGBColor(0xC0, 0x56, 0x21)

    from docx.enum.section import WD_ORIENT

    doc = Document()
    sec = doc.sections[0]
    sec.orientation  = WD_ORIENT.LANDSCAPE
    sec.page_width, sec.page_height = sec.page_height, sec.page_width
    sec.left_margin = sec.right_margin = Cm(1.5)
    sec.top_margin  = sec.bottom_margin = Cm(1.5)

    _add_ministry_header_docx(doc, khmer_lunar_date(_d.today()))

    t = doc.add_heading(f'របាយការណ៍វត្តមាន ({type_label})', 1)
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub = doc.add_paragraph(f"ចន្លោះ: {subtitle}")
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.runs[0].font.size = Pt(10)
    sub.runs[0].font.color.rgb = RGBColor(0x71, 0x80, 0x96)
    doc.add_paragraph()

    bhikkhus  = [m for m in monks if m['monk_type'] == 'ភិក្ខុ']
    samaneras = [m for m in monks if m['monk_type'] == 'សាមណេរ']
    if bhikkhus:
        h1 = doc.add_heading('ផ្នែកទី ១ — ភិក្ខុ', 1)
        h1.runs[0].font.color.rgb = RGBColor(0x8A, 0x61, 0x00)
        add_table(doc, bhikkhus); doc.add_paragraph()
    if samaneras:
        h2 = doc.add_heading('ផ្នែកទី ២ — សាមណេរ', 1)
        h2.runs[0].font.color.rgb = RGBColor(0x1B, 0x5E, 0x20)
        add_table(doc, samaneras); doc.add_paragraph()

    av = sum(1 for m in monks if m['absent_count']     >= DISC_ABSENT_MIN)
    pv = sum(1 for m in monks if m['permission_count'] >= DISC_PERM_MIN)
    sp = doc.add_paragraph(
        f"📊 សរុប {len(monks)} នាក់  |  ❌ លើសអវត្តមាន: {av} នាក់  |  📋 លើសច្បាប់: {pv} នាក់"
    )
    sp.runs[0].font.size = Pt(10); sp.runs[0].bold = True

    buf = io.BytesIO(); doc.save(buf); buf.seek(0)
    return buf


# ---- Unified export: build HTML for PDF --------------------------

def _make_export_html(monks, type_label, subtitle, report_type):
    import html as _h

    if report_type == 'daily':
        thead = ('<th>#</th><th>ឈ្មោះ</th><th>ប្រភេទ</th><th>តួនាទី</th>'
                 '<th>វស្សា</th><th>ស្នាក់នៅ</th><th>ស្ថានភាព</th>')
    elif report_type == 'biweekly':
        thead = ('<th>#</th><th>ឈ្មោះ</th><th>តួនាទី</th><th>វស្សា</th><th>ស្នាក់នៅ</th>'
                 '<th>ការសិក្សា</th><th>❌</th><th>📋</th><th>ថ្ងៃ</th><th>ស្ថានភាព</th>')
    else:
        thead = ('<th>#</th><th>ឈ្មោះ</th><th>ប្រភេទ</th><th>តួនាទី</th>'
                 '<th>វស្សា</th><th>❌</th><th>📋</th><th>ចន្លោះ</th><th>ស្ថានភាព</th>')

    def row_html(m, idx):
        ab = m['absent_count']     >= DISC_ABSENT_MIN
        pr = m['permission_count'] >= DISC_PERM_MIN
        bg = '#fff5f5' if ab else ('#fffaf0' if pr else '#ffffff')
        badge = ('<span class="badge-danger">⚠ លើសអវត្តមាន</span>' if ab else
                 '<span class="badge-warning">⚠ លើសច្បាប់</span>' if pr else
                 '<span class="badge-ok">✓ ប្រក្រតី</span>')
        n  = f'<td class="num">{idx}</td>'
        nm = f'<td><strong>{_h.escape(m["fullname"])}</strong></td>'

        if report_type == 'daily':
            sb = ('<span class="badge-danger">❌ អវត្តមាន</span>'
                  if m.get('status') == 'absent' else
                  '<span class="badge-warning">📋 ច្បាប់</span>')
            return (f'<tr style="background:{bg}">{n}{nm}'
                    f'<td class="num">{_h.escape(m["monk_type"])}</td>'
                    f'<td>{_h.escape(m["position"])}</td>'
                    f'<td class="num">{m["vassa_years"]} ឆ្នាំ</td>'
                    f'<td>{_h.escape(m["residence"])}</td>'
                    f'<td>{sb}</td></tr>')

        elif report_type == 'biweekly':
            ac  = 'color:#c53030;font-weight:bold' if ab else 'color:#718096'
            pc  = 'color:#c05621;font-weight:bold' if pr else 'color:#718096'
            edu = _h.escape(f"{m['education_level']} {m['academic_year']}".strip())
            dp  = []
            if m['absent_dates']: dp.append(f'<span style="color:#c53030">❌ {_h.escape(m["absent_dates"])}</span>')
            if m['perm_dates']:   dp.append(f'<span style="color:#c05621">📋 {_h.escape(m["perm_dates"])}</span>')
            dc  = '<br>'.join(dp) if dp else '—'
            return (f'<tr style="background:{bg}">{n}{nm}'
                    f'<td>{_h.escape(m["position"])}</td>'
                    f'<td class="num">{m["vassa_years"]} ឆ្នាំ</td>'
                    f'<td>{_h.escape(m["residence"])}</td><td>{edu}</td>'
                    f'<td class="num" style="{ac}">{m["absent_count"] or "—"}</td>'
                    f'<td class="num" style="{pc}">{m["permission_count"] or "—"}</td>'
                    f'<td class="dates">{dc}</td><td>{badge}</td></tr>')

        else:
            ac  = 'color:#c53030;font-weight:bold' if ab else 'color:#718096'
            pc  = 'color:#c05621;font-weight:bold' if pr else 'color:#718096'
            rng = (f'<span style="font-size:15px">{_h.escape(m["perm_dates"])}</span>'
                   if m['perm_dates'] else '—')
            return (f'<tr style="background:{bg}">{n}{nm}'
                    f'<td class="num">{_h.escape(m["monk_type"])}</td>'
                    f'<td>{_h.escape(m["position"])}</td>'
                    f'<td class="num">{m["vassa_years"]} ឆ្នាំ</td>'
                    f'<td class="num" style="{ac}">{m["absent_count"] or "—"}</td>'
                    f'<td class="num" style="{pc}">{m["permission_count"] or "—"}</td>'
                    f'<td class="dates">{rng}</td><td>{badge}</td></tr>')

    def section_html(sm, title, sec_cls, border_color):
        if not sm: return ''
        rows = ''.join(row_html(m, i + 1) for i, m in enumerate(sm))
        return (
            f'<div class="sec {sec_cls}">'
            f'{_h.escape(title)}'
            f'<span class="sec-count">({len(sm)} នាក់)</span></div>'
            f'<table><thead><tr class="thead-row">{thead}</tr></thead>'
            f'<tbody>{rows}</tbody></table>'
        )

    bhikkhus  = [m for m in monks if m['monk_type'] == 'ភិក្ខុ']
    samaneras = [m for m in monks if m['monk_type'] == 'សាមណេរ']
    av = sum(1 for m in monks if m['absent_count']     >= DISC_ABSENT_MIN)
    pv = sum(1 for m in monks if m['permission_count'] >= DISC_PERM_MIN)
    cl = len(monks) - av - pv

    css = (
        "@import url('https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&display=swap');"
        "*, *::before, *::after{box-sizing:border-box;margin:0;padding:0}"
        "body{font-family:'Battambang','Khmer MN','Khmer Sangam MN',sans-serif;"
        "color:#1a202c;font-size:17px;background:#fff}"

        # Header
        ".header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);"
        "color:#fff;padding:16px 18px 14px;border-radius:7px;margin-bottom:14px}"
        ".hdr-top{display:flex;justify-content:space-between;align-items:flex-start}"
        ".hdr-title{font-size:27px;font-weight:700;letter-spacing:.3px}"
        ".hdr-sub{font-size:15px;opacity:.85;margin-top:4px}"
        ".hdr-right{text-align:right;font-size:15px;opacity:.85}"
        ".hdr-divider{border:none;border-top:1px solid rgba(255,255,255,.3);margin:10px 0 8px}"
        ".hdr-stats{display:flex;gap:20px}"
        ".hdr-stat{font-size:15px;opacity:.9}"
        ".hdr-stat strong{font-size:23px;display:block;font-weight:700}"

        # Chips
        ".chips{display:flex;gap:8px;margin-bottom:13px}"
        ".chip{flex:1;padding:7px 9px;border-radius:6px;text-align:center}"
        ".chip-lbl{font-size:13px;display:block;margin-bottom:2px}"
        ".chip-val{font-size:24px;font-weight:700;display:block}"
        ".c-total{background:#edf2f7}.c-total .chip-lbl{color:#718096}.c-total .chip-val{color:#2d3748}"
        ".c-abs{background:#fed7d7}.c-abs .chip-lbl{color:#c53030}.c-abs .chip-val{color:#c53030}"
        ".c-perm{background:#feebc8}.c-perm .chip-lbl{color:#c05621}.c-perm .chip-val{color:#c05621}"
        ".c-ok{background:#c6f6d5}.c-ok .chip-lbl{color:#276749}.c-ok .chip-val{color:#276749}"

        # Section
        ".sec{padding:6px 12px;font-size:18px;font-weight:700;border-radius:4px;margin:14px 0 5px}"
        ".sec-b{background:#fff8e1;color:#8a6100;border-left:4px solid #f0c040}"
        ".sec-s{background:#f1f8e9;color:#1b5e20;border-left:4px solid #66bb6a}"
        ".sec-count{font-weight:400;font-size:14px;opacity:.75;margin-left:7px}"

        # Table
        "table{width:100%;border-collapse:collapse;margin-bottom:5px}"
        ".thead-row{background:#4a5568}"
        "th{padding:8px 8px;text-align:left;font-size:14px;font-weight:700;"
        "color:#fff;white-space:nowrap;border-right:1px solid rgba(255,255,255,.15)}"
        "th:last-child{border-right:none}"
        "td{padding:7px 8px;font-size:16px;border-bottom:1px solid #edf2f7;vertical-align:middle}"
        "tr:nth-child(even) td{background:#f8fafc}"
        ".num{text-align:center}"
        ".dates{font-size:14px;line-height:1.6}"
        ".badge-danger{background:#fed7d7;color:#c53030;padding:2px 7px;"
        "border-radius:8px;font-size:14px;font-weight:700;white-space:nowrap}"
        ".badge-warning{background:#feebc8;color:#c05621;padding:2px 7px;"
        "border-radius:8px;font-size:14px;font-weight:700;white-space:nowrap}"
        ".badge-ok{background:#c6f6d5;color:#276749;padding:2px 7px;"
        "border-radius:8px;font-size:14px;font-weight:700;white-space:nowrap}"

        # Footer
        ".footer{position:running(footer);display:flex;justify-content:space-between;"
        "font-size:12px;color:#a0aec0;border-top:1px solid #e2e8f0;padding-top:5px}"
        "@page{size:A4 landscape;margin:12mm 10mm 17mm;"
        "@bottom-center{content:element(footer)}}"

        # Ministry document header
        ".mh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}"
        ".mh-left{display:flex;flex-direction:column;align-items:center;"
        "color:#2b6cb0;font-size:13px;line-height:1.5;flex:1}"
        ".mh-logo{width:44px;height:44px;border:1px dashed #2b6cb0;border-radius:4px;"
        "display:flex;align-items:center;justify-content:center;font-size:7px;"
        "margin-bottom:4px;text-align:center;color:#2b6cb0}"
        ".mh-right{text-align:center;font-weight:700;font-size:15px;line-height:1.6;flex:1}"
        ".mh-title{text-align:center;font-weight:700;font-size:22px;margin-top:4px}"
        ".mh-sub{text-align:center;font-size:13px;color:#718096;margin:2px 0 12px}"
    )

    lunar_str = khmer_lunar_date(_date.today())
    ministry_header = f'''
<div class="mh">
  <div class="mh-left">
    <div class="mh-logo">[ និមិត្តសញ្ញា<br>ក្រសួង ]</div>
    <div>{_h.escape(_HDR_LEFT_LINES[0])}</div>
    <div>{_h.escape(_HDR_LEFT_LINES[1])}</div>
    <div>{_h.escape(_HDR_LEFT_LINES[2])}</div>
  </div>
  <div class="mh-right">
    <div>{_h.escape(_HDR_RIGHT_LINES[0])}</div>
    <div>{_h.escape(_HDR_RIGHT_LINES[1])}</div>
  </div>
</div>
<div class="mh-title">{_h.escape(_HDR_MAIN_TITLE)}</div>
<div class="mh-sub">កាលបរិច្ឆេទ ជាចន្ទគតិ: {_h.escape(lunar_str)}</div>'''

    return f'''<!DOCTYPE html>
<html lang="km"><head><meta charset="UTF-8"><style>{css}
@media print {{ @page {{ size: A4 landscape; margin: 10mm; }} }}
</style></head><body>

{ministry_header}

<div class="header">
  <div class="hdr-top">
    <div>
      <div class="hdr-title">វត្តនិរោធរង្សី — របាយការណ៍វត្តមាន</div>
      <div class="hdr-sub">Pagoda Niroth Rangsay &nbsp;|&nbsp; {_h.escape(type_label)}</div>
    </div>
    <div class="hdr-right">ចន្លោះ: {_h.escape(subtitle)}</div>
  </div>
  <hr class="hdr-divider">
  <div class="hdr-stats">
    <div class="hdr-stat"><strong>{len(monks)}</strong>ព្រះសង្ឃ​សរុប</div>
    <div class="hdr-stat"><strong>{av}</strong>លើស​អវត្តមាន</div>
    <div class="hdr-stat"><strong>{pv}</strong>លើស​ច្បាប់</div>
    <div class="hdr-stat"><strong>{cl}</strong>ប្រក្រតី</div>
  </div>
</div>

<div class="chips">
  <div class="chip c-total"><span class="chip-lbl">ព្រះសង្ឃ</span><span class="chip-val">{len(monks)}</span></div>
  <div class="chip c-abs"><span class="chip-lbl">❌ លើស​អវត្តមាន</span><span class="chip-val">{av}</span></div>
  <div class="chip c-perm"><span class="chip-lbl">📋 លើស​ច្បាប់</span><span class="chip-val">{pv}</span></div>
  <div class="chip c-ok"><span class="chip-lbl">✓ ប្រក្រតី</span><span class="chip-val">{cl}</span></div>
</div>

{section_html(bhikkhus,  'ផ្នែកទី ១ — ភិក្ខុ',   'sec-b', '#f0c040')}
{section_html(samaneras, 'ផ្នែកទី ២ — សាមណេរ', 'sec-s', '#66bb6a')}

<div class="footer">
  <span>វត្តនិរោធរង្សី — របាយការណ៍វត្តមាន ({_h.escape(type_label)})</span>
  <span>{_h.escape(subtitle)}</span>
</div>
</body></html>'''


# ---- Unified export: build excel ----------------------------------

def _make_export_excel(monks, type_label, subtitle, report_type):
    import io
    from datetime import date as _d
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    if report_type == 'daily':
        headers = ['#', 'ឈ្មោះ', 'ប្រភេទ', 'តួនាទី', 'វស្សា', 'ស្នាក់នៅ', 'ស្ថានភាព']
        widths  = [5, 24, 12, 20, 8, 18, 16]
    elif report_type == 'biweekly':
        headers = ['#', 'ឈ្មោះ', 'តួនាទី', 'វស្សា', 'ស្នាក់នៅ', 'ការសិក្សា', '❌', '📋', 'ថ្ងៃ', 'ស្ថានភាព']
        widths  = [5, 24, 20, 8, 18, 14, 6, 6, 24, 16]
    else:
        headers = ['#', 'ឈ្មោះ', 'ប្រភេទ', 'តួនាទី', 'វស្សា', '❌', '📋', 'ចន្លោះ', 'ស្ថានភាព']
        widths  = [5, 24, 12, 20, 8, 6, 6, 24, 16]

    n = len(headers)
    half = (n + 1) // 2

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'របាយការណ៍'

    blue  = Font(color='2B6CB0', size=10)
    bold  = Font(bold=True, size=11)
    bold_big = Font(bold=True, size=15)
    gray  = Font(color='718096', size=10)
    center = Alignment(horizontal='center', vertical='center', wrap_text=True)

    def merged(row, c1, c2, text, font, height=16):
        ws.merge_cells(start_row=row, start_column=c1, end_row=row, end_column=c2)
        cell = ws.cell(row=row, column=c1, value=text)
        cell.font = font
        cell.alignment = center
        ws.row_dimensions[row].height = height

    merged(1, 1, half,     '[ និមិត្តសញ្ញាក្រសួង ]', blue)
    merged(1, half + 1, n, _HDR_RIGHT_LINES[0], bold)
    merged(2, 1, half,     _HDR_LEFT_LINES[0], blue)
    merged(2, half + 1, n, _HDR_RIGHT_LINES[1], bold)
    merged(3, 1, half,     _HDR_LEFT_LINES[1], blue)
    merged(4, 1, half,     _HDR_LEFT_LINES[2], blue)
    merged(5, 1, n, '', Font())
    merged(6, 1, n, _HDR_MAIN_TITLE, bold_big, height=24)
    merged(7, 1, n, f"កាលបរិច្ឆេទ ជាចន្ទគតិ: {khmer_lunar_date(_d.today())}", gray)
    merged(8, 1, n, f"របាយការណ៍វត្តមាន ({type_label})  |  ចន្លោះ: {subtitle}", Font(bold=True, size=10))
    merged(9, 1, n, '', Font())

    hdr_row = 10
    hfill = PatternFill(start_color='4A5568', end_color='4A5568', fill_type='solid')
    hfont = Font(bold=True, color='FFFFFF', size=10)
    thin  = Side(border_style='thin', color='D1D5DB')
    bdr   = Border(left=thin, right=thin, top=thin, bottom=thin)

    for col, h in enumerate(headers, 1):
        c = ws.cell(row=hdr_row, column=col, value=h)
        c.font = hfont; c.fill = hfill; c.border = bdr; c.alignment = center
    ws.row_dimensions[hdr_row].height = 20

    row_i = hdr_row + 1
    for idx, m in enumerate(monks, 1):
        ab = m['absent_count']     >= DISC_ABSENT_MIN
        pr = m['permission_count'] >= DISC_PERM_MIN
        fill = PatternFill(start_color='FFF5F5' if ab else 'FFFAF0' if pr else 'FFFFFF',
                            end_color='FFF5F5' if ab else 'FFFAF0' if pr else 'FFFFFF', fill_type='solid')
        status_text = 'លើសអវត្តមាន' if ab else ('លើសច្បាប់' if pr else 'ប្រក្រតី')

        if report_type == 'daily':
            s = 'អវត្តមាន' if m.get('status') == 'absent' else 'ច្បាប់'
            vals = [idx, m['fullname'], m['monk_type'], m['position'], m['vassa_years'], m['residence'], s]
        elif report_type == 'biweekly':
            edu = f"{m['education_level']} {m['academic_year']}".strip()
            dp = []
            if m['absent_dates']: dp.append(f"❌ {m['absent_dates']}")
            if m['perm_dates']:   dp.append(f"📋 {m['perm_dates']}")
            vals = [idx, m['fullname'], m['position'], m['vassa_years'], m['residence'], edu,
                     m['absent_count'] or '—', m['permission_count'] or '—',
                     '\n'.join(dp) if dp else '—', status_text]
        else:
            vals = [idx, m['fullname'], m['monk_type'], m['position'], m['vassa_years'],
                     m['absent_count'] or '—', m['permission_count'] or '—',
                     m['perm_dates'] or '—', status_text]

        for col, val in enumerate(vals, 1):
            c = ws.cell(row=row_i, column=col, value=val)
            c.fill = fill; c.border = bdr
            c.font = Font(bold=True, size=10) if col == 2 else Font(size=10)
            c.alignment = Alignment(horizontal='center' if col != 2 else 'left',
                                     vertical='center', wrap_text=True)
        row_i += 1

    for col, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = w

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return buf


# ---- Unified export route ----------------------------------------


@main_bp.route('/api/reports/submit-image', methods=['POST'])
def submit_report_image():
    try:
        import requests as req
        if 'image' not in request.files:
            return jsonify({'success': False, 'message': 'រកមិនឃើញរូបភាព'}), 400
            
        file = request.files['image']
        TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
        TELEGRAM_CHAT_ID = -1003960014484
        
        caption = request.form.get('caption', "ប្រគេនរបាយការណ៍វត្តមាន (បំប្លែងជារូបភាព)")
        
        tg = req.post(
            f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendPhoto',
            data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
            files={'photo': ('report.png', file.read(), 'image/png')},
            timeout=25
        ).json()
        
        if not tg.get('ok'):
            return jsonify({'success': False, 'message': f"Telegram: {tg.get('description')}"}), 500
            
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

def _apply_report_filters(monks, args):
    """Apply the same monk_type/kuti/education/academic_year/name/violation
    filters the live report page applies client-side, so exports match what
    the user sees on screen."""
    monk_type       = (args.get('monk_type')       or '').strip()
    kuti            = (args.get('kuti')            or '').strip()
    education_level = (args.get('education_level') or '').strip()
    academic_year   = (args.get('academic_year')   or '').strip()
    name            = (args.get('name')            or '').strip().lower()
    violation       = args.get('violation', 'all')

    def keep(m):
        if monk_type       and m.get('monk_type')       != monk_type:                  return False
        if kuti            and m.get('residence')       != kuti.replace('_', ' '):     return False
        if education_level and m.get('education_level') != education_level:            return False
        if academic_year   and m.get('academic_year')   != academic_year:              return False
        if name            and name not in (m.get('fullname') or '').lower():          return False
        if violation == 'violations' and not (m['absent_count'] >= DISC_ABSENT_MIN or m['permission_count'] >= DISC_PERM_MIN):
            return False
        if violation == 'absent'     and not (m['absent_count']     >= DISC_ABSENT_MIN):
            return False
        if violation == 'permission' and not (m['permission_count'] >= DISC_PERM_MIN):
            return False
        return True

    return [m for m in monks if keep(m)]


@main_bp.route('/api/reports/export', methods=['GET'])
def unified_export():
    """Export any report type (daily/biweekly/monthly/annual/triennial) as docx or pdf."""
    try:
        import io, requests as req

        report_type = request.args.get('type',   'daily')
        fmt         = request.args.get('fmt',    'docx')
        action      = request.args.get('action', 'download')

        TELEGRAM_TOKEN   = '8950898077:AAHNR0tTgtJWy17wMXooKwg4nfQLGdfe5aw'
        TELEGRAM_CHAT_ID = -1003960014484

        monks, type_label, subtitle, period_start, period_end = _fetch_export_data(report_type, request.args)
        monks = _apply_report_filters(monks, request.args)

        av = sum(1 for m in monks if m['absent_count']     >= DISC_ABSENT_MIN)
        pv = sum(1 for m in monks if m['permission_count'] >= DISC_PERM_MIN)

        if fmt == 'pdf' or fmt == 'html':
            html = _make_export_html(monks, type_label, subtitle, report_type)
            html += '<script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>'
            return html
        elif fmt == 'excel':
            buf      = _make_export_excel(monks, type_label, subtitle, report_type)
            fname    = f"report_{report_type}_{period_start}.xlsx"
            mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else:
            buf      = _make_export_docx(monks, type_label, subtitle, report_type)
            fname    = f"report_{report_type}_{period_start}.docx"
            mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        caption = (
            f"📋 របាយការណ៍វត្តមាន ({type_label}) — {subtitle}\n"
            f"📊 សរុប {len(monks)} នាក់  |  ❌ {av}  |  📋 {pv}"
        )

        if action == 'telegram':
            tg = req.post(
                f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendDocument',
                data={'chat_id': TELEGRAM_CHAT_ID, 'caption': caption},
                files={'document': (fname, buf, mimetype)},
                timeout=25
            ).json()
            if not tg.get('ok'):
                return jsonify({'success': False, 'message': f"Telegram: {tg.get('description')}"}), 500
            return jsonify({'success': True, 'total': len(monks)})

        

        return send_file(buf, mimetype=mimetype, as_attachment=True, download_name=fname)

    except ImportError as e:
        return jsonify({'success': False, 'message': f'Missing dependency: {e}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
