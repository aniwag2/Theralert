# Theralert - Self-Hosting Guide

This guide will walk you through setting up and running Theralert on your own server using Docker and Docker Compose.

## Prerequisites

Before you begin, ensure you have the following installed on your server:

* **Docker**
* **Docker Compose** (comes with Docker Desktop, or install standalone if on Linux)
* **Git**

## Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/aniwag2/Theralert.git
    cd Theralert
    ```

2.  **Configure Environment Variables:**
    Your application requires several environment variables for configuration, including database credentials and NextAuth.
    ```bash
    cp .env.example .env
    ```
    Now, open the newly created `.env` file in your favorite text editor (`nano .env` or `vim .env`) and fill in the values:
    * `NEXTAUTH_SECRET`: **Crucial! Generate a strong, random string.** You can use `openssl rand -base64 32` on Linux/macOS, or an online secret generator. This is vital for security.
    * `NEXTAUTH_URL`: The full URL where your application will be accessible. For example, `https://theralert.your-domain.com`. If testing locally, `http://localhost:3000`.
    * `DB_NAME`, `DB_USER`, `DB_PASSWORD`: Set strong, unique credentials for your PostgreSQL database.
    * `DATABASE_URL`: This will be constructed automatically from the `DB_USER`, `DB_PASSWORD`, `db` (the service name in `docker-compose.yml`), `3306` (MySQL default port), and `DB_NAME`.

3.  **Start the Application:**
    Navigate to the root of the `Theralert` directory (where `docker-compose.yml` is located) and run:

    ```bash
    # docker compose up -d
    ```
    * The `-d` flag runs the containers in detached mode (in the background).
    * The first run will download the necessary image (`node:20-alpine`, `mysql:8.0`), build your Next.js application, and start the services. This might take a few minutes.

4.  **Verify Running Containers:**
    ```bash
    # docker ps
    ```
    You should see `theralert-app` and `theralert-db` listed as running.

5.  **Access Your Application:**
    Your Next.js application should now be accessible on `http://localhost:3000` (from the server where you deployed).

    **To expose it to the internet securely:**
    We highly recommend using a reverse proxy like **Cloudflare Tunnels** (as discussed previously) or Nginx. This will allow you to use a custom domain and provide HTTPS without opening inbound firewall ports.

    * Refer to the Cloudflare Tunnels documentation on how to expose a local service (`http://localhost:3000`) to your domain.

## Management Commands

* **Stop the application:**
    ```bash
    # docker compose down
    ```
* **Restart the application (after changes or updates):**
    ```bash
    # docker compose restart
    ```
* **View logs:**
    ```bash
    # docker compose logs -f
    # Or for a specific service:
    # docker logs -f theralert-db
    ```
* **Rebuild and update the application (after pulling new code):**
    ```bash
    git pull origin main # Or your main branch
    # docker compose build --no-cache && docker compose up -d --force-recreate
    ```

## Important Considerations

* **Security:** Ensure `NEXTAUTH_SECRET` is truly random and strong. Keep your server's operating system updated.
* **Data Persistence:** The `theralert_db_data` volume ensures your database data persists across container restarts. Do not delete this volume unless you intend to wipe your database.
