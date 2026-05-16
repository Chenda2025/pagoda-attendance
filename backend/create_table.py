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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        cursor.execute(create_table_query)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_tbl (
                id       SERIAL PRIMARY KEY,
                monk_id  INTEGER NOT NULL REFERENCES monk_tbl(id) ON DELETE CASCADE,
                status   VARCHAR(20) NOT NULL CHECK (status IN ('absent', 'permission')),
                date     DATE NOT NULL DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (monk_id, date)
            );
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

def insert_monk(fullname, vassa_years, monk_type, residence, position, education_level, academic_year):
    """Insert a new monk record into the database"""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        
        # កែសម្រួល៖ បន្ថែម %s ឱ្យគ្រប់ ៧ និងរៀបលំដាប់លំដោយឱ្យត្រូវ
        insert_query = """
        INSERT INTO monk_tbl (fullname, vassa_years, monk_type, residence, position, education_level, academic_year)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
        """
        
        # បញ្ជូនទិន្នន័យឱ្យត្រូវតាមលំដាប់ Column
        cursor.execute(insert_query, (fullname, vassa_years, monk_type, residence, position, education_level, academic_year))
        
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

def update_monk(monk_id, fullname, vassa_years, monk_type, residence, position, education_level, academic_year):
    """Update an existing monk record"""
    conn = None
    try:
        conn = connect_db()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE monk_tbl
            SET fullname = %s, vassa_years = %s, monk_type = %s, residence = %s,
                position = %s, education_level = %s, academic_year = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s;
        """, (fullname, vassa_years, monk_type, residence, position, education_level, academic_year, monk_id))
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
        SELECT id, fullname, vassa_years, monk_type, residence, position, education_level, academic_year, created_at, updated_at
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

if __name__ == "__main__":
    create_monks_table()
