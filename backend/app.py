import os
from routes import main_bp
from flask import Flask

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'pagoda-niroth-rangsay-2026-secret')
app.register_blueprint(main_bp)

if __name__ == '__main__':
    app.run(debug=True)