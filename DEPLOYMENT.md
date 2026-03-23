# Deployment Workflow

## Branch Model

- `main`
  - production branch
- `develop`
  - staging branch
- `feature/*`
  - normal feature or bug-fix branches
- `hotfix/*`
  - urgent production fixes

## Normal Flow

1. Start from `develop`
```powershell
git checkout develop
git pull
```

2. Create a feature branch
```powershell
git checkout -b feature/short-name
```

3. Do the work, then commit
```powershell
git add .
git commit -m "Short clear message"
```

4. Push the feature branch
```powershell
git push -u origin feature/short-name
```

5. Open a PR into `develop`
- review
- merge into `develop`

6. Deploy `develop` to staging
- test on staging

7. Promote to production
- merge `develop` into `main`
- deploy `main` to production

## Hotfix Flow

1. Start from `main`
```powershell
git checkout main
git pull
```

2. Create a hotfix branch
```powershell
git checkout -b hotfix/short-name
```

3. Fix and commit
```powershell
git add .
git commit -m "Hotfix short clear message"
```

4. Push the hotfix branch
```powershell
git push -u origin hotfix/short-name
```

5. Open a PR into `main`
- merge
- deploy production

6. Back-merge to `develop`
- so staging keeps the same fix

## Initial Remote Setup

Add the remote:
```powershell
git remote add origin YOUR_GIT_URL
```

Push the two base branches:
```powershell
git push -u origin main
git push -u origin develop
```

## Current Local State

- `main` exists
- `develop` exists
- current working branch can continue from `develop`

## Notes

- Do not work directly on `main`
- Do not deploy feature branches directly to production
- Keep staging on `develop`
- Keep production on `main`

## Domain Setup

- Localhost keeps using the current origin by default. No extra site URL env vars are required for `launch-recurvos.cmd`.
- Recommended production split:
  - `https://recurvos.com` for landing/public pages
  - `https://app.recurvos.com` for login and app
  - `https://api.recurvos.com` for API

## Required Production Env Values

Set these for production:

```text
APP_WEB_BASE_URL=https://app.recurvos.com
APP_API_BASE_URL=https://api.recurvos.com
VITE_API_BASE_URL=https://api.recurvos.com/api
VITE_PUBLIC_SITE_URL=https://recurvos.com
VITE_APP_SITE_URL=https://app.recurvos.com
```

Set these for staging if you want the same split pattern:

```text
APP_WEB_BASE_URL=https://staging-app.recurvos.com
APP_API_BASE_URL=https://staging-api.recurvos.com
VITE_API_BASE_URL=https://staging-api.recurvos.com/api
VITE_PUBLIC_SITE_URL=https://staging.recurvos.com
VITE_APP_SITE_URL=https://staging-app.recurvos.com
```

If staging does not use a separate landing domain, point both site vars to the same host:

```text
VITE_PUBLIC_SITE_URL=https://staging-app.recurvos.com
VITE_APP_SITE_URL=https://staging-app.recurvos.com
```
