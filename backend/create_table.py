import psycopg2
from conn import connect_db

def create_monks_table():
    """Create the monks table if it doesn't exist"""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
  
        
        create_table_query = """
        CREATE TABLE IF NOT EXISTS monk_tbl (
            id SERIAL PRIMARY KEY,
            fullname VARCHAR(255) NOT NULL,
            vassa_years INTEGER NOT NULL,
            monk_type VARCHAR(20) NOT NULL,
            residence VARCHAR(100) NOT NULL,
            position  VARCHAR(100) NOT NULL,
            education_level VARCHAR(50) NOT NULL,
            academic_year VARCHAR(20) NOT NULL,
            living_status VARCHAR(50) NOT NULL DEFAULT 'កំពុងស្នាក់នៅ',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        cursor.execute(create_table_query)

        # Migrate existing DBs that predate living_status
        cursor.execute("""
            ALTER TABLE monk_tbl
            ADD COLUMN IF NOT EXISTS living_status VARCHAR(50)
                NOT NULL DEFAULT 'កំពុងស្នាក់នៅ';
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_monks_living_status
            ON monk_tbl(living_status);
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_tbl (
                id       SERIAL PRIMARY KEY,
                monk_id  INTEGER NOT NULL REFERENCES monk_tbl(id) ON DELETE CASCADE,
                status   VARCHAR(20) NOT NULL CHECK (status IN ('absent', 'permission', 'late')),
                date     DATE NOT NULL DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (monk_id, date)
            );
        """)
        
        cursor.execute("""
            ALTER TABLE attendance_tbl DROP CONSTRAINT IF EXISTS attendance_tbl_status_check;
            ALTER TABLE attendance_tbl ADD CONSTRAINT attendance_tbl_status_check CHECK (status IN ('absent', 'permission', 'late'));
        """)

        index_queries = [
            "CREATE INDEX IF NOT EXISTS idx_monks_fullname ON monk_tbl(fullname);",
            "CREATE INDEX IF NOT EXISTS idx_monks_type ON monk_tbl(monk_type);",
            "CREATE INDEX IF NOT EXISTS idx_monks_residence ON monk_tbl(residence);"
        ]
        for query in index_queries:
            cursor.execute(query)

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
        print("Table 'monks', indexes, and trigger created successfully!")
        cursor.close()
    except psycopg2.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn is not None:
            conn.close()

def insert_monk(fullname, vassa_years, monk_type, residence, position, education_level, academic_year,
                living_status='កំពុងស្នាក់នៅ'):
    """Insert a new monk record into the database"""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()

        insert_query = """
        INSERT INTO monk_tbl (fullname, vassa_years, monk_type, residence, position,
                              education_level, academic_year, living_status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """

        cursor.execute(insert_query, (
            fullname, vassa_years, monk_type, residence, position,
            education_level, academic_year, living_status or 'កំពុងស្នាក់នៅ',
        ))

        result = cursor.fetchone()
        monk_id = result[0] if result else None
        conn.commit()
        print(f"Monk inserted successfully with ID: {monk_id}")
        cursor.close()
        return monk_id

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn is not None:
            conn.rollback()
        return None
    finally:
        if conn is not None:
            conn.close()

def update_monk(monk_id, fullname, vassa_years, monk_type, residence, position, education_level, academic_year,
                living_status=None):
    """Update an existing monk record. If living_status is None, leave it unchanged."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        if living_status is None:
            cursor.execute("""
                UPDATE monk_tbl
                SET fullname = %s, vassa_years = %s, monk_type = %s, residence = %s,
                    position = %s, education_level = %s, academic_year = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (fullname, vassa_years, monk_type, residence, position, education_level, academic_year, monk_id))
        else:
            cursor.execute("""
                UPDATE monk_tbl
                SET fullname = %s, vassa_years = %s, monk_type = %s, residence = %s,
                    position = %s, education_level = %s, academic_year = %s,
                    living_status = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s;
            """, (fullname, vassa_years, monk_type, residence, position, education_level, academic_year,
                  living_status, monk_id))
        conn.commit()
        cursor.close()
        return True
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()


def update_monk_living_status(monk_id, living_status):
    """Update only living_status for a monk."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE monk_tbl
            SET living_status = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (living_status, monk_id))
        updated = cursor.rowcount
        conn.commit()
        cursor.close()
        return updated > 0
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()


def delete_monk(monk_id):
    """Delete a monk record by ID"""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM monk_tbl WHERE id = %s;", (monk_id,))
        conn.commit()
        cursor.close()
        return True
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()


def get_all_monks():
    """Retrieve all monks from the database"""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()

        select_query = """
        SELECT id, fullname, vassa_years, monk_type, residence, position,
               education_level, academic_year, created_at, updated_at, living_status
        FROM monk_tbl
        ORDER BY created_at DESC;
        """
        cursor.execute(select_query)
        monks = cursor.fetchall()
        cursor.close()
        return monks
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        return []
    finally:
        if conn is not None:
            conn.close()

# បើចង់ Test ការបញ្ចូលទិន្នន័យ៖
# insert_monk('ភិក្ខុ សុខា', ៥, 'ភិក្ខុ', 'កុដិលេខ១', 'ព្រះគ្រូសូត្រស្តាំ', 'វិទ្យាល័យ', 'ឆ្នាំទី២')

def create_summaries_tables():
    """Create attendance_summaries and period_tracker tables."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_summaries (
                id                SERIAL PRIMARY KEY,
                monk_id           INTEGER NOT NULL REFERENCES monk_tbl(id) ON DELETE CASCADE,
                period_start      DATE NOT NULL,
                period_end        DATE NOT NULL,
                total_absences    INTEGER NOT NULL DEFAULT 0,
                total_permissions INTEGER NOT NULL DEFAULT 0,
                created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (monk_id, period_start)
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_summaries_monk   ON attendance_summaries(monk_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_summaries_period ON attendance_summaries(period_start, period_end);")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS period_tracker (
                id                   INTEGER PRIMARY KEY DEFAULT 1,
                current_period_start DATE NOT NULL,
                last_compiled_at     TIMESTAMP
            );
        """)

        from datetime import date
        cursor.execute("""
            INSERT INTO period_tracker (id, current_period_start)
            VALUES (1, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (date.today(),))

        conn.commit()
        print("Tables 'attendance_summaries' and 'period_tracker' created / verified.")
        cursor.close()
    except Exception as e:
        print(f"Database error creating summaries tables: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def create_pending_submissions_table():
    """Create the pending_submissions staging table for guest entries."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pending_submissions (
                id              SERIAL PRIMARY KEY,
                fullname        VARCHAR(255) NOT NULL,
                vassa_years     INTEGER NOT NULL,
                monk_type       VARCHAR(20) NOT NULL,
                residence       VARCHAR(100) NOT NULL,
                position        VARCHAR(100) NOT NULL,
                education_level VARCHAR(50) NOT NULL,
                academic_year   VARCHAR(20) NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'rejected')),
                rejection_note  TEXT,
                submitted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at     TIMESTAMP
            );
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_pending_status
            ON pending_submissions(status);
        """)
        conn.commit()
        print("Table 'pending_submissions' created / verified.")
        cursor.close()
    except Exception as e:
        print(f"Database error creating pending_submissions: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def insert_pending_submission(fullname, vassa_years, monk_type, residence,
                               position, education_level, academic_year):
    """Stage a guest submission for admin review."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO pending_submissions
                (fullname, vassa_years, monk_type, residence, position, education_level, academic_year)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (fullname, vassa_years, monk_type, residence, position, education_level, academic_year))
        result = cursor.fetchone()
        sub_id = result[0] if result else None
        conn.commit()
        cursor.close()
        return sub_id
    except Exception as e:
        print(f"Database error inserting pending submission: {e}")
        if conn:
            conn.rollback()
        return None
    finally:
        if conn:
            conn.close()


