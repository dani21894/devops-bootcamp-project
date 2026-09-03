# DevOps Bootcamp Project

A Vite application containerized with Docker, published to Amazon ECR, and deployed to an AWS EC2 web server using Ansible.

## Repository Structure

```
.
├── app/        # Vite application and Dockerfile
├── ansible/    # Inventory and deployment playbooks
├── terraform/  # AWS infrastructure as code
└── README.md

```

## Deployment Flow

1. Build the Docker image from `app/`.

      2. Push the image to Amazon ECR.

      3. Deploy it with the Ansible playbook in `ansible/`.

      4. The web server pulls the image from ECR and serves it on port 80.
