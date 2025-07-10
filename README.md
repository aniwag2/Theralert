# Theralert - Self-Hosting Guide

This guide will walk you through setting up and running Theralert on your own server using Podman (or Docker) and Docker Compose.

## Prerequisites

Before you begin, ensure you have the following installed on your server:

* **Podman** (recommended) or **Docker**
* **Podman Compose** (if using Podman, install separately) or **Docker Compose** (comes with Docker Desktop, or install standalone if on Linux)
    * For Podman Compose installation: `pip install podman-compose` (ensure `python3-pip` is installed)
* **Git**

## Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/your-username/Theralert.git](https://github.com/your-username/Theralert.git)
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
    # If using Podman Compose
    podman-compose up -d

    # If using Docker Compose (Docker Desktop or standalone install)
    # docker compose up -d
    ```
    * The `-d` flag runs the containers in detached mode (in the background).
    * The first run will download the necessary image (`node:20-alpine`, `mysql:8.0`), build your Next.js application, and start the services. This might take a few minutes.

4.  **Verify Running Containers:**
    ```bash
    # If using Podman
    podman ps

    # If using Docker
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
    # podman-compose down
    # docker compose down
    ```
* **Restart the application (after changes or updates):**
    ```bash
    # podman-compose restart
    # docker compose restart
    ```
* **View logs:**
    ```bash
    # podman-compose logs -f
    # docker compose logs -f
    # Or for a specific service:
    # podman logs -f theralert-app
    # docker logs -f theralert-db
    ```
* **Rebuild and update the application (after pulling new code):**
    ```bash
    git pull origin main # Or your main branch
    # podman-compose build --no-cache && podman-compose up -d --force-recreate
    # docker compose build --no-cache && docker compose up -d --force-recreate
    ```

## Important Considerations

* **Security:** Ensure `NEXTAUTH_SECRET` is truly random and strong. Keep your server's operating system updated.
* **Data Persistence:** The `theralert_db_data` volume ensures your database data persists across container restarts. Do not delete this volume unless you intend to wipe your database.
* **Database Migrations:** If you are using an ORM like Prisma with migrations, you'll need a strategy to run migrations. The most common approach for self-hosting is to add a `command` or `entrypoint` to your `theralert-app` service in `docker-compose.yml` that runs migrations *before* starting the Next.js server.
    * Example (add to `theralert-app` service):
        ```yaml
        command: /bin/sh -c "npx prisma migrate deploy && node server.js"
        ```
        (Note: You'd need `prisma` installed in the production dependencies for this to work in the final image, which it typically is.)
* **Backup Strategy:** Advise users on how to back up their `theralert_db_data` volume for disaster recovery.
* **Resource Usage:** Note that Next.js applications, especially with server-side rendering, can consume more RAM than simple static sites. A Raspberry Pi 4 (4GB or 8GB RAM) is usually sufficient, but larger apps might require more.
