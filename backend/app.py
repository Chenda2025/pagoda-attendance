import os
from flask import Flask
from routes import main_bp
from create_table import create_monks_table, create_summaries_tables, create_pending_submissions_table, create_seat_order_table, create_classroom_layout_table, create_permission_table, create_kuti_share_table, create_app_users_table, create_telegram_notify_table, create_telegram_contract_table
from form_options_service import create_form_options_table, seed_form_options
from auth_service import seed_default_users, purge_old_activity
from telegram_config_service import create_telegram_bot_config_table
from conn import connect_db

from datetime import timedelta

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'pagoda-niroth-rangsay-2026-secret')
app.permanent_session_lifetime = timedelta(hours=12)
app.config['SESSION_REFRESH_EACH_REQUEST'] = False
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
        create_classroom_layout_table()
        print('[startup] Classroom layout table created / verified.')
    except Exception as e:
        print(f'[startup] classroom-layout warning: {e}')

    try:
        create_permission_table()
        print('[startup] Permission table created / verified.')
    except Exception as e:
        print(f'[startup] permission warning: {e}')

    try:
        create_kuti_share_table()
        print('[startup] Kuti share links table created / verified.')
    except Exception as e:
        print(f'[startup] kuti-share warning: {e}')

    try:
        create_telegram_notify_table()
        print('[startup] Telegram notify log table created / verified.')
    except Exception as e:
        print(f'[startup] telegram-notify warning: {e}')

    try:
        create_telegram_contract_table()
        print('[startup] Telegram contract table created / verified.')
    except Exception as e:
        print(f'[startup] telegram-contract warning: {e}')

    try:
        create_telegram_bot_config_table()
        print('[startup] Telegram bot config table created / verified.')
    except Exception as e:
        print(f'[startup] telegram-bot-config warning: {e}')

    try:
        create_form_options_table()
        seed_form_options()
        print('[startup] Form field options created / verified.')
    except Exception as e:
        print(f'[startup] form-options warning: {e}')

    try:
        create_app_users_table()
        seed_default_users()
        purge_old_activity()
        print('[startup] App users table created / verified.')
    except Exception as e:
        print(f'[startup] app-users warning: {e}')

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

        def purge_activity_logs():
            try:
                purge_old_activity()
            except Exception as e:
                print(f'[scheduler] activity purge error: {e}')

        sched = BackgroundScheduler(daemon=True)
        sched.add_job(check_and_compile, 'interval', hours=12, id='period_check',
                      misfire_grace_time=3600)
        sched.add_job(purge_activity_logs, 'interval', hours=24, id='activity_purge',
                      misfire_grace_time=3600)
        sched.start()
        print('[scheduler] APScheduler started (period 12h, activity purge 24h).')
    except ImportError:
        print('[scheduler] APScheduler not installed — skipping.')
    except Exception as e:
        print(f'[scheduler] startup error: {e}')


_auto_setup()
_run_scheduler()

if __name__ == '__main__':
    app.run(debug=True)
