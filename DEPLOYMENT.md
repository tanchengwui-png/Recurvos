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
