# my-btp-app

An SAP BTP application consisting of a **Node.js CAP backend** and an **SAP UI5 Fiori frontend**, deployed to **Cloud Foundry** via an MTA archive. Secured with **XSUAA** and integrated with the **Destination Service**.

---

## Project Structure

```
my-btp-app/
├── .github/workflows/deploy.yml   # GitHub Actions CI/CD
├── app/ui/                        # SAP UI5 Fiori frontend
│   ├── webapp/
│   │   ├── controller/            # JS controllers
│   │   ├── view/                  # XML views
│   │   ├── model/                 # UI models
│   │   ├── i18n/                  # Translations
│   │   ├── Component.js
│   │   ├── index.html
│   │   └── manifest.json
│   ├── xs-app.json                # App Router routing config
│   ├── ui5.yaml                   # UI5 tooling config
│   └── package.json
├── db/
│   ├── schema.cds                 # CDS data model
│   └── data/                     # CSV seed data
├── srv/
│   ├── catalog-service.cds        # OData V4 service definition
│   └── catalog-service.js         # Custom service handlers
├── .gitignore
├── mta.yaml                       # MTA deployment descriptor
├── package.json                   # Root CAP project
├── xs-security.json               # XSUAA roles & scopes
└── README.md
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| @sap/cds-dk | latest | `npm i -g @sap/cds-dk` |
| CF CLI (v8) | latest | [docs.cloudfoundry.org](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html) |
| MBT | latest | `npm i -g mbt` |
| CF MTA plugin | latest | `cf install-plugin multiapps` |

---

## Local Development

### 1. Install dependencies

```bash
npm install
npm install --prefix app/ui
```

### 2. Start the CAP backend (with mock auth)

```bash
npm run watch
# → OData service available at http://localhost:4004
```

### 3. Start the UI5 frontend (in a second terminal)

```bash
cd app/ui && npm start
# → UI available at http://localhost:8080
```

The UI5 dev server proxies `/catalog` requests to the CAP server on port 4004 (configured in `ui5.yaml`).

---

## Build & Deploy

### Build the MTA archive locally

```bash
mbt build -t ./mta_archives
```

### Deploy to Cloud Foundry

```bash
cf api <CF_API_ENDPOINT>
cf login
cf target -o <ORG> -s <SPACE>
cf deploy mta_archives/my-btp-app_1.0.0.mtar --version-rule ALL -f
```

### Automated CI/CD (GitHub Actions)

The pipeline in `.github/workflows/deploy.yml` automatically:
1. Lints & tests on every push
2. Builds the MTA archive
3. Deploys to CF on pushes to `main` or version tags (`v*`)

**Required GitHub Secrets:**

| Secret | Description |
|--------|-------------|
| `CF_API` | CF API endpoint URL |
| `CF_ORG` | CF organization name |
| `CF_SPACE` | CF space name |
| `CF_USERNAME` | CF user / service account email |
| `CF_PASSWORD` | CF user / service account password |

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/). To release a new version:

```bash
# Bump version in package.json & mta.yaml, then tag:
git add package.json mta.yaml
git commit -m "chore: bump version to v1.1.0"
git tag v1.1.0
git push origin main --tags
```

The GitHub Actions pipeline will automatically deploy the tagged release.

---

## XSUAA Roles

| Role Collection | Description |
|----------------|-------------|
| `MyBTPApp_Viewer` | Read-only access to Items |
| `MyBTPApp_Admin` | Full CRUD access to Items |

Assign role collections to users in **BTP Cockpit → Security → Role Collections**.

---

## Extending the App

- **Add a new entity**: Edit `db/schema.cds`, expose it in `srv/catalog-service.cds`, add seed data in `db/data/`.
- **Add custom logic**: Implement handlers in `srv/catalog-service.js`.
- **Add a new UI view**: Create `view/MyView.view.xml`, `controller/MyView.controller.js`, and add a route in `manifest.json`.
- **Connect to an external system**: Configure a Destination in the BTP cockpit and use `cds.connect.to('DestinationName')` in the handler.
