import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Development server only. For production use gunicorn (Linux) or waitress (Windows).
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
