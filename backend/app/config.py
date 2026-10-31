import os


class Settings:
    """Runtime configuration, read from environment."""

    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql://bangladata:bangladata@localhost:5432/bangladata"
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Where raw source files are archived before parsing. R2 is used when configured
    # and reachable; the local path is always written as a durable fallback.
    raw_archive_dir: str = os.getenv("RAW_ARCHIVE_DIR", "./data/raw")
    r2_endpoint: str = os.getenv("R2_ENDPOINT", "")
    r2_bucket: str = os.getenv("R2_BUCKET", "bangladeshdatahub-raw")
    r2_access_key_id: str = os.getenv("R2_ACCESS_KEY_ID", "")
    r2_secret_access_key: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    r2_region: str = os.getenv("R2_REGION", "auto")

    # HTTP identity for scrapers (honest User-Agent).
    user_agent: str = os.getenv(
        "SCRAPER_USER_AGENT",
        "BanglaDataBot/1.0 (+https://bangladatahub.com; data@bangladatahub.com)",
    )

    timezone: str = "Asia/Dhaka"

    # Public base URL (for checkout redirects / links).
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "https://bangladatahub.com")

    # LemonSqueezy billing (Merchant of Record).
    lemonsqueezy_api_key: str = os.getenv("LEMONSQUEEZY_API_KEY", "")
    lemonsqueezy_webhook_secret: str = os.getenv("LEMONSQUEEZY_WEBHOOK_SECRET", "")
    lemonsqueezy_store_id: str = os.getenv("LEMONSQUEEZY_STORE_ID", "")
    lemonsqueezy_variant_developer: str = os.getenv(
        "LEMONSQUEEZY_VARIANT_DEVELOPER", os.getenv("LEMONSQUEEZY_VARIANT_BASIC", "")
    )
    lemonsqueezy_variant_pro: str = os.getenv("LEMONSQUEEZY_VARIANT_PRO", "")
    lemonsqueezy_variant_business: str = os.getenv("LEMONSQUEEZY_VARIANT_BUSINESS", "")

    # Google sign-in (server-side OAuth auth-code flow). Empty => button hidden.
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv(
        "GOOGLE_REDIRECT_URI", "https://api.bangladatahub.com/auth/google/callback"
    )

    # Transactional email (Resend). Empty => email sending is skipped (no error).
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    email_from: str = os.getenv("EMAIL_FROM", "BanglaDataHub <noreply@bangladatahub.com>")

    # Admin panel access + operational notifications.
    admin_emails: str = os.getenv(
        "ADMIN_EMAILS", os.getenv("ALERT_EMAIL_TO", "amaanjbutt@gmail.com")
    )


settings = Settings()
