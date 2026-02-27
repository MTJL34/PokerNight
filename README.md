# Poker Night

Application full-stack Node.js + MySQL :
- backend Express (`backEnd/`) avec API REST
- frontend statique (`frontEnd/`) servi par Express

## Prérequis

- Node.js 20+
- MySQL 8+

## Installation locale

1. Installer les dépendances :
```bash
npm install
```

2. Créer le fichier d'environnement :
```bash
cp .env.example .env
```

3. Remplir `.env` avec vos accès MySQL.

4. Initialiser la base :
- importer `frontEnd/data/poker_night_db.sql` dans la base `poker_night_db`

5. Lancer l'application :
```bash
npm start
```

Application :
- Front: `http://localhost:8000/`
- Health: `http://localhost:8000/health`
- API: `http://localhost:8000/api/*`

## Scripts

- `npm start` : lance le serveur
- `npm run dev` : lance le serveur avec `nodemon`

## API principale

- `GET /api/players`
- `GET /api/sessions`
- `GET /api/entries`
- `GET /api/buyins`
- `GET /api/payouts`
- `GET /api/financials`

## Publication GitHub

1. Créer un dépôt GitHub.
2. Pousser le projet :
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <URL_DU_REPO>
git push -u origin main
```

Le fichier `.env` est ignoré par `.gitignore`.

## Déploiement depuis GitHub (Render)

Le fichier `render.yaml` est inclus.

1. Connecter le repo GitHub à Render.
2. Créer un service Web depuis ce repo.
3. Renseigner les variables d'environnement DB (`DB_HOST`, `DB_USER`, etc.).
4. Déployer.

Render utilisera :
- `npm ci` (build)
- `npm start` (run)
- health check: `/health`