def create_seat_order_table():
    """Store admin-defined seat ordering for bhikkhu and samanera grids."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS seat_order (
                type       VARCHAR(20) PRIMARY KEY,
                monk_ids   TEXT NOT NULL DEFAULT '[]',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f'Database error creating seat_order: {e}')
        if conn: conn.rollback()
    finally:
        if conn: conn.close()


def create_permission_table():
    """Create the monk_permission table."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS monk_permission (
                id         SERIAL PRIMARY KEY,
                monk_id    INTEGER NOT NULL REFERENCES monk_tbl(id) ON DELETE CASCADE,
                reason     TEXT,
                start_date DATE NOT NULL,
                end_date   DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        # Keep SERIAL in sync (avoids duplicate key on id after imports / manual inserts)
        cursor.execute("""
            SELECT setval(
                pg_get_serial_sequence('monk_permission', 'id'),
                COALESCE((SELECT MAX(id) FROM monk_permission), 1),
                true
            );
        """)
        conn.commit()
        print("Table 'monk_permission' created / verified.")
        cursor.close()
    except Exception as e:
        print(f"Database error creating monk_permission: {e}")
        if conn: conn.rollback()
    finally:
        if conn: conn.close()


def create_kuti_share_table():
    """Share links so a kuti leader can view only their own residence members."""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS kuti_share_links (
                id          SERIAL PRIMARY KEY,
                residence   VARCHAR(100) NOT NULL,
                token       VARCHAR(64)  NOT NULL UNIQUE,
                label       VARCHAR(255),
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP
            );
        """)
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_kuti_share_residence_active
            ON kuti_share_links (residence)
            WHERE is_active = TRUE;
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_kuti_share_token
            ON kuti_share_links (token);
        """)
        conn.commit()
        print("Table 'kuti_share_links' created / verified.")
        cursor.close()
    except Exception as e:
        print(f"Database error creating kuti_share_links: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    create_monks_table()
