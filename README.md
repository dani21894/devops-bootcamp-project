
# DevOps Bootcamp Project

End-to-end DevOps bootcamp project that provisions AWS infrastructure with Terraform, configures services with Ansible, builds the ShipIt Launchpad web application into a Docker image, publishes that image to Amazon ECR, and deploys it to an EC2 web server. Repository documentation is automatically synchronized to a GitHub Pages site using GitHub Actions.

## URLs

| Service | URL |
|---|---|
| Application | https://web.artisandevops.com |
| Documentation site | https://projectdocs.artisandevops.com |
| Source repository | [dani21894/devops-bootcamp-project](https://github.com/dani21894/devops-bootcamp-project/) |
| Monitoring | https://monitoring.artisandevops.com |

## Repository Layout

The repository is organized as a monorepo. It contains the web application, automation, infrastructure-as-code, and documentation tooling in one place.

| Path | Purpose |
|---|---|
| `app/` | ShipIt Launchpad source code, `Dockerfile`, and `.dockerignore` |
| `ansible/` | Inventory, Ansible configuration, and server deployment playbooks |
| `terraform/` | AWS infrastructure-as-code files |
| `scripts/sync-docs.mjs` | Synchronizes `README.md` and the root `index.html` documentation site |
| `package.json` | Root Node.js tooling for the documentation sync command |
| `.github/workflows/commit-pipeline.yml` | Synchronizes documentation after documentation changes are pushed |
| `.github/workflows/static.yml` | Deploys the root `index.html` to GitHub Pages |
| `index.html` | GitHub Pages entry point generated from this README |

```text
.
├── .github/
│   └── workflows/
│       ├── commit-pipeline.yml
│       └── static.yml
├── ansible/
├── app/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── public/
│   ├── scripts/
│   └── src/
├── scripts/
│   └── sync-docs.mjs
├── terraform/
├── .gitignore
├── index.html
├── package.json
└── README.md
```

## Architecture

The deployment pipeline moves the application through source control, containerization, a private container registry, configuration management, and public DNS.

```text
GitHub repository
        |
        v
Ansible controller (10.0.0.135)
  - builds Docker image
  - pushes image to Amazon ECR
        |
        v
Amazon ECR private repository
  462525375635.dkr.ecr.ap-southeast-1.amazonaws.com/
  devops-bootcamp/final-project-dani21894:v1
        |
        v
Web EC2 server (10.0.0.5)
  - Ansible pulls image from ECR
  - Docker runs Nginx container on port 80
        |
        v
Cloudflare DNS
  web.artisandevops.com
        |
        v
Public ShipIt Launchpad application
```

### Infrastructure nodes

| Node | Private IP | Role |
|---|---:|---|
| Ansible controller | `10.0.0.135` | Builds and publishes the application image; runs Ansible playbooks |
| Web server | `10.0.0.5` | Pulls the ECR image and serves the application container on port 80 |
| Monitoring server | `10.0.0.136` | Hosts monitoring services and participates in exporter monitoring |

All infrastructure is deployed in AWS region `ap-southeast-1`.

## Quickstart

Clone the repository:

```bash
git clone https://github.com/dani21894/devops-bootcamp-project.git
cd devops-bootcamp-project
```

Provision or update AWS infrastructure using Terraform:

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

Run Ansible from the controller to deploy the web image:

```bash
cd ../ansible
ansible-playbook -i inventory.ini --syntax-check playbook-web.yaml
ansible-playbook -i inventory.ini --limit web playbook-web.yaml
```

Verify that the web server responds from inside the VPC:

```bash
curl -I http://10.0.0.5/
```

Expected result:

```text
HTTP/1.1 200 OK
```

## Terraform

Terraform defines the AWS infrastructure used by the project. The exact file names can differ, but the Terraform directory should contain the source configuration for networking, security groups, EC2 instances, IAM resources, outputs, and inventory generation where applicable.

### Typical Terraform responsibilities

- Create the VPC, subnets, route tables, internet/NAT connectivity, and security groups.
- Create EC2 instances for the controller, web server, and monitoring stack.
- Associate IAM roles so the controller can push to ECR and the web server can pull from ECR.
- Configure inbound rules required by the deployment.
- Output instance addresses or generate inventory inputs for Ansible.

### Security requirements

The public web server needs inbound HTTP access:

| Protocol | Port | Source | Reason |
|---|---:|---|---|
| TCP | `80` | `0.0.0.0/0` | Public HTTP access to the Nginx container |
| TCP | `22` | Restricted / VPC source | Administrative SSH when required |

Do not commit Terraform state, plans, `.terraform/`, private keys, or secret variable files. They are excluded through `.gitignore`.

## Ansible

Ansible configures the servers after infrastructure is available.

### Inventory groups

The deployment inventory uses these groups:

```ini
[web]
10.0.0.5

[monitoring]
10.0.0.136

[exporters]
10.0.0.5
```

A host can belong to more than one group. The web server belongs to both `web` and `exporters` because it runs the application and is also a monitoring target.

### Web deployment

`ansible/playbook-web.yaml` deploys the web application. Its main tasks are:

1. Ensure Docker is running and enabled.
2. Install AWS CLI requirements if needed.
3. Authenticate Docker to private Amazon ECR.
4. Stop the older Docker Compose Nginx stack if present.
5. Remove the previous `web` container.
6. Pull the selected ECR image.
7. Run the new `web` container with `80:80` port publishing.
8. Verify the container serves HTTP 200 locally on the web server.

Run the deployment:

```bash
cd ansible
ansible-playbook -i inventory.ini --limit web playbook-web.yaml
```

Check the running container:

```bash
ansible web \
  -i inventory.ini \
  -b \
  -m ansible.builtin.command \
  -a "docker ps"
```

Expected port mapping:

```text
0.0.0.0:80->80/tcp
```

## Application

The application is ShipIt Launchpad, a Vite-based web application using Three.js. The project source is stored under `app/`.

### Application commands

Run these commands from the application directory:

```bash
cd app
npm ci
npm run dev
npm test
npm run build
npm run preview
```

| Command | Purpose |
|---|---|
| `npm ci` | Install exact dependency versions from `package-lock.json` |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the application preflight test |
| `npm run build` | Generate production files in `dist/` |
| `npm run preview` | Serve the built application locally for validation |

### Docker image

The application uses a multi-stage Docker build.

1. The Node.js build stage installs dependencies using `npm ci`.
2. Vite generates optimized static files with `npm run build`.
3. The Nginx runtime stage copies only `dist/` and serves it on port 80.

```dockerfile
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Build and validate the image on the Ansible controller:

```bash
cd ~/app/ship
sudo docker build -t shipit-launchpad:v1 .

sudo docker run -d \
  --name shipit-test \
  -p 8080:80 \
  shipit-launchpad:v1

curl -I http://127.0.0.1:8080/
```

Stop the temporary test container after validation:

```bash
sudo docker rm -f shipit-test
```

## Amazon ECR

The container image is stored in private Amazon ECR.

```text
Registry: 462525375635.dkr.ecr.ap-southeast-1.amazonaws.com
Repository: devops-bootcamp/final-project-dani21894
Tag: v1
Full image URI:
462525375635.dkr.ecr.ap-southeast-1.amazonaws.com/devops-bootcamp/final-project-dani21894:v1
```

Set image variables on the controller:

```bash
export AWS_REGION=ap-southeast-1
export ECR_REGISTRY=462525375635.dkr.ecr.ap-southeast-1.amazonaws.com
export IMAGE_REPO=devops-bootcamp/final-project-dani21894
export IMAGE_TAG=v1
export IMAGE_URI=${ECR_REGISTRY}/${IMAGE_REPO}:${IMAGE_TAG}
```

Authenticate Docker, tag the image, and push it:

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | sudo docker login \
      --username AWS \
      --password-stdin "$ECR_REGISTRY"

sudo docker tag shipit-launchpad:v1 "$IMAGE_URI"
sudo docker push "$IMAGE_URI"
```

Verify the pushed ECR image:

```bash
aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$IMAGE_REPO" \
  --query 'imageDetails[].{Tags:imageTags,PushedAt:imagePushedAt,Digest:imageDigest}' \
  --output table
```

### IAM permissions

The controller instance role needs ECR push permissions, including:

```text
ecr:GetAuthorizationToken
ecr:BatchCheckLayerAvailability
ecr:InitiateLayerUpload
ecr:UploadLayerPart
ecr:CompleteLayerUpload
ecr:PutImage
```

The web EC2 instance role needs permission to pull from ECR, such as `AmazonEC2ContainerRegistryReadOnly`.

## Cloudflare DNS

The web application runs on the EC2 web server but is exposed using Cloudflare DNS.

Create an A record in the `artisandevops.com` Cloudflare zone:

| Field | Value |
|---|---|
| Type | `A` |
| Name | `web` |
| Content | Public IPv4 address of the web EC2 instance |
| Proxy status | `Proxied` (orange cloud) |
| TTL | `Auto` |

Do not use the private IP `10.0.0.5` in Cloudflare. Cloudflare must point to the public IPv4 address of the web EC2 instance.

Verify the published application:

```bash
curl -I http://web.artisandevops.com
```

## Monitoring

The monitoring server is `10.0.0.136`. Node Exporter targets only the web server through the `exporters` Ansible group.

The monitoring access URL is https://monitoring.artisandevops.com/

## CI/CD

Two GitHub Actions workflows live under `.github/workflows/`.

| Workflow | Purpose |
|---|---|
| `commit-pipeline.yml` | Synchronizes `README.md` and root `index.html` and auto-commits generated documentation changes |
| `static.yml` | Deploys the root static site to GitHub Pages |

### Documentation sync

The documentation sync script keeps `README.md` and `index.html` aligned:

- When `README.md` changes, `index.html` is regenerated from it.
- Every `##` heading in the README becomes a documentation card in the synced section of the web page.
- When `index.html` changes inside the synced card area, `README.md` is regenerated from its cards.
- If both documents change, `README.md` takes precedence.
- The generated content is restricted to the range between `<!-- SYNC:START -->` and `<!-- SYNC:END -->`.
- Styling, hero content, and footer content outside that range remain unchanged.

Run the sync locally from the repository root:

```bash
npm install
npm run sync:docs
npm run sync:docs -- --write
```

The first command is a dry run. The final command writes the generated result to disk.

### GitHub Pages

GitHub Pages is configured with:

```text
Repository Settings -> Pages -> Build and deployment -> Source: GitHub Actions
```

The Pages workflow uploads the repository root, including the generated `index.html`, and publishes it at:

```text
https://dani21894.github.io/devops-bootcamp-project/
```

### CI/CD validation

To test the complete documentation pipeline:

```bash
nano README.md
npm run sync:docs -- --write

git add README.md index.html
git commit -m "docs: update deployment documentation"
git push origin main
```

After the push:

1. `Docs Sync` runs and synchronizes the documentation files.
2. If needed, `github-actions[bot]` creates a commit containing generated changes.
3. `Deploy static site to GitHub Pages` publishes the updated `index.html`.
4. The GitHub Pages documentation site reflects the latest README content.

## Operational Commands

### Check web deployment

```bash
curl -I http://10.0.0.5/
curl -I http://web.artisandevops.com
```

### Check running web container

```bash
ansible web \
  -i ansible/inventory.ini \
  -b \
  -m ansible.builtin.command \
  -a "docker ps"
```

### View web container logs

```bash
ansible web \
  -i ansible/inventory.ini \
  -b \
  -m ansible.builtin.command \
  -a "docker logs web"
```

### Release a new application version

Use a new image tag for each release rather than overwriting a previous deployment tag.

```bash
cd ~/app/ship
sudo docker build -t shipit-launchpad:v2 .

export IMAGE_TAG=v2
export IMAGE_URI=${ECR_REGISTRY}/${IMAGE_REPO}:${IMAGE_TAG}

sudo docker tag shipit-launchpad:v2 "$IMAGE_URI"
sudo docker push "$IMAGE_URI"
```

Update `image_tag` in `ansible/playbook-web.yaml` to `v2`, then run:

```bash
cd ~/ansible/ansible
ansible-playbook -i inventory.ini --limit web playbook-web.yaml
```

### Roll back

To roll back to a working release, change `image_tag` in `ansible/playbook-web.yaml` to a prior valid ECR tag and rerun the same web deployment playbook.

## Security Notes

The following files must never be committed to GitHub:

- AWS credentials and access keys.
- GitHub personal access tokens.
- SSH private keys, `.pem`, and `.key` files.
- `.env` files containing secrets.
- Terraform state files and plans.
- Ansible vault passwords or secret variable files.

The root `.gitignore` excludes common sensitive and generated files, including `node_modules/`, `dist/`, `.terraform/`, `*.tfstate`, `*.tfvars`, `.env*`, keys, and credentials.

## Project Status

```text
[✓] Application built with Vite
[✓] Multi-stage Docker image built with Node.js and Nginx
[✓] Image pushed to private Amazon ECR
[✓] Ansible pulls the ECR image on the web server
[✓] Docker container serves the application on port 80
[✓] HTTP verification returned 200 OK
[✓] Cloudflare record exposes web.artisandevops.com
[✓] Documentation sync workflow is active
[✓] GitHub Pages deployment workflow is active
```
