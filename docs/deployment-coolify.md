# Coolify Deployment

Skriver's website is designed to be deployed as a static Astro build behind nginx on Coolify.

## Production topology

| Service | URL | Managed by |
|---------|-----|------------|
| Website | `skriver.ansund.com` | Coolify app built from `website/Dockerfile` |
| Coolify dashboard | `coolify.ansund.com` | Coolify |

## Coolify app setup

Create a new Coolify app for this repository using the GitHub App based flow you already use for other Ansund projects.

### Build configuration

- **Repository integration**: GitHub App
- **Branch**: `main`
- **Build pack**: Dockerfile
- **Base Directory**: `/website`
- **Dockerfile path**: `./Dockerfile`
- **Port**: `80`
- **Domain**: `skriver.ansund.com`

No runtime environment variables are required for the current static website.

Using the GitHub App flow is the easiest way to get push-to-deploy behavior on every push to `main`.

## DNS

Create an A record for:

- `skriver.ansund.com`

Keep the Cloudflare record as **DNS only** so Coolify/Traefik can handle SSL directly.

## Install endpoints

The site serves:

- `https://skriver.ansund.com/install.sh`
- `https://skriver.ansund.com/install.ps1`
- `https://skriver.ansund.com/llms.txt`

The landing page uses the same domain in its quickstart commands.

## Validation checklist

After deployment, verify:

1. `https://skriver.ansund.com/` loads the landing page.
2. `https://skriver.ansund.com/install.sh` returns the shell installer.
3. `https://skriver.ansund.com/install.ps1` returns the PowerShell installer.
4. `https://skriver.ansund.com/llms.txt` is publicly reachable.
5. `https://skriver.ansund.com/robots.txt` points to the correct sitemap.
6. `https://skriver.ansund.com/sitemap.xml` is reachable.
7. `curl -fsSL https://skriver.ansund.com/install.sh | bash` works on a clean machine that already has Node installed.
