import os
from flask import Flask
from routes import main_bp
from create_table import create_monks_table, create_summaries_tables, create_pending_submissions_table, create_seat_order_table, create_permission_table
from conn import connect_db

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'pagoda-niroth-rangsay-2026-secret')
app.register_blueprint(main_bp)


def _auto_setup():
    try:
        create_monks_table()
        print('[startup] Tables created / verified.')
    except Exception as e:
        print(f'[startup] init-db warning: {e}')

    try:
        create_summaries_tables()
        print('[startup] Summary tables created / verified.')
    except Exception as e:
        print(f'[startup] summaries warning: {e}')

    try:
        create_pending_submissions_table()
        print('[startup] Pending submissions table created / verified.')
    except Exception as e:
        print(f'[startup] pending-submissions warning: {e}')

    try:
        create_seat_order_table()
        print('[startup] Seat order table created / verified.')
    except Exception as e:
        print(f'[startup] seat-order warning: {e}')

    try:
        create_permission_table()
        print('[startup] Permission table created / verified.')
    except Exception as e:
        print(f'[startup] permission warning: {e}')

    try:
        conn = connect_db()
        cur  = conn.cursor()
        cur.execute("""
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)
        cur.execute("DROP TRIGGER IF EXISTS trg_set_updated_at ON monk_tbl;")
        cur.execute("""
            CREATE TRIGGER trg_set_updated_at
                BEFORE UPDATE ON monk_tbl
                FOR EACH ROW
                EXECUTE FUNCTION set_updated_at();
        """)
        conn.commit()
        cur.close()
        conn.close()
        print('[startup] Trigger created / verified.')
    except Exception as e:
        print(f'[startup] setup-trigger warning: {e}')


def _run_scheduler():
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from datetime import date as _d

        def check_and_compile():
            try:
                from routes import _do_compile_period
                conn = connect_db()
                cur  = conn.cursor()
                cur.execute("SELECT current_period_start FROM period_tracker WHERE id = 1")
                row = cur.fetchone()
                if row and (_d.today() - row[0]).days >= 15:
                    _do_compile_period(conn, cur, row[0])
                    conn.commit()
                    print(f'[scheduler] Period compiled starting {row[0]}')
                cur.close()
                conn.close()
            except Exception as e:
                print(f'[scheduler] compile error: {e}')

        def check_monthly_alert():
            try:
                from routes import _check_and_send_monthly_alert
                from datetime import date as _d
                _check_and_send_monthly_alert(_d.today().isoformat())
                print(f'[scheduler] Checked monthly alert for {_d.today()}')
            except Exception as e:
                print(f'[scheduler] alert check error: {e}')

        sched = BackgroundScheduler(daemon=True)
        sched.add_job(check_and_compile, 'interval', hours=12, id='period_check',
                      misfire_grace_time=3600)
        # Check every hour, it will only send once per day if it's the target day
        sched.add_job(check_monthly_alert, 'interval', hours=1, id='monthly_alert_check',
                      misfire_grace_time=3600)
        sched.start()
        print('[scheduler] APScheduler started (period 12h, check 1h).')
    except ImportError:
        print('[scheduler] APScheduler not installed — skipping.')
    except Exception as e:
        print(f'[scheduler] startup error: {e}')


_auto_setup()
_run_scheduler()

if __name__ == '__main__':
    app.run(debug=True)
