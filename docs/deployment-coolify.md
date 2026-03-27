# Coolify Deployment

Skriver's website is designed to be deployed as a static Astro build behind nginx on Coolify.

## Production topology

| Service | URL | Managed by |
|---------|-----|------------|
| Website | `skriver.ansund.com` | Coolify app built from `website/Dockerfile` |
| Coolify dashboard | `coolify.ansund.com` | Coolify |

## Coolify app setup

The production website is deployed as the `skriver-website` application in the Coolify `skriver` project.

### Build configuration

- **Repository integration**: Public Git repository (`https://github.com/ansund/skriver.git`)
- **Branch**: `main`
- **Build pack**: Dockerfile
- **Base Directory**: `/website`
- **Dockerfile path**: `./Dockerfile`
- **Port**: `80`
- **Domain**: `skriver.ansund.com`

No runtime environment variables are required for the current static website.

### Auto deploy

Push-to-deploy is driven from GitHub Actions, not the Coolify GitHub App flow.

- Workflow: [.github/workflows/deploy-website.yml](/Users/viktoransund/code/impact/.github/workflows/deploy-website.yml)
- Trigger: every push to `main`
- Mechanism: call `GET /api/v1/deploy?uuid=<website-app-uuid>` on the Coolify API

GitHub repository configuration:

- Secret: `COOLIFY_TOKEN`
- Variable: `COOLIFY_BASE_URL`
- Variable: `COOLIFY_SKRIVER_WEBSITE_UUID`

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
